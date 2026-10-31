import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import AuditLog from '../models/AuditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export async function runMigration(options = {}) {
    // 1. Enforce production guard directly inside programmatic invocation
    const mongoUri = options.mongoUri ||
        process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        mongoose.connection?.client?.s?.url ||
        mongoose.connection?._connectionString || '';

    const host = (mongoose.connection?.host || '').toLowerCase();
    const uriLower = String(mongoUri).toLowerCase();
    const isProductionAtlas = uriLower.includes('mongodb.net') || uriLower.includes('cluster') ||
        host.includes('mongodb.net') || host.includes('cluster');

    const allowProduction = options.allowProductionMigration === true || process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

    if (isProductionAtlas && !allowProduction) {
        const err = new Error('PRODUCTION_MIGRATION_UNAUTHORIZED: Direct programmatic invocation against production MongoDB Atlas requires explicit authorization (allowProductionMigration: true or ALLOW_PRODUCTION_MIGRATION=true)');
        err.code = 'PRODUCTION_MIGRATION_UNAUTHORIZED';
        throw err;
    }

    const isPreflight = options.preflightOnly ?? process.argv.includes('--preflight-only');
    const shouldArchive = options.archiveDuplicates ?? process.argv.includes('--archive-duplicates');

    console.log('⚙️ Step 1: Running read-only duplicate preflight report...');
    const preflight = await AuditLog.getDuplicatePreflightReport();

    console.log(`📊 Preflight Result: ${preflight.totalDuplicateGroups} duplicate group(s), ${preflight.totalDuplicateRecords} duplicate record(s).`);

    if (preflight.totalDuplicateGroups > 0) {
        console.warn('⚠️ Duplicate AuditLog correlation groups detected:');
        for (const g of preflight.groups) {
            console.warn(`  - [${g.eventType}] correlationId: "${g.correlationId}": ${g.totalCount} records (Retaining earliest ID: ${g.retainedId} @ ${g.retainedTimestamp})`);
            for (const d of g.duplicateDetails) {
                console.warn(`      Duplicate ID to archive: ${d._id} (timestamp: ${d.timestamp}, target: ${d.targetType}:${d.targetId})`);
            }
        }

        if (isPreflight) {
            const msg = `PREFLIGHT_FOUND_DUPLICATES: Found ${preflight.totalDuplicateGroups} duplicate group(s) with ${preflight.totalDuplicateRecords} duplicate record(s). Database is not ready for unique index.`;
            console.error(`❌ ${msg}`);
            const err = new Error(msg);
            err.code = 'PREFLIGHT_FOUND_DUPLICATES';
            err.preflight = preflight;
            throw err;
        }

        if (!shouldArchive) {
            const msg = `❌ Migration aborted safely: Found ${preflight.totalDuplicateGroups} duplicate group(s). Automatic deletion is disabled to preserve audit history. Pass --archive-duplicates to archive records before index creation.`;
            console.error(msg);
            const err = new Error(msg);
            err.code = 'UNRESOLVED_DUPLICATES';
            err.preflight = preflight;
            throw err;
        }

        console.log('⚙️ Step 2: Archiving duplicate records with verified counts and identity...');
        const archiveRes = await AuditLog.archiveAndReconcileDuplicates({
            archiveCollectionName: options.archiveCollectionName || 'auditlogs_archive_duplicates'
        });

        console.log(`✅ Archival complete: ${archiveRes.archivedCount} duplicate record(s) safely archived to '${archiveRes.archiveCollection}'.`);
    } else {
        console.log('✅ Preflight verified: Zero duplicate correlation records found.');
        if (isPreflight) {
            console.log('ℹ️ Preflight check passed. Database is ready for unique index. No database modifications made.');
            return { success: true, preflight };
        }
    }

    console.log('⚙️ Step 3: Ensuring idempotency index with exact specification...');
    const indexRes = await AuditLog.ensureIdempotencyIndex();
    console.log(`✅ Index step completed: created=${indexRes.created}, verified=${indexRes.verified}`);

    console.log('⚙️ Step 4: Validating exact index specification on native collection...');
    const indexes = await AuditLog.collection.indexes();
    const targetIdx = indexes.find(idx => idx.name === 'unique_audit_event_correlation');

    const specCheck = AuditLog.verifyIdempotencyIndexSpec(targetIdx);
    if (!specCheck.valid) {
        throw new Error(`INDEX_VALIDATION_FAILED: ${specCheck.reason}`);
    }

    console.log('✅ AuditLog idempotency index verified successfully:');
    console.log(`   Name: ${targetIdx.name}`);
    console.log(`   Keys: ${JSON.stringify(targetIdx.key)}`);
    console.log(`   Unique: ${targetIdx.unique}`);
    console.log(`   PartialFilterExpression: ${JSON.stringify(targetIdx.partialFilterExpression)}`);

    return {
        success: true,
        index: targetIdx,
        preflight
    };
}

async function cli() {
    const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set in environment.');
        process.exit(1);
    }

    // Safety check: Prevent accidental migration against production Atlas without explicit authorization
    const isProductionAtlas = MONGODB_URI.includes('mongodb.net') || MONGODB_URI.includes('cluster');
    const allowProduction = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

    if (isProductionAtlas && !allowProduction) {
        console.error('❌ REFUSING TO RUN: Target appears to be production MongoDB Atlas and ALLOW_PRODUCTION_MIGRATION is not set.');
        process.exit(1);
    }

    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000
        });
        console.log('✅ Connected securely.');

        const result = await runMigration();
        if (process.argv.includes('--preflight-only')) {
            console.log('🎉 Preflight check completed successfully.');
        } else {
            console.log('🎉 Migration completed successfully.');
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected.');
    }
}

// Only execute CLI if invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    cli();
}
