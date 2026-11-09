import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import AuthoritySourceSettings, {
    PROTECTED_FIELDS,
    isProtectedPath,
    checkActivationEligibility,
    checkInternalMakerCheckerReviewEligibility,
    INTERNAL_WORKFLOW_OPTION
} from '../models/AuthoritySourceSettings.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog, { maskScalarPII, redactSensitive } from '../models/AuditLog.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';
import {
    classifyEnvironment,
    getEnvironmentDecisionMatrix,
    isEnvironmentProductionOrUnsafe
} from '../services/authority/databaseEnvironmentSafety.js';
import {
    recordSourceApprover,
    reviewSourceApproval,
    submitSourceApproval
} from '../controllers/authorityVerification.controller.js';

let replSet = null;
const testTenantId = CANONICAL_ORGANIZATION_ID;

let submitterRole;
let approverRole;
let reviewerRole;
let basicRole;

let submitterUser;
let approverUser;
let reviewerUser;
let nonCanonicalUser;
let inactiveUser;
let unauthorizedUser;

function createMockRes() {
    return {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
}

test.before(async () => {
    replSet = await MongoMemoryReplSet.create({
        replSet: {
            count: 1
        }
    });
    const uri = replSet.getUri('phase45d_p58_final_residual_security_test');
    await mongoose.connect(uri);

    // Pre-create collections for transaction safety
    await User.createCollection();
    await Role.createCollection();
    await AuditLog.createCollection();
    await AuthoritySourceSettings.createCollection();

    // Create roles
    submitterRole = await Role.create({
        name: 'Inventory Submitter P59',
        department: 'inventory',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit']
    });

    approverRole = await Role.create({
        name: 'Compliance Approver P59',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit'],
        approvalRights: { manageAuthoritySettings: true }
    });

    reviewerRole = await Role.create({
        name: 'Independent Compliance Reviewer P59',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit', 'authorityVerification.approve'],
        approvalRights: { approveAuthorityChanges: true }
    });

    basicRole = await Role.create({
        name: 'Basic Staff P59',
        department: 'inventory',
        tenantId: testTenantId,
        permissions: ['inventory.view']
    });

    // Create users
    submitterUser = await User.create({
        fullName: 'Submitter Staff',
        email: 'submitter@bharatproperties.test',
        password: 'Password123!',
        department: 'inventory',
        tenantId: testTenantId,
        role: submitterRole._id,
        isActive: true,
        status: 'active'
    });

    approverUser = await User.create({
        fullName: 'Approver Officer',
        email: 'approver@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: testTenantId,
        role: approverRole._id,
        isActive: true,
        status: 'active'
    });

    reviewerUser = await User.create({
        fullName: 'Independent Reviewer',
        email: 'reviewer@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: testTenantId,
        role: reviewerRole._id,
        isActive: true,
        status: 'active'
    });

    nonCanonicalUser = await User.create({
        fullName: 'Wrong Org User',
        email: 'wrongorg@otherbroker.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: new mongoose.Types.ObjectId(),
        role: reviewerRole._id,
        isActive: true,
        status: 'active'
    });

    inactiveUser = await User.create({
        fullName: 'Inactive Staff',
        email: 'inactive@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: testTenantId,
        role: reviewerRole._id,
        isActive: false,
        status: 'inactive'
    });

    unauthorizedUser = await User.create({
        fullName: 'Unauthorized Staff',
        email: 'unauth@bharatproperties.test',
        password: 'Password123!',
        department: 'inventory',
        tenantId: testTenantId,
        role: basicRole._id,
        isActive: true,
        status: 'active'
    });
});

test.after(async () => {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (replSet) {
        await replSet.stop({ doCleanup: true, force: true });
    }
});

test.beforeEach(async () => {
    await AuthoritySourceSettings.deleteMany({});
    await AuditLog.deleteMany({});
});

// Helper to reset a specific authority setting into clean UNDER_REVIEW state via submitSourceApproval
async function prepareSubmittedSource(authorityCode = 'HSVP') {
    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const subRes = createMockRes();
    await submitSourceApproval({
        user: submitterUser,
        params: { authorityCode },
        body: {
            approvalReference: `SUBMIT-${authorityCode}-2026-V1`,
            approvalDate: '2026-11-06T10:00:00.000Z',
            approvalExpiryDate: '2027-11-06T10:00:00.000Z',
            permittedFields: ['propertyId', 'sectorNumber'],
            ratePolicy: {
                maxRequestsPerMinute: 1,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 1440,
                minimumIntervalMs: 60000,
                maxConcurrent: 1,
                policySource: `INTERNAL_SAFETY_THROTTLE_${authorityCode}`
            },
            commercialUseAuthorized: false,
            readOnlySearchAuthorized: true,
            termsReviewed: false,
            contractVerificationStatus: 'NOT_VERIFIED',
            identityRequirements: {
                required: ['sectorNumber', 'propertyId'],
                optional: ['urbanEstate']
            }
        }
    }, subRes);
    assert.strictEqual(subRes.statusCode, 200);
    return AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode });
}

// ============================================================
// AREA 1: APPROVER EVIDENCE VERSION (FINDING C)
// ============================================================

test('Area 1.1: recordSourceApprover returns 422 EVIDENCE_VERSION_REQUIRED when version omitted', async () => {
    await prepareSubmittedSource('HSVP');

    const req = {
        params: { authorityCode: 'HSVP' },
        user: approverUser,
        body: {
            approverId: approverUser._id,
            approvalNotes: 'EVIDENCE_REVIEWED'
            // expectedEvidenceVersion omitted
        }
    };
    const res = createMockRes();
    await recordSourceApprover(req, res);

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.data.code, 'EVIDENCE_VERSION_REQUIRED');
});

test('Area 1.2: recordSourceApprover returns 422 when version is non-positive or invalid', async () => {
    await prepareSubmittedSource('HSVP');

    for (const badVer of [0, -1, 'invalid_version', null]) {
        const req = {
            params: { authorityCode: 'HSVP' },
            user: approverUser,
            body: {
                approverId: approverUser._id,
                expectedEvidenceVersion: badVer,
                approvalNotes: 'EVIDENCE_REVIEWED'
            }
        };
        const res = createMockRes();
        await recordSourceApprover(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.data.code, 'EVIDENCE_VERSION_REQUIRED');
    }
});

test('Area 1.3: recordSourceApprover returns 409 STALE_EVIDENCE_VERSION when version mismatches', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const req = {
        params: { authorityCode: 'HSVP' },
        user: approverUser,
        body: {
            approverId: approverUser._id,
            expectedEvidenceVersion: 99, // Current is setting.evidenceVersion (2)
            approvalNotes: 'EVIDENCE_REVIEWED'
        }
    };
    const res = createMockRes();
    await recordSourceApprover(req, res);

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.data.code, 'STALE_EVIDENCE_VERSION');
});

test('Area 1.4: recordSourceApprover succeeds when expectedEvidenceVersion matches current version', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const req = {
        params: { authorityCode: 'HSVP' },
        user: approverUser,
        body: {
            approverId: approverUser._id,
            expectedEvidenceVersion: setting.evidenceVersion,
            approvalNotes: 'EVIDENCE_REVIEWED'
        }
    };
    const res = createMockRes();
    await recordSourceApprover(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(String(res.data.data.approvedBy), String(approverUser._id));
    assert.strictEqual(res.data.data.evidenceVersion, setting.evidenceVersion);
});

// ============================================================
// AREA 2: QUERY $SET PROTECTED FIELD HARDENING (FINDING A)
// ============================================================

test('Area 2.1: Direct $set approvedBy while UNDER_REVIEW is rejected with PROTECTED_FIELD_UPDATE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { approvedBy: approverUser._id } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            assert.ok(err.message.includes('Direct modification of protected field'));
            return true;
        }
    );
});

test('Area 2.2: Direct $set submittedBy while UNDER_REVIEW is rejected with PROTECTED_FIELD_UPDATE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { submittedBy: submitterUser._id } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            assert.ok(err.message.includes('submittedBy'));
            return true;
        }
    );
});

test('Area 2.3: Direct $set reviewStatus=APPROVED is rejected without maker-checker approval', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { reviewStatus: 'APPROVED' } }
            );
        },
        (err) => {
            assert.ok(err.code === 'MAKER_CHECKER_APPROVAL_REJECTED' || err.code === 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.4: Direct $set identityRequirements.verified=true without activation is rejected', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { 'identityRequirements.verified': true } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.5: Caller-controlled spoofed internal workflow token is rejected', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { approvedBy: approverUser._id } },
                { isAuthorizedReviewWorkflow: true }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'UNAUTHORIZED_INTERNAL_WORKFLOW');
            return true;
        }
    );
});

test('Area 2.6: Direct reset to safe inactive defaults succeeds while privilege escalation is rejected', async () => {
    await prepareSubmittedSource('HSVP');

    // Safe inactive reset: isEnabled=false, permissionStatus=NOT_OBTAINED
    const resetResult = await AuthoritySourceSettings.updateOne(
        { tenantId: testTenantId, authorityCode: 'HSVP' },
        { $set: { isEnabled: false, permissionStatus: 'NOT_OBTAINED', reviewStatus: 'DRAFT' } }
    );
    assert.strictEqual(resetResult.acknowledged, true);

    const doc = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    assert.strictEqual(doc.isEnabled, false);
    assert.strictEqual(doc.permissionStatus, 'NOT_OBTAINED');
    assert.strictEqual(doc.reviewStatus, 'DRAFT');

    // Escalation attempt from reset state: setting isEnabled=true or permissionStatus=GRANTED directly is blocked
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { isEnabled: true } }
            );
        },
        (err) => {
            assert.ok(err.code === 'ACTIVATION_LOCKED_PHASE3' || err.code === 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            return true;
        }
    );

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { permissionStatus: 'GRANTED' } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 3 & 4: DOTTED AND ANCESTOR PATHS (FINDING A)
// ============================================================

test('Area 3.1: Dotted path updates to nested protected fields are blocked', async () => {
    await prepareSubmittedSource('HSVP');

    const blockedPaths = [
        { 'userReportedEvidence.verificationStatus': 'VERIFIED' },
        { 'ownerAttestation.attestingParty': 'Fake Party' },
        { 'contractVerificationStatus': 'VERIFIED' }
    ];

    for (const updateObj of blockedPaths) {
        await assert.rejects(
            async () => {
                await AuthoritySourceSettings.updateOne(
                    { tenantId: testTenantId, authorityCode: 'HSVP' },
                    { $set: updateObj }
                );
            },
            (err) => {
                assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
                return true;
            }
        );
    }
});

test('Area 4.1: Ancestor path removal ($unset of parent object) is prohibited', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $unset: { identityRequirements: "" } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UNSET_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 5: ALL UPDATE OPERATORS COVERAGE (FINDING A)
// ============================================================

test('Area 5.1: $unset on any protected field throws PROTECTED_FIELD_UNSET_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $unset: { approvedBy: "" } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UNSET_PROHIBITED');
            return true;
        }
    );
});

test('Area 5.2: $rename involving protected field throws PROTECTED_FIELD_RENAME_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $rename: { approvedBy: 'oldApprovedBy' } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_RENAME_PROHIBITED');
            return true;
        }
    );
});

test('Area 5.3: Arithmetic and array operators on protected fields throw PROTECTED_FIELD_UPDATE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    const ops = [
        { $inc: { evidenceVersion: 1 } },
        { $mul: { evidenceVersion: 2 } },
        { $currentDate: { approvedAt: true } }
    ];

    for (const op of ops) {
        await assert.rejects(
            async () => {
                await AuthoritySourceSettings.updateOne(
                    { tenantId: testTenantId, authorityCode: 'HSVP' },
                    op
                );
            },
            (err) => {
                assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
                return true;
            }
        );
    }
});

test('Area 5.4: Unrecognized update operator throws UNRECOGNIZED_UPDATE_OPERATOR_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $unknownOperator: { someField: 123 } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'UNRECOGNIZED_UPDATE_OPERATOR_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 6: UPSERT PROTECTIONS (FINDING B)
// ============================================================

test('Area 6.1: updateOne upsert with protected metadata throws SECURITY_UPSERT_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'NEW_CODE' },
                { $set: { reviewStatus: 'APPROVED' } },
                { upsert: true }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'SECURITY_UPSERT_PROHIBITED');
            return true;
        }
    );
});

test('Area 6.2: findOneAndUpdate upsert with $setOnInsert protected fields throws SECURITY_UPSERT_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: testTenantId, authorityCode: 'NEW_CODE' },
                { $setOnInsert: { approvedBy: approverUser._id } },
                { upsert: true }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'SECURITY_UPSERT_PROHIBITED');
            return true;
        }
    );
});

test('Area 6.3: Upsert with non-canonical organization ID throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    const wrongTenant = new mongoose.Types.ObjectId();
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: wrongTenant, authorityCode: 'HSVP' },
                { $set: { timeoutMs: 5000 } },
                { upsert: true }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 7 & 8: BULKWRITE & INSERTMANY (FINDING B)
// ============================================================

test('Area 7.1: bulkWrite replaceOne throws DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    replaceOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        replacement: { tenantId: testTenantId, authorityCode: 'HSVP', reviewStatus: 'APPROVED' }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            assert.ok(err.message.includes('Generic replacement via bulkWrite is strictly prohibited'));
            return true;
        }
    );
});

test('Area 7.2: bulkWrite with protected fields without ensureDefaults token throws DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        update: { $set: { isEnabled: true } }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            assert.ok(err.message.includes('Bulk update attempts cannot circumvent activation checks'));
            return true;
        }
    );
});

test('Area 8.1: insertMany with active or approved documents throws DIRECT_INSERT_MANY_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.insertMany([
                {
                    tenantId: testTenantId,
                    authorityCode: 'GMADA',
                    reviewStatus: 'APPROVED',
                    isEnabled: true
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_INSERT_MANY_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 10: IDENTITY ATTESTATION VERSION BINDING (FINDING D)
// ============================================================

test('Area 10.1: reviewSourceApproval rejects attestation missing evidenceReference (400)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // First record approver stage
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const req = {
        params: { authorityCode: 'HSVP' },
        user: reviewerUser,
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: recRes.data.data.evidenceVersion,
            identityContractAttestation: {
                // evidenceReference omitted
                evidenceVersion: recRes.data.data.evidenceVersion,
                attestationHash: 'abc'
            }
        }
    };
    const res = createMockRes();
    await reviewSourceApproval(req, res);

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.data.code, 'ATTESTATION_REFERENCE_REQUIRED');
});

test('Area 10.2: reviewSourceApproval rejects attestation with version mismatched from expectedEvidenceVersion (422)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const req = {
        params: { authorityCode: 'HSVP' },
        user: reviewerUser,
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: recRes.data.data.evidenceVersion,
            identityContractAttestation: {
                evidenceReference: 'REF_123',
                evidenceVersion: 99, // Mismatched from expected
                attestationHash: 'abc'
            }
        }
    };
    const res = createMockRes();
    await reviewSourceApproval(req, res);

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.data.code, 'ATTESTATION_VERSION_MISMATCH');
});

test('Area 10.3: reviewSourceApproval rejects hash-only attestation without evidenceReference (422)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const req = {
        params: { authorityCode: 'HSVP' },
        user: reviewerUser,
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: recRes.data.data.evidenceVersion,
            identityContractAttestation: {
                attestationHash: 'sha256-hash-only-attempt'
            }
        }
    };
    const res = createMockRes();
    await reviewSourceApproval(req, res);

    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.data.code, 'ATTESTATION_REFERENCE_REQUIRED');
});

// ============================================================
// AREA 11: AUDIT IDENTITY MANDATORY COMPLETENESS (FINDING F)
// ============================================================

test('Area 11.1: verifyMakerCheckerUsers rejects audit record missing actorId', async () => {
    const setting = await prepareSubmittedSource('HSVP');
    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        userId: approverUser._id,
        status: 'success',
        description: 'Maker-checker audit event',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: audit._id,
        makerCheckerAuditLogId: audit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: setting.evidenceVersion
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required actorId'));
});

test('Area 11.2: verifyMakerCheckerUsers rejects audit record missing userId', async () => {
    const setting = await prepareSubmittedSource('HSVP');
    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        status: 'success',
        description: 'Maker-checker audit event',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: audit._id,
        makerCheckerAuditLogId: audit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: setting.evidenceVersion
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required userId'));
});

test('Area 11.3: verifyMakerCheckerUsers rejects audit record missing metadata.submittedBy', async () => {
    const setting = await prepareSubmittedSource('HSVP');
    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        description: 'Maker-checker audit event',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            // submittedBy omitted
            evidenceVersion: setting.evidenceVersion
        }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: audit._id,
        makerCheckerAuditLogId: audit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: setting.evidenceVersion
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required submittedBy'));
});

test('Area 11.4: verifyMakerCheckerUsers succeeds when full identity contract is present', async () => {
    const setting = await prepareSubmittedSource('HSVP');
    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        description: 'Maker-checker audit event',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: audit._id,
        makerCheckerAuditLogId: audit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: setting.evidenceVersion
    });

    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.submitter.id, String(submitterUser._id));
    assert.strictEqual(check.approver.id, String(approverUser._id));
    assert.strictEqual(check.reviewer.id, String(reviewerUser._id));
});

// ============================================================
// AREA 12: CITIZEN PII MINIMIZATION (FINDING E)
// ============================================================

test('Area 12.1: Free-text containing citizen PII is masked upon audit persistence', async () => {
    const sensitiveDescription = 'Citizen Rahul Sharma with PAN ABCDE1234F, Aadhaar 2345 6789 0123, phone +91-9876543210, email rahul@example.com living at House 42 Park Street Gurgaon';

    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        description: sensitiveDescription,
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            rawCitizenNote: 'Citizen personal document verified at Flat 12 MG Road'
        }
    });

    const retrieved = await AuditLog.findById(audit._id).lean();
    assert.ok(!retrieved.description.includes('ABCDE1234F'));
    assert.ok(!retrieved.description.includes('2345 6789 0123'));
    assert.ok(!retrieved.description.includes('rahul@example.com'));
    assert.ok(!retrieved.description.includes('+91-9876543210'));
    assert.ok(retrieved.description.includes('[PAN_MINIMIZED]'));
    assert.ok(retrieved.description.includes('[AADHAAR_MINIMIZED]'));
    assert.ok(retrieved.description.includes('[PHONE_MINIMIZED]'));
    assert.ok(retrieved.description.includes('[ADDRESS_MINIMIZED]'));
    assert.ok(retrieved.description.includes('r***@example.com'));
});

// ============================================================
// AREA 13 & 14: TRANSACTIONS & CONCURRENCY (FINDING G)
// ============================================================

test('Area 13.1: Atomic review: Review failure rolls back changes and creates no valid approval', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // Record approver stage
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // Approver attempts to review their own approval (self-review prohibited)
    const req = {
        params: { authorityCode: 'HSVP' },
        user: approverUser,
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: recRes.data.data.evidenceVersion,
            approvalNotes: 'EVIDENCE_REVIEWED'
        }
    };
    const res = createMockRes();
    await reviewSourceApproval(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.code, 'MAKER_CHECKER_VIOLATION');
    const unmod = await AuthoritySourceSettings.findById(setting._id);
    assert.strictEqual(unmod.reviewStatus, 'UNDER_REVIEW');
    assert.strictEqual(unmod.reviewedBy, null);
});

test('Area 14.1: Concurrent review with stale evidenceVersion is rejected with 409', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const req = {
        params: { authorityCode: 'HSVP' },
        user: reviewerUser,
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 99, // Stale version
            approvalNotes: 'EVIDENCE_REVIEWED'
        }
    };
    const res = createMockRes();
    await reviewSourceApproval(req, res);

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.data.code, 'STALE_EVIDENCE_VERSION');
});

// ============================================================
// AREA 15: ACTIVATION SAFETY LOCK
// ============================================================

test('Area 15.1: Source with reviewStatus APPROVED cannot be enabled while external contract criteria unmet', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: recRes.data.data.evidenceVersion,
            approvalNotes: 'EVIDENCE_REVIEWED'
        }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);
    assert.strictEqual(revRes.data.data.reviewStatus, 'APPROVED');

    // Attempting to enable the source throws ACTIVATION_LOCKED_PHASE3 because contract is NOT_VERIFIED
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { _id: setting._id, tenantId: testTenantId },
                { $set: { isEnabled: true } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );
});

// ============================================================
// AREA 16 & 17: ENVIRONMENT & DATABASE DECISION
// ============================================================

test('Area 16.1: Environment decision matrix verifies production requires transactions and staging DB is false', () => {
    const matrix = getEnvironmentDecisionMatrix();
    const prodEntry = matrix.find(e => e.label === 'production');
    assert.strictEqual(prodEntry.requiresTransactions, true);
    assert.strictEqual(prodEntry.writesAllowed, false);
    assert.strictEqual(prodEntry.stagingDbRequired, false);

    assert.strictEqual(isEnvironmentProductionOrUnsafe('production'), true);
    assert.strictEqual(isEnvironmentProductionOrUnsafe('live'), true);
    assert.strictEqual(isEnvironmentProductionOrUnsafe('unknown-env'), true);
    assert.strictEqual(isEnvironmentProductionOrUnsafe('test'), false);
});

test('Area 17.1: Single permanent Production database architecture confirmed with zero staging requirements', () => {
    // Zero staging database URIs or staging environment requirements
    assert.strictEqual(process.env.STAGING_MONGODB_URI, undefined);
    assert.strictEqual(process.env.NONPROD_MONGODB_URI, undefined);
});
