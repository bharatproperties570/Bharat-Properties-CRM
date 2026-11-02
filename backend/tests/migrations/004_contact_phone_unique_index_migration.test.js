import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
    detectActivePhoneDuplicates,
    normalizePhoneForDeduplication,
    resolveClusterIdentity,
    verifyOperatorApproval,
    DurableApprovalLedger,
    AUTHORIZED_DBA_APPROVERS,
    consumedApprovalNonces,
    MAX_APPROVAL_TOKEN_AGE_MS,
    sanitizeMongoUri,
    runMigration,
    MIGRATION_NAME,
    PRODUCTION_CLUSTER_ID,
    PRODUCTION_CLUSTER_FINGERPRINTS,
    TARGET_INDEX_NAME,
    TARGET_INDEX_SPEC,
    TARGET_INDEX_OPTIONS
} from '../../migrations/004-contact-phone-unique-index-migration.js';
import {
    generateTestDbaKeyPair,
    signTestDbaApprovalToken,
    createUnauthenticatedLocalToken
} from '../helpers/dba_approval_test_signer.js';
import Lookup from '../../models/Lookup.js';
import Contact from '../../models/Contact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // ─────────────────────────────────────────────────────────────
    // PRODUCTION IDENTITY & OPERATOR APPROVAL HARDENING TESTS
    // ─────────────────────────────────────────────────────────────

    const mockAtlasConn = {
        name: 'bharatproperties1',
        host: 'cluster0.7dehanz.mongodb.net',
        db: {
            databaseName: 'bharatproperties1',
            collection: () => ({
                indexes: async () => [{ name: '_id_' }, { name: 'phones.number_1' }],
                countDocuments: async () => 0,
                find: () => ({ limit: () => ({ toArray: async () => [] }) }),
                aggregate: () => ({ toArray: async () => [] })
            })
        }
    };

    const TEST_DBA_KEYPAIR = generateTestDbaKeyPair();
    const TEST_DBA_PUBLIC_KEY = TEST_DBA_KEYPAIR.publicKeyPem;
    const TEST_DBA_PRIVATE_KEY = TEST_DBA_KEYPAIR.privateKeyPem;

    it('7. Production Safety: Rejects execution if baseline environment flags are missing', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const prevConfirm = process.env.DBA_CONFIRM_MIGRATION;

        try {
            delete process.env.ALLOW_PRODUCTION_MIGRATION;
            delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            delete process.env.DBA_CONFIRM_MIGRATION;

            await assert.rejects(async () => {
                await runMigration({ mode: 'execute', connection: mockAtlasConn });
            }, /FATAL: Production EXECUTE blocked. Requires explicit ALLOW_PRODUCTION_MIGRATION=true AND DBA_APPROVED_INDEX_MIGRATION=true/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            if (prevConfirm) process.env.DBA_CONFIRM_MIGRATION = prevConfirm;
        }
    });

    it('8. Production Safety: Rejects execution when approval flags are present ONLY in .env (missing runtime token)', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const prevConfirm = process.env.DBA_CONFIRM_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            delete process.env.DBA_CONFIRM_MIGRATION;

            await assert.rejects(async () => {
                await runMigration({ mode: 'execute', connection: mockAtlasConn });
            }, /Production EXECUTE requires explicit runtime operator approval/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            if (prevConfirm) process.env.DBA_CONFIRM_MIGRATION = prevConfirm;
        }
    });

    it('8b. Production Safety: Environment variable DBA_CONFIRM_MIGRATION cannot authorize production execution', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const prevConfirm = process.env.DBA_CONFIRM_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            // Token set in process.env MUST be rejected/ignored
            process.env.DBA_CONFIRM_MIGRATION = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Production EXECUTE requires explicit runtime operator approval/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            if (prevConfirm) process.env.DBA_CONFIRM_MIGRATION = prevConfirm;
            else delete process.env.DBA_CONFIRM_MIGRATION;
        }
    });

    it('9. Production Safety: Random locally generated token without authenticated approval is strictly rejected', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Locally generated token (colon-delimited timestamp + random nonce)
            const localToken = createUnauthenticatedLocalToken({ operation: 'EXECUTE' });

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: localToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Unauthenticated approval token rejected\. Locally generated timestamp\/nonce strings do not prove authorized DBA approval/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('9b. Production Safety: Rejects malformed or corrupted envelope format', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: 'not.a.valid.envelope.with.too.many.dots',
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Malformed DBA approval envelope/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('9c. Production Safety: Fails closed when DBA public verification key is missing', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const validToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: validToken
                    // dbaPublicKey intentionally omitted!
                });
            }, /No trusted public verification key configured or available for approver.*Fail closed\./);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('10. Production Safety: Rejects approval when approver identity is missing', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const missingApproverToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: '' // missing approver!
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: missingApproverToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /DBA approval rejected\. Missing approver identity\./);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('10b. Production Safety: Rejects unauthorized approver not in AUTHORIZED_DBA_APPROVERS allowlist', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const unauthorizedToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'unauthorized.intern@bharatproperties.in'
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: unauthorizedToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Unauthorized approver "unauthorized\.intern@bharatproperties\.in"\. Approver is not in the authorized DBA allowlist\./);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('10c. Production Safety: Rejects forged or invalid cryptographic asymmetric signature', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Signed with attacker's unauthorized key pair
            const attackerKeyPair = generateTestDbaKeyPair();
            const forgedToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, attackerKeyPair.privateKeyPem);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: forgedToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY // Checked against authorized public key
                });
            }, /Cryptographic verification failed\. Asymmetric DBA approval signature is invalid, corrupted, or forged\./);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('10d. Production Safety: Rejects approval when purpose or auditRef binding is missing', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Missing purpose
            const missingPurposeToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0],
                purpose: ''
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: missingPurposeToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Missing approval purpose binding/);

            // Missing auditRef
            const missingAuditRefToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0],
                auditRef: ''
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: missingAuditRefToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Missing audit reference binding/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('10e. Production Safety: Strictly rejects attempts to pass signing secrets via CLI or options', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    dbaApprovalSecret: 'prohibited-shared-secret-value'
                });
            }, /Secret parameter detected.*The migration runner accepts ONLY public verification keys/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('11. Production Safety: Rejects mismatched migration name, operation or target cluster', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Mismatched migration name
            const wrongMigrationToken = signTestDbaApprovalToken({
                migration: '003-leads-scoring-migration',
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: wrongMigrationToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Mismatched migration approval/);

            // Mismatched operation (ROLLBACK token for EXECUTE mode)
            const rollbackToken = signTestDbaApprovalToken({
                operation: 'ROLLBACK',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: rollbackToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Stale or mismatched operation approval/);

            // Mismatched cluster
            const wrongClusterToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: 'wrong-unverified-cluster',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: wrongClusterToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Mismatched target cluster approval/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('11b. Production Safety: Rejects expired runtime approval token (> 5 minutes old)', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const expiredToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0],
                issuedAt: Date.now() - (MAX_APPROVAL_TOKEN_AGE_MS + 10000),
                expiresAt: Date.now() - 5000
            }, TEST_DBA_PRIVATE_KEY);

            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    runtimeDbaConfirmation: expiredToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Runtime approval token has expired/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('11c. Production Safety: Durable Replay Prevention: Rejects replayed approval token across process restarts', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        const tempLedgerPath = path.join(os.tmpdir(), `test-ledger-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const durableLedger1 = new DurableApprovalLedger(tempLedgerPath);

            const singleUseToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            // First consumption: passes
            const firstPass = verifyOperatorApproval('execute', clusterInfo, {
                runtimeDbaConfirmation: singleUseToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                ledger: durableLedger1
            });
            assert.equal(firstPass.approved, true);
            assert.equal(firstPass.approver, AUTHORIZED_DBA_APPROVERS[0]);
            assert.equal(firstPass.approvalSource, 'ASYMMETRIC_DBA_SIGNATURE');

            // In-process replay: strictly rejected
            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    runtimeDbaConfirmation: singleUseToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    ledger: durableLedger1
                });
            }, /Replay detected\. Runtime approval ID.*has already been consumed/);

            // Simulated Process Restart: instantiate fresh DurableApprovalLedger reading from the persisted file
            const durableLedgerAfterRestart = new DurableApprovalLedger(tempLedgerPath);

            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    runtimeDbaConfirmation: singleUseToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    ledger: durableLedgerAfterRestart
                });
            }, /Replay detected\. Runtime approval ID.*has already been consumed.*strictly single-use across process restarts/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('11d. Production Safety: Rejects legacy static 3-part strings as runtime approval', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const staticString = `${MIGRATION_NAME}:EXECUTE:${PRODUCTION_CLUSTER_ID}`;
            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    runtimeDbaConfirmation: staticString,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY
                });
            }, /Unauthenticated approval token rejected/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('11e. Durable Ledger Concurrency: Concurrent processes racing on same approval ID result in exactly 1 success and 1 replay abort', async () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-race-test-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);
        const approvalId = `approval-race-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

        function runChild() {
            return new Promise((resolve) => {
                const script = `
                    import('./backend/migrations/004-contact-phone-unique-index-migration.js').then(({ DurableApprovalLedger }) => {
                        const ledger = new DurableApprovalLedger(process.argv[1]);
                        try {
                            ledger.recordConsumedApproval(process.argv[2], { approver: 'dba.lead@bharatproperties.in' });
                            process.exit(0);
                        } catch (err) {
                            process.stderr.write(err.message);
                            process.exit(1);
                        }
                    });
                `;
                const proc = spawn('node', ['--input-type=module', '-e', script, tempLedgerPath, approvalId], {
                    cwd: path.resolve(__dirname, '../../..')
                });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => resolve({ code, stderr }));
            });
        }

        try {
            const results = await Promise.all([runChild(), runChild()]);
            const successCount = results.filter(r => r.code === 0).length;
            const failureCount = results.filter(r => r.code !== 0 && r.stderr.includes('Replay detected')).length;

            assert.equal(successCount, 1, 'Exactly 1 concurrent process must succeed in consuming the single-use token');
            assert.equal(failureCount, 1, 'The competing concurrent process must be rejected with REPLAY_DETECTED');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('11f. Durable Ledger Concurrency: Concurrent processes consuming distinct approval IDs both succeed', async () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-distinct-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);
        const id1 = `approval-dist-1-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const id2 = `approval-dist-2-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

        function runChild(id) {
            return new Promise((resolve) => {
                const script = `
                    import('./backend/migrations/004-contact-phone-unique-index-migration.js').then(({ DurableApprovalLedger }) => {
                        const ledger = new DurableApprovalLedger(process.argv[1]);
                        try {
                            ledger.recordConsumedApproval(process.argv[2], { approver: 'dba.lead@bharatproperties.in' });
                            process.exit(0);
                        } catch (err) {
                            process.stderr.write(err.message);
                            process.exit(1);
                        }
                    });
                `;
                const proc = spawn('node', ['--input-type=module', '-e', script, tempLedgerPath, id], {
                    cwd: path.resolve(__dirname, '../../..')
                });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => resolve({ code, stderr }));
            });
        }

        try {
            const results = await Promise.all([runChild(id1), runChild(id2)]);
            assert.equal(results[0].code, 0);
            assert.equal(results[1].code, 0);

            const lines = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n');
            assert.equal(lines.length, 2, 'Ledger must contain both consumed approval IDs');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('11g. Durable Ledger Integrity: Fails closed on corrupted ledger record to prevent replay bypass', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-corrupt-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);

        try {
            // Write corrupted JSON line
            fs.writeFileSync(tempLedgerPath, '{"approvalId": "valid-prior-id-12345678"}\n{invalid-json-record\n', { mode: 0o600 });

            assert.throws(() => {
                new DurableApprovalLedger(tempLedgerPath);
            }, /Corrupted or malformed record in durable approval ledger.*Fail closed/);
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('11h. Durable Ledger Security: Rejects insecure file permissions (e.g. 0666 / 0777)', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-insecure-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);

        try {
            fs.writeFileSync(tempLedgerPath, '{"approvalId": "valid-prior-id-12345678"}\n', { mode: 0o666 });
            fs.chmodSync(tempLedgerPath, 0o666);

            assert.throws(() => {
                new DurableApprovalLedger(tempLedgerPath);
            }, /Ledger file permission security check failed: Insecure permissions.*Expected strict mode 0600/);
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('11i. Durable Ledger Resilience: Safely cleans and recovers from stale lock left by crashed PID', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-stale-lock-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            // Write orphaned lock from dead process
            fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAt: Date.now() - 30000 }), { mode: 0o600 });

            const ledger = new DurableApprovalLedger(tempLedgerPath);
            const approvalId = `approval-stale-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
            const res = ledger.recordConsumedApproval(approvalId, { approver: 'dba.lead@bharatproperties.in' });

            assert.equal(res.approvalId, approvalId);
            assert.equal(fs.existsSync(lockPath), false, 'Lockfile should be cleared after execution');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    it('12. Production Safety: Production cluster with alternate database name CANNOT bypass protection', async () => {
        const mockAtlasAlternateDbConn = {
            name: 'alternate_dev_db',
            host: 'cluster0.7dehanz.mongodb.net', // Atlas cluster host!
            db: {
                databaseName: 'alternate_dev_db',
                collection: () => ({
                    indexes: async () => [{ name: '_id_' }],
                    countDocuments: async () => 0,
                    find: () => ({ limit: () => ({ toArray: async () => [] }) }),
                    aggregate: () => ({ toArray: async () => [] })
                })
            }
        };

        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            delete process.env.ALLOW_PRODUCTION_MIGRATION;
            delete process.env.DBA_APPROVED_INDEX_MIGRATION;

            // Must still fail closed as a production cluster regardless of database name
            await assert.rejects(async () => {
                await runMigration({ mode: 'execute', connection: mockAtlasAlternateDbConn });
            }, /Production EXECUTE blocked/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
        }
    });

    it('13. Production Safety: Non-production cluster with production database name is safely handled', async () => {
        const mockLocalWithProdDbName = {
            name: 'bharatproperties1',
            host: '127.0.0.1', // Local test host
            db: {
                databaseName: 'bharatproperties1',
                collection: () => ({
                    indexes: async () => [{ name: '_id_' }],
                    countDocuments: async () => 0,
                    find: () => ({ limit: () => ({ toArray: async () => [] }) }),
                    aggregate: () => ({ toArray: async () => [] })
                })
            }
        };

        // Without allowNonProdSimulatedProd flag -> safety guard rejects to prevent accidental confusion
        await assert.rejects(async () => {
            await runMigration({ mode: 'execute', connection: mockLocalWithProdDbName });
        }, /SAFETY GUARD: Connected to non-production host.*with production database name/);

        // With explicit dev simulation flag -> safely allowed for local testing
        const clusterIdentity = await resolveClusterIdentity(mockLocalWithProdDbName);
        assert.equal(clusterIdentity.clusterType, 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME');
        assert.equal(clusterIdentity.isProductionCluster, false);

        const approval = verifyOperatorApproval('execute', clusterIdentity, { allowNonProdSimulatedProd: true });
        assert.equal(approval.approved, true);
        assert.equal(approval.approvalSource, 'LOCAL_DEV_SIMULATION_FLAG');
    });

    it('14. Unknown Cluster Identity: Fails closed immediately on unverified host', async () => {
        const mockUnknownConn = {
            name: 'some_db',
            host: '192.168.1.150', // Remote unverified IP
            db: {
                databaseName: 'some_db',
                collection: () => ({ indexes: async () => [] })
            }
        };

        await assert.rejects(async () => {
            await runMigration({ mode: 'execute', connection: mockUnknownConn });
        }, /Connected host\(s\).*do not match verified production allowlist or local test fingerprints\. Fail closed\./);
    });

    it('15. Credential Sanitization: Connection strings, passwords, and secrets are never exposed in logs or errors', () => {
        const rawUri = 'mongodb+srv://adminUser:SuperSecretPassword123@cluster0.7dehanz.mongodb.net/bharatproperties1';
        const sanitized = sanitizeMongoUri(rawUri);

        assert.ok(!sanitized.includes('SuperSecretPassword123'), 'Raw password must be stripped');
        assert.ok(sanitized.includes('adminUser:***@'), 'Credentials must be masked');
    });

    it('16. Valid Operator Approval: Passes verification when cryptographically signed by authorized DBA with bound parameters', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const tempLedgerPath = path.join(os.tmpdir(), `test-ledger-16-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const testLedger = new DurableApprovalLedger(tempLedgerPath);

            // Valid EXECUTE signed by authorized Lead DBA
            const executeToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                purpose: 'SCHEDULED_UNIQUE_PHONE_INDEX_CREATION',
                auditRef: 'RFC-2026-004-EXECUTE'
            }, TEST_DBA_PRIVATE_KEY);

            const approvalExecute = verifyOperatorApproval('execute', clusterInfo, {
                runtimeDbaConfirmation: executeToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                ledger: testLedger
            });
            assert.equal(approvalExecute.approved, true);
            assert.equal(approvalExecute.approvalSource, 'ASYMMETRIC_DBA_SIGNATURE');
            assert.equal(approvalExecute.approver, 'dba.lead@bharatproperties.in');
            assert.equal(approvalExecute.confirmedOperation, 'EXECUTE');
            assert.equal(approvalExecute.clusterId, PRODUCTION_CLUSTER_ID);
            assert.equal(approvalExecute.purpose, 'SCHEDULED_UNIQUE_PHONE_INDEX_CREATION');
            assert.equal(approvalExecute.auditRef, 'RFC-2026-004-EXECUTE');

            // Valid ROLLBACK signed by authorized Chief Architect
            const rollbackToken = signTestDbaApprovalToken({
                operation: 'ROLLBACK',
                approver: 'chief.architect@bharatproperties.in',
                purpose: 'EMERGENCY_INDEX_REMOVAL',
                auditRef: 'INCIDENT-2026-004-ROLLBACK'
            }, TEST_DBA_PRIVATE_KEY);

            const approvalRollback = verifyOperatorApproval('rollback', clusterInfo, {
                runtimeDbaConfirmation: rollbackToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                ledger: testLedger
            });
            assert.equal(approvalRollback.approved, true);
            assert.equal(approvalRollback.approvalSource, 'ASYMMETRIC_DBA_SIGNATURE');
            assert.equal(approvalRollback.approver, 'chief.architect@bharatproperties.in');
            assert.equal(approvalRollback.confirmedOperation, 'ROLLBACK');
            assert.equal(approvalRollback.clusterId, PRODUCTION_CLUSTER_ID);
            assert.equal(approvalRollback.purpose, 'EMERGENCY_INDEX_REMOVAL');
            assert.equal(approvalRollback.auditRef, 'INCIDENT-2026-004-ROLLBACK');
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });



    it('17. Unknown Migration Mode: Rejects unknown mode with fatal error', async () => {
        await assert.rejects(async () => {
            await runMigration({ mode: 'destroy-all', connection: conn.connection });
        }, /FATAL: Unknown migration mode/);
    });

    it('18. Missing Database Identity: Fails closed when connection or dbName is missing', async () => {
        const invalidConn = { name: '', db: { databaseName: '' } };
        await assert.rejects(async () => {
            await runMigration({ mode: 'dry-run', connection: invalidConn });
        }, /Database or cluster host identity cannot be established/);
    });

    it('19. Exact-String vs Normalized Phone Duplicates: Distinguishes byte collisions from business variants without mutating data', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

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

    it('20. Missing/Null Lifecycle Flags: Accurately reports active-intent contacts with missing flags', async () => {
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

    it('21. Intra-Contact vs Cross-Contact Duplicates: Intra-contact duplicate does not block index build', async () => {
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

        const dryRun = await runMigration({ mode: 'dry-run', connection: conn.connection });
        assert.equal(dryRun.buildFeasible, true, 'Intra-contact duplicate must not block index build');
    });

    it('22. Concurrent Insert Collision: Cleanly aborts with E11000_CONCURRENT_INSERT if collision happens during createIndex', async () => {
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
            host: '127.0.0.1',
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

    it('23. Exact Index Specification Verification: Confirms key, unique, and partialFilterExpression', async () => {
        const collection = conn.connection.collection('contacts');
        await collection.deleteMany({});

        await Contact.create({ name: 'Verified A', phones: [{ number: '9811100091' }], isDeleted: false, isMerged: false });
        await Contact.create({ name: 'Verified B', phones: [{ number: '9811100092' }], isDeleted: false, isMerged: false });

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
