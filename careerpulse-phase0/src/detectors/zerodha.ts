import { NormalizedJob, DetectionResult } from '../types.js';

export async function detectZerodha(companyName: string = 'Zerodha', inputUrl: string = 'https://zerodha.com/careers/'): Promise<DetectionResult> {
    const jobs: NormalizedJob[] = [];

    console.log(`\n[Zerodha] Fetching from https://careers.zerodha.com/api/jobs directly...`);
    const startTime = performance.now();

    try {
        const res = await fetch('https://careers.zerodha.com/api/jobs');
        if (!res.ok) {
            throw new Error(`Zerodha API returned ${res.status}`);
        }

        const data = await res.json();

        // As seen: { count: 0, data: [], success: true }
        if (data.success !== true || !Array.isArray(data.data)) {
            throw new Error('Zerodha API response format changed or success is false');
        }

        for (const job of data.data) {
            // We map these optimistically based on typical JSON job feeds.
            // If they change format, we might need update, but it's safe for 0 length.
            const jobId = job.id || job._id || job.slug;
            const urlPath = job.url || (jobId ? `https://careers.zerodha.com/jobs/${jobId}` : 'https://careers.zerodha.com/jobs/');
            jobs.push({
                title: job.title || job.name || 'Unknown Title',
                location: job.location || job.city || null,
                url: urlPath,
                department: job.department || job.category || null,
                postedDate: job.postedAt || job.createdAt || job.published_at || null,
                source: 'zerodha'
            });
        }

        const durationSecs = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[Zerodha] Finished fetching ${jobs.length} jobs in ${durationSecs}s.`);

        return {
            companyName,
            inputUrl,
            matchedPlatform: 'zerodha',
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
