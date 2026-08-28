import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STRICT ENVIRONMENT LOADING
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv) {
    console.error("[MIGRATION] FATAL: NODE_ENV is missing. Migration must FAIL CLOSED.");
    process.exit(1);
}

let envFile = '.env';
if (nodeEnv === 'staging') {
    envFile = '.env.staging';
} else if (nodeEnv === 'production') {
    envFile = '.env';
} else {
    console.error(`[MIGRATION] FATAL: Unrecognized NODE_ENV=${nodeEnv}. Aborting.`);
    process.exit(1);
}

dotenv.config({ path: path.join(__dirname, '..', envFile) });

const DRY_RUN = process.argv.includes('--dry-run');
const PROD_FLAG = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

async function runMigration() {
    console.log(`[MIGRATION] Starting script: 001-template`);
    console.log(`[MIGRATION] Environment: ${nodeEnv}`);
    console.log(`[MIGRATION] Dry Run Mode: ${DRY_RUN}`);

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("[MIGRATION] FATAL: MONGODB_URI is missing in the loaded environment.");
        process.exit(1);
    }

    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const dbName = conn.connection.name;
    console.log(`[MIGRATION] Connected to Database: ${dbName}`);

    // Production Safety Guard
    if (dbName === 'bharatproperties1') {
        if (nodeEnv !== 'production') {
            console.error(`[MIGRATION] FATAL: Connected to Production DB but NODE_ENV=${nodeEnv}. ABORTING to prevent accidental prod modification.`);
            process.exit(1);
        }
        if (!PROD_FLAG) {
            console.error(`[MIGRATION] FATAL: Attempting to run against Production without ALLOW_PRODUCTION_MIGRATION=true. Aborting.`);
            process.exit(1);
        }
    } else if (nodeEnv === 'staging' && dbName !== 'bharat-properties-staging') {
        console.error(`[MIGRATION] FATAL: Expected staging database but connected to ${dbName}. ABORTING.`);
        process.exit(1);
    }

    if (DRY_RUN) {
        console.log(`[MIGRATION] Target valid. Would process X documents...`);
        console.log(`[MIGRATION] DRY RUN complete. No writes performed.`);
        process.exit(0);
    }

    // Execution Logic Here
    console.log(`[MIGRATION] Executing...`);
    // ... bulkWrite logic ...

    console.log(`[MIGRATION] Complete.`);
    process.exit(0);
}

runMigration().catch(err => {
    console.error("[MIGRATION] CRITICAL FAILURE:", err.message);
    process.exit(1);
});
