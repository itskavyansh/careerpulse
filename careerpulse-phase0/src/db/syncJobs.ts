/**
 * syncJobs — Sync detected jobs to the database for a company.
 *
 * Given a company_id and the NormalizedJob[] from a detection run:
 *   1. Upsert each job by (company_id, url) — insert if new, update
 *      last_seen_at and other fields if it already exists.
 *   2. Mark any job in the DB for this company that was NOT in this scrape's
 *      results as is_active = false (soft delete — the job listing has
 *      been taken down or is no longer visible).
 *   3. Return a summary of what changed.
 */

import { supabase } from './supabaseClient.js';
import type { NormalizedJob } from '../types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncSummary {
    newJobs: number;
    newJobsList: NormalizedJob[];
    removedJobs: number;
    unchangedJobs: number;
    updatedJobs: number;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function syncJobs(
    companyId: string,
    jobs: NormalizedJob[],
): Promise<SyncSummary> {
    const now = new Date().toISOString();
    let newJobs = 0;
    const newJobsList: NormalizedJob[] = [];
    let updatedJobs = 0;
    let removedJobs = 0;

    // Fast path: if no jobs found, just deactivate all active jobs
    if (jobs.length === 0) {
        const { data: activeDbJobs, error: fetchError } = await supabase
            .from('jobs')
            .select('id')
            .eq('company_id', companyId)
            .eq('is_active', true);

        if (fetchError) {
            console.error(`  ⚠ Failed to fetch active jobs: ${fetchError.message}`);
            return { newJobs: 0, newJobsList: [], removedJobs: 0, unchangedJobs: 0, updatedJobs: 0 };
        }

        const toDeactivate = activeDbJobs?.map((j) => j.id) ?? [];
        if (toDeactivate.length > 0) {
            const { error: deactivateError } = await supabase
                .from('jobs')
                .update({ is_active: false, last_seen_at: now })
                .in('id', toDeactivate);
            if (deactivateError) {
                console.error(`  ⚠ Failed to deactivate old jobs: ${deactivateError.message}`);
            } else {
                removedJobs = toDeactivate.length;
            }
        }
        return { newJobs: 0, newJobsList: [], removedJobs, unchangedJobs: 0, updatedJobs: 0 };
    }

    // ── Step 1: Pre-fetch existing jobs to diff in memory ──
    const { data: existingJobs, error: fetchError } = await supabase
        .from('jobs')
        .select('id, url, is_active')
        .eq('company_id', companyId);

    if (fetchError) {
        console.error(`  ⚠ Failed to fetch existing jobs for diffing: ${fetchError.message}`);
        return { newJobs: 0, newJobsList: [], removedJobs: 0, unchangedJobs: 0, updatedJobs: 0 };
    }

    const existingMap = new Map<string, { id: string; is_active: boolean }>();
    for (const j of existingJobs ?? []) {
        existingMap.set(j.url, j);
    }

    // ── Step 2: Build bulk upsert payload ──
    const scrapedUrls = new Set<string>();

    // In Supabase upsert, the array must have parallel keys. We omit first_seen_at
    // completely so Postgres uses DEFAULT now() on insert and ignores it on update.
    const upsertPayload = jobs.map((job) => {
        scrapedUrls.add(job.url);

        if (!existingMap.has(job.url)) {
            newJobs++;
            newJobsList.push(job);
        }
        updatedJobs++;

        return {
            company_id: companyId,
            url: job.url,
            title: job.title,
            location: job.location, // handle null
            department: job.department, // handle null
            posted_date: job.postedDate, // handle null
            last_seen_at: now,
            is_active: true,
        };
    });

    // Execute bulk upsert in one network call
    const { error: upsertError } = await supabase
        .from('jobs')
        .upsert(upsertPayload, { onConflict: 'company_id,url' });

    if (upsertError) {
        console.error(`  ⚠ Bulk upsert failed: ${upsertError.message}`);
        // If upsert fails catastrophically, we return zero so we don't send fake push alerts
        return { newJobs: 0, newJobsList: [], removedJobs: 0, unchangedJobs: 0, updatedJobs: 0 };
    }

    // ── Step 3: Mark removed jobs as inactive ──
    const toDeactivate = (existingJobs ?? [])
        .filter((dbJob) => dbJob.is_active && !scrapedUrls.has(dbJob.url))
        .map((dbJob) => dbJob.id);

    if (toDeactivate.length > 0) {
        const { error: deactivateError } = await supabase
            .from('jobs')
            .update({ is_active: false, last_seen_at: now })
            .in('id', toDeactivate);

        if (deactivateError) {
            console.error(`  ⚠ Failed to deactivate old jobs: ${deactivateError.message}`);
        } else {
            removedJobs = toDeactivate.length;
        }
    }

    const unchangedJobs = updatedJobs - newJobs;

    return { newJobs, newJobsList, removedJobs, unchangedJobs, updatedJobs };
}
