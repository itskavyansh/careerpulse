/**
 * Lever ATS Detector & Fetcher
 *
 * Two-phase detection strategy (mirrors Greenhouse):
 *
 * Phase 1 (Guess-and-Verify): Generates candidate slugs from the company name,
 * then hits the Lever postings API for each. A 200 with a JSON array = match.
 * NOTE: An empty array [] is still a valid match (company exists on Lever but
 * has zero open roles — we log this distinctly as "matched, zero jobs").
 *
 * Phase 2 (Homepage Scan — legacy fallback): Regex-searches the careers page
 * HTML for jobs.lever.co/{slug} references.
 */

import type { NormalizedJob, DetectionResult } from '../types.js';
import { generateCandidateSlugs } from '../slugify.js';

// ─── URL Pattern Matching ──────────────────────────────────────────────────────

const LEVER_URL_PATTERN = /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/;

function extractSlugFromUrl(url: string): string | null {
  const match = url.match(LEVER_URL_PATTERN);
  return match ? match[1] : null;
}

// ─── API Fetching ──────────────────────────────────────────────────────────────

/**
 * Calls Lever's public postings API. Returns the parsed JSON if 200,
 * or null for any error/404.
 */
async function fetchLeverPostings(slug: string): Promise<unknown | null> {
  const apiUrl = `https://api.lever.co/v0/postings/${slug}?mode=json`;

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
 * Validates the Lever response. Lever returns a JSON array of postings.
 * An empty array IS valid — it means the company exists but has no openings.
 */
function isValidLeverResponse(data: unknown): boolean {
  return Array.isArray(data);
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

function parseLeverResponse(data: unknown): NormalizedJob[] {
  if (!Array.isArray(data)) return [];

  return data.map((posting: Record<string, unknown>) => {
    const categories = posting.categories as Record<string, unknown> | undefined;

    return {
      title: String(posting.text ?? ''),
      location: categories?.location ? String(categories.location) : null,
      url: String(posting.hostedUrl ?? ''),
      department: categories?.team ? String(categories.team) : null,
      postedDate: typeof posting.createdAt === 'number'
        ? new Date(posting.createdAt).toISOString()
        : null,
      source: 'lever' as const,
    };
  });
}

// ─── Homepage Scanning (legacy) ────────────────────────────────────────────────

async function scanHomepageForLever(homepageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(homepageUrl, {
      headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(LEVER_URL_PATTERN);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Direct URL detection — use when the input is already a Lever URL. */
export async function detectLeverByUrl(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const slug = extractSlugFromUrl(inputUrl);
  if (!slug) return null;

  const rawData = await fetchLeverPostings(slug);
  if (rawData === null || !isValidLeverResponse(rawData)) return null;

  const jobs = parseLeverResponse(rawData);
  return {
    companyName,
    inputUrl,
    matchedPlatform: 'lever',
    jobs,
  };
}

/** Guess-and-verify using slugified company name. */
export async function guessAndVerifyLever(
  companyName: string,
  inputUrl: string
): Promise<{ result: DetectionResult | null; triedSlugs: string[]; matchedSlug: string | null }> {
  const candidates = generateCandidateSlugs(companyName);
  const triedSlugs: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const slug = candidates[i];
    triedSlugs.push(slug);

    const rawData = await fetchLeverPostings(slug);

    if (rawData !== null && isValidLeverResponse(rawData)) {
      const jobs = parseLeverResponse(rawData);
      return {
        result: {
          companyName,
          inputUrl,
          matchedPlatform: 'lever',
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

/** Homepage scan fallback. */
export async function detectLeverByScan(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const slug = await scanHomepageForLever(inputUrl);
  if (!slug) return null;

  const rawData = await fetchLeverPostings(slug);
  if (rawData === null || !isValidLeverResponse(rawData)) return null;

  const jobs = parseLeverResponse(rawData);
  return {
    companyName,
    inputUrl,
    matchedPlatform: 'lever',
    jobs,
  };
}

/** Combined entry point for backward compatibility. */
export async function detectLever(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const byUrl = await detectLeverByUrl(companyName, inputUrl);
  if (byUrl) return byUrl;

  const { result: guessed } = await guessAndVerifyLever(companyName, inputUrl);
  if (guessed) return guessed;

  return detectLeverByScan(companyName, inputUrl);
}
