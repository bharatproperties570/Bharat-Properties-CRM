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

        // Capture all Worker instances for graceful shutdown
        const { enrichmentWorker } = await import("./workers/enrichmentWorker.js");
        const { default: googleSyncWorker } = await import("./workers/googleSyncWorker.js");
        const { cronWorker } = await import("./workers/cronWorker.js");
        const { marketingWorker } = await import("./workers/marketingWorker.js");
        const { distributionWorker } = await import("./workers/distributionWorker.js");
        const { domainEventWorker } = await import("./workers/domainEventWorker.js");
        const { notificationWorker } = await import("./workers/notificationWorker.js");
        const { intakeWorker } = await import("../services/intakeQueue/IntakeQueue.js");
        const { default: automationWorker } = await import("../services/automationQueue/automationWorker.js");

        const activeWorkers = [
            enrichmentWorker, googleSyncWorker, cronWorker, marketingWorker,
            distributionWorker, domainEventWorker, notificationWorker,
            intakeWorker, automationWorker
        ];

        const { outboxPublisher } = await import("../services/OutboxPublisher.js");
        outboxPublisher.start();

        const { cronQueue, googleSyncQueue } = await import("./queues/queueManager.js");
        try {
            cronQueue.add('dailyInactivityCheck', {}, { repeat: { pattern: '0 2 * * *' } }).catch(() => {});
            cronQueue.add('followUpReminders', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
            cronQueue.add('evaluateTimeBasedTriggers', {}, { repeat: { pattern: '0 * * * *' } }).catch(() => {});
            cronQueue.add('enforceSLAReassignment', {}, { repeat: { pattern: '*/30 * * * *' } }).catch(() => {});
            googleSyncQueue.add('processEmails', {}, { repeat: { pattern: '*/15 * * * *' } }).catch(() => {});
        } catch (queueErr) {}

        const NurtureBot = (await import("../services/NurtureBot.js")).default;
        const nurtureInterval = setInterval(() => {
            NurtureBot.processPendingLeads().catch(() => {});
        }, 60 * 60 * 1000);
        NurtureBot.processPendingLeads().catch(() => {});
        
        let agingCronInterval, matchingInterval, pricingInterval, archivalInterval;
        
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

        // --- C9 Graceful Shutdown ---
        let isShuttingDown = false;
        
        const shutdown = async (signal) => {
            if (isShuttingDown) return;
            isShuttingDown = true;
            console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

            // 1. Stop polling/scheduling
            outboxPublisher.stop();
            clearInterval(nurtureInterval);

            // 2. Setup hard timeout for drain
            const SHUTDOWN_DRAIN_TIMEOUT_MS = 60000;
            const drainTimeout = setTimeout(() => {
                console.error(`[Server] Graceful shutdown timeout (${SHUTDOWN_DRAIN_TIMEOUT_MS}ms) reached. Forcing exit.`);
                process.exit(1);
            }, SHUTDOWN_DRAIN_TIMEOUT_MS);

            try {
                // 3. Stop accepting new jobs and wait for active jobs to finish
                console.log(`[Server] Closing ${activeWorkers.length} active workers...`);
                await Promise.all(activeWorkers.map(w => w.close()));
                console.log('[Server] All workers gracefully closed.');
                
                // If we get here, drain was clean
                clearTimeout(drainTimeout);
                console.log('[Server] Shutdown complete.');
                process.exit(0);
            } catch (err) {
                console.error('[Server] Error during graceful shutdown:', err.message);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
}

startServer();
