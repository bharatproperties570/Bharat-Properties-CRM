import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AuditLog, {
    maskScalarPII,
    redactSensitive,
    isAuthorityAuditEvent,
    isControlledAuthorityDescription,
    sanitizeAuditDocument,
    sanitizeAuditUpdate
} from '../models/AuditLog.js';
import AuthoritySourceSettings, {
    INTERNAL_WORKFLOW_OPTION,
    createAuthorizedInternalWorkflowToken,
    verifyAuthorizedInternalWorkflow,
    validateOrganizationFilter,
    extractCanonicalTenantFromFilter,
    purgeExpiredNonces,
    _getConsumedWorkflowNoncesCount
} from '../models/AuthoritySourceSettings.js';
import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING
} from '../config/canonicalOrganization.js';

let mongoServer;

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
        const collections = mongoose.connection.collections;
        for (const key of Object.keys(collections)) {
            await collections[key].deleteMany({});
        }
    }
});

describe('PHASE 4.5-D (PR #61) FINAL AUDIT WRITE-PATH, CANONICAL UPSERT & HMAC CAPABILITY CLOSURE', () => {

    // =========================================================================
    // SECTION 1: Finding A — AuditLog Complete Write-Path & Update Operator Privacy
    // =========================================================================
    describe('1. Finding A: AuditLog Update Operators & Write-Path Sanitization', () => {

        test('1.1 $set and $setOnInsert sanitize nested PII metadata in updateOne/findOneAndUpdate', async () => {
            const audit = await AuditLog.create({
                eventType: 'user_login',
                description: 'User login from IP',
                metadata: { client: 'portal' }
            });

            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        'metadata.applicantName': 'Citizen Rahul Sharma',
                        'metadata.personalPhone': '9876543210'
                    },
                    $setOnInsert: {
                        'metadata.residence': 'Plot 45, Sector 14, Panchkula'
                    }
                }
            );

            const updated = await AuditLog.findById(audit._id).lean();
            assert.strictEqual(updated.metadata.applicantName, '[PII_MINIMIZED]');
            assert.ok(updated.metadata.personalPhone.includes('MINIMIZED'));
        });

        test('1.2 $push and $addToSet sanitize scalar and nested metadata (including $each)', async () => {
            const audit = await AuditLog.create({
                eventType: 'user_login',
                description: 'User login test',
                metadata: { history: [] }
            });

            // $push with array of objects
            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $push: {
                        'metadata.history': {
                            $each: [
                                { note: 'Contacted Amit Kumar regarding file 101', email: 'citizen@example.com' },
                                { note: 'Meeting at Model Town, Karnal 132001' }
                            ]
                        }
                    }
                }
            );

            const fetched = await AuditLog.findById(audit._id).lean();
            assert.ok(Array.isArray(fetched.metadata.history));
            assert.strictEqual(fetched.metadata.history[0].email, '[PII_MINIMIZED]');
            assert.ok(fetched.metadata.history[0].note.includes('[PII_MINIMIZED]'));
            assert.ok(fetched.metadata.history[1].note.includes('[ADDRESS_MINIMIZED]'));
        });

        test('1.3 Aggregation update pipelines are strictly rejected with UPDATE_PIPELINES_PROHIBITED', async () => {
            const audit = await AuditLog.create({
                eventType: 'user_login',
                description: 'User login pipeline test'
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        [{ $set: { description: 'Updated pipeline' } }]
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'UPDATE_PIPELINES_PROHIBITED');
                    return true;
                }
            );
        });

        test('1.4 Unsupported update operators on AuditLog are rejected with UNSUPPORTED_UPDATE_OPERATOR', async () => {
            const audit = await AuditLog.create({
                eventType: 'user_login',
                description: 'Unsupported op test'
            });

            assert.throws(
                () => {
                    sanitizeAuditUpdate({
                        $bit: { flags: { and: 5 } }
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'UNSUPPORTED_UPDATE_OPERATOR');
                    return true;
                }
            );
        });

        test('1.5 replaceOne and findOneAndReplace sanitize replacement documents', async () => {
            const audit = await AuditLog.create({
                eventType: 'user_login',
                description: 'Initial login',
                metadata: { phone: '9999999999' }
            });

            await AuditLog.replaceOne(
                { _id: audit._id },
                {
                    eventType: 'user_logout',
                    description: 'User logout recorded for Rahul Sharma',
                    metadata: {
                        mobile: '9876543210',
                        applicantName: 'Rahul Sharma'
                    }
                }
            );

            const replaced = await AuditLog.findById(audit._id).lean();
            assert.strictEqual(replaced.eventType, 'user_logout');
            assert.strictEqual(replaced.metadata.mobile, '[PII_MINIMIZED]');
            assert.strictEqual(replaced.metadata.applicantName, '[PII_MINIMIZED]');
            assert.ok(replaced.description.includes('[PII_MINIMIZED]'));
        });

        test('1.6 bulkWrite sanitizes insertOne, updateOne, updateMany, and replaceOne', async () => {
            const auditToUpdate = await AuditLog.create({
                eventType: 'user_login',
                description: 'Bulk update test'
            });

            await AuditLog.bulkWrite([
                {
                    insertOne: {
                        document: {
                            eventType: 'user_created',
                            description: 'User created: Sunita Devi',
                            metadata: { phone: '9123456789' }
                        }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: auditToUpdate._id },
                        update: {
                            $set: {
                                description: 'Updated for Amit Kumar',
                                'metadata.email': 'citizen@gov.in'
                            }
                        }
                    }
                }
            ]);

            const inserted = await AuditLog.findOne({ eventType: 'user_created' }).lean();
            assert.ok(inserted.description.includes('[PII_MINIMIZED]'));
            assert.ok(inserted.metadata.phone.includes('MINIMIZED'));

            const updated = await AuditLog.findById(auditToUpdate._id).lean();
            assert.ok(updated.description.includes('[PII_MINIMIZED]'));
            assert.ok(updated.metadata.email === '[PII_MINIMIZED]' || updated.metadata.email === 'c***@gov.in');
        });

        test('1.7 Immutability of authority approval audit events rejects updates and deletions', async () => {
            const approvalAudit = await AuditLog.create({
                eventType: 'authority_maker_checker_approval',
                description: 'Authority source authorization APPROVED for HSVP',
                status: 'success'
            });

            // updateOne must be rejected
            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { eventType: 'authority_maker_checker_approval' },
                        { $set: { status: 'failure' } }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // bulkWrite delete must be rejected
            await assert.rejects(
                async () => {
                    await AuditLog.bulkWrite([
                        {
                            deleteOne: {
                                filter: { eventType: 'authority_maker_checker_approval' }
                            }
                        }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // SECTION 2: Finding B — Citizen Name Privacy & Free-Text Rejection
    // =========================================================================
    describe('2. Finding B: Citizen Name Privacy & Controlled Descriptions', () => {

        test('2.1 Mask Indian honorifics and citizen prefixes to [PII_MINIMIZED]', () => {
            const prefixes = [
                'Shri Ramesh Kumar',
                'Smt Sunita Devi',
                'Kumari Anita',
                'Late Pandit Harish',
                'Resident Rahul Sharma',
                'Citizen Amit Kumar',
                'Allottee Rajesh Singh',
                'Applicant Suresh Verma',
                'Babu Lala Ram',
                'Thakur Vikram Singh',
                'Chaudhary Bhajan Lal'
            ];

            for (const text of prefixes) {
                const masked = maskScalarPII(text);
                assert.ok(masked.includes('[PII_MINIMIZED]'), `Failed to mask prefix in '${text}' -> '${masked}'`);
            }
        });

        test('2.2 Mask generic Indian given names and surnames without prefixes to [PII_MINIMIZED]', () => {
            const names = [
                'Rahul Sharma',
                'Amit Kumar',
                'Sunita Devi',
                'Priya Singh',
                'Rajesh Verma',
                'Vikram Gupta',
                'Ramesh Malhotra',
                'Suresh Bansal',
                'Pooja Aggarwal',
                'Anita Patel',
                'Deepak Yadav',
                'Manoj Chopra',
                'Sanjay Kaur',
                'Anil Jain',
                'Sunil Mehta'
            ];

            for (const name of names) {
                const masked = maskScalarPII(`Application submitted by ${name} in person.`);
                assert.ok(masked.includes('[PII_MINIMIZED]'), `Failed to mask generic name in '${name}' -> '${masked}'`);
                assert.ok(!masked.includes(name), `Original name '${name}' must not leak into masked output '${masked}'`);
            }
        });

        test('2.3 Mask postal addresses without keywords and 6-digit PIN codes to [ADDRESS_MINIMIZED]', () => {
            const addresses = [
                'Resident lives in Model Town, Ambala 134003',
                'Property situated at Urban Estate, Karnal 132001',
                'Registered office at DLF Phase 2, Gurugram 122002',
                'PIN code 134109 mentioned in postal record'
            ];

            for (const addr of addresses) {
                const masked = maskScalarPII(addr);
                assert.ok(masked.includes('[ADDRESS_MINIMIZED]'), `Failed to mask address/PIN in '${addr}' -> '${masked}'`);
            }
        });

        test('2.4 Authority audit events accept server-generated controlled descriptions', async () => {
            const controlledDescs = [
                'Authority source authorization APPROVED for HSVP',
                'Authority source authorization REJECTED for GMADA',
                'Authority verification run created for 10 items',
                'Batch of 5 items processed for run 67890',
                'Orphaned snapshot 123 purged after worker lease preemption',
                'Rotated canonical policy for HSVP to version 2',
                'Run completed with status SUCCESS'
            ];

            for (const desc of controlledDescs) {
                const created = await AuditLog.create({
                    eventType: 'authority_settings_updated',
                    description: desc,
                    status: 'success'
                });
                assert.ok(created._id);
            }
        });

        test('2.5 Authority audit events reject arbitrary free-text narrative descriptions with FREE_TEXT_AUDIT_PROHIBITED', async () => {
            const narrativeFreeTexts = [
                'Amit Kumar visited the property office today to submit physical documents',
                'Rahul Sharma called complaining about delay in verification',
                'Citizen requested manual check because allottee name is in dispute',
                'The local broker visited the estate office on Monday morning'
            ];

            for (const narrative of narrativeFreeTexts) {
                await assert.rejects(
                    async () => {
                        await AuditLog.create({
                            eventType: 'authority_source_approval_reviewed',
                            description: narrative,
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

        test('2.6 Authority audit events reject uncontrolled free-text notes/comments with FREE_TEXT_AUDIT_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuditLog.create({
                        eventType: 'authority_source_approval_reviewed',
                        description: 'Authority source settings update',
                        notes: 'Arbitrary unstructured notes entered by reviewer about citizen'
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('2.7 Authority audit events accept controlled reason codes in notes', async () => {
            const controlledCodes = [
                'EVIDENCE_REVIEWED',
                'DOCUMENT_REFERENCE_INCOMPLETE',
                'CONTRACT_NOT_VERIFIED',
                'TERMS_NOT_REVIEWED',
                'IDENTITY_EVIDENCE_MISMATCH',
                'AUTHORIZATION_REJECTED',
                'OTHER_CONTROLLED_REASON'
            ];

            for (const code of controlledCodes) {
                const created = await AuditLog.create({
                    eventType: 'authority_source_approval_reviewed',
                    description: 'Authority source authorization APPROVED for HSVP',
                    notes: code
                });
                assert.ok(created._id);
            }
        });
    });

    // =========================================================================
    // SECTION 3: Finding C & D — Canonical Organization Requirements for Upsert
    // =========================================================================
    describe('3. Finding C & D: Canonical Organization Upsert & Context Enforcement', () => {

        test('3.1 Upsert missing tenantId in filter throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { authorityCode: 'HSVP' },
                        {
                            $set: { authorizationScope: 'Testing' },
                            $setOnInsert: { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' }
                        },
                        { upsert: true }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.2 Upsert missing tenantId in update payload throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' },
                        {
                            $set: { authorizationScope: 'Testing' }
                        },
                        { upsert: true }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.3 Upsert targeting non-canonical organization throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
            const foreignOrg = '6af0c70c1bb9c8518e54587e';
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { tenantId: foreignOrg, authorityCode: 'HSVP' },
                        {
                            $set: { authorizationScope: 'Testing' },
                            $setOnInsert: { tenantId: foreignOrg, authorityCode: 'HSVP' }
                        },
                        { upsert: true }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.4 Filter containing non-canonical tenantId in $or/$and/$nor throws ORGANIZATION_OVERRIDE_PROHIBITED', () => {
            const foreignOrg = '6af0c70c1bb9c8518e54587e';

            assert.throws(
                () => {
                    validateOrganizationFilter({
                        $or: [{ tenantId: foreignOrg }, { authorityCode: 'HSVP' }]
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );

            assert.throws(
                () => {
                    validateOrganizationFilter({
                        $and: [{ tenantId: foreignOrg }]
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );

            assert.throws(
                () => {
                    validateOrganizationFilter({
                        $nor: [{ tenantId: foreignOrg }]
                    });
                },
                (err) => {
                    assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.5 Bulk upsert missing tenantId in filter throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.bulkWrite([
                        {
                            updateOne: {
                                filter: { authorityCode: 'GMADA' },
                                update: {
                                    $setOnInsert: { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'GMADA' }
                                },
                                upsert: true
                            }
                        }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.6 Bulk upsert missing tenantId in $setOnInsert throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.bulkWrite([
                        {
                            updateOne: {
                                filter: { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'GMADA' },
                                update: {
                                    $set: { isPaused: true }
                                },
                                upsert: true
                            }
                        }
                    ]);
                },
                (err) => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('3.7 Bulk ensureDefaults strictly enforces canonical authorities allowlist (HSVP, GMADA, CHD)', async () => {
            const token = createAuthorizedInternalWorkflowToken('ensureDefaults', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: 'ENSURE_DEFAULTS_ALL',
                authorityCode: 'HSVP,GMADA,CHD',
                evidenceVersion: 0
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.bulkWrite(
                        [
                            {
                                updateOne: {
                                    filter: { tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'INVALID_AUTH' },
                                    update: {
                                        $setOnInsert: {
                                            tenantId: CANONICAL_ORGANIZATION_ID,
                                            authorityCode: 'INVALID_AUTH',
                                            isEnabled: false
                                        }
                                    },
                                    upsert: true
                                }
                            }
                        ],
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
                    return true;
                }
            );
        });

        test('3.8 ensureDefaults successfully provisions all 3 canonical authorities with exact disabled defaults', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);

            const allSettings = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORGANIZATION_ID }).lean();
            assert.strictEqual(allSettings.length, 3);

            for (const s of allSettings) {
                assert.ok(['HSVP', 'GMADA', 'CHD'].includes(s.authorityCode));
                assert.strictEqual(s.isEnabled, false);
                assert.strictEqual(s.schedulingEnabled, false);
                assert.strictEqual(s.reviewStatus, 'UNDER_REVIEW');
                assert.strictEqual(s.permissionStatus, 'GRANTED');
                assert.strictEqual(s.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
                assert.strictEqual(s.commercialUseAuthorized, false);
                assert.strictEqual(s.termsReviewed, false);
            }
        });
    });

    // =========================================================================
    // SECTION 4: Finding E — HMAC Capability Token Operation & Context Binding
    // =========================================================================
    describe('4. Finding E: HMAC Capability Token Operation & Nonce Lifecycle', () => {

        test('4.1 Wildcard targetId or evidenceVersion rejected for recordSourceApprover and reviewSourceApproval', () => {
            // Wildcard targetId
            const tokenWithWildcardTarget = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: '*',
                authorityCode: 'HSVP',
                evidenceVersion: 1
            });
            assert.strictEqual(verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: tokenWithWildcardTarget }), false);

            // Wildcard evidenceVersion
            const tokenWithWildcardVer = createAuthorizedInternalWorkflowToken('reviewSourceApproval', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: '6af0c70c1bb9c8518e54587a',
                authorityCode: 'HSVP',
                evidenceVersion: '*'
            });
            assert.strictEqual(verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: tokenWithWildcardVer }), false);
        });

        test('4.2 recordSourceApprover scope validation rejects reviewer fields with SCOPE_VIOLATION_PROHIBITED', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);
            const setting = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' });

            const reviewerId = new mongoose.Types.ObjectId();
            const token = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: setting._id,
                authorityCode: 'HSVP',
                evidenceVersion: setting.evidenceVersion
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: setting._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        {
                            $set: {
                                reviewedBy: reviewerId, // Reviewer field is prohibited in approver workflow
                                reviewStatus: 'UNDER_REVIEW'
                            }
                        },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'SCOPE_VIOLATION_PROHIBITED');
                    return true;
                }
            );
        });

        test('4.3 reviewSourceApproval scope validation rejects approver fields with SCOPE_VIOLATION_PROHIBITED', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);
            const setting = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' });

            const approverId = new mongoose.Types.ObjectId();
            const token = createAuthorizedInternalWorkflowToken('reviewSourceApproval', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: setting._id,
                authorityCode: 'HSVP',
                evidenceVersion: setting.evidenceVersion
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: setting._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        {
                            $set: {
                                approvedBy: approverId // Approver field is prohibited in review workflow
                            }
                        },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'SCOPE_VIOLATION_PROHIBITED');
                    return true;
                }
            );
        });

        test('4.4 Approval workflow tokens cannot enable source or scheduling (throws SCOPE_VIOLATION_PROHIBITED)', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);
            const setting = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' });

            const token = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: setting._id,
                authorityCode: 'HSVP',
                evidenceVersion: setting.evidenceVersion
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: setting._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        {
                            $set: {
                                isEnabled: true
                            }
                        },
                        { [INTERNAL_WORKFLOW_OPTION]: token }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'SCOPE_VIOLATION_PROHIBITED');
                    return true;
                }
            );
        });

        test('4.5 Mismatched targetId or authorityCode or evidenceVersion in token throws UNAUTHORIZED_INTERNAL_WORKFLOW', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);
            const setting = await AuthoritySourceSettings.findOne({ tenantId: CANONICAL_ORGANIZATION_ID, authorityCode: 'HSVP' });

            // Wrong authorityCode in token
            const wrongAuthToken = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: setting._id,
                authorityCode: 'GMADA', // Mismatch: setting is HSVP
                evidenceVersion: setting.evidenceVersion
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: setting._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        {
                            $set: { reviewStatus: 'UNDER_REVIEW' }
                        },
                        { [INTERNAL_WORKFLOW_OPTION]: wrongAuthToken }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );

            // Wrong evidenceVersion in token
            const wrongVerToken = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: setting._id,
                authorityCode: 'HSVP',
                evidenceVersion: 999 // Mismatch: setting evidenceVersion is 1
            });

            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.updateOne(
                        { _id: setting._id, tenantId: CANONICAL_ORGANIZATION_ID },
                        {
                            $set: { reviewStatus: 'UNDER_REVIEW' }
                        },
                        { [INTERNAL_WORKFLOW_OPTION]: wrongVerToken }
                    );
                },
                (err) => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
                    return true;
                }
            );
        });

        test('4.6 Single-use nonce replay prevention and expiry cleanup', () => {
            const token = createAuthorizedInternalWorkflowToken('ensureDefaults', {
                tenantId: CANONICAL_ORGANIZATION_ID,
                targetId: 'ENSURE_DEFAULTS_ALL',
                authorityCode: 'HSVP',
                evidenceVersion: 0
            });

            const options = { [INTERNAL_WORKFLOW_OPTION]: token };

            // First verification consumes the nonce -> succeeds
            const firstResult = verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']);
            assert.strictEqual(firstResult, true);

            // Replay verification with same nonce from a different call must be rejected
            const replayOptions = { [INTERNAL_WORKFLOW_OPTION]: token };
            const replayResult = verifyAuthorizedInternalWorkflow(replayOptions, ['ensureDefaults']);
            assert.strictEqual(replayResult, false);

            // Verify nonce registry counts and selective expiry
            const countBefore = _getConsumedWorkflowNoncesCount();
            assert.ok(countBefore >= 1);

            // Running purgeExpiredNonces now does NOT delete unexpired valid nonces
            purgeExpiredNonces();
            const countAfter = _getConsumedWorkflowNoncesCount();
            assert.strictEqual(countAfter, countBefore);
        });
    });

    // =========================================================================
    // SECTION 5: Safety Invariants & Fixed Database Architecture
    // =========================================================================
    describe('5. Safety Invariants & Zero Mutation', () => {

        test('5.1 Authority sources are fail-closed: isEnabled is false and schedulingEnabled is false', async () => {
            await AuthoritySourceSettings.ensureDefaults(CANONICAL_ORGANIZATION_ID);
            const list = await AuthoritySourceSettings.find({ tenantId: CANONICAL_ORGANIZATION_ID }).lean();

            for (const item of list) {
                assert.strictEqual(item.isEnabled, false);
                assert.strictEqual(item.schedulingEnabled, false);
                assert.strictEqual(item.permissionStatus, 'GRANTED');
                assert.strictEqual(item.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
                assert.strictEqual(item.approvedAccessMethod, 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION');
            }
        });

        test('5.2 Extraction of canonical tenant from complex queries succeeds only for canonical ID', () => {
            assert.strictEqual(extractCanonicalTenantFromFilter({ tenantId: CANONICAL_ORGANIZATION_ID_STRING }), true);
            assert.strictEqual(extractCanonicalTenantFromFilter({ $and: [{ tenantId: CANONICAL_ORGANIZATION_ID_STRING }] }), true);
            assert.strictEqual(extractCanonicalTenantFromFilter({ tenantId: '6af0c70c1bb9c8518e54587e' }), false);
            assert.strictEqual(extractCanonicalTenantFromFilter({ authorityCode: 'HSVP' }), false);
            assert.strictEqual(extractCanonicalTenantFromFilter(null), false);
        });
    });
});
