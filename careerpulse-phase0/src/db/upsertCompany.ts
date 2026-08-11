/**
 * upsertCompany — Detect a company's ATS platform and persist it.
 *
 * 1. Runs Phase 0's processCompany() to detect which ATS (if any) powers
 *    this company's careers page.
 * 2. Upserts the result into the `companies` table. If the company already
 *    exists (matched by name), its detection info is updated.
 * 3. Returns the company's UUID and detection details.
 */

import { supabase } from './supabaseClient.js';
import { processCompany } from '../run.js';
import type { ProcessingResult, DetectionMethod } from '../run.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps Phase 0's DetectionMethod.type to the schema's detection_method values.
 *   'direct-url'    → 'direct_url'
 *   'guessed'       → 'guess_verify'
 *   'homepage-scan' → 'homepage_scan'
 *   'fallback'      → null (unknown / not detected)
 */
function mapDetectionMethod(method: DetectionMethod): string | null {
    switch (method.type) {
        case 'direct-url': return 'direct_url';
        case 'guessed': return 'guess_verify';
        case 'homepage-scan': return 'homepage_scan';
        case 'fallback': return null;
    }
}

/**
 * Extracts the platform slug from the detection method.
 * - 'guessed' → the matched slug is stored on the method object
 * - 'direct-url' → extract from the URL using regex patterns
 * - 'homepage-scan' → not reliably available, return null
 * - 'fallback' → no slug
 */
function extractSlug(method: DetectionMethod, inputUrl: string): string | null {
    if (method.type === 'guessed') {
        return method.slug;
    }

    if (method.type === 'direct-url') {
        // Try to extract the slug/token from the input URL's known ATS patterns
        const patterns = [
            /(?:job-)?boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/,
            /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/,
            /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
            /api\.smartrecruiters\.com\/v1\/companies\/([a-zA-Z0-9_-]+)/,
        ];
        for (const pattern of patterns) {
            const match = inputUrl.match(pattern);
            if (match) return match[1];
        }
    }

    return null;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export interface UpsertCompanyResult {
    companyId: string;
    processingResult: ProcessingResult;
    isNew: boolean;
}

export async function upsertCompany(
    name: string,
    careersUrl: string,
): Promise<UpsertCompanyResult> {
    // Step 1: Run the Phase 0 detection pipeline
    console.log(`\n🔍 Detecting ATS for "${name}" (${careersUrl})...`);
    const result = await processCompany({ name, url: careersUrl });

    const { detection, method } = result;

    // Step 2: Prepare the row data
    const row = {
        name,
        careers_url: careersUrl,
        detected_platform: detection.matchedPlatform,
        platform_slug: extractSlug(method, careersUrl),
        detection_method: mapDetectionMethod(method),
        last_scraped_at: new Date().toISOString(),
    };

    // Step 3: Check if this company already exists
    const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('name', name)
        .maybeSingle();

    const isNew = !existing;

    // Step 4: Upsert
    const { data, error } = await supabase
        .from('companies')
        .upsert(row, { onConflict: 'name' })
        .select('id')
        .single();

    if (error) {
        throw new Error(`Failed to upsert company "${name}": ${error.message}`);
    }

    console.log(
        isNew
            ? `  ✅ New company created: ${name} (${detection.matchedPlatform})`
            : `  🔄 Updated existing company: ${name} (${detection.matchedPlatform})`
    );
    console.log(`  📋 Platform: ${detection.matchedPlatform}, Slug: ${extractSlug(method, careersUrl) ?? '—'}, Method: ${mapDetectionMethod(method) ?? 'fallback'}`);
    console.log(`  📊 Jobs found: ${detection.jobs.length}`);

    return {
        companyId: data.id,
        processingResult: result,
        isNew,
    };
}
