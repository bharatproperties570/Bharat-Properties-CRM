import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DistributionRule from '../models/DistributionRule.js';

dotenv.config();

const TARGET_RULE_ID = '69b8c7ba81e723b58a586959';
const CAMPAIGN_OBJECT_ID = '698b3312861a01e0b08168ad';
const TARGET_AGENT_ID = '698de200eebee6c7a313dd32';

async function verifyPreconditions(db) {
    console.log('[1/4] Verifying Preconditions...');

    // 1. Verify specific target rule exists
    const rule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    if (!rule) {
        throw new Error(`Target rule ${TARGET_RULE_ID} not found.`);
    }

    // Check if already migrated
    if (rule.module === 'leads' && rule.triggerEvent && rule.triggerEvent.includes('onCreate')) {
        console.log('Rule already appears migrated (ALREADY_MIGRATED).');
        process.exit(0);
    }

    // 2. Verify expected legacy shape
    if (rule.entity !== 'lead' || rule.logic !== 'ROUND_ROBIN' || !rule.isActive || !rule.assignedAgents || !rule.conditions) {
        throw new Error(`Rule ${TARGET_RULE_ID} does not match expected legacy shape. Aborting.`);
    }

    // 3. Verify exact condition shape
    const campaignCondition = rule.conditions.find(c => c.field === 'campaign' && c.value === 'Online');
    if (!campaignCondition) {
        throw new Error(`Rule ${TARGET_RULE_ID} does not contain expected campaign="Online" condition. Aborting.`);
    }

    // 4. Verify Lookup exists
    const lookup = await db.collection('lookups').findOne({ _id: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID) });
    if (!lookup) {
        throw new Error(`Target campaign lookup ${CAMPAIGN_OBJECT_ID} not found in DB.`);
    }

    // 5. Verify User exists
    const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(TARGET_AGENT_ID) });
    if (!user) {
        throw new Error(`Target assignment user ${TARGET_AGENT_ID} not found in DB.`);
    }

    console.log('Preconditions passed.');
}

async function createBackup(db) {
    console.log('[2/4] Creating Backup...');
    const timestamp = Date.now();
    const backupCollectionName = `distributionrules_backup_${timestamp}`;
    
    // Copy all documents to a fresh timestamped backup collection using aggregate $merge
    await db.collection('distributionrules').aggregate([
        { $match: {} },
        { $merge: { into: backupCollectionName } }
    ]).toArray();

    // Verify backup count
    const originalCount = await db.collection('distributionrules').countDocuments();
    const backupCount = await db.collection(backupCollectionName).countDocuments();

    if (originalCount !== backupCount) {
        throw new Error(`Backup verification failed. Original count: ${originalCount}, Backup count: ${backupCount}`);
    }

    console.log(`Backup created successfully: ${backupCollectionName}`);
    return backupCollectionName;
}

async function runMigration(db, isDryRun) {
    console.log(`[3/4] Running Migration ${isDryRun ? '(DRY RUN)' : '(EXECUTE)'}...`);

    // Fetch rule
    const rule = await db.collection('distributionrules').findOne({ _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) });
    
    // Modify condition value
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
    } else {
        const result = await db.collection('distributionrules').updateOne(
            { _id: new mongoose.Types.ObjectId(TARGET_RULE_ID) },
            updateDoc
        );

        if (result.modifiedCount !== 1) {
            throw new Error(`Failed to update rule ${TARGET_RULE_ID}. Modified count: ${result.modifiedCount}`);
        }
        console.log(`Rule ${TARGET_RULE_ID} successfully migrated.`);
    }
}

async function verifyPostMigration(db) {
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

    console.log('Post-migration verification passed.');
}

async function run() {
    const isDryRun = !process.argv.includes('--execute');
    
    console.log(`=== R20 DistributionRule Migration ${isDryRun ? '[DRY RUN]' : ''} ===`);

    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        const db = mongoose.connection.db;

        await verifyPreconditions(db);
        
        if (!isDryRun) {
            await createBackup(db);
        }
        
        await runMigration(db, isDryRun);

        if (!isDryRun) {
            await verifyPostMigration(db);
        }

        console.log('=== Migration Complete ===');
    } catch (e) {
        console.error('Migration failed:', e.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

run();
