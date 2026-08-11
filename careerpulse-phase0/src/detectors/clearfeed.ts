import { NormalizedJob, DetectionResult } from '../types.js';

export async function detectClearFeed(
    companyName: string = 'ClearFeed',
    inputUrl: string = 'https://clearfeed.ai/careers'
): Promise<DetectionResult> {
    const jobs: NormalizedJob[] = [];
    console.log(`\n[ClearFeed] Fetching from custom JSON API...`);
    const startTime = performance.now();

    try {
        const res = await fetch('https://api.podium.clearfeed.ai/careers/clearfeed');

        if (!res.ok) {
            throw new Error(`ClearFeed API returned ${res.status}`);
        }

        const json = await res.json();

        if (!Array.isArray(json.jobs)) {
            throw new Error('ClearFeed API format changed or invalid response');
        }

        for (const job of json.jobs) {
            jobs.push({
                title: job.title || 'Unknown Title',
                location: job.location || null,
                url: `${inputUrl}?job=${job.id}`,
                department: job.department || null,
                postedDate: job.created_at || null,
                source: 'podium-clearfeed'
            });
        }

        const durationSecs = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[ClearFeed] Finished fetching ${jobs.length} jobs in ${durationSecs}s.`);

        return {
            companyName,
            inputUrl,
            matchedPlatform: 'podium-clearfeed',
            jobs
        };

    } catch (error) {
        return {
            companyName,
            inputUrl,
            matchedPlatform: 'none',
            jobs,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
