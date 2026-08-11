/**
 * runBatchSync — Batch-sync ALL companies from test-companies.json.
 *
 * Usage:
 *   npm run sync:all
 *   — or —
 *   node dist/db/runBatchSync.js
 *
 * Processes companies sequentially with a 500ms delay between each
 * (being polite to the ATS APIs). Catches errors per-company so one
 * failure doesn't crash the whole run.
 */

// ─── Encoding fix for Windows consoles ─────────────────────────────────────
if (process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding('utf8');
}

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TestCompany } from '../types.js';
import { supabase } from './supabaseClient.js';
import { upsertCompany } from './upsertCompany.js';
import { syncJobs, type SyncSummary } from './syncJobs.js';
import { sendNewJobAlerts, type AlertSummary } from '../notifications/sendJobAlerts.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTestCompaniesPath(): string {
    const currentFile = fileURLToPath(import.meta.url);
    const projectRoot = dirname(dirname(dirname(currentFile))); // dist/db/ → dist/ → project root
    return join(projectRoot, 'test-companies.json');
}

interface CompanyResult {
    name: string;
    platform: string;
    slug?: string;
    isNew: boolean;
    newJobs: number;
    removedJobs: number;
    unchangedJobs: number;
    totalJobs: number;
    alertSent: number;
    alertFailed: number;
    alertSkipped: number;
    alertFiltered: number;
    durationMs: number;
    error?: string;
    isUnverified?: boolean;
}

// ─── Summary Table ──────────────────────────────────────────────────────────

function printSummaryTable(results: CompanyResult[]): void {
    const nameW = Math.max(...results.map((r) => r.name.length), 10);
    const platW = 16;

    console.log('\n' + '═'.repeat(nameW + 90));
    console.log('BATCH SYNC SUMMARY');
    console.log('═'.repeat(nameW + 90));

    const header =
        'Company'.padEnd(nameW) +
        '  Platform'.padEnd(platW + 2) +
        '  Status'.padEnd(10) +
        '   New'.padEnd(7) +
        '  Removed'.padEnd(10) +
        '  Unchanged'.padEnd(12) +
        '  Total'.padEnd(8) +
        '  🔔Sent'.padEnd(8) +
        '  ❌Fail'.padEnd(8) +
        '  ⏭Skip'.padEnd(8) +
        '  ⚙Filt';
    console.log(header);
    console.log('─'.repeat(header.length + 5));

    for (const r of results) {
        if (r.error) {
            console.log(
                `${r.name.padEnd(nameW)}  ${'ERROR'.padEnd(platW)}  ${'❌'.padEnd(8)}  ${r.error}`
            );
        } else {
            const status = r.isNew ? 'NEW' : 'exists';
            console.log(
                `${r.name.padEnd(nameW)}  ` +
                `${r.platform.padEnd(platW)}  ` +
                `${status.padEnd(8)}  ` +
                `${String(r.newJobs).padStart(4)}  ` +
                `${String(r.removedJobs).padStart(7)}  ` +
                `${String(r.unchangedJobs).padStart(9)}  ` +
                `${String(r.totalJobs).padStart(5)}  ` +
                `${String(r.alertSent).padStart(5)}  ` +
                `${String(r.alertFailed).padStart(5)}  ` +
                `${String(r.alertSkipped).padStart(5)}  ` +
                `${String(r.alertFiltered).padStart(5)}`
            );
        }
    }

    // Stats
    const succeeded = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;
    const totalNew = results.reduce((s, r) => s + r.newJobs, 0);
    const totalRemoved = results.reduce((s, r) => s + r.removedJobs, 0);
    const totalAlertSent = results.reduce((s, r) => s + r.alertSent, 0);
    const totalAlertFailed = results.reduce((s, r) => s + r.alertFailed, 0);

    const totalAlertFiltered = results.reduce((s, r) => s + r.alertFiltered, 0);

    console.log('─'.repeat(header.length + 5));
    console.log(`Companies: ${succeeded} succeeded, ${failed} failed, ${results.length} total`);
    console.log(`Jobs: ${totalNew} new, ${totalRemoved} removed`);
    console.log(`Alerts: ${totalAlertSent} sent, ${totalAlertFailed} failed, ${totalAlertFiltered} filtered`);
    console.log('═'.repeat(nameW + 90));

    // Verify warnings
    const unverified = results.filter(r => r.isUnverified);
    if (unverified.length > 0) {
        console.log('\n' + '═'.repeat(nameW + 90));
        for (const r of unverified) {
            console.log(`⚠ UNVERIFIED MATCH: ${r.name} -> ${r.platform}/${r.slug} (${r.totalJobs} jobs) - could not confirm via page scan, verify manually`);
        }
    }

    // Print timing summary
    console.log('\n' + '═'.repeat(nameW + 90));
    console.log('COMPANY TIMING (Slowest to Fastest)');
    console.log('═'.repeat(nameW + 90));
    const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs);
    for (const r of sorted) {
        console.log(`${r.name.padEnd(nameW)} : ${(r.durationMs / 1000).toFixed(2)}s`);
    }
    console.log('═'.repeat(nameW + 90));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  CareerPulse Phase 1 — Batch Sync                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Fetch all companies from the database
    const { data: dbCompanies, error: dbErr } = await supabase
        .from('companies')
        .select('name, careers_url');

    if (dbErr) {
        console.error('Failed to load companies from Supabase:', dbErr.message);
        process.exit(1);
    }

    if (!dbCompanies || dbCompanies.length === 0) {
        console.log('No companies found in the database. Please add some first!');
        process.exit(0);
    }

    // Map them to the format expected by the batch sync runner
    const companies: TestCompany[] = dbCompanies.map((c: any) => ({
        id: c.name.toLowerCase().replace(/\s+/g, '-'),
        name: c.name,
        url: c.careers_url
    }));

    console.log(`\nLoaded ${companies.length} companies from Supabase\n`);

    const DELAY_MS = 500;
    const results: CompanyResult[] = [];
    const globalStart = performance.now();

    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        console.log(`\n[${i + 1}/${companies.length}] ${company.name}`);
        console.log('─'.repeat(40));

        const start = performance.now();

        try {
            // Step 1: Detect and upsert company
            const { companyId, processingResult, isNew } = await upsertCompany(
                company.name,
                company.url,
            );

            const { detection } = processingResult;

            // Step 2: Sync jobs (if platform detected)
            let summary: SyncSummary = { newJobs: 0, newJobsList: [], removedJobs: 0, unchangedJobs: 0, updatedJobs: 0 };
            let alertSummary: AlertSummary = { sent: 0, failed: 0, skipped: 0, filteredOut: 0 };

            if (detection.matchedPlatform !== 'none') {
                summary = await syncJobs(companyId, detection.jobs);

                // Step 3: Send push alerts for any new jobs found.
                if (summary.newJobs > 0) {
                    alertSummary = await sendNewJobAlerts(companyId, company.name, summary.newJobsList);
                }
            }

            results.push({
                name: company.name,
                platform: detection.matchedPlatform,
                slug: processingResult.method.type === 'guessed' ? processingResult.method.slug : undefined,
                isUnverified: processingResult.verification?.status === 'unverified-match',
                isNew,
                newJobs: summary.newJobs,
                removedJobs: summary.removedJobs,
                unchangedJobs: summary.unchangedJobs,
                totalJobs: detection.jobs.length,
                alertSent: alertSummary.sent,
                alertFailed: alertSummary.failed,
                alertSkipped: alertSummary.skipped,
                alertFiltered: alertSummary.filteredOut,
                durationMs: performance.now() - start,
            });
            console.log(`  ⏱ Finished in ${((performance.now() - start) / 1000).toFixed(1)}s`);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`  ❌ Failed: ${errorMsg}`);
            results.push({
                name: company.name,
                platform: '—',
                isNew: false,
                newJobs: 0,
                removedJobs: 0,
                unchangedJobs: 0,
                totalJobs: 0,
                alertSent: 0,
                alertFailed: 0,
                alertSkipped: 0,
                alertFiltered: 0,
                durationMs: performance.now() - start,
                error: errorMsg,
            });
            console.log(`  ⏱ Finished in ${((performance.now() - start) / 1000).toFixed(1)}s`);
        }

        // Polite delay between companies
        if (i < companies.length - 1) {
            await sleep(DELAY_MS);
        }

        if ((i + 1) % 5 === 0) {
            const elapsed = performance.now() - globalStart;
            console.log(`\n⏱ [Running Total] Processed ${i + 1} companies in ${(elapsed / 1000).toFixed(1)}s`);
        }
    }

    printSummaryTable(results);
    console.log('\n✅ Batch sync complete.');
}

main().catch((err) => {
    console.error('\n❌ Unhandled error in batch sync:', err);
    process.exit(1);
});
