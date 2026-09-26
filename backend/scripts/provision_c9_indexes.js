import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FailedJobLog from '../models/FailedJobLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment configuration exactly as backend does
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error("❌ CRITICAL: MONGODB_URI is not set in environment. Cannot connect to database.");
    process.exit(1);
}

const REQUIRED_INDEXES = [
    {
        key: { jobId: 1 },
        unique: true,
        sparse: true
    },
    {
        key: { queueName: 1, terminalFailureAt: -1 }
    },
    {
        key: { status: 1, terminalFailureAt: -1 }
    },
    {
        key: { entityId: 1, entityType: 1 }
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

async function provisionAndVerify() {
    let conn;
    try {
        console.log("🔗 Connecting to MongoDB...");
        conn = await mongoose.connect(MONGODB_URI, {
            autoIndex: false,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000
        });
        console.log("✅ Connected securely.");

        // 1. Ensure collection exists implicitly by creating indexes
        console.log("⚙️  Provisioning FailedJobLog indexes explicitly...");
        
        // Loop over the model indexes and create them. We use Mongoose's `createIndexes()` 
        // to build what the schema defines, which is safe.
        // Or we can manually build using createIndex.
        // We will just call createIndexes() on the model directly.
        await FailedJobLog.createIndexes();
        
        console.log("✅ Indexes built successfully.");

        // 2. Verification Step
        console.log("🔍 Verifying indexes on database collection...");
        const dbIndexes = await FailedJobLog.collection.indexes();
        
        let allVerified = true;

        for (const req of REQUIRED_INDEXES) {
            // Find an existing index that exactly matches the key pattern
            const match = dbIndexes.find(idx => deepEqual(idx.key, req.key));
            
            if (!match) {
                console.error(`❌ INDEX MISSING: Could not find index for key: ${JSON.stringify(req.key)}`);
                allVerified = false;
                continue;
            }
            
            let currentIndexValid = true;
            
            // Check unique constraint
            if (req.unique && !match.unique) {
                console.error(`❌ INDEX MISMATCH: Index for ${JSON.stringify(req.key)} is missing unique constraint.`);
                allVerified = false;
                currentIndexValid = false;
            }
            
            // Check sparse constraint
            if (req.sparse && !match.sparse) {
                console.error(`❌ INDEX MISMATCH: Index for ${JSON.stringify(req.key)} is missing sparse constraint.`);
                allVerified = false;
                currentIndexValid = false;
            }
            
            if (currentIndexValid) {
                console.log(`✅ Verified Index: ${match.name || JSON.stringify(match.key)}`);
            }
        }
        
        if (!allVerified) {
            console.error("❌ CRITICAL: Index verification failed. Database is NOT safe for C9 execution.");
            process.exit(1);
        }
        
        console.log("🎉 ALL C9 INDEXES PROVISIONED AND VERIFIED SUCCESSFULLY.");
        process.exit(0);

    } catch (error) {
        console.error("❌ FATAL ERROR during provisioning:", error);
        process.exit(1);
    } finally {
        if (conn) {
            await mongoose.disconnect();
            console.log("🔌 MongoDB connection closed.");
        }
    }
}

provisionAndVerify();
