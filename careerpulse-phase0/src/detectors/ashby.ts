/**
 * Ashby ATS Detector & Fetcher
 *
 * Two-phase detection strategy (mirrors Greenhouse/Lever):
 *
 * Phase 1 (Guess-and-Verify): Generates candidate slugs from the company name,
 * then hits the Ashby public posting-api for each candidate.
 *
 * Phase 2 (Homepage Scan — legacy fallback): Regex-searches the careers page
 * HTML for jobs.ashbyhq.com/{slug} references.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * API Research Notes (checked: July 9, 2026)
 *
 * Ashby's public, unauthenticated endpoint:
 *   GET https://api.ashbyhq.com/posting-api/job-board/{clientname}
 *
 * Response: { "apiVersion": "1", "jobs": [ { title, location, department,
 *   team, publishedAt, jobUrl, applyUrl, ... } ] }
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { NormalizedJob, DetectionResult } from '../types.js';
import { generateCandidateSlugs } from '../slugify.js';

// ─── URL Pattern Matching ──────────────────────────────────────────────────────

const ASHBY_URL_PATTERN = /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/;

function extractSlugFromUrl(url: string): string | null {
  const match = url.match(ASHBY_URL_PATTERN);
  return match ? match[1] : null;
}

// ─── API Fetching ──────────────────────────────────────────────────────────────

/**
 * Calls Ashby's public posting API. Returns the parsed JSON if 200, null otherwise.
 */
async function fetchAshbyJobs(slug: string): Promise<unknown | null> {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

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
 * Validates the Ashby response. A valid response has a top-level `jobs` array.
 * An empty array is still valid — company exists but no open roles.
 */
function isValidAshbyResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  return Array.isArray(response.jobs);
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

function parseAshbyResponse(data: unknown): NormalizedJob[] {
  if (!data || typeof data !== 'object') return [];

  const response = data as Record<string, unknown>;
  const jobs = response.jobs;

  if (!Array.isArray(jobs)) return [];

  return jobs.map((job: Record<string, unknown>) => ({
    title: String(job.title ?? ''),
    location: job.location ? String(job.location) : null,
    url: String(job.jobUrl ?? ''),
    department: job.department ? String(job.department) : null,
    postedDate: job.publishedAt ? String(job.publishedAt) : null,
    source: 'ashby' as const,
  }));
}

// ─── Homepage Scanning (legacy) ────────────────────────────────────────────────

async function scanHomepageForAshby(homepageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(homepageUrl, {
      headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(ASHBY_URL_PATTERN);
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

/** Direct URL detection — use when the input is already an Ashby URL. */
export async function detectAshbyByUrl(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const slug = extractSlugFromUrl(inputUrl);
  if (!slug) return null;

  const rawData = await fetchAshbyJobs(slug);
  if (!rawData || !isValidAshbyResponse(rawData)) return null;

  const jobs = parseAshbyResponse(rawData);
  return {
    companyName,
    inputUrl,
    matchedPlatform: 'ashby',
    jobs,
  };
}

/** Guess-and-verify using slugified company name. */
export async function guessAndVerifyAshby(
  companyName: string,
  inputUrl: string
): Promise<{ result: DetectionResult | null; triedSlugs: string[]; matchedSlug: string | null }> {
  const candidates = generateCandidateSlugs(companyName);
  const triedSlugs: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const slug = candidates[i];
    triedSlugs.push(slug);

    const rawData = await fetchAshbyJobs(slug);

    if (rawData !== null && isValidAshbyResponse(rawData)) {
      const jobs = parseAshbyResponse(rawData);
      return {
        result: {
          companyName,
          inputUrl,
          matchedPlatform: 'ashby',
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
export async function detectAshbyByScan(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const slug = await scanHomepageForAshby(inputUrl);
  if (!slug) return null;

  const rawData = await fetchAshbyJobs(slug);
  if (!rawData || !isValidAshbyResponse(rawData)) return null;

  const jobs = parseAshbyResponse(rawData);
  return {
    companyName,
    inputUrl,
    matchedPlatform: 'ashby',
    jobs,
  };
}

/** Combined entry point for backward compatibility. */
export async function detectAshby(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const byUrl = await detectAshbyByUrl(companyName, inputUrl);
  if (byUrl) return byUrl;

  const { result: guessed } = await guessAndVerifyAshby(companyName, inputUrl);
  if (guessed) return guessed;

  return detectAshbyByScan(companyName, inputUrl);
}
