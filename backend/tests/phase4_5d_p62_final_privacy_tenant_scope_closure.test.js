/**
 * PHASE 4.5-D (PR #63) FINAL PRIVACY, CANONICAL TENANT SCOPE & CAPABILITY ISSUANCE CLOSURE
 *
 * Dedicated Test Suite covering 4 Matrices (48 tests):
 * Area 1: Recursive Citizen PII & Controlled Metadata Allowlist (12 tests)
 * Area 2: Exact Registered Description Templates & Multi-Document Audit Context (12 tests)
 * Area 3: AuthoritySourceSettings Write Boundary & Canonical Organization Scope (12 tests)
 * Area 4: Private Capability Issuance & Audit Immutability Policy (12 tests)
 */

process.env.NODE_ENV = 'test';

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
    redactSensitive,
    IMMUTABLE_AUDIT_EVENT_TYPES,
    CONTROLLED_AUTHORITY_METADATA_KEYS,
    validateAuthorityMetadata,
    EVENT_DESCRIPTION_TEMPLATES_REGISTRY,
    resolveTargetAuditContext,
    normalizeDottedObject,
    validateControlledTextFields
} from '../models/AuditLog.js';

import AuthoritySourceSettings, {
    INTERNAL_WORKFLOW_OPTION,
    validateOrganizationFilter,
    isConclusivelyScopedToCanonicalTenant,
    issueApproverWorkflowToken,
    issueReviewerWorkflowToken,
    issueEnsureDefaultsToken,
    issueOwnerConfirmationWorkflowToken,
    issueInternalSeedWorkflowToken,
    verifyAuthorizedInternalWorkflow,
    purgeExpiredNonces,
    _getConsumedWorkflowNoncesCount
} from '../models/AuthoritySourceSettings.js';

import User from '../models/User.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';
import { PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';

const CANONICAL_ORG_ID_STRING = String(CANONICAL_ORGANIZATION_ID);
const NON_CANONICAL_ORG_ID_STRING = '999999999999999999999999';

describe('PHASE 4.5-D (PR #63) FINAL PRIVACY, CANONICAL TENANT SCOPE & CAPABILITY ISSUANCE CLOSURE', () => {
    let mongod;
    let submitterUser;
    let approverUser;
    let reviewerUser;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);

        const roleId = new mongoose.Types.ObjectId();

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
    // AREA 1: RECURSIVE CITIZEN PII & CONTROLLED METADATA ALLOWLIST (12 Tests)
    // =========================================================================
    describe('Area 1: Recursive Citizen PII & Controlled Metadata Allowlist', () => {
        test('1.1: redactSensitive masks Indian PAN in deeply nested objects', () => {
            const nested = {
                level1: {
                    level2: {
                        citizenPan: 'ABCDE1234F',
                        notes: 'EVIDENCE_REVIEWED'
                    }
                }
            };
            const sanitized = redactSensitive(nested);
            assert.strictEqual(sanitized.level1.level2.citizenPan, '[PII_MINIMIZED]');
        });

        test('1.2: redactSensitive masks Aadhaar in deeply nested arrays', () => {
            const payload = {
                items: [
                    { subItems: [{ citizenAadhaar: '2345 6789 0123' }] }
                ]
            };
            const sanitized = redactSensitive(payload);
            assert.strictEqual(sanitized.items[0].subItems[0].citizenAadhaar, '[PII_MINIMIZED]');
        });

        test('1.3: redactSensitive minimizes residential addresses in metadata', () => {
            const payload = {
                metadata: {
                    address: 'Flat 402, Sector 14, Urban Estate, Gurugram'
                }
            };
            const sanitized = redactSensitive(payload);
            assert.strictEqual(sanitized.metadata.address, '[PII_MINIMIZED]');
        });

        test('1.4: redactSensitive redacts credential and secret keys', () => {
            const payload = {
                metadata: {
                    password: 'secret_password_123',
                    credentialToken: 'oauth_bearer_xyz',
                    authorization_proof: 'signed_jwt_token'
                }
            };
            const sanitized = redactSensitive(payload);
            assert.strictEqual(sanitized.metadata.password, '[REDACTED]');
            assert.strictEqual(sanitized.metadata.credentialToken, '[REDACTED]');
            assert.strictEqual(sanitized.metadata.authorization_proof, '[REDACTED]');
        });

        test('1.5: validateAuthorityMetadata rejects unknown arbitrary narrative keys', () => {
            assert.throws(() => {
                validateAuthorityMetadata({ customCitizenStory: 'Citizen visited branch office today' });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Uncontrolled metadata key'));
                return true;
            });
        });

        test('1.6: validateAuthorityMetadata accepts registered controlled metadata keys', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadata({
                    authorityCode: 'HSVP',
                    evidenceVersion: 1,
                    reasonCode: 'EVIDENCE_REVIEWED',
                    identityVerified: true,
                    decision: 'APPROVED',
                    tenantId: CANONICAL_ORG_ID_STRING
                });
            });
        });

        test('1.7: validateControlledTextFields detects and rejects free-text in notes', () => {
            assert.throws(() => {
                validateControlledTextFields({ notes: 'Custom free-form citizen discussion notes' });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('Use controlled reason codes'));
                return true;
            });
        });

        test('1.8: validateControlledTextFields detects and rejects free-text in nested metadata.comments', () => {
            assert.throws(() => {
                validateControlledTextFields({ metadata: { comments: 'Arbitrary internal employee note' } });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('metadata.comments'));
                return true;
            });
        });

        test('1.9: validateControlledTextFields detects and rejects free-text in metadata.reviewNotes', () => {
            assert.throws(() => {
                validateControlledTextFields({ metadata: { reviewNotes: 'Citizen called asking for status' } });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('metadata.reviewNotes'));
                return true;
            });
        });

        test('1.10: sanitizeAuditUpdate rejects dotted path updates introducing arbitrary free-text', () => {
            const update = {
                $set: {
                    'metadata.notes': 'Unapproved arbitrary narrative in dotted path'
                }
            };
            assert.throws(() => {
                sanitizeAuditUpdate(update, { eventType: 'authority_settings_updated' });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('1.11: sanitizeAuditUpdate inspects array operator $push and rejects uncontrolled narrative', () => {
            const update = {
                $push: {
                    'metadata.comments': 'Pushed arbitrary employee review comment'
                }
            };
            assert.throws(() => {
                sanitizeAuditUpdate(update, { eventType: 'authority_settings_updated' });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('1.12: sanitizeAuditUpdate inspects $addToSet with $each and rejects uncontrolled narrative', () => {
            const update = {
                $addToSet: {
                    'metadata.comments': {
                        $each: ['Valid looking note', 'Illegal citizen private info: PAN ABCDE1234F']
                    }
                }
            };
            assert.throws(() => {
                sanitizeAuditUpdate(update, { eventType: 'authority_settings_updated' });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });
    });

    // =========================================================================
    // AREA 2: EXACT DESCRIPTION TEMPLATES & AUDIT CONTEXT (12 Tests)
    // =========================================================================
    describe('Area 2: Exact Registered Description Templates & Audit Context', () => {
        test('2.1: EVENT_DESCRIPTION_TEMPLATES_REGISTRY enforces exact patterns for authority_source_approval_reviewed', () => {
            const templates = EVENT_DESCRIPTION_TEMPLATES_REGISTRY.authority_source_approval_reviewed;
            assert.ok(Array.isArray(templates));
            assert.ok(templates.length >= 3);
        });

        test('2.2: Rejects description when eventType is authority_source_approval_reviewed but description is for submission', () => {
            const doc = {
                eventType: 'authority_source_approval_reviewed',
                description: 'Authority source authorization submitted for HSVP (v1)'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                assert.ok(err.message.includes('mismatched templates'));
                return true;
            });
        });

        test('2.3: Rejects unbounded descriptions containing arbitrary narrative for authority events', () => {
            const doc = {
                eventType: 'authority_source_approval_reviewed',
                description: 'Authority source approval reviewed for HSVP with custom offline approval notes'
            };
            assert.throws(() => {
                sanitizeAuditDocument(doc);
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.4: Accepts valid exact server-generated description matching authority_source_approval_reviewed', () => {
            const doc = {
                eventType: 'authority_source_approval_reviewed',
                description: 'Authority source authorization APPROVED for HSVP'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('2.5: Accepts valid exact description matching authority_source_approval_submitted', () => {
            const doc = {
                eventType: 'authority_source_approval_submitted',
                description: 'Authority source authorization submitted for GMADA (v2)'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('2.6: Accepts valid exact description matching authority_source_approval_recorded', () => {
            const doc = {
                eventType: 'authority_source_approval_recorded',
                description: 'Authority source authorization approval recorded for CHD (v1)'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('2.7: Accepts valid exact description matching authority_review_submitted', () => {
            const doc = {
                eventType: 'authority_review_submitted',
                description: 'Authority review submitted for run_12345'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('2.8: Accepts valid exact description matching authority_settings_updated', () => {
            const doc = {
                eventType: 'authority_settings_updated',
                description: 'Authority source settings updated for HSVP'
            };
            assert.doesNotThrow(() => {
                sanitizeAuditDocument(doc);
            });
        });

        test('2.9: Multi-document update targeting authority and non-authority events throws AMBIGUOUS_AUDIT_CONTEXT', async () => {
            // Create two logs: one authority, one non-authority
            const targetId = new mongoose.Types.ObjectId();
            await AuditLog.create({
                eventType: 'authority_settings_updated',
                description: 'Authority source settings updated for HSVP',
                targetType: 'authority_settings',
                targetId
            });
            await AuditLog.create({
                eventType: 'lead_updated',
                description: 'Lead status updated',
                targetType: 'lead',
                targetId
            });

            await assert.rejects(async () => {
                await AuditLog.updateMany(
                    { targetId },
                    { $set: { department: 'operations' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'AMBIGUOUS_AUDIT_CONTEXT');
                assert.ok(err.message.includes('touches mixed'));
                return true;
            });
        });

        test('2.10: Multi-document update exclusively targeting non-authority events succeeds', async () => {
            const targetId = new mongoose.Types.ObjectId();
            await AuditLog.create({
                eventType: 'lead_updated',
                description: 'Lead 1 status updated',
                targetType: 'lead',
                targetId
            });
            await AuditLog.create({
                eventType: 'lead_created',
                description: 'Lead 2 created',
                targetType: 'lead',
                targetId
            });

            const res = await AuditLog.updateMany(
                { targetId },
                { $set: { department: 'sales' } }
            );
            assert.strictEqual(res.acknowledged, true);
        });

        test('2.11: Multi-document update exclusively targeting authority events enforces controlled templates', async () => {
            const targetId = new mongoose.Types.ObjectId();
            await AuditLog.create({
                eventType: 'authority_settings_updated',
                description: 'Authority source settings updated for HSVP',
                targetType: 'authority_settings',
                targetId
            });

            // Update with uncontrolled description should fail
            await assert.rejects(async () => {
                await AuditLog.updateMany(
                    { targetId },
                    { $set: { description: 'Arbitrary uncontrolled audit description update' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('2.12: isControlledAuthorityDescription validates strictly against registered patterns', () => {
            assert.strictEqual(isControlledAuthorityDescription('Arbitrary text note', 'authority_source_approval_reviewed'), false);
            assert.strictEqual(isControlledAuthorityDescription('Authority source authorization APPROVED for HSVP', 'authority_source_approval_reviewed'), true);
            assert.strictEqual(isControlledAuthorityDescription('Maker-checker audit event', 'authority_source_approval_reviewed'), true);
        });
    });

    // =========================================================================
    // AREA 3: WRITE BOUNDARY & CANONICAL ORGANIZATION SCOPE (12 Tests)
    // =========================================================================
    describe('Area 3: Write Boundary & Canonical Organization Scope', () => {
        test('3.1: validateOrganizationFilter throws CANONICAL_ORGANIZATION_REQUIRED when tenantId omitted on write', () => {
            assert.throws(() => {
                validateOrganizationFilter({ authorityCode: 'HSVP' }, { isWrite: true });
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.2: validateOrganizationFilter throws ORGANIZATION_OVERRIDE_PROHIBITED when tenantId is non-canonical', () => {
            assert.throws(() => {
                validateOrganizationFilter({ tenantId: NON_CANONICAL_ORG_ID_STRING }, { isWrite: true });
            }, err => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                return true;
            });
        });

        test('3.3: Non-upsert updateOne without tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.updateOne(
                    { authorityCode: 'HSVP' },
                    { $set: { notes: 'EVIDENCE_REVIEWED' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.4: Non-upsert updateMany without tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.updateMany(
                    { authorityCode: 'HSVP' },
                    { $set: { notes: 'EVIDENCE_REVIEWED' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.5: findOneAndUpdate without tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.findOneAndUpdate(
                    { authorityCode: 'HSVP' },
                    { $set: { notes: 'EVIDENCE_REVIEWED' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.6: replaceOne without tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.replaceOne(
                    { authorityCode: 'HSVP' },
                    { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'HSVP' }
                );
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.7: findOneAndReplace without tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.findOneAndReplace(
                    { authorityCode: 'HSVP' },
                    { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'HSVP' }
                );
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.8: bulkWrite with updateOne missing tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.bulkWrite([
                    {
                        updateOne: {
                            filter: { authorityCode: 'HSVP' },
                            update: { $set: { notes: 'EVIDENCE_REVIEWED' } }
                        }
                    }
                ]);
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.9: bulkWrite with updateMany missing tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(async () => {
                await AuthoritySourceSettings.bulkWrite([
                    {
                        updateMany: {
                            filter: { authorityCode: 'HSVP' },
                            update: { $set: { notes: 'EVIDENCE_REVIEWED' } }
                        }
                    }
                ]);
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });
        });

        test('3.10: Logical $or query requires EVERY branch to contain canonical tenantId', () => {
            // One branch missing tenantId
            assert.throws(() => {
                validateOrganizationFilter({
                    $or: [
                        { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'HSVP' },
                        { authorityCode: 'GMADA' } // Missing!
                    ]
                }, { isWrite: true });
            }, err => {
                assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                return true;
            });

            // All branches contain canonical tenantId -> succeeds
            assert.doesNotThrow(() => {
                validateOrganizationFilter({
                    $or: [
                        { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'HSVP' },
                        { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'GMADA' }
                    ]
                }, { isWrite: true });
            });
        });

        test('3.11: Logical $or query rejects non-canonical tenantId in any branch', () => {
            assert.throws(() => {
                validateOrganizationFilter({
                    $or: [
                        { tenantId: CANONICAL_ORG_ID_STRING, authorityCode: 'HSVP' },
                        { tenantId: NON_CANONICAL_ORG_ID_STRING, authorityCode: 'GMADA' }
                    ]
                }, { isWrite: true });
            }, err => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                return true;
            });
        });

        test('3.12: Logical $nor query on write operations is strictly prohibited', () => {
            assert.throws(() => {
                validateOrganizationFilter({
                    $nor: [
                        { authorityCode: 'HSVP' }
                    ]
                }, { isWrite: true });
            }, err => {
                assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                assert.ok(err.message.includes('$nor'));
                return true;
            });
        });
    });

    // =========================================================================
    // AREA 4: PRIVATE CAPABILITY ISSUANCE & AUDIT IMMUTABILITY POLICY (12 Tests)
    // =========================================================================
    describe('Area 4: Private Capability Issuance & Audit Immutability Policy', () => {
        test('4.1: AuthoritySourceSettings does NOT export generic createAuthorizedInternalWorkflowToken', async () => {
            const mod = await import('../models/AuthoritySourceSettings.js');
            assert.strictEqual(mod.createAuthorizedInternalWorkflowToken, undefined);
        });

        test('4.2: issueApproverWorkflowToken issues valid token scoped to target, authorityCode, evidenceVersion', () => {
            const targetId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                targetId,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            assert.strictEqual(token.workflowName, 'recordSourceApprover');
            assert.strictEqual(token.authorityCode, 'HSVP');
            assert.strictEqual(token.evidenceVersion, '1');
            assert.strictEqual(token.tenantId, CANONICAL_ORG_ID_STRING);
            assert.ok(token.nonce);
            assert.ok(token.hmac);

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 1, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(valid, true);
        });

        test('4.3: issueReviewerWorkflowToken issues valid token scoped to target, authorityCode, evidenceVersion', () => {
            const targetId = new mongoose.Types.ObjectId();
            const token = issueReviewerWorkflowToken({
                targetId,
                authorityCode: 'GMADA',
                evidenceVersion: 2
            });
            assert.strictEqual(token.workflowName, 'reviewSourceApproval');
            assert.strictEqual(token.authorityCode, 'GMADA');
            assert.strictEqual(token.evidenceVersion, '2');

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['reviewSourceApproval'],
                { targetId, authorityCode: 'GMADA', evidenceVersion: 2, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(valid, true);
        });

        test('4.4: issueEnsureDefaultsToken issues valid token for ensureDefaults', () => {
            const token = issueEnsureDefaultsToken();
            assert.strictEqual(token.workflowName, 'ensureDefaults');
            assert.strictEqual(token.tenantId, CANONICAL_ORG_ID_STRING);

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['ensureDefaults'],
                { tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(valid, true);
        });

        test('4.5: issueOwnerConfirmationWorkflowToken issues valid token for owner confirmation', () => {
            const sampleTargetId = new mongoose.Types.ObjectId().toHexString();
            const token = issueOwnerConfirmationWorkflowToken({
                authorityCode: 'CHD',
                targetId: sampleTargetId,
                evidenceVersion: 1
            });
            assert.strictEqual(token.workflowName, 'recordOwnerConfirmation');
            assert.strictEqual(token.tenantId, CANONICAL_ORG_ID_STRING);

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordOwnerConfirmation'],
                { authorityCode: 'CHD', tenantId: CANONICAL_ORG_ID_STRING, targetId: sampleTargetId, evidenceVersion: 1 }
            );
            assert.strictEqual(valid, true);
        });

        test('4.6: issueInternalSeedWorkflowToken issues valid token for internal seed', () => {
            const token = issueInternalSeedWorkflowToken();
            assert.strictEqual(token.workflowName, 'internal_seed');
            assert.strictEqual(token.tenantId, CANONICAL_ORG_ID_STRING);

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['internal_seed'],
                { tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(valid, true);
        });

        test('4.7: Capability tokens enforce single-use nonce replay prevention', () => {
            const targetId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                targetId,
                authorityCode: 'HSVP',
                evidenceVersion: 3
            });

            // First verification succeeds and consumes nonce
            const firstTry = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 3, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(firstTry, true);

            // Second verification with identical token MUST fail
            const secondTry = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 3, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(secondTry, false);
        });

        test('4.8: Capability token with tampered HMAC fails verification', () => {
            const targetId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                targetId,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            token.hmac = 'tampered_invalid_hmac_signature';

            const valid = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 1, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(valid, false);
        });

        test('4.9: Capability token with mismatched targetId or evidenceVersion fails verification', () => {
            const targetId = new mongoose.Types.ObjectId();
            const differentId = new mongoose.Types.ObjectId();
            const token = issueApproverWorkflowToken({
                targetId,
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });

            // Wrong targetId
            const wrongTarget = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId: differentId, authorityCode: 'HSVP', evidenceVersion: 1, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(wrongTarget, false);

            // Wrong evidenceVersion
            const wrongVersion = verifyAuthorizedInternalWorkflow(
                { [INTERNAL_WORKFLOW_OPTION]: token },
                ['recordSourceApprover'],
                { targetId, authorityCode: 'HSVP', evidenceVersion: 2, tenantId: CANONICAL_ORG_ID_STRING }
            );
            assert.strictEqual(wrongVersion, false);
        });

        test('4.10: Completed authority audit events are strictly immutable on update', async () => {
            const log = await AuditLog.create({
                eventType: 'authority_source_approval_reviewed',
                description: 'Authority source authorization APPROVED for HSVP',
                status: 'success',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId()
            });

            await assert.rejects(async () => {
                await AuditLog.updateOne(
                    { _id: log._id },
                    { $set: { status: 'failed' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                return true;
            });
        });

        test('4.11: Saga compensation exception on authority_changes_applied allows status: compensated only', async () => {
            const log = await AuditLog.create({
                eventType: 'authority_changes_applied',
                description: 'Authority changes applied for property prop_123',
                status: 'success',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId()
            });

            // Attempting to update a non-status field fails
            await assert.rejects(async () => {
                await AuditLog.updateOne(
                    { _id: log._id },
                    { $set: { description: 'Updated description' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                return true;
            });

            // Transitioning status to compensated succeeds
            const updateRes = await AuditLog.updateOne(
                { _id: log._id },
                {
                    $set: {
                        status: 'compensated',
                        'metadata.compensated': true,
                        'metadata.compensationClaimId': 'claim_recovery_101',
                        'metadata.compensatedAt': new Date()
                    }
                }
            );
            assert.strictEqual(updateRes.acknowledged, true);

            const reloaded = await AuditLog.findById(log._id);
            assert.strictEqual(reloaded.status, 'compensated');
        });

        test('4.12: Saga compensation is terminal: compensated audit events cannot be modified further', async () => {
            const log = await AuditLog.create({
                eventType: 'authority_changes_applied',
                description: 'Authority changes applied for property prop_123',
                status: 'compensated',
                targetType: 'authority_settings',
                targetId: new mongoose.Types.ObjectId()
            });

            // Cannot re-update once compensated
            await assert.rejects(async () => {
                await AuditLog.updateOne(
                    { _id: log._id },
                    { $set: { status: 'compensated' } }
                );
            }, err => {
                assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                return true;
            });
        });
    });

    describe('Area 5: Authority Portal Egress Audit Events & Controlled Metadata Verification', () => {
        test('5.1: PortalAuditSink writes all 7 portal audit event types with standard canonical descriptions', async () => {
            const sink = new PortalAuditSink(AuditLog, { testMode: false });
            const portalEvents = [
                { eventType: 'AUTHORITY_PORTAL_SOURCE_PAUSED', authorityCode: 'HSVP', metadata: { reason: 'PAUSED' } },
                { eventType: 'AUTHORITY_PORTAL_SEARCH_REJECTED', authorityCode: 'HSVP', metadata: { reason: 'REJECTED', code: 'AUTHORITY_PORTAL_APPROVAL_BLOCKED' } },
                { eventType: 'AUTHORITY_PORTAL_SEARCH_REQUESTED', authorityCode: 'HSVP', metadata: { authorityCode: 'HSVP', host: 'hsvphry.org.in', searchKey: 'k1', recordCount: 0 } },
                { eventType: 'AUTHORITY_PORTAL_TRANSPORT_FAILED', authorityCode: 'HSVP', metadata: { authorityCode: 'HSVP', host: 'hsvphry.org.in', durationMs: 120, error: 'TIMEOUT' } },
                { eventType: 'AUTHORITY_PORTAL_RESPONSE_REJECTED', authorityCode: 'HSVP', metadata: { authorityCode: 'HSVP', host: 'hsvphry.org.in', durationMs: 150, error: 'BLOCKED' } },
                { eventType: 'AUTHORITY_PORTAL_PARSE_FAILED', authorityCode: 'HSVP', metadata: { authorityCode: 'HSVP', host: 'hsvphry.org.in', durationMs: 180, error: 'PARSE_ERROR' } },
                { eventType: 'AUTHORITY_PORTAL_SEARCH_COMPLETED', authorityCode: 'HSVP', metadata: { authorityCode: 'HSVP', host: 'hsvphry.org.in', recordCount: 1, contentHash: 'hash', durationMs: 200, wasSanitized: false, changedKeys: [] } }
            ];

            for (const item of portalEvents) {
                await sink.write(item);
                const rawEventType = item.eventType.toLowerCase();
                const eventType = rawEventType.startsWith('authority_') ? rawEventType : `authority_${rawEventType}`;
                const persisted = await AuditLog.findOne({ eventType }).sort({ _id: -1 });
                assert.ok(persisted, `Audit record must exist for ${eventType}`);
                assert.strictEqual(persisted.eventType, eventType);
                assert.ok(persisted.description.includes('HSVP'));
            }
        });

        test('5.2: PortalAuditSink persists controlled metadata keys cleanly', async () => {
            const sink = new PortalAuditSink(AuditLog, { testMode: false });
            await sink.write({
                eventType: 'AUTHORITY_PORTAL_SEARCH_COMPLETED',
                authorityCode: 'GMADA',
                searchKey: 'GMADA:searchKey:123',
                metadata: {
                    authorityCode: 'GMADA',
                    host: 'gmada.gov.in',
                    searchKey: 'GMADA:searchKey:123',
                    recordCount: 2,
                    contentHash: 'content-hash-abc',
                    durationMs: 340,
                    wasSanitized: true,
                    changedKeys: ['possessionDate'],
                    code: 'SEARCH_OK',
                    searchMode: 'EXACT',
                    quotaReservationId: 'res_gmada_123',
                    parserVersion: '1.0.0'
                }
            });

            const persisted = await AuditLog.findOne({
                eventType: 'authority_portal_search_completed',
                'metadata.host': 'gmada.gov.in'
            }).sort({ _id: -1 });

            assert.ok(persisted);
            assert.strictEqual(persisted.metadata.host, 'gmada.gov.in');
            assert.strictEqual(persisted.metadata.searchKey, 'GMADA:searchKey:123');
            assert.strictEqual(persisted.metadata.recordCount, 2);
            assert.strictEqual(persisted.metadata.wasSanitized, true);
            assert.strictEqual(persisted.metadata.code, 'SEARCH_OK');
            assert.strictEqual(persisted.metadata.searchMode, 'EXACT');
            assert.strictEqual(persisted.metadata.quotaReservationId, 'res_gmada_123');
            assert.strictEqual(persisted.metadata.parserVersion, '1.0.0');
        });

        test('5.3: PortalAuditSink rejects uncontrolled metadata key in portal events', async () => {
            const sink = new PortalAuditSink(AuditLog, { testMode: false });
            await assert.rejects(async () => {
                await sink.write({
                    eventType: 'AUTHORITY_PORTAL_SEARCH_REQUESTED',
                    authorityCode: 'HSVP',
                    metadata: {
                        authorityCode: 'HSVP',
                        uncontrolledArbitraryKey: 'unauthorized_payload'
                    }
                });
            }, err => {
                assert.ok(err.message.includes('FREE_TEXT_AUDIT_PROHIBITED') || err.message.includes('PORTAL_AUDIT_WRITE_FAILED'));
                return true;
            });
        });

        test('5.4: AuditLog rejects arbitrary free-text descriptions for portal events', async () => {
            await assert.rejects(async () => {
                await AuditLog.create({
                    eventType: 'authority_portal_search_requested',
                    description: 'Arbitrary user narrative about searching citizen records',
                    status: 'success',
                    targetType: 'authority_portal'
                });
            }, err => {
                assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                return true;
            });
        });

        test('5.5: AuditLog accepts registered alternative description templates for portal events', async () => {
            const created = await AuditLog.create({
                eventType: 'authority_portal_search_requested',
                description: 'Authority portal audit event: authority_portal_search_requested (HSVP)',
                status: 'success',
                targetType: 'authority_portal',
                metadata: {
                    authorityCode: 'HSVP',
                    host: 'hsvphry.org.in'
                }
            });
            assert.ok(created._id);
            assert.strictEqual(created.description, 'Authority portal audit event: authority_portal_search_requested (HSVP)');
        });

        test('5.6: PortalAuditSink purges sensitive citizen PII keys from portal search metadata before saving', async () => {
            const sink = new PortalAuditSink(AuditLog, { testMode: false });
            await sink.write({
                eventType: 'AUTHORITY_PORTAL_SEARCH_REQUESTED',
                authorityCode: 'HSVP',
                metadata: {
                    authorityCode: 'HSVP',
                    host: 'hsvphry.org.in',
                    aadhaar: '1234-5678-9012',
                    password: 'secretPassword123',
                    cookie: 'session=xyz'
                }
            });

            const persisted = await AuditLog.findOne({
                eventType: 'authority_portal_search_requested',
                'metadata.host': 'hsvphry.org.in'
            }).sort({ _id: -1 });

            assert.ok(persisted);
            assert.strictEqual(persisted.metadata.aadhaar, undefined);
            assert.strictEqual(persisted.metadata.password, undefined);
            assert.strictEqual(persisted.metadata.cookie, undefined);
        });
    });
});
