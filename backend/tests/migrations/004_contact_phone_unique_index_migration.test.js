import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
    detectActivePhoneDuplicates,
    normalizePhoneForDeduplication,
    runMigration,
    TARGET_INDEX_NAME,
    TARGET_INDEX_SPEC,
    TARGET_INDEX_OPTIONS
} from '../../migrations/004-contact-phone-unique-index-migration.js';
import Lookup from '../../models/Lookup.js';
import Contact from '../../models/Contact.js';

describe('Phase 4 — Migration 004: Contact Phone Unique Index Migration Suite', () => {
    let replset;
    let conn;

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: { count: 1 }
        });
        await replset.waitUntilRunning();
        const uri = replset.getUri();
        conn = await mongoose.connect(uri, { autoIndex: false });

        await Lookup.createCollection();
        await Contact.createCollection();

        const collection = conn.connection.collection('contacts');
        await collection.createIndex({ 'phones.number': 1 }, { name: 'phones.number_1' });
    });

    after(async () => {
        await mongoose.disconnect();
        await replset.stop();
    });

    it('1. Preflight Duplicate Detection: Identifies active duplicate phone numbers and reports contact IDs', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Create 2 active contacts sharing phone '9988776655'
        const c1 = await Contact.create({
            name: 'Active Contact One',
            phones: [{ number: '9988776655', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });
        const c2 = await Contact.create({
            name: 'Active Contact Two',
            phones: [{ number: '9988776655', type: 'Work' }],
            isDeleted: false,
            isMerged: false
        });

        // Create a contact with distinct phone
        await Contact.create({
            name: 'Unique Contact',
            phones: [{ number: '9988776600', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        const scan = await detectActivePhoneDuplicates(conn.connection);
        assert.equal(scan.totalActiveContacts, 3);
        assert.equal(scan.crossContactExactDuplicates.length, 1);
        assert.equal(scan.crossContactExactDuplicates[0]._id, '9988776655');
        assert.equal(scan.crossContactExactDuplicates[0].count, 2);

        const reportedIds = scan.crossContactExactDuplicates[0].contacts.map(c => c.contactId.toString());
        assert.ok(reportedIds.includes(c1._id.toString()));
        assert.ok(reportedIds.includes(c2._id.toString()));
    });

    it('2. Partial Filter Exemption: Soft-deleted and merged contacts with identical phones are excluded from duplicate count', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        const sharedPhone = '9911223344';

        // 1 active contact
        await Contact.create({
            name: 'Active Master',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        // 1 soft-deleted contact
        await Contact.create({
            name: 'Deleted Duplicate',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: true,
            isMerged: false
        });

        // 1 merged contact
        await Contact.create({
            name: 'Merged Duplicate',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: false,
            isMerged: true
        });

        const scan = await detectActivePhoneDuplicates(conn.connection);
        assert.equal(scan.totalActiveContacts, 1);
        assert.equal(scan.crossContactExactDuplicates.length, 0, 'Merged and deleted contacts must not be counted as duplicate groups');
    });

    it('3. Dry-Run Mode: Correctly predicts feasibility and never touches indexes', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Add duplicate contacts
        await Contact.create({ name: 'Dup A', phones: [{ number: '9800011122' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Dup B', phones: [{ number: '9800011122' }], isDeleted: false, isMerged: false });

        const resultInfeasible = await runMigration({ mode: 'dry-run', connection: conn.connection });
        assert.equal(resultInfeasible.status, 'DRY_RUN_COMPLETED');
        assert.equal(resultInfeasible.buildFeasible, false);

        // Verify index was NOT created
        const indexes = await collection.indexes();
        assert.ok(!indexes.some(i => i.name === TARGET_INDEX_NAME), 'Dry run must not create index');

        // Resolve duplicates
        await collection.deleteMany({});
        await Contact.create({ name: 'Clean A', phones: [{ number: '9800011122' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Clean B', phones: [{ number: '9800011133' }], isDeleted: false, isMerged: false });

        const resultFeasible = await runMigration({ mode: 'dry-run', connection: conn.connection });
        assert.equal(resultFeasible.status, 'DRY_RUN_COMPLETED');
        assert.equal(resultFeasible.buildFeasible, true);
    });

    it('4. Execution Mode: Aborts if duplicates exist, builds index and verifies when clean', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Scenario 4A: Duplicates present -> must abort
        await Contact.create({ name: 'Conflict 1', phones: [{ number: '9777711122' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Conflict 2', phones: [{ number: '9777711122' }], isDeleted: false, isMerged: false });

        await assert.rejects(async () => {
            await runMigration({ mode: 'execute', connection: conn.connection });
        }, /Preflight check failed/);

        // Scenario 4B: Clean collection -> builds index
        await collection.deleteMany({});
        await Contact.create({ name: 'Clean 1', phones: [{ number: '9777711122' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Clean 2', phones: [{ number: '9777711133' }], isDeleted: false, isMerged: false });

        const execResult = await runMigration({ mode: 'execute', connection: conn.connection });
        assert.equal(execResult.status, 'EXECUTED_AND_VERIFIED');
        assert.equal(execResult.createdIndex.name, TARGET_INDEX_NAME);
        assert.equal(execResult.createdIndex.unique, true);

        // Verify both legacy index and new index co-exist
        const postIndexes = await collection.indexes();
        assert.ok(postIndexes.some(i => i.name === 'phones.number_1'), 'Legacy index must be preserved');
        assert.ok(postIndexes.some(i => i.name === TARGET_INDEX_NAME), 'New unique index must exist');
    });

    it('5. Runtime Unique Guard: Enforces E11000 duplicate rejection on active contacts; permits merged/deleted bypass', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});
        const phone = '9877700011';

        // Ensure the unique index exists
        const currentIndexes = await collection.indexes();
        if (!currentIndexes.some(i => i.name === TARGET_INDEX_NAME)) {
            await runMigration({ mode: 'execute', connection: conn.connection });
        }

        // Insert first active contact
        await collection.insertOne({
            name: 'Active One',
            phones: [{ number: phone, type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        // Attempting to insert second active contact with same phone must fail with E11000
        await assert.rejects(async () => {
            await collection.insertOne({
                name: 'Active Two Conflict',
                phones: [{ number: phone, type: 'Work' }],
                isDeleted: false,
                isMerged: false
            });
        }, (err) => {
            assert.equal(err.code, 11000, 'Must throw MongoDB duplicate key error code 11000');
            return true;
        });

        // Inserting a soft-deleted contact with same phone is permitted
        const deletedResult = await collection.insertOne({
            name: 'Soft Deleted Contact',
            phones: [{ number: phone, type: 'Personal' }],
            isDeleted: true,
            isMerged: false
        });
        assert.ok(deletedResult.acknowledged);

        // Inserting a merged contact with same phone is permitted
        const mergedResult = await collection.insertOne({
            name: 'Merged Contact',
            phones: [{ number: phone, type: 'Personal' }],
            isDeleted: false,
            isMerged: true
        });
        assert.ok(mergedResult.acknowledged);
    });

    it('6. Rollback Mode: Safely drops target unique index while preserving existing indexes', async () => {
        const collection = conn.connection.collection('contacts');

        // Ensure index exists prior to rollback
        const preIndexes = await collection.indexes();
        if (!preIndexes.some(i => i.name === TARGET_INDEX_NAME)) {
            await collection.deleteMany({});
            await runMigration({ mode: 'execute', connection: conn.connection });
        }

        const rollbackResult = await runMigration({ mode: 'rollback', connection: conn.connection });
        assert.equal(rollbackResult.status, 'ROLLED_BACK');
        assert.equal(rollbackResult.indexDropped, true);

        const currentIndexes = await collection.indexes();
        assert.ok(!currentIndexes.some(i => i.name === TARGET_INDEX_NAME), 'Target index must be dropped');
        assert.ok(currentIndexes.some(i => i.name === 'phones.number_1'), 'Legacy non-unique index must remain intact');
    });

    it('7. Production Safety (Execute): Aborts if targeting production DB without both production flags', async () => {
        const mockProdConn = {
            name: 'bharatproperties1',
            db: {
                databaseName: 'bharatproperties1',
                collection: () => ({
                    indexes: async () => [{ name: '_id_' }]
                })
            }
        };

        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            delete process.env.ALLOW_PRODUCTION_MIGRATION;
            delete process.env.DBA_APPROVED_INDEX_MIGRATION;

            await assert.rejects(async () => {
                await runMigration({ mode: 'execute', connection: mockProdConn });
            }, /FATAL: Production EXECUTE blocked/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
        }
    });

    it('8. Production Safety (Rollback): Aborts if targeting production DB without both production flags', async () => {
        const mockProdConn = {
            name: 'bharatproperties1',
            db: {
                databaseName: 'bharatproperties1',
                collection: () => ({
                    indexes: async () => [{ name: '_id_' }, { name: TARGET_INDEX_NAME }]
                })
            }
        };

        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            delete process.env.ALLOW_PRODUCTION_MIGRATION;
            delete process.env.DBA_APPROVED_INDEX_MIGRATION;

            await assert.rejects(async () => {
                await runMigration({ mode: 'rollback', connection: mockProdConn });
            }, /FATAL: Production ROLLBACK blocked/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
        }
    });

    it('9. Unknown Migration Mode: Rejects unknown mode with fatal error', async () => {
        await assert.rejects(async () => {
            await runMigration({ mode: 'destroy-all', connection: conn.connection });
        }, /FATAL: Unknown migration mode/);
    });

    it('10. Missing Database Identity: Fails closed when connection or dbName is missing', async () => {
        const invalidConn = { name: '', db: { databaseName: '' } };
        await assert.rejects(async () => {
            await runMigration({ mode: 'dry-run', connection: invalidConn });
        }, /Database identity cannot be established/);
    });

    it('11. Exact-String vs Normalized Phone Duplicates: Distinguishes byte collisions from business variants without mutating data', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Contact A has "+91 9811122233"
        // Contact B has "9811122233"
        // Contact C has " 9811122233 "
        // Insert directly via MongoDB collection to simulate unnormalized legacy database records
        // bypassing Mongoose pre-save normalization
        await collection.insertOne({
            name: 'Contact Format A',
            phones: [{ number: '+91 9811122233' }],
            isDeleted: false,
            isMerged: false
        });
        await collection.insertOne({
            name: 'Contact Format B',
            phones: [{ number: '9811122233' }],
            isDeleted: false,
            isMerged: false
        });
        await collection.insertOne({
            name: 'Contact Format C',
            phones: [{ number: ' 9811122233 ' }],
            isDeleted: false,
            isMerged: false
        });

        const scan = await detectActivePhoneDuplicates(conn.connection);

        // Exact string collisions: 0 (all raw strings are unique)
        assert.equal(scan.crossContactExactDuplicates.length, 0, 'Exact strings differ, so 0 index collisions');

        // Business normalized duplicates: 1 group containing 3 distinct contacts
        assert.equal(scan.normalizedVariantsAcrossContacts.length, 1);
        const variantGroup = scan.normalizedVariantsAcrossContacts[0];
        assert.equal(variantGroup.normalizedNumber, '9811122233');
        assert.equal(variantGroup.distinctContactsCount, 3);
        assert.equal(variantGroup.rawNumbers.length, 3);

        // Verify stored data was NOT altered
        const recheckA = await Contact.findOne({ name: 'Contact Format A' });
        assert.equal(recheckA.phones[0].number, '+91 9811122233', 'Raw phone string must not be normalized in database');
    });

    it('12. Missing/Null Lifecycle Flags: Accurately reports active-intent contacts with missing flags', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Active contact with explicit flags
        await Contact.create({
            name: 'Properly Flagged Active',
            phones: [{ number: '9811100001' }],
            isDeleted: false,
            isMerged: false
        });

        // Contact missing isDeleted
        await collection.insertOne({
            name: 'Legacy Contact Missing isDeleted',
            phones: [{ number: '9811100002' }],
            isMerged: false
            // isDeleted omitted
        });

        // Contact with isMerged: null
        await collection.insertOne({
            name: 'Legacy Contact Null isMerged',
            phones: [{ number: '9811100003' }],
            isDeleted: false,
            isMerged: null
        });

        const scan = await detectActivePhoneDuplicates(conn.connection);
        assert.equal(scan.totalActiveContacts, 1, 'Only explicitly boolean false flags count as active in partial filter');
        assert.equal(scan.totalLifecycleFlagGaps, 2, 'Must report 2 documents with missing/null lifecycle flags');
        assert.equal(scan.lifecycleFlagGaps.length, 2);
    });

    it('13. Intra-Contact vs Cross-Contact Duplicates: Intra-contact duplicate does not block index build', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Single contact containing the same phone twice in its phones array
        await Contact.create({
            name: 'Multi-Phone Contact',
            phones: [
                { number: '9811188899', type: 'Personal' },
                { number: '9811188899', type: 'Work' }
            ],
            isDeleted: false,
            isMerged: false
        });

        const scan = await detectActivePhoneDuplicates(conn.connection);
        assert.equal(scan.crossContactExactDuplicates.length, 0, 'No cross-contact duplicate');
        assert.equal(scan.intraContactExactDuplicates.length, 1, 'Must detect intra-contact duplicate');
        assert.equal(scan.intraContactExactDuplicates[0]._id, '9811188899');

        // Dry run should still be feasible because MongoDB multikey allows duplicate values within single doc
        const dryRun = await runMigration({ mode: 'dry-run', connection: conn.connection });
        assert.equal(dryRun.buildFeasible, true, 'Intra-contact duplicate must not block index build');
    });

    it('14. Concurrent Insert Collision: Cleanly aborts with E11000_CONCURRENT_INSERT if collision happens during createIndex', async () => {
        const mockColl = {
            indexes: async () => [{ name: '_id_' }],
            countDocuments: async () => 1,
            find: () => ({ limit: () => ({ toArray: async () => [] }) }),
            aggregate: () => ({ toArray: async () => [] }),
            createIndex: async () => {
                const err = new Error('E11000 duplicate key error collection: bharatproperties1.contacts index: contacts_phones_number_active_unique dup key: { phones.number: "9811199999" }');
                err.code = 11000;
                throw err;
            }
        };

        const mockConn = {
            name: 'test_db',
            db: {
                databaseName: 'test_db',
                collection: () => mockColl
            }
        };

        await assert.rejects(async () => {
            await runMigration({ mode: 'execute', connection: mockConn });
        }, (err) => {
            assert.equal(err.code, 'E11000_CONCURRENT_INSERT');
            assert.ok(err.message.includes('CONTROLLED ABORT'));
            return true;
        });
    });

    it('15. Exact Index Specification Verification: Confirms key, unique, and partialFilterExpression', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        // Clean contacts
        await Contact.create({ name: 'Verified A', phones: [{ number: '9811100091' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Verified B', phones: [{ number: '9811100092' }], isDeleted: false, isMerged: false });

        // Ensure index is dropped first
        try {
            await collection.dropIndex(TARGET_INDEX_NAME);
        } catch (_) {}

        const execResult = await runMigration({ mode: 'execute', connection: conn.connection });
        assert.equal(execResult.status, 'EXECUTED_AND_VERIFIED');

        const index = execResult.createdIndex;
        assert.equal(index.name, TARGET_INDEX_NAME);
        assert.equal(index.unique, true);
        assert.deepEqual(index.key, { 'phones.number': 1 });
        assert.equal(index.partialFilterExpression.isDeleted, false);
        assert.equal(index.partialFilterExpression.isMerged, false);
    });
});
