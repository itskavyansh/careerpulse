/**
 * Raw HTML Fallback Fetcher
 *
 * Used when none of the ATS detectors (Greenhouse, Lever, Ashby) match
 * a company's career page URL. Performs a plain HTTP GET and returns the
 * first 5000 characters of the response body as raw HTML for manual
 * inspection.
 *
 * This is explicitly NOT a headless browser — if the page is a React/Vue
 * SPA that renders content client-side, the HTML will be mostly empty.
 * That's expected behavior for Phase 0: the goal is to identify which
 * companies need Tier 2/3 scraping solutions, not to solve it now.
 */

import type { DetectionResult } from './types.js';

/** Maximum number of characters to keep from the raw HTML response. */
const MAX_HTML_LENGTH = 5_000;

/**
 * Fetches the raw HTML from the given URL and returns a DetectionResult
 * with matchedPlatform: 'none' and the truncated HTML in rawFallbackHtml.
 *
 * Never throws — catches all network errors and populates the error field instead.
 */
export async function fetchFallbackHtml(
  companyName: string,
  inputUrl: string
): Promise<DetectionResult> {
  try {
    const response = await fetch(inputUrl, {
      headers: {
        'User-Agent': 'CareerPulse/0.1 (job-board-scanner)',
        // Some career pages return different content based on Accept header
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
      // Follow redirects (default behavior, but being explicit)
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        companyName,
        inputUrl,
        matchedPlatform: 'none',
        jobs: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const fullHtml = await response.text();
    const truncatedHtml = fullHtml.slice(0, MAX_HTML_LENGTH);

    return {
      companyName,
      inputUrl,
      matchedPlatform: 'none',
      jobs: [],
      rawFallbackHtml: truncatedHtml,
    };
  } catch (err) {
    // Catch network errors, DNS failures, timeouts — don't let them crash the run
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      companyName,
      inputUrl,
      matchedPlatform: 'none',
      jobs: [],
      error: `Fetch failed: ${errorMessage}`,
    };
  }
}
