import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FeedbackSubmission from '../models/FeedbackSubmission.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const REQUIRED_INDEXES = [
    {
        key: { idempotencyKey: 1 },
        unique: true,
        sparse: true
    },
    {
        key: { activity: 1 }
    },
    {
        key: { activity: 1, inventory: 1 }
    }
];

function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
    let keys1 = Object.keys(obj1);
    let keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (let key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
}

/**
 * Pre-flight duplicate scanner.
 * Scans collection for existing duplicate records on unique keys (idempotencyKey) BEFORE index provisioning.
 * Never modifies or deletes records automatically.
 */
export async function detectDuplicates(Model = FeedbackSubmission) {
    const results = {
        hasDuplicates: false,
        idempotencyKeyDuplicates: []
    };

    if (typeof Model.aggregate !== 'function') {
        return results;
    }

    try {
        const keyDups = await Model.aggregate([
            { $match: { idempotencyKey: { $ne: null } } },
            { $group: { _id: "$idempotencyKey", count: { $sum: 1 }, ids: { $push: "$_id" } } },
            { $match: { count: { $gt: 1 } } }
        ]);
        if (Array.isArray(keyDups) && keyDups.length > 0) {
            results.hasDuplicates = true;
            results.idempotencyKeyDuplicates = keyDups;
        }
    } catch (err) {
        console.warn('[IndexScan] Duplicate detection scan warning:', err.message);
    }

    return results;
}

/**
 * Provision and verify unique and lookup indexes.
 */
export async function provisionAndVerifyIndexes(Model = FeedbackSubmission, options = {}) {
    const { dryRun = false } = options;

    console.log("🔍 Scanning FeedbackSubmission collection for pre-existing unique key duplicates...");
    const dups = await detectDuplicates(Model);

    if (dups.hasDuplicates) {
        console.error("❌ CRITICAL: Duplicate records detected in FeedbackSubmission collection!");
        if (dups.idempotencyKeyDuplicates.length > 0) {
            console.error(`   Found ${dups.idempotencyKeyDuplicates.length} duplicate group(s) for 'idempotencyKey':`);
            dups.idempotencyKeyDuplicates.forEach(d => {
                console.error(`   - IdempotencyKey: "${d._id}" | Count: ${d.count} | Document IDs: [${d.ids.join(', ')}]`);
            });
        }
        console.error("⚠️  Index provisioning HALTED. Manual data review required. Automatic data deletion or alteration is strictly prohibited.");
        return { success: false, reason: 'DUPLICATES_DETECTED', duplicates: dups };
    }

    console.log("✅ Zero duplicate records detected. Collection is safe for unique index creation.");

    if (dryRun) {
        console.log("ℹ️  Dry run mode enabled: Skipping index creation.");
        return { success: true, dryRun: true };
    }

    console.log("⚙️  Provisioning FeedbackSubmission unique indexes...");
    if (typeof Model.createIndexes === 'function') {
        await Model.createIndexes();
    }
    console.log("✅ Indexes creation completed.");

    console.log("🔍 Verifying indexes on database collection...");
    let dbIndexes = [];
    if (Model.collection && typeof Model.collection.indexes === 'function') {
        dbIndexes = await Model.collection.indexes();
    }

    let allVerified = true;
    for (const req of REQUIRED_INDEXES) {
        const match = dbIndexes.find(idx => deepEqual(idx.key, req.key));
        if (!match) {
            console.error(`❌ INDEX MISSING: Could not find index for key: ${JSON.stringify(req.key)}`);
            allVerified = false;
            continue;
        }

        if (req.unique && !match.unique) {
            console.error(`❌ INDEX MISMATCH: Index for ${JSON.stringify(req.key)} is missing unique constraint.`);
            allVerified = false;
        }
        if (req.sparse && !match.sparse) {
            console.error(`❌ INDEX MISMATCH: Index for ${JSON.stringify(req.key)} is missing sparse constraint.`);
            allVerified = false;
        }
    }

    if (!allVerified) {
        console.error("❌ CRITICAL: Index verification failed.");
        return { success: false, reason: 'VERIFICATION_FAILED' };
    }

    console.log("✅ All required FeedbackSubmission unique indexes successfully verified.");
    return { success: true, allVerified: true };
}

async function main() {
    const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
    const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--check-only');

    if (!MONGODB_URI) {
        console.error("❌ MONGODB_URI is not set in environment. Set MONGODB_URI to execute index verification against a real database.");
        process.exit(1);
    }

    let conn;
    try {
        console.log("🔗 Connecting to MongoDB...");
        conn = await mongoose.connect(MONGODB_URI, {
            autoIndex: false,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000
        });
        console.log(`✅ Connected securely to database: ${conn.connection.name}`);

        const res = await provisionAndVerifyIndexes(FeedbackSubmission, { dryRun: isDryRun });
        if (!res.success) {
            process.exit(1);
        }
        process.exit(0);
    } catch (err) {
        console.error("❌ Index Provisioning Error:", err.message);
        process.exit(1);
    } finally {
        if (conn) {
            await mongoose.disconnect().catch(() => {});
        }
    }
}

if (process.argv[1] && process.argv[1].endsWith('provision_feedback_submission_indexes.js')) {
    main();
}
