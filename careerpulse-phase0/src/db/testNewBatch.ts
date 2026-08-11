import 'dotenv/config';
import { supabase } from './supabaseClient.js';
import { upsertCompany } from './upsertCompany.js';
import { syncJobs, type SyncSummary } from './syncJobs.js';

const companies = [
    { name: 'Netflix', url: 'https://jobs.netflix.com/' },
    { name: 'Meta', url: 'https://www.metacareers.com/' },
    { name: 'Zomato', url: 'https://www.zomato.com/careers' },
    { name: 'Blinkit', url: 'https://blinkit.com/careers' },
    { name: 'Zepto', url: 'https://www.zepto.com/s/careers' },
    { name: 'Swiggy Instamart', url: 'https://careers.swiggy.com/' },
    { name: 'Uber', url: 'https://www.uber.com/careers/' },
    { name: 'Ola', url: 'https://www.olacabs.com/careers' },
    { name: 'Paytm', url: 'https://paytm.com/careers' },
    { name: 'Flipkart', url: 'https://www.flipkartcareers.com/' }
];

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ensure utf8 encoding
if (process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding('utf8');
}

async function main() {
    console.log('Testing New Batch...\n');
    const results: Array<{ Name: string, Platform: string, Method: string, Jobs: number, Unverified: string }> = [];

    for (const company of companies) {
        console.log(`\n=== Processing ${company.name} ===`);
        try {
            const { companyId, processingResult, isNew } = await upsertCompany(company.name, company.url);
            const { detection } = processingResult;

            let jobsFound = detection.jobs.length;

            results.push({
                Name: company.name,
                Platform: detection.matchedPlatform,
                Method: processingResult.method.type,
                Jobs: jobsFound,
                Unverified: processingResult.verification?.status === 'unverified-match' ? 'YES' : 'NO',
            });
            console.log(` -> Matched: ${detection.matchedPlatform} | Method: ${processingResult.method.type} | Jobs: ${jobsFound}`);
        } catch (e) {
            console.error(`Error for ${company.name}:`, e);
            results.push({
                Name: company.name,
                Platform: 'error',
                Method: 'error',
                Jobs: 0,
                Unverified: 'N/A'
            });
        }
        await sleep(1000);
    }

    console.log('\n=========================================');
    console.log('SUMMARY TABLE');
    console.log('=========================================');
    console.table(results);

    // writing out to file for easy viewing
    import('fs').then(fs => fs.writeFileSync('batch-results.json', JSON.stringify(results, null, 2)));
}

main().catch(console.error);
