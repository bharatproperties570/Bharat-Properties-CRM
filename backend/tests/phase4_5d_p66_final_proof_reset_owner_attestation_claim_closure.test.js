/**
 * PHASE 4.5-D (PR #67) FINAL EPHEMERAL DATABASE IDENTITY,
 * AUTHENTIC OWNER EVIDENCE, STRICT METADATA PRIVACY
 * AND NON-BYPASSABLE SAGA CLAIM BINDING TEST SUITE
 *
 * Covers 5 Strict Engineering Matrices (75 Total Tests):
 * Matrix 1: Ephemeral Database Identity Must Be Non-Forgeable (14 tests)
 * Matrix 2: Saga Compensation Authentic RunItem & Audit Target Binding (15 tests)
 * Matrix 3: Authentic Owner Confirmation (16 tests)
 * Matrix 4: Neutral Defaults in ensureDefaults & reconcileOwnerAttestation (10 tests)
 * Matrix 5: Strict Metadata PII Contract (20 tests)
 */

process.env.NODE_ENV = 'test';

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';

import AuditLog, {
    isImmutableAuditEvent,
    isAuthorityAuditEvent,
    isControlledAuthorityDescription,
    sanitizeAuditDocument,
    sanitizeAuditUpdate,
    checkAuditImmutability,
    validateAuthorityMetadataValue,
    validateControlledScalarValue,
    validateAuditChanges,
    CONTROLLED_ROLE_CODES,
    CONTROLLED_TARGET_NAMES,
    CONTROLLED_AUDIT_REASONS
} from '../models/AuditLog.js';

import AuthoritySourceSettings, {
    INTERNAL_WORKFLOW_OPTION,
    issueApproverWorkflowToken,
    issueReviewerWorkflowToken,
    issueEnsureDefaultsToken,
    issueOwnerConfirmationWorkflowToken,
    issueInternalSeedWorkflowToken,
    issueDeleteWorkflowToken,
    issueTestCleanupWorkflowToken,
    verifyAuthorizedInternalWorkflow,
    validateOrganizationFilter,
    registerVerifiedEphemeralTestDatabase,
    unregisterVerifiedEphemeralTestDatabase,
    clearVerifiedEphemeralTestDatabases,
    isVerifiedEphemeralTestDatabase,
    _testOnlyResetAuthoritySettings
} from '../models/AuthoritySourceSettings.js';

import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { compensateApplySaga } from '../controllers/authorityVerification.controller.js';

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING
} from '../config/canonicalOrganization.js';

let mongoServer;
let testActorUser;
let testAdminUser;
const CANONICAL_ORG_ID = CANONICAL_ORGANIZATION_ID;
const CANONICAL_ORG_ID_STRING = CANONICAL_ORGANIZATION_ID_STRING;
const NON_CANONICAL_ORG_ID = new mongoose.Types.ObjectId('111111111111111111111111');
const NON_CANONICAL_ORG_ID_STRING = '111111111111111111111111';

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    registerVerifiedEphemeralTestDatabase(mongoServer);
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const adminRole = await Role.create({
        name: 'Super Admin',
        department: 'sales',
        description: 'System Super Administrator',
        isSystemRole: true,
        moduleAccess: {
            authorityVerification: { view: true, edit: true, admin: true, manage: true }
        }
    });

    testActorUser = await User.create({
        tenantId: CANONICAL_ORG_ID,
        fullName: 'Test Broker',
        email: 'testbroker@example.com',
        password: 'Password123!',
        department: 'sales',
        role: new mongoose.Types.ObjectId(),
        isActive: true,
        status: 'active'
    });

    testAdminUser = await User.create({
        tenantId: CANONICAL_ORG_ID,
        fullName: 'Test Admin',
        email: 'testadmin@example.com',
        password: 'Password123!',
        department: 'sales',
        role: adminRole._id,
        isSuperAdmin: true,
        isActive: true,
        status: 'active'
    });
});

after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        unregisterVerifiedEphemeralTestDatabase(mongoServer);
        await mongoServer.stop();
    }
    clearVerifiedEphemeralTestDatabases();
});

beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
        await _testOnlyResetAuthoritySettings({});
        await AuditLog.deleteMany({});
        await PropertyVerificationRunItem.deleteMany({});
        await PropertyVerificationRun.deleteMany({});
    }
});

describe('PHASE 4.5-D (PR #67) FINAL EPHEMERAL DATABASE IDENTITY, AUTHENTIC OWNER EVIDENCE, STRICT METADATA PRIVACY & CLAIM BINDING', () => {

    // =========================================================================
    // Matrix 1: Ephemeral Database Identity Must Be Non-Forgeable
    // =========================================================================
    describe('Matrix 1: Ephemeral Database Identity Must Be Non-Forgeable', () => {

        test('1.1: Genuine MongoMemoryServer registration succeeds and tracks instance', () => {
            const isReg = registerVerifiedEphemeralTestDatabase(mongoServer);
            assert.strictEqual(isReg, true);
            assert.strictEqual(isVerifiedEphemeralTestDatabase(), true);
        });

        test('1.2: String URI passed to registerVerifiedEphemeralTestDatabase throws EPHEMERAL_DATABASE_REQUIRED', () => {
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase('mongodb://127.0.0.1:27017/test');
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.3: Plain object passed to registerVerifiedEphemeralTestDatabase throws EPHEMERAL_DATABASE_REQUIRED', () => {
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase({ getUri: () => 'mongodb://127.0.0.1:54321/test' });
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.4: Spoofed object mimicking MongoMemoryServer throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const fakeInstance = {
                state: 'running',
                instanceInfo: { port: 54321, ip: '127.0.0.1', dbName: 'test' },
                getUri: () => 'mongodb://127.0.0.1:54321/test'
            };
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase(fakeInstance);
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.5: Stopped MongoMemoryServer instance throws EPHEMERAL_DATABASE_REQUIRED', async () => {
            const tempMms = await MongoMemoryServer.create();
            await tempMms.stop();
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase(tempMms);
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.6: Instance on standard MongoDB port 27017 throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const fakeMms = Object.create(MongoMemoryServer.prototype, {
                state: { value: 'running', configurable: true },
                getUri: { value: () => 'mongodb://127.0.0.1:27017/test', configurable: true }
            });
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase(fakeMms);
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.7: Non-loopback IP instance throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const fakeMms = Object.create(MongoMemoryServer.prototype, {
                state: { value: 'running', configurable: true },
                getUri: { value: () => 'mongodb://192.168.1.10:51234/test', configurable: true }
            });
            assert.throws(() => {
                registerVerifiedEphemeralTestDatabase(fakeMms);
            }, err => {
                assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                return true;
            });
        });

        test('1.8: Registered instance A cannot authorize active connection to different database B', async () => {
            const otherServer = await MongoMemoryServer.create();
            try {
                // We do NOT register otherServer
                unregisterVerifiedEphemeralTestDatabase(mongoServer);
                registerVerifiedEphemeralTestDatabase(otherServer);

                // Active connection is still to mongoServer, so isVerifiedEphemeralTestDatabase must return false
                const isVerified = isVerifiedEphemeralTestDatabase();
                assert.strictEqual(isVerified, false);
            } finally {
                // Restore mongoServer registration
                unregisterVerifiedEphemeralTestDatabase(otherServer);
                await otherServer.stop();
                registerVerifiedEphemeralTestDatabase(mongoServer);
            }
        });

        test('1.9: Stopped memory instance cannot authorize reset and is purged', async () => {
            const tempServer = await MongoMemoryServer.create();
            try {
                unregisterVerifiedEphemeralTestDatabase(mongoServer);
                registerVerifiedEphemeralTestDatabase(tempServer);
                await tempServer.stop();

                // When checked, stopped instances in set are purged and return false
                const isVerified = isVerifiedEphemeralTestDatabase();
                assert.strictEqual(isVerified, false);

                await assert.rejects(
                    async () => {
                        await _testOnlyResetAuthoritySettings({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                        return true;
                    }
                );
            } finally {
                unregisterVerifiedEphemeralTestDatabase(tempServer);
                registerVerifiedEphemeralTestDatabase(mongoServer);
            }
        });

        test('1.10: Empty-filter test reset without registered ephemeral database throws EPHEMERAL_DATABASE_REQUIRED', async () => {
            try {
                unregisterVerifiedEphemeralTestDatabase(mongoServer);
                await assert.rejects(
                    async () => {
                        await _testOnlyResetAuthoritySettings({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                        return true;
                    }
                );
            } finally {
                registerVerifiedEphemeralTestDatabase(mongoServer);
            }
        });

        test('1.11: Empty-filter test reset outside NODE_ENV=test throws TEST_ONLY_CAPABILITY_PROHIBITED', async () => {
            const origEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                await assert.rejects(
                    async () => {
                        await _testOnlyResetAuthoritySettings({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = origEnv;
            }
        });

        test('1.12: Low-level driver direct deleteMany without workflow capability throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.collection.deleteMany({});
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.13: Native driver db.collection.deleteMany throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await mongoose.connection.db.collection('authoritysourcesettings').deleteMany({});
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.14: Valid test reset succeeds when active instance is genuine and registered', async () => {
            const res = await _testOnlyResetAuthoritySettings({});
            assert.ok(res);
            assert.strictEqual(res.acknowledged, true);
        });
    });

    // =========================================================================
    // Matrix 2: Saga Compensation Authentic RunItem & Audit Target Binding
    // =========================================================================
    describe('Matrix 2: Saga Compensation Authentic RunItem & Audit Target Binding', () => {

        test('2.1: Audit metadata claim without authentic PropertyVerificationRunItem throws AUDIT_LOG_IMMUTABLE', async () => {
            const nonExistentClaimId = new mongoose.Types.ObjectId();
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(),
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    claimId: nonExistentClaimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': nonExistentClaimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('does not belong to any authentic PropertyVerificationRunItem'));
                    return true;
                }
            );
        });

        test('2.2: changes.before.claimId without authentic RunItem throws AUDIT_LOG_IMMUTABLE', async () => {
            const fakeClaim = new mongoose.Types.ObjectId();
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(),
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    changes: {
                        before: { claimId: fakeClaim.toString() }
                    }
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': fakeClaim.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('2.3: Real RunItem exists but AuditLog has no targetId throws AUDIT_LOG_IMMUTABLE', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            // AuditLog created with NO targetId and NO itemId in metadata
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    claimId: legitClaim.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': legitClaim.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('missing target identifier'));
                    return true;
                }
            );
        });

        test('2.4: Real RunItem exists but targetId points to different RunItem throws AUDIT_LOG_IMMUTABLE', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItemA = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            const differentTargetId = new mongoose.Types.ObjectId();
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: differentTargetId,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: differentTargetId,
                    claimId: legitClaim.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': legitClaim.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('not matching audit target'));
                    return true;
                }
            );
        });

        test('2.5: Pre-flight check in compensateApplySaga rejects caller claimId conflict with CLAIM_CONFLICT', async () => {
            const realClaimId = new mongoose.Types.ObjectId();
            const conflictingCallerClaim = new mongoose.Types.ObjectId();

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: realClaimId }
            });

            const res = await compensateApplySaga({
                itemId: runItem._id,
                tenantId: CANONICAL_ORG_ID,
                inventoryId: runItem.inventoryId,
                claimId: conflictingCallerClaim.toString(),
                stage: 'AUDIT_LOGGED',
                compensation: {},
                errorMsg: 'Simulated compensation failure'
            });

            assert.strictEqual(res?.success, false);
            assert.strictEqual(res?.reason, 'CLAIM_CONFLICT');
            assert.strictEqual(res?.preempted, true);
        });

        test('2.6: Pre-flight check in compensateApplySaga rejects non-canonical tenant with CANONICAL_ORGANIZATION_REQUIRED', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: NON_CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: runItem._id,
                        tenantId: CANONICAL_ORG_ID,
                        inventoryId: runItem.inventoryId,
                        claimId: claimId.toString(),
                        stage: 'AUDIT_LOGGED',
                        compensation: {},
                        errorMsg: 'Simulated failure'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('2.7: RunItem with wrong authorityCode throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'GMADA', // RunItem has GMADA
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP', // Audit has HSVP
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('does not match RunItem authorityCode'));
                    return true;
                }
            );
        });

        test('2.8: RunItem with wrong tenantId throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: NON_CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('2.9: Claim ID from another RunItem cannot compensate audit log', async () => {
            const claimA = new mongoose.Types.ObjectId();
            const claimB = new mongoose.Types.ObjectId();

            const runItemA = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: claimA }
            });

            const runItemB = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: claimB }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItemA._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItemA._id,
                    claimId: claimA.toString()
                }
            });

            // Attempting to compensate audit for runItemA using claimB
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimB.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('2.10: Matching RunItem and exact AuditLog target succeeds compensation', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: legitClaim.toString()
                }
            });

            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        status: 'compensated',
                        'metadata.compensated': true,
                        'metadata.compensationClaimId': legitClaim.toString(),
                        'metadata.compensatedAt': new Date()
                    }
                }
            );

            const refreshed = await AuditLog.findById(audit._id).lean();
            assert.strictEqual(refreshed.status, 'compensated');
            assert.strictEqual(refreshed.metadata?.compensated, true);
            assert.strictEqual(refreshed.metadata?.compensationClaimId, legitClaim.toString());
        });

        test('2.11: Non-reversible audit eventType rejects compensation as immutable', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const audit = await AuditLog.create({
                eventType: 'authority_source_approved',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(),
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority source authorization APPROVED for HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': legitClaim.toString()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('2.12: Missing metadata.compensationClaimId throws AUDIT_LOG_IMMUTABLE', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: legitClaim.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true
                                // missing metadata.compensationClaimId
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('compensationClaimId'));
                    return true;
                }
            );
        });

        test('2.13: Missing metadata.compensated: true throws AUDIT_LOG_IMMUTABLE', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: legitClaim.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensationClaimId': legitClaim.toString()
                                // missing metadata.compensated: true
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('compensated: true'));
                    return true;
                }
            );
        });

        test('2.14: Fixed fallback placeholder claim ID throws AUDIT_LOG_IMMUTABLE', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(),
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    claimId: 'compensation_claim_id'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'compensation_claim_id'
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('2.15: Once compensated, record is terminal and strictly immutable', async () => {
            const legitClaim = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId: legitClaim }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: legitClaim.toString()
                }
            });

            // 1st update succeeds
            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        status: 'compensated',
                        'metadata.compensated': true,
                        'metadata.compensationClaimId': legitClaim.toString(),
                        'metadata.compensatedAt': new Date()
                    }
                }
            );

            // 2nd update is strictly rejected
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // Matrix 3: Authentic Owner Confirmation
    // =========================================================================
    describe('Matrix 3: Authentic Owner Confirmation', () => {

        beforeEach(async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                evidenceVersion: 1
            });
            await doc.save();
        });

        test('3.1: Missing actor identity throws AUTHENTICATED_PRINCIPAL_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: '',
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHENTICATED_PRINCIPAL_REQUIRED');
                    return true;
                }
            );
        });

        test('3.2: Invalid ObjectId string for actor throws AUTHENTICATED_PRINCIPAL_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: 'invalid_user_string',
                        reportedBy: 'invalid_user_string',
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHENTICATED_PRINCIPAL_REQUIRED');
                    return true;
                }
            );
        });

        test('3.3: Non-existent User throws ACTOR_NOT_FOUND', async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: { _id: nonExistentUserId },
                        reportedBy: nonExistentUserId.toString(),
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_NOT_FOUND');
                    return true;
                }
            );
        });

        test('3.4: Inactive User (isActive: false) throws ACTOR_SUSPENDED_OR_INACTIVE', async () => {
            const inactiveUser = await User.create({
                tenantId: CANONICAL_ORG_ID,
                fullName: 'Inactive User',
                email: 'inactive@example.com',
                password: 'Password123!',
                department: 'sales',
                role: new mongoose.Types.ObjectId(),
                isActive: false,
                status: 'inactive'
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: inactiveUser,
                        reportedBy: inactiveUser._id.toString(),
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_SUSPENDED_OR_INACTIVE');
                    return true;
                }
            );
        });

        test('3.5: Suspended User (status: suspended) throws ACTOR_SUSPENDED_OR_INACTIVE', async () => {
            const suspendedUser = await User.create({
                tenantId: CANONICAL_ORG_ID,
                fullName: 'Suspended User',
                email: 'suspended@example.com',
                password: 'Password123!',
                department: 'sales',
                role: new mongoose.Types.ObjectId(),
                isActive: true,
                status: 'suspended'
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: suspendedUser,
                        reportedBy: suspendedUser._id.toString(),
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_SUSPENDED_OR_INACTIVE');
                    return true;
                }
            );
        });

        test('3.6: User from non-canonical tenant throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            const otherOrgUser = await User.create({
                tenantId: NON_CANONICAL_ORG_ID,
                fullName: 'Other Org User',
                email: 'other@example.com',
                password: 'Password123!',
                department: 'sales',
                role: new mongoose.Types.ObjectId(),
                isActive: true,
                status: 'active'
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: otherOrgUser,
                        reportedBy: otherOrgUser._id.toString(),
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.7: Claimed role OWNER_REPRESENTATIVE without verified authority permission throws ACTOR_UNAUTHORIZED', async () => {
            // testActorUser has no superAdmin or explicit authority permissions
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_UNAUTHORIZED');
                    return true;
                }
            );
        });

        test('3.8: Claimed role OWNER_REPRESENTATIVE succeeds for admin user with verified authority permission', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testAdminUser,
                reportedBy: testAdminUser._id.toString(),
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: 'REF-001',
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.statementType, 'UNVERIFIED_SELF_REPORT');
            assert.strictEqual(updated.userReportedEvidence?.claimedAuthorityRole, 'OWNER_REPRESENTATIVE');
            assert.strictEqual(updated.userReportedEvidence?.verificationStatus, 'UNVERIFIED');
        });

        test('3.9: Broker self-report is stored as BROKER_SELF_REPORT and does NOT populate ownerAttestation', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: testActorUser._id.toString(),
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'BROKER_ATTESTATION',
                evidenceVersion: 1,
                notes: 'BROKER_ATTESTATION_SUBMITTED'
            });

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.statementType, 'BROKER_SELF_REPORT');
            assert.strictEqual(updated.ownerAttestation?.attestingParty ?? null, null);
            assert.strictEqual(updated.ownerAttestation?.attestedAt ?? null, null);
        });

        test('3.10: Missing evidenceReference throws EVIDENCE_REFERENCE_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: 'Authorized Broker',
                        evidenceReference: '',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'BROKER_ATTESTATION_SUBMITTED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'EVIDENCE_REFERENCE_REQUIRED');
                    return true;
                }
            );
        });

        test('3.11: Missing evidenceType throws EVIDENCE_TYPE_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: 'Authorized Broker',
                        evidenceReference: 'REF-001',
                        evidenceType: '',
                        evidenceVersion: 1,
                        notes: 'BROKER_ATTESTATION_SUBMITTED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'EVIDENCE_TYPE_REQUIRED');
                    return true;
                }
            );
        });

        test('3.12: Missing evidenceVersion throws EVIDENCE_VERSION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: 'Authorized Broker',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: null,
                        notes: 'BROKER_ATTESTATION_SUBMITTED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'EVIDENCE_VERSION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.13: Missing notes throws EVIDENCE_NOTES_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: 'Authorized Broker',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: ''
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'EVIDENCE_NOTES_REQUIRED');
                    return true;
                }
            );
        });

        test('3.14: Dynamic server timestamp generated only at submission', async () => {
            const beforeSubmission = new Date(Date.now() - 1000);
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: testActorUser._id.toString(),
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'CLIENT_STATEMENT_RECORDED'
            });

            const reportedAt = new Date(updated.userReportedEvidence.reportedAt);
            assert.ok(reportedAt >= beforeSubmission);
            assert.notStrictEqual(reportedAt.toISOString(), new Date('2026-11-06T17:51:10+05:30').toISOString());
        });

        test('3.15: Valid user-reported evidence leaves permissionStatus as NOT_OBTAINED', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: testActorUser._id.toString(),
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'CLIENT_STATEMENT_RECORDED'
            });

            const doc = await AuthoritySourceSettings.findById(updated._id).lean();
            assert.strictEqual(doc.permissionStatus, 'NOT_OBTAINED');
        });

        test('3.16: Operational flags stay disabled (isEnabled: false, schedulingEnabled: false)', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: testActorUser._id.toString(),
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'CLIENT_STATEMENT_RECORDED'
            });

            const doc = await AuthoritySourceSettings.findById(updated._id).lean();
            assert.strictEqual(doc.isEnabled, false);
            assert.strictEqual(doc.schedulingEnabled, false);
            assert.strictEqual(doc.termsReviewed, false);
            assert.strictEqual(doc.commercialUseAuthorized, false);
        });
    });

    // =========================================================================
    // Matrix 4: Neutral Defaults in ensureDefaults & reconcileOwnerAttestation
    // =========================================================================
    describe('Matrix 4: Neutral Defaults in ensureDefaults & reconcileOwnerAttestation', () => {

        test('4.1: ensureDefaults creates NOT_OBTAINED permission status', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            assert.ok(sources.length >= 3);
            for (const s of sources) {
                assert.strictEqual(s.permissionStatus, 'NOT_OBTAINED');
            }
        });

        test('4.2: ensureDefaults creates no fabricated attestation (userReportedEvidence is null)', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.userReportedEvidence?.reportedBy ?? null, null);
                assert.strictEqual(s.userReportedEvidence?.notes ?? null, null);
            }
        });

        test('4.3: ensureDefaults leaves evidenceBasis as null and approvedAccessMethod as null', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.evidenceBasis, null);
                assert.strictEqual(s.approvedAccessMethod, null);
            }
        });

        test('4.4: ensureDefaults leaves contractVerificationStatus as NOT_VERIFIED and identityRequirements.verified as false', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.contractVerificationStatus, 'NOT_VERIFIED');
                assert.strictEqual(s.identityRequirements?.verified, false);
            }
        });

        test('4.5: ensureDefaults sets no historical timestamp or hardcoded date', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                const createdAt = new Date(s.createdAt);
                assert.notStrictEqual(createdAt.toISOString(), new Date('2026-11-06T17:51:10+05:30').toISOString());
            }
        });

        test('4.6: reconcileOwnerAttestation without authentic evidence leaves permissionStatus as NOT_OBTAINED', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const reconciled = await AuthoritySourceSettings.reconcileOwnerAttestation(CANONICAL_ORG_ID_STRING);
            assert.ok(reconciled);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.permissionStatus, 'NOT_OBTAINED');
                assert.strictEqual(s.evidenceBasis, null);
            }
        });

        test('4.7: reconcileOwnerAttestation never sets permissionStatus to GRANTED without verified official proof', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            await AuthoritySourceSettings.reconcileOwnerAttestation(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.notStrictEqual(s.permissionStatus, 'GRANTED');
            }
        });

        test('4.8: reconcileOwnerAttestation never sets identityRequirements.verified to true without actual evidence', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            await AuthoritySourceSettings.reconcileOwnerAttestation(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.identityRequirements?.verified, false);
            }
        });

        test('4.9: Repeated ensureDefaults is strictly idempotent and does not overwrite existing records', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const firstRun = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const secondRun = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();

            assert.strictEqual(firstRun.length, secondRun.length);
            for (let i = 0; i < firstRun.length; i++) {
                assert.strictEqual(firstRun[i]._id.toString(), secondRun[i]._id.toString());
                assert.strictEqual(firstRun[i].permissionStatus, secondRun[i].permissionStatus);
            }
        });

        test('4.10: All operational activation fields remain disabled', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.isEnabled, false);
                assert.strictEqual(s.schedulingEnabled, false);
                assert.strictEqual(s.termsReviewed, false);
                assert.strictEqual(s.commercialUseAuthorized, false);
            }
        });
    });

    // =========================================================================
    // Matrix 5: Strict Metadata PII Contract
    // =========================================================================
    describe('Matrix 5: Strict Metadata PII Contract', () => {

        test('5.1: metadata.reason with RAJESH_KUMAR throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reason', 'RAJESH_KUMAR', 'metadata.reason');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.2: metadata.reason with VIKRAM_SINGH throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reason', 'VIKRAM_SINGH', 'metadata.reason');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.3: metadata.reason with arbitrary uppercase token throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reason', 'ARBITRARY_TOKEN_NOT_APPROVED', 'metadata.reason');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.4: changes.before containing citizen name throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuditChanges({ ownerName: 'RAJESH_KUMAR' }, 'metadata.changes.before');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.5: changes.after containing citizen name throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuditChanges({ allotteeName: 'VIKRAM_SINGH' }, 'metadata.changes.after');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.6: Arbitrary person string in nested userReportedEvidence throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('userReportedEvidence', {
                    reportedBy: 'Shri Rajesh Kumar'
                }, 'metadata.userReportedEvidence');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.7: Arbitrary reportedBy string throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateControlledScalarValue('Vikram Singh (Broker)', 'metadata.reportedBy');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.8: Arbitrary ownerAttestation child values throw FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmedBy: 'Shri Vikram Singh',
                    statementType: 'OWNER_CONFIRMATION'
                }, 'metadata.ownerAttestation');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.9: Arbitrary identityContractAttestation child values throw FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('identityContractAttestation', {
                    attestedBy: 'Rajesh Kumar',
                    attestationType: 'CONTRACT'
                }, 'metadata.identityContractAttestation');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.10: Unknown nested fields in metadata throw FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('unknownKey', 'Some value', 'metadata.unknownKey');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.11: Invalid primitive types in metadata throw FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('authorityCode', 12345, 'metadata.authorityCode');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.12: Unknown reason code not in finite enum throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reasonCode', 'NON_EXISTENT_REASON_CODE', 'metadata.reasonCode');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.13: Approved finite reason codes succeed', () => {
            const approvedReasons = [
                'EVIDENCE_REVIEWED',
                'LEGAL_HEIR_SUBSTITUTION',
                'SAGA_FAILURE_ROLLBACK',
                'COMPENSATION_REVERSAL',
                'COMPLIANCE_APPROVED',
                'MAKER_CHECKER_APPROVED',
                'MAKER_CHECKER_REJECTED'
            ];
            for (const r of approvedReasons) {
                assert.doesNotThrow(() => {
                    validateAuthorityMetadataValue('reasonCode', r, 'metadata.reasonCode');
                });
            }
        });

        test('5.14: Valid 24-character hex ObjectId accepted where schema permits', () => {
            const validOid = new mongoose.Types.ObjectId().toString();
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('reviewerId', validOid, 'metadata.reviewerId');
                validateAuthorityMetadataValue('approverId', validOid, 'metadata.approverId');
            });
        });

        test('5.15: Valid controlled role codes accepted', () => {
            const approvedRoles = ['PORTAL_OPERATOR', 'SYSTEM', 'MAKER', 'CHECKER', 'COMPLIANCE_OFFICER'];
            for (const role of approvedRoles) {
                assert.doesNotThrow(() => {
                    validateAuthorityMetadataValue('reviewerName', role, 'metadata.reviewerName');
                });
            }
        });

        test('5.16: Raw email address in metadata throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateControlledScalarValue('citizen@example.com', 'metadata.changes.before');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.17: Partially masked email in description throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                const doc = {
                    eventType: 'authority_source_approved',
                    description: 'Authority source approved for c***n@example.com'
                };
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.18: Fully minimized [EMAIL_MINIMIZED] token in description is accepted', () => {
            const doc = {
                eventType: 'authority_source_approval_reviewed',
                description: '[PII_MINIMIZED] with PAN [PAN_MINIMIZED], Aadhaar [AADHAAR_MINIMIZED], phone [PHONE_MINIMIZED], email [EMAIL_MINIMIZED] living at [ADDRESS_MINIMIZED]'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('5.19: Persisted description does not leak raw email or citizen identity', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(),
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: '[PII_MINIMIZED] with PAN [PAN_MINIMIZED], Aadhaar [AADHAAR_MINIMIZED], phone [PHONE_MINIMIZED], email [EMAIL_MINIMIZED] living at [ADDRESS_MINIMIZED]',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    reasonCode: 'COMPLIANCE_APPROVED'
                }
            });

            const fresh = await AuditLog.findById(audit._id).lean();
            assert.ok(!fresh.description.includes('@'));
            assert.ok(fresh.description.includes('[EMAIL_MINIMIZED]'));
        });

        test('5.20: Error messages do NOT echo or interpolate rejected input values', () => {
            const secretPAN = 'ABCDE1234F';
            try {
                validateControlledScalarValue('Citizen ABCDE1234F living at House 42', 'metadata.changes.before');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(!err.message.includes(secretPAN), 'Error message must not leak rejected input value');
            }
        });
    });
});
