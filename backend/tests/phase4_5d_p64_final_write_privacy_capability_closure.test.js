process.env.NODE_ENV = 'test';
import test, { describe, beforeEach, after, before } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';

import AuthoritySourceSettings, {
    AUTHORITY_CODES,
    INTERNAL_WORKFLOW_OPTION,
    issueDeleteWorkflowToken,
    issueOwnerConfirmationWorkflowToken,
    issueInternalSeedWorkflowToken,
    _testOnlyResetAuthoritySettings,
    registerVerifiedEphemeralTestDatabase,
    unregisterVerifiedEphemeralTestDatabase
} from '../models/AuthoritySourceSettings.js';
import AuditLog, {
    validateAuthorityMetadataValue,
    validateControlledScalarValue,
    CONTROLLED_AUDIT_REASONS
} from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import { CANONICAL_ORGANIZATION_ID, CANONICAL_ORGANIZATION_ID_STRING } from '../config/canonicalOrganization.js';

let replSet = null;
const CANONICAL_ORG_ID = CANONICAL_ORGANIZATION_ID;
const CANONICAL_ORG_ID_STRING = CANONICAL_ORGANIZATION_ID_STRING;
const NON_CANONICAL_ORG_ID = new mongoose.Types.ObjectId('000000000000000000000002');

before(async () => {
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    registerVerifiedEphemeralTestDatabase(replSet);
    const uri = replSet.getUri();
    await mongoose.connect(uri);
});

after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (replSet) {
        unregisterVerifiedEphemeralTestDatabase(replSet);
        await replSet.stop();
    }
});

beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
        await _testOnlyResetAuthoritySettings({});
        await AuditLog.deleteMany({});
        await PropertyVerificationRunItem.deleteMany({});
        await User.deleteMany({});
    }
});

describe('PHASE 4.5-D (PR #65) FINAL WRITE PRIVACY, DELETE BOUNDARY & CAPABILITY CLOSURE', () => {

    // =========================================================================
    // AREA 1: AUTHORITY SOURCE SETTINGS DELETE BOUNDARIES
    // =========================================================================
    describe('Area 1: AuthoritySourceSettings Delete Boundaries', () => {

        test('1.1: deleteOne without authorized internal delete capability token throws DELETION_PROHIBITED', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });
            await doc.save();

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne({
                        _id: doc._id,
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.2: deleteOne with token bound to wrong targetId throws UNAUTHORIZED_INTERNAL_WORKFLOW', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });
            await doc.save();

            const wrongId = new mongoose.Types.ObjectId();
            const token = issueDeleteWorkflowToken({
                targetId: wrongId,
                authorityCode: 'HSVP',
                tenantId: CANONICAL_ORGANIZATION_ID_STRING
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('1.3: deleteOne with token bound to wrong authorityCode throws UNAUTHORIZED_INTERNAL_WORKFLOW', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });
            await doc.save();

            const token = issueDeleteWorkflowToken({
                targetId: doc._id,
                authorityCode: 'GMADA',
                tenantId: CANONICAL_ORGANIZATION_ID_STRING
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('1.4: deleteMany is strictly prohibited even with valid workflow token', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });
            await doc.save();

            const token = issueDeleteWorkflowToken({
                targetId: doc._id,
                authorityCode: 'HSVP',
                tenantId: CANONICAL_ORGANIZATION_ID_STRING
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteMany(
                        { tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    assert.strictEqual(err.subCode, 'DELETE_MANY_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.5: Native driver collection delete without token throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.collection.deleteOne({
                        _id: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.6: Native driver collection delete with empty filter throws DELETION_PROHIBITED', async () => {
            const token = issueDeleteWorkflowToken({
                targetId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                tenantId: CANONICAL_ORGANIZATION_ID_STRING
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.collection.deleteOne(
                        {},
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.7: Low-level driver mongoose.connection.db.collection delete without token throws DELETION_PROHIBITED', async () => {
            const coll = mongoose.connection.db.collection('authority_source_settings');
            await assert.rejects(
                async () => {
                    await coll.deleteOne({
                        _id: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.8: Low-level driver getClient().db().collection delete without token throws DELETION_PROHIBITED', async () => {
            const clientDb = mongoose.connection.getClient().db();
            const coll = clientDb.collection('authority_source_settings');
            await assert.rejects(
                async () => {
                    await coll.deleteOne({
                        _id: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.9: In production (NODE_ENV=production), deletion is unconditionally prohibited', async () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.deleteOne({
                            _id: new mongoose.Types.ObjectId(),
                            tenantId: CANONICAL_ORG_ID,
                            authorityCode: 'HSVP'
                        });
                    },
                    err => {
                        assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('1.10: _testOnlyResetAuthoritySettings throws DELETION_PROHIBITED when NODE_ENV=production', async () => {
            const originalEnv = process.env.NODE_ENV;
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
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('1.11: _testOnlyResetAuthoritySettings throws TEST_ONLY_CAPABILITY_PROHIBITED when NODE_ENV=development', async () => {
            const originalEnv = process.env.NODE_ENV;
            try {
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
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('1.12: Authorized deleteOne with matching token and matching target succeeds', async () => {
            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });
            await doc.save();

            const token = issueDeleteWorkflowToken({
                targetId: doc._id,
                authorityCode: 'HSVP',
                tenantId: CANONICAL_ORGANIZATION_ID_STRING
            });

            const res = await AuthoritySourceSettings.deleteOne(
                { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                { [INTERNAL_WORKFLOW_OPTION]: token }
            );
            assert.strictEqual(res.deletedCount, 1);
        });
    });

    // =========================================================================
    // AREA 2: RECURSIVE METADATA SCHEMA & VALUE CONTRACTS
    // =========================================================================
    describe('Area 2: Recursive Metadata Schema & Value Contracts', () => {

        test('2.1: reviewerName rejects arbitrary citizen name narrative', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'Mr. Rajesh Kumar citizen from Sector 14 Gurgaon', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('METADATA_VALUE_INVALID'));
                return true;
            });
        });

        test('2.2: reviewerName rejects conversational narrative sentence', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'Review done by senior officer Rajesh', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.3: reviewerName accepts 24-char ObjectId and uppercase technical system identifiers', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('reviewerName', new mongoose.Types.ObjectId().toString(), 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'SYSTEM', 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'MAKER', 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'CHECKER', 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'COMPLIANCE_REVIEWER', 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'COMPLIANCE_OFFICER_1', 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'BATCH_WORKER', 'metadata.reviewerName');
            });
        });

        test('2.4: searchCriteria rejects unauthorized narrative keys', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('searchCriteria', { propertyId: 'PROP-101', citizenRemarks: 'demanded fast verification' }, 'metadata.searchCriteria');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.5: searchCriteria.propertyId rejects free-text containing spaces', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('searchCriteria', { propertyId: 'PROP 101 with citizen note' }, 'metadata.searchCriteria');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.6: searchCriteria accepts approved criteria fields', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('searchCriteria', {
                    propertyId: 'PROP_101_SEC14',
                    sectorNumber: '14',
                    sector: 'Sector 14',
                    urbanEstate: 'Gurgaon Urban Estate',
                    authorityCode: 'HSVP',
                    plotNo: '42-A',
                    unitNo: 'Unit-1'
                }, 'metadata.searchCriteria');
            });
        });

        test('2.7: Scalar validator rejects narrative sentences and citizen references in before/after', () => {
            assert.throws(() => {
                validateControlledScalarValue('citizen applicant requested changes', 'changes.before');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.8: Scalar validator rejects PAN, Aadhaar, email, and phone numbers', () => {
            assert.throws(() => {
                validateControlledScalarValue('ABCDE1234F', 'changes.after');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
            assert.throws(() => {
                validateControlledScalarValue('9876543210', 'changes.after');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
            assert.throws(() => {
                validateControlledScalarValue('user@example.com', 'changes.after');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.9: Reconciled reason rejects free-text narrative; accepts controlled reasons', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reconciledReason', 'Citizen arrived with new paper documents', 'metadata.reconciledReason');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('reconciledReason', 'LEGAL_HEIR_SUBSTITUTION', 'metadata.reconciledReason');
            });
        });

        test('2.10: Error messages do NOT interpolate rejected input values', () => {
            try {
                validateControlledScalarValue('Citizen ABCDE1234F living at House 42', 'metadata.changes.before');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(!err.message.includes('ABCDE1234F'), 'Error message must not leak rejected PAN');
                assert.ok(!err.message.includes('House 42'), 'Error message must not leak rejected text');
            }
        });

        test('2.11: Object depth exceeding 4 throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('changes', {}, 'metadata.changes', null, 5);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Unexpected object depth'));
                return true;
            });
        });
    });

    // =========================================================================
    // AREA 3: DESCRIPTION TEMPLATE PII REMOVAL & PRE-MASKING VALIDATION
    // =========================================================================
    describe('Area 3: Description Template PII Removal & Pre-Masking Validation', () => {

        test('3.1: Raw citizen description is rejected with FREE_TEXT_AUDIT_PROHIBITED', async () => {
            const rawSensitiveDescription = 'Citizen Rahul Sharma with PAN ABCDE1234F, Aadhaar 2345 6789 0123, phone +91-9876543210, email rahul@example.com living at House 42 Park Street Gurgaon';

            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        targetType: 'authority_settings',
                        actorId: new mongoose.Types.ObjectId(),
                        userId: new mongoose.Types.ObjectId(),
                        status: 'success',
                        description: rawSensitiveDescription,
                        metadata: {
                            tenantId: CANONICAL_ORG_ID,
                            authorityCode: 'HSVP'
                        }
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.2: Controlled minimized placeholder description is accepted', async () => {
            const minimizedDescription = '[PII_MINIMIZED] with PAN [PAN_MINIMIZED], Aadhaar [AADHAAR_MINIMIZED], phone [PHONE_MINIMIZED], email [EMAIL_MINIMIZED] living at [ADDRESS_MINIMIZED]';

            const audit = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'success',
                description: minimizedDescription,
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    reasonCode: 'COMPLIANCE_APPROVED'
                }
            });

            const retrieved = await AuditLog.findById(audit._id).lean();
            assert.ok(retrieved);
            assert.ok(retrieved.description.includes('[PAN_MINIMIZED]'));
            assert.ok(retrieved.description.includes('[AADHAAR_MINIMIZED]'));
            assert.ok(retrieved.description.includes('[PHONE_MINIMIZED]'));
            assert.ok(retrieved.description.includes('[EMAIL_MINIMIZED]'));
        });

        test('3.3: Cross-event description template mismatch throws FREE_TEXT_AUDIT_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        targetType: 'authority_settings',
                        actorId: new mongoose.Types.ObjectId(),
                        userId: new mongoose.Types.ObjectId(),
                        status: 'success',
                        description: 'Verification run created for HSVP',
                        metadata: {
                            tenantId: CANONICAL_ORG_ID,
                            authorityCode: 'HSVP'
                        }
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // AREA 4: CLAIM-BOUND SAGA COMPENSATION
    // =========================================================================
    describe('Area 4: Claim-Bound Saga Compensation', () => {

        test('4.1: Saga compensation update without _id in filter is rejected', async () => {
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
                    claimId: 'claim_recovery_101'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { eventType: 'authority_changes_applied' },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'claim_recovery_101'
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

        test('4.2: Saga compensation rejects operators other than $set', async () => {
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
                    claimId: 'claim_recovery_101'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        { $inc: { 'metadata.retryCount': 1 } }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes("Operator '$inc' is strictly prohibited"));
                    return true;
                }
            );
        });

        test('4.3: Saga compensation rejects entire metadata object replacement', async () => {
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
                    claimId: 'claim_recovery_101'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                metadata: { compensated: true, compensationClaimId: 'claim_recovery_101' }
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('Entire metadata object replacement is prohibited'));
                    return true;
                }
            );
        });

        test('4.4: Saga compensation rejects modifying fields outside the 5 allowed keys', async () => {
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
                    claimId: 'claim_recovery_101'
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
                                'metadata.compensationClaimId': 'claim_recovery_101',
                                'metadata.authorityCode': 'GMADA'
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes("Mutating field 'metadata.authorityCode' on 'authority_changes_applied' is prohibited"));
                    return true;
                }
            );
        });

        test('4.5: Saga compensation requires status: compensated', async () => {
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
                    claimId: 'claim_recovery_101'
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'in_progress',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': 'claim_recovery_101'
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes("only permits state transition to status: 'compensated'"));
                    return true;
                }
            );
        });

        test('4.6: Valid saga compensation succeeds with allowed keys', async () => {
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
        });

        test('4.7: Once compensated, record is terminal and strictly immutable', async () => {
            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                actorId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                status: 'compensated',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    compensated: true
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        { $set: { 'metadata.compensationClaimId': 'claim_tampered_002' } }
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
    // AREA 5: OWNER CONFIRMATION STATIC WORKFLOW
    // =========================================================================
    describe('Area 5: Owner Confirmation Static Workflow', () => {

        test('5.1: recordOwnerConfirmation succeeds for existing source with canonical tenant and valid authorityCode', async () => {
            const adminRole = await Role.create({
                tenantId: CANONICAL_ORG_ID,
                name: 'Super Admin',
                permissions: ['*'],
                department: 'sales'
            });

            const actorUser = await User.create({
                tenantId: CANONICAL_ORG_ID,
                fullName: 'Portal Operator',
                email: 'operator@bharatproperties.internal',
                password: 'Password123!',
                department: 'sales',
                role: adminRole._id,
                status: 'active',
                isActive: true
            });

            const doc = new AuthoritySourceSettings({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW',
                evidenceVersion: 1
            });
            await doc.save();

            const updated = await AuthoritySourceSettings.recordOwnerConfirmation(
                CANONICAL_ORG_ID,
                'HSVP',
                {
                    trustedPrincipal: actorUser,
                    reportedBy: actorUser._id.toString(),
                    claimedAuthorityRole: 'PORTAL_OPERATOR',
                    evidenceReference: 'REF-001',
                    evidenceType: 'CLIENT_STATEMENT',
                    evidenceVersion: 1,
                    notes: 'EVIDENCE_REVIEWED'
                }
            );

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.reportedBy, actorUser._id.toString());
            assert.strictEqual(updated.userReportedEvidence?.claimedAuthorityRole, 'PORTAL_OPERATOR');
        });

        test('5.2: recordOwnerConfirmation rejects non-canonical tenant with ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation(
                        NON_CANONICAL_ORG_ID,
                        'HSVP',
                        { reportedBy: 'Bharat Properties Owner' }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.3: recordOwnerConfirmation rejects invalid authority code with AUTHORITY_CODE_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation(
                        CANONICAL_ORG_ID,
                        'INVALID_CODE',
                        { reportedBy: 'Bharat Properties Owner' }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHORITY_CODE_REQUIRED');
                    return true;
                }
            );
        });

        test('5.4: recordOwnerConfirmation for non-existent authority source throws AUTHORITY_SOURCE_NOT_FOUND', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation(
                        CANONICAL_ORG_ID,
                        'GMADA',
                        { reportedBy: 'Bharat Properties Owner' }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHORITY_SOURCE_NOT_FOUND');
                    return true;
                }
            );
        });

        test('5.5: issueOwnerConfirmationWorkflowToken rejects wildcard targetId with TARGET_ID_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                    authorityCode: 'HSVP',
                    targetId: '*'
                });
            }, err => {
                assert.strictEqual(err.code, 'TARGET_ID_REQUIRED');
                return true;
            });
        });

        test('5.6: issueOwnerConfirmationWorkflowToken rejects non-canonical tenant with CANONICAL_ORGANIZATION_REQUIRED', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({
                    tenantId: NON_CANONICAL_ORG_ID.toString(),
                    authorityCode: 'HSVP',
                    targetId: new mongoose.Types.ObjectId().toString()
                });
            }, err => {
                assert.ok(err.message.includes('CANONICAL_ORGANIZATION_REQUIRED'));
                return true;
            });
        });
    });

    // =========================================================================
    // AREA 6: INTERNAL SEED TEST-ONLY GUARD
    // =========================================================================
    describe('Area 6: Internal Seed Test-Only Guard', () => {

        test('6.1: issueInternalSeedWorkflowToken succeeds when NODE_ENV=test', () => {
            assert.doesNotThrow(() => {
                const token = issueInternalSeedWorkflowToken({
                    tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                    authorityCode: 'HSVP'
                });
                assert.ok(token);
                assert.strictEqual(token.workflowName, 'internal_seed');
            });
        });

        test('6.2: issueInternalSeedWorkflowToken fails with TEST_ONLY_CAPABILITY_PROHIBITED when NODE_ENV=production', () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                assert.throws(() => {
                    issueInternalSeedWorkflowToken({
                        tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                }, err => {
                    assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                    return true;
                });
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('6.3: issueInternalSeedWorkflowToken fails with TEST_ONLY_CAPABILITY_PROHIBITED when NODE_ENV=development', () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'development';
                assert.throws(() => {
                    issueInternalSeedWorkflowToken({
                        tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                }, err => {
                    assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                    return true;
                });
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('6.4: issueInternalSeedWorkflowToken fails with TEST_ONLY_CAPABILITY_PROHIBITED when NODE_ENV is unset (undefined)', () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                delete process.env.NODE_ENV;
                assert.throws(() => {
                    issueInternalSeedWorkflowToken({
                        tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                }, err => {
                    assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                    return true;
                });
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('6.5: issueInternalSeedWorkflowToken fails with TEST_ONLY_CAPABILITY_PROHIBITED when NODE_ENV is empty string', () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = '';
                assert.throws(() => {
                    issueInternalSeedWorkflowToken({
                        tenantId: CANONICAL_ORGANIZATION_ID_STRING,
                        authorityCode: 'HSVP'
                    });
                }, err => {
                    assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                    return true;
                });
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });
    });
});
