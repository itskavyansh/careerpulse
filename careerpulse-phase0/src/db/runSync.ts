/**
 * runSync — CLI script to detect a company's ATS and sync jobs to Supabase.
 *
 * Usage:
 *   npx tsx src/db/runSync.ts "Stripe" "https://stripe.com/jobs"
 *   — or after building —
 *   node dist/db/runSync.js "Stripe" "https://stripe.com/jobs"
 *   — or via npm script —
 *   npm run sync -- "Stripe" "https://stripe.com/jobs"
 *
 * What it does:
 *   1. Runs the Phase 0 detection engine for the given company
 *   2. Upserts the company into the `companies` table
 *   3. Syncs all detected jobs into the `jobs` table
 *   4. Prints a clear summary of what happened
 */

// ─── Encoding fix for Windows consoles ─────────────────────────────────────
if (process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding('utf8');
}

import { upsertCompany } from './upsertCompany.js';
import { syncJobs } from './syncJobs.js';
import { sendNewJobAlerts } from '../notifications/sendJobAlerts.js';
import type { NormalizedJob } from '../types.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node dist/db/runSync.js <company-name> <careers-url>');
        console.error('Example: node dist/db/runSync.js "Stripe" "https://stripe.com/jobs"');
        process.exit(1);
    }

    const [companyName, careersUrl] = args;

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  CareerPulse Phase 1 — Company Sync                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    try {
        // Step 1: Detect ATS and upsert company
        const { companyId, processingResult, isNew } = await upsertCompany(companyName, careersUrl);

        const { detection } = processingResult;

        // Step 2: Sync jobs (only if a platform was detected and jobs were found)
        if (detection.matchedPlatform !== 'none') {
            console.log(`\n📥 Syncing ${detection.jobs.length} jobs to database...`);
            const summary = await syncJobs(companyId, detection.jobs);

            // Step 3: Send push notifications for new jobs
            //   syncJobs tracks which specific jobs are new and returns them in summary.newJobsList.
            const alertSummary = await sendNewJobAlerts(companyId, companyName, summary.newJobsList);

            // Step 4: Print summary
            console.log('\n' + '─'.repeat(60));
            console.log('📊 SYNC SUMMARY');
            console.log('─'.repeat(60));
            console.log(`  Company:    ${companyName} (${isNew ? 'NEW' : 'existing'})`);
            console.log(`  Platform:   ${detection.matchedPlatform}`);
            console.log(`  Total jobs: ${detection.jobs.length}`);
            console.log(`  New:        ${summary.newJobs}`);
            console.log(`  Removed:    ${summary.removedJobs} (marked inactive)`);
            console.log(`  Unchanged:  ${summary.unchangedJobs} (re-seen)`);
            console.log('─'.repeat(60));
            console.log('🔔 PUSH ALERTS');
            console.log('─'.repeat(60));
            console.log(`  Sent:       ${alertSummary.sent}`);
            console.log(`  Failed:     ${alertSummary.failed}`);
            console.log(`  Skipped:    ${alertSummary.skipped} (no token)`);
            console.log(`  Filtered:   ${alertSummary.filteredOut} (keyword mismatch)`);
            console.log('─'.repeat(60));
        } else {
            console.log('\n' + '─'.repeat(60));
            console.log('📊 SYNC SUMMARY');
            console.log('─'.repeat(60));
            console.log(`  Company:    ${companyName} (${isNew ? 'NEW' : 'existing'})`);
            console.log(`  Platform:   NONE (no ATS detected)`);
            console.log(`  Jobs:       0 (fallback — no structured job data available)`);
            console.log('─'.repeat(60));
        }

        console.log('\n✅ Done.');
    } catch (err) {
        console.error('\n❌ Sync failed:', err);
        process.exit(1);
    }
}

main();
