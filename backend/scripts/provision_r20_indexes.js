import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import DistributionAudit from '../models/DistributionAudit.js';

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
        key: { cycleId: 1 }
    },
    {
        key: { entityId: 1, modelName: 1 }
    },
    {
        name: 'unique_completed_cycle',
        key: { cycleId: 1, status: 1 },
        unique: true,
        partialFilterExpression: { status: 'COMPLETED' }
    },
    {
        name: 'unique_failed_cycle',
        key: { cycleId: 1, status: 1 },
        unique: true,
        partialFilterExpression: { status: 'FAILED' }
    }
];

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    let keysA = Object.keys(a), keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (let key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
    }
    return true;
}

async function provisionAndVerify() {
    console.log("🚀 Starting R20 DistributionAudit Index Provisioning...");
    
    let conn;
    try {
        // 1. Establish MongoDB connection using standard mongoose.connect
        conn = await mongoose.connect(MONGODB_URI, { autoIndex: false, family: 4 });
        console.log(`✅ MongoDB Connected to database: ${conn.connection.name}`);
        
        // 2. Provision Indexes
        console.log("⏳ Creating indexes via Mongoose...");
        await DistributionAudit.createIndexes();
        console.log("✅ Indexes created successfully (or already exist).");
        
        // 3. Verify Indexes
        console.log("⏳ Verifying indexes on the database...");
        const db = mongoose.connection.db;
        const collections = await db.listCollections({ name: 'distributionaudits' }).toArray();
        
        if (collections.length === 0) {
            console.error("❌ CRITICAL ERROR: distributionaudits collection does not exist after createIndexes().");
            process.exit(1);
        }

        const dbIndexes = await db.collection('distributionaudits').indexes();
        console.log(`🔍 Found ${dbIndexes.length} indexes on 'distributionaudits' collection.`);
        
        let allVerified = true;
        
        for (const req of REQUIRED_INDEXES) {
            let currentIndexValid = true;
            
            // Find a matching index in DB by key
            const match = dbIndexes.find(idx => deepEqual(idx.key, req.key) && (!req.name || idx.name === req.name));
            
            if (!match) {
                console.error(`❌ MISSING INDEX: Expected index with key ${JSON.stringify(req.key)} and name ${req.name || 'any'}`);
                allVerified = false;
                currentIndexValid = false;
                continue;
            }
            
            // Check uniqueness
            if (req.unique && !match.unique) {
                console.error(`❌ INDEX MISMATCH: Index ${match.name} should be unique but is not.`);
                allVerified = false;
                currentIndexValid = false;
            }
            
            // Check partial filter expression
            if (req.partialFilterExpression) {
                if (!match.partialFilterExpression) {
                    console.error(`❌ INDEX MISMATCH: Index ${match.name} is missing partialFilterExpression.`);
                    allVerified = false;
                    currentIndexValid = false;
                } else if (!deepEqual(req.partialFilterExpression, match.partialFilterExpression)) {
                    console.error(`❌ INDEX MISMATCH: Index ${match.name} has incorrect partialFilterExpression. Expected ${JSON.stringify(req.partialFilterExpression)}, got ${JSON.stringify(match.partialFilterExpression)}`);
                    allVerified = false;
                    currentIndexValid = false;
                }
            }
            
            if (currentIndexValid) {
                console.log(`✅ Verified Index: ${match.name || JSON.stringify(match.key)}`);
            }
        }
        
        if (!allVerified) {
            console.error("❌ CRITICAL: Index verification failed. Database is NOT safe for R20 execution.");
            process.exit(1);
        }
        
        console.log("🎉 ALL R20 INDEXES PROVISIONED AND VERIFIED SUCCESSFULLY.");
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
