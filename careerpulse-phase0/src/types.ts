/**
 * Shared TypeScript types for CareerPulse Phase 0.
 *
 * These types define the contract between detectors, the fallback fetcher,
 * and the orchestrator. Every detector returns a DetectionResult; every job
 * posting is normalized into a NormalizedJob regardless of source platform.
 */

/** A single job posting, normalized to a common shape across all ATS platforms. */
export interface NormalizedJob {
  title: string;
  location: string | null;
  url: string;
  department: string | null;
  postedDate: string | null; // ISO 8601 string if available, else null
  source: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'zerodha' | 'amazon' | 'zoho' | 'phenom' | 'podium-clearfeed' | 'unknown';
}

/** The result of attempting to detect and scrape a company's career page. */
export interface DetectionResult {
  companyName: string;
  inputUrl: string;
  matchedPlatform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'zerodha' | 'amazon' | 'zoho' | 'phenom' | 'podium-clearfeed' | 'none';
  jobs: NormalizedJob[];
  rawFallbackHtml?: string; // only populated if matchedPlatform is 'none'
  error?: string; // populated if something went wrong, don't throw uncaught
}

/** Shape of each entry in test-companies.json. */
export interface TestCompany {
  name: string;
  url: string;
}
