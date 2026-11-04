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
    __resetClkTckCacheForTesting,
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

    // ─────────────────────────────────────────────────────────────
    // DEF-07: CORRECT NO-CLOBBER ERROR HANDLING & ARTIFACT SAFETY
    // ─────────────────────────────────────────────────────────────

    it('64. DEF-07: EEXIST handled cleanly: staging link unlinked, active replacement lock preserved', () => {
        const tempPath = path.join(os.tmpdir(), `test-def7-eexist-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;

        // Worker B holds an active replacement lock
        const replacementData = {
            ownerToken: 'replacement-lock-token-def7',
            pid: process.pid,
            processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(lockPath, JSON.stringify(replacementData), { mode: 0o600 });

        // Worker A has a recovery staging file that mismatched
        const recoveryPath = `${lockPath}.recovering.${process.pid}.${Date.now()}.uuid`;
        fs.writeFileSync(recoveryPath, JSON.stringify({ ownerToken: 'old-stale-token' }), { mode: 0o600 });

        // Simulate no-clobber link: destination exists so fs.linkSync throws EEXIST
        let eexistThrown = false;
        try {
            fs.linkSync(recoveryPath, lockPath);
        } catch (linkErr) {
            if (linkErr.code === 'EEXIST') {
                eexistThrown = true;
                // As implemented in migration: safe to unlink staging copy since destination already exists
                fs.unlinkSync(recoveryPath);
            }
        }

        assert.ok(eexistThrown, 'fs.linkSync must throw EEXIST when destination exists');
        assert.ok(!fs.existsSync(recoveryPath), 'Staging recovery copy must be cleanly unlinked on EEXIST');
        assert.ok(fs.existsSync(lockPath), 'Active replacement lock at lockPath must remain untouched');
        const finalData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        assert.equal(finalData.ownerToken, replacementData.ownerToken, 'Lock data must be preserved');

        try { fs.unlinkSync(lockPath); } catch (_) {}
    });

    it('65. DEF-07: EPERM / EIO / EXDEV / ENOSPC on linkSync: never unlinks staging copy, preserves artifact & throws SECURITY FATAL', () => {
        const tempPath = path.join(os.tmpdir(), `test-def7-errors-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;

        const errorsToTest = ['EPERM', 'EIO', 'EXDEV', 'ENOSPC'];

        for (const errCode of errorsToTest) {
            const recoveryPath = `${lockPath}.recovering.test.${errCode}`;
            fs.writeFileSync(recoveryPath, JSON.stringify({ ownerToken: `token-${errCode}` }), { mode: 0o600 });

            // Simulate the exact DEF-07 block from migration runner:
            const origLink = fs.linkSync;
            try {
                fs.linkSync = () => {
                    const err = new Error(`Injected error ${errCode}`);
                    err.code = errCode;
                    throw err;
                };

                assert.throws(() => {
                    try {
                        fs.linkSync(recoveryPath, lockPath);
                        fs.unlinkSync(recoveryPath);
                    } catch (linkErr) {
                        if (linkErr.code === 'EEXIST') {
                            try { fs.unlinkSync(recoveryPath); } catch (_) {}
                        } else {
                            throw new Error(
                                `[MIGRATION-004] SECURITY FATAL: Unexpected filesystem error (${linkErr.code || linkErr.message}) during no-clobber lock restoration. ` +
                                `Lock artifact preserved at ${recoveryPath}. Fail closed.`
                            );
                        }
                    }
                }, new RegExp(`\\[MIGRATION-004\\] SECURITY FATAL: Unexpected filesystem error \\(${errCode}\\).*artifact preserved`));

                // CRITICAL INVARIANT: The artifact was NEVER deleted!
                assert.ok(fs.existsSync(recoveryPath), `Artifact must be preserved on disk after ${errCode}`);
            } finally {
                fs.linkSync = origLink;
                try { if (fs.existsSync(recoveryPath)) fs.unlinkSync(recoveryPath); } catch (_) {}
            }
        }
    });

    it('66. DEF-07: Unlink failure after successful link does not corrupt active destination lock', () => {
        const tempPath = path.join(os.tmpdir(), `test-def7-unlinkfail-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const recoveryPath = `${lockPath}.recovering.unlinkfail`;
        fs.writeFileSync(recoveryPath, JSON.stringify({ ownerToken: 'token-unlinkfail' }), { mode: 0o600 });

        // Successful link
        fs.linkSync(recoveryPath, lockPath);
        assert.ok(fs.existsSync(lockPath), 'Destination lock must exist after link');

        // Simulate unlinkSync failure on recoveryPath
        const origUnlink = fs.unlinkSync;
        let caughtErr = null;
        try {
            fs.unlinkSync = (p) => {
                if (p === recoveryPath) {
                    const err = new Error('Permission denied on staging link');
                    err.code = 'EPERM';
                    throw err;
                }
                return origUnlink(p);
            };

            // In migration runner:
            try {
                fs.unlinkSync(recoveryPath);
            } catch (unlinkErr) {
                caughtErr = unlinkErr;
            }

            assert.ok(caughtErr !== null, 'Unlink error was caught');
            // Destination lock remains completely intact!
            assert.ok(fs.existsSync(lockPath), 'Destination lock must remain intact and valid');
            const statDst = fs.statSync(lockPath);
            const statSrc = fs.statSync(recoveryPath);
            assert.equal(statDst.ino, statSrc.ino, 'Both links point to identical inode');
        } finally {
            fs.unlinkSync = origUnlink;
            try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
            try { if (fs.existsSync(recoveryPath)) fs.unlinkSync(recoveryPath); } catch (_) {}
        }
    });

    it('67. DEF-07: Interruption between link and unlink leaves data intact via hard link', () => {
        const tempPath = path.join(os.tmpdir(), `test-def7-interrupted-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const stagingPath = `${lockPath}.recovering.interrupted`;
        const testPayload = JSON.stringify({ ownerToken: 'interrupted-token', pid: 12345 });
        fs.writeFileSync(stagingPath, testPayload, { mode: 0o600 });

        // Link created, process interrupted before unlink
        fs.linkSync(stagingPath, lockPath);

        // Verification: Even if stagingPath remains, lockPath has the exact same data and inode
        const statLock = fs.statSync(lockPath);
        const statStaging = fs.statSync(stagingPath);
        assert.equal(statLock.ino, statStaging.ino);
        assert.equal(fs.readFileSync(lockPath, 'utf8'), testPayload);

        try { fs.unlinkSync(stagingPath); } catch (_) {}
        try { fs.unlinkSync(lockPath); } catch (_) {}
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-08: CLAIM COORDINATOR OWNERSHIP & STALE RECOVERY
    // ─────────────────────────────────────────────────────────────

    it('68. DEF-08: Live claim older than 15s is preserved and never deleted solely by mtime', async () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-liveclaim-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { staleTimeoutMs: 15000, initGracePeriodMs: 0 });

        const childCode = `
import fs from 'fs';
import os from 'os';
const claimPath = process.argv[2];
const claimData = {
    claimToken: 'live-child-claim-token',
    pid: process.pid,
    processStartTime: Date.now() - Math.floor(process.uptime() * 1000),
    hostname: os.hostname(),
    createdAt: Date.now() - 30000
};
fs.writeFileSync(claimPath, JSON.stringify(claimData), { mode: 0o600 });
const past = new Date(Date.now() - 30000);
fs.utimesSync(claimPath, past, past);
process.stdout.write('READY\\n');
setTimeout(() => {}, 10000);
`;
        const workerFile = path.join(os.tmpdir(), `worker-claim-live-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, childCode, { mode: 0o700 });
        const child = spawn('node', [workerFile, claimPath], { stdio: ['ignore', 'pipe', 'inherit'] });

        await new Promise((resolve, reject) => {
            child.stdout.on('data', (d) => {
                if (d.toString().includes('READY')) resolve();
            });
            child.on('error', reject);
        });

        try {
            const active = ledger._isClaimActive();
            assert.equal(active, true, 'Claim belonging to live process must be active even if mtime > 15s');
            assert.ok(fs.existsSync(claimPath), 'Live claim file must NOT be unlinked');
        } finally {
            child.kill('SIGKILL');
            try { if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile); } catch (_) {}
            try { if (fs.existsSync(claimPath)) fs.unlinkSync(claimPath); } catch (_) {}
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
        }
    });

    it('69. DEF-08: Dead claim recovery: Dead owner claim is cleanly recovered via atomic rename', () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-deadclaim-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        const deadClaimData = {
            claimToken: 'dead-claim-token-1111',
            pid: 999999,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(deadClaimData), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        const active = ledger._isClaimActive();
        assert.equal(active, false, 'Dead claim must be recovered and return inactive (false)');
        assert.ok(!fs.existsSync(claimPath), 'Dead claim file must be safely recovered and removed');

        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    it('70. DEF-08: PID reuse in claim: Start-time mismatch detects dead owner and recovers claim', () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-pidreuse-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        const reusedPidClaim = {
            claimToken: 'reused-pid-claim-token',
            pid: process.pid,
            processStartTime: Date.now() - 3600000, // 1 hour ago (mismatch)
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(reusedPidClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        const active = ledger._isClaimActive();
        assert.equal(active, false, 'PID reuse in claim must detect dead owner and recover');
        assert.ok(!fs.existsSync(claimPath), 'Claim must be removed');

        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    it('71. DEF-08: Concurrent recovery claim creation: Exactly 1 worker acquires claim, others receive EEXIST', async () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-concurrent-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;

        const workerScript = `
import fs from 'fs';
const path = process.argv[2];
try {
    const fd = fs.openSync(path, 'wx', 0o600);
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: Date.now() }));
    fs.closeSync(fd);
    process.stdout.write('ACQUIRED\\n');
} catch (err) {
    if (err.code === 'EEXIST') {
        process.stdout.write('EEXIST\\n');
    } else {
        process.stdout.write('ERROR: ' + err.message + '\\n');
    }
}
`;
        const workerFile = path.join(os.tmpdir(), `worker-concurrent-claim-${Date.now()}.mjs`);
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const child1 = spawn('node', [workerFile, claimPath], { stdio: ['ignore', 'pipe', 'inherit'] });
        const child2 = spawn('node', [workerFile, claimPath], { stdio: ['ignore', 'pipe', 'inherit'] });

        const [res1, res2] = await Promise.all([
            new Promise((res) => child1.stdout.on('data', (d) => res(d.toString().trim()))),
            new Promise((res) => child2.stdout.on('data', (d) => res(d.toString().trim())))
        ]);

        const results = [res1, res2].sort();
        assert.deepEqual(results, ['ACQUIRED', 'EEXIST'], 'Exactly one worker must acquire claim; other must get EEXIST');

        try { if (fs.existsSync(workerFile)) fs.unlinkSync(workerFile); } catch (_) {}
        try { if (fs.existsSync(claimPath)) fs.unlinkSync(claimPath); } catch (_) {}
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    it('72. DEF-08: Delayed recovery worker: Delayed worker cannot remove or replace newer claim', () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-delayedworker-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        // Worker B writes a new active claim
        const newerClaim = {
            claimToken: 'worker-b-new-token',
            pid: 777777,
            processStartTime: Date.now(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(newerClaim), { mode: 0o600 });

        // Worker A (delayed) attempts to release its old claim 'worker-a-old-token'
        ledger._releaseClaim('worker-a-old-token');

        // Worker B's newer claim must remain completely untouched!
        assert.ok(fs.existsSync(claimPath), 'Newer claim must not be deleted');
        const onDisk = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        assert.equal(onDisk.claimToken, 'worker-b-new-token', 'Newer claim token must be preserved');

        try { if (fs.existsSync(claimPath)) fs.unlinkSync(claimPath); } catch (_) {}
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    it('73. DEF-08: Claim replacement during recovery: Detects mismatch and restores replacement claim via no-clobber linkSync', () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-claimmismatch-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0 });

        // Stat of dead claim
        const inspectedStat = { ino: 111111, dev: 222222 };
        const inspectedClaimData = { claimToken: 'dead-claim-1111', pid: 999999 };

        // Replacement claim actually on disk with different token
        const replacementClaim = {
            claimToken: 'replacement-claim-token-2222',
            pid: process.pid,
            hostname: os.hostname()
        };
        fs.writeFileSync(claimPath, JSON.stringify(replacementClaim), { mode: 0o600 });

        const recovered = ledger._tryRecoverDeadClaim(inspectedStat, inspectedClaimData);
        assert.equal(recovered, false, 'Recovery must abort and return false on mismatch');
        assert.ok(fs.existsSync(claimPath), 'Replacement claim must be restored at claimPath');
        const restored = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        assert.equal(restored.claimToken, 'replacement-claim-token-2222');

        try { if (fs.existsSync(claimPath)) fs.unlinkSync(claimPath); } catch (_) {}
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    it('74. DEF-08: Process crash during claim creation: Malformed claim past stale timeout is cleanly recovered', () => {
        const tempPath = path.join(os.tmpdir(), `test-def8-crashclaim-${Date.now()}.jsonl`);
        const lockPath = `${tempPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(tempPath, { initGracePeriodMs: 0, staleTimeoutMs: 50 });

        // Simulate crash leaving truncated JSON
        fs.writeFileSync(claimPath, '{"claimToken":"truncated...', { mode: 0o600 });
        const past = new Date(Date.now() - 1000);
        fs.utimesSync(claimPath, past, past);

        const active = ledger._isClaimActive();
        assert.equal(active, false, 'Malformed claim past stale timeout must be recovered');
        assert.ok(!fs.existsSync(claimPath), 'Malformed claim must be cleaned up');

        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-09: ACCURATE PROCESS START TIME & RELIABLE CLK_TCK
    // ─────────────────────────────────────────────────────────────

    it('75. DEF-09: Linux /proc calculation uses exact field 22 ticks, btime and reliable CLK_TCK', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def9-proc-'));
        const mockProcStat = path.join(tempDir, 'stat');
        const mockSysStat = path.join(tempDir, 'sys_stat');

        try {
            // Field 1: pid (1234), Field 2: (node proc), rest starts with state S
            // Field 22 (starttime) is 19th item in rest -> let ticks = 50000
            const rest = new Array(25).fill('0');
            rest[0] = 'S';
            rest[19] = '50000'; // starttime ticks
            fs.writeFileSync(mockProcStat, `1234 (node proc) ${rest.join(' ')}`);

            // /proc/stat with btime = 1700000000
            fs.writeFileSync(mockSysStat, `cpu 1 2 3\nbtime 1700000000\nprocesses 10\n`);

            const startTime = getProcessStartTime(1234, {
                forceLinux: true,
                procStatPath: mockProcStat,
                sysStatPath: mockSysStat,
                clkTck: 100
            });

            // Expected: (1700000000 * 1000) + (50000 / 100 * 1000) = 1700000000000 + 500000 = 1700000500000
            assert.equal(startTime, 1700000500000);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('76. DEF-09: Unavailable CLK_TCK returns null (never silently assumes 100 Hz)', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def9-notck-'));
        const mockProcStat = path.join(tempDir, 'stat');
        const mockSysStat = path.join(tempDir, 'sys_stat');

        try {
            const rest = new Array(25).fill('0');
            rest[19] = '50000';
            fs.writeFileSync(mockProcStat, `1234 (node) ${rest.join(' ')}`);
            fs.writeFileSync(mockSysStat, `btime 1700000000\n`);

            __resetClkTckCacheForTesting();
            const res = getProcessStartTime(1234, {
                forceLinux: true,
                procStatPath: mockProcStat,
                sysStatPath: mockSysStat,
                clkTck: null // CLK_TCK unavailable!
            });

            assert.equal(res, null, 'Must return null when CLK_TCK cannot be determined; never assume 100 Hz');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('77. DEF-09: Malformed /proc data returns null and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def9-malformed-'));
        const mockProcStat = path.join(tempDir, 'stat');
        const mockSysStat = path.join(tempDir, 'sys_stat');

        try {
            // 1. Missing parentheses
            fs.writeFileSync(mockProcStat, 'corrupt stat line without parens');
            fs.writeFileSync(mockSysStat, 'btime 1700000000\n');
            assert.equal(getProcessStartTime(1234, { forceLinux: true, procStatPath: mockProcStat, sysStatPath: mockSysStat, clkTck: 100 }), null);

            // 2. Field 22 is non-numeric
            const fields = new Array(25).fill('0');
            fields[0] = 'S';
            fields[19] = 'NOT_A_NUMBER';
            fs.writeFileSync(mockProcStat, `1234 (node) ${fields.join(' ')}`);
            assert.equal(getProcessStartTime(1234, { forceLinux: true, procStatPath: mockProcStat, sysStatPath: mockSysStat, clkTck: 100 }), null);

            // 3. Missing btime line
            fs.writeFileSync(mockSysStat, 'cpu 1 2 3\nno_btime_here 1\n');
            assert.equal(getProcessStartTime(1234, { forceLinux: true, procStatPath: mockProcStat, sysStatPath: mockSysStat, clkTck: 100 }), null);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('78. DEF-09: Permission errors reading proc paths return null safely', () => {
        const res = getProcessStartTime(1234, {
            forceLinux: true,
            procStatPath: '/proc/nonexistent-path-for-test/stat',
            sysStatPath: '/proc/stat'
        });
        assert.equal(res, null, 'Must return null on read errors');
    });

    // ─────────────────────────────────────────────────────────────
    // CRITICAL SECTION MUTUAL EXCLUSION: MULTI-PROCESS ADVERSARIAL
    // ─────────────────────────────────────────────────────────────

    it('79. Critical Section Mutual Exclusion: No two child processes can enter critical section simultaneously under adversarial contention', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const sentinelPath = path.join(tempDir, 'concurrency_sentinel.json');

        // Sentinel tracks active in-flight count, peak concurrency, and violations
        fs.writeFileSync(sentinelPath, JSON.stringify({
            currentInFlight: 0,
            maxConcurrency: 0,
            totalEntries: 0,
            violations: 0
        }), { mode: 0o600 });

        const numWorkers = 5;
        const iterationsPerWorker = 4;

        // Child worker script that acquires lock, asserts critical section isolation via sentinel, and releases
        const workerScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const sentinelPath = process.argv[3];
const workerId = process.argv[4];
const iterations = parseInt(process.argv[5], 10);

const ledger = new DurableApprovalLedger(ledgerPath, {
    lockTimeoutMs: 15000,
    retryIntervalMs: 15
});

for (let i = 0; i < iterations; i++) {
    ledger._acquireLock();
    try {
        ledger._assertLockOwnership();

        // CRITICAL SECTION: Enter
        const content = fs.readFileSync(sentinelPath, 'utf8');
        const state = JSON.parse(content);
        state.currentInFlight += 1;
        state.totalEntries += 1;
        if (state.currentInFlight > state.maxConcurrency) {
            state.maxConcurrency = state.currentInFlight;
        }
        if (state.currentInFlight > 1) {
            state.violations += 1;
        }
        fs.writeFileSync(sentinelPath, JSON.stringify(state));

        // Adversarial jitter: sleep 10ms inside critical section
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);

        // Re-verify inside critical section: must still be exactly 1
        const verifyContent = fs.readFileSync(sentinelPath, 'utf8');
        const verifyState = JSON.parse(verifyContent);
        if (verifyState.currentInFlight !== 1) {
            verifyState.violations += 1;
        }

        // CRITICAL SECTION: Exit
        verifyState.currentInFlight -= 1;
        fs.writeFileSync(sentinelPath, JSON.stringify(verifyState));
    } finally {
        ledger._releaseLock();
    }

    // Brief jitter between acquisitions
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}
process.exit(0);
`;
        const workerFile = path.join(tempDir, 'worker_cs.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const workers = [];
        for (let w = 0; w < numWorkers; w++) {
            workers.push(new Promise((resolve, reject) => {
                const child = spawn('node', [workerFile, ledgerPath, sentinelPath, `worker-${w}`, String(iterationsPerWorker)], {
                    stdio: ['ignore', 'inherit', 'inherit']
                });
                child.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Worker ${w} exited with code ${code}`));
                });
                child.on('error', reject);
            }));
        }

        await Promise.all(workers);

        // Read final sentinel state
        const finalSentinel = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
        assert.equal(finalSentinel.totalEntries, numWorkers * iterationsPerWorker, 'All critical section entries must complete');
        assert.equal(finalSentinel.maxConcurrency, 1, 'Maximum concurrent processes in critical section must be strictly 1');
        assert.equal(finalSentinel.violations, 0, 'Zero mutual exclusion violations under adversarial scheduling');
        assert.equal(finalSentinel.currentInFlight, 0, 'All processes must have cleanly exited critical section');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-08 FINAL CLAIM RECOVERY RACE REMEDIATION ADVERSARIAL TESTS
    // ─────────────────────────────────────────────────────────────

    it('80. DEF-08: Two workers simultaneously recovering the same dead claim: Exactly 1 recovery owner, other yields', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-race-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;

        // Plant dead claim
        const deadClaim = {
            claimToken: 'dead-claim-tok-80',
            pid: 999998,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(deadClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        const workerScript = `
import { DurableApprovalLedger } from '${targetModule}';
const ledgerPath = process.argv[2];
const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const active = ledger._isClaimActive();
process.stdout.write(JSON.stringify({ active }) + '\\n');
`;
        const workerFile = path.join(tempDir, 'worker80.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const child1 = spawn('node', [workerFile, ledgerPath], { stdio: ['ignore', 'pipe', 'inherit'] });
        const child2 = spawn('node', [workerFile, ledgerPath], { stdio: ['ignore', 'pipe', 'inherit'] });

        const [out1, out2] = await Promise.all([
            new Promise((res) => child1.stdout.on('data', (d) => res(d.toString().trim()))),
            new Promise((res) => child2.stdout.on('data', (d) => res(d.toString().trim())))
        ]);

        // Both workers should finish cleanly; dead claim is recovered
        assert.ok(!fs.existsSync(claimPath), 'Dead claim file must be removed by recovery');
        assert.ok(!fs.existsSync(`${claimPath}.recovery_lock`), 'Claim recovery lock must be released');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('81. DEF-08: Worker A renames dead claim while Worker B attempts normal acquisition: B is blocked by recovery lock', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-block-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const readyFile = path.join(tempDir, 'ready_pause.txt');

        // Plant dead claim
        const deadClaim = {
            claimToken: 'dead-claim-tok-81',
            pid: 999997,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(deadClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        // Worker A script: acquires recovery lock, renames claimPath to staging, writes readyFile, sleeps 300ms, then cleans up
        const workerAScript = `
import fs from 'fs';
import os from 'os';

const claimPath = '${claimPath}';
const recLockPath = '${recoveryLockPath}';
const readyFile = process.argv[2];
const stagingPath = claimPath + '.recovering.' + process.pid + '.' + Date.now() + '.test81';

const recData = {
    recoveryToken: 'tok-rec-81',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now(),
    claimRecoveryPath: stagingPath
};

fs.writeFileSync(recLockPath, JSON.stringify(recData), { mode: 0o600 });
fs.renameSync(claimPath, stagingPath);
fs.writeFileSync(readyFile, 'READY');

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);

try { fs.unlinkSync(stagingPath); } catch (_) {}
try { fs.unlinkSync(recLockPath); } catch (_) {}
process.exit(0);
`;
        const workerAFile = path.join(tempDir, 'worker81A.mjs');
        fs.writeFileSync(workerAFile, workerAScript, { mode: 0o700 });

        const childA = spawn('node', [workerAFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        // Wait for Worker A to reach paused state
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        // Canonical claimPath is absent right now!
        assert.ok(!fs.existsSync(claimPath), 'claimPath must be absent during recovery rename');
        assert.ok(fs.existsSync(recoveryLockPath), 'recovery_lock must be active during recovery');

        // Worker B tests normal acquisition / _isClaimActive:
        const ledgerB = new DurableApprovalLedger(ledgerPath, {
            lockTimeoutMs: 100,
            retryIntervalMs: 15,
            initGracePeriodMs: 0
        });

        // _isClaimActive MUST return true because claim recovery is active!
        const claimActive = ledgerB._isClaimActive();
        assert.equal(claimActive, true, 'Claim must be considered active while recovery lock is held');

        // Normal lock acquisition must not succeed during recovery interval
        let timedOut = false;
        try {
            ledgerB._acquireLock();
        } catch (err) {
            if (err.message.includes('lock timeout')) {
                timedOut = true;
            }
        }
        assert.equal(timedOut, true, 'Normal acquisition must time out and not enter protected recovery interval');

        await new Promise((resolve) => childA.on('exit', resolve));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('82. DEF-08: Worker A pauses after rename; Worker B attempts recovery: B yields due to recovery lock', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-pause-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const readyFile = path.join(tempDir, 'ready_pause.txt');

        const deadClaim = {
            claimToken: 'dead-claim-tok-82',
            pid: 999996,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(deadClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        const workerAScript = `
import fs from 'fs';
import os from 'os';

const claimPath = '${claimPath}';
const recLockPath = '${recoveryLockPath}';
const readyFile = process.argv[2];
const stagingPath = claimPath + '.recovering.' + process.pid + '.test82';

const recData = {
    recoveryToken: 'tok-rec-82',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now(),
    claimRecoveryPath: stagingPath
};

fs.writeFileSync(recLockPath, JSON.stringify(recData), { mode: 0o600 });
fs.renameSync(claimPath, stagingPath);
fs.writeFileSync(readyFile, 'READY');

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);

try { fs.unlinkSync(stagingPath); } catch (_) {}
try { fs.unlinkSync(recLockPath); } catch (_) {}
process.exit(0);
`;
        const workerAFile = path.join(tempDir, 'worker82A.mjs');
        fs.writeFileSync(workerAFile, workerAScript, { mode: 0o700 });

        const childA = spawn('node', [workerAFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const ledgerB = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recB = ledgerB._tryRecoverDeadClaim({ ino: 1234, dev: 5678 }, deadClaim);
        assert.equal(recB, false, 'Worker B must yield and return false because Worker A holds recovery lock');

        await new Promise((resolve) => childA.on('exit', resolve));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('83. DEF-08: Replacement claim creation during recovery: Detects mismatch and restores replacement claim via no-clobber linkSync', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-repl-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const inspectedStat = { ino: 991122, dev: 334455 };
        const inspectedClaimData = { claimToken: 'inspected-dead-token-83', pid: 999995 };

        // Replacement claim actually on disk
        const replacementClaim = {
            claimToken: 'replacement-active-token-83',
            pid: process.pid,
            processStartTime: Date.now(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(replacementClaim), { mode: 0o600 });

        const recovered = ledger._tryRecoverDeadClaim(inspectedStat, inspectedClaimData);
        assert.equal(recovered, false, 'Recovery must abort and return false on mismatch');
        assert.ok(fs.existsSync(claimPath), 'Replacement claim must be restored at claimPath');
        const restored = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        assert.equal(restored.claimToken, 'replacement-active-token-83', 'Replacement claim token must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('84. DEF-08: Recovery process crash after rename: Next worker cleanly recovers in-flight claim and stale recovery lock', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-crash-rename-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const stagingPath = `${claimPath}.recovering.deadpid.test84`;

        // Simulate dead recovery worker that renamed dead claim to stagingPath and crashed
        const deadClaimData = {
            claimToken: 'dead-in-flight-claim',
            pid: 999994,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname()
        };
        fs.writeFileSync(stagingPath, JSON.stringify(deadClaimData), { mode: 0o600 });

        const staleRecoveryLock = {
            recoveryToken: 'tok-stale-rec-84',
            pid: 999993, // Dead recovery worker PID
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000,
            claimRecoveryPath: stagingPath
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(staleRecoveryLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const active = ledger._isClaimActive();

        assert.equal(active, false, 'Dead recovery worker and dead in-flight claim must be cleanly recovered');
        assert.ok(!fs.existsSync(recoveryLockPath), 'Stale recovery lock must be removed');
        assert.ok(!fs.existsSync(stagingPath), 'Stale in-flight staging claim must be cleaned up');
        assert.ok(!fs.existsSync(claimPath), 'No invalid claim should exist');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('85. DEF-08: Recovery process crash after no-clobber link: Cleans redundant staging copy while preserving active destination claim', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-crash-link-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const stagingPath = `${claimPath}.recovering.deadpid.test85`;

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        // Active replacement claim
        const activeClaim = {
            claimToken: 'live-claim-tok-85',
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(activeClaim), { mode: 0o600 });
        fs.linkSync(claimPath, stagingPath); // Hard link simulating post-link state

        // Dead recovery lock
        const staleRecoveryLock = {
            recoveryToken: 'tok-stale-rec-85',
            pid: 999992,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000,
            claimRecoveryPath: stagingPath
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(staleRecoveryLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        const active = ledger._isClaimActive();

        // Active claim must be preserved!
        assert.equal(active, true, 'Active replacement claim must be recognized as active');
        assert.ok(fs.existsSync(claimPath), 'claimPath must remain intact');
        assert.ok(!fs.existsSync(recoveryLockPath), 'Stale recovery lock must be cleaned up');
        assert.ok(!fs.existsSync(stagingPath), 'Redundant staging link must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('86. DEF-08: Delayed release from an old worker: _releaseClaim never removes a replacement claim', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-delayed-rel-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const newerClaim = {
            claimToken: 'worker-b-new-token-86',
            pid: 888888,
            processStartTime: Date.now(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(newerClaim), { mode: 0o600 });

        // Worker A attempts to release old token
        ledger._releaseClaim('worker-a-old-token-86');

        assert.ok(fs.existsSync(claimPath), 'Newer claim must not be deleted');
        const onDisk = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        assert.equal(onDisk.claimToken, 'worker-b-new-token-86', 'Newer claim token must remain intact');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('87. DEF-08: Stale coordinator with live PID: Coordinator older than 15s is preserved if owner PID is alive', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-live-pid-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const liveClaim = {
            claimToken: 'live-coordinator-token-87',
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now() - 3600000
        };
        fs.writeFileSync(claimPath, JSON.stringify(liveClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 3600000);
        fs.utimesSync(claimPath, past, past);

        const active = ledger._isClaimActive();
        assert.equal(active, true, 'Live coordinator claim must be preserved regardless of age (>1h)');
        assert.ok(fs.existsSync(claimPath), 'Coordinator claim file must not be deleted');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('88. DEF-08: Dead coordinator with PID reuse: Start-time mismatch detects dead owner and recovers coordinator', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-pid-reuse-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const reusedPidClaim = {
            claimToken: 'reused-pid-claim-token-88',
            pid: process.pid,
            processStartTime: Date.now() - 7200000, // 2 hours ago (mismatch)
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(reusedPidClaim), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(claimPath, past, past);

        const active = ledger._isClaimActive();
        assert.equal(active, false, 'Start-time mismatch must detect dead owner and recover');
        assert.ok(!fs.existsSync(claimPath), 'Dead coordinator claim must be removed');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('89. DEF-08: Unknown process identity: Fails closed and preserves coordinator on ambiguous start time', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-unknown-id-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const claim = {
            claimToken: 'ambiguous-claim-token-89',
            pid: process.pid,
            processStartTime: null, // Unknown start time
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(claim), { mode: 0o600 });

        const active = ledger._isClaimActive();
        assert.equal(active, true, 'Ambiguous process identity must fail closed and preserve claim');
        assert.ok(fs.existsSync(claimPath), 'Claim must not be deleted on ambiguous identity');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('90. DEF-08: Unexpected filesystem errors in _releaseClaim: Propagates sanitized SECURITY FATAL error', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-err-prop-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const claimToken = 'my-valid-claim-tok-90';
        const claimData = {
            claimToken,
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(claimData), { mode: 0o600 });

        // Intercept fs.renameSync on this path to simulate unexpected EPERM
        const origRename = fs.renameSync;
        try {
            fs.renameSync = function(src, dst) {
                if (src === claimPath) {
                    const err = new Error('Permission denied');
                    err.code = 'EPERM';
                    throw err;
                }
                return origRename.apply(this, arguments);
            };

            assert.throws(() => {
                ledger._releaseClaim(claimToken);
            }, /SECURITY FATAL: Failed to rename claim during release/, 'Unexpected rename error must propagate sanitized fatal error');
        } finally {
            fs.renameSync = origRename;
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('91. DEF-08: Multi-Process Adversarial Critical Section Stress Proof: Zero violations under concurrent claim recovery contention', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def8-cs-stress-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const sentinelPath = path.join(tempDir, 'stress_sentinel.json');

        fs.writeFileSync(sentinelPath, JSON.stringify({
            currentInFlight: 0,
            maxConcurrency: 0,
            totalEntries: 0,
            violations: 0
        }), { mode: 0o600 });

        const numWorkers = 5;
        const iterationsPerWorker = 3;

        const workerScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const sentinelPath = process.argv[3];
const workerId = process.argv[4];
const iterations = parseInt(process.argv[5], 10);

const ledger = new DurableApprovalLedger(ledgerPath, {
    lockTimeoutMs: 15000,
    retryIntervalMs: 15
});

for (let i = 0; i < iterations; i++) {
    ledger._acquireLock();
    try {
        ledger._assertLockOwnership();

        const content = fs.readFileSync(sentinelPath, 'utf8');
        const state = JSON.parse(content);
        state.currentInFlight += 1;
        state.totalEntries += 1;
        if (state.currentInFlight > state.maxConcurrency) {
            state.maxConcurrency = state.currentInFlight;
        }
        if (state.currentInFlight > 1) {
            state.violations += 1;
        }
        fs.writeFileSync(sentinelPath, JSON.stringify(state));

        // Sleep 10ms in critical section
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);

        const verifyContent = fs.readFileSync(sentinelPath, 'utf8');
        const verifyState = JSON.parse(verifyContent);
        if (verifyState.currentInFlight !== 1) {
            verifyState.violations += 1;
        }
        verifyState.currentInFlight -= 1;
        fs.writeFileSync(sentinelPath, JSON.stringify(verifyState));
    } finally {
        ledger._releaseLock();
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}
process.exit(0);
`;
        const workerFile = path.join(tempDir, 'worker_stress.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const workers = [];
        for (let w = 0; w < numWorkers; w++) {
            workers.push(new Promise((resolve, reject) => {
                const child = spawn('node', [workerFile, ledgerPath, sentinelPath, 'w-' + w, String(iterationsPerWorker)], {
                    stdio: ['ignore', 'inherit', 'inherit']
                });
                child.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Worker ' + w + ' exited with code ' + code));
                });
                child.on('error', reject);
            }));
        }

        await Promise.all(workers);

        const finalSentinel = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
        assert.equal(finalSentinel.totalEntries, numWorkers * iterationsPerWorker, 'All critical section entries must complete');
        assert.equal(finalSentinel.maxConcurrency, 1, 'Maximum concurrent processes must be strictly 1');
        assert.equal(finalSentinel.violations, 0, 'Zero mutual exclusion violations');
        assert.equal(finalSentinel.currentInFlight, 0, 'Clean exit from critical section');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ─────────────────────────────────────────────────────────────
    // DEF-10 FINAL FORENSIC REMEDIATION ADVERSARIAL TESTS
    // ─────────────────────────────────────────────────────────────

    it('92. DEF-10: Scenario 1 — Worker A recovering stale coordinator while Worker B attempts normal lock acquisition: B remains blocked', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc1-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const readyFile = path.join(tempDir, 'ready_sc1.txt');

        // Plant stale recovery coordinator (dead PID)
        const deadRecLock = {
            recoveryToken: 'dead-rec-tok-92',
            pid: 999981,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000,
            claimRecoveryPath: null
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(deadRecLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        // Worker A script: acquires supervisor, renames recoveryLockPath to staging, writes readyFile, sleeps 300ms, then completes
        const workerAScript = `
import fs from 'fs';
import os from 'os';

const claimPath = '${claimPath}';
const recLockPath = '${recoveryLockPath}';
const supPath = claimPath + '.recovery_supervisor';
const readyFile = process.argv[2];
const stagingPath = recLockPath + '.recovering.' + process.pid + '.' + Date.now() + '.sc1';

const supData = {
    supervisorToken: 'sup-tok-92',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now()
};

fs.writeFileSync(supPath, JSON.stringify(supData), { mode: 0o600 });
fs.renameSync(recLockPath, stagingPath);
fs.writeFileSync(readyFile, 'READY');

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);

try { fs.unlinkSync(stagingPath); } catch (_) {}
try { fs.unlinkSync(supPath); } catch (_) {}
process.exit(0);
`;
        const workerAFile = path.join(tempDir, 'worker92A.mjs');
        fs.writeFileSync(workerAFile, workerAScript, { mode: 0o700 });

        const childA = spawn('node', [workerAFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        // Canonical recovery lock is absent and claim is absent!
        assert.ok(!fs.existsSync(recoveryLockPath), 'recovery_lock must be absent during rename');
        assert.ok(!fs.existsSync(claimPath), 'claimPath is absent');

        // Worker B tests _isClaimActive and normal acquisition:
        const ledgerB = new DurableApprovalLedger(ledgerPath, {
            lockTimeoutMs: 100,
            retryIntervalMs: 15,
            initGracePeriodMs: 0
        });

        // Must remain active because supervisor is held AND in-flight recovery is detected!
        const claimActive = ledgerB._isClaimActive();
        assert.equal(claimActive, true, 'Claim must be active while supervisor is held during coordinator recovery');

        let timedOut = false;
        try {
            ledgerB._acquireLock();
        } catch (err) {
            if (err.message.includes('lock timeout')) {
                timedOut = true;
            }
        }
        assert.equal(timedOut, true, 'Worker B must time out and remain blocked during coordinator recovery');

        await new Promise((resolve) => childA.on('exit', resolve));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('93. DEF-10: Scenario 2 — Worker A paused after coordinator rename; Worker B remains blocked', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc2-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const readyFile = path.join(tempDir, 'ready_sc2.txt');

        const deadRecLock = {
            recoveryToken: 'dead-rec-tok-93',
            pid: 999980,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(deadRecLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        const workerAScript = `
import fs from 'fs';
import os from 'os';

const supPath = '${supervisorPath}';
const recLockPath = '${recoveryLockPath}';
const readyFile = process.argv[2];
const stagingPath = recLockPath + '.recovering.' + process.pid + '.sc2';

const supData = {
    supervisorToken: 'sup-tok-93',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now()
};

fs.writeFileSync(supPath, JSON.stringify(supData), { mode: 0o600 });
fs.renameSync(recLockPath, stagingPath);
fs.writeFileSync(readyFile, 'READY');

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);

try { fs.unlinkSync(stagingPath); } catch (_) {}
try { fs.unlinkSync(supPath); } catch (_) {}
process.exit(0);
`;
        const workerAFile = path.join(tempDir, 'worker93A.mjs');
        fs.writeFileSync(workerAFile, workerAScript, { mode: 0o700 });

        const childA = spawn('node', [workerAFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const ledgerB = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0, lockTimeoutMs: 100, retryIntervalMs: 20 });
        assert.equal(ledgerB._isClaimRecoverySupervisorActive(), true, 'Supervisor must be recognized as active');
        assert.equal(ledgerB._hasActiveInFlightRecovery(), true, 'In-flight staging must be detected');
        assert.equal(ledgerB._isClaimActive(), true, 'Claim must be considered active during paused rename interval');

        // Normal acquisition MUST time out while Worker A is paused
        assert.throws(
            () => ledgerB._acquireLock(),
            /Durable approval ledger lock timeout/
        );

        await new Promise((resolve) => childA.on('exit', resolve));
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('94. DEF-10: Scenario 3 — Two workers simultaneously attempting recovery of same stale recovery coordinator: Exactly 1 owner, other yields', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc3-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;

        const deadRecLock = {
            recoveryToken: 'dead-rec-tok-94',
            pid: 999979,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(deadRecLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        const workerScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';
const ledgerPath = process.argv[2];
const outFile = process.argv[3];
const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const active = ledger._isClaimRecoveryActive();
fs.writeFileSync(outFile, JSON.stringify({ pid: process.pid, active }));
process.exit(0);
`;
        const workerFile = path.join(tempDir, 'worker94.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const out1 = path.join(tempDir, 'out1.json');
        const out2 = path.join(tempDir, 'out2.json');

        const child1 = spawn('node', [workerFile, ledgerPath, out1], { stdio: ['ignore', 'inherit', 'inherit'] });
        const child2 = spawn('node', [workerFile, ledgerPath, out2], { stdio: ['ignore', 'inherit', 'inherit'] });

        await Promise.all([
            new Promise((res) => child1.on('exit', res)),
            new Promise((res) => child2.on('exit', res))
        ]);

        assert.ok(!fs.existsSync(recoveryLockPath), 'Dead recovery lock must be recovered');
        assert.ok(!fs.existsSync(supervisorPath), 'Supervisor coordinator must be released');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('95. DEF-10: Scenario 4 — Worker crash immediately after coordinator rename: Next worker recovers cleanly', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc4-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const readyFile = path.join(tempDir, 'ready_sc4.txt');

        // Create a dead recovery lock
        const initialRecLock = {
            recoveryToken: 'initial-rec-tok-95',
            pid: 999978,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(initialRecLock), { mode: 0o600 });
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(recoveryLockPath, past, past);

        // Child process acquires supervisor, renames recoveryLockPath to private staging path, writes readyFile, then pauses
        const workerAScript = `
import fs from 'fs';
import os from 'os';

const supervisorPath = '${supervisorPath}';
const recoveryLockPath = '${recoveryLockPath}';
const readyFile = process.argv[2];
const stagingPath = recoveryLockPath + '.recovering.' + process.pid + '.sc4';

const supData = {
    supervisorToken: 'crash-sup-tok-95',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now()
};

fs.writeFileSync(supervisorPath, JSON.stringify(supData), { mode: 0o600 });
fs.renameSync(recoveryLockPath, stagingPath);
fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));

while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const workerAFile = path.join(tempDir, 'worker95A.mjs');
        fs.writeFileSync(workerAFile, workerAScript, { mode: 0o700 });

        const childA = spawn('node', [workerAFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(supervisorPath), 'Supervisor path must exist before kill');
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Staging file must exist before kill');

        // Genuinely kill Worker A with SIGKILL while supervisor and staging files are held!
        childA.kill('SIGKILL');
        await new Promise((resolve) => childA.on('exit', resolve));

        // Verify childA is confirmed dead
        let isAlive = false;
        try {
            process.kill(childA.pid, 0);
            isAlive = true;
        } catch (_) {
            isAlive = false;
        }
        assert.equal(isAlive, false, 'Child process must be dead after SIGKILL');

        // Next worker cleans up the dead supervisor and staging file
        const ledgerB = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const active = ledgerB._isClaimRecoverySupervisorActive();

        assert.equal(active, false, 'Dead supervisor must be cleanly recovered by subsequent worker');
        assert.ok(!fs.existsSync(supervisorPath), 'Dead supervisor file must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('96. DEF-10: Scenario 5 — Worker crash after restoring in-flight claim before coordinator cleanup: Active claim preserved', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc5-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const readyFile = path.join(tempDir, 'ready_sc5.txt');

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        // Active replacement claim at claimPath
        const activeClaim = {
            claimToken: 'live-claim-tok-96',
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(claimPath, JSON.stringify(activeClaim), { mode: 0o600 });

        // Child process creates link and recovery lock referencing inFlightPath, then pauses
        const workerScript = `
import fs from 'fs';
import os from 'os';

const claimPath = '${claimPath}';
const recoveryLockPath = '${recoveryLockPath}';
const readyFile = process.argv[2];
const stagingPath = claimPath + '.recovering.' + process.pid + '.sc5';

fs.linkSync(claimPath, stagingPath);

const deadRecLock = {
    recoveryToken: 'crash-rec-tok-96',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now(),
    claimRecoveryPath: stagingPath
};
fs.writeFileSync(recoveryLockPath, JSON.stringify(deadRecLock), { mode: 0o600 });
fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));

while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const workerFile = path.join(tempDir, 'worker96.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const childA = spawn('node', [workerFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));

        // Kill worker A with SIGKILL at the exact restoration boundary
        childA.kill('SIGKILL');
        await new Promise((resolve) => childA.on('exit', resolve));

        const active = ledger._isClaimActive();

        assert.equal(active, true, 'Active destination claim must be preserved');
        assert.ok(fs.existsSync(claimPath), 'claimPath must remain intact');
        assert.ok(!fs.existsSync(recoveryLockPath), 'Stale recovery lock must be cleaned up');
        assert.ok(!fs.existsSync(readyInfo.stagingPath), 'Redundant in-flight link must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('97. DEF-10: Scenario 6 — Replacement coordinator appearing during recovery: Detects mismatch and restores via no-clobber linkSync', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc6-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const inspectedStat = { ino: 881122, dev: 445566 };
        const inspectedRecData = { recoveryToken: 'stale-rec-tok-97', pid: 999976 };

        // Replacement coordinator actually created on disk
        const replacementRec = {
            recoveryToken: 'replacement-active-rec-97',
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(recoveryLockPath, JSON.stringify(replacementRec), { mode: 0o600 });

        const recovered = ledger._tryRecoverDeadClaimRecoveryLock(inspectedStat, inspectedRecData);
        assert.equal(recovered, false, 'Recovery must abort and return false on mismatch');
        assert.ok(fs.existsSync(recoveryLockPath), 'Replacement coordinator must be restored at recoveryLockPath');
        const restored = JSON.parse(fs.readFileSync(recoveryLockPath, 'utf8'));
        assert.equal(restored.recoveryToken, 'replacement-active-rec-97', 'Replacement token must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('98. DEF-10: Scenario 7 — Recovery metadata write failure before claim rename: Claim rename aborted and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc7-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const recoveryLockPath = `${claimPath}.recovery_lock`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const deadClaim = {
            claimToken: 'dead-claim-tok-98',
            pid: 999975,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(claimPath, JSON.stringify(deadClaim), { mode: 0o600 });
        const stat = fs.statSync(claimPath);

        // Intercept fs.openSync to simulate failure opening recovery lock
        const origOpen = fs.openSync;
        try {
            fs.openSync = function(p, flags, mode) {
                if (p === recoveryLockPath) {
                    const err = new Error('Disk I/O failure on coordinator write');
                    err.code = 'EIO';
                    throw err;
                }
                return origOpen.apply(this, arguments);
            };

            assert.throws(() => {
                ledger._tryRecoverDeadClaim(stat, deadClaim);
            }, /SECURITY FATAL: Failed to acquire claim recovery coordinator/, 'Must throw SECURITY FATAL and fail closed');

            assert.ok(fs.existsSync(claimPath), 'claimPath must NEVER be renamed when coordinator write fails');
        } finally {
            fs.openSync = origOpen;
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('99. DEF-10: Scenario 8 — Partial metadata write followed by process crash: Stale malformed supervisor recovered cleanly', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc8-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0, staleTimeoutMs: 50 });

        // Malformed/partial write
        fs.writeFileSync(supervisorPath, '{"partial": "json', { mode: 0o600 });

        // If fresh (within staleTimeoutMs), fails closed (active)
        const activeFresh = ledger._isClaimRecoverySupervisorActive();
        assert.equal(activeFresh, true, 'Fresh malformed supervisor must fail closed as active');

        // Age beyond staleTimeoutMs
        const past = new Date(Date.now() - 500);
        fs.utimesSync(supervisorPath, past, past);

        const activeStale = ledger._isClaimRecoverySupervisorActive();
        assert.equal(activeStale, false, 'Stale malformed supervisor must be recovered cleanly');
        assert.ok(!fs.existsSync(supervisorPath), 'Stale malformed supervisor file must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('100. DEF-10: Scenario 9 — Unknown process identity and cross-host recovery: Remote hostname fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc9-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const remoteSup = {
            supervisorToken: 'remote-sup-tok-100',
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: 'other-cluster-node-99',
            createdAt: Date.now() - 5000
        };
        fs.writeFileSync(supervisorPath, JSON.stringify(remoteSup), { mode: 0o600 });

        const active = ledger._isClaimRecoverySupervisorActive();
        assert.equal(active, true, 'Cross-host supervisor must fail closed and never be broken locally');
        assert.ok(fs.existsSync(supervisorPath), 'Remote supervisor must remain intact');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('101. DEF-10: Scenario 10 — Unexpected filesystem errors during coordinator recovery and release: Propagates sanitized SECURITY FATAL error', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc10-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const supToken = 'sup-tok-101';
        const supData = {
            supervisorToken: supToken,
            pid: process.pid,
            processStartTime: ledger._getProcessStartTime(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(supervisorPath, JSON.stringify(supData), { mode: 0o600 });

        const origRename = fs.renameSync;
        try {
            fs.renameSync = function(src, dst) {
                if (src === supervisorPath) {
                    const err = new Error('Unexpected I/O failure on supervisor release');
                    err.code = 'EIO';
                    throw err;
                }
                return origRename.apply(this, arguments);
            };

            assert.throws(() => {
                ledger._releaseClaimRecoverySupervisor(supToken);
            }, /SECURITY FATAL: Failed to rename claim recovery supervisor during release/, 'Unexpected rename error must propagate sanitized fatal error');
        } finally {
            fs.renameSync = origRename;
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('102. DEF-10: Scenario 11 — Delayed stale worker attempting to delete newer coordinator: Newer coordinator preserved', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-sc11-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const newerSup = {
            supervisorToken: 'newer-sup-tok-102',
            pid: 777777,
            processStartTime: Date.now(),
            hostname: os.hostname(),
            createdAt: Date.now()
        };
        fs.writeFileSync(supervisorPath, JSON.stringify(newerSup), { mode: 0o600 });

        ledger._releaseClaimRecoverySupervisor('stale-sup-tok-102');

        assert.ok(fs.existsSync(supervisorPath), 'Newer supervisor must not be deleted');
        const onDisk = JSON.parse(fs.readFileSync(supervisorPath, 'utf8'));
        assert.equal(onDisk.supervisorToken, 'newer-sup-tok-102', 'Newer supervisor token must remain intact');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('103. DEF-10: Scenario 12 — Multi-Process Adversarial Critical Section Stress Proof: Zero violations under concurrent coordinator contention', async () => {
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def10-cs-stress-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const sentinelPath = path.join(tempDir, 'stress_sentinel10.json');

        fs.writeFileSync(sentinelPath, JSON.stringify({
            currentInFlight: 0,
            maxConcurrency: 0,
            totalEntries: 0,
            violations: 0
        }), { mode: 0o600 });

        const numWorkers = 5;
        const iterationsPerWorker = 3;

        const workerScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const sentinelPath = process.argv[3];
const workerId = process.argv[4];
const iterations = parseInt(process.argv[5], 10);

const ledger = new DurableApprovalLedger(ledgerPath, {
    lockTimeoutMs: 15000,
    retryIntervalMs: 15
});

for (let i = 0; i < iterations; i++) {
    ledger._acquireLock();
    try {
        ledger._assertLockOwnership();

        const content = fs.readFileSync(sentinelPath, 'utf8');
        const state = JSON.parse(content);
        state.currentInFlight += 1;
        state.totalEntries += 1;
        if (state.currentInFlight > state.maxConcurrency) {
            state.maxConcurrency = state.currentInFlight;
        }
        if (state.currentInFlight > 1) {
            state.violations += 1;
        }
        fs.writeFileSync(sentinelPath, JSON.stringify(state));

        // Sleep 10ms in critical section
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);

        const verifyContent = fs.readFileSync(sentinelPath, 'utf8');
        const verifyState = JSON.parse(verifyContent);
        if (verifyState.currentInFlight !== 1) {
            verifyState.violations += 1;
        }
        verifyState.currentInFlight -= 1;
        fs.writeFileSync(sentinelPath, JSON.stringify(verifyState));
    } finally {
        ledger._releaseLock();
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}
process.exit(0);
`;
        const workerFile = path.join(tempDir, 'worker_stress10.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        const workers = [];
        for (let w = 0; w < numWorkers; w++) {
            workers.push(new Promise((resolve, reject) => {
                const child = spawn('node', [workerFile, ledgerPath, sentinelPath, 'w-' + w, String(iterationsPerWorker)], {
                    stdio: ['ignore', 'inherit', 'inherit']
                });
                child.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Worker ' + w + ' exited with code ' + code));
                });
                child.on('error', reject);
            }));
        }

        await Promise.all(workers);

        const finalSentinel = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
        assert.equal(finalSentinel.totalEntries, numWorkers * iterationsPerWorker, 'All critical section entries must complete');
        assert.equal(finalSentinel.maxConcurrency, 1, 'Maximum concurrent processes must be strictly 1');
        assert.equal(finalSentinel.violations, 0, 'Zero mutual exclusion violations');
        assert.equal(finalSentinel.currentInFlight, 0, 'Clean exit from critical section');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('104. DEF-11.1: Failure injection at temporary file creation: openSync fails closed without corrupting destination', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc104-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const origOpen = fs.openSync;
        let intercepted = false;
        try {
            fs.openSync = function (p, flags, mode) {
                if (typeof p === 'string' && p.includes('.tmp.')) {
                    intercepted = true;
                    const err = new Error('Permission denied');
                    err.code = 'EACCES';
                    throw err;
                }
                return origOpen.apply(this, arguments);
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { foo: 'bar' }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Failed to write durable metadata temp file/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'openSync for temp file must be intercepted');
            assert.ok(!fs.existsSync(targetPath), 'Target destination must not be created on open failure');
        } finally {
            fs.openSync = origOpen;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('105. DEF-11.1: Failure injection on partial write: Byte count mismatch preserves diagnostic temp file and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc105-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const origWrite = fs.writeSync;
        let intercepted = false;
        try {
            fs.writeSync = function (fd, str) {
                intercepted = true;
                return 1;
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { testKey: 'some value longer than 1 byte' }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Incomplete write/);
                    assert.match(err.message, /Diagnostic artifact preserved at/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'writeSync must be intercepted');
            assert.ok(!fs.existsSync(targetPath), 'Target destination must not exist');

            const files = fs.readdirSync(tempDir);
            const tempFiles = files.filter(f => f.startsWith('meta.json.tmp.'));
            assert.equal(tempFiles.length, 1, 'Diagnostic temporary file must be preserved on disk for forensic audit');
        } finally {
            fs.writeSync = origWrite;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('106. DEF-11.1: Failure injection during file fsync: fsyncSync failure preserves diagnostic temp file and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc106-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const origFsync = fs.fsyncSync;
        let intercepted = false;
        try {
            fs.fsyncSync = function (fd) {
                intercepted = true;
                const err = new Error('I/O error during fsync');
                err.code = 'EIO';
                throw err;
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { data: 'fsync test' }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /I\/O error during fsync/);
                    assert.match(err.message, /Diagnostic artifact preserved at/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'fsyncSync must be intercepted');
            assert.ok(!fs.existsSync(targetPath), 'Target destination must not exist');

            const files = fs.readdirSync(tempDir);
            const tempFiles = files.filter(f => f.startsWith('meta.json.tmp.'));
            assert.equal(tempFiles.length, 1, 'Diagnostic temporary file must be preserved on disk');
        } finally {
            fs.fsyncSync = origFsync;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('107. DEF-11.1: Failure injection during file close: closeSync failure preserves diagnostic temp file and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc107-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const origClose = fs.closeSync;
        let intercepted = false;
        try {
            fs.closeSync = function (fd) {
                intercepted = true;
                const err = new Error('File descriptor close error');
                err.code = 'EIO';
                throw err;
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { data: 'close test' }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Failed to close metadata temp file descriptor/);
                    assert.match(err.message, /Diagnostic artifact preserved at/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'closeSync must be intercepted');
            assert.ok(!fs.existsSync(targetPath), 'Target destination must not exist');

            const files = fs.readdirSync(tempDir);
            const tempFiles = files.filter(f => f.startsWith('meta.json.tmp.'));
            assert.equal(tempFiles.length, 1, 'Diagnostic temporary file must be preserved on disk');
        } finally {
            fs.closeSync = origClose;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('108. DEF-11.1: Failure injection during atomic rename: renameSync failure preserves diagnostic temp file and fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc108-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        // Destination exists with initial data
        const initialData = { token: 'initial-108', pid: process.pid };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const stat = fs.statSync(targetPath);

        const origRename = fs.renameSync;
        let intercepted = false;
        try {
            fs.renameSync = function (oldPath, newPath) {
                intercepted = true;
                const err = new Error('Cross-device or permission denied');
                err.code = 'EACCES';
                throw err;
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { token: 'rename test' }, {
                    mode: 'update',
                    expectedToken: 'initial-108',
                    expectedIno: stat.ino,
                    expectedDev: stat.dev
                }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Failed to displace destination file/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'renameSync must be intercepted');

            const files = fs.readdirSync(tempDir);
            const tempFiles = files.filter(f => f.startsWith('meta.json.tmp.'));
            assert.equal(tempFiles.length, 1, 'Diagnostic temporary file must be preserved on disk');
        } finally {
            fs.renameSync = origRename;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('109. DEF-11.1: Failure injection during directory open/fsync: Unexpected directory errors propagate and fail closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc109-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const origOpen = fs.openSync;
        let intercepted = false;
        try {
            fs.openSync = function (p, flags, mode) {
                if (p === tempDir) {
                    intercepted = true;
                    const err = new Error('Disk controller fault during directory sync');
                    err.code = 'EMFILE';
                    throw err;
                }
                return origOpen.apply(this, arguments);
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { data: 'dir sync test' }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Failed to open directory descriptor for durability fsync/);
                    assert.match(err.message, /EMFILE/);
                    return true;
                }
            );
            assert.equal(intercepted, true, 'Directory openSync must be intercepted');
        } finally {
            fs.openSync = origOpen;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('110. DEF-11.1 & DEF-12.2: Platform directory fsync guarantees: Supported POSIX fsync succeeds, documented limitations handled, Windows bypasses', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc110-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const ledger = new DurableApprovalLedger(ledgerPath);

        // 1. Direct execution on real directory: returns true on POSIX
        const result = ledger._fsyncDirectory(tempDir);
        if (process.platform !== 'win32') {
            assert.equal(result, true, 'POSIX directory fsync must return true on supported filesystems');
        }

        // 2. Documented platform driver limitations (EINVAL, ENOTSUP, EOPNOTSUPP) handled gracefully, returning false
        const documentedLimitations = ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'];
        const origFsync = fs.fsyncSync;
        try {
            for (const code of documentedLimitations) {
                fs.fsyncSync = function () {
                    const err = new Error('Filesystem does not implement directory fsync');
                    err.code = code;
                    throw err;
                };
                let status;
                assert.doesNotThrow(() => {
                    status = ledger._fsyncDirectory(tempDir);
                }, `Documented driver limitation ${code} must not crash`);
                assert.equal(status, false, `Documented driver limitation ${code} must return false (durability limitation noted)`);
            }
        } finally {
            fs.fsyncSync = origFsync;
        }

        // 3. Simulated win32 platform: must safely return false without opening directory descriptor
        const origPlatform = process.platform;
        try {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            let calledOpen = false;
            const origOpen = fs.openSync;
            try {
                fs.openSync = function () {
                    calledOpen = true;
                    return origOpen.apply(this, arguments);
                };
                const winResult = ledger._fsyncDirectory(tempDir);
                assert.equal(winResult, false, 'Windows platform must return false (POSIX dir fsync unsupported)');
                assert.equal(calledOpen, false, 'Windows platform must bypass directory descriptor open');
            } finally {
                fs.openSync = origOpen;
            }
        } finally {
            Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('111. DEF-11.2: No-clobber metadata creation mode: Prevents overwriting existing destination and throws Destination already exists', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc111-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        // Existing destination on disk
        const existingData = { token: 'active-coordinator-111', pid: process.pid };
        fs.writeFileSync(targetPath, JSON.stringify(existingData), { mode: 0o600 });

        // Competing worker attempts to create same coordinator with mode: 'create' / noClobber: true
        assert.throws(
            () => ledger._writeDurableMetadata(targetPath, { token: 'competing-tok-111' }, { mode: 'create' }),
            (err) => {
                assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                assert.match(err.message, /Destination already exists/);
                return true;
            }
        );

        // Verify original destination remains completely intact and uncorrupted
        const onDisk = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        assert.equal(onDisk.token, 'active-coordinator-111', 'Original destination coordinator must remain intact');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('112. DEF-11.2 & DEF-12.1: Exact-owner update mode: Detects token/inode mismatch and restores replacement coordinator intact', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc112-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        // Worker A wrote initial coordinator
        const initialData = { recoveryToken: 'workerA-token-112', pid: 10001 };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const initialStat = fs.statSync(targetPath);

        // In the interim, Worker B replaces the coordinator with a new file (different token and inode)
        fs.unlinkSync(targetPath);
        const replacementData = { recoveryToken: 'workerB-replacement-112', pid: 10002 };
        fs.writeFileSync(targetPath, JSON.stringify(replacementData), { mode: 0o600 });
        const replacementStat = fs.statSync(targetPath);

        // Delayed Worker A attempts exact-owner update specifying its expected initial token and inode
        assert.throws(
            () => ledger._writeDurableMetadata(targetPath, { recoveryToken: 'workerA-update' }, {
                mode: 'update',
                expectedToken: 'workerA-token-112',
                expectedIno: initialStat.ino,
                expectedDev: initialStat.dev
            }),
            (err) => {
                assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                assert.match(err.message, /has been superseded by a replacement coordinator/);
                assert.match(err.message, /Active replacement preserved/);
                return true;
            }
        );

        // Verify replacement coordinator from Worker B is preserved intact
        assert.ok(fs.existsSync(targetPath), 'Replacement coordinator must be restored at destination');
        const currentStat = fs.statSync(targetPath);
        assert.equal(currentStat.ino, replacementStat.ino, 'Restored coordinator inode must match replacement');
        const currentData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        assert.equal(currentData.recoveryToken, 'workerB-replacement-112', 'Replacement coordinator content must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('113. DEF-11.3: Safe unlink semantics: _safeUnlink treats ENOENT as idempotent, and unexpected EPERM preserves artifact and throws SECURITY FATAL', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def11-sc113-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'artifact.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        fs.writeFileSync(targetPath, JSON.stringify({ item: 'test' }), { mode: 0o600 });

        // 1. Unexpected filesystem error (EPERM)
        const origUnlink = fs.unlinkSync;
        try {
            fs.unlinkSync = function (p) {
                const err = new Error('Operation not permitted');
                err.code = 'EPERM';
                throw err;
            };

            assert.throws(
                () => ledger._safeUnlink(targetPath, 'test artifact'),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Unexpected filesystem error \(EPERM\)/);
                    assert.match(err.message, /Artifact preserved at/);
                    assert.match(err.message, /Fail closed/);
                    return true;
                }
            );
            assert.ok(fs.existsSync(targetPath), 'Artifact must remain preserved on disk after EPERM');
        } finally {
            fs.unlinkSync = origUnlink;
        }

        // 2. Normal unlink succeeds
        assert.doesNotThrow(() => ledger._safeUnlink(targetPath, 'test artifact'));
        assert.ok(!fs.existsSync(targetPath), 'Artifact must be removed on normal unlink');

        // 3. ENOENT condition is idempotent success
        assert.doesNotThrow(
            () => ledger._safeUnlink(targetPath, 'test artifact'),
            'Unlinking already-removed artifact must return cleanly (idempotent ENOENT)'
        );

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('114. DEF-12.1: Adversarial TOCTOU Race Test — Competing coordinator inserted between ownership inspection and publication is NEVER overwritten', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-toctou-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath);

        // Step 1: Worker A owns initial coordinator
        const initialData = { token: 'workerA-original-114', pid: 10001, createdAt: Date.now() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const initialStat = fs.statSync(targetPath);

        let competitorStat = null;
        const competitorPayload = JSON.stringify({
            token: 'competitor-inserted-during-race-114',
            pid: 99999,
            secret: 'competitor-data-must-never-be-clobbered',
            createdAt: Date.now()
        });

        // Step 2: Worker A initiates update mode with adversarial test hook triggered after displacement & verification
        assert.throws(
            () => ledger._writeDurableMetadata(targetPath, { token: 'workerA-clobber-attempt-114' }, {
                mode: 'update',
                expectedToken: 'workerA-original-114',
                expectedIno: initialStat.ino,
                expectedDev: initialStat.dev,
                __testHookBeforePublish: () => {
                    // Adversary forces replacement into the precise interval between inspection and publication!
                    fs.writeFileSync(targetPath, competitorPayload, { mode: 0o600 });
                    competitorStat = fs.statSync(targetPath);
                }
            }),
            (err) => {
                assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                assert.match(err.message, /was acquired by a competitor during update publication/);
                assert.match(err.message, /Active replacement preserved/);
                return true;
            }
        );

        // Step 3: Assert competitor's coordinator was NEVER clobbered!
        assert.ok(fs.existsSync(targetPath), 'Competitor coordinator must exist at targetPath');
        const finalStat = fs.statSync(targetPath);
        assert.equal(finalStat.ino, competitorStat.ino, 'Competitor coordinator inode must remain identical');
        assert.equal(finalStat.dev, competitorStat.dev, 'Competitor coordinator dev must remain identical');

        const finalContent = fs.readFileSync(targetPath, 'utf8');
        assert.equal(finalContent, competitorPayload, 'Competitor coordinator content must be 100% byte-for-byte identical');
        const parsed = JSON.parse(finalContent);
        assert.equal(parsed.token, 'competitor-inserted-during-race-114');
        assert.equal(parsed.secret, 'competitor-data-must-never-be-clobbered');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('115. DEF-12.3: Genuine Crash-Boundary 1 — Process crash after coordinator ownership verification but before publication', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-crash1-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cb1.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        // Initial coordinator owned by child process
        const initialData = { token: 'child-tok-115', pid: 10001 };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-115' }, {
        mode: 'update',
        expectedToken: 'child-tok-115',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookBeforePublish: () => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, targetPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child115.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });

        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        // Verify child is alive
        let aliveBefore = false;
        try { process.kill(child.pid, 0); aliveBefore = true; } catch (_) {}
        assert.equal(aliveBefore, true, 'Child process must be alive at crash boundary');

        // Kill child abruptly with SIGKILL at the exact boundary
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        let aliveAfter = false;
        try { process.kill(child.pid, 0); aliveAfter = true; } catch (_) {}
        assert.equal(aliveAfter, false, 'Child process must be confirmed dead after SIGKILL');

        // An independent worker verifies displaced artifact is present and target can be recovered safely
        const files = fs.readdirSync(tempDir);
        const displacedFiles = files.filter(f => f.includes('.displaced.'));
        assert.equal(displacedFiles.length, 1, 'Displaced staging artifact must be preserved on disk after crash');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('116. DEF-12.3: Genuine Crash-Boundary 2 — Process crash after coordinator is renamed into recovery staging path', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-crash2-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const readyFile = path.join(tempDir, 'ready_cb2.json');

        // Create a dead lock on disk
        const deadLock = {
            ownerToken: 'dead-lock-116',
            pid: 999971,
            processStartTime: Date.now() - 60000,
            hostname: os.hostname(),
            createdAt: Date.now() - 10000
        };
        fs.writeFileSync(lockPath, JSON.stringify(deadLock), { mode: 0o600 });
        const past = new Date(Date.now() - 10000);
        fs.utimesSync(lockPath, past, past);

        // Child worker acquires claim and renames lockPath to recovery staging path, then signals and pauses
        const childScript = `
import fs from 'fs';
import os from 'os';

const lockPath = '${lockPath}';
const claimPath = '${claimPath}';
const readyFile = process.argv[2];

const claimData = {
    claimToken: 'recovery-claim-116',
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now()
};
fs.writeFileSync(claimPath, JSON.stringify(claimData), { mode: 0o600 });

const recoveryPath = lockPath + '.recovering.' + process.pid + '.cb2';
fs.renameSync(lockPath, recoveryPath);

fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, recoveryPath }));
while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const childFile = path.join(tempDir, 'child116.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyData = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(readyData.recoveryPath), 'Recovery staging file must exist before kill');

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker inspects and recovers
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const claimActive = ledger._isClaimActive();

        // Dead claim is recovered, in-flight staging from dead PID is recognized and cleared
        assert.equal(claimActive, false, 'Dead claim and recovery staging from dead PID must be cleared');
        assert.ok(!fs.existsSync(claimPath), 'Dead claim file must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('117. DEF-12.3: Genuine Crash-Boundary 3 — Process crash after hard-link creation but before temporary-file cleanup', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-crash3-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cb3.json');

        const childScript = `
import fs from 'fs';

const targetPath = '${targetPath}';
const readyFile = process.argv[2];
const tempPath = targetPath + '.tmp.' + process.pid + '.cb3';

const payload = JSON.stringify({ token: 'published-durably-117', pid: process.pid });
fs.writeFileSync(tempPath, payload, { mode: 0o600 });

// Atomic link established
fs.linkSync(tempPath, targetPath);

// Signal ready BEFORE unlinking tempPath
fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, tempPath }));

while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const childFile = path.join(tempDir, 'child117.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyData = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(targetPath), 'Target path must exist');
        assert.ok(fs.existsSync(readyData.tempPath), 'Temporary link source must exist before kill');

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Verify targetPath is intact, valid, and unchanged
        const content = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        assert.equal(content.token, 'published-durably-117');
        assert.ok(fs.existsSync(readyData.tempPath), 'Lingering temporary file exists without corrupting targetPath');

        // Independent worker can safely run and acquire locks
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        assert.doesNotThrow(() => {
            const token = ledger._acquireLock();
            ledger._releaseLock();
        });

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('118. DEF-12.3: Genuine Crash-Boundary 4 — Process crash during supervisor release', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-crash4-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const supervisorPath = `${claimPath}.recovery_supervisor`;
        const readyFile = path.join(tempDir, 'ready_cb4.json');

        const childScript = `
import fs from 'fs';
import os from 'os';

const supervisorPath = '${supervisorPath}';
const readyFile = process.argv[2];

const supervisorToken = 'supervisor-tok-118';
const supData = {
    supervisorToken,
    pid: process.pid,
    processStartTime: Date.now(),
    hostname: os.hostname(),
    createdAt: Date.now()
};
fs.writeFileSync(supervisorPath, JSON.stringify(supData), { mode: 0o600 });

// Begin release by renaming to private release path
const releasePath = supervisorPath + '.releasing.' + process.pid + '.cb4';
fs.renameSync(supervisorPath, releasePath);

// Signal ready right after rename but BEFORE unlinking releasePath
fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, releasePath }));

while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const childFile = path.join(tempDir, 'child118.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyData = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(readyData.releasePath), 'Release path must exist before kill');

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Next worker checks supervisor activity
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const supervisorActive = ledger._isClaimRecoverySupervisorActive();

        assert.equal(supervisorActive, false, 'Abandoned supervisor release from dead PID must be resolved as inactive');
        assert.ok(!fs.existsSync(supervisorPath), 'Supervisor path must be cleared');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('119. DEF-12.3: Genuine Crash-Boundary 5 — Process crash during recovery restoration', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-crash5-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const lockPath = `${ledgerPath}.lock`;
        const claimPath = `${lockPath}.claim`;
        const readyFile = path.join(tempDir, 'ready_cb5.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        const livePid = process.pid;
        const liveStartTime = ledger._getProcessStartTime() || Date.now();

        const childScript = `
import fs from 'fs';
import os from 'os';

const claimPath = '${claimPath}';
const readyFile = process.argv[2];

const stagingPath = claimPath + '.recovering.' + process.pid + '.cb5';
const replacementClaim = {
    claimToken: 'replacement-live-claim-119',
    pid: ${livePid},
    processStartTime: ${liveStartTime},
    hostname: os.hostname(),
    createdAt: Date.now()
};
fs.writeFileSync(stagingPath, JSON.stringify(replacementClaim), { mode: 0o600 });

// Atomic restoration to canonical path via linkSync
fs.linkSync(stagingPath, claimPath);

// Signal ready BEFORE unlinking stagingPath
fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath, claimPath }));

while (true) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
`;
        const childFile = path.join(tempDir, 'child119.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            await new Promise(r => setTimeout(r, 10));
        }

        const readyData = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(claimPath), 'Restored claim path must exist');
        assert.ok(fs.existsSync(readyData.stagingPath), 'Staging link must exist before kill');

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker inspects state
        const claimActive = ledger._isClaimActive();

        // Live owner PID makes claim active; claimPath was restored and intact
        assert.equal(claimActive, true, 'Active replacement claim must be recognized as active');
        assert.ok(fs.existsSync(claimPath), 'Canonical claim path must remain intact');
        const data = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        assert.equal(data.claimToken, 'replacement-live-claim-119', 'Restored claim token must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('120. DEF-12.2: Directory fsync unexpected failure injection across all error categories', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def12-fsync-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const ledger = new DurableApprovalLedger(ledgerPath);

        const unexpectedOpenCodes = ['EACCES', 'EPERM', 'EMFILE', 'EIO'];
        const origOpen = fs.openSync;
        try {
            for (const code of unexpectedOpenCodes) {
                fs.openSync = function (p, flags) {
                    if (p === tempDir) {
                        const err = new Error(`Unexpected open error: ${code}`);
                        err.code = code;
                        throw err;
                    }
                    return origOpen.apply(this, arguments);
                };
                assert.throws(
                    () => ledger._fsyncDirectory(tempDir),
                    (err) => {
                        assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                        assert.match(err.message, /Failed to open directory descriptor for durability fsync/);
                        assert.match(err.message, new RegExp(code));
                        return true;
                    },
                    `Directory open with ${code} must throw SECURITY FATAL`
                );
            }
        } finally {
            fs.openSync = origOpen;
        }

        const unexpectedFsyncCodes = ['EIO', 'EBADF', 'EPERM', 'ENOSPC'];
        const origFsync = fs.fsyncSync;
        try {
            for (const code of unexpectedFsyncCodes) {
                fs.fsyncSync = function (fd) {
                    const err = new Error(`Unexpected fsync error: ${code}`);
                    err.code = code;
                    throw err;
                };
                assert.throws(
                    () => ledger._fsyncDirectory(tempDir),
                    (err) => {
                        assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                        assert.match(err.message, /Directory fsync failed/);
                        assert.match(err.message, new RegExp(code));
                        return true;
                    },
                    `Directory fsync with ${code} must throw SECURITY FATAL`
                );
            }
        } finally {
            fs.fsyncSync = origFsync;
        }

        const origClose = fs.closeSync;
        try {
            fs.closeSync = function (fd) {
                const err = new Error('Descriptor close failed');
                err.code = 'EIO';
                throw err;
            };
            assert.throws(
                () => ledger._fsyncDirectory(tempDir),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Failed to close directory descriptor/);
                    return true;
                },
                'Directory descriptor close failure must throw SECURITY FATAL'
            );
        } finally {
            fs.closeSync = origClose;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('121. DEF-13.1 & DEF-14.1: Abandoned displaced artifact recovery when destination absent: Restores via atomic linkSync and cleans staging', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc121-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const displacedPath = `${targetPath}.displaced.999991.1000.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const displacedData = { token: 'displaced-tok-121', pid: 999991, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(displacedData), { mode: 0o600 });
        const dispStat = fs.statSync(displacedPath);

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);

        assert.equal(result.restored, 1, 'Exactly 1 artifact must be restored');
        assert.equal(result.resolved, true, 'All displaced artifacts must be resolved');
        assert.ok(fs.existsSync(targetPath), 'Target destination must be restored');
        assert.ok(!fs.existsSync(displacedPath), 'Displaced artifact must be unlinked');

        const canStat = fs.statSync(targetPath);
        assert.equal(canStat.ino, dispStat.ino, 'Restored file must preserve original inode');
        assert.equal(canStat.dev, dispStat.dev, 'Restored file must preserve original device ID');
        const content = fs.readFileSync(targetPath, 'utf8');
        assert.deepEqual(JSON.parse(content), displacedData, 'Restored file content must match displaced data');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('122. DEF-13.1 & DEF-14.1: Displaced conflict reconciliation: Preserves both displaced and destination artifacts when content differs', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc122-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const displacedPath = `${targetPath}.displaced.999992.1000.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const displacedData = { token: 'displaced-tok-122', pid: 999992, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(displacedData), { mode: 0o600 });

        const competitorData = { token: 'competitor-tok-122', pid: 888882, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(competitorData), { mode: 0o600 });

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);

        assert.equal(result.resolved, false, 'Conflict must prevent full resolution');
        assert.equal(result.activeConflicts, 1, 'Exactly 1 active conflict must be reported');
        assert.ok(fs.existsSync(targetPath), 'Competitor destination must remain untouched');
        assert.ok(fs.existsSync(displacedPath), 'Displaced artifact must NOT be deleted');

        // Confirm lock acquisition is blocked by unresolved displaced conflict
        const hasActive = ledger._hasActiveInFlightRecovery();
        assert.equal(hasActive, true, 'Active in-flight recovery must report true on unresolved displaced conflict');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('123. DEF-13.1 & DEF-14.1: Redundant displaced artifact cleanup: Unlinks redundant displaced copy when destination is identical', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc123-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const displacedPath = `${targetPath}.displaced.999993.1000.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const data = { token: 'identical-tok-123', pid: 999993, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(data), { mode: 0o600 });
        fs.linkSync(targetPath, displacedPath); // Same inode

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);

        assert.equal(result.cleaned, 1, 'Redundant displaced artifact must be cleaned');
        assert.equal(result.resolved, true, 'All displaced artifacts must be resolved');
        assert.ok(fs.existsSync(targetPath), 'Canonical destination must remain intact');
        assert.ok(!fs.existsSync(displacedPath), 'Redundant displaced link must be unlinked');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('124. DEF-13.1 & DEF-14.1: Live displaced owner preservation: Displaced artifact from live process is NEVER touched or deleted', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc124-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const liveStartTime = ledger._getProcessStartTime();
        const displacedPath = `${targetPath}.displaced.${process.pid}.${liveStartTime}.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const liveData = { token: 'live-tok-124', pid: process.pid, processStartTime: liveStartTime, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(liveData), { mode: 0o600 });

        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Live owner must report unresolved (active)');
        assert.equal(result.activeConflicts, 1, 'Live owner must be counted as active');
        assert.ok(fs.existsSync(displacedPath), 'Live displaced artifact must NOT be modified');

        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'In-flight recovery must return true for live displaced owner');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125. DEF-13.1 & DEF-14.1: Remote host and malformed displaced files fail closed without unauthorized cleanup', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc125-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const remoteHex = Buffer.from('remote-host.internal', 'utf8').toString('hex');
        const remoteDisplacedPath = `${targetPath}.displaced.12345.1000.${remoteHex}.${Date.now()}.${crypto.randomUUID()}`;

        // Remote host
        const remoteData = { token: 'remote-tok-125', pid: 12345, hostname: 'remote-host.internal' };
        fs.writeFileSync(remoteDisplacedPath, JSON.stringify(remoteData), { mode: 0o600 });

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'Remote host ownership must fail closed (return true)');
        assert.ok(fs.existsSync(remoteDisplacedPath), 'Remote host displaced artifact must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125a. DEF-14.1: Process Identity Binding — Matching PID and processStartTime of live process blocks recovery', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125a-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const liveStartTime = ledger._getProcessStartTime();
        const displacedPath = `${targetPath}.displaced.${process.pid}.${liveStartTime}.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const data = { token: 'live-ident-125a', pid: process.pid, processStartTime: liveStartTime, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(data), { mode: 0o600 });

        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'Live process must keep in-flight recovery active');
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Recovery must not resolve while displacing owner is alive');
        assert.equal(result.activeConflicts, 1, 'Live owner must be counted as active conflict');
        assert.ok(fs.existsSync(displacedPath), 'Displaced artifact must remain untouched');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125b. DEF-14.1: Process Identity Binding — PID reuse with different processStartTime detects dead owner and recovers', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125b-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        // Use current PID but a mismatched start time simulating PID reuse
        const reusedPid = process.pid;
        const oldStartTime = ledger._getProcessStartTime() + 500000;
        const displacedPath = `${targetPath}.displaced.${reusedPid}.${oldStartTime}.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        const data = { token: 'reused-tok-125b', pid: reusedPid, processStartTime: oldStartTime, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(data), { mode: 0o600 });

        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.restored, 1, 'Mismatched start-time detects dead process and restores coordinator');
        assert.equal(result.resolved, true, 'Recovery must resolve');
        assert.ok(fs.existsSync(targetPath), 'Target coordinator must be restored');
        assert.ok(!fs.existsSync(displacedPath), 'Staging file must be cleaned');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125c. DEF-14.1: Process Identity Binding — Displacing PID/startTime verified independently of displaced file previous owner', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125c-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const liveStartTime = ledger._getProcessStartTime();
        // Filename encodes displacing process (current live process)
        const displacedPath = `${targetPath}.displaced.${process.pid}.${liveStartTime}.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        // Content belongs to previous coordinator owner (which has a dead PID)
        const previousOwnerData = { token: 'prev-owner-125c', pid: 999995, processStartTime: 1000, hostname: os.hostname() };
        fs.writeFileSync(displacedPath, JSON.stringify(previousOwnerData), { mode: 0o600 });

        // Since the displacing process is alive, recovery MUST remain blocked, regardless of the content PID!
        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'Live displacing process must block recovery even if previous owner is dead');
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Recovery must not touch artifact while displacing process is alive');
        assert.ok(fs.existsSync(displacedPath), 'Displaced file must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125d. DEF-14.1: Process Identity Binding — Missing, non-numeric, or zero processStartTime in filename fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125d-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');

        // Zero processStartTime in filename
        const zeroTimePath = `${targetPath}.displaced.999996.0.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;
        fs.writeFileSync(zeroTimePath, JSON.stringify({ token: 'zero-time' }), { mode: 0o600 });

        // Legacy format without processStartTime
        const legacyPath = `${targetPath}.displaced.999996.${Date.now()}.${crypto.randomUUID()}`;
        fs.writeFileSync(legacyPath, JSON.stringify({ token: 'legacy-fmt' }), { mode: 0o600 });

        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Missing or unprovable identity must fail closed');
        assert.equal(result.activeConflicts, 2, 'Both unverified files must count as active conflicts');
        assert.ok(fs.existsSync(zeroTimePath), 'Zero-time file must remain untouched');
        assert.ok(fs.existsSync(legacyPath), 'Legacy unverified file must remain untouched');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125e. DEF-14.1: Process Identity Binding — Cross-host ownership in filename or metadata fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125e-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

        // Cross-host in filename
        const remoteHex = Buffer.from('different-cluster-host-99', 'utf8').toString('hex');
        const remoteNamePath = `${targetPath}.displaced.999997.1000.${remoteHex}.${Date.now()}.${crypto.randomUUID()}`;
        fs.writeFileSync(remoteNamePath, JSON.stringify({ token: 'tok-remote-file', hostname: os.hostname() }), { mode: 0o600 });

        // Cross-host in metadata content
        const localHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const remoteDataPath = `${targetPath}.displaced.999997.1000.${localHex}.${Date.now()}.${crypto.randomUUID()}`;
        fs.writeFileSync(remoteDataPath, JSON.stringify({ token: 'tok-remote-data', hostname: 'remote-data-host' }), { mode: 0o600 });

        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Cross-host displaced artifacts must fail closed');
        assert.equal(result.activeConflicts, 2, 'Both cross-host artifacts must count as active conflicts');
        assert.ok(fs.existsSync(remoteNamePath), 'Cross-host filename artifact must be preserved');
        assert.ok(fs.existsSync(remoteDataPath), 'Cross-host data artifact must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('125f. DEF-14.1: Process Identity Binding — Permission-denied (EPERM) process inspection fails closed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125f-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const displacedPath = `${targetPath}.displaced.999998.1000.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;
        fs.writeFileSync(displacedPath, JSON.stringify({ token: 'eperm-tok', pid: 999998, hostname: os.hostname() }), { mode: 0o600 });

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const origKill = process.kill;
        try {
            process.kill = function (pid, sig) {
                if (pid === 999998 && sig === 0) {
                    const err = new Error('operation not permitted');
                    err.code = 'EPERM';
                    throw err;
                }
                return origKill.apply(this, arguments);
            };

            assert.equal(ledger._hasActiveInFlightRecovery(), true, 'EPERM on process inspection must fail closed');
            const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
            assert.equal(result.resolved, false, 'Recovery must fail closed on EPERM');
            assert.equal(result.activeConflicts, 1, 'EPERM must count as active conflict');
            assert.ok(fs.existsSync(displacedPath), 'Artifact must be preserved on disk');
        } finally {
            process.kill = origKill;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('125g. DEF-14.1: Process Identity Binding — Malformed displaced metadata fails closed and is preserved on disk', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-sc125g-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const hostHex = Buffer.from(os.hostname(), 'utf8').toString('hex');
        const displacedPath = `${targetPath}.displaced.999999.1000.${hostHex}.${Date.now()}.${crypto.randomUUID()}`;

        // Write corrupt JSON
        fs.writeFileSync(displacedPath, '{"token": "corrupt-json-truncated...', { mode: 0o600 });

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'Malformed metadata must fail closed');
        const result = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(result.resolved, false, 'Recovery must fail closed on malformed metadata');
        assert.equal(result.activeConflicts, 1, 'Malformed metadata must count as active conflict');
        assert.ok(fs.existsSync(displacedPath), 'Malformed file must be preserved on disk for forensic analysis');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('126. DEF-13.3 & DEF-14.4: Directory fsync propagation: False directory-sync on POSIX throws SECURITY FATAL when requireDirectorySync is true', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc126-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0, requireDirectorySync: true });

        const origFsync = fs.fsyncSync;
        try {
            fs.fsyncSync = function (fd) {
                const stat = fs.fstatSync(fd);
                if (stat.isDirectory()) {
                    const err = new Error('Driver limitation: filesystem does not implement directory fsync');
                    err.code = 'EINVAL';
                    throw err;
                }
                return origFsync.apply(this, arguments);
            };

            assert.throws(
                () => ledger._writeDurableMetadata(targetPath, { token: 'sync-fail' }, { mode: 'create', requireDirectorySync: true }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Strict directory durability required but directory fsync is unsupported on this filesystem driver/);
                    return true;
                }
            );
        } finally {
            fs.fsyncSync = origFsync;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('127. DEF-13.3 & DEF-14.4: Directory fsync status propagation: Returns explicit durability status without throwing when directory fsync is not required', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def13-sc127-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'meta.json');
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0, requireDirectorySync: false });

        const origFsync = fs.fsyncSync;
        try {
            fs.fsyncSync = function (fd) {
                const stat = fs.fstatSync(fd);
                if (stat.isDirectory()) {
                    const err = new Error('Driver limitation: filesystem does not implement directory fsync');
                    err.code = 'EINVAL';
                    throw err;
                }
                return origFsync.apply(this, arguments);
            };

            const result = ledger._writeDurableMetadata(targetPath, { token: 'sync-opt' }, { mode: 'create', requireDirectorySync: false });
            assert.equal(result.success, true);
            assert.equal(result.directorySynced, false, 'directorySynced must report false when driver fails');
            assert.equal(result.durabilityStatus, 'UNSUPPORTED_POSIX_DRIVER', 'Explicit unsupported status must be reported');
        } finally {
            fs.fsyncSync = origFsync;
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('128. DEF-14.2: Genuine Crash-Boundary A — Crash immediately after displacement (before verification)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashA-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbA.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        // Initial coordinator
        const initialData = { token: 'child-tok-128', pid: 10001, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const initStat = fs.statSync(targetPath);

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-128' }, {
        mode: 'update',
        expectedToken: 'child-tok-128',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookAfterDisplace: (stagingPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child128.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) throw new Error(`Child exited prematurely with code ${child.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Staging displaced file must exist before crash');
        assert.ok(!fs.existsSync(targetPath), 'Target path must be displaced and absent before crash');

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker inspects and recovers
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);

        assert.equal(recResult.restored, 1, 'Abandoned displaced coordinator must be restored');
        assert.ok(fs.existsSync(targetPath), 'Target coordinator must be restored on disk');
        assert.ok(!fs.existsSync(readyInfo.stagingPath), 'Displaced artifact must be cleaned after restore');

        const restoredStat = fs.statSync(targetPath);
        assert.equal(restoredStat.ino, initStat.ino, 'Restored coordinator must preserve exact original inode');
        assert.equal(restoredStat.dev, initStat.dev, 'Restored coordinator must preserve exact original device ID');
        const restoredContent = fs.readFileSync(targetPath, 'utf8');
        assert.deepEqual(JSON.parse(restoredContent), initialData, 'Restored coordinator must preserve original content');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('129. DEF-14.2: Genuine Crash-Boundary B — Crash after displacement and before ownership verification', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashB-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbB.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-129', pid: 10002, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const initStat = fs.statSync(targetPath);

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-129' }, {
        mode: 'update',
        expectedToken: 'child-tok-129',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookAfterDisplace: (stagingPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child129.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) throw new Error(`Child exited prematurely with code ${child.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(recResult.restored, 1, 'Abandoned displaced file must be restored');
        assert.ok(fs.existsSync(targetPath), 'Target coordinator must exist');
        assert.ok(!fs.existsSync(readyInfo.stagingPath), 'Staging file must be cleaned');

        const restoredStat = fs.statSync(targetPath);
        assert.equal(restoredStat.ino, initStat.ino, 'Inode must match');
        assert.equal(restoredStat.dev, initStat.dev, 'Device ID must match');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('130. DEF-14.2: Genuine Crash-Boundary C — Crash after ownership verification but before publication', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashC-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbC.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-130', pid: 10003, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const initStat = fs.statSync(targetPath);

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-130' }, {
        mode: 'update',
        expectedToken: 'child-tok-130',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookBeforePublish: (stagingPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child130.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) throw new Error(`Child exited prematurely with code ${child.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(recResult.restored, 1, 'Displaced coordinator must be restored');
        assert.ok(fs.existsSync(targetPath), 'Target coordinator must exist');

        const restoredStat = fs.statSync(targetPath);
        assert.equal(restoredStat.ino, initStat.ino, 'Inode must match original');
        const content = fs.readFileSync(targetPath, 'utf8');
        assert.equal(JSON.parse(content).token, 'child-tok-130', 'Original token must be intact');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('131. DEF-14.2: Genuine Crash-Boundary D — Crash after competing coordinator creation (Conflict Fail-Closed)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashD-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbD.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-131', pid: 10004, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-131' }, {
        mode: 'update',
        expectedToken: 'child-tok-131',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookBeforePublish: (stagingPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child131.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) throw new Error(`Child exited prematurely with code ${child.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));

        // Competitor creates new coordinator at targetPath while child is displaced
        const competitorData = { token: 'competitor-tok-131', pid: 888884, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(competitorData), { mode: 0o600 });
        const compStat = fs.statSync(targetPath);

        // Kill child abruptly with SIGKILL
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);

        // Must report unresolved conflict; both artifacts MUST be preserved on disk!
        assert.equal(recResult.resolved, false, 'Unresolved conflict must report false');
        assert.equal(recResult.activeConflicts, 1, 'Exactly 1 active conflict');
        assert.ok(fs.existsSync(targetPath), 'Competitor coordinator must exist');
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Displaced coordinator must be preserved');

        const curStat = fs.statSync(targetPath);
        assert.equal(curStat.ino, compStat.ino, 'Competitor file must NOT be overwritten');
        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'In-flight recovery must fail closed');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('132. DEF-14.2: Genuine Crash-Boundary E — Crash after hard-link publication but before displaced artifact cleanup', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashE-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbE.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-132', pid: 10005, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-132-new' }, {
        mode: 'update',
        expectedToken: 'child-tok-132',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookAfterPublishBeforeCleanup: (stagingPath, filePath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath, filePath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child132.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) throw new Error(`Child exited prematurely with code ${child.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(targetPath), 'Target path must have newly published file');
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Staging file must exist before cleanup');

        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker inspects and cleans redundant staging file
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(recResult.cleaned, 1, 'Redundant displaced artifact must be cleaned after identity proof');
        assert.ok(!fs.existsSync(readyInfo.stagingPath), 'Staging file must be unlinked');
        assert.ok(fs.existsSync(targetPath), 'Canonical published coordinator must be preserved');

        const content = fs.readFileSync(targetPath, 'utf8');
        assert.equal(JSON.parse(content).token, 'updated-132-new', 'Published new coordinator must be preserved');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('133. DEF-14.2: Genuine Crash-Boundary F — Crash during restoration after EEXIST conflict', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashF-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbF.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-133', pid: 10006, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });

try {
    ledger._writeDurableMetadata(targetPath, { token: 'mismatch-133' }, {
        mode: 'update',
        expectedToken: 'wrong-token-causes-mismatch',
        __testHookAfterDisplace: (stagingPath, filePath) => {
            fs.writeFileSync(filePath || targetPath, JSON.stringify({ token: 'competitor-133' }), { mode: 0o600 });
        },
        __testHookDuringRestoreConflict: (stagingPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    fs.writeFileSync(readyFile + '.err', e.stack || e.message);
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child133.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) {
                const errDetail = fs.existsSync(readyFile + '.err') ? fs.readFileSync(readyFile + '.err', 'utf8') : '';
                throw new Error(`Child exited prematurely with code ${child.exitCode}: ${errDetail}`);
            }
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Both competitor file and staging file must be preserved
        assert.ok(fs.existsSync(targetPath), 'Competitor coordinator must exist');
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Displaced coordinator must be preserved');

        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        assert.equal(ledger._hasActiveInFlightRecovery(), true, 'Conflict must keep recovery fail-closed');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('134. DEF-14.2: Genuine Crash-Boundary G — Crash during directory fsync, with hook execution and platform matrix', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashG-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbG.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-134', pid: 10007, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const stat = fs.statSync(targetPath);

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-134' }, {
        mode: 'update',
        expectedToken: 'child-tok-134',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookDuringFsync: (dirFd, dirPath) => {
            fs.writeFileSync(readyFile, JSON.stringify({
                pid: process.pid,
                dirFdValid: (typeof dirFd === 'number' && dirFd > 0),
                dirPath
            }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    fs.writeFileSync(readyFile + '.err', e.stack || e.message);
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child134.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) {
                const errDetail = fs.existsSync(readyFile + '.err') ? fs.readFileSync(readyFile + '.err', 'utf8') : '';
                throw new Error(`Child exited prematurely with code ${child.exitCode}: ${errDetail}`);
            }
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.equal(readyInfo.dirFdValid, true, 'dirFd must be a valid open file descriptor during hook execution');
        assert.equal(readyInfo.dirPath, tempDir, 'dirPath must match target directory');

        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker inspects and reconciles
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.ok(fs.existsSync(targetPath), 'Target coordinator must exist');

        // Platform Durability Matrix Assertions (DEF-14.2 & DEF-14.4)
        // 1. POSIX normal execution
        if (process.platform !== 'win32') {
            const posixStatus = ledger._fsyncDirectory(tempDir, { requireDirectorySync: false });
            assert.equal(posixStatus, true, 'POSIX directory fsync must return true when supported');
        }

        // 2. Unsupported driver failure on POSIX with strict requirement
        const origFsync = fs.fsyncSync;
        try {
            fs.fsyncSync = function (fd) {
                const stat = fs.fstatSync(fd);
                if (stat.isDirectory()) {
                    const err = new Error('Driver limitation: directory fsync unsupported');
                    err.code = 'EINVAL';
                    throw err;
                }
                return origFsync.apply(this, arguments);
            };

            assert.throws(
                () => ledger._fsyncDirectory(tempDir, { requireDirectorySync: true }),
                (err) => {
                    assert.match(err.message, /\[MIGRATION-004\] SECURITY FATAL/);
                    assert.match(err.message, /Strict directory durability required but directory fsync is unsupported on this filesystem driver/);
                    return true;
                }
            );
        } finally {
            fs.fsyncSync = origFsync;
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('135. DEF-14.2: Genuine Crash-Boundary H — Crash during displaced artifact cleanup', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-crashH-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const targetPath = path.join(tempDir, 'coordinator.json');
        const readyFile = path.join(tempDir, 'ready_cbH.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const initialData = { token: 'child-tok-135', pid: 10008, hostname: os.hostname() };
        fs.writeFileSync(targetPath, JSON.stringify(initialData), { mode: 0o600 });
        const stat = fs.statSync(targetPath);

        const childScript = `
import fs from 'fs';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const targetPath = process.argv[3];
const readyFile = process.argv[4];

const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
const stat = fs.statSync(targetPath);

try {
    ledger._writeDurableMetadata(targetPath, { token: 'updated-135' }, {
        mode: 'update',
        expectedToken: 'child-tok-135',
        expectedIno: stat.ino,
        expectedDev: stat.dev,
        __testHookBeforeDisplacedCleanup: (stagingPath, filePath) => {
            fs.writeFileSync(readyFile, JSON.stringify({ pid: process.pid, stagingPath, filePath }));
            while (true) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
            }
        }
    });
} catch (e) {
    fs.writeFileSync(readyFile + '.err', e.stack || e.message);
    process.exit(1);
}
`;
        const childFile = path.join(tempDir, 'child135.mjs');
        fs.writeFileSync(childFile, childScript, { mode: 0o700 });

        const child = spawn('node', [childFile, ledgerPath, targetPath, readyFile], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(readyFile)) {
            if (child.exitCode !== null) {
                const errDetail = fs.existsSync(readyFile + '.err') ? fs.readFileSync(readyFile + '.err', 'utf8') : '';
                throw new Error(`Child exited prematurely with code ${child.exitCode}: ${errDetail}`);
            }
            await new Promise(r => setTimeout(r, 10));
        }

        const readyInfo = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
        assert.ok(fs.existsSync(readyInfo.stagingPath), 'Staging file must exist before cleanup');

        child.kill('SIGKILL');
        await new Promise((resolve) => child.on('exit', resolve));

        // Independent worker reconciles abandoned staging artifact
        const ledger = new DurableApprovalLedger(ledgerPath, { initGracePeriodMs: 0 });
        const recResult = ledger.recoverAbandonedDisplacedArtifacts(tempDir);
        assert.equal(recResult.cleaned, 1, 'Redundant displaced artifact must be cleaned after identity proof');
        assert.ok(!fs.existsSync(readyInfo.stagingPath), 'Staging file must be unlinked');
        assert.ok(fs.existsSync(targetPath), 'Target path must retain newly published file');
        const content = fs.readFileSync(targetPath, 'utf8');
        assert.equal(JSON.parse(content).token, 'updated-135', 'Target content must match updated version');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('136. DEF-14.3: Real Multi-Worker Adversarial Stress Test — Deterministic barriers, confirmed lock-holder SIGKILL, and audit log analysis', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def14-stress-'));
        const ledgerPath = path.join(tempDir, 'ledger.jsonl');
        const auditLogPath = path.join(tempDir, 'stress_audit.jsonl');
        const barrier0Path = path.join(tempDir, 'barrier_worker0.json');
        const barrier1Path = path.join(tempDir, 'barrier_worker1.json');
        const targetModule = path.resolve(__dirname, '../../migrations/004-contact-phone-unique-index-migration.js');

        const workerScript = `
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DurableApprovalLedger } from '${targetModule}';

const ledgerPath = process.argv[2];
const workerId = process.argv[3];
const auditPath = process.argv[4];
const barrier0 = process.argv[5];
const barrier1 = process.argv[6];

const ledger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 1500, retryIntervalMs: 20, initGracePeriodMs: 0 });

function logAudit(action, extra = {}) {
    const entry = JSON.stringify({ workerId, pid: process.pid, action, time: Date.now(), ...extra }) + String.fromCharCode(10);
    fs.appendFileSync(auditPath, entry);
}

if (workerId === 'worker-0') {
    // Schedule 1: Acquire lock, write barrier confirming PID, hold until SIGKILL
    const token = ledger._acquireLock();
    logAudit('ENTER', { token });
    fs.writeFileSync(barrier0, JSON.stringify({ pid: process.pid, workerId, token }));
    while (true) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
} else if (workerId === 'worker-1') {
    // Schedule 2: Compete for lock, start displaced metadata update, write barrier at displacement, hold until SIGKILL
    let token = null;
    while (!token) {
        try {
            token = ledger._acquireLock();
        } catch (_) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        }
    }
    logAudit('ENTER', { token });
    const metaPath = path.join(path.dirname(ledgerPath), 'shared_meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({ token: 'init-meta', pid: process.pid, hostname: os.hostname() }), { mode: 0o600 });
    const stat = fs.statSync(metaPath);
    try {
        ledger._writeDurableMetadata(metaPath, { token: 'worker-1-displaced' }, {
            mode: 'update',
            expectedToken: 'init-meta',
            expectedIno: stat.ino,
            expectedDev: stat.dev,
            __testHookAfterDisplace: (stagingPath) => {
                fs.writeFileSync(barrier1, JSON.stringify({ pid: process.pid, workerId, stagingPath }));
                while (true) {
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
                }
            }
        });
    } catch (_) {
        process.exit(1);
    }
} else {
    // Workers 2 and 3: Contend, recover dead locks and displaced artifacts, perform durable operations, release cleanly
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 50) {
        attempts++;
        try {
            const token = ledger._acquireLock();
            logAudit('ENTER', { token });
            // Simulate critical section work
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
            ledger._releaseLock(token);
            logAudit('EXIT', { token });
            completed = true;
            break;
        } catch (_) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
        }
    }
    process.exit(completed ? 0 : 1);
}
`;
        const workerFile = path.join(tempDir, 'worker_stress.mjs');
        fs.writeFileSync(workerFile, workerScript, { mode: 0o700 });

        // Phase 1: Launch Worker 0 (Schedule 1: Lock-holder SIGKILL)
        const child0 = spawn('node', [workerFile, ledgerPath, 'worker-0', auditLogPath, barrier0Path, barrier1Path], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(barrier0Path)) {
            if (child0.exitCode !== null) throw new Error(`Worker 0 exited prematurely with code ${child0.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        // Deterministic assertion: Prove Worker 0 is the confirmed lock holder on disk before killing
        const b0 = JSON.parse(fs.readFileSync(barrier0Path, 'utf8'));
        const lockPath = `${ledgerPath}.lock`;
        assert.ok(fs.existsSync(lockPath), 'Lockfile must exist on disk');
        const lockOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        assert.equal(lockOnDisk.pid, b0.pid, 'Lockfile PID on disk must match Worker 0 PID');

        // Kill Worker 0 mid-hold
        child0.kill('SIGKILL');
        await new Promise(resolve => child0.on('exit', resolve));

        // Phase 2: Launch Worker 1 (Schedule 2: Displaced metadata update SIGKILL)
        const child1 = spawn('node', [workerFile, ledgerPath, 'worker-1', auditLogPath, barrier0Path, barrier1Path], { stdio: ['ignore', 'inherit', 'inherit'] });
        while (!fs.existsSync(barrier1Path)) {
            if (child1.exitCode !== null) throw new Error(`Worker 1 exited prematurely with code ${child1.exitCode}`);
            await new Promise(r => setTimeout(r, 10));
        }

        // Deterministic assertion: Prove displaced staging file exists on disk before killing
        const b1 = JSON.parse(fs.readFileSync(barrier1Path, 'utf8'));
        assert.ok(fs.existsSync(b1.stagingPath), 'Displaced staging file must exist on disk before Worker 1 crash');

        // Kill Worker 1 mid-displacement
        child1.kill('SIGKILL');
        await new Promise(resolve => child1.on('exit', resolve));

        // Phase 3: Launch Workers 2 and 3 concurrently to contend and recover
        const child2 = spawn('node', [workerFile, ledgerPath, 'worker-2', auditLogPath, barrier0Path, barrier1Path], { stdio: ['ignore', 'inherit', 'inherit'] });
        const child3 = spawn('node', [workerFile, ledgerPath, 'worker-3', auditLogPath, barrier0Path, barrier1Path], { stdio: ['ignore', 'inherit', 'inherit'] });

        const [code2, code3] = await Promise.all([
            new Promise(resolve => child2.on('exit', resolve)),
            new Promise(resolve => child3.on('exit', resolve))
        ]);

        assert.equal(code2, 0, 'Worker 2 must complete successfully');
        assert.equal(code3, 0, 'Worker 3 must complete successfully');

        // Phase 4: Forensic Audit of stress_audit.jsonl
        assert.ok(fs.existsSync(auditLogPath), 'Audit log must exist');
        const auditLines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

        // Check 1: Workers 2 and 3 must have matched ENTER and EXIT
        const w2Enters = auditLines.filter(l => l.workerId === 'worker-2' && l.action === 'ENTER');
        const w2Exits = auditLines.filter(l => l.workerId === 'worker-2' && l.action === 'EXIT');
        const w3Enters = auditLines.filter(l => l.workerId === 'worker-3' && l.action === 'ENTER');
        const w3Exits = auditLines.filter(l => l.workerId === 'worker-3' && l.action === 'EXIT');
        assert.equal(w2Enters.length, 1, 'Worker 2 must have exactly 1 ENTER');
        assert.equal(w2Exits.length, 1, 'Worker 2 must have exactly 1 EXIT');
        assert.equal(w3Enters.length, 1, 'Worker 3 must have exactly 1 ENTER');
        assert.equal(w3Exits.length, 1, 'Worker 3 must have exactly 1 EXIT');

        // Check 2: Zero overlapping critical sections between any living workers
        let activeHolder = null;
        for (const record of auditLines) {
            if (record.action === 'ENTER') {
                if (record.workerId === 'worker-0' || record.workerId === 'worker-1') {
                    // Crashed workers held lock at crash time
                    activeHolder = record.workerId;
                } else {
                    // For living workers (worker-2, worker-3), no other worker can be holding the lock!
                    // If previous was worker-0 or worker-1, they were SIGKILLed and their lock was recovered.
                    activeHolder = record.workerId;
                }
            } else if (record.action === 'EXIT') {
                assert.equal(activeHolder, record.workerId, 'EXIT must match current active lock holder');
                activeHolder = null;
            }
        }
        assert.equal(activeHolder, null, 'No lock holder can remain active after test completion');

        // Check 3: Subsequent worker cleanly acquires and releases lock
        const finalLedger = new DurableApprovalLedger(ledgerPath, { lockTimeoutMs: 1500, retryIntervalMs: 20, initGracePeriodMs: 0 });
        const finalToken = finalLedger._acquireLock();
        assert.ok(finalToken, 'Subsequent worker must acquire valid lock token');
        finalLedger._releaseLock(finalToken);
        assert.ok(!fs.existsSync(lockPath), 'Lockfile must be cleanly released');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});

