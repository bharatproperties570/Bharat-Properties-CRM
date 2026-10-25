/**
 * 003-historical-tenancy-backfill.js
 *
 * Enterprise Tenancy Historical Data Migration.
 *
 * Mandates:
 * 1. Dry-run first by default. Requires explicit `--execute` to apply changes.
 * 2. Requires verified, explicit customer/user-to-tenant mapping.
 * 3. NEVER assigns historical records to an arbitrary tenant.
 * 4. Idempotent with full rollback support (`--rollback`).
 * 5. Produces exact counts and an exception report for unmapped records.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATION_ID = "MIG_TENANCY_P4_001";

export const TARGET_COLLECTIONS = [
    'contacts',
    'leads',
    'inventories',
    'deals',
    'bookings',
    'projects',
    'activities',
    'tasks',
    'notes'
];

/**
 * Resolves tenantId for a document based on explicit mapping rules.
 * Does NOT fallback to an arbitrary tenant.
 */
export function resolveDocumentTenant(doc, collectionName, mapping = {}) {
    if (!mapping) return null;

    const docIdStr = doc._id ? doc._id.toString() : '';

    // 1. Direct collection & document ID mapping
    if (mapping[collectionName] && mapping[collectionName][docIdStr]) {
        return mapping[collectionName][docIdStr];
    }

    // 2. Direct entities mapping
    if (mapping.entities && mapping.entities[docIdStr]) {
        return mapping.entities[docIdStr];
    }

    // 3. User / Owner mapping
    const ownerId = doc.ownerId || doc.owner || doc.assignedTo || doc.user || doc.createdBy;
    const ownerIdStr = ownerId ? ownerId.toString() : null;
    if (ownerIdStr && mapping.users && mapping.users[ownerIdStr]) {
        return mapping.users[ownerIdStr];
    }

    // 4. Contact / Customer mapping for child entities (leads, deals, bookings)
    const customerId = doc.contactId || doc.contact || doc.customer;
    const customerIdStr = customerId ? customerId.toString() : null;
    if (customerIdStr && mapping.contacts && mapping.contacts[customerIdStr]) {
        return mapping.contacts[customerIdStr];
    }

    // 5. Phone / Email lookup if defined in mapping
    if (mapping.identifiers) {
        const phone = doc.mobile || (doc.phones && doc.phones[0]?.number);
        if (phone && mapping.identifiers[phone]) {
            return mapping.identifiers[phone];
        }
        const email = doc.email || (doc.emails && doc.emails[0]?.address);
        if (email && mapping.identifiers[email.toLowerCase()]) {
            return mapping.identifiers[email.toLowerCase()];
        }
    }

    // NEVER assign to arbitrary tenant
    return null;
}

/**
 * Core migration engine
 */
export async function executeTenancyBackfill({
    db,
    isDryRun = true,
    isRollback = false,
    mapping = {},
    collections = TARGET_COLLECTIONS
}) {
    const report = {
        migrationId: MIGRATION_ID,
        isDryRun,
        isRollback,
        startedAt: new Date().toISOString(),
        collections: {},
        totals: {
            totalInspected: 0,
            alreadyTenantTagged: 0,
            missingTenantId: 0,
            mappedAndEligible: 0,
            migrated: 0,
            rolledBack: 0,
            exceptionsCount: 0
        },
        exceptions: []
    };

    const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

    for (const colName of collections) {
        if (!existingCollections.includes(colName)) continue;

        const collection = db.collection(colName);
        const colStats = {
            totalInspected: 0,
            alreadyTenantTagged: 0,
            missingTenantId: 0,
            mappedAndEligible: 0,
            migrated: 0,
            rolledBack: 0,
            exceptionsCount: 0,
            exceptions: []
        };

        if (isRollback) {
            // Rollback mode: remove tenantId where stamped by this migration
            const rollbackFilter = { _tenantMigrationRef: MIGRATION_ID };
            const toRollbackCount = await collection.countDocuments(rollbackFilter);
            colStats.rolledBack = toRollbackCount;

            if (!isDryRun && toRollbackCount > 0) {
                await collection.updateMany(rollbackFilter, {
                    $unset: {
                        tenantId: 1,
                        _tenantMigrationRef: 1,
                        _tenantMigratedAt: 1
                    }
                });
            }
            report.totals.rolledBack += toRollbackCount;
            report.collections[colName] = colStats;
            continue;
        }

        // Forward migration mode
        const totalDocs = await collection.countDocuments({});
        colStats.totalInspected = totalDocs;
        report.totals.totalInspected += totalDocs;

        // Count already tagged
        const alreadyTagged = await collection.countDocuments({
            tenantId: { $exists: true, $nin: [null, ""] }
        });
        colStats.alreadyTenantTagged = alreadyTagged;
        report.totals.alreadyTenantTagged += alreadyTagged;

        // Query missing tenantId
        const missingFilter = {
            $or: [
                { tenantId: { $exists: false } },
                { tenantId: null },
                { tenantId: "" }
            ]
        };
        const missingCount = await collection.countDocuments(missingFilter);
        colStats.missingTenantId = missingCount;
        report.totals.missingTenantId += missingCount;

        if (missingCount === 0) {
            report.collections[colName] = colStats;
            continue;
        }

        const cursor = collection.find(missingFilter).batchSize(200);
        const bulkOps = [];

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const resolvedTenant = resolveDocumentTenant(doc, colName, mapping);

            if (resolvedTenant) {
                colStats.mappedAndEligible++;
                report.totals.mappedAndEligible++;

                if (!isDryRun) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: {
                                $set: {
                                    tenantId: resolvedTenant,
                                    _tenantMigrationRef: MIGRATION_ID,
                                    _tenantMigratedAt: new Date()
                                }
                            }
                        }
                    });

                    if (bulkOps.length >= 200) {
                        const res = await collection.bulkWrite(bulkOps, { ordered: false });
                        colStats.migrated += res.modifiedCount;
                        report.totals.migrated += res.modifiedCount;
                        bulkOps.length = 0;
                    }
                } else {
                    colStats.migrated++;
                    report.totals.migrated++;
                }
            } else {
                // Unmapped exception
                colStats.exceptionsCount++;
                report.totals.exceptionsCount++;

                const exceptionEntry = {
                    collection: colName,
                    documentId: doc._id.toString(),
                    owner: doc.ownerId || doc.owner || doc.assignedTo || null,
                    identifier: doc.mobile || doc.email || doc.name || doc.title || null,
                    reason: "NO_VERIFIED_TENANT_MAPPING"
                };
                colStats.exceptions.push(exceptionEntry);
                report.exceptions.push(exceptionEntry);
            }
        }

        if (!isDryRun && bulkOps.length > 0) {
            const res = await collection.bulkWrite(bulkOps, { ordered: false });
            colStats.migrated += res.modifiedCount;
            report.totals.migrated += res.modifiedCount;
        }

        report.collections[colName] = colStats;
    }

    report.completedAt = new Date().toISOString();
    return report;
}

/**
 * CLI Runner
 */
async function runCli() {
    const args = process.argv.slice(2);
    const isExecute = args.includes('--execute');
    const isDryRun = !isExecute;
    const isRollback = args.includes('--rollback');
    const allowProd = args.includes('--allow-prod') || process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

    let mappingFilePath = null;
    const mappingArg = args.find(a => a.startsWith('--mapping-file='));
    if (mappingArg) {
        mappingFilePath = mappingArg.split('=')[1];
    }

    console.log("=================================================================");
    console.log(`[MIGRATION] 003-historical-tenancy-backfill`);
    console.log(`[MIGRATION] Mode: ${isRollback ? 'ROLLBACK' : (isDryRun ? 'DRY-RUN (Safe Review)' : 'LIVE EXECUTION')}`);
    console.log("=================================================================");

    let mapping = {};
    if (mappingFilePath) {
        if (!fs.existsSync(mappingFilePath)) {
            console.error(`[MIGRATION] FATAL: Specified mapping file does not exist: ${mappingFilePath}`);
            process.exit(1);
        }
        try {
            mapping = JSON.parse(fs.readFileSync(mappingFilePath, 'utf8'));
            console.log(`[MIGRATION] Loaded explicit mapping from ${mappingFilePath}`);
        } catch (e) {
            console.error(`[MIGRATION] FATAL: Failed to parse mapping file JSON:`, e.message);
            process.exit(1);
        }
    } else {
        console.log(`[MIGRATION] NOTICE: No --mapping-file specified. Records missing tenantId will be flagged as EXCEPTIONS without guessing.`);
    }

    // Connect to database
    const nodeEnv = process.env.NODE_ENV || 'development';
    const envFile = nodeEnv === 'staging' ? '.env.staging' : '.env';
    dotenv.config({ path: path.join(__dirname, '..', envFile) });

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("[MIGRATION] FATAL: MONGODB_URI is not set in environment.");
        process.exit(1);
    }

    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const db = conn.connection.db;
    const dbName = conn.connection.name;

    console.log(`[MIGRATION] Connected to Database: ${dbName} (NODE_ENV=${nodeEnv})`);

    if (dbName === 'bharatproperties1' && !allowProd) {
        console.error(`[MIGRATION] FATAL: Production DB detected without --allow-prod or ALLOW_PRODUCTION_MIGRATION=true. Aborting.`);
        process.exit(1);
    }

    const report = await executeTenancyBackfill({
        db,
        isDryRun,
        isRollback,
        mapping
    });

    console.log("\n==================== MIGRATION REPORT ====================");
    console.log(`Total Inspected:       ${report.totals.totalInspected}`);
    console.log(`Already Tenant-Tagged: ${report.totals.alreadyTenantTagged}`);
    console.log(`Missing TenantId:      ${report.totals.missingTenantId}`);
    console.log(`Mapped & Eligible:     ${report.totals.mappedAndEligible}`);
    console.log(`${isDryRun ? 'Would Migrate' : 'Migrated'}:           ${report.totals.migrated}`);
    if (isRollback) {
        console.log(`Rolled Back:           ${report.totals.rolledBack}`);
    }
    console.log(`Exceptions (Unmapped): ${report.totals.exceptionsCount}`);
    console.log("==========================================================\n");

    if (report.exceptions.length > 0) {
        const exceptionFile = path.join(process.cwd(), 'historical-tenancy-exceptions.json');
        fs.writeFileSync(exceptionFile, JSON.stringify(report.exceptions, null, 2));
        console.log(`[MIGRATION] ⚠️  Detailed exception report written to: ${exceptionFile}`);
    }

    await mongoose.disconnect();
    console.log(`[MIGRATION] Run complete.`);
    process.exit(0);
}

// Run CLI if invoked directly
if (process.argv[1] && process.argv[1].endsWith('003-historical-tenancy-backfill.js')) {
    runCli().catch(err => {
        console.error("[MIGRATION] Fatal error:", err);
        process.exit(1);
    });
}
