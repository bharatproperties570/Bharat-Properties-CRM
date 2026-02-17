import app from "../app.js";
import connectDB from "./config/db.js";
import config from "./config/env.js";

import fs from 'fs';
import path from 'path';

const logStartup = (msg) => {
    const logPath = path.join(process.cwd(), 'startup.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
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

connectDB().then(() => {
    app.listen(config.port, () => {
        const msg = `🚀 CRM Backend running on port ${config.port}\n📊 Environment: ${config.nodeEnv}\n🔧 Mock Mode: ${config.mockMode ? 'Enabled' : 'Disabled'}`;
        console.log(msg);
        logStartup(msg);
    });
}).catch(err => {
    console.error("❌ Failed to connect to DB", err);
    logStartup(`❌ Failed to connect to DB: ${err.message}\n${err.stack}`);
    process.exit(1);
});
