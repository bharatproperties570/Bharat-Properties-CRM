import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import AuditLog from '../models/AuditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment.');
    process.exit(1);
}

async function migrate() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000
        });
        console.log('✅ Connected securely.');

        console.log('⚙️ Running AuditLog idempotency index preflight and migration...');
        await AuditLog.ensureIdempotencyIndex();

        const indexes = await AuditLog.collection.indexes();
        console.log('📋 Current AuditLog indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique, partial: idx.partialFilterExpression })));

        const verified = indexes.some(idx => 
            idx.name === 'unique_audit_event_correlation' ||
            (idx.key && idx.key.eventType === 1 && idx.key.correlationId === 1 && idx.unique)
        );

        if (verified) {
            console.log('✅ AuditLog idempotency index successfully verified.');
        } else {
            console.error('❌ AuditLog idempotency index not found!');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected.');
    }
}

migrate();
