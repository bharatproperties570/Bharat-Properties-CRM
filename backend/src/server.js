import connectDB from "./config/db.js";
import config from "./config/env.js";

import fs from 'fs';
import path from 'path';

// Initialize BullMQ Queues and Workers
import { cronQueue, googleSyncQueue, marketingQueue } from "./queues/queueManager.js";
import "./workers/enrichmentWorker.js";
import "./workers/cronWorker.js";
import "./workers/googleSyncWorker.js";
import "./workers/marketingWorker.js"; // Phase D: Marketing blast/drip/social jobs
import NurtureBot from "../services/NurtureBot.js";


const logStartup = (msg) => {
    const logPath = path.join(process.cwd(), 'startup.log');
    try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {
        // Silently ignore startup logging errors
    }
};

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    logStartup(`❌ Uncaught Exception: ${err.message}\n${err.stack}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logStartup(`❌ Unhandled Rejection: ${reason}`);
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

// Prevent EPIPE errors from crashing the process when stdout/stderr pipes are broken
process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') return;
    console.error('Stdout error:', err);
});
process.stderr.on('error', (err) => {
    if (err.code === 'EPIPE') return;
    console.error('Stderr error:', err);
});

/**
 * CRM Backend Startup Logic
 * We connect to MongoDB before loading the application modules (app.js)
 * to prevent hangs during index building and model registration in ESM.
 */
async function startServer() {
    try {
        // Connect to MongoDB
        await connectDB();

        // Dynamically load app to ensure DB is connected first
        const { default: app } = await import("../app.js");

        app.listen(config.port, () => {
            const msg = `🚀 CRM Backend running on port ${config.port} (Env: ${config.nodeEnv})`;
            console.log(msg);
            logStartup(msg);
        });

        // Schedule background jobs
        try {
            cronQueue.add('dailyInactivityCheck', {}, {
                repeat: { pattern: '0 2 * * *' }
            }).catch(() => {
                // Silently ignore queue addition errors
            });

            cronQueue.add('followUpReminders', {}, {
                repeat: { pattern: '0 * * * *' }
            }).catch(() => {
                // Silently ignore queue addition errors
            });
            googleSyncQueue.add('processEmails', {}, {
                repeat: { pattern: '*/15 * * * *' }
            }).catch(() => {
                // Silently ignore queue addition errors
            });
        } catch (queueErr) {
            console.warn("⚠️  BullMQ/Redis not fully available locally. Queues inactive.");
        }

        // ── Phase D: Marketing Queue Health Log ───────────────────────────────
        // The marketingQueue processes blast/drip/social jobs when Redis is online.
        // Gracefully skips if Redis is not running.
        marketingQueue?.getJobCounts?.().then(counts => {
            console.log(`[MarketingQueue] Job counts: waiting=${counts.waiting} active=${counts.active} failed=${counts.failed}`);
        }).catch(() => { /* Redis offline — ignore */ });


        // --- 🤖 UNIVERSAL CRON FALLBACK (NurtureBot) ---
        // Runs every hour to advance leads through the Nurture Flow automatically.
        const NURTURE_INTERVAL = 60 * 60 * 1000; // 1 Hour
        setInterval(() => {
            console.log(`[Autonomous Agent] Triggering NurtureBot cycle: ${new Date().toLocaleTimeString()}`);
            NurtureBot.processPendingLeads().catch(err => 
                console.error('[Autonomous Agent] NurtureBot cycle error:', err.message)
            );
        }, NURTURE_INTERVAL);

        // Run immediately on startup
        NurtureBot.processPendingLeads().catch(() => {});

    } catch (err) {
        console.error("❌ Critical Startup Error:", err);
        logStartup(`❌ Critical Startup Error: ${err.message}`);
        process.exit(1);
    }
}

startServer();
