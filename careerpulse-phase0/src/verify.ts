/**
 * Zero-Job Match Verifier
 *
 * Problem: When a guess-and-verify call returns 0 jobs, we have no way to
 * tell if:
 *   (a) The company genuinely uses that ATS but has no open roles right now
 *   (b) The slug matched a stale / wrong-company tenant
 *
 * This module handles case (b) by fetching the company's real careers page
 * and checking if the guessed ATS platform / slug appears in the static HTML.
 *
 * Rules:
 *   - Only runs when a guess returns 0 jobs (1+ jobs skips this entirely)
 *   - If the ATS reference IS found in the HTML → keep as "verified, 0 jobs"
 *   - If the ATS reference is NOT found → reject the match, fall through
 *
 * Limitation: this check fails for full SPAs (no ATS references in static
 * HTML). In that case we log it as "unverifiable / SPA" and KEEP the match
 * with a note — trusting totalFound > 0 (for SmartRecruiters) or the fact
 * that the slug exists (for Lever/Ashby) with a clear caveat.
 */

export type VerificationStatus =
    | 'verified'           // ATS reference found in HTML → genuine
    | 'rejected'           // ATS reference not found, substantial HTML → wrong tenant
    | 'unverifiable-spa'   // HTML is too short to be useful (SPA shell)
    | 'unverified-match';  // Non-zero jobs match, but ATS reference not found in HTML

export interface VerificationResult {
    status: VerificationStatus;
    /** Was the ATS slug / domain found in the careers page HTML? */
    referenceFound: boolean;
    /** Length of the HTML fetched (to distinguish SPA shells from real pages) */
    htmlLength: number;
    /** Short human-readable explanation for logging */
    note: string;
}

// ─── ATS Reference Patterns ────────────────────────────────────────────────────

/**
 * Returns the regex patterns we look for in the careers page HTML to confirm
 * the company uses a given platform + slug.
 *
 * Each platform has two layers:
 *   1. The slug itself — most specific signal
 *   2. Any mention of the platform domain — weaker but still useful
 */
function getPlatformPattern(
    platform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters',
    slug: string
): RegExp[] {
    switch (platform) {
        case 'greenhouse':
            return [
                new RegExp(`greenhouse\\.io\\/${escapeRegex(slug)}`, 'i'),
                /greenhouse\.io/i,
            ];
        case 'lever':
            return [
                new RegExp(`lever\\.co\\/${escapeRegex(slug)}`, 'i'),
                // Also check for just the slug near "lever" — some pages reference
                // jobs.lever.co or api.lever.co separately
                new RegExp(`lever[^a-z0-9]{0,5}${escapeRegex(slug)}`, 'i'),
                /lever\.co/i,
            ];
        case 'ashby':
            return [
                new RegExp(`ashbyhq\\.com\\/${escapeRegex(slug)}`, 'i'),
                /ashbyhq\.com/i,
            ];
        case 'smartrecruiters':
            return [
                new RegExp(`smartrecruiters\\.com\\/${escapeRegex(slug)}`, 'i'),
                // SmartRecruiters sometimes appears as API config in script tags
                new RegExp(`smartrecruiters[^a-z0-9]{0,5}${escapeRegex(slug)}`, 'i'),
                /smartrecruiters\.com/i,
            ];
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── SPA Detection ─────────────────────────────────────────────────────────────

/**
 * A page is considered an SPA shell if the HTML is very short (no real
 * content server-rendered). Below this threshold the verification result
 * is unreliable since the real content loads client-side.
 */
const SPA_HTML_THRESHOLD = 10_000; // chars

// ─── Fetching ──────────────────────────────────────────────────────────────────

async function fetchCareersPageHtml(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
            signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function verifyMatch(
    careersUrl: string,
    platform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters',
    matchedSlug: string
): Promise<VerificationResult> {
    const html = await fetchCareersPageHtml(careersUrl);

    if (html === null) {
        // Can't fetch the page at all — can't verify, keep match with caveat
        return {
            status: 'unverifiable-spa',
            referenceFound: false,
            htmlLength: 0,
            note: 'Careers page fetch failed — cannot verify, keeping match with caveat',
        };
    }

    // If the page is tiny, it's almost certainly an SPA shell — verification
    // is unreliable since the ATS references are injected by JS after load.
    if (html.length < SPA_HTML_THRESHOLD) {
        return {
            status: 'unverifiable-spa',
            referenceFound: false,
            htmlLength: html.length,
            note: `Careers page is an SPA shell (${html.length} chars) — ATS references load client-side, unverifiable`,
        };
    }

    // Real HTML page — check for ATS patterns in order of specificity.
    const patterns = getPlatformPattern(platform, matchedSlug);
    for (const pattern of patterns) {
        if (pattern.test(html)) {
            return {
                status: 'verified',
                referenceFound: true,
                htmlLength: html.length,
                note: `Found "${pattern.source}" in careers page HTML (${html.length} chars)`,
            };
        }
    }

    // Substantial HTML but no ATS reference found → likely wrong tenant.
    return {
        status: 'rejected',
        referenceFound: false,
        htmlLength: html.length,
        note: `No ${platform} reference found in ${html.length}-char careers page HTML — likely wrong tenant`,
    };
}
