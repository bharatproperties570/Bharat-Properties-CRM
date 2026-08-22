import connectDB from "./config/db.js";
import config from "./config/env.js";
import mongoose from "mongoose";
import fs from 'fs';
import path from 'path';

// Enable Mongoose debug ONLY in development (not production — huge overhead)
if (process.env.NODE_ENV !== 'production') {
    mongoose.set('debug', (collectionName, method, query, doc) => {
        const msg = `[Mongoose-Debug] ${collectionName}.${method}(${JSON.stringify(query)})`;
        console.log(msg);
    });
}

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
        if (!config.disableBackgroundTasks) {
            await ensureRedisRunning();
        }
        await connectDB();
    } catch (dbErr) {
        console.error("⚠️ MongoDB/Redis Connection Error:", dbErr.message);
    }

    try {
        const { default: loadedApp } = await import("../app.js");
        app = loadedApp;

        app.listen(config.port, () => {
            const msg = `🚀 CRM Backend running on port ${config.port} (Env: ${config.nodeEnv})`;
            console.log(msg);
            logStartup(msg);
            
            if (config.disableBackgroundTasks) {
                console.log("\n=========================================");
                console.log("🛡️  STAGING RUNTIME SAFETY GUARD ACTIVE");
                console.log(`ENVIRONMENT=${config.nodeEnv}`);
                console.log(`MONGODB_TARGET=${config.mongoUri ? config.mongoUri.split('@')[1]?.split('/')[0] : 'hidden'}`);
                console.log("BACKGROUND_TASKS=DISABLED");
                console.log(`EXTERNAL_INTEGRATIONS=${config.disableExternalIntegrations ? 'DISABLED' : 'ENABLED'}`);
                console.log(`EMAIL=${config.disableEmail ? 'DISABLED' : 'ENABLED'}`);
                console.log(`SMS=${config.disableSms ? 'DISABLED' : 'ENABLED'}`);
                console.log(`WHATSAPP=${config.disableWhatsapp ? 'DISABLED' : 'ENABLED'}`);
                console.log(`WEBHOOKS=${config.disableWebhooks ? 'DISABLED' : 'ENABLED'}`);
                console.log("=========================================\n");
            }
        });
    } catch (appErr) {
        console.error("❌ Critical App Initialization Error:", appErr);
        return;
    }

    if (!config.disableBackgroundTasks) {
        // Initialize background tasks after DB is ready
        const googleDiscoveryService = (await import("../services/discovery/GoogleDiscoveryService.js")).default;
        const automatedIntakeService = (await import("../services/intakeQueue/AutomatedIntakeService.js")).default;
        googleDiscoveryService.initialize();
        automatedIntakeService.initialize();

        // Dynamically load BullMQ Queues and Workers
        await import("./workers/enrichmentWorker.js");
        await import("./workers/googleSyncWorker.js");
        await import("./workers/cronWorker.js");
        await import("./workers/marketingWorker.js");
        await import("./workers/distributionWorker.js");
        await import("../services/intakeQueue/IntakeQueue.js");
        await import("../services/automationQueue/automationWorker.js");

        const { cronQueue, googleSyncQueue } = await import("./queues/queueManager.js");
        try {
            cronQueue.add('dailyInactivityCheck', {}, { repeat: { pattern: '0 2 * * *' } }).catch(() => {});
            cronQueue.add('followUpReminders', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
            cronQueue.add('evaluateTimeBasedTriggers', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
            cronQueue.add('enforceSLAReassignment', {}, { repeat: { pattern: '*/30 * * * *' } }).catch(() => {});
            googleSyncQueue.add('processEmails', {}, { repeat: { pattern: '*/15 * * * *' } }).catch(() => {});
        } catch (queueErr) {}

        const NurtureBot = (await import("../services/NurtureBot.js")).default;
        setInterval(() => {
            NurtureBot.processPendingLeads().catch(() => {});
        }, 60 * 60 * 1000);
        NurtureBot.processPendingLeads().catch(() => {});
        
        // Ensure AgingCronService, initMatchingScheduler etc are handled if imported
        try {
            const AgingCronService = (await import("../services/AgingCronService.js")).default;
            if (AgingCronService && AgingCronService.init) AgingCronService.init();
            
            const { initMatchingScheduler } = await import("../services/matchingScheduler.js");
            if (initMatchingScheduler) initMatchingScheduler();
            
            const { startNightlyPricingCron } = await import("../jobs/nightlyPricingCron.js");
            if (startNightlyPricingCron) startNightlyPricingCron();
            
            const { startArchivalCron } = await import("../cron/archivalWorker.js");
            if (startArchivalCron) startArchivalCron();
        } catch(e) { /* Ignore optional crons not found */ }
    }
}

startServer();
