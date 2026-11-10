/**
 * PHASE 4.5-D (PR #64) FINAL DELETE BOUNDARY, METADATA VALUE CONTRACT & CAPABILITY SCOPE CLOSURE
 *
 * Dedicated Test Suite covering 5 Rigorous Areas:
 * Area 1: AuthoritySourceSettings Direct Delete Boundary & Capability Protection (12 tests)
 * Area 2: AuditLog Recursive Metadata Schema & Value Contracts (10 tests)
 * Area 3: Event Description Template Anchoring & No Cross-Event Fallback (6 tests)
 * Area 4: Saga Compensation Narrow Exception & Immutability (6 tests)
 * Area 5: Capability Scoping & Owner Confirmation Exact Binding (6 tests)
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
    isControlledAuthorityDescriptionForEvent,
    sanitizeAuditDocument,
    sanitizeAuditUpdate,
    validateAuthorityMetadata,
    validateAuthorityMetadataValue,
    validateControlledTextFields,
    EVENT_DESCRIPTION_TEMPLATES_REGISTRY,
    CONTROLLED_AUTHORITY_METADATA_SCHEMA
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
    _testOnlyResetAuthoritySettings
} from '../models/AuthoritySourceSettings.js';

import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING
} from '../config/canonicalOrganization.js';

let mongoServer;
const CANONICAL_ORG_ID = CANONICAL_ORGANIZATION_ID;
const CANONICAL_ORG_ID_STRING = CANONICAL_ORGANIZATION_ID_STRING;
const NON_CANONICAL_ORG_ID = new mongoose.Types.ObjectId('111111111111111111111111');

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    registerVerifiedEphemeralTestDatabase(mongoServer);
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        unregisterVerifiedEphemeralTestDatabase(mongoServer);
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
        await _testOnlyResetAuthoritySettings({});
        await AuditLog.deleteMany({});
        await PropertyVerificationRunItem.deleteMany({});
    }
});

describe('PHASE 4.5-D (PR #64) FINAL DELETE BOUNDARY, METADATA VALUE CONTRACT & CAPABILITY SCOPE CLOSURE', () => {

    // =========================================================================
    // AREA 1: AUTHORITY SOURCE SETTINGS DIRECT DELETE BOUNDARY (12 Tests)
    // =========================================================================
    describe('Area 1: AuthoritySourceSettings Direct Delete Boundary', () => {

        test('1.1: deleteOne without canonical tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne({ authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('1.2: deleteOne with non-canonical tenantId throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne({ tenantId: NON_CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.3: deleteOne without authorized internal delete capability token throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.4: deleteMany without authorized internal delete capability token throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.deleteMany({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.5: findOneAndDelete without authorized internal delete capability token throws DELETION_PROHIBITED', async () => {
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

        test('1.6: findByIdAndDelete without authorized capability token throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            const id = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.findByIdAndDelete(id);
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('1.7: Document-level deleteOne() throws DELETION_PROHIBITED', async () => {
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
                    await doc.deleteOne();
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.8: Raw collection deleteOne() without authorized token or test bypass throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.collection.deleteOne({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.9: Raw collection deleteMany() without authorized token or test bypass throws DELETION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.collection.deleteMany({ tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' });
                },
                err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.10: In production environment (NODE_ENV=production), deletion is unconditionally prohibited', async () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                assert.throws(() => {
                    issueDeleteWorkflowToken({ targetId: '123', authorityCode: 'HSVP' });
                }, err => {
                    assert.strictEqual(err.code, 'DELETION_PROHIBITED');
                    return true;
                });

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

        test('1.11: Authorized deleteOne with valid delete workflow token succeeds', async () => {
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
                tenantId: CANONICAL_ORG_ID_STRING
            });

            const res = await AuthoritySourceSettings.deleteOne(
                { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                { [INTERNAL_WORKFLOW_OPTION]: token }
            );
            assert.strictEqual(res.deletedCount, 1);

            const check = await AuthoritySourceSettings.findById(doc._id);
            assert.strictEqual(check, null);
        });

        test('1.12: _testOnlyResetAuthoritySettings safely removes test records in test mode', async () => {
            await AuthoritySourceSettings.create({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'GMADA',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });

            const countBefore = await AuthoritySourceSettings.countDocuments({});
            assert.strictEqual(countBefore, 1);

            await _testOnlyResetAuthoritySettings({ tenantId: CANONICAL_ORG_ID });

            const countAfter = await AuthoritySourceSettings.countDocuments({});
            assert.strictEqual(countAfter, 0);
        });
    });

    // =========================================================================
    // AREA 2: RECURSIVE METADATA SCHEMA & VALUE CONTRACTS (10 Tests)
    // =========================================================================
    describe('Area 2: Recursive Metadata Schema & Value Contracts', () => {

        test('2.1: Rejects unknown metadata keys for authority audit events with FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(() => {
                validateAuthorityMetadata({ unauthorizedNarrativeKey: 'some narrative' }, 'metadata', 'authority_source_approval_reviewed');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Uncontrolled metadata key'));
                return true;
            });
        });

        test('2.2: Rejects invalid primitive type for registered metadata key (string expected, got boolean)', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('authorityCode', true, 'metadata.authorityCode', 'authority_source_approval_reviewed');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('METADATA_TYPE_INVALID'));
                return true;
            });
        });

        test('2.3: Rejects arbitrary free-text narrative under metadata.errorMessage', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('errorMessage', 'Citizen told me their father owned plot 42 in 1980 on a hand-written receipt', 'metadata.errorMessage');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('METADATA_VALUE_INVALID'));
                return true;
            });
        });

        test('2.4: Accepts normalized technical error message under metadata.errorMessage', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('errorMessage', 'PORTAL_TIMEOUT: Gateway request timed out after 10000ms', 'metadata.errorMessage');
            });
        });

        test('2.5: Rejects citizen name narrative under reviewerName (must be ID or valid identifier)', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('reviewerName', 'Mr. Ramesh Chand Sharma citizen from Sector 14 Gurgaon', 'metadata.reviewerName');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('METADATA_VALUE_INVALID'));
                return true;
            });
        });

        test('2.6: Accepts valid ObjectId or username in reviewerName', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('reviewerName', new mongoose.Types.ObjectId().toString(), 'metadata.reviewerName');
                validateAuthorityMetadataValue('reviewerName', 'COMPLIANCE_OFFICER_1', 'metadata.reviewerName');
            });
        });

        test('2.7: Rejects unstructured free-text in metadata.notes (only controlled notes or empty allowed)', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('notes', 'Citizen called our office demanding faster approval for plot 12', 'metadata.notes');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Arbitrary free-text is prohibited'));
                return true;
            });
        });

        test('2.8: Nested searchCriteria rejects unauthorized narrative keys', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('searchCriteria', {
                    plotNo: '42',
                    citizenStory: 'Citizen claims grandmother purchased in 1975'
                }, 'metadata.searchCriteria');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Uncontrolled nested metadata key'));
                return true;
            });
        });

        test('2.9: Nested searchCriteria accepts approved criteria fields', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('searchCriteria', {
                    propertyId: 'PROP-999',
                    sectorNumber: '14',
                    plotNo: '42',
                    authorityCode: 'HSVP'
                }, 'metadata.searchCriteria');
            });
        });

        test('2.10: String arrays validate individual items against controlled pattern', () => {
            assert.throws(() => {
                validateAuthorityMetadataValue('appliedFields', ['validField', 'Uncontrolled field with spaces and narrative!'], 'metadata.appliedFields');
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });

            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('appliedFields', ['permissionStatus', 'reviewStatus', 'isEnabled'], 'metadata.appliedFields');
            });
        });
    });

    // =========================================================================
    // AREA 3: EVENT DESCRIPTION TEMPLATE ANCHORING & NO FALLBACK (6 Tests)
    // =========================================================================
    describe('Area 3: Event Description Template Anchoring & No Fallback', () => {

        test('3.1: Cross-event template borrowing is strictly rejected', () => {
            const doc = {
                eventType: 'authority_run_paused',
                description: 'Verification run POLICY_REJECTED for HSVP: source not activated'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('mismatched templates'));
                return true;
            });
        });

        test('3.2: Unbounded descriptions with citizen narrative appended at end are rejected ($ anchor)', () => {
            const doc = {
                eventType: 'authority_review_submitted',
                description: 'Authority verification review submitted: APPROVED - Citizen Rahul Sharma presented registry deeds'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('3.3: Diagnostic template rejects open suffix containing citizen narrative', () => {
            const doc = {
                eventType: 'authority_run_policy_rejected',
                description: 'Verification run POLICY_REJECTED for HSVP: Citizen refused to provide original identity card'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('3.4: authority_orphan_cleanup_failed accepts only registered technical error codes', () => {
            const validDoc = {
                eventType: 'authority_orphan_cleanup_failed',
                description: 'Failed to purge orphaned snapshot snap_123: ORPHAN_DELETION_UNCONFIRMED'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(validDoc);
            });

            const invalidDoc = {
                eventType: 'authority_orphan_cleanup_failed',
                description: 'Failed to purge orphaned snapshot snap_123: Citizen called asking to keep the old records'
            };
            assert.throws(() => {
                sanitizeAuditDocument(invalidDoc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('3.5: metadata.description enforces exact event template matching identically', () => {
            const doc = {
                eventType: 'authority_settings_updated',
                description: 'Authority source settings updated for HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    description: 'Arbitrary narrative about settings inside metadata description'
                }
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('3.6: Unregistered authority event strictly rejects free-text descriptions', () => {
            const doc = {
                eventType: 'authority_unknown_event_type',
                description: 'Some arbitrary authority event description'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });
    });

    // =========================================================================
    // AREA 4: SAGA COMPENSATION NARROW EXCEPTION & IMMUTABILITY (6 Tests)
    // =========================================================================
    describe('Area 4: Saga Compensation Narrow Exception & Immutability', () => {

        test('4.1: Saga compensation rejects operators other than $set (e.g. $unset)', async () => {
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
                        { $unset: { 'metadata.authorityCode': '' } }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes("Operator '$unset' is strictly prohibited"));
                    return true;
                }
            );
        });

        test('4.2: Saga compensation rejects entire metadata object replacement', async () => {
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
                                metadata: { compensated: true, compensationClaimId: 'claim-123' }
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

        test('4.3: Saga compensation rejects modifying historical metadata fields', async () => {
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

        test('4.4: Saga compensation requires status: compensated', async () => {
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
                                'metadata.compensated': true
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

        test('4.5: Valid saga compensation succeeds with allowed keys', async () => {
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

        test('4.6: Once compensated, record is terminal and strictly immutable', async () => {
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
                        { $set: { 'metadata.compensationClaimId': 'claim_tampered' } }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('has already been compensated and is terminally immutable'));
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // AREA 5: CAPABILITY SCOPING & OWNER CONFIRMATION BINDING (6 Tests)
    // =========================================================================
    describe('Area 5: Capability Scoping & Owner Confirmation Binding', () => {

        test('5.1: issueInternalSeedWorkflowToken throws TEST_ONLY_CAPABILITY_PROHIBITED in production', () => {
            const orig = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                assert.throws(() => {
                    issueInternalSeedWorkflowToken();
                }, err => {
                    assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                    return true;
                });
            } finally {
                process.env.NODE_ENV = orig;
            }
        });

        test('5.2: In production environment, update middleware rejects internal_seed capability', async () => {
            const originalEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'test';
                const seedToken = issueInternalSeedWorkflowToken();

                process.env.NODE_ENV = 'production';
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.updateOne(
                            { tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                            { $set: { approvalReference: 'SEED-REF-PROD' } },
                            { [INTERNAL_WORKFLOW_OPTION]: seedToken }
                        );
                    },
                    err => {
                        assert.ok(err.code === 'TEST_ONLY_CAPABILITY_PROHIBITED' || err.code === 'SECURITY_WORKFLOW_REQUIRED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        test('5.3: issueOwnerConfirmationWorkflowToken validates supported authorityCode', () => {
            assert.throws(() => {
                issueOwnerConfirmationWorkflowToken({ authorityCode: 'UNSUPPORTED_AUTH' });
            }, err => {
                assert.strictEqual(err.code, 'AUTHORITY_CODE_REQUIRED');
                return true;
            });

            const validToken = issueOwnerConfirmationWorkflowToken({
                authorityCode: 'HSVP',
                targetId: new mongoose.Types.ObjectId().toHexString(),
                evidenceVersion: 1
            });
            assert.strictEqual(validToken.workflowName, 'recordOwnerConfirmation');
            assert.strictEqual(validToken.authorityCode, 'HSVP');
        });

        test('5.4: Owner confirmation token bound to HSVP fails with AUTHORITY_CODE_MISMATCH on GMADA', async () => {
            const doc = await AuthoritySourceSettings.create({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'GMADA',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });

            const hsvpToken = issueOwnerConfirmationWorkflowToken({
                authorityCode: 'HSVP',
                targetId: doc._id,
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'GMADA' },
                        { $set: { 'userReportedEvidence.verificationStatus': 'VERIFIED' } },
                        { [INTERNAL_WORKFLOW_OPTION]: hsvpToken }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHORITY_CODE_MISMATCH');
                    return true;
                }
            );
        });

        test('5.5: Owner confirmation rejects modifying protected fields outside userReportedEvidence', async () => {
            const doc = await AuthoritySourceSettings.create({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'UNDER_REVIEW'
            });

            const token = issueOwnerConfirmationWorkflowToken({
                authorityCode: 'HSVP',
                targetId: doc._id,
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: doc._id, tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                        { $set: { reviewStatus: 'APPROVED' } },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'SCOPE_VIOLATION_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.6: Owner confirmation rejects upsert attempts with SECURITY_UPSERT_PROHIBITED', async () => {
            const token = issueOwnerConfirmationWorkflowToken({
                authorityCode: 'HSVP',
                targetId: new mongoose.Types.ObjectId(),
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { tenantId: CANONICAL_ORG_ID, authorityCode: 'HSVP' },
                        { $set: { 'userReportedEvidence.verificationStatus': 'VERIFIED' } },
                        { upsert: true, [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'SECURITY_UPSERT_PROHIBITED');
                    return true;
                }
            );
        });
    });
});
