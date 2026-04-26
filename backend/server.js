import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import NurtureBot from "./services/NurtureBot.js";

// 🧠 SENIOR ARCHITECTURE: Initialize background workers
import "./src/workers/marketingWorker.js"; 

// dotenv.config(); 

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 CRM Backend running on port ${PORT}`);
        
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
    });
}).catch(err => {
    console.error("❌ Failed to connect to DB", err);
    process.exit(1);
});
