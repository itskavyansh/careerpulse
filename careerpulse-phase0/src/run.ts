/**
 * CareerPulse Phase 0 — Orchestrator / Entry Point
 *
 * Detection pipeline (in order):
 *   1. Direct URL match — if the input URL already points to a known ATS
 *   2. Guess-and-verify — generate slugs from company name, probe each ATS API
 *      (Greenhouse → Lever → Ashby → SmartRecruiters)
 *      ↳ Zero-job matches are cross-checked against the careers page HTML
 *        to catch wrong-tenant matches (e.g., stale Lever slugs)
 *   3. Homepage HTML scan — fetch careers page, regex for ATS references (legacy)
 *   4. Raw HTML fallback — capture HTML for manual inspection
 *
 * Usage: npm start
 */

// ─── Encoding fix for Windows consoles ─────────────────────────────────────────
if (process.stdout.setDefaultEncoding) {
  process.stdout.setDefaultEncoding('utf8');
}

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import type { TestCompany, DetectionResult } from './types.js';
import {
  detectGreenhouseByUrl, guessAndVerifyGreenhouse, detectGreenhouseByScan,
  detectLeverByUrl, guessAndVerifyLever, detectLeverByScan,
  detectAshbyByUrl, guessAndVerifyAshby, detectAshbyByScan,
  guessAndVerifySmartRecruiters,
  detectAmazon,
  detectZerodha,
  detectZoho,
  detectPhenom,
  detectClearFeed,
} from './detectors/index.js';
import { fetchFallbackHtml } from './fallback.js';
import { verifyMatch, type VerificationResult } from './verify.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTestCompaniesPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const projectRoot = dirname(dirname(currentFile));
  return join(projectRoot, 'test-companies.json');
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateCompanies(companies: TestCompany[]): TestCompany[] {
  const seen = new Map<string, TestCompany>();
  const duplicates: string[] = [];

  for (const company of companies) {
    const key = company.name.toLowerCase().trim();
    if (seen.has(key)) {
      duplicates.push(company.name);
    } else {
      seen.set(key, company);
    }
  }

  if (duplicates.length > 0) {
    console.log(
      `WARNING: Skipped ${duplicates.length} duplicate(s): ${duplicates.join(', ')}`
    );
  }

  return Array.from(seen.values());
}

// ─── Detection Method Tracking ─────────────────────────────────────────────────

export type DetectionMethod =
  | { type: 'direct-url' }
  | { type: 'guessed'; platform: string; slug: string; triedSlugs: string[] }
  | { type: 'homepage-scan'; platform: string }
  | { type: 'fallback' };

export interface ProcessingResult {
  detection: DetectionResult;
  method: DetectionMethod;
  allTriedSlugs: { platform: string; slugs: string[] }[];
  /** Set when a zero-job guess match was cross-checked against careers page */
  verification?: VerificationResult;
  /** Guesses that were tried but rejected by verification */
  rejectedGuesses: { platform: string; slug: string; reason: string }[];
}

// ─── URL Pattern Checks ────────────────────────────────────────────────────────

const GREENHOUSE_URL_RE = /(?:job-)?boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/;
const LEVER_URL_RE = /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/;
const ASHBY_URL_RE = /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/;

function isDirectAtsUrl(url: string): boolean {
  return GREENHOUSE_URL_RE.test(url) || LEVER_URL_RE.test(url) || ASHBY_URL_RE.test(url);
}

// ─── Guess Result Type ─────────────────────────────────────────────────────────

export interface GuessResult {
  result: DetectionResult | null;
  triedSlugs: string[];
  matchedSlug: string | null;
}

export type SupportedPlatform = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';

// ─── Per-Company Processing ────────────────────────────────────────────────────

export async function processCompany(company: TestCompany): Promise<ProcessingResult> {
  const allTriedSlugs: { platform: string; slugs: string[] }[] = [];
  const rejectedGuesses: { platform: string; slug: string; reason: string }[] = [];

  // ── Step 0: Custom Dedicated Detectors (Tier 2) ──
  // For highly specific portals that do not fit the guess-and-verify mold
  const lowerName = company.name.toLowerCase().trim();
  if (lowerName === 'amazon') {
    console.log(`    ⚠ Routing to dedicated Amazon detector...`);
    const result = await detectAmazon();
    return {
      detection: result,
      method: { type: 'guessed', platform: 'amazon', slug: 'amazon', triedSlugs: ['amazon'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }
  if (lowerName === 'zerodha') {
    console.log(`    ⚠ Routing to dedicated Zerodha detector...`);
    const result = await detectZerodha(company.name, company.url);
    return {
      detection: result,
      method: { type: 'guessed', platform: 'zerodha', slug: 'zerodha', triedSlugs: ['zerodha'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }
  if (lowerName === 'zoho') {
    console.log(`    ⚠ Routing to dedicated Zoho detector...`);
    const result = await detectZoho(company.name, company.url);
    return {
      detection: result,
      method: { type: 'guessed', platform: 'zoho', slug: 'zoho', triedSlugs: ['zoho'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }

  if (lowerName === 'microsoft') {
    console.log(`    ⚠ Routing to dedicated Microsoft (Phenom) detector...`);
    const result = await detectPhenom(company.name, company.url, 'https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com', 'https://jobs.careers.microsoft.com/global/en');
    return {
      detection: result,
      method: { type: 'guessed', platform: 'phenom', slug: 'microsoft', triedSlugs: ['microsoft'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }
  if (lowerName === 'qualcomm') {
    console.log(`    ⚠ Routing to dedicated Qualcomm (Phenom) detector...`);
    const result = await detectPhenom(company.name, company.url, 'https://careers.qualcomm.com/api/pcsx/search?domain=qualcomm.com', 'https://careers.qualcomm.com');
    return {
      detection: result,
      method: { type: 'guessed', platform: 'phenom', slug: 'qualcomm', triedSlugs: ['qualcomm'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }
  if (lowerName === 'clearfeed') {
    console.log(`    ⚠ Routing to dedicated ClearFeed detector...`);
    const result = await detectClearFeed(company.name, company.url);
    return {
      detection: result,
      method: { type: 'guessed', platform: 'podium-clearfeed', slug: 'clearfeed', triedSlugs: ['clearfeed'] },
      allTriedSlugs,
      rejectedGuesses
    };
  }

  // ── Step 1: Direct URL match ──
  if (isDirectAtsUrl(company.url)) {
    const ghUrl = await detectGreenhouseByUrl(company.name, company.url);
    if (ghUrl) return { detection: ghUrl, method: { type: 'direct-url' }, allTriedSlugs, rejectedGuesses };

    const lvUrl = await detectLeverByUrl(company.name, company.url);
    if (lvUrl) return { detection: lvUrl, method: { type: 'direct-url' }, allTriedSlugs, rejectedGuesses };

    const abUrl = await detectAshbyByUrl(company.name, company.url);
    if (abUrl) return { detection: abUrl, method: { type: 'direct-url' }, allTriedSlugs, rejectedGuesses };
  }

  // ── Step 2: Guess-and-verify ──
  // For each platform: if the guess returns jobs, accept immediately.
  // If the guess returns 0 jobs, run verification before accepting.
  // If verification rejects, continue to the next platform.

  const guessers: { platform: SupportedPlatform; fn: (name: string, url: string) => Promise<GuessResult> }[] = [
    { platform: 'greenhouse', fn: guessAndVerifyGreenhouse },
    { platform: 'lever', fn: guessAndVerifyLever },
    { platform: 'ashby', fn: guessAndVerifyAshby },
    { platform: 'smartrecruiters', fn: guessAndVerifySmartRecruiters },
  ];

  for (const { platform, fn } of guessers) {
    const guess = await fn(company.name, company.url);
    allTriedSlugs.push({ platform, slugs: guess.triedSlugs });

    if (!guess.result) continue; // No match on this platform at all

    const slug = guess.matchedSlug!;
    const jobCount = guess.result.jobs.length;

    // We run verification against careers page HTML for ALL matches to check for wrong tenants
    console.log(`    ⚠ ${platform} slug "${slug}" matched with ${jobCount} jobs — verifying against careers page...`);
    const verification = await verifyMatch(company.url, platform, slug);

    if (verification.status === 'verified') {
      // ATS reference confirmed in HTML → keep match
      console.log(`    ✓ Verified: ${verification.note}`);
      return {
        detection: guess.result,
        method: { type: 'guessed', platform, slug, triedSlugs: guess.triedSlugs },
        allTriedSlugs,
        rejectedGuesses,
        verification,
      };
    }

    if (verification.status === 'rejected') {
      if (jobCount === 0) {
        // No ATS reference in substantial HTML & 0 jobs → wrong tenant, reject
        console.log(`    ✗ Rejected: ${verification.note}`);
        rejectedGuesses.push({ platform, slug, reason: verification.note });
        // Fall through to try the next platform
        continue;
      } else {
        // 1+ jobs BUT not found in HTML (wrong tenant?). 
        // We do not silently accept. We keep it but flag as unverified
        console.log(`    ? Unverified (non-zero match): ${verification.note}`);
        return {
          detection: guess.result,
          method: { type: 'guessed', platform, slug, triedSlugs: guess.triedSlugs },
          allTriedSlugs,
          rejectedGuesses,
          verification: { ...verification, status: 'unverified-match' as any }, // 'unverified-match' is handled in print/summary later
        };
      }
    }

    // unverifiable-spa: HTML too short → can't confirm or deny.
    console.log(`    ? Unverifiable: ${verification.note}`);
    return {
      detection: guess.result,
      method: { type: 'guessed', platform, slug, triedSlugs: guess.triedSlugs },
      allTriedSlugs,
      rejectedGuesses,
      verification,
    };
  }

  // ── Step 3: Homepage HTML scan (legacy fallback) ──
  try {
    const ghScan = await detectGreenhouseByScan(company.name, company.url);
    if (ghScan.result) {
      return { detection: ghScan.result, method: { type: 'homepage-scan', platform: 'greenhouse' }, allTriedSlugs, rejectedGuesses };
    }
  } catch { /* continue */ }

  try {
    const lvScan = await detectLeverByScan(company.name, company.url);
    if (lvScan) {
      return { detection: lvScan, method: { type: 'homepage-scan', platform: 'lever' }, allTriedSlugs, rejectedGuesses };
    }
  } catch { /* continue */ }

  try {
    const abScan = await detectAshbyByScan(company.name, company.url);
    if (abScan) {
      return { detection: abScan, method: { type: 'homepage-scan', platform: 'ashby' }, allTriedSlugs, rejectedGuesses };
    }
  } catch { /* continue */ }

  // ── Step 4: Raw HTML fallback ──
  const fallback = await fetchFallbackHtml(company.name, company.url);
  return { detection: fallback, method: { type: 'fallback' }, allTriedSlugs, rejectedGuesses };
}

// ─── Console Output ────────────────────────────────────────────────────────────

function formatMethod(method: DetectionMethod): string {
  switch (method.type) {
    case 'direct-url':
      return 'direct URL';
    case 'guessed':
      return `guessed (${method.platform}): "${method.slug}"`;
    case 'homepage-scan':
      return `homepage scan (${method.platform})`;
    case 'fallback':
      return 'fallback (raw HTML)';
  }
}

function printCompanyResult(result: ProcessingResult, index: number): void {
  const { detection, method, allTriedSlugs, verification, rejectedGuesses } = result;

  console.log('');
  console.log(`--- ${index + 1}. ${detection.companyName} ---`);
  console.log(`  URL:      ${detection.inputUrl}`);
  console.log(`  Method:   ${formatMethod(method)}`);

  if (detection.matchedPlatform !== 'none') {
    console.log(`  Platform: ${detection.matchedPlatform}`);
    console.log(`  Jobs:     ${detection.jobs.length} found`);

    // Show verification status for zero-job matches
    if (verification) {
      const icon = verification.status === 'verified' ? '✓'
        : verification.status === 'unverifiable-spa' ? '?'
          : '✗';
      console.log(`  Verify:   ${icon} ${verification.status} — ${verification.note}`);
    }

    const preview = detection.jobs.slice(0, 3);
    if (preview.length > 0) {
      for (const job of preview) {
        const loc = job.location ? ` (${job.location})` : '';
        console.log(`    - ${job.title}${loc}`);
      }
      if (detection.jobs.length > 3) {
        console.log(`    ... and ${detection.jobs.length - 3} more`);
      }
    } else {
      console.log('    (matched platform, but zero open jobs)');
    }
  } else {
    console.log('  Platform: NONE');
    if (detection.rawFallbackHtml) {
      console.log(`  Raw HTML: ${detection.rawFallbackHtml.length} chars captured`);
    }
  }

  // Show rejected guesses
  if (rejectedGuesses.length > 0) {
    console.log('  Rejected guesses:');
    for (const { platform, slug, reason } of rejectedGuesses) {
      console.log(`    ✗ ${platform} "${slug}" — ${reason}`);
    }
  }

  // Show what slugs were tried (helpful for diagnosing misses)
  if (method.type === 'fallback' && allTriedSlugs.length > 0) {
    console.log('  Slugs tried (all missed):');
    for (const { platform, slugs } of allTriedSlugs) {
      console.log(`    ${platform}: [${slugs.join(', ')}]`);
    }
  }

  if (detection.error) {
    console.log(`  Error: ${detection.error}`);
  }
}

function printSummaryTable(results: ProcessingResult[]): void {
  console.log('');
  console.log('='.repeat(100));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(100));

  const nameWidth = Math.max(...results.map((r) => r.detection.companyName.length), 12);
  const platformWidth = 16;
  const jobsWidth = 5;
  const verifyWidth = 15;

  const header =
    'Company'.padEnd(nameWidth) +
    '  Platform'.padEnd(platformWidth + 2) +
    '  Jobs'.padEnd(jobsWidth + 2) +
    '  Verified'.padEnd(verifyWidth + 2) +
    '  Detection Method';
  console.log(header);
  console.log('-'.repeat(header.length + 20));

  for (const { detection, method, verification, rejectedGuesses } of results) {
    const name = detection.companyName.padEnd(nameWidth);
    const platform =
      detection.matchedPlatform === 'none'
        ? '--'.padEnd(platformWidth)
        : detection.matchedPlatform.padEnd(platformWidth);
    const jobs =
      detection.matchedPlatform === 'none'
        ? '--'.padStart(jobsWidth)
        : String(detection.jobs.length).padStart(jobsWidth);

    // Verify column
    let verifyStr = '';
    if (verification) {
      if (verification.status === 'verified') verifyStr = '✓ confirmed';
      else if (verification.status === 'unverifiable-spa') verifyStr = '? SPA';
      else if (verification.status === 'unverified-match') verifyStr = '⚠ unverified';
      else verifyStr = '✗ rejected';
    } else if (detection.matchedPlatform !== 'none' && detection.jobs.length > 0) {
      verifyStr = '✓ (trusted)'; // For direct URL matches which skip verification
    }
    const verifyCol = verifyStr.padEnd(verifyWidth);

    const methodStr = formatMethod(method);
    const errorFlag = detection.error ? '  [ERR]' : '';
    const rejectNote = rejectedGuesses.length > 0
      ? `  [rejected: ${rejectedGuesses.map(r => `${r.platform}/${r.slug}`).join(', ')}]`
      : '';

    console.log(`${name}  ${platform}  ${jobs}  ${verifyCol}  ${methodStr}${errorFlag}${rejectNote}`);
  }

  // Stats
  const total = results.length;
  const matched = results.filter((r) => r.detection.matchedPlatform !== 'none').length;
  const guessed = results.filter((r) => r.method.type === 'guessed').length;
  const directUrl = results.filter((r) => r.method.type === 'direct-url').length;
  const scanned = results.filter((r) => r.method.type === 'homepage-scan').length;
  const fellBack = results.filter((r) => r.method.type === 'fallback').length;
  const errored = results.filter((r) => r.detection.error).length;

  // Verification stats
  const verified = results.filter((r) => r.verification?.status === 'verified').length;
  const rejected = results.filter((r) => r.rejectedGuesses.length > 0).length;
  const unverifiable = results.filter((r) => r.verification?.status === 'unverifiable-spa').length;

  // Platform breakdown
  const ghCount = results.filter((r) => r.detection.matchedPlatform === 'greenhouse').length;
  const lvCount = results.filter((r) => r.detection.matchedPlatform === 'lever').length;
  const abCount = results.filter((r) => r.detection.matchedPlatform === 'ashby').length;
  const srCount = results.filter((r) => r.detection.matchedPlatform === 'smartrecruiters').length;

  console.log('-'.repeat(header.length + 20));
  console.log(`Total: ${total} companies`);
  console.log(`  Tier 1 matched: ${matched}/${total} (${Math.round(matched / total * 100)}%)`);
  console.log(`    via direct URL:    ${directUrl}`);
  console.log(`    via guess+verify:  ${guessed}`);
  console.log(`    via homepage scan: ${scanned}`);
  console.log(`  Fallback:  ${fellBack}/${total}`);
  console.log(`  Errors:    ${errored}/${total}`);
  console.log('');
  console.log('  Zero-job verification:');
  console.log(`    Verified (confirmed):   ${verified}`);
  console.log(`    Rejected (wrong tenant): ${rejected}`);
  console.log(`    Unverifiable (SPA):      ${unverifiable}`);
  console.log('');
  console.log('  Platform breakdown:');
  console.log(`    Greenhouse:       ${ghCount}`);
  console.log(`    Lever:            ${lvCount}`);
  console.log(`    Ashby:            ${abCount}`);
  console.log(`    SmartRecruiters:  ${srCount}`);
  console.log('='.repeat(100));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('CareerPulse Phase 0 — ATS Detection Engine');
  console.log('='.repeat(100));

  const companiesPath = getTestCompaniesPath();
  let companies: TestCompany[];
  try {
    const raw = await readFile(companiesPath, 'utf-8');
    companies = JSON.parse(raw) as TestCompany[];
  } catch (err) {
    console.error(`Failed to load test-companies.json at: ${companiesPath}`);
    console.error(err);
    process.exit(1);
  }

  console.log(`Loaded ${companies.length} entries from test-companies.json`);

  companies = deduplicateCompanies(companies);
  console.log(`Processing ${companies.length} unique companies`);
  console.log('');

  const results: ProcessingResult[] = [];
  const DELAY_MS = 500;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    console.log(`Processing ${i + 1}/${companies.length}: ${company.name}...`);

    const result = await processCompany(company);
    results.push(result);

    printCompanyResult(result, i);

    if (i < companies.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  printSummaryTable(results);
}
// Only run main() when this file is executed directly (e.g. `node dist/run.js`),
// NOT when it's imported as a module by other files like upsertCompany.ts.
const thisFile = fileURLToPath(import.meta.url);
const entryFile = resolve(process.argv[1]);

if (thisFile === entryFile) {
  main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
  });
}
