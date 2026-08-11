/**
 * SmartRecruiters ATS Detector & Fetcher
 *
 * Detection strategy: Guess-and-verify using the company name as a slug
 * against SmartRecruiters' public postings API. No homepage scanning — the
 * public API is the only reliable detection method.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * API Research Notes (checked: July 9, 2026)
 *
 * Public, unauthenticated endpoint:
 *   GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings
 *
 * Response shape (paginated ListResult):
 * {
 *   "totalFound": 42,
 *   "offset": 0,
 *   "limit": 10,
 *   "content": [
 *     {
 *       "id": "...",
 *       "uuid": "...",
 *       "name": "Software Engineer",          // → title
 *       "releasedDate": "2024-05-01T...",      // → postedDate (ISO 8601)
 *       "location": {
 *         "city": "San Francisco",
 *         "region": "California",
 *         "country": "US",
 *         "remote": false
 *       },
 *       "department": { "id": "...", "label": "Engineering" },
 *       "ref": "https://api.smartrecruiters.com/v1/companies/.../postings/...",
 *       "company": { "identifier": "...", "name": "..." }
 *     }
 *   ]
 * }
 *
 * The API does NOT include a direct candidate-facing apply URL in the listing
 * response. We construct one as:
 *   https://jobs.smartrecruiters.com/{companyIdentifier}/{postingId}
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { NormalizedJob, DetectionResult } from '../types.js';
import { generateCandidateSlugs } from '../slugify.js';

// ─── API Fetching ──────────────────────────────────────────────────────────────

/**
 * Fetches job postings from SmartRecruiters.
 * Uses a high limit (100) to get as many postings as possible in one call.
 * Returns null on any non-200 response.
 */
async function fetchSmartRecruitersPostings(
    companyId: string
): Promise<unknown | null> {
    const apiUrl =
        `https://api.smartrecruiters.com/v1/companies/${companyId}/postings?limit=100`;

    try {
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
            signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) return null;

        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Validates the SmartRecruiters response.
 *
 * IMPORTANT: Unlike Greenhouse/Lever/Ashby, SmartRecruiters NEVER returns
 * a 404 for unknown slugs — it always returns 200 with an empty content
 * array and totalFound = 0. This means we CANNOT treat any 200 as a valid
 * match. We require totalFound > 0 to confirm the company actually uses
 * SmartRecruiters and has posted at least one job through it.
 *
 * This does mean we'll miss companies that genuinely use SmartRecruiters
 * but happen to have zero open roles at scan time — an acceptable tradeoff
 * vs. producing false positives for every company name we try.
 */
function isValidSmartRecruitersResponse(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const response = data as Record<string, unknown>;
    return (
        Array.isArray(response.content) &&
        typeof response.totalFound === 'number' &&
        (response.totalFound as number) > 0
    );
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

/**
 * Builds a location string from the location object.
 * Combines city and country, e.g. "San Francisco, US".
 */
function formatLocation(location: unknown): string | null {
    if (!location || typeof location !== 'object') return null;

    const loc = location as Record<string, unknown>;
    const parts: string[] = [];

    if (loc.city && typeof loc.city === 'string') parts.push(loc.city);
    if (loc.region && typeof loc.region === 'string') parts.push(loc.region);
    if (loc.country && typeof loc.country === 'string') parts.push(loc.country);

    if (loc.remote === true && parts.length === 0) return 'Remote';
    if (loc.remote === true) return `${parts.join(', ')} (Remote)`;

    return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Transforms the SmartRecruiters response into NormalizedJob[].
 */
function parseSmartRecruitersResponse(
    data: unknown,
    companyId: string
): NormalizedJob[] {
    if (!data || typeof data !== 'object') return [];

    const response = data as Record<string, unknown>;
    const content = response.content;

    if (!Array.isArray(content)) return [];

    return content.map((posting: Record<string, unknown>) => {
        const department = posting.department as Record<string, unknown> | undefined;

        // Construct apply URL: https://jobs.smartrecruiters.com/{company}/{postingId}
        const postingId = String(posting.id ?? posting.uuid ?? '');
        const applyUrl = postingId
            ? `https://jobs.smartrecruiters.com/${companyId}/${postingId}`
            : '';

        return {
            title: String(posting.name ?? ''),
            location: formatLocation(posting.location),
            url: applyUrl,
            department: department?.label ? String(department.label) : null,
            postedDate: posting.releasedDate ? String(posting.releasedDate) : null,
            source: 'smartrecruiters' as const,
        };
    });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Guess-and-verify using slugified company name. */
export async function guessAndVerifySmartRecruiters(
    companyName: string,
    inputUrl: string
): Promise<{
    result: DetectionResult | null;
    triedSlugs: string[];
    matchedSlug: string | null;
}> {
    const candidates = generateCandidateSlugs(companyName);
    const triedSlugs: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
        const slug = candidates[i];
        triedSlugs.push(slug);

        const rawData = await fetchSmartRecruitersPostings(slug);

        if (rawData !== null && isValidSmartRecruitersResponse(rawData)) {
            const jobs = parseSmartRecruitersResponse(rawData, slug);
            return {
                result: {
                    companyName,
                    inputUrl,
                    matchedPlatform: 'smartrecruiters',
                    jobs,
                },
                triedSlugs,
                matchedSlug: slug,
            };
        }

        if (i < candidates.length - 1) {
            await sleep(150);
        }
    }

    return { result: null, triedSlugs, matchedSlug: null };
}

/**
 * Combined entry point — SmartRecruiters only supports guess-and-verify
 * (no URL pattern or homepage scan since their job pages are on
 * jobs.smartrecruiters.com which we don't pattern-match yet).
 */
export async function detectSmartRecruiters(
    companyName: string,
    inputUrl: string
): Promise<DetectionResult | null> {
    const { result } = await guessAndVerifySmartRecruiters(companyName, inputUrl);
    return result;
}
