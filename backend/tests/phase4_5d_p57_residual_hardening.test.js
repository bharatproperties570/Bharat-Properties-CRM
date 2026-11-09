process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import AuthoritySourceSettings, {
    checkActivationEligibility,
    checkInternalMakerCheckerReviewEligibility,
    _testOnlyResetAuthoritySettings
} from '../models/AuthoritySourceSettings.js';
import AuditLog, { maskScalarPII, redactSensitive } from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';
import {
    isProductionEnvironment,
    getEnvironmentDecisionMatrix,
    classifyEnvironment
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
    const uri = replSet.getUri('phase45d_p57_residual_hardening_test');
    await mongoose.connect(uri);

    // Pre-create collections for transaction safety
    await User.createCollection();
    await Role.createCollection();
    await AuditLog.createCollection();
    await AuthoritySourceSettings.createCollection();

    // Create roles
    submitterRole = await Role.create({
        name: 'Inventory Submitter P58',
        department: 'inventory',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit']
    });

    approverRole = await Role.create({
        name: 'Compliance Approver P58',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit'],
        approvalRights: { manageAuthoritySettings: true }
    });

    reviewerRole = await Role.create({
        name: 'Independent Compliance Reviewer P58',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit', 'authorityVerification.approve'],
        approvalRights: { approveAuthorityChanges: true }
    });

    basicRole = await Role.create({
        name: 'Basic Staff P58',
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
    await _testOnlyResetAuthoritySettings({});
    await AuditLog.deleteMany({});
});

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
// AREA 1: INTERNAL REVIEW VS EXTERNAL ACTIVATION LIFECYCLE SEPARATION
// ============================================================

test('Area 1.1: reviewSourceApproval endpoint succeeds while contract is NOT_VERIFIED and terms are unreviewed', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // Approver stage
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion, notes: 'Valid approver notes' }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // Reviewer stage: external contract is NOT_VERIFIED, terms unreviewed
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: setting.evidenceVersion,
            notes: 'Independent maker-checker review passed'
        }
    }, revRes);

    assert.strictEqual(revRes.statusCode, 200);
    assert.strictEqual(revRes.data.success, true);
    assert.strictEqual(revRes.data.data.reviewStatus, 'APPROVED');
    assert.strictEqual(revRes.data.data.permissionStatus, 'GRANTED');

    // External activation MUST remain strictly false
    assert.strictEqual(revRes.data.data.isEnabled, false);
    assert.strictEqual(revRes.data.data.schedulingEnabled, false);
    assert.strictEqual(revRes.data.data.effectivelyActive, false);

    // checkActivationEligibility verifies live activation is blocked
    const updated = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    const activation = updated.checkActivationEligibility();
    assert.strictEqual(activation.canActivate, false);
    assert.ok(activation.blockers.some(b => b.includes('Source contract is not verified')));
    assert.ok(activation.blockers.some(b => b.includes('Portal terms must be reviewed')));
    assert.strictEqual(updated.isEffectivelyActive(), false);
});

test('Area 1.2: Attempt to enable or schedule source while external criteria unmet is strictly blocked with ACTIVATION_LOCKED_PHASE3', async () => {
    const setting = await prepareSubmittedSource('GMADA');

    // Approver & Reviewer pass internal review
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'GMADA' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'GMADA' },
        body: { decision: 'APPROVED', expectedEvidenceVersion: setting.evidenceVersion }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);

    const approvedSetting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'GMADA' });
    assert.strictEqual(approvedSetting.reviewStatus, 'APPROVED');

    // Now attempt to enable isEnabled: true via save()
    approvedSetting.isEnabled = true;
    await assert.rejects(
        async () => approvedSetting.save(),
        err => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );

    // Attempt to enable schedulingEnabled: true via save()
    approvedSetting.isEnabled = false;
    approvedSetting.schedulingEnabled = true;
    await assert.rejects(
        async () => approvedSetting.save(),
        err => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );
});

test('Area 1.3: checkInternalMakerCheckerReviewEligibility helper reports canApprove=true when internal review criteria met', async () => {
    const setting = await prepareSubmittedSource('CHD');
    const candidate = {
        ...setting.toObject(),
        permissionStatus: 'GRANTED',
        reviewStatus: 'APPROVED',
        submittedBy: submitterUser._id,
        approvedBy: approverUser._id,
        reviewedBy: reviewerUser._id,
        evidenceVersion: 1
    };

    const result = checkInternalMakerCheckerReviewEligibility(candidate);
    assert.strictEqual(result.canApprove, true);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.blockers.length, 0);
});

// ============================================================
// AREA 2: MAKER-CHECKER RBAC AND DISTINCT USERS ENFORCEMENT
// ============================================================

test('Area 2.1: Submitter cannot approve (403 SELF_APPROVAL_PROHIBITED)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: submitterUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);

    assert.strictEqual(recRes.statusCode, 403);
    assert.strictEqual(recRes.data.code, 'SELF_APPROVAL_PROHIBITED');
});

test('Area 2.2: Submitter cannot review/approve (403 MAKER_CHECKER_VIOLATION)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // Record approver
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // Submitter attempts to review
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: submitterUser,
        params: { authorityCode: 'HSVP' },
        body: { decision: 'APPROVED', expectedEvidenceVersion: setting.evidenceVersion }
    }, revRes);

    assert.strictEqual(revRes.statusCode, 403);
    assert.strictEqual(revRes.data.code, 'MAKER_CHECKER_VIOLATION');
});

test('Area 2.3: Approver cannot review their own approval (403 MAKER_CHECKER_VIOLATION)', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: setting.evidenceVersion }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // Approver attempts to review
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { decision: 'APPROVED', expectedEvidenceVersion: setting.evidenceVersion }
    }, revRes);

    assert.strictEqual(revRes.statusCode, 403);
    assert.strictEqual(revRes.data.code, 'MAKER_CHECKER_VIOLATION');
});

test('Area 2.4: Non-canonical organization user rejected by verifyMakerCheckerUsers', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: nonCanonicalUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: nonCanonicalUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: 1
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: nonCanonicalUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('different organization') || check.reason.includes('canonical organization'));
});

test('Area 2.5: Inactive reviewer user rejected by verifyMakerCheckerUsers', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: inactiveUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: inactiveUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: 1
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: inactiveUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('inactive or suspended'));
});

// ============================================================
// AREA 3: EVIDENCE VERSION BINDING AND ANTI-REPLAY PROTECTION
// ============================================================

test('Area 3.1: recordSourceApprover with mismatched expectedEvidenceVersion returns 409 STALE_EVIDENCE_VERSION', async () => {
    const setting = await prepareSubmittedSource('HSVP');
    assert.strictEqual(setting.evidenceVersion, 2);

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { expectedEvidenceVersion: 99 } // Stale version
    }, recRes);

    assert.strictEqual(recRes.statusCode, 409);
    assert.strictEqual(recRes.data.code, 'STALE_EVIDENCE_VERSION');
});

test('Area 3.2: reviewSourceApproval with mismatched expectedEvidenceVersion returns 409 STALE_EVIDENCE_VERSION', async () => {
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
        body: { decision: 'APPROVED', expectedEvidenceVersion: 99 } // Mismatch
    }, revRes);

    assert.strictEqual(revRes.statusCode, 409);
    assert.strictEqual(revRes.data.code, 'STALE_EVIDENCE_VERSION');
});

test('Area 3.3: reviewSourceApproval missing expectedEvidenceVersion returns 422 EVIDENCE_VERSION_REQUIRED', async () => {
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
        body: { decision: 'APPROVED' } // Missing expectedEvidenceVersion
    }, revRes);

    assert.strictEqual(revRes.statusCode, 422);
    assert.strictEqual(revRes.data.code, 'EVIDENCE_VERSION_REQUIRED');
});

test('Area 3.4: verifyMakerCheckerUsers rejects audit evidence missing metadata.evidenceVersion', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id
            // missing evidenceVersion!
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('AuditLog record metadata is missing required evidenceVersion'));
});

test('Area 3.5: verifyMakerCheckerUsers rejects audit evidence replay with mismatched evidenceVersion', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: 1 // Old version
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 2 // Attempting to use v1 audit to approve v2 state
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('does not match expected evidenceVersion') || check.reason.includes('Replay of stale audit evidence rejected'));
});

// ============================================================
// AREA 4: MANDATORY AUDIT IDENTITY AND STRUCTURAL INTEGRITY
// ============================================================

test('Area 4.1: AuditLog record missing actorId fails maker-checker verification', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: null, // Missing!
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: 1
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required actorId'));
});

test('Area 4.2: AuditLog record missing userId fails maker-checker verification', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: null, // Missing!
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: 1
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required userId'));
});

test('Area 4.3: AuditLog metadata missing submittedBy fails maker-checker verification', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            // missing submittedBy!
            evidenceVersion: 1
        },
        description: 'Maker-checker audit event'
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: auditEntry._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: setting._id,
        evidenceVersion: 1
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing required submittedBy'));
});

// ============================================================
// AREA 5: MONGOOSE QUERY MUTATION AND OPERATOR PROTECTIONS
// ============================================================

test('Area 5.1: $unset on protected fields rejected with PROTECTED_FIELD_UNSET_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $unset: { reviewStatus: '' } }
            );
        },
        err => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UNSET_PROHIBITED');
            return true;
        }
    );
});

test('Area 5.2: $rename on protected fields rejected with PROTECTED_FIELD_RENAME_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $rename: { reviewStatus: 'reviewStatusOld' } }
            );
        },
        err => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_RENAME_PROHIBITED');
            return true;
        }
    );
});

test('Area 5.3: Arithmetic operator $inc on protected fields rejected with PROTECTED_FIELD_UPDATE_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $inc: { evidenceVersion: 1 } }
            );
        },
        err => {
            assert.strictEqual(err.code, 'PROTECTED_FIELD_UPDATE_PROHIBITED');
            return true;
        }
    );
});

test('Area 5.4: Dotted path update modifying identityRequirements.verified rejected when activation criteria unmet', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { 'identityRequirements.verified': true, isEnabled: true } }
            );
        },
        err => {
            assert.ok(err.code === 'ACTIVATION_LOCKED_PHASE3' || err.code === 'MAKER_CHECKER_APPROVAL_REJECTED');
            return true;
        }
    );
});

test('Area 5.5: replaceOne and findOneAndReplace rejected with REPLACEMENT_PROHIBITED', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.replaceOne(
                { _id: setting._id, tenantId: testTenantId },
                { tenantId: testTenantId, authorityCode: 'HSVP', isEnabled: true }
            );
        },
        err => {
            assert.strictEqual(err.code, 'REPLACEMENT_PROHIBITED');
            return true;
        }
    );

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndReplace(
                { _id: setting._id, tenantId: testTenantId },
                { tenantId: testTenantId, authorityCode: 'HSVP', isEnabled: true }
            );
        },
        err => {
            assert.strictEqual(err.code, 'REPLACEMENT_PROHIBITED');
            return true;
        }
    );
});

// ============================================================
// AREA 6: BULKWRITE INTEGRITY AND OPERATOR PROTECTIONS
// ============================================================

test('Area 6.1: bulkWrite replaceOne rejected with DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    replaceOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        replacement: { tenantId: testTenantId, authorityCode: 'HSVP', isEnabled: true }
                    }
                }
            ]);
        },
        err => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            return true;
        }
    );
});

test('Area 6.2: bulkWrite with $rename or $unset on protected fields rejected with DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        update: { $unset: { reviewStatus: '' } }
                    }
                }
            ]);
        },
        err => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            return true;
        }
    );
});

test('Area 6.3: Canonical ensureDefaults() bulkWrite passes and initializes documents safely', async () => {
    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const settings = await AuthoritySourceSettings.find({ tenantId: testTenantId });
    assert.strictEqual(settings.length, 3);
    for (const s of settings) {
        assert.strictEqual(s.isEnabled, false);
        assert.strictEqual(s.schedulingEnabled, false);
        assert.strictEqual(s.reviewStatus, 'UNDER_REVIEW');
        assert.strictEqual(s.permissionStatus, 'GRANTED');
    }
});

// ============================================================
// AREA 7: TRANSACTION SAFETY AND ATOMICITY
// ============================================================

test('Area 7.1: Atomic rejection: reviewSourceApproval decision=REJECTED commits state and AuditLog atomically', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'REJECTED',
            expectedEvidenceVersion: setting.evidenceVersion,
            notes: 'Contract details unclear'
        }
    }, revRes);

    assert.strictEqual(revRes.statusCode, 200);
    assert.strictEqual(revRes.data.data.reviewStatus, 'REJECTED');
    assert.strictEqual(revRes.data.data.permissionStatus, 'NOT_OBTAINED');

    // AuditLog entry exists with REJECTED
    const audit = await AuditLog.findOne({
        targetId: setting._id,
        eventType: 'authority_source_approval_reviewed'
    });
    assert.ok(audit);
    assert.strictEqual(audit.metadata?.decision, 'REJECTED');
    assert.strictEqual(String(audit.actorId), String(reviewerUser._id));
});

test('Area 7.2: Fail-closed transaction requirement check in production environment', async () => {
    const matrix = getEnvironmentDecisionMatrix();
    const prodEntry = matrix.find(e => e.label === 'production');
    assert.strictEqual(prodEntry.requiresTransactions, true);
    assert.strictEqual(prodEntry.writesAllowed, false);
    assert.strictEqual(prodEntry.stagingDbRequired, false);

    assert.strictEqual(classifyEnvironment('production'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('prod'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('development'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('test'), 'NON_PRODUCTION');
});

// ============================================================
// AREA 8: CITIZEN PII MINIMIZATION
// ============================================================

test('Area 8.1: maskScalarPII masks Indian PAN card numbers correctly', () => {
    const sample = 'Attestation document ABCDE1234F verified by broker';
    const masked = maskScalarPII(sample);
    assert.ok(!masked.includes('ABCDE1234F'));
    assert.ok(masked.includes('[PAN_MINIMIZED]'));
});

test('Area 8.2: maskScalarPII masks Indian Aadhaar numbers correctly', () => {
    const sample1 = 'Citizen Aadhaar 1234 5678 9012 provided';
    const sample2 = 'Aadhaar 123456789012 on record';
    assert.ok(maskScalarPII(sample1).includes('[AADHAAR_MINIMIZED]'));
    assert.ok(maskScalarPII(sample2).includes('[AADHAAR_MINIMIZED]'));
});

test('Area 8.3: maskScalarPII masks residential addresses correctly', () => {
    const sample = 'Resident at House no. 42, Sector 17, Chandigarh';
    const masked = maskScalarPII(sample);
    assert.ok(!masked.includes('House no. 42'));
    assert.ok(masked.includes('[ADDRESS_MINIMIZED]'));
});

test('Area 8.4: redactSensitive redacts citizen PII keys in metadata objects', () => {
    const payload = {
        authorityCode: 'HSVP',
        citizenName: 'Ramesh Kumar',
        pan: 'ABCDE1234F',
        aadhaar: '123456789012',
        address: 'House 10, Sector 12, Panchkula'
    };
    const redacted = redactSensitive(payload);
    assert.strictEqual(redacted.citizenName, '[PII_MINIMIZED]');
    assert.strictEqual(redacted.pan, '[PII_MINIMIZED]');
    assert.strictEqual(redacted.aadhaar, '[PII_MINIMIZED]');
    assert.strictEqual(redacted.address, '[PII_MINIMIZED]');
    assert.strictEqual(redacted.authorityCode, 'HSVP');
});
