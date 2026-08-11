/**
 * sendJobAlerts — Send Expo push notifications when new jobs are found.
 *
 * Called by runSync and runBatchSync immediately after syncJobs completes.
 * Any failure here is logged but NEVER re-thrown — a broken notification
 * path must never bring down the sync process itself.
 *
 * Expo Batch Push API notes (important for the formatting below):
 *   - Endpoint: POST https://exp.host/--/api/v2/push/send
 *   - Accepts a JSON array of up to 100 message objects per request.
 *   - Response body shape:
 *       { data: Array<{ status: 'ok' | 'error', id?: string, message?: string, details?: object }> }
 *     The response array is parallel to the request array — response[i] is
 *     the result for messages[i]. Always check per-item status, not just
 *     the HTTP status code.
 *   - Each message object:
 *       { to, title, body, data?, sound?, priority? }
 */

import { supabase } from '../db/supabaseClient.js';
import type { NormalizedJob } from '../types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlertSummary {
    sent: number;
    failed: number;
    skipped: number; // users with no push token
    filteredOut: number; // users skipped due to keyword mismatch
}

/** A single Expo push message object (subset of the full spec we need). */
interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    sound: 'default';
    priority: 'high';
    data: {
        companyId: string;
        companyName: string;
        jobUrl?: string; // added for future deep-linking
    };
}

/** The per-message result in Expo's batch response. */
interface ExpoPushTicket {
    status: 'ok' | 'error';
    id?: string;          // receipt ID, present when status === 'ok'
    message?: string;     // error description, present when status === 'error'
    details?: unknown;
}

/** Top-level shape of Expo's push API response. */
interface ExpoPushResponse {
    data: ExpoPushTicket[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Expo's documented maximum batch size.
 * We chunk our message array into slices of this size before sending.
 */
const EXPO_BATCH_SIZE = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Split an array into chunks of at most `size` items. */
function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Cleans up long job titles for push notifications.
 * Heuristic: Keep the first comma-separated segment always. Keep the second
 * segment only if it is short (< 20 chars), as it usually denotes a team or specialty.
 * Drop any remaining segments.
 */
function formatTitleForNotification(rawTitle: string): string {
    const parts = rawTitle.split(',').map(p => p.trim());
    if (parts.length <= 1) return rawTitle;

    const first = parts[0];
    const second = parts[1];

    if (second && second.length < 20) {
        return `${first}, ${second}`;
    }
    return first;
}

/**
 * Cleans up raw ATS locations (often multi-city with semicolons).
 * Heuristic: Take the first semicolon segment. If there are more,
 * append "(+X more)".
 */
function formatLocationForNotification(rawLocation: string | null | undefined): string {
    if (!rawLocation) return '';
    const parts = rawLocation.split(';').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];

    const count = parts.length - 1;
    return `${parts[0]} (+${count} more)`;
}

/**
 * Send one batch (≤ 100 messages) to Expo and return the per-message tickets.
 * HTTP-level errors are caught here and turned into error tickets so the
 * caller always gets back a parallel array regardless.
 */
async function sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    try {
        const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
            },
            body: JSON.stringify(messages),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '(unreadable)');
            console.error(`  ⚠ Expo push API returned HTTP ${response.status}: ${text}`);
            // Return synthetic error tickets so callers can count accurately
            return messages.map(() => ({ status: 'error' as const, message: `HTTP ${response.status}` }));
        }

        const json = (await response.json()) as ExpoPushResponse;
        return json.data;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠ Expo push API fetch failed: ${msg}`);
        return messages.map(() => ({ status: 'error' as const, message: msg }));
    }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Look up every user subscribed to `companyId`, build push messages for those
 * with a valid expo_push_token, and send them all via Expo's batch endpoint.
 *
 * @param companyId   UUID of the company in Supabase
 * @param companyName Display name used in the notification title
 * @param newJobs     Array of newly-inserted jobs returned by syncJobs()
 * @returns           { sent, failed, skipped, filteredOut } — never throws
 */
export async function sendNewJobAlerts(
    companyId: string,
    companyName: string,
    newJobs: NormalizedJob[],
): Promise<AlertSummary> {
    // Fast-exit: nothing to notify about
    if (newJobs.length === 0) {
        return { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };
    }

    try {
        // ── Step 1: Find all users subscribed to this company ──
        const { data: subscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('company_id', companyId);

        if (subError) {
            console.error(`  ⚠ [Push] Failed to query subscriptions: ${subError.message}`);
            return { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.log(`  ℹ [Push] No subscribers for ${companyName} — skipping notifications.`);
            return { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };
        }

        const userIds = subscriptions.map((s) => s.user_id);

        // ── Step 2: Fetch push tokens and keywords for those users ──
        // NOTE: If notification_keywords column is missing from Supabase, this will fail.
        // We catch it and fallback to fetching without keywords in dev/test, or fail gracefully.
        let profiles: any[] | null = [];
        const { data: profilesWithKeywords, error: profileError } = await supabase
            .from('profiles')
            .select('id, expo_push_token, notification_keywords, notifications_enabled')
            .in('id', userIds);

        if (profileError && profileError.message.includes('does not exist')) {
            // Graceful fallback for test environments without the updated schema
            const { data: fallbackProfiles } = await supabase
                .from('profiles')
                .select('id, expo_push_token')
                .in('id', userIds);
            profiles = fallbackProfiles;
            console.warn(`  ⚠ [Push] notification columns missing, proceeding without filtering.`);
        } else if (profileError) {
            console.error(`  ⚠ [Push] Failed to query profiles: ${profileError.message}`);
            return { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };
        } else {
            profiles = profilesWithKeywords;
        }

        // ── Step 3: Build a message for each user who has a token ──
        const notifTitle = companyName;

        const messages: ExpoPushMessage[] = [];
        let skipped = 0;
        let filteredOut = 0;

        for (const profile of profiles ?? []) {
            if (profile.notifications_enabled === false) {
                skipped++;
                continue;
            }

            const token: string | null = profile.expo_push_token;
            if (!token || !token.startsWith('ExponentPushToken[')) {
                skipped++;
                continue;
            }

            const keywords: string[] = profile.notification_keywords ?? [];
            let userJobs = newJobs;
            if (keywords.length > 0) {
                userJobs = newJobs.filter(job => {
                    const titleLower = job.title.toLowerCase();
                    return keywords.some(kw => {
                        const kwLower = kw.toLowerCase();
                        return titleLower.includes(kwLower);
                    });
                });
                if (userJobs.length === 0) {
                    filteredOut++;
                    continue;
                }
            }

            // To avoid notification spam on massive influxes, we cap individual pushes at 5.
            if (userJobs.length > 5) {
                messages.push({
                    to: token,
                    title: notifTitle,
                    body: `${userJobs.length} new openings posted`,
                    sound: 'default' as const,
                    priority: 'high' as const,
                    data: { companyId, companyName }
                });
            } else {
                // Send one individual notification per job listing
                for (const job of userJobs) {
                    const cleanTitle = formatTitleForNotification(job.title);
                    const cleanLoc = formatLocationForNotification(job.location);

                    // Using a newline for location allows Android notifications to truncate 
                    // cleanly while collapsed, but show full details cleanly when expanded!
                    const notifBody = cleanLoc ? `${cleanTitle}\n📍 ${cleanLoc}` : cleanTitle;

                    const msg = {
                        to: token,
                        title: notifTitle,
                        body: notifBody,
                        sound: 'default' as const,
                        priority: 'high' as const,
                        data: {
                            companyId,
                            companyName,
                            ...(job.url ? { jobUrl: job.url } : {})
                        },
                    };
                    console.log(`[Diagnostic] Payload for ${profile.id.slice(0, 8)}: ${cleanTitle}`);
                    messages.push(msg);
                }
            }
        }

        if (messages.length === 0) {
            console.log(`  ℹ [Push] ${subscriptions.length} subscriber(s) found but none were viable (no token or keyword mismatch).`);
            return { sent: 0, failed: 0, skipped, filteredOut };
        }

        // ── Step 4: Send in batches of up to EXPO_BATCH_SIZE ──
        const batches = chunk(messages, EXPO_BATCH_SIZE);
        let sent = 0;
        let failed = 0;

        for (const batch of batches) {
            const tickets = await sendBatch(batch);

            // tickets[i] corresponds to batch[i] — iterate in parallel
            for (let i = 0; i < tickets.length; i++) {
                const ticket = tickets[i];
                if (ticket.status === 'ok') {
                    sent++;
                } else {
                    failed++;
                    console.error(
                        `  ⚠ [Push] Delivery failed for token ${batch[i].to.slice(0, 30)}...: ` +
                        (ticket.message ?? 'unknown error'),
                    );
                }
            }
        }

        return { sent, failed, skipped, filteredOut };
    } catch (err) {
        // Belt-and-suspenders: catch anything unexpected so sync never crashes
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠ [Push] Unexpected error in sendNewJobAlerts: ${msg}`);
        return { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };
    }
}
