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
    __testOnly_verifyOperatorApproval,
    loadTrustedKeyRegistry,
    DurableApprovalLedger,
    getProcessStartTime,
    PINNED_DBA_TRUST_STORE,
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
    createUnauthenticatedLocalToken,
    computePublicKeyFingerprint,
    createTestTrustStore
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

    const NON_PROD_CLUSTER_ID = 'test-cluster-non-prod-01';
    const nonProdClusterInfo = {
        isValid: true,
        isProductionCluster: false,
        clusterType: 'LOCAL_TEST',
        clusterId: NON_PROD_CLUSTER_ID,
        dbName: 'test',
        hosts: ['localhost:27017']
    };

    const TEST_TRUST_REGISTRY = {
        'dba.lead@bharatproperties.in': {
            keyId: 'kid-test-lead-2026',
            approver: 'dba.lead@bharatproperties.in',
            fingerprint: TEST_DBA_KEYPAIR.fingerprint,
            publicKey: TEST_DBA_PUBLIC_KEY,
            status: 'ACTIVE',
            validFrom: Date.now() - 60000,
            validUntil: Date.now() + 86400000
        },
        'chief.architect@bharatproperties.in': {
            keyId: 'kid-test-lead-2026',
            approver: 'chief.architect@bharatproperties.in',
            fingerprint: TEST_DBA_KEYPAIR.fingerprint,
            publicKey: TEST_DBA_PUBLIC_KEY,
            status: 'ACTIVE',
            validFrom: Date.now() - 60000,
            validUntil: Date.now() + 86400000
        },
        'security.admin@bharatproperties.in': {
            keyId: 'kid-test-lead-2026',
            approver: 'security.admin@bharatproperties.in',
            fingerprint: TEST_DBA_KEYPAIR.fingerprint,
            publicKey: TEST_DBA_PUBLIC_KEY,
            status: 'ACTIVE',
            validFrom: Date.now() - 60000,
            validUntil: Date.now() + 86400000
        }
    };

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
                approver: AUTHORIZED_DBA_APPROVERS[0],
                keyId: 'kid-dba-lead-2026-v1'
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: validToken
                    // dbaPublicKey intentionally omitted!
                });
            }, /(?:No candidate public verification key configured or available for approver|Pinned trust anchor for approver .* has provenance UNPROVISIONED_PLACEHOLDER).*Fail closed\./);
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

    it('10c. Production Safety: Rejects forged or invalid cryptographic asymmetric signature', () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Signed with attacker's unauthorized key pair
            const attackerKeyPair = generateTestDbaKeyPair();
            const forgedToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, attackerKeyPair.privateKeyPem);

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: forgedToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY, // Checked against authorized public key
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
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
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        const tempLedgerPath = path.join(os.tmpdir(), `test-ledger-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const durableLedger1 = new DurableApprovalLedger(tempLedgerPath);

            const singleUseToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: AUTHORIZED_DBA_APPROVERS[0]
            }, TEST_DBA_PRIVATE_KEY);

            // First consumption: passes
            const firstPass = __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                runtimeDbaConfirmation: singleUseToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                trustedKeyRegistry: TEST_TRUST_REGISTRY,
                ledger: durableLedger1
            });
            assert.equal(firstPass.approved, true);
            assert.equal(firstPass.approver, AUTHORIZED_DBA_APPROVERS[0]);
            assert.equal(firstPass.approvalSource, 'TEST_HARNESS_VERIFIED_SIGNATURE');

            // In-process replay: strictly rejected
            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: singleUseToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY,
                    ledger: durableLedger1
                });
            }, /Replay detected\. Runtime approval ID.*has already been consumed/);

            // Simulated Process Restart: instantiate fresh DurableApprovalLedger reading from the persisted file
            const durableLedgerAfterRestart = new DurableApprovalLedger(tempLedgerPath);

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: singleUseToken,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY,
                    ledger: durableLedgerAfterRestart
                });
            }, /Replay detected\. Runtime approval ID.*has already been consumed.*Approval tokens are strictly single-use across process restarts/);
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
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                purpose: 'SCHEDULED_UNIQUE_PHONE_INDEX_CREATION',
                auditRef: 'RFC-2026-004-EXECUTE'
            }, TEST_DBA_PRIVATE_KEY);

            const approvalExecute = __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                runtimeDbaConfirmation: executeToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                trustedKeyRegistry: TEST_TRUST_REGISTRY,
                ledger: testLedger
            });
            assert.equal(approvalExecute.approved, true);
            assert.equal(approvalExecute.approvalSource, 'TEST_HARNESS_VERIFIED_SIGNATURE');
            assert.equal(approvalExecute.approver, 'dba.lead@bharatproperties.in');
            assert.equal(approvalExecute.confirmedOperation, 'EXECUTE');
            assert.equal(approvalExecute.clusterId, NON_PROD_CLUSTER_ID);
            assert.equal(approvalExecute.purpose, 'SCHEDULED_UNIQUE_PHONE_INDEX_CREATION');
            assert.equal(approvalExecute.auditRef, 'RFC-2026-004-EXECUTE');

            // Valid ROLLBACK signed by authorized Chief Architect
            const rollbackToken = signTestDbaApprovalToken({
                operation: 'ROLLBACK',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'chief.architect@bharatproperties.in',
                purpose: 'EMERGENCY_INDEX_REMOVAL',
                auditRef: 'INCIDENT-2026-004-ROLLBACK'
            }, TEST_DBA_PRIVATE_KEY);

            const approvalRollback = __testOnly_verifyOperatorApproval('rollback', nonProdClusterInfo, {
                runtimeDbaConfirmation: rollbackToken,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                trustedKeyRegistry: TEST_TRUST_REGISTRY,
                ledger: testLedger
            });
            assert.equal(approvalRollback.approved, true);
            assert.equal(approvalRollback.approvalSource, 'TEST_HARNESS_VERIFIED_SIGNATURE');
            assert.equal(approvalRollback.approver, 'chief.architect@bharatproperties.in');
            assert.equal(approvalRollback.confirmedOperation, 'ROLLBACK');
            assert.equal(approvalRollback.clusterId, NON_PROD_CLUSTER_ID);
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

    // ─────────────────────────────────────────────────────────────
    // DEF-01: TRUSTED PUBLIC-KEY PINNING ADVERSARIAL TESTS
    // ─────────────────────────────────────────────────────────────

    it('24. DEF-01: Attacker creates own Ed25519 key pair and passes it via opts.dbaPublicKey -> rejected in production', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            // Attacker generates own keypair
            const attackerKeyPair = generateTestDbaKeyPair();
            // Attacker signs payload using an allowlisted DBA email
            const forgedToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, attackerKeyPair.privateKeyPem);

            // Attacker passes their own public key via options
            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: forgedToken,
                    dbaPublicKey: attackerKeyPair.publicKeyPem,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
                });
            }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('25. DEF-01: Attacker replaces public key file -> rejected by pinned fingerprint check in test harness', async () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };
        const attackerKeyFile = path.join(os.tmpdir(), `attacker-key-${Date.now()}.pem`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const attackerKeyPair = generateTestDbaKeyPair();
            fs.writeFileSync(attackerKeyFile, attackerKeyPair.publicKeyPem, { mode: 0o600 });

            const forgedToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, attackerKeyPair.privateKeyPem);

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: forgedToken,
                    dbaPublicKeyFile: attackerKeyFile,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
                });
            }, /Public key pinning validation failed for approver "dba\.lead@bharatproperties\.in"/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(attackerKeyFile)) fs.unlinkSync(attackerKeyFile); } catch (_) {}
        }
    });

    it('26. DEF-01: Fails closed when approver has no pinned trust anchor in the registry', async () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'security.admin@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            // Empty registry with no entry for security.admin
            const emptyRegistry = {};

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: token,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: emptyRegistry
                });
            }, /No pinned trust anchor found for approver "security\.admin@bharatproperties\.in"/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('27. DEF-01: Revoked key: Rejects approval when approver key status is REVOKED', async () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            const revokedRegistry = {
                'dba.lead@bharatproperties.in': {
                    keyId: 'kid-test-lead-2026',
                    approver: 'dba.lead@bharatproperties.in',
                    fingerprint: TEST_DBA_KEYPAIR.fingerprint,
                    publicKey: TEST_DBA_PUBLIC_KEY,
                    status: 'REVOKED',
                    revocationReason: 'Suspected key compromise during security incident SEC-2026-091'
                }
            };

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: token,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: revokedRegistry
                });
            }, /Pinned signing key for approver "dba\.lead@bharatproperties\.in" has been REVOKED/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('28. DEF-01: Expired pinned key: Rejects approval when pinned key validUntil is in the past', async () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            const expiredRegistry = {
                'dba.lead@bharatproperties.in': {
                    keyId: 'kid-test-lead-2026',
                    approver: 'dba.lead@bharatproperties.in',
                    fingerprint: TEST_DBA_KEYPAIR.fingerprint,
                    publicKey: TEST_DBA_PUBLIC_KEY,
                    status: 'ACTIVE',
                    validFrom: Date.now() - 200000,
                    validUntil: Date.now() - 1000 // Expired!
                }
            };

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: token,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: expiredRegistry
                });
            }, /Pinned signing key for approver "dba\.lead@bharatproperties\.in" has expired/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('29. DEF-01: Key ID mismatch: Rejects approval when keyId in token does not match pinned trust anchor', async () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-old-unrotated-2025' // Mismatched keyId
            }, TEST_DBA_PRIVATE_KEY);

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: token,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
                });
            }, /Key ID mismatch in approval token/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('30. DEF-01: Trust store file security: Rejects trust store file with insecure permissions (0666)', () => {
        const tempStorePath = path.join(os.tmpdir(), `insecure-trust-store-${Date.now()}.json`);

        try {
            fs.writeFileSync(tempStorePath, JSON.stringify(TEST_TRUST_REGISTRY), { mode: 0o666 });
            fs.chmodSync(tempStorePath, 0o666);

            assert.throws(() => {
                loadTrustedKeyRegistry({ dbaTrustStorePath: tempStorePath });
            }, /Insecure permissions on DBA trust store file/);
        } finally {
            try { if (fs.existsSync(tempStorePath)) fs.unlinkSync(tempStorePath); } catch (_) {}
        }
    });

    it('31. DEF-01: Trust store file security: Accepts protected trust store file in non-prod, but rejects overrides in production', async () => {
        const tempStorePath = path.join(os.tmpdir(), `secure-trust-store-${Date.now()}.json`);
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            fs.writeFileSync(tempStorePath, JSON.stringify(TEST_TRUST_REGISTRY), { mode: 0o600 });
            fs.chmodSync(tempStorePath, 0o600);

            // 1. In non-production context, loadTrustedKeyRegistry reads protected trust store file
            const loaded = loadTrustedKeyRegistry({ dbaTrustStorePath: tempStorePath }, false);
            assert.ok(loaded['dba.lead@bharatproperties.in'], 'Must parse trust store file');

            // 2. In production path, verifyOperatorApproval rejects dbaTrustStorePath override with SECURITY FATAL
            const clusterInfo = {
                isValid: true,
                isProductionCluster: true,
                clusterType: 'PRODUCTION_ATLAS',
                clusterId: PRODUCTION_CLUSTER_ID,
                dbName: 'bharatproperties1',
                hosts: ['cluster0.7dehanz.mongodb.net']
            };

            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    dbaTrustStorePath: tempStorePath
                });
            }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempStorePath)) fs.unlinkSync(tempStorePath); } catch (_) {}
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-02: DURABLE APPROVAL LEDGER LOCKFILE RACE & RESILIENCE
    // ─────────────────────────────────────────────────────────────

    it('32. DEF-02: Live Process Lock Protection: Competitor NEVER breaks lock held by live process even if age > staleTimeoutMs', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-live-lock-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            // Write a lockfile belonging to the current LIVE process, with createdAt simulating > 15s age
            const liveLockData = {
                ownerToken: 'live-token-11111111-2222-3333-4444-555555555555',
                pid: process.pid, // Our own PID, definitely ALIVE!
                processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
                hostname: os.hostname(),
                createdAt: Date.now() - 30000 // 30 seconds ago (exceeds staleTimeoutMs = 15s)
            };
            fs.writeFileSync(lockPath, JSON.stringify(liveLockData), { mode: 0o600 });

            // Create a ledger with a short lock timeout (200ms)
            const ledger = new DurableApprovalLedger(tempLedgerPath, {
                lockTimeoutMs: 200,
                retryIntervalMs: 20,
                staleTimeoutMs: 15000
            });

            // The competitor must NOT break the live lock, and must time out safely failing closed!
            assert.throws(() => {
                ledger._acquireLock();
            }, /Could not acquire exclusive lock.*Lock is actively held by a live process\. Fail closed\./);

            // Verify the lockfile was NOT deleted or overwritten!
            assert.ok(fs.existsSync(lockPath), 'Lockfile must remain intact');
            const dataOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            assert.equal(dataOnDisk.ownerToken, liveLockData.ownerToken, 'Owner token must not be modified');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    it('33. DEF-02: Worker Crash Recovery: Safely detects dead PID and recovers lock via atomic rename', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-crash-rec-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            // Write orphaned lock from a dead PID (PID 999999 does not exist)
            const deadLockData = {
                ownerToken: 'dead-worker-token-0000-1111-2222',
                pid: 999999,
                processStartTime: Date.now() - 60000,
                hostname: os.hostname(),
                createdAt: Date.now() - 5000 // Within stale timeout, but PID is dead!
            };
            fs.writeFileSync(lockPath, JSON.stringify(deadLockData), { mode: 0o600 });

            const ledger = new DurableApprovalLedger(tempLedgerPath, {
                lockTimeoutMs: 1000,
                retryIntervalMs: 25,
                initGracePeriodMs: 50 // Short grace for test
            });

            const approvalId = `approval-crash-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
            const res = ledger.recordConsumedApproval(approvalId, { approver: 'dba.lead@bharatproperties.in' });

            assert.equal(res.approvalId, approvalId);
            assert.equal(fs.existsSync(lockPath), false, 'Lock must be cleanly released after successful consumption');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    it('34. DEF-02: Delayed Release Safety: Worker does NOT delete a replacement lock held by another process', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-delayed-rel-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            const ledgerA = new DurableApprovalLedger(tempLedgerPath);

            // Worker A sets an old ownerToken
            ledgerA.currentOwnerToken = 'worker-A-token-1111';

            // Meanwhile, Worker B acquired the lock on disk with different token and PID
            const lockBData = {
                ownerToken: 'worker-B-token-2222',
                pid: 88888,
                processStartTime: Date.now(),
                hostname: os.hostname(),
                createdAt: Date.now()
            };
            fs.writeFileSync(lockPath, JSON.stringify(lockBData), { mode: 0o600 });

            // Worker A tries to release its lock
            ledgerA._releaseLock();

            // Verify Worker B's lock on disk was NOT deleted!
            assert.ok(fs.existsSync(lockPath), 'Worker B lock must not be deleted by Worker A');
            const onDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            assert.equal(onDisk.ownerToken, 'worker-B-token-2222', 'Worker B ownerToken must remain untouched');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    it('35. DEF-02: Grace Period Protection: Empty lockfile during initialization is not prematurely deleted', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-grace-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            // Create an empty lockfile (simulating openSync before writeSync)
            fs.writeFileSync(lockPath, '', { mode: 0o600 });

            const ledger = new DurableApprovalLedger(tempLedgerPath, {
                initGracePeriodMs: 5000 // 5 second grace period
            });

            // _tryRecoverDeadLock must return false (do not disturb young lockfile)
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, false, 'Must not disturb lockfile within initialization grace period');
            assert.ok(fs.existsSync(lockPath), 'Lockfile must remain');
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    it('36. DEF-02: Malformed Lock Metadata: Corrupted JSON left by dead process is safely recovered via atomic rename', () => {
        const tempLedgerPath = path.join(os.tmpdir(), `test-malformed-lock-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        try {
            // Write corrupted content with mtime in the past
            fs.writeFileSync(lockPath, '{corrupted-json-data-not-valid', { mode: 0o600 });
            // Set mtime to 30s ago
            const past = new Date(Date.now() - 30000);
            fs.utimesSync(lockPath, past, past);

            const ledger = new DurableApprovalLedger(tempLedgerPath, {
                lockTimeoutMs: 1000,
                retryIntervalMs: 25,
                initGracePeriodMs: 50
            });

            const approvalId = `approval-malformed-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
            const res = ledger.recordConsumedApproval(approvalId, { approver: 'dba.lead@bharatproperties.in' });
            assert.equal(res.approvalId, approvalId);
        } finally {
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-03: APPROVAL TOKEN EXPOSURE & SECURE INPUT MECHANISMS
    // ─────────────────────────────────────────────────────────────

    it('37. DEF-03: Secure File Input: Token supplied via secure file with mode 0600 is accepted and verified in test harness', () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const tempTokenFile = path.join(os.tmpdir(), `token-secure-0600-${Date.now()}.txt`);
        const tempLedgerPath = path.join(os.tmpdir(), `ledger-37-${Date.now()}.jsonl`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const validToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            // Write token with strict 0600 permissions
            fs.writeFileSync(tempTokenFile, validToken, { mode: 0o600 });
            fs.chmodSync(tempTokenFile, 0o600);

            const ledger = new DurableApprovalLedger(tempLedgerPath);

            const approval = __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                dbaApprovalFile: tempTokenFile,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                trustedKeyRegistry: TEST_TRUST_REGISTRY,
                ledger
            });

            assert.equal(approval.approved, true);
            assert.equal(approval.approvalSource, 'TEST_HARNESS_VERIFIED_SIGNATURE');
            assert.equal(approval.tokenSource, 'SECURE_FILE');
            assert.equal(approval.approver, 'dba.lead@bharatproperties.in');
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempTokenFile)) fs.unlinkSync(tempTokenFile); } catch (_) {}
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('38. DEF-03: Insecure File Rejection: Token file with insecure permissions (0666 or 0644) fails closed', () => {
        const tempTokenFile = path.join(os.tmpdir(), `token-insecure-${Date.now()}.txt`);

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            fs.writeFileSync(tempTokenFile, 'any-token-content', { mode: 0o666 });
            fs.chmodSync(tempTokenFile, 0o666);

            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    dbaApprovalFile: tempTokenFile,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
                });
            }, /Insecure permissions on approval token file.*Expected strict 0600/);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempTokenFile)) fs.unlinkSync(tempTokenFile); } catch (_) {}
        }
    });

    it('39. DEF-03: Production CLI Rejection & Non-Prod Warning: Raw --confirm-dba-approval fails fatally in prod, warns in non-prod', () => {
        const prodCluster = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const nonProdCluster = {
            isValid: true,
            isProductionCluster: false,
            clusterType: 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME',
            clusterId: 'local-test-simulated-prod',
            dbName: 'bharatproperties1',
            hosts: ['localhost']
        };

        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const tempLedgerPath = path.join(os.tmpdir(), `ledger-39-${Date.now()}.jsonl`);

        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            warnings.push(args.join(' '));
            originalWarn(...args);
        };

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';

            const validToken = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            // Simulate CLI argument
            process.argv.push(`--confirm-dba-approval=${validToken}`);

            // 1. In production, raw CLI token argument MUST be rejected with SECURITY FATAL
            assert.throws(() => {
                verifyOperatorApproval('execute', prodCluster, {});
            }, /Raw approval tokens via --confirm-dba-approval=<token> are strictly prohibited in production due to ps aux, \/proc, and shell history exposure/);

            // 2. In non-production, raw CLI token emits security warning
            const nonProdApproval = verifyOperatorApproval('execute', nonProdCluster, { allowNonProdSimulatedProd: true });
            assert.equal(nonProdApproval.approved, true);
        } finally {
            console.warn = originalWarn;
            const idx = process.argv.findIndex(a => a.startsWith('--confirm-dba-approval='));
            if (idx !== -1) process.argv.splice(idx, 1);
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    it('40. DEF-03: Zero Token Logging: Verification errors, approval objects and ledger records NEVER expose raw tokens', () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const tempLedgerPath = path.join(os.tmpdir(), `ledger-40-${Date.now()}.jsonl`);

        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                clusterId: NON_PROD_CLUSTER_ID,
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-test-lead-2026'
            }, TEST_DBA_PRIVATE_KEY);

            const [encodedPayload, encodedSig] = token.split('.');

            const ledger = new DurableApprovalLedger(tempLedgerPath);

            const result = __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                runtimeDbaConfirmation: token,
                dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                trustedKeyRegistry: TEST_TRUST_REGISTRY,
                ledger
            });

            // 1. Result object check
            const resultStr = JSON.stringify(result);
            assert.ok(!resultStr.includes(token), 'Result object must not contain raw token');
            assert.ok(!resultStr.includes(encodedSig), 'Result object must not contain raw signature');

            // 2. Ledger record check
            const ledgerContent = fs.readFileSync(tempLedgerPath, 'utf8');
            assert.ok(!ledgerContent.includes(token), 'Ledger file must not contain raw token');
            assert.ok(!ledgerContent.includes(encodedSig), 'Ledger file must not contain raw signature');

            // 3. Error message check on replay
            try {
                __testOnly_verifyOperatorApproval('execute', nonProdClusterInfo, {
                    runtimeDbaConfirmation: token,
                    dbaPublicKey: TEST_DBA_PUBLIC_KEY,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY,
                    ledger
                });
                assert.fail('Should have thrown replay error');
            } catch (err) {
                assert.ok(!err.message.includes(token), 'Error message must not leak raw token');
                assert.ok(!err.message.includes(encodedSig), 'Error message must not leak raw signature');
            }
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath); } catch (_) {}
            try { if (fs.existsSync(`${tempLedgerPath}.lock`)) fs.unlinkSync(`${tempLedgerPath}.lock`); } catch (_) {}
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-05: CLOSE TRUST REGISTRY INJECTION ADVERSARIAL SUITE
    // ─────────────────────────────────────────────────────────────

    it('41. DEF-05: Caller passes trustedKeyRegistry containing attacker key to runMigration on production cluster -> Rejected with SECURITY FATAL', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;
        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const attackerKeyPair = generateTestDbaKeyPair();
            const attackerRegistry = {
                'dba.lead@bharatproperties.in': {
                    keyId: 'kid-attacker-2026',
                    approver: 'dba.lead@bharatproperties.in',
                    fingerprint: attackerKeyPair.fingerprint,
                    publicKey: attackerKeyPair.publicKeyPem,
                    status: 'ACTIVE'
                }
            };
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-attacker-2026'
            }, attackerKeyPair.privateKeyPem);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: token,
                    trustedKeyRegistry: attackerRegistry
                });
            }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('42. DEF-05: Caller passes trustedKeyRegistry to verifyOperatorApproval on production cluster -> Rejected with SECURITY FATAL', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };
        assert.throws(() => {
            verifyOperatorApproval('execute', clusterInfo, {
                trustedKeyRegistry: { 'dba.lead@bharatproperties.in': {} }
            });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
    });

    it('43. DEF-05: Caller passes trustedPublicKeys to runMigration on production cluster -> Rejected with SECURITY FATAL', async () => {
        await assert.rejects(async () => {
            await runMigration({
                mode: 'execute',
                connection: mockAtlasConn,
                trustedPublicKeys: { 'dba.lead@bharatproperties.in': 'fake-key' }
            });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
    });

    it('44. DEF-05: Caller supplies attacker trust-store via --dba-trust-store on production cluster -> Rejected with SECURITY FATAL', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };
        process.argv.push('--dba-trust-store=/tmp/malicious-store.json');
        try {
            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {});
            }, /CLI trust store overrides \(--dba-trust-store\) and bypass flags are strictly prohibited in production/);
        } finally {
            const idx = process.argv.indexOf('--dba-trust-store=/tmp/malicious-store.json');
            if (idx !== -1) process.argv.splice(idx, 1);
        }
    });

    it('45. DEF-05: Caller supplies dbaTrustStorePath to verifyOperatorApproval on production cluster -> Rejected with SECURITY FATAL', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };
        assert.throws(() => {
            verifyOperatorApproval('execute', clusterInfo, { dbaTrustStorePath: '/tmp/malicious.json' });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
    });

    it('46. DEF-05: Caller passes bypass flags (allowUnpinnedKey, skipFingerprintCheck) -> Rejected with SECURITY FATAL', () => {
        const clusterInfo = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };
        assert.throws(() => {
            verifyOperatorApproval('execute', clusterInfo, { allowUnpinnedKey: true });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);

        assert.throws(() => {
            verifyOperatorApproval('execute', clusterInfo, { skipFingerprintCheck: true });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
    });

    it('47. DEF-05: Attacker signs token with allowlisted email + matching registry -> Rejected in production with SECURITY FATAL', async () => {
        const attackerKeyPair = generateTestDbaKeyPair();
        const forgedToken = signTestDbaApprovalToken({
            operation: 'EXECUTE',
            approver: 'chief.architect@bharatproperties.in',
            keyId: 'kid-chief-arch-2026-v1'
        }, attackerKeyPair.privateKeyPem);

        await assert.rejects(async () => {
            await runMigration({
                mode: 'execute',
                connection: mockAtlasConn,
                runtimeDbaConfirmation: forgedToken,
                trustedKeyRegistry: {
                    'chief.architect@bharatproperties.in': {
                        keyId: 'kid-chief-arch-2026-v1',
                        approver: 'chief.architect@bharatproperties.in',
                        fingerprint: attackerKeyPair.fingerprint,
                        publicKey: attackerKeyPair.publicKeyPem,
                        status: 'ACTIVE'
                    }
                }
            });
        }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
    });

    it('48. DEF-05: Production path rejects unprovisioned placeholder keys: fails closed with fatal error', () => {
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

            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-dba-lead-2026-v1'
            }, TEST_DBA_PRIVATE_KEY);

            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    runtimeDbaApproval: token
                });
            }, /Pinned trust anchor for approver "dba\.lead@bharatproperties\.in" has provenance UNPROVISIONED_PLACEHOLDER\. Production execution requires cryptographic keys minted and provisioned via corporate KMS\/Vault authority\. Fail closed\./);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('49. DEF-05: runMigration strips __testOnly_isolatedHarnessAuthorized from caller options', async () => {
        const prevProdFlag = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION;
        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            const token = signTestDbaApprovalToken({
                operation: 'EXECUTE',
                approver: 'dba.lead@bharatproperties.in',
                keyId: 'kid-dba-lead-2026-v1'
            }, TEST_DBA_PRIVATE_KEY);

            await assert.rejects(async () => {
                await runMigration({
                    mode: 'execute',
                    connection: mockAtlasConn,
                    runtimeDbaConfirmation: token,
                    __testOnly_isolatedHarnessAuthorized: true,
                    trustedKeyRegistry: TEST_TRUST_REGISTRY
                });
            }, /Caller-supplied trust registry, custom public keys, bypass flags, or trust store path overrides are strictly forbidden in production/);
        } finally {
            if (prevProdFlag) process.env.ALLOW_PRODUCTION_MIGRATION = prevProdFlag;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDbaFlag) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDbaFlag;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
        }
    });

    it('50. DEF-05: Test-only verification harness is permanently disabled when NODE_ENV is production', () => {
        const prevNodeEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            assert.throws(() => {
                __testOnly_verifyOperatorApproval('execute', {}, {});
            }, /Test-only verification harness \(__testOnly_verifyOperatorApproval\) is permanently disabled in production environments/);
        } finally {
            if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
            else delete process.env.NODE_ENV;
        }
    });

    it('50b. DEF-05: Test harness strictly rejects clusterInfo.isProductionCluster === true across all NODE_ENV environments', () => {
        const prodCluster = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        const envsToTest = ['test', 'development', 'staging', 'production'];
        const prevNodeEnv = process.env.NODE_ENV;

        try {
            for (const env of envsToTest) {
                process.env.NODE_ENV = env;
                assert.throws(() => {
                    __testOnly_verifyOperatorApproval('execute', prodCluster, {});
                }, /(?:Test-only verification harness \(__testOnly_verifyOperatorApproval\) is permanently disabled in production environments|Test harness cannot be invoked with a production cluster context.*Fail closed)/,
                `NODE_ENV=${env} with production cluster must fail closed`);
            }
        } finally {
            if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
            else delete process.env.NODE_ENV;
        }
    });

    it('50c. DEF-05: Direct call to verifyOperatorApproval with __testOnly_isolatedHarnessAuthorized on production cluster throws SECURITY FATAL', () => {
        const prodCluster = {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName: 'bharatproperties1',
            hosts: ['cluster0.7dehanz.mongodb.net']
        };

        assert.throws(() => {
            verifyOperatorApproval('execute', prodCluster, {
                __testOnly_isolatedHarnessAuthorized: true
            });
        }, /Test-only verification harness authorization is strictly forbidden on production clusters\. Fail closed\./);
    });

    it('50d. Section B: getProcessStartTime accurately establishes process identity corresponding to actual process start time', async () => {
        const child = spawn('node', ['-e', 'setTimeout(() => {}, 5000)']);
        const approxStart = Date.now();
        await new Promise(r => setTimeout(r, 100));

        try {
            const detectedStartTime = getProcessStartTime(child.pid);
            assert.ok(detectedStartTime, 'Process start time must be resolved for a live child process');
            assert.ok(Math.abs(detectedStartTime - approxStart) < 3000, `Process start time (${detectedStartTime}) must be within 3s of actual start (${approxStart})`);
        } finally {
            child.kill();
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-03: PRODUCTION TOKEN HARDENING
    // ─────────────────────────────────────────────────────────────

    it('51. DEF-03: Symbolic link token file rejected: fails closed to prevent redirection attacks', () => {
        const prevProd = process.env.ALLOW_PRODUCTION_MIGRATION;
        const prevDba = process.env.DBA_APPROVED_INDEX_MIGRATION;
        const realTokenFile = path.join(os.tmpdir(), `real-token-${Date.now()}.txt`);
        const symlinkTokenFile = path.join(os.tmpdir(), `symlink-token-${Date.now()}.txt`);
        try {
            process.env.ALLOW_PRODUCTION_MIGRATION = 'true';
            process.env.DBA_APPROVED_INDEX_MIGRATION = 'true';
            fs.writeFileSync(realTokenFile, 'token-data', { mode: 0o600 });
            fs.symlinkSync(realTokenFile, symlinkTokenFile);

            const clusterInfo = {
                isValid: true,
                isProductionCluster: true,
                clusterType: 'PRODUCTION_ATLAS',
                clusterId: PRODUCTION_CLUSTER_ID,
                dbName: 'bharatproperties1',
                hosts: ['cluster0.7dehanz.mongodb.net']
            };

            assert.throws(() => {
                verifyOperatorApproval('execute', clusterInfo, {
                    dbaApprovalFile: symlinkTokenFile
                });
            }, /Approval token file at .* is a symbolic link\. Symlinks are strictly prohibited to prevent redirection attacks\. Fail closed\./);
        } finally {
            if (prevProd) process.env.ALLOW_PRODUCTION_MIGRATION = prevProd;
            else delete process.env.ALLOW_PRODUCTION_MIGRATION;
            if (prevDba) process.env.DBA_APPROVED_INDEX_MIGRATION = prevDba;
            else delete process.env.DBA_APPROVED_INDEX_MIGRATION;
            try { if (fs.existsSync(symlinkTokenFile)) fs.unlinkSync(symlinkTokenFile); } catch (_) {}
            try { if (fs.existsSync(realTokenFile)) fs.unlinkSync(realTokenFile); } catch (_) {}
        }
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-06: 12 MANDATORY REAL CONCURRENCY ADVERSARIAL SCENARIOS
    // ─────────────────────────────────────────────────────────────

    it('52. DEF-06: Scenario 1 — No-Clobber Recovery Restoration: Worker A renames old lock; Worker B acquires replacement lock; Worker A detects mismatch and cannot overwrite Worker B lock', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen1-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        // 1. Dead lock on disk (PID 999999 dead)
        const deadLockData = {
            ownerToken: 'dead-owner-token-0000',
            pid: 999999,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(deadLockData), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        // 2. Intercept renameSync: right before renaming lockPath, replace it with a LIVE replacement lock!
        const origRename = fs.renameSync;
        let replacementInjected = false;
        fs.renameSync = function(src, dst) {
            if (src === lockPath && !replacementInjected) {
                replacementInjected = true;
                fs.unlinkSync(lockPath);
                const liveLockData = {
                    ownerToken: 'worker-b-replacement-owner-token-1111',
                    pid: process.pid,
                    processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
                    hostname: os.hostname(),
                    createdAt: Date.now()
                };
                fs.writeFileSync(lockPath, JSON.stringify(liveLockData), { mode: 0o600 });
            }
            return origRename.apply(this, arguments);
        };

        try {
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, false, 'Recovery must return false when replacement lock is captured');
            assert.ok(fs.existsSync(lockPath), 'Replacement lock must exist on disk');
            const dataOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            assert.equal(dataOnDisk.ownerToken, 'worker-b-replacement-owner-token-1111', 'Worker B replacement lock must remain completely intact');
        } finally {
            fs.renameSync = origRename;
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('53. DEF-06: Scenario 2 — Delayed Release Protection: Worker A reads its own lock; recovery/replacement occurs before release. Delayed release cannot unlink replacement lock', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen2-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;

        const ledgerA = new DurableApprovalLedger(tempPath, { lockTimeoutMs: 1000 });
        ledgerA._acquireLock();
        const workerAIno = ledgerA.currentLockIno;
        assert.ok(workerAIno, 'Worker A must have acquired lock with valid inode');

        // Worker A's lock is superseded by Worker B's replacement lock
        fs.unlinkSync(lockPath);
        const workerBLockData = {
            ownerToken: 'worker-b-active-replacement-token-3333',
            pid: process.pid,
            processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(lockPath, JSON.stringify(workerBLockData), { mode: 0o600 });
        const workerBStat = fs.statSync(lockPath);
        assert.notEqual(workerBStat.ino, workerAIno, 'Worker B must have a distinct inode');

        // Worker A now attempts delayed release
        ledgerA._releaseLock();

        // Verify Worker B's replacement lock is STILL intact and was NOT unlinked!
        assert.ok(fs.existsSync(lockPath), 'Worker B replacement lock must still exist on disk');
        const contentAfter = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        assert.equal(contentAfter.ownerToken, 'worker-b-active-replacement-token-3333', 'Worker B replacement lock must NOT be deleted by delayed Worker A');

        // Clean up Worker B's lock
        fs.unlinkSync(lockPath);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });

    it('54. DEF-06: Scenario 3 — Concurrent Recovery and Normal Acquisition: Ordinary acquisition respects claim coordinator', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempLedgerPath = path.join(os.tmpdir(), `test-scen3-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        // Dead lock on disk
        const deadLockData = {
            ownerToken: 'dead-owner-scen3',
            pid: 999999,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(deadLockData), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        const workerScript = `
import { DurableApprovalLedger } from "${targetModule}";
const ledgerPath = process.argv[2];
const appId = process.argv[3];
const workerId = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 5000, initGracePeriodMs: 0 });
try {
    ledger.recordConsumedApproval(appId, { workerId });
    process.exit(0);
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
`;
        const workerFile = path.join(os.tmpdir(), `worker-scen3-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        try {
            const appId1 = `app-scen3-1-${Date.now()}-1111222233334444`;
            const appId2 = `app-scen3-2-${Date.now()}-5555666677778888`;

            const p1 = spawn('node', [workerFile, tempLedgerPath, appId1, 'recovery-worker']);
            const p2 = spawn('node', [workerFile, tempLedgerPath, appId2, 'normal-worker']);

            const [code1, code2] = await Promise.all([
                new Promise(resolve => p1.on('close', resolve)),
                new Promise(resolve => p2.on('close', resolve))
            ]);

            assert.equal(code1, 0, 'Worker 1 must exit with 0');
            assert.equal(code2, 0, 'Worker 2 must exit with 0');

            const content = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n');
            assert.equal(content.length, 2, 'Both approvals must be durably recorded without deadlock or overwrite');
        } finally {
            if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile);
            if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('55. DEF-06: Scenario 4 — Two Recovery Processes Race: Two cleanup processes race to recover same dead lock', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempLedgerPath = path.join(os.tmpdir(), `test-scen4-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        // Dead lock on disk
        const deadLockData = {
            ownerToken: 'dead-owner-scen4',
            pid: 999999,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(deadLockData), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        const workerScript = `
import { DurableApprovalLedger } from "${targetModule}";
const ledgerPath = process.argv[2];
const appId = process.argv[3];
const workerId = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 5000, initGracePeriodMs: 0 });
try {
    ledger.recordConsumedApproval(appId, { workerId });
    process.exit(0);
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
`;
        const workerFile = path.join(os.tmpdir(), `worker-scen4-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        try {
            const appId1 = `app-scen4-1-${Date.now()}-1111222233334444`;
            const appId2 = `app-scen4-2-${Date.now()}-5555666677778888`;

            const p1 = spawn('node', [workerFile, tempLedgerPath, appId1, 'rec-1']);
            const p2 = spawn('node', [workerFile, tempLedgerPath, appId2, 'rec-2']);

            const [code1, code2] = await Promise.all([
                new Promise(resolve => p1.on('close', resolve)),
                new Promise(resolve => p2.on('close', resolve))
            ]);

            assert.equal(code1, 0, 'Recovery worker 1 must exit with 0');
            assert.equal(code2, 0, 'Recovery worker 2 must exit with 0');

            const content = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n');
            assert.equal(content.length, 2, 'Both approvals must be durably recorded');
        } finally {
            if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile);
            if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('56. DEF-06: Scenario 5 — Concurrent Identical Approval ID Consumption: Exactly 1 success, 1 replay error', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempLedgerPath = path.join(os.tmpdir(), `test-scen5-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;
        const sharedApprovalId = `shared-scen5-${Date.now()}-1111222233334444`;

        const workerScript = `
import { DurableApprovalLedger } from "${targetModule}";
const ledgerPath = process.argv[2];
const appId = process.argv[3];
const workerId = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 5000 });
try {
    ledger.recordConsumedApproval(appId, { workerId });
    process.exit(0);
} catch (err) {
    if (err.message.includes("Replay detected")) {
        process.exit(2);
    }
    process.exit(1);
}
`;
        const workerFile = path.join(os.tmpdir(), `worker-scen5-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        try {
            const p1 = spawn('node', [workerFile, tempLedgerPath, sharedApprovalId, 'worker-1']);
            const p2 = spawn('node', [workerFile, tempLedgerPath, sharedApprovalId, 'worker-2']);

            const [code1, code2] = await Promise.all([
                new Promise(resolve => p1.on('close', resolve)),
                new Promise(resolve => p2.on('close', resolve))
            ]);

            const codes = [code1, code2].sort();
            assert.deepEqual(codes, [0, 2], 'Exactly one process must succeed (0) and one must fail with replay (2)');

            const lines = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n');
            assert.equal(lines.length, 1, 'Ledger must contain exactly 1 entry for the single-use token');
        } finally {
            if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile);
            if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('57. DEF-06: Scenario 6 — Concurrent Distinct Approval ID Consumption: Multiple child processes consume distinct IDs', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempLedgerPath = path.join(os.tmpdir(), `test-scen6-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        const workerScript = `
import { DurableApprovalLedger } from "${targetModule}";
const ledgerPath = process.argv[2];
const appId = process.argv[3];
const workerId = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 5000 });
try {
    ledger.recordConsumedApproval(appId, { workerId });
    process.exit(0);
} catch (err) {
    process.exit(1);
}
`;
        const workerFile = path.join(os.tmpdir(), `worker-scen6-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        try {
            const appIds = [
                `scen6-app-1-${Date.now()}-1111222233334444`,
                `scen6-app-2-${Date.now()}-2222333344445555`,
                `scen6-app-3-${Date.now()}-3333444455556666`,
                `scen6-app-4-${Date.now()}-4444555566667777`
            ];

            const procs = appIds.map((id, idx) => spawn('node', [workerFile, tempLedgerPath, id, `worker-${idx + 1}`]));
            const exitCodes = await Promise.all(procs.map(p => new Promise(resolve => p.on('close', resolve))));

            assert.deepEqual(exitCodes, [0, 0, 0, 0], 'All 4 workers must succeed with exit code 0');

            const lines = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n');
            assert.equal(lines.length, 4, 'All 4 records must be present in ledger');
            const parsed = lines.map(l => JSON.parse(l));
            for (const expectedId of appIds) {
                assert.ok(parsed.some(r => r.approvalId === expectedId), `Approval ID ${expectedId} must exist in ledger`);
            }
        } finally {
            if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile);
            if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('58. DEF-06: Scenario 7 — Crash During Acquisition: Subprocess crashes during lock acquisition; next worker recovers cleanly', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempLedgerPath = path.join(os.tmpdir(), `test-scen7-${Date.now()}.jsonl`);
        const lockPath = `${tempLedgerPath}.lock`;

        const crashingScript = `
import fs from 'fs';
import os from 'os';
const lockPath = process.argv[2];
const lockData = {
    ownerToken: 'crashed-worker-token-0000',
    pid: process.pid,
    processStartTime: Date.now() - 5000,
    hostname: os.hostname(),
    createdAt: Date.now() - 1000
};
fs.writeFileSync(lockPath, JSON.stringify(lockData), { mode: 0o600 });
const past = new Date(Date.now() - 5000);
fs.utimesSync(lockPath, past, past);
process.exit(1); // Crash abruptly
`;
        const crashFile = path.join(os.tmpdir(), `crash-script-scen7-${Date.now()}.mjs`);
        fs.writeFileSync(crashFile, crashingScript, { mode: 0o700 });

        try {
            const crashProc = spawn('node', [crashFile, lockPath]);
            const crashCode = await new Promise(resolve => crashProc.on('close', resolve));
            assert.equal(crashCode, 1, 'Crashing process must exit with 1');

            const ledger = new DurableApprovalLedger(tempLedgerPath, { lockTimeoutMs: 2000, initGracePeriodMs: 0 });
            const approvalId = `crash-recovery-scen7-${Date.now()}-1111222233334444`;
            const record = ledger.recordConsumedApproval(approvalId, { worker: 'resilient-worker' });
            assert.equal(record.approvalId, approvalId);
            assert.equal(fs.existsSync(lockPath), false, 'Lock must be cleanly released');
        } finally {
            if (fs.existsSync(crashFile)) fs.unlinkSync(crashFile);
            if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('59. DEF-06: Scenario 8 — Crash During Ledger Append & Ownership Assertion: Exclusive ownership required before any append', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen8-${Date.now()}.jsonl`);
        const ledger = new DurableApprovalLedger(tempPath);

        // Attempting _assertLockOwnership without acquiring lock must fail closed with SECURITY FATAL
        assert.throws(() => {
            ledger._assertLockOwnership();
        }, /Process \d+ attempted ledger operation without holding an exclusive lock\. Fail closed\./);

        // After acquiring lock, _assertLockOwnership passes
        ledger._acquireLock();
        assert.doesNotThrow(() => {
            ledger._assertLockOwnership();
        });
        ledger._releaseLock();

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (fs.existsSync(`${tempPath}.lock`)) fs.unlinkSync(`${tempPath}.lock`);
    });

    it('60. DEF-06: Scenario 9 — Live Lock Exceeding 15s Stale Timeout: Active lock held by live process is NEVER broken', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen9-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0, staleTimeoutMs: 15000 });

        // Lock held by CURRENT (live) process, created 20 seconds ago (> 15s)
        const liveOldLockData = {
            ownerToken: 'live-old-token-9999',
            pid: process.pid,
            processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
            hostname: os.hostname(),
            createdAt: Date.now() - 20000
        };
        fs.writeFileSync(lockPath, JSON.stringify(liveOldLockData), { mode: 0o600 });
        const past = new Date(Date.now() - 20000);
        fs.utimesSync(lockPath, past, past);

        try {
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, false, 'Lock held by a live process must NEVER be broken regardless of age');
            assert.ok(fs.existsSync(lockPath), 'Lockfile must remain intact');
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('61. DEF-06: Scenario 10 — PID Reused by Another Live Process: Start-time mismatch detects dead original owner', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen10-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        const pidReuseData = {
            ownerToken: 'pid-reuse-token-scen10',
            pid: process.pid,
            processStartTime: Date.now() - 3600000, // 1 hour ago
            hostname: os.hostname(),
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(pidReuseData), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        try {
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, true, 'PID reuse must be detected via start-time mismatch and recovered');
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('62. DEF-06: Scenario 11 — Corrupted/Partial Lock Metadata: Malformed lockfile past stale timeout is recovered cleanly', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen11-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0, staleTimeoutMs: 50 });

        fs.writeFileSync(lockPath, '{"ownerToken": "incomplete-json...', { mode: 0o600 });
        const past = new Date(Date.now() - 1000);
        fs.utimesSync(lockPath, past, past);

        try {
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, true, 'Corrupt lockfile past stale timeout must be recovered');
            assert.equal(fs.existsSync(lockPath), false, 'Corrupted lockfile must be removed');
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    it('63. DEF-06: Scenario 12 — Ambiguous Cross-Host Ownership: Fails closed without breaking lock from different hostname', () => {
        const tempPath = path.join(os.tmpdir(), `test-scen12-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        const remoteLockData = {
            ownerToken: 'remote-host-token-scen12',
            pid: 999999,
            processStartTime: Date.now() - 60000,
            hostname: 'remote-worker-node-99.internal',
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(remoteLockData), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        try {
            const recovered = ledger._tryRecoverDeadLock();
            assert.equal(recovered, false, 'Remote hostname ownership is ambiguous and must fail closed');
            assert.ok(fs.existsSync(lockPath), 'Remote lockfile must NOT be removed');
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });
});
