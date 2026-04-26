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
import { ensureRedisRunning } from "./utils/redisLauncher.js";


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
            // process.exit(1); // Do not crash the app for optional background services failing
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
    let app;
    
    try {
        // 0. Ensure Dependencies (Redis)
        await ensureRedisRunning();

        // 1. Connect to MongoDB (Non-blocking retry logic in db.js)
        await connectDB();
    } catch (dbErr) {
        console.error("⚠️ MongoDB Connection Error during startup (Server will continue):", dbErr.message);
    }

    try {
        // 2. Dynamically load app
        const { default: loadedApp } = await import("../app.js");
        app = loadedApp;

        // 3. Start Listening (Primary goal: avoid Network Error)
        app.listen(config.port, () => {
            const msg = `🚀 CRM Backend running on port ${config.port} (Env: ${config.nodeEnv})`;
            console.log(msg);
            logStartup(msg);
        });
    } catch (appErr) {
        console.error("❌ Critical App Initialization Error:", appErr);
        logStartup(`❌ Critical App Initialization Error: ${appErr.message}`);
        return; // Total failure
    }

    try {
        // 4. Schedule background jobs
        cronQueue.add('dailyInactivityCheck', {}, { repeat: { pattern: '0 2 * * *' } }).catch(() => {});
        cronQueue.add('followUpReminders', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
        googleSyncQueue.add('processEmails', {}, { repeat: { pattern: '*/15 * * * *' } }).catch(() => {});
        
        marketingQueue?.getJobCounts?.().then(counts => {
            console.log(`[MarketingQueue] Job counts: waiting=${counts.waiting} active=${counts.active} failed=${counts.failed}`);
        }).catch(() => { /* Redis offline */ });

    } catch (queueErr) {
        console.warn("⚠️ BullMQ/Redis initialization issues. Background jobs may be limited.");
    }

    // 5. Autonomous Agent Fallback
    const NURTURE_INTERVAL = 60 * 60 * 1000; // 1 Hour
    setInterval(() => {
        console.log(`[Autonomous Agent] Triggering NurtureBot cycle: ${new Date().toLocaleTimeString()}`);
        NurtureBot.processPendingLeads().catch(err => 
            console.error('[Autonomous Agent] NurtureBot cycle error:', err.message)
        );
    }, NURTURE_INTERVAL);

    // Run immediately on startup
    NurtureBot.processPendingLeads().catch(() => {});
}

startServer();
