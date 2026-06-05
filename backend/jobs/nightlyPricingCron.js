import cron from 'node-cron';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * NIGHTLY PRICING BENCHMARK AGGREGATION JOB
 * Bharat Properties CRM — Phase 2 Intelligence
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Runs every night at 2:00 AM.
 * Calls the local /api/pricing/aggregate endpoint (using internal host to avoid network hop if possible,
 * or standard external URL if needed. Here we simulate a direct HTTP call to the local server).
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const PORT = process.env.PORT || 5000;
const AGGREGATE_URL = `http://localhost:${PORT}/api/pricing/aggregate`;

export const startNightlyPricingCron = () => {
    // Schedule: 2:00 AM every day
    cron.schedule('0 2 * * *', async () => {
        console.log('[NightlyCron] 🕒 Triggering Pricing Benchmark Aggregation...');
        try {
            // We use an admin token or bypass auth depending on route config.
            // But since this is a local call, and assuming the route might require auth,
            // we'll send a system flag or standard request.
            // For now, we'll just hit the endpoint directly. (Ensure the endpoint supports machine-to-machine auth if needed).
            
            // To properly bypass auth or authenticate, you would typically pass a service token.
            // As a simple start:
            const response = await axios.post(AGGREGATE_URL, {
                trailingDays: 90
            }, {
                // If using a service token, it would go here
                headers: {
                    'x-cron-job': 'true'
                }
            });

            console.log(`[NightlyCron] ✅ Success: ${response.data.message}. Updated: ${response.data.benchmarksUpdated}`);
        } catch (error) {
            console.error('[NightlyCron] ❌ Failed to run aggregation:', error?.response?.data || error.message);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log('[NightlyCron] 🕒 Nightly Pricing Aggregation Job Scheduled (2:00 AM IST).');
};
