/**
 * Greenhouse ATS Detector & Fetcher
 *
 * Two-phase detection strategy:
 *
 * Phase 1 (Guess-and-Verify): Generates candidate board slugs from the company
 * name using the slugify utility, then hits the Greenhouse boards API directly
 * for each candidate. A 200 response with a valid jobs array = confirmed match.
 * A 404 = try the next candidate. This works because most companies use their
 * name (lowercased) as their Greenhouse board token.
 *
 * Phase 2 (Homepage Scan — legacy fallback): If guessing fails, fetches the
 * company's careers page HTML and regex-searches for boards.greenhouse.io or
 * job-boards.greenhouse.io URLs to extract a token. This catches companies
 * with non-obvious token names, but only works if the careers page server-renders
 * the Greenhouse reference (fails for SPA-rendered pages).
 */

import type { NormalizedJob, DetectionResult } from '../types.js';
import { generateCandidateSlugs } from '../slugify.js';

// ─── URL Pattern Matching ──────────────────────────────────────────────────────

/**
 * Regex to extract the board token from a Greenhouse URL.
 * Matches BOTH domains:
 *   - boards.greenhouse.io/{token}
 *   - job-boards.greenhouse.io/{token}
 */
const GREENHOUSE_URL_PATTERN = /(?:job-)?boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/;

/**
 * Checks if the input URL is already a direct Greenhouse URL and extracts the token.
 */
function extractTokenFromUrl(url: string): string | null {
  const match = url.match(GREENHOUSE_URL_PATTERN);
  return match ? match[1] : null;
}

// ─── API Fetching ──────────────────────────────────────────────────────────────

/**
 * Calls the Greenhouse public boards API for a given token.
 * Returns the parsed JSON if the response is 200, or null for any error/404.
 */
async function fetchGreenhouseJobs(token: string): Promise<unknown | null> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;

  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null; // 404 = bad token guess, not a crash

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Validates that the API response looks like a real Greenhouse jobs response.
 * A valid response has a top-level `jobs` array. An empty array is still valid
 * (company exists on Greenhouse but has no open roles).
 */
function isValidGreenhouseResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  return Array.isArray(response.jobs);
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

/**
 * Transforms the raw Greenhouse API response into our normalized job format.
 */
function parseGreenhouseResponse(data: unknown): NormalizedJob[] {
  if (!data || typeof data !== 'object') return [];

  const response = data as Record<string, unknown>;
  const jobs = response.jobs;

  if (!Array.isArray(jobs)) return [];

  return jobs.map((job: Record<string, unknown>) => ({
    title: String(job.title ?? ''),
    location: job.location && typeof job.location === 'object'
      ? String((job.location as Record<string, unknown>).name ?? '')
      : null,
    url: String(job.absolute_url ?? ''),
    department: Array.isArray(job.departments) && job.departments.length > 0
      ? String((job.departments[0] as Record<string, unknown>).name ?? '')
      : null,
    postedDate: job.updated_at ? String(job.updated_at) : null,
    source: 'greenhouse' as const,
  }));
}

// ─── Homepage Scanning (legacy fallback) ───────────────────────────────────────

/** Diagnostic info from homepage scanning. */
export interface HomepageScanDiagnostics {
  htmlLength: number;
  containsGreenhouseMention: boolean;
  urlPatternMatched: boolean;
  htmlPreview: string;
}

/**
 * Fetches the homepage HTML and searches for Greenhouse URL references.
 * This is the legacy detection path — kept as a fallback for companies
 * whose board token doesn't match their name.
 */
async function scanHomepageForGreenhouse(
  homepageUrl: string
): Promise<{ token: string | null; diagnostics: HomepageScanDiagnostics }> {
  const emptyDiagnostics: HomepageScanDiagnostics = {
    htmlLength: 0,
    containsGreenhouseMention: false,
    urlPatternMatched: false,
    htmlPreview: '',
  };

  try {
    const response = await fetch(homepageUrl, {
      headers: { 'User-Agent': 'CareerPulse/0.1 (job-board-scanner)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { token: null, diagnostics: emptyDiagnostics };

    const html = await response.text();

    const diagnostics: HomepageScanDiagnostics = {
      htmlLength: html.length,
      containsGreenhouseMention: /greenhouse/i.test(html),
      urlPatternMatched: GREENHOUSE_URL_PATTERN.test(html),
      htmlPreview: html.slice(0, 500),
    };

    const match = html.match(GREENHOUSE_URL_PATTERN);
    return { token: match ? match[1] : null, diagnostics };
  } catch {
    return { token: null, diagnostics: emptyDiagnostics };
  }
}

// ─── Small delay helper ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempts to detect Greenhouse using direct URL matching.
 * Use this when the input URL is already a Greenhouse board URL.
 */
export async function detectGreenhouseByUrl(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  const token = extractTokenFromUrl(inputUrl);
  if (!token) return null;

  const rawData = await fetchGreenhouseJobs(token);
  if (!rawData || !isValidGreenhouseResponse(rawData)) return null;

  const jobs = parseGreenhouseResponse(rawData);
  return {
    companyName,
    inputUrl,
    matchedPlatform: 'greenhouse',
    jobs,
  };
}

/**
 * Guess-and-verify: generates candidate slugs from the company name and
 * tests each one against the Greenhouse API. Returns the first match.
 *
 * This is the PRIMARY detection method for Phase 0.5+.
 *
 * Returns a DetectionResult with a `matchedSlug` note in the result, or
 * null if no candidate matched.
 */
export async function guessAndVerifyGreenhouse(
  companyName: string,
  inputUrl: string
): Promise<{ result: DetectionResult | null; triedSlugs: string[]; matchedSlug: string | null }> {
  const candidates = generateCandidateSlugs(companyName);
  const triedSlugs: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const slug = candidates[i];
    triedSlugs.push(slug);

    const rawData = await fetchGreenhouseJobs(slug);

    if (rawData !== null && isValidGreenhouseResponse(rawData)) {
      // Hit! This slug is a valid Greenhouse board.
      const jobs = parseGreenhouseResponse(rawData);
      return {
        result: {
          companyName,
          inputUrl,
          matchedPlatform: 'greenhouse',
          jobs,
        },
        triedSlugs,
        matchedSlug: slug,
      };
    }

    // Small delay between attempts to avoid hammering the API
    if (i < candidates.length - 1) {
      await sleep(150);
    }
  }

  // All candidates failed
  return { result: null, triedSlugs, matchedSlug: null };
}

/**
 * Homepage scan fallback: fetches the careers page HTML and looks for
 * Greenhouse URL patterns. Returns diagnostics alongside the result.
 */
export async function detectGreenhouseByScan(
  companyName: string,
  inputUrl: string
): Promise<{ result: DetectionResult | null; diagnostics: HomepageScanDiagnostics }> {
  const { token, diagnostics } = await scanHomepageForGreenhouse(inputUrl);

  if (!token) return { result: null, diagnostics };

  const rawData = await fetchGreenhouseJobs(token);
  if (!rawData || !isValidGreenhouseResponse(rawData)) {
    return { result: null, diagnostics };
  }

  const jobs = parseGreenhouseResponse(rawData);
  return {
    result: {
      companyName,
      inputUrl,
      matchedPlatform: 'greenhouse',
      jobs,
    },
    diagnostics,
  };
}

/**
 * Legacy combined entry point — kept for backward compatibility with the
 * detector registry. Tries direct URL, then guess-and-verify, then scan.
 */
export async function detectGreenhouse(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult | null> {
  // Try direct URL match first
  const byUrl = await detectGreenhouseByUrl(companyName, inputUrl);
  if (byUrl) return byUrl;

  // Try guess-and-verify
  const { result: guessed } = await guessAndVerifyGreenhouse(companyName, inputUrl);
  if (guessed) return guessed;

  // Try homepage scan
  const { result: scanned } = await detectGreenhouseByScan(companyName, inputUrl);
  return scanned;
}
