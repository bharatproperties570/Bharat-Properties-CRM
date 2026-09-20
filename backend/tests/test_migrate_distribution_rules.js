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
                    let matches = d._id.equals(query._id);
                    if (query.entity !== undefined) matches = matches && d.entity === query.entity;
                    if (query.logic !== undefined) matches = matches && d.logic === query.logic;
                    if (query.isActive !== undefined) matches = matches && d.isActive === query.isActive;
                    
                    // Deep compare arrays for assignedAgents and conditions
                    if (query.assignedAgents !== undefined) {
                        matches = matches && JSON.stringify(d.assignedAgents) === JSON.stringify(query.assignedAgents);
                    }
                    if (query.conditions !== undefined) {
                        matches = matches && JSON.stringify(d.conditions) === JSON.stringify(query.conditions);
                    }
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
    console.log("Running Migration Strict Tests...");

    const expectedLegacy = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        entity: 'lead',
        logic: 'ROUND_ROBIN',
        isActive: true,
        assignedAgents: [TARGET_AGENT_ID],
        conditions: [{ field: 'campaign', operator: 'equals', value: 'Online' }]
    };

    // 1. Fully Migrated (ALREADY_MIGRATED)
    const fullyMigrated = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        module: 'leads',
        enabled: true,
        distributionType: 'roundRobin',
        triggerEvent: ['onCreate', 'onWebCapture'],
        assignmentTarget: { type: 'user', ids: [TARGET_AGENT_ID] },
        conditions: [{ field: 'campaign', value: new mongoose.Types.ObjectId(CAMPAIGN_OBJECT_ID) }]
    };
    const dbAlready = new MockDb(fullyMigrated);
    assert.strictEqual((await verifyPreconditions(dbAlready)).status, 'ALREADY_MIGRATED');

    // 2. Partially Migrated (Should fail closed)
    const partiallyMigrated = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        entity: 'lead', // Legacy field still present
        module: 'leads',
        triggerEvent: ['onCreate']
    };
    const dbPartial = new MockDb(partiallyMigrated);
    await assert.rejects(verifyPreconditions(dbPartial), /PARTIALLY_MIGRATED/);

    // 3. Unexpected Mixed State
    const unexpectedState = {
        _id: new mongoose.Types.ObjectId(TARGET_RULE_ID),
        distributionType: 'roundRobin' // no entity, no module
    };
    const dbUnexpected = new MockDb(unexpectedState);
    await assert.rejects(verifyPreconditions(dbUnexpected), /PARTIALLY_MIGRATED/);

    // 4. Concurrent Assigned Agents Modification
    const dbConcurrentAgents = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    assert.strictEqual((await verifyPreconditions(dbConcurrentAgents)).status, 'READY');
    await createBackup(dbConcurrentAgents);
    
    // Simulate concurrent modification AFTER preflight but BEFORE update
    dbConcurrentAgents.collections.distributionrules[0].assignedAgents = ["000000000000000000000000"];
    
    await assert.rejects(runMigration(dbConcurrentAgents, false, expectedLegacy), /Migration update missed or condition changed concurrently/);

    // 5. Concurrent Conditions Modification
    const dbConcurrentConds = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    assert.strictEqual((await verifyPreconditions(dbConcurrentConds)).status, 'READY');
    await createBackup(dbConcurrentConds);
    
    // Simulate concurrent modification
    dbConcurrentConds.collections.distributionrules[0].conditions = [{ field: 'campaign', value: 'Offline' }];
    
    await assert.rejects(runMigration(dbConcurrentConds, false, expectedLegacy), /Migration update missed or condition changed concurrently/);

    // 6. Rollback restoring ONLY target rule
    const existingOtherRule = { _id: new mongoose.Types.ObjectId(), entity: 'lead' };
    const dbRollback = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    dbRollback.collections.distributionrules.push(existingOtherRule);
    
    const backupName = await createBackup(dbRollback);
    
    // Mess up the target rule
    dbRollback.collections.distributionrules[0].entity = 'BROKEN';
    await rollback(dbRollback, backupName);
    
    const restoredTarget = await dbRollback.collection('distributionrules').findOne({_id: expectedLegacy._id});
    assert.strictEqual(restoredTarget.entity, 'lead');
    
    const untouchedOther = await dbRollback.collection('distributionrules').findOne({_id: existingOtherRule._id});
    assert.strictEqual(untouchedOther.entity, 'lead');


    // --- Restored Original Tests ---
    // 7. Successful Migration
    const dbSuccess = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    assert.strictEqual((await verifyPreconditions(dbSuccess)).status, 'READY');
    await createBackup(dbSuccess);
    assert.strictEqual(await runMigration(dbSuccess, false, expectedLegacy), 'MIGRATION_SUCCESS');
    await verifyPostMigration(dbSuccess);

    // 8. Dry Run
    const dbDry = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    assert.strictEqual(await runMigration(dbDry, true, expectedLegacy), 'DRY_RUN_SUCCESS');
    const notMigrated = await dbDry.collection('distributionrules').findOne({_id: expectedLegacy._id});
    assert.strictEqual(notMigrated.entity, 'lead');

    // 9. Wrong Rule ID
    const dbWrongId = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId() });
    await assert.rejects(verifyPreconditions(dbWrongId), /not found/);

    // 10. Missing Target User
    const dbMissingUser = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    dbMissingUser.collections.users = [];
    await assert.rejects(verifyPreconditions(dbMissingUser), /not found in DB/);

    // 11. Missing Campaign Lookup
    const dbMissingLookup = new MockDb({ ...expectedLegacy, _id: new mongoose.Types.ObjectId(expectedLegacy._id) });
    dbMissingLookup.collections.lookups = [];
    await assert.rejects(verifyPreconditions(dbMissingLookup), /not found in DB/);

    // 12. Wrong Campaign Condition
    const dbWrongCondition = new MockDb({ ...expectedLegacy, conditions: [{ field: 'campaign', operator: 'equals', value: 'Offline' }] });
    await assert.rejects(verifyPreconditions(dbWrongCondition), /expected campaign="Online" condition/);
    console.log("Migration Strict Tests Passed.");
}
runTests().catch(console.error);
