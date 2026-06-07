import "dotenv/config";
import "./src/config/otel.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import NurtureBot from "./services/NurtureBot.js";
import { initMatchingScheduler } from "./services/matchingScheduler.js";
import AgingCronService from "./services/AgingCronService.js";
import { startNightlyPricingCron } from "./jobs/nightlyPricingCron.js";

// 🧠 SENIOR ARCHITECTURE: Initialize background workers
import "./src/workers/marketingWorker.js";

// dotenv.config(); 

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 CRM Backend running on port ${PORT}`);
        
        // Initialize Auto-Aging Engine
        AgingCronService.init();
        
        // Initialize Nightly Pricing Intelligence Benchmark Aggregation
        startNightlyPricingCron();

        // --- 🤖 UNIVERSAL CRON FALLBACK (NurtureBot) ---
        // Runs every hour to advance leads through the Nurture Flow automatically.
        const NURTURE_INTERVAL = 60 * 60 * 1000; // 1 Hour
        setInterval(() => {
            console.log(`[Autonomous Agent] Triggering NurtureBot cycle...`);
            NurtureBot.processPendingLeads().catch(err => 
                console.error('[Autonomous Agent] NurtureBot cycle error:', err.message)
            );
        }, NURTURE_INTERVAL);

        // Run immediately on startup
        NurtureBot.processPendingLeads().catch(() => {});

        // ─── Phase 4B: Scheduled Re-Match Engine ─────────────────────────────────
        // Runs every 6 hours. Finds new deals added since last run and notifies
        // agents of qualified leads that match those properties.
        initMatchingScheduler();
    });
}).catch(err => {
    console.error("❌ Failed to connect to DB", err);
    process.exit(1);
});
