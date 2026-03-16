import connectDB from "./config/db.js";
import config from "./config/env.js";
import mongoose from "mongoose";
import fs from 'fs';
import path from 'path';

// Initialize BullMQ Queues and Workers
import { cronQueue } from "./queues/queueManager.js";
import "./workers/enrichmentWorker.js";
import "./workers/cronWorker.js";
import "./workers/googleSyncWorker.js";

const logStartup = (msg) => {
    const logPath = path.join(process.cwd(), 'startup.log');
    try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { }
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
            }).catch(() => { });

            cronQueue.add('followUpReminders', {}, {
                repeat: { pattern: '0 * * * *' }
            }).catch(() => { });
        } catch (queueErr) {
            console.warn("⚠️  BullMQ/Redis not fully available locally.");
        }

    } catch (err) {
        console.error("❌ Critical Startup Error:", err);
        logStartup(`❌ Critical Startup Error: ${err.message}`);
        process.exit(1);
    }
}

startServer();
