import assert from 'assert';
import mongoose from 'mongoose';
import { 
    TARGET_RULE_ID, CAMPAIGN_OBJECT_ID, TARGET_AGENT_ID,
    verifyPreconditions, runMigration, verifyPostMigration, rollback, createBackup
} from '../scripts/migrate_distribution_rules.js';

class MockDb {
    constructor(initialRule) {
        this.collections = {
            distributionrules: [initialRule],
            lookups: [{ _id: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID) }],
            users: [{ _id: new mongoose.Types.ObjectId(TARGET_AGENT_ID) }]
        };
        this.backupCollections = {};
    }

    collection(name) {
        if (!this.collections[name]) this.collections[name] = [];
        const col = this.collections[name];
        
        return {
            findOne: async (query) => {
                return col.find(d => d._id.equals(query._id)) || null;
            },
            countDocuments: async () => col.length,
            updateOne: async (query, update) => {
                let matchedCount = 0;
                let modifiedCount = 0;
                const docIndex = col.findIndex(d => {
                    // simulate query match
                    let matches = d._id.equals(query._id);
                    if (query.entity) matches = matches && d.entity === query.entity;
                    if (query.logic) matches = matches && d.logic === query.logic;
                    if (query.isActive !== undefined) matches = matches && d.isActive === query.isActive;
                    return matches;
                });
                
                if (docIndex > -1) {
                    matchedCount = 1;
                    modifiedCount = 1;
                    const doc = col[docIndex];
                    if (update.$set) Object.assign(doc, update.$set);
                    if (update.$unset) Object.keys(update.$unset).forEach(k => delete doc[k]);
                }
                return { matchedCount, modifiedCount };
            },
            replaceOne: async (query, replace) => {
                const docIndex = col.findIndex(d => d._id.equals(query._id));
                if (docIndex > -1) {
                    col[docIndex] = { ...replace };
                    return { matchedCount: 1 };
                }
                return { matchedCount: 0 };
            },
            aggregate: (pipeline) => {
                return {
                    toArray: async () => {
                        const mergeStep = pipeline.find(p => p.$merge);
                        if (mergeStep) {
                            const dest = mergeStep.$merge.into;
                            this.collections[dest] = [...col.map(d => ({...d}))];
                        }
                        return [];
                    }
                };
            }
        };
    }

    listCollections(query) {
        return {
            toArray: async () => {
                return Object.keys(this.collections)
                    .filter(k => k === query.name)
                    .map(name => ({ name }));
            }
        };
    }
}

async function runTests() {
    console.log("Running Migration Tests...");

    const expectedLegacy = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        entity: 'lead',
        logic: 'ROUND_ROBIN',
        isActive: true,
        assignedAgents: [TARGET_AGENT_ID],
        conditions: [{ field: 'campaign', value: 'Online' }]
    };

    // --- 1. Successful Migration ---
    const dbSuccess = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    // Preflight
    assert.strictEqual(await verifyPreconditions(dbSuccess), 'READY');
    
    // Backup
    const backupName = await createBackup(dbSuccess);
    assert(backupName.startsWith('distributionrules_backup_'));
    
    // Execute
    assert.strictEqual(await runMigration(dbSuccess, false), 'MIGRATION_SUCCESS');
    
    // Post-migration Verify
    await verifyPostMigration(dbSuccess);
    
    // Inspect specific fields
    const migrated = await dbSuccess.collection('distributionrules').findOne({_id: expectedLegacy._id});
    assert.strictEqual(migrated.module, 'leads');
    assert.strictEqual(migrated.entity, undefined);
    assert.deepStrictEqual(migrated.triggerEvent, ["onCreate", "onWebCapture"]);
    assert.strictEqual(migrated.conditions[0].value.toString(), CAMPAIGN_OBJECT_ID);
    
    // Rollback verify
    await rollback(dbSuccess, backupName);
    const rolledBack = await dbSuccess.collection('distributionrules').findOne({_id: expectedLegacy._id});
    assert.strictEqual(rolledBack.entity, 'lead');
    assert.strictEqual(rolledBack.module, undefined);
    assert.strictEqual(rolledBack.conditions[0].value, 'Online');

    // --- 2. Dry Run ---
    const dbDry = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    assert.strictEqual(await runMigration(dbDry, true), 'DRY_RUN_SUCCESS');
    const notMigrated = await dbDry.collection('distributionrules').findOne({_id: expectedLegacy._id});
    assert.strictEqual(notMigrated.entity, 'lead', 'Dry run should not mutate');

    // --- 3. Already Migrated ---
    const alreadyMigratedData = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        module: 'leads',
        triggerEvent: ["onCreate", "onWebCapture"]
    };
    const dbAlready = new MockDb(alreadyMigratedData);
    assert.strictEqual(await verifyPreconditions(dbAlready), 'ALREADY_MIGRATED');

    // --- 4. Partial Migration / Wrong Shape ---
    const dbWrongShape = new MockDb({ ...expectedLegacy, entity: 'deal' });
    await assert.rejects(verifyPreconditions(dbWrongShape), /does not match expected legacy shape/);

    // --- 5. Wrong Rule ID ---
    const dbWrongId = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId() });
    await assert.rejects(verifyPreconditions(dbWrongId), /not found/);

    // --- 6. Missing Target User ---
    const dbMissingUser = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    dbMissingUser.collections.users = []; // Empty users
    await assert.rejects(verifyPreconditions(dbMissingUser), /Target assignment user .* not found/);

    // --- 7. Missing Campaign Lookup ---
    const dbMissingLookup = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    dbMissingLookup.collections.lookups = [];
    await assert.rejects(verifyPreconditions(dbMissingLookup), /Target campaign lookup .* not found/);

    // --- 8. Wrong Campaign Condition ---
    const dbWrongCondition = new MockDb({ ...expectedLegacy, conditions: [{ field: 'campaign', value: 'Offline' }] });
    await assert.rejects(verifyPreconditions(dbWrongCondition), /does not contain expected campaign="Online" condition/);

    console.log("Migration Tests Passed.");
}

runTests().catch(console.error);
