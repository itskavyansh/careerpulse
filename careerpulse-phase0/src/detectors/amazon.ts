import { NormalizedJob, DetectionResult } from '../types.js';

export async function detectAmazon(): Promise<DetectionResult> {
    const companyName = 'Amazon';
    const inputUrl = 'https://amazon.jobs/';

    const jobs: NormalizedJob[] = [];
    const limit = 100;
    let totalTechHits = 0;
    let totalInternHits = 0;

    console.log(`\n[Amazon] Starting specific job fetch (Tech & Internships globally)...`);
    const startTime = performance.now();

    try {
        // We break the search into two parallel or sequential categories 
        // to avoid URL length issues and ensure logical separation

        // 1. Tech Roles
        const techCategories = [
            'software-development',
            'systems-quality-security-engineering',
            'data-science',
            'machine-learning-science',
            'applied-science',
            'hardware-development',
            'solutions-architect',
            'database-administration'
        ];
        const techQuery = techCategories.map(c => `category[]=${c}`).join('&');

        // 2. Internship / Student Programs (these are categorized under business_category)
        const internCategories = [
            'studentprograms',
            'university'
        ];
        const internQuery = internCategories.map(c => `business_category[]=${c}`).join('&');

        // Helper for paginating a specific query
        const fetchPaginated = async (queryStr: string, isTech: boolean): Promise<void> => {
            let offset = 0;
            let hits = 0;

            while (true) {
                const url = `https://amazon.jobs/en/search.json?${queryStr}&result_limit=${limit}&offset=${offset}`;
                const res = await fetch(url);

                if (!res.ok) {
                    throw new Error(`Amazon API returned ${res.status}`);
                }

                const data = await res.json();
                if (!data.jobs || !Array.isArray(data.jobs)) {
                    throw new Error('Amazon API response format changed, jobs array missing');
                }

                if (offset === 0) {
                    hits = data.hits || 0;
                    if (isTech) totalTechHits = hits;
                    else totalInternHits = hits;
                }

                for (const job of data.jobs) {
                    // Ensure we don't duplicate (e.g. if an intern role also had a tech category)
                    const urlPath = job.job_path ? `https://amazon.jobs${job.job_path}` : `https://amazon.jobs/en/jobs/${job.id_icims || job.id}`;
                    if (!jobs.some(j => j.url === urlPath)) {
                        jobs.push({
                            title: job.title || 'Unknown Title',
                            location: job.location || job.city || null,
                            url: urlPath,
                            department: job.job_category || (job.team ? job.team.title : null) || job.business_category || null,
                            postedDate: job.posted_date || null,
                            source: 'amazon'
                        });
                    }
                }

                offset += limit;
                const fetchedForThisQuery = Math.min(offset, hits);
                console.log(`[Amazon] Fetched ${fetchedForThisQuery}/${hits} ${isTech ? 'Tech' : 'Intern'} jobs...`);

                if (offset >= hits || data.jobs.length === 0) {
                    break;
                }

                // Be polite
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        };

        // Fetch tech roles
        await fetchPaginated(techQuery, true);

        // Fetch intern roles
        await fetchPaginated(internQuery, false);

        const durationSecs = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[Amazon] Finished fetching all ${jobs.length} tailored jobs in ${durationSecs}s.`);

        return {
            companyName,
            inputUrl,
            matchedPlatform: 'amazon',
            jobs
        };

    } catch (error) {
        return {
            companyName,
            inputUrl,
            matchedPlatform: 'none',
            jobs, // Return whatever we managed to grab
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
