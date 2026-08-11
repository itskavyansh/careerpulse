# CareerPulse Phase 0 — ATS Detection Engine

Given a company name and careers page URL, this engine detects which
Applicant Tracking System (ATS) the company uses and returns a normalized
list of current job postings via the platform's public API.

## Phase 0 — Complete

### What It Guarantees

For any `(companyName, careersUrl)` input, the engine returns a
`DetectionResult` with one of two outcomes:

1. **Tier 1 Match** — the company's ATS platform was identified, and a
   `NormalizedJob[]` array was fetched from the platform's public API
   (may be empty if the company has no open roles)
2. **Fallback** — no supported ATS was detected; the first 5000 chars of
   raw HTML are captured for manual inspection

The engine **never throws an unhandled exception**. Every API call is
wrapped in try/catch, and every error is surfaced via the `error` field
on `DetectionResult`.

### Detection Strategy

The engine uses a "guess-and-verify" approach — it generates candidate
board slugs from the company name (`slugify.ts`) and probes each ATS's
public API directly, in order:

1. **Direct URL match** — if the input URL is already a known ATS URL
   (e.g., `boards.greenhouse.io/anthropic`), use it directly
2. **Guess-and-verify** — generate candidate slugs, try each against
   Greenhouse → Lever → Ashby → SmartRecruiters APIs
3. **Homepage HTML scan** — fetch the careers page HTML and regex-search
   for ATS URL patterns (legacy fallback for non-guessable slugs)
4. **Raw HTML fallback** — capture HTML for manual inspection

This approach bypasses the SPA-rendering problem entirely — no headless
browser needed.

### Current Tier 1 Hit Rate

**26 out of 33 test companies (79%)** were successfully detected and
scraped, with **0 errors**.

| Detection Method | Count |
|------------------|-------|
| Direct URL       | 1     |
| Guess-and-verify | 24    |
| Homepage scan    | 1     |
| Fallback         | 7     |

### Supported Platforms

| Platform        | API Endpoint                                                    | Notes |
|-----------------|-----------------------------------------------------------------|-------|
| Greenhouse      | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs`           | Most common — 18/26 matches |
| Ashby           | `GET api.ashbyhq.com/posting-api/job-board/{slug}`              | 4/26 matches (Notion, Linear, Ramp, Perplexity) |
| Lever           | `GET api.lever.co/v0/postings/{slug}?mode=json`                 | 3/26 matches (CRED, Meesho, Freshworks) |
| SmartRecruiters | `GET api.smartrecruiters.com/v1/companies/{slug}/postings`      | 1/26 matches (Swiggy); API never 404s so requires `totalFound > 0` |

### Not Supported (and why)

- **Workday** — no public, unauthenticated API; requires per-tenant OAuth
  credentials. Cannot be guess-and-verified.
- **Custom/proprietary career sites** — companies like Google, Amazon,
  Zoho that built their own job listing systems. Would require headless
  browser scraping of each company's unique page structure.
- **SPA-only pages with non-guessable slugs** — if a company's ATS slug
  doesn't match its name and the careers page only renders client-side,
  detection fails. A known-slug override map could solve this case-by-case.

## How to Run

```bash
# Prerequisites: Node.js 20+

# Install dependencies
npm install

# Compile and run
npm start

# Or use the dev shortcut (compile + run)
npm run dev
```

On **Windows**, run `chcp 65001` before running the scanner to ensure
non-ASCII job titles (e.g., Japanese) display correctly.

The scanner processes all companies in `test-companies.json` and prints a
per-company breakdown followed by a summary table.

## Project Structure

```
careerpulse-phase0/
├── package.json
├── tsconfig.json
├── test-companies.json        — companies to scan (33 entries)
├── src/
│   ├── types.ts               — shared TypeScript types (NormalizedJob, DetectionResult)
│   ├── slugify.ts             — candidate slug generator from company names
│   ├── detectors/
│   │   ├── greenhouse.ts      — Greenhouse guess-and-verify + scan
│   │   ├── lever.ts           — Lever guess-and-verify + scan
│   │   ├── ashby.ts           — Ashby guess-and-verify + scan
│   │   ├── smartrecruiters.ts — SmartRecruiters guess-and-verify
│   │   └── index.ts           — detector registry + re-exports
│   ├── fallback.ts            — raw HTML fallback for unmatched companies
│   └── run.ts                 — orchestrator / CLI entry point
└── README.md
```

## What Phase 0 Does NOT Do

- No UI, no database, no notifications
- No headless browser / JS rendering
- No scheduling or automated re-runs
- No parallelism — companies are processed sequentially with 500ms delays

These are all explicitly deferred to Phase 1+.
