import "./polyfill.js";
import connectDB from "./config/db.js";
import config from "./config/env.js";
import mongoose from "mongoose";
import fs from 'fs';
import path from 'path';

// Enable Mongoose debug mode to see queries in the log
mongoose.set('debug', (collectionName, method, query, doc) => {
    const msg = `[Mongoose-Debug] ${collectionName}.${method}(${JSON.stringify(query)})`;
    console.log(msg);
    try {
        fs.appendFileSync(path.join(process.cwd(), 'mongoose.log'), `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {}
});

// Initialize BullMQ Queues and Workers
import { cronQueue, googleSyncQueue, marketingQueue } from "./queues/queueManager.js";
import "./workers/enrichmentWorker.js";
import "./workers/cronWorker.js";
import "./workers/googleSyncWorker.js";
import "./workers/marketingWorker.js"; 
import "../services/intakeQueue/IntakeQueue.js"; // Unified Intake Queue Worker
import googleDiscoveryService from "../services/discovery/GoogleDiscoveryService.js";
import NurtureBot from "../services/NurtureBot.js";
import { ensureRedisRunning } from "./utils/redisLauncher.js";

const logStartup = (msg) => {
    const logPath = path.join(process.cwd(), 'startup.log');
    try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {}
};

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    logStartup(`❌ Uncaught Exception: ${err.message}\n${err.stack}`);
    process.exit(1);
});

async function startServer() {
    let app;
    try {
        await ensureRedisRunning();
        await connectDB();
        // Initialize background tasks after DB is ready
        googleDiscoveryService.initialize();
    } catch (dbErr) {
        console.error("⚠️ MongoDB Connection Error:", dbErr.message);
    }

    try {
        const { default: loadedApp } = await import("../app.js");
        app = loadedApp;

        app.listen(config.port, () => {
            const msg = `🚀 CRM Backend running on port ${config.port} (Env: ${config.nodeEnv})`;
            console.log(msg);
            logStartup(msg);
        });
    } catch (appErr) {
        console.error("❌ Critical App Initialization Error:", appErr);
        return;
    }

    try {
        cronQueue.add('dailyInactivityCheck', {}, { repeat: { pattern: '0 2 * * *' } }).catch(() => {});
        cronQueue.add('followUpReminders', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
        googleSyncQueue.add('processEmails', {}, { repeat: { pattern: '*/15 * * * *' } }).catch(() => {});
    } catch (queueErr) {}

    setInterval(() => {
        NurtureBot.processPendingLeads().catch(() => {});
    }, 60 * 60 * 1000);
    NurtureBot.processPendingLeads().catch(() => {});
}

startServer();
