import { NormalizedJob, DetectionResult } from '../types.js';

export async function detectZoho(companyName: string = 'Zoho', inputUrl: string = 'https://www.zoho.com/careers/'): Promise<DetectionResult> {
    const jobs: NormalizedJob[] = [];

    console.log(`\n[Zoho] Fetching from Zoho JSON API directly...`);
    const startTime = performance.now();

    try {
        const apiUrl = 'https://careers.zohocorp.com/recruit/v2/public/Job_Openings?pagename=Careers&source=CareerSite';
        const res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!res.ok) {
            throw new Error(`Zoho API returned ${res.status}`);
        }

        const json = await res.json();

        if (json.code === 'success' && Array.isArray(json.data)) {
            for (const item of json.data) {
                const title = item.Posting_Title || item.Job_Opening_Name;
                if (!title) continue;

                // Create the job object
                jobs.push({
                    title,
                    location: [item.City, item.Country1].filter(Boolean).join(', ') || null,
                    url: item.$url || inputUrl,
                    department: item.Job_Type || null,
                    postedDate: item.Date_Opened || null,
                    source: 'zoho'
                });
            }
        }

        const durationSecs = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[Zoho] Finished parsing ${jobs.length} jobs via JSON API in ${durationSecs}s.`);

        return {
            companyName,
            inputUrl,
            matchedPlatform: 'zoho', // using custom zoho platform
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
