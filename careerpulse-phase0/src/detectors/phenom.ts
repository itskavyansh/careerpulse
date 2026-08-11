import { NormalizedJob, DetectionResult } from '../types.js';

export async function detectPhenom(
    companyName: string,
    inputUrl: string,
    apiUrl: string,
    jobUrlBase: string
): Promise<DetectionResult> {
    const jobs: NormalizedJob[] = [];
    console.log(`\n[${companyName}] Fetching from Phenom JSON API: ${apiUrl}`);
    const startTime = performance.now();

    try {
        let offset = 0;
        const limit = 10; // Phenom GET /api/pcsx/search returns exactly 10 items
        let totalHits = 0;

        while (true) {
            const url = `${apiUrl}&start=${offset}`;
            const res = await fetch(url);

            if (!res.ok) {
                throw new Error(`Phenom API returned ${res.status}`);
            }

            const json = await res.json();

            if (!json.data || !Array.isArray(json.data.positions)) {
                throw new Error('Phenom API format changed or invalid response');
            }

            if (offset === 0) {
                totalHits = json.data.count || 0;
                console.log(`[${companyName}] API reports ${totalHits} total jobs.`);
                if (totalHits === 0) break;
            }

            for (const position of json.data.positions) {
                // Phenom typically gives positionUrl like '/careers/job/446719672552'
                const rawUrl = position.positionUrl || '';
                // Some prepend the base, some don't. We'll use the jobUrlBase if it starts with slash.
                const urlPath = rawUrl.startsWith('/')
                    ? jobUrlBase + rawUrl
                    : (rawUrl ? rawUrl : inputUrl);

                // postedTs is a timestamp, let's normalize it to ISO string if possible
                let postedDate = null;
                if (position.postedTs) {
                    try {
                        const tsMs = position.postedTs > 9999999999 ? position.postedTs : position.postedTs * 1000;
                        postedDate = new Date(tsMs).toISOString();
                    } catch (e) {
                        // ignore invalid dates
                    }
                }

                if (!jobs.some(j => j.url === urlPath)) {
                    jobs.push({
                        title: position.name || 'Unknown Title',
                        location: (position.locations && position.locations[0]) || null,
                        url: urlPath,
                        department: position.department || null,
                        postedDate,
                        source: 'phenom'
                    });
                }
            }

            offset += limit;
            const fetched = Math.min(offset, totalHits);
            console.log(`[${companyName}] Fetched ${fetched}/${totalHits} jobs...`);

            if (offset >= totalHits || json.data.positions.length === 0) {
                break;
            }

            // Wait slightly to be polite
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const durationSecs = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[${companyName}] Finished fetching ${jobs.length} jobs in ${durationSecs}s.`);

        return {
            companyName,
            inputUrl,
            matchedPlatform: 'phenom',
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
