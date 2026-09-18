import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const TARGET_RULE_ID = '69b8c7ba81e723b58a586959';
export const CAMPAIGN_OBJECT_ID = '698b3312861a01e0b08168ad';
export const TARGET_AGENT_ID = '698de200eebee6c7a313dd32';

export async function verifyPreconditions(db) {
    console.log('[1/4] Verifying Preconditions...');
    const rule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    if (!rule) throw new Error(`Target rule ${TARGET_RULE_ID} not found.`);

    // Idempotency check
    if (rule.module === 'leads' && rule.triggerEvent && rule.triggerEvent.includes('onCreate')) {
        return 'ALREADY_MIGRATED';
    }

    if (rule.entity !== 'lead' || rule.logic !== 'ROUND_ROBIN' || !rule.isActive || !rule.assignedAgents || !rule.conditions) {
        throw new Error(`Rule ${TARGET_RULE_ID} does not match expected legacy shape.`);
    }

    const campaignCondition = rule.conditions.find(c => c.field === 'campaign' && c.value === 'Online');
    if (!campaignCondition) {
        throw new Error(`Rule ${TARGET_RULE_ID} does not contain expected campaign="Online" condition.`);
    }

    const lookup = await db.collection('lookups').findOne({ _id: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID) });
    if (!lookup) throw new Error(`Target campaign lookup ${CAMPAIGN_OBJECT_ID} not found in DB.`);

    const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(TARGET_AGENT_ID) });
    if (!user) throw new Error(`Target assignment user ${TARGET_AGENT_ID} not found in DB.`);

    return 'READY';
}

export async function createBackup(db) {
    console.log('[2/4] Creating Backup...');
    const timestamp = Date.now();
    const backupCollectionName = `distributionrules_backup_${timestamp}`;
    
    // Fail-closed: ensure collection doesn't exist
    const collections = await db.listCollections({ name: backupCollectionName }).toArray();
    if (collections.length > 0) {
        throw new Error(`Backup collection ${backupCollectionName} already exists. Aborting.`);
    }

    // $merge is used sequentially (not in multi-doc transaction) because MongoDB restricts collection creation in transactions.
    await db.collection('distributionrules').aggregate([
        { $match: {} },
        { $merge: { into: backupCollectionName } }
    ]).toArray();

    // Verification
    const originalRule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    const backupRule = await db.collection(backupCollectionName).findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });

    if (!backupRule) throw new Error("Target rule missing from backup.");
    if (JSON.stringify(originalRule) !== JSON.stringify(backupRule)) {
        throw new Error("Backup rule document mismatch.");
    }

    console.log(`Backup created and verified: ${backupCollectionName}`);
    return backupCollectionName;
}

export async function runMigration(db, isDryRun) {
    console.log(`[3/4] Running Migration ${isDryRun ? '(DRY RUN)' : '(EXECUTE)'}...`);
    
    const rule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    const updatedConditions = rule.conditions.map(c => {
        if (c.field === 'campaign' && c.value === 'Online') {
            return { ...c, value: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID) };
        }
        return c;
    });

    const updateDoc = {
        $set: {
            module: "leads",
            enabled: rule.isActive,
            distributionType: "roundRobin",
            assignmentTarget: {
                type: "user",
                ids: rule.assignedAgents.map(id => new mongoose.Types.ObjectId(id))
            },
            triggerEvent: ["onCreate", "onWebCapture"],
            conditions: updatedConditions
        },
        $unset: {
            entity: "",
            isActive: "",
            logic: "",
            assignedAgents: ""
        }
    };

    if (isDryRun) {
        console.log('DRY RUN Expected Update:', JSON.stringify(updateDoc, null, 2));
        return 'DRY_RUN_SUCCESS';
    } else {
        // Strict filter to ensure document hasn't changed since preflight
        const filter = {
            _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
            entity: 'lead',
            logic: 'ROUND_ROBIN',
            isActive: rule.isActive
        };

        const result = await db.collection('distributionrules').updateOne(filter, updateDoc);

        if (result.matchedCount !== 1) {
            throw new Error(`Migration update missed or condition changed concurrently for ${TARGET_RULE_ID}.`);
        }
        console.log(`Rule ${TARGET_RULE_ID} successfully migrated.`);
        return 'MIGRATION_SUCCESS';
    }
}

export async function verifyPostMigration(db) {
    console.log('[4/4] Verifying Post-Migration State...');
    const rule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    
    if (rule.entity || rule.isActive !== undefined || rule.logic || rule.assignedAgents) {
        throw new Error("Legacy fields were not completely removed!");
    }
    if (rule.module !== 'leads' || !rule.enabled || rule.distributionType !== 'roundRobin') {
        throw new Error("New R20 fields are incorrectly set.");
    }
    if (!Array.isArray(rule.triggerEvent) || !rule.triggerEvent.includes('onCreate') || !rule.triggerEvent.includes('onWebCapture')) {
        throw new Error("triggerEvent array is incorrect.");
    }
    if (rule.assignmentTarget?.type !== 'user' || !rule.assignmentTarget.ids[0].equals(new mongoose.Types.ObjectId(TARGET_AGENT_ID))) {
        throw new Error("assignmentTarget is incorrect.");
    }
    const campaignCond = rule.conditions.find(c => c.field === 'campaign');
    if (!campaignCond.value.equals(new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID))) {
        throw new Error("Condition value was not migrated to ObjectId successfully.");
    }
    return true;
}

export async function rollback(db, backupCollectionName) {
    console.log(`Rolling back from ${backupCollectionName}...`);
    
    const collections = await db.listCollections({ name: backupCollectionName }).toArray();
    if (collections.length === 0) throw new Error("Backup collection not found.");

    const backupRule = await db.collection(backupCollectionName).findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    if (!backupRule) throw new Error("Target rule missing from backup. Cannot rollback.");

    const result = await db.collection('distributionrules').replaceOne(
        { _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) },
        backupRule
    );

    if (result.matchedCount !== 1) throw new Error("Failed to restore target document.");
    console.log(`Rollback completed successfully for ${TARGET_RULE_ID}`);
}

async function main() {
    const isDryRun = !process.argv.includes('--execute');
    console.log(`=== R20 DistributionRule Migration ${isDryRun ? '[DRY RUN]' : ''} ===`);

    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        const db = mongoose.connection.db;

        const status = await verifyPreconditions(db);
        if (status === 'ALREADY_MIGRATED') {
            console.log("ALREADY_MIGRATED. Exiting.");
            process.exit(0);
        }

        let backupName = null;
        if (!isDryRun) {
            backupName = await createBackup(db);
        }

        try {
            await runMigration(db, isDryRun);
            if (!isDryRun) await verifyPostMigration(db);
        } catch (migErr) {
            console.error("Migration failed:", migErr.message);
            if (!isDryRun && backupName) {
                await rollback(db, backupName);
            }
            throw migErr;
        }

        console.log('=== Migration Complete ===');
        process.exit(0);
    } catch (e) {
        console.error('Fatal error:', e.message);
        process.exit(1);
    }
}

// Only execute main if run directly, not imported
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
