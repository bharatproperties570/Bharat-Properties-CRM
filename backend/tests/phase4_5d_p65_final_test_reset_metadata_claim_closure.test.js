/**
 * PHASE 4.5-D (PR #66) FINAL TEST RESET, METADATA CHILD SCHEMAS,
 * EXACT OWNER CAPABILITY BINDING & REAL SAGA CLAIM CLOSURE TEST SUITE
 *
 * Covers 5 Strict Engineering Matrices (60 Total Tests):
 * Matrix 1: AuthoritySourceSettings Delete Boundaries & Ephemeral Teardown (12 tests)
 * Matrix 2: Exact Owner-Confirmation Capability Target & Evidence Version Binding (12 tests)
 * Matrix 3: Genuine Owner Confirmation Evidence & Non-Fabrication (12 tests)
 * Matrix 4: Metadata Strict Child Schemas, Name Rejection & Email Minimization (12 tests)
 * Matrix 5: Truly Claim-Bound Saga Compensation (12 tests)
 */

process.env.NODE_ENV = 'test';

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuditLog, {
    isImmutableAuditEvent,
    isAuthorityAuditEvent,
    isControlledAuthorityDescription,
    sanitizeAuditDocument,
    sanitizeAuditUpdate,
    checkAuditImmutability,
    validateAuthorityMetadataValue,
    validateControlledScalarValue,
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

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING
} from '../config/canonicalOrganization.js';

let mongoServer;
let testActorUser;
const CANONICAL_ORG_ID = CANONICAL_ORGANIZATION_ID;
const CANONICAL_ORG_ID_STRING = CANONICAL_ORGANIZATION_ID_STRING;
const NON_CANONICAL_ORG_ID = new mongoose.Types.ObjectId('111111111111111111111111');

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    registerVerifiedEphemeralTestDatabase(mongoServer);
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

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

describe('PHASE 4.5-D (PR #66) FINAL TEST RESET, METADATA SCHEMA & SAGA CLAIM CLOSURE', () => {

    // =========================================================================
    // Matrix 1: AuthoritySourceSettings Delete Boundaries & Ephemeral Teardown
    // =========================================================================
    describe('Matrix 1: AuthoritySourceSettings Delete Boundaries & Ephemeral Teardown', () => {

        test('1.1: deleteMany({}) with NODE_ENV=test on persistent local MongoDB is prohibited', async () => {
            const savedInstances = Array.from(clearVerifiedEphemeralTestDatabases ? [] : []);
            clearVerifiedEphemeralTestDatabases();
            try {
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.deleteMany({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                registerVerifiedEphemeralTestDatabase(mongoServer);
            }
        });

        test('1.2: deleteMany({}) with NODE_ENV=development is strictly prohibited', async () => {
            const orig = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'development';
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.deleteMany({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = orig;
            }
        });

        test('1.3: deleteMany({}) on remote database with test-like name is prohibited', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteMany({ databaseName: 'test-db-remote' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.4: Caller-supplied _internalTestReset option spoofing is rejected', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteMany({}, { _internalTestReset: true });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.5: Test cleanup helper invoked outside NODE_ENV=test throws TEST_ONLY_CAPABILITY_PROHIBITED', async () => {
            const orig = process.env.NODE_ENV;
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

                process.env.NODE_ENV = 'development';
                await assert.rejects(
                    async () => {
                        await _testOnlyResetAuthoritySettings({});
                    },
                    err => {
                        assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = orig;
            }
        });

        test('1.6: Test cleanup helper fails when active database is not in verified registered instances', async () => {
            clearVerifiedEphemeralTestDatabases();
            try {
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

        test('1.7: Test cleanup helper on unverified remote database fails closed', async () => {
            clearVerifiedEphemeralTestDatabases();
            // Plain object registration is rejected under strict ephemeral identity contract
            assert.throws(
                () => {
                    registerVerifiedEphemeralTestDatabase({ port: 12345, getUri: () => 'mongodb://127.0.0.1:12345/test' });
                },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
            try {
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
                clearVerifiedEphemeralTestDatabases();
                registerVerifiedEphemeralTestDatabase(mongoServer);
            }
        });

        test('1.8: Direct Model.collection.deleteMany({}) throws DELETION_PROHIBITED', async () => {
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

        test('1.9: Low-level mongoose.connection.db.collection(...).deleteMany({}) throws DELETION_PROHIBITED', async () => {
            const rawCol = mongoose.connection.db.collection('authoritysourcesettings');
            await assert.rejects(
                async () => {
                    await rawCol.deleteMany({});
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.10: Low-level getClient().db().collection(...).deleteMany({}) throws DELETION_PROHIBITED', async () => {
            const clientCol = mongoose.connection.getClient().db().collection('authoritysourcesettings');
            await assert.rejects(
                async () => {
                    await clientCol.deleteMany({});
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.11: deleteOne and findOneAndDelete without authorized workflow token are prohibited', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.findOneAndDelete({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.12: Valid test teardown succeeds only against explicitly registered ephemeral instance', async () => {
            assert.strictEqual(isVerifiedEphemeralTestDatabase(), true);
            await assert.doesNotThrow(async () => {
                await _testOnlyResetAuthoritySettings({ tenantId: CANONICAL_ORG_ID });
            });
        });

    });

    // =========================================================================
    // Matrix 2: Exact Owner-Confirmation Capability Target & Evidence Version Binding
    // =========================================================================
    describe('Matrix 2: Exact Owner-Confirmation Capability Target & Evidence Version Binding', () => {

        test('2.1: Missing targetId throws TARGET_ID_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    evidenceVersion: 1
                });
            }, err => {
                assert.strictEqual(err.code, 'TARGET_ID_REQUIRED');
                return true;
            });
        });

        test('2.2: Empty targetId throws TARGET_ID_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    targetId: '   ',
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    evidenceVersion: 1
                });
            }, err => {
                assert.strictEqual(err.code, 'TARGET_ID_REQUIRED');
                return true;
            });
        });

        test('2.3: Explicit wildcard targetId throws TARGET_ID_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    targetId: '*',
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    evidenceVersion: 1
                });
            }, err => {
                assert.strictEqual(err.code, 'TARGET_ID_REQUIRED');
                return true;
            });
        });

        test('2.4: Token bound to wrong targetId fails during update', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            await doc.save();

            const wrongTargetId = new mongoose.Types.ObjectId().toString();
            const token = issueOwnerConfirmationWorkflowToken({
                targetId: wrongTargetId,
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('2.5: Exact target with wrong authorityCode fails verification', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            await doc.save();

            const token = issueOwnerConfirmationWorkflowToken({
                targetId: doc._id.toString(),
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'GMADA',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('2.6: Exact target with wrong evidenceVersion fails verification', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                evidenceVersion: 2
            });
            await doc.save();

            const token = issueOwnerConfirmationWorkflowToken({
                targetId: doc._id.toString(),
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('2.7: Token valid for docA rejected when applied against docB of same authority', async () => {
            const docA = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'CHD',
                evidenceVersion: 1
            });
            await docA.save();

            const docB_id = new mongoose.Types.ObjectId();
            const tokenA = issueOwnerConfirmationWorkflowToken({
                targetId: docA._id.toString(),
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'CHD',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: docB_id, tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { [INTERNAL_WORKFLOW_OPTION]: tokenA }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('2.8: updateMany rejects owner-confirmation capability with MULTI_DOCUMENT_UPDATE_PROHIBITED', async () => {
            const targetId = new mongoose.Types.ObjectId().toString();
            const token = issueOwnerConfirmationWorkflowToken({
                targetId,
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateMany(
                        { tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'MULTI_DOCUMENT_UPDATE_PROHIBITED');
                    assert.ok(err.message.includes('MULTI_DOCUMENT_UPDATE_PROHIBITED'));
                    return true;
                }
            );
        });

        test('2.9: Upsert with owner confirmation capability is rejected with SECURITY_UPSERT_PROHIBITED', async () => {
            const targetId = new mongoose.Types.ObjectId().toString();
            const token = issueOwnerConfirmationWorkflowToken({
                targetId,
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: targetId, tenantId: CANONICAL_ORG_ID },
                        { $set: { 'userReportedEvidence.notes': 'Owner confirmed.' } },
                        { upsert: true, [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'SECURITY_UPSERT_PROHIBITED');
                    return true;
                }
            );
        });

        test('2.10: Non-canonical tenant throws CANONICAL_ORGANIZATION_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    targetId: new mongoose.Types.ObjectId().toString(),
                    tenantId: NON_CANONICAL_ORG_ID.toString(),
                    authorityCode: 'HSVP',
                    evidenceVersion: 1
                });
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('2.11: Single-use nonce replay returns false on second verification', () => {
            const targetId = new mongoose.Types.ObjectId().toString();
            const token = issueOwnerConfirmationWorkflowToken({
                targetId,
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            const first = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordOwnerConfirmation'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 1 }
            );
            assert.strictEqual(first, true);

            const second = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordOwnerConfirmation'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 1 }
            );
            assert.strictEqual(second, false);
        });

        test('2.12: Expired token fails verification', () => {
            const targetId = new mongoose.Types.ObjectId().toString();
            const token = issueOwnerConfirmationWorkflowToken({
                targetId,
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            token.expiresAt = Date.now() - 1000;

            const res = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordOwnerConfirmation'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 1 }
            );
            assert.strictEqual(res, false);
        });

    });

    // =========================================================================
    // Matrix 3: Genuine Owner Confirmation Evidence & Non-Fabrication
    // =========================================================================
    describe('Matrix 3: Genuine Owner Confirmation Evidence & Non-Fabrication', () => {

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

        test('3.1: Static method rejects missing actor identity with AUTHENTICATED_PRINCIPAL_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: '',
                        claimedAuthorityRole: 'Authorized Broker',
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHENTICATED_PRINCIPAL_REQUIRED');
                    return true;
                }
            );
        });

        test('3.2: Static method rejects missing confirmation evidence with CONFIRMATION_EVIDENCE_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation(CANONICAL_ORG_ID_STRING, 'HSVP', null);
                },
                err => {
                    assert.strictEqual(err.code, 'CONFIRMATION_EVIDENCE_REQUIRED');
                    return true;
                }
            );
        });

        test('3.3: Static method rejects missing claimedAuthorityRole', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'GMADA',
                evidenceVersion: 1
            });
            await doc.save();

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'GMADA',
                        trustedPrincipal: testActorUser,
                        reportedBy: testActorUser._id.toString(),
                        claimedAuthorityRole: '   ',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CONFIRMATION_DETAILS_REQUIRED');
                    return true;
                }
            );
        });

        test('3.4: Valid confirmation does not enable isEnabled (remains false)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.strictEqual(fresh.isEnabled, false);
        });

        test('3.5: Valid confirmation does not enable schedulingEnabled (remains false)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });
            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.strictEqual(fresh.schedulingEnabled, false);
        });

        test('3.6: Valid confirmation does not change permissionStatus to GRANTED (remains NOT_OBTAINED)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });
            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.notStrictEqual(fresh.permissionStatus, 'GRANTED');
        });

        test('3.7: Valid confirmation does not set reviewStatus to APPROVED (remains unreviewed/null)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });
            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.notStrictEqual(fresh.reviewStatus, 'APPROVED');
        });

        test('3.8: Valid confirmation does not accept terms (termsReviewed remains false)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });
            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.strictEqual(fresh.termsReviewed, false);
        });

        test('3.9: Valid confirmation does not create commercial-use authorization (commercialUseAuthorized remains false)', async () => {
            const actorId = testActorUser._id.toString();
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });
            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            assert.strictEqual(fresh.commercialUseAuthorized, false);
        });

        test('3.10: Static method requires real server timestamp at time of submission (not hardcoded 2026-11-06)', async () => {
            const beforeTime = new Date(Date.now() - 2000);
            const actorId = testActorUser._id.toString();

            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                trustedPrincipal: testActorUser,
                reportedBy: actorId,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-001',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            const fresh = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' }).lean();
            const reportedAt = new Date(fresh.userReportedEvidence.reportedAt);
            assert.ok(reportedAt >= beforeTime);
            assert.notStrictEqual(reportedAt.toISOString(), new Date('2026-11-06T17:51:10+05:30').toISOString());
        });

        test('3.11: Static method stores controlled minimized notes (no arbitrary narrative)', async () => {
            const actorId = testActorUser._id.toString();
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testActorUser,
                        reportedBy: actorId,
                        claimedAuthorityRole: 'Authorized Broker',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'Shri Rajesh Kumar visited our office on Monday with original registry papers.'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.12: ensureDefaults does not create fabricated attestation (userReportedEvidence is null)', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORG_ID_STRING);
            const sources = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORG_ID }).lean();
            for (const s of sources) {
                assert.strictEqual(s.userReportedEvidence?.reportedBy ?? null, null);
                assert.strictEqual(s.userReportedEvidence?.notes ?? null, null);
            }
        });

    });

    // =========================================================================
    // Matrix 4: Metadata Strict Child Schemas, Name Rejection & Email Minimization
    // =========================================================================
    describe('Matrix 4: Metadata Strict Child Schemas, Name Rejection & Email Minimization', () => {

        test('4.1: reviewerName with RAJESH_KUMAR throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'RAJESH_KUMAR', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.2: approverName with RAJESH_KUMAR throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('approverName', 'RAJESH_KUMAR', 'metadata.approverName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.3: reviewerName with Rajesh Kumar throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'Rajesh Kumar', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.4: approverName with Rajesh Kumar throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('approverName', 'Rajesh Kumar', 'metadata.approverName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.5: Unknown uppercase personal-looking token throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'VIKRAM_SINGH_ADMIN', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.6: Ordinary names in changes.before and changes.after are rejected', () => {
            assert.throws(() => {
                validateControlledScalarValue('Rajesh Kumar', 'changes.before');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });

            assert.throws(() => {
                validateControlledScalarValue('Amit Sharma', 'changes.after');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.7: targetName with human name throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('targetName', 'Rajesh Kumar Allottee', 'metadata.targetName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.8: reason with human name or free narrative throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reason', 'Citizen Rahul requested urgent review of plot papers', 'metadata.reason');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.9: ownerAttestation.confirmedBy with arbitrary text throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmed: true,
                    confirmedBy: 'Bharat Properties Manager',
                    confirmedAt: new Date()
                }, 'metadata.ownerAttestation');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.10: ownerAttestation.evidence with unapproved object throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmed: true,
                    confirmedBy: new mongoose.Types.ObjectId().toString(),
                    confirmedAt: new Date(),
                    evidence: { illegalKey: 'smuggled data' }
                }, 'metadata.ownerAttestation');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.11: identityContractAttestation.attestedBy with arbitrary text throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('identityContractAttestation', {
                    evidenceReference: 'REF-101',
                    evidenceVersion: 1,
                    attestedBy: 'Senior Compliance Auditor John'
                }, 'metadata.identityContractAttestation');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('4.12: Persisted description rejects raw/partially masked email; accepts [EMAIL_MINIMIZED]', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        targetType: 'authority_settings',
                        actorId: new mongoose.Types.ObjectId(),
                        userId: new mongoose.Types.ObjectId(),
                        status: 'success',
                        description: '[PII_MINIMIZED] with PAN [PAN_MINIMIZED], Aadhaar [AADHAAR_MINIMIZED], phone [PHONE_MINIMIZED], email user@example.com living at [ADDRESS_MINIMIZED]',
                        metadata: {
                            tenantId: CANONICAL_ORG_ID,
                            authorityCode: 'HSVP',
                            reasonCode: 'COMPLIANCE_APPROVED'
                        }
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );

            const audit = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                targetType: 'authority_settings',
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
            assert.ok(fresh.description.includes('[EMAIL_MINIMIZED]'));
            assert.ok(!fresh.description.includes('@'));
        });

    });

    // =========================================================================
    // Matrix 5: Truly Claim-Bound Saga Compensation
    // =========================================================================
    describe('Matrix 5: Truly Claim-Bound Saga Compensation', () => {

        test('5.1: Status-only compensation update is rejected', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        { $set: { status: 'compensated' } }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('5.2: Missing metadata.compensated: true is rejected', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
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
                                'metadata.compensationClaimId': 'claim_alpha_1234'
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

        test('5.3: Missing compensationClaimId is rejected', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
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
                                'metadata.compensated': true
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

        test('5.4: Fixed fallback claim ID (compensation_claim_id) is rejected', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
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

        test('5.5: Syntactically valid claim ID not belonging to any RunItem is rejected', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
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
                                'metadata.compensationClaimId': 'claim_ghost_nonexistent_999'
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

        test('5.6: Claim ID from another RunItem is rejected', async () => {
            const legitClaimIdA = new mongoose.Types.ObjectId();
            const itemA = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: {
                    claimId: legitClaimIdA
                }
            });

            const auditB = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId(), // Different item ID!
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: new mongoose.Types.ObjectId()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: auditB._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': legitClaimIdA.toString()
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

        test('5.7: Wrong AuditLog ID throws', async () => {
            const wrongId = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: wrongId },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'comp_claim_item_alpha_101'
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

        test('5.8: Wrong event type (e.g. authority_source_approval_reviewed) is completely immutable', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: 'Authority source approval reviewed for HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    reasonCode: 'COMPLIANCE_APPROVED'
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
                                'metadata.compensationClaimId': 'comp_claim_101'
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

        test('5.9: Mixed update operators (e.g. $inc with $set) are strictly prohibited', async () => {
            const legitClaimIdMixed = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: {
                    claimId: legitClaimIdMixed
                }
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
                    claimId: legitClaimIdMixed.toString()
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
                                'metadata.compensationClaimId': legitClaimIdMixed.toString()
                            },
                            $inc: { 'metadata.retryCount': 1 }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes("Operator '$inc' is strictly prohibited"));
                    return true;
                }
            );
        });

        test('5.10: updateMany is strictly prohibited for saga compensation', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.updateMany(
                        { eventType: 'authority_changes_applied' },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'comp_claim_mixed_ops_101'
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

        test('5.11: Upsert is strictly prohibited during saga compensation', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: fakeId },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'comp_claim_mixed_ops_101'
                            }
                        },
                        { upsert: true }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('5.12: Valid claim-bound compensation succeeds and record becomes terminally immutable', async () => {
            const legitClaimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: {
                    claimId: legitClaimId
                }
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
                    claimId: legitClaimId.toString()
                }
            });

            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        status: 'compensated',
                        'metadata.compensated': true,
                        'metadata.compensationClaimId': legitClaimId.toString(),
                        'metadata.compensatedAt': new Date()
                    }
                }
            );

            const updated = await AuditLog.findById(audit._id).lean();
            assert.strictEqual(updated.status, 'compensated');
            assert.strictEqual(updated.metadata?.compensated, true);
            assert.strictEqual(updated.metadata?.compensationClaimId, legitClaimId.toString());

            // Terminal immutability: record cannot be updated again
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': legitClaimId.toString()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('Record has already been compensated and is terminally immutable'));
                    return true;
                }
            );
        });

    });

});
