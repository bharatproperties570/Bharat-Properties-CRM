import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.staging')));
for (const k in envConfig) process.env[k] = envConfig[k];

async function runMigration() {
    console.log("Starting Phase 4.6 Legacy BSON Normalization...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;

    const res1 = await db.collection('contacts').updateMany(
        { isDeleted: { $exists: false } },
        { $set: { isDeleted: false } }
    );
    console.log(`Normalized isDeleted: ${res1.modifiedCount} documents updated.`);

    const res2 = await db.collection('contacts').updateMany(
        { isMerged: { $exists: false } },
        { $set: { isMerged: false } }
    );
    console.log(`Normalized isMerged: ${res2.modifiedCount} documents updated.`);

    const missingDeleted = await db.collection('contacts').countDocuments({ isDeleted: { $exists: false } });
    const missingMerged = await db.collection('contacts').countDocuments({ isMerged: { $exists: false } });
    
    if (missingDeleted > 0 || missingMerged > 0) {
        console.error("Migration failed: Missing fields still exist.");
        process.exit(1);
    }
    
    console.log("Legacy BSON Normalization successful.");
    await mongoose.disconnect();
    process.exit(0);
}

runMigration().catch(e => {
    console.error("MIGRATION FAILED:", e);
    process.exit(1);
});
