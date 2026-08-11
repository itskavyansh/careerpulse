/**
 * Slug Candidate Generator for ATS Board Token Guessing
 *
 * Given a company name, generates an ordered list of plausible ATS board
 * slugs, from most likely to least likely. Most ATS platforms use slugs
 * that are simply the lowercased company name, sometimes with hyphens.
 *
 * Example: "Robinhood Markets" produces:
 *   ["robinhoodmarkets", "robinhood-markets", "robinhood"]
 *
 * The heuristics here are intentionally simple and easy to extend.
 * If you find a company whose slug doesn't match any generated candidate,
 * add a new rule or (for one-offs) use a manual override in the caller.
 */

// ─── Corporate Suffixes ────────────────────────────────────────────────────────

/**
 * Common corporate suffixes to strip from company names before slugifying.
 * These almost never appear in ATS board tokens.
 * Add new entries here as you encounter them — ordering doesn't matter,
 * they're all tried.
 */
const CORPORATE_SUFFIXES = [
    'inc.',
    'inc',
    'llc',
    'ltd.',
    'ltd',
    'labs',
    'technologies',
    'technology',
    'corp.',
    'corp',
    'corporation',
    'co.',
    'co',
    'group',
    'holdings',
    'global',
    'solutions',
    'software',
    'systems',
    'enterprises',
    'services',
];

// ─── Core Slugification Logic ──────────────────────────────────────────────────

/**
 * Strips all non-alphanumeric characters except spaces and hyphens,
 * then trims whitespace. This is the preprocessing step before slugification.
 */
function cleanCompanyName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9\s-]/g, '') // drop punctuation like dots, commas
        .replace(/\s+/g, ' ')            // normalize whitespace
        .trim();
}

/**
 * Given a cleaned company name, generates slug candidates from it.
 * This is the core function — it applies the three main rules:
 *   1. All lowercase, no spaces/hyphens ("robinhoodmarkets")
 *   2. All lowercase, spaces → hyphens ("robinhood-markets")
 *   3. First word only, lowercase ("robinhood") — only if multi-word
 */
function generateSlugsFromName(name: string): string[] {
    const lower = name.toLowerCase();
    const slugs: string[] = [];

    // Rule 1: smash everything together (most common ATS slug pattern)
    const smashed = lower.replace(/[\s-]+/g, '');
    if (smashed.length > 0) {
        slugs.push(smashed);
    }

    // Rule 2: replace spaces with hyphens (second most common pattern)
    const hyphenated = lower.replace(/\s+/g, '-');
    if (hyphenated !== smashed) {
        slugs.push(hyphenated);
    }

    // Rule 3: first word only — catches cases where the company name has
    // extra words (e.g., "Robinhood Markets" → token is just "robinhood")
    const words = lower.split(/[\s-]+/);
    if (words.length > 1 && words[0].length > 0) {
        slugs.push(words[0]);
    }

    return slugs;
}

/**
 * Attempts to strip a known corporate suffix from the end of the name.
 * Returns the stripped name if a suffix was found, null otherwise.
 *
 * Example: "Robinhood Inc." → "Robinhood"
 */
function stripCorporateSuffix(name: string): string | null {
    const lowerName = name.toLowerCase();

    for (const suffix of CORPORATE_SUFFIXES) {
        // Check if the name ends with this suffix (with a space before it)
        if (lowerName.endsWith(` ${suffix}`)) {
            const stripped = name.slice(0, -(suffix.length + 1)).trim();
            if (stripped.length > 0) {
                return stripped;
            }
        }
    }

    return null; // no known suffix found
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Takes a company name and produces an ordered, deduplicated list of
 * candidate ATS board slugs, from most likely to least likely.
 *
 * The list includes candidates for both the original name AND a
 * suffix-stripped version (if applicable). Original-name candidates
 * come first since they're more commonly used as-is.
 *
 * @param companyName — the human-readable company name (e.g., "Stripe", "Robinhood Markets Inc.")
 * @returns — ordered array of unique candidate slugs to try
 */
export function generateCandidateSlugs(companyName: string): string[] {
    const cleaned = cleanCompanyName(companyName);
    const candidates: string[] = [];

    // Generate slugs from the full cleaned name
    candidates.push(...generateSlugsFromName(cleaned));

    // Try stripping corporate suffixes and generating additional candidates
    // from the stripped version (e.g., "Stripe Inc" → also try just "stripe")
    const stripped = stripCorporateSuffix(cleaned);
    if (stripped) {
        candidates.push(...generateSlugsFromName(stripped));
    }

    // Deduplicate while preserving priority order (first occurrence wins)
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const slug of candidates) {
        if (!seen.has(slug)) {
            seen.add(slug);
            deduped.push(slug);
        }
    }

    return deduped;
}
