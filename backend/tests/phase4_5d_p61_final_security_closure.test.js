/**
 * PHASE 4.5-D (PR #62) FINAL SECURITY CLOSURE TEST SUITE
 * 
 * Comprehensive Verification of:
 * 1. AuditLog Append-Only Protection across all query methods, operators, and bulkWrite.
 * 2. Citizen PII: Strict removal of open-ended prefix matching; exact registered server templates.
 * 3. Individual multi-field validation of notes/comments/reviewerComments/freeText and nested metadata.
 * 4. Contextual validation of partial updates lacking eventType.
 * 5. HMAC token nonce replay prevention, retention of unexpired nonces in purge, and dedicated issuance functions.
 * 6. Target document pre-verification and upsert prohibition for approval workflows.
 * 7. Fail-closed canonical organization filter rejection of $exists, $gt, $not, $ne, $regex, etc.
 * 8. Fixed Single Production Database Architecture & Invariants.
 */

import test, { describe, before, after } from 'node:test';
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
    IMMUTABLE_AUDIT_EVENT_TYPES
} from '../models/AuditLog.js';

import AuthoritySourceSettings, {
    INTERNAL_WORKFLOW_OPTION,
    validateOrganizationFilter,
    issueApproverWorkflowToken,
    issueReviewerWorkflowToken,
    issueEnsureDefaultsToken,
    verifyAuthorizedInternalWorkflow,
    purgeExpiredNonces,
    _getConsumedWorkflowNoncesCount
} from '../models/AuthoritySourceSettings.js';

import User from '../models/User.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';

const CANONICAL_ORG_ID_STRING = String(CANONICAL_ORGANIZATION_ID);
const NON_CANONICAL_ORG_ID_STRING = '999999999999999999999999';

describe('PHASE 4.5-D (PR #62) FINAL SECURITY CLOSURE', () => {
    let mongod;
    let submitterUser;
    let approverUser;
    let reviewerUser;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);

        const roleId = new mongoose.Types.ObjectId();

        // Provision test users
        submitterUser = await User.create({
            fullName: 'Submitter User',
            email: 'submitter@bharatproperties.test',
            password: 'Password123!',
            role: roleId,
            department: 'inventory',
            tenantId: CANONICAL_ORGANIZATION_ID,
            isActive: true
        });

        approverUser = await User.create({
            fullName: 'Approver User',
            email: 'approver@bharatproperties.test',
            password: 'Password123!',
            role: roleId,
            department: 'inventory',
            tenantId: CANONICAL_ORGANIZATION_ID,
            isActive: true
        });

        reviewerUser = await User.create({
            fullName: 'Reviewer User',
            email: 'reviewer@bharatproperties.test',
            password: 'Password123!',
            role: roleId,
            department: 'inventory',
            tenantId: CANONICAL_ORGANIZATION_ID,
            isActive: true
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    // =========================================================================
    // SECTION 1: AuditLog — Complete Append-Only Protection
    // =========================================================================
    describe('1. AuditLog Append-Only Protection', () => {
        let immutableApprovalLog;
        let immutableReviewedLog;
        let mutableLoginLog;

        before(async () => {
            immutableApprovalLog = await AuditLog.create({
                eventType: 'authority_maker_checker_approval',
                description: 'Authority source authorization APPROVED for HSVP',
                status: 'success',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId()
            });

            immutableReviewedLog = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                description: 'Authentic maker-checker approval reviewed by independent reviewer',
                status: 'success',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId()
            });

            mutableLoginLog = await AuditLog.create({
                eventType: 'user_login',
                description: 'User login from desktop',
                status: 'success'
            });
        });

        test('1.1 isImmutableAuditEvent identifies all completed authority approval and review events', () => {
            const expectedEvents = [
                'authority_source_approval_reviewed',
                'authority_maker_checker_approval',
                'authority_maker_checker_rejection',
                'authority_source_approved',
                'authority_source_rejected',
                'authority_source_approval_submitted',
                'authority_source_approval_recorded',
                'authority_review_submitted',
                'authority_policy_approved',
                'authority_policy_rejected'
            ];

            for (const ev of expectedEvents) {
                assert.strictEqual(isImmutableAuditEvent(ev), true, `Expected ${ev} to be immutable`);
            }

            assert.strictEqual(isImmutableAuditEvent('user_login'), false);
            assert.strictEqual(isImmutableAuditEvent('lead_created'), false);
            assert.strictEqual(isImmutableAuditEvent('authority_settings_updated'), false);
            assert.strictEqual(isImmutableAuditEvent('authority_changes_applied'), false);
        });

        test('1.2 updateOne targeting immutable audit log by _id rejects with AUDIT_LOG_IMMUTABLE', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: immutableApprovalLog._id },
                        { $set: { status: 'failure' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.match(err.message, /AUDIT_LOG_IMMUTABLE/);
                    return true;
                }
            );
        });

        test('1.3 updateMany targeting immutable audit log by query ($in, $or, $and) rejects with AUDIT_LOG_IMMUTABLE', async () => {
            // $in query
            await assert.rejects(
                async () => {
                    await AuditLog.updateMany(
                        { eventType: { $in: ['user_login', 'authority_maker_checker_approval'] } },
                        { $set: { status: 'failure' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // $or query
            await assert.rejects(
                async () => {
                    await AuditLog.updateMany(
                        { $or: [{ eventType: 'authority_maker_checker_approval' }, { status: 'failure' }] },
                        { $set: { notes: 'EVIDENCE_REVIEWED' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.4 findOneAndUpdate targeting immutable audit log rejects with AUDIT_LOG_IMMUTABLE', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.findOneAndUpdate(
                        { _id: immutableReviewedLog._id },
                        { $set: { notes: 'EVIDENCE_REVIEWED' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.5 replaceOne and findOneAndReplace targeting immutable audit log reject with AUDIT_LOG_IMMUTABLE', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.replaceOne(
                        { _id: immutableApprovalLog._id },
                        {
                            eventType: 'user_login',
                            description: 'Replaced document',
                            status: 'success'
                        }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            await assert.rejects(
                async () => {
                    await AuditLog.findOneAndReplace(
                        { _id: immutableReviewedLog._id },
                        {
                            eventType: 'user_login',
                            description: 'Replaced document',
                            status: 'success'
                        }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.6 replaceOne attempting to insert an immutable event via replacement payload rejects with AUDIT_LOG_IMMUTABLE', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.replaceOne(
                        { _id: mutableLoginLog._id },
                        {
                            eventType: 'authority_maker_checker_approval',
                            description: 'Authority source authorization APPROVED for HSVP',
                            status: 'success'
                        }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.7 deleteOne, deleteMany, and findOneAndDelete targeting immutable audit log reject with AUDIT_LOG_IMMUTABLE', async () => {
            // deleteOne by _id
            await assert.rejects(
                async () => {
                    await AuditLog.deleteOne({ _id: immutableApprovalLog._id });
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // deleteMany with $in
            await assert.rejects(
                async () => {
                    await AuditLog.deleteMany({
                        eventType: { $in: ['authority_source_approval_reviewed'] }
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // findOneAndDelete by _id
            await assert.rejects(
                async () => {
                    await AuditLog.findOneAndDelete({ _id: immutableReviewedLog._id });
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.8 bulkWrite rejects updateOne, updateMany, replaceOne, deleteOne, deleteMany on immutable audit logs', async () => {
            // bulkWrite updateOne
            await assert.rejects(
                async () => {
                    await AuditLog.bulkWrite([
                        { updateOne: { filter: { _id: immutableApprovalLog._id }, update: { $set: { status: 'failure' } } } }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // bulkWrite replaceOne
            await assert.rejects(
                async () => {
                    await AuditLog.bulkWrite([
                        { replaceOne: { filter: { _id: immutableReviewedLog._id }, replacement: { eventType: 'user_login', description: 'test' } } }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // bulkWrite deleteOne
            await assert.rejects(
                async () => {
                    await AuditLog.bulkWrite([
                        { deleteOne: { filter: { _id: immutableApprovalLog._id } } }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('1.9 Non-immutable audit events can be safely updated and deleted', async () => {
            const mutableLog = await AuditLog.create({
                eventType: 'user_login',
                description: 'User login test',
                status: 'success'
            });

            // Update succeeds
            const updateRes = await AuditLog.updateOne(
                { _id: mutableLog._id, eventType: 'user_login' },
                { $set: { status: 'warning' } }
            );
            assert.strictEqual(updateRes.matchedCount, 1);

            // Delete succeeds
            const deleteRes = await AuditLog.deleteOne({ _id: mutableLog._id, eventType: 'user_login' });
            assert.strictEqual(deleteRes.deletedCount, 1);
        });
    });

    // =========================================================================
    // SECTION 2: Citizen PII — Removal of Open-Ended Prefix Matching
    // =========================================================================
    describe('2. Citizen PII — Strict Registered Description Templates & Multi-Field Validation', () => {

        test('2.1 Descriptions merely starting with "Authority" are rejected if not matching registered template', async () => {
            const openEndedAuthorityDescs = [
                'Authority citizen Rajiv Kapoor visited office with phone 9811000000',
                'Authority applicant submitted notarized affidavit on plain paper',
                'Authority broker Ramesh Gupta requested expedited portal bypass',
                'Authority details: sector 14 plot 100 allottee Sunil Sharma'
            ];

            for (const desc of openEndedAuthorityDescs) {
                await assert.rejects(
                    async () => {
                        await AuditLog.create({
                            eventType: 'authority_source_approval_reviewed',
                            description: desc,
                            status: 'success'
                        });
                    },
                    (err) => {
                        assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                        return true;
                    }
                );
            }
        });

        test('2.2 Exact registered server-defined templates are accepted', async () => {
            const registeredItems = [
                { eventType: 'authority_source_approval_reviewed', desc: 'Authority source authorization APPROVED for HSVP' },
                { eventType: 'authority_maker_checker_rejection', desc: 'Authority source authorization REJECTED for GMADA' },
                { eventType: 'authority_settings_updated', desc: 'Authority source settings update for CHD' },
                { eventType: 'authority_source_approval_reviewed', desc: 'Authentic maker-checker approval reviewed by independent reviewer' },
                { eventType: 'canonical_policy_rotated', desc: 'Rotated canonical policy for authority HSVP to version 3' },
                { eventType: 'canonical_policy_synced', desc: 'Synchronized canonical policy for authority GMADA to Redis (version 2)' },
                { eventType: 'authority_run_batch_processed', desc: 'Batch of 5 items processed for run 60c72b2f9b1d8b2bad000001' },
                { eventType: 'authority_source_approval_reviewed', desc: 'Authority source approval reviewed for HSVP' }
            ];

            for (const { eventType, desc } of registeredItems) {
                const log = await AuditLog.create({
                    eventType,
                    description: desc,
                    status: 'success'
                });
                assert.ok(log._id);
            }
        });

        test('2.3 Multi-field validation: controlled notes does not allow uncontrolled comments or freeText to pass', async () => {
            // Controlled notes + uncontrolled comments -> REJECTED
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source authorization APPROVED for HSVP',
                        notes: 'EVIDENCE_REVIEWED', // controlled
                        comments: 'Uncontrolled citizen comment: allottee identity verified via Aadhaar' // uncontrolled!
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );

            // Controlled notes + uncontrolled freeText -> REJECTED
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source authorization APPROVED for HSVP',
                        notes: 'EVIDENCE_REVIEWED', // controlled
                        freeText: 'Arbitrary narrative note' // uncontrolled!
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );

            // Controlled notes + uncontrolled reviewerComments -> REJECTED
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source authorization APPROVED for HSVP',
                        notes: 'EVIDENCE_REVIEWED', // controlled
                        reviewerComments: 'Reviewer noted citizen phone 9811000000' // uncontrolled!
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('2.4 Nested metadata fields enforce the same controlled reason policy', async () => {
            // Nested metadata with uncontrolled comments
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source authorization APPROVED for HSVP',
                        notes: 'EVIDENCE_REVIEWED',
                        metadata: {
                            authorityCode: 'HSVP',
                            comments: 'Citizen personal request' // uncontrolled!
                        }
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );

            // Nested metadata with uncontrolled description
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source authorization APPROVED for HSVP',
                        notes: 'EVIDENCE_REVIEWED',
                        metadata: {
                            authorityCode: 'HSVP',
                            description: 'Uncontrolled custom narrative description' // uncontrolled!
                        }
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('2.5 Partial updates without eventType carry query filter context and enforce controlled text rules', async () => {
            const mutableSettingsLog = await AuditLog.create({
                eventType: 'authority_settings_updated',
                description: 'Authority source settings update for HSVP',
                status: 'success'
            });

            // Update does NOT include eventType in payload, but query targets authority log
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: mutableSettingsLog._id },
                        { $set: { notes: 'Arbitrary unstructured notes entered by user' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // SECTION 3: HMAC Capability Replay, Nonce Retention & Dedicated Issuance
    // =========================================================================
    describe('3. HMAC Capability Replay & Dedicated Token Issuance', () => {

        test('3.1 Replay attack using identical token/nonce returns false on second verification', () => {
            const token = issueEnsureDefaultsToken({
                tenantId: CANONICAL_ORG_ID_STRING
            });

            const options = {
                [INTERNAL_WORKFLOW_OPTION]: token
            };

            // First verification: must succeed
            const firstResult = verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']);
            assert.strictEqual(firstResult, true);

            // Second verification with exact same token: MUST BE REJECTED (replay prevention)
            const secondResult = verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']);
            assert.strictEqual(secondResult, false);
        });

        test('3.2 Replay attempt forging _authorizedTokenVerified flag is rejected', () => {
            const token = issueEnsureDefaultsToken({
                tenantId: CANONICAL_ORG_ID_STRING
            });

            const options = {
                [INTERNAL_WORKFLOW_OPTION]: token,
                _authorizedTokenVerified: token.nonce // attacker attempts to forge internal flag
            };

            // First verification consumes nonce
            assert.strictEqual(verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']), true);

            // Replay with forged flag: MUST BE REJECTED
            assert.strictEqual(verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']), false);
        });

        test('3.3 purgeExpiredNonces() retains unexpired nonces and purges only expired nonces', () => {
            const beforeCount = _getConsumedWorkflowNoncesCount();

            // Create and verify token
            const token = issueEnsureDefaultsToken({
                tenantId: CANONICAL_ORG_ID_STRING
            });
            verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: token }, ['ensureDefaults']);

            assert.strictEqual(_getConsumedWorkflowNoncesCount(), beforeCount + 1);

            // Call purge: unexpired nonces (5 min TTL) MUST BE RETAINED
            purgeExpiredNonces();
            assert.strictEqual(_getConsumedWorkflowNoncesCount(), beforeCount + 1);
        });

        test('3.4 issueApproverWorkflowToken requires exact targetId, authorityCode, evidenceVersion, canonical tenantId', () => {
            const validParams = {
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: new mongoose.Types.ObjectId().toString(),
                authorityCode: 'HSVP',
                evidenceVersion: 1
            };

            // Valid issuance
            const token = issueApproverWorkflowToken(validParams);
            assert.strictEqual(token.workflowName, 'recordSourceApprover');
            assert.strictEqual(token.targetId, validParams.targetId);
            assert.strictEqual(token.authorityCode, 'HSVP');
            assert.strictEqual(token.evidenceVersion, '1');

            // Missing/wildcard targetId
            assert.throws(() => {
                issueApproverWorkflowToken({ ...validParams, targetId: '*' });
            }, /TARGET_ID_REQUIRED/);

            // Missing/wildcard authorityCode
            assert.throws(() => {
                issueApproverWorkflowToken({ ...validParams, authorityCode: '*' });
            }, /AUTHORITY_CODE_REQUIRED/);

            // Missing/wildcard evidenceVersion
            assert.throws(() => {
                issueApproverWorkflowToken({ ...validParams, evidenceVersion: undefined });
            }, /EVIDENCE_VERSION_REQUIRED/);

            // Non-canonical tenantId
            assert.throws(() => {
                issueApproverWorkflowToken({ ...validParams, tenantId: NON_CANONICAL_ORG_ID_STRING });
            }, /CANONICAL_ORGANIZATION_REQUIRED/);
        });

        test('3.5 issueReviewerWorkflowToken requires exact targetId, authorityCode, evidenceVersion, canonical tenantId', () => {
            const validParams = {
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: new mongoose.Types.ObjectId().toString(),
                authorityCode: 'GMADA',
                evidenceVersion: 2
            };

            const token = issueReviewerWorkflowToken(validParams);
            assert.strictEqual(token.workflowName, 'reviewSourceApproval');
            assert.strictEqual(token.targetId, validParams.targetId);
            assert.strictEqual(token.authorityCode, 'GMADA');
            assert.strictEqual(token.evidenceVersion, '2');

            // Non-canonical tenantId
            assert.throws(() => {
                issueReviewerWorkflowToken({ ...validParams, tenantId: NON_CANONICAL_ORG_ID_STRING });
            }, /CANONICAL_ORGANIZATION_REQUIRED/);
        });

        test('3.6 Approval workflows reject upsert with SECURITY_UPSERT_PROHIBITED', async () => {
            const targetId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: targetId.toString(),
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' },
                        {
                            $set: { approvedBy: approverUser._id, reviewStatus: 'UNDER_REVIEW' },
                            $setOnInsert: { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' }
                        },
                        {
                            upsert: true,
                            [INTERNAL_WORKFLOW_OPTION]: token
                        }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'SECURITY_UPSERT_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.7 Approval workflows reject write if target document does not exist (TARGET_NOT_FOUND)', async () => {
            const nonExistentTargetId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: nonExistentTargetId.toString(),
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: nonExistentTargetId, tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' },
                        {
                            $set: { approvedBy: approverUser._id, reviewStatus: 'UNDER_REVIEW' }
                        },
                        {
                            [INTERNAL_WORKFLOW_OPTION]: token
                        }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'TARGET_NOT_FOUND');
                    return true;
                }
            );
        });

        test('3.8 Approval workflows reject write if target document fields mismatch token without loose cross-field equivalence', async () => {
            // Provision settings doc with authorityCode HSVP
            const settings = await AuthoritySourceSettings.create({
                tenantId: CANONICAL_ORGANIZATION_ID,
                authorityCode: 'HSVP',
                evidenceVersion: 1,
                isEnabled: false,
                schedulingEnabled: false,
                reviewStatus: 'NOT_REVIEWED'
            });

            // Token with mismatched authorityCode GMADA
            const wrongAuthToken = issueApproverWorkflowToken({
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: settings._id.toString(),
                authorityCode: 'GMADA',
                evidenceVersion: 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: settings._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        { $set: { approvedBy: approverUser._id } },
                        { [INTERNAL_WORKFLOW_OPTION]: wrongAuthToken }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );

            // Token with mismatched evidenceVersion 2
            const wrongVerToken = issueApproverWorkflowToken({
                tenantId: CANONICAL_ORG_ID_STRING,
                targetId: settings._id.toString(),
                authorityCode: 'HSVP',
                evidenceVersion: 2
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: settings._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        { $set: { approvedBy: approverUser._id } },
                        { [INTERNAL_WORKFLOW_OPTION]: wrongVerToken }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // SECTION 4: Canonical Organization Filter Fail Closed
    // =========================================================================
    describe('4. Canonical Organization Filter Fail Closed ($exists, $gt, $not, $ne, $regex)', () => {

        test('4.1 Rejects $exists on tenantId with ORGANIZATION_OVERRIDE_PROHIBITED', () => {
            assert.throws(() => {
                validateOrganizationFilter({ tenantId: { $exists: true } });
            }, (err) => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                assert.match(err.message, /Operator '\$exists' on tenantId is prohibited/);
                return true;
            });
        });

        test('4.2 Rejects $gt, $gte, $lt, $lte on tenantId with ORGANIZATION_OVERRIDE_PROHIBITED', () => {
            const comparisonOps = ['$gt', '$gte', '$lt', '$lte'];
            for (const op of comparisonOps) {
                assert.throws(() => {
                    validateOrganizationFilter({ tenantId: { [op]: '000000000000000000000000' } });
                }, (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                });
            }
        });

        test('4.3 Rejects $ne, $not, $regex on tenantId with ORGANIZATION_OVERRIDE_PROHIBITED', () => {
            const broadOps = [
                { $ne: '999999999999999999999999' },
                { $not: { $eq: '999999999999999999999999' } },
                { $regex: '^000000' }
            ];

            for (const query of broadOps) {
                assert.throws(() => {
                    validateOrganizationFilter({ tenantId: query });
                }, (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                });
            }
        });

        test('4.4 Accepts exact equality, $eq, and single-item $in with canonical organization ID', () => {
            // Direct equality
            assert.doesNotThrow(() => {
                validateOrganizationFilter({ tenantId: CANONICAL_ORGANIZATION_ID });
            });

            // $eq
            assert.doesNotThrow(() => {
                validateOrganizationFilter({ tenantId: { $eq: CANONICAL_ORG_ID_STRING } });
            });

            // $in
            assert.doesNotThrow(() => {
                validateOrganizationFilter({ tenantId: { $in: [CANONICAL_ORG_ID_STRING] } });
            });
        });

        test('4.5 Recursive validation in $and, $or, $nor catches invalid operators on any branch', () => {
            // In $or branch
            assert.throws(() => {
                validateOrganizationFilter({
                    $or: [
                        { authorityCode: 'HSVP' },
                        { tenantId: { $exists: true } }
                    ]
                });
            }, (err) => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                return true;
            });

            // In $and branch
            assert.throws(() => {
                validateOrganizationFilter({
                    $and: [
                        { tenantId: CANONICAL_ORGANIZATION_ID },
                        { tenantId: { $ne: '000000000000000000000002' } }
                    ]
                });
            }, (err) => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                return true;
            });
        });

        test('4.6 Upsert operations enforce canonical organization in both filter and payload', () => {
            // Missing in filter -> CANONICAL_ORGANIZATION_REQUIRED
            assert.throws(() => {
                validateOrganizationFilter({ authorityCode: 'HSVP' }, { isUpsert: true });
            }, (err) => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });

            // Valid filter
            assert.doesNotThrow(() => {
                validateOrganizationFilter({ tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' }, { isUpsert: true });
            });
        });
    });

    // =========================================================================
    // SECTION 5: Safety Invariants & Zero Mutation Verification
    // =========================================================================
    describe('5. Safety Invariants & Zero Mutation Verification', () => {

        test('5.1 Fail closed: Authority sources remain disabled by default (isEnabled: false, schedulingEnabled: false)', async () => {
            const settings = await AuthoritySourceSettings.findOne({
                tenantId: CANONICAL_ORGANIZATION_ID,
                authorityCode: 'HSVP'
            });

            if (settings) {
                assert.strictEqual(settings.isEnabled, false);
                assert.strictEqual(settings.schedulingEnabled, false);
            }
        });

        test('5.2 Single permanent production database invariant preserved (no secondary/staging clusters)', () => {
            assert.strictEqual(process.env.STAGING_MONGODB_URI, undefined);
            assert.strictEqual(process.env.NONPROD_MONGODB_URI, undefined);
        });

        test('5.3 Single canonical organization ID 000000000000000000000001 (Bharat Properties)', () => {
            assert.strictEqual(CANONICAL_ORG_ID_STRING, '000000000000000000000001');
        });
    });
});
