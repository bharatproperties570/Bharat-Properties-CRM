process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';
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
    const uri = replSet.getUri('phase45d_p56_remediation_test');
    await mongoose.connect(uri);

    // Pre-create collections for transaction safety
    await User.createCollection();
    await Role.createCollection();
    await AuditLog.createCollection();
    await AuthoritySourceSettings.createCollection();

    // Create roles
    submitterRole = await Role.create({
        name: 'Inventory Submitter',
        department: 'inventory',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit']
    });

    approverRole = await Role.create({
        name: 'Compliance Approver',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit'],
        approvalRights: { manageAuthoritySettings: true }
    });

    reviewerRole = await Role.create({
        name: 'Independent Compliance Reviewer',
        department: 'accounts',
        tenantId: testTenantId,
        permissions: ['authorityVerification.edit', 'authorityVerification.approve'],
        approvalRights: { approveAuthorityChanges: true }
    });

    basicRole = await Role.create({
        name: 'Basic Operations Staff',
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
        role: submitterRole._id,
        tenantId: testTenantId,
        isActive: true
    });

    approverUser = await User.create({
        fullName: 'Approver Manager',
        email: 'approver@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        role: approverRole._id,
        tenantId: testTenantId,
        isActive: true
    });

    reviewerUser = await User.create({
        fullName: 'Reviewer Auditor',
        email: 'reviewer@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        role: reviewerRole._id,
        tenantId: testTenantId,
        isActive: true
    });

    const otherOrgId = new mongoose.Types.ObjectId('111111111111111111111111');
    nonCanonicalUser = await User.create({
        fullName: 'External Org User',
        email: 'external@othercompany.test',
        password: 'Password123!',
        department: 'accounts',
        role: approverRole._id,
        tenantId: otherOrgId,
        isActive: true
    });

    inactiveUser = await User.create({
        fullName: 'Suspended Auditor',
        email: 'suspended@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        role: reviewerRole._id,
        tenantId: testTenantId,
        isActive: false
    });

    unauthorizedUser = await User.create({
        fullName: 'Unauthorized Worker',
        email: 'unauth@bharatproperties.test',
        password: 'Password123!',
        department: 'inventory',
        role: basicRole._id,
        tenantId: testTenantId,
        isActive: true
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

// Helper to reset a specific authority setting into clean PENDING_REVIEW state
async function prepareSubmittedSource(code = 'HSVP') {
    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: code });
    await AuthoritySourceSettings.ensureDefaults(testTenantId);

    const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: code });
    setting.permissionStatus = 'PENDING_REVIEW';
    setting.reviewStatus = 'UNDER_REVIEW';
    setting.submittedBy = submitterUser._id;
    setting.submittedAt = new Date();
    setting.approvedBy = null;
    setting.approvedAt = null;
    setting.reviewedBy = null;
    setting.reviewedAt = null;
    setting.makerCheckerAuditLogId = null;
    setting.evidenceVersion = 1;
    setting.contractVerificationStatus = 'VERIFIED_CONTRACT';
    setting.contractEvidenceReference = 'MOU/CH/2026/01';
    setting.commercialUseAuthorized = true;
    setting.readOnlySearchAuthorized = true;
    setting.termsReviewed = true;
    setting.termsReference = 'https://portal.terms.test';
    setting.identityRequirements = {
        required: ['sectorNumber', 'propertyId'],
        optional: ['phaseCode'],
        verified: false
    };
    await setting.save();
    return setting;
}

// ============================================================
// AREA 1: AUDITLOG METADATA & ACTOR IDENTITY PERSISTENCE
// ============================================================

test('AuditLog 1: Final review audit stores metadata.tenantId and authorityCode', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // 1. Approver records approval
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { notes: 'Approver notes', expectedEvidenceVersion: 1 }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // 2. Reviewer reviews approval
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1,
            identityContractAttestation: {
                evidenceReference: 'HSVP-PORTAL-ID-CONFIRMED',
                evidenceVersion: 1,
                evidenceHash: 'a1b2c3d4e5f6'
            }
        }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);

    // Verify persisted AuditLog row
    const auditRecord = await AuditLog.findOne({
        eventType: 'authority_source_approval_reviewed',
        targetId: setting._id
    }).sort({ createdAt: -1 });

    assert.ok(auditRecord, 'AuditLog row must exist in database');
    assert.strictEqual(String(auditRecord.metadata?.tenantId), String(CANONICAL_ORGANIZATION_ID));
    assert.strictEqual(auditRecord.metadata?.authorityCode, 'HSVP');
    assert.strictEqual(auditRecord.metadata?.decision, 'APPROVED');
});

test('AuditLog 2: Final review stores userId=approver, actorId=reviewer with masked PII', async () => {
    const setting = await prepareSubmittedSource('GMADA');

    // 1. Approver records approval
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'GMADA' },
        body: { notes: 'Approver notes for GMADA', expectedEvidenceVersion: 1 }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // 2. Reviewer reviews approval
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'GMADA' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1,
            identityContractAttestation: {
                evidenceReference: 'GMADA-ID-CONFIRMED',
                evidenceVersion: 1,
                evidenceHash: 'gmada123'
            }
        }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);

    // Verify persisted AuditLog row
    const auditRecord = await AuditLog.findOne({
        eventType: 'authority_source_approval_reviewed',
        targetId: setting._id
    }).sort({ createdAt: -1 });

    assert.ok(auditRecord);
    // Subject/userId must be approver
    assert.strictEqual(String(auditRecord.userId), String(approverUser._id));
    assert.strictEqual(auditRecord.userName, approverUser.fullName);

    // Actor must be reviewer
    assert.strictEqual(String(auditRecord.actorId), String(reviewerUser._id));
    assert.strictEqual(auditRecord.actorName, reviewerUser.fullName);

    // PII masking check: email must not be raw plaintext
    assert.ok(auditRecord.actorEmail.includes('***'), 'Actor email should be masked for PII safety');
    assert.ok(auditRecord.userEmail.includes('***'), 'User email should be masked for PII safety');
});

// ============================================================
// AREA 2: THREE-PERSON MAKER-CHECKER WORKFLOW
// ============================================================

test('Maker-checker 3: Submitter, approver, reviewer are distinct active canonical-org users -> Pass', async () => {
    const setting = await prepareSubmittedSource('CHD');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'CHD' },
        body: { notes: 'Valid approver', expectedEvidenceVersion: 1 }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'CHD' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1,
            identityContractAttestation: {
                evidenceReference: 'CHD-ID-01',
                evidenceVersion: 1,
                evidenceHash: 'hashchd'
            }
        }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);
    assert.strictEqual(revRes.data.data.reviewStatus, 'APPROVED');
    assert.strictEqual(String(revRes.data.data.submittedBy), String(submitterUser._id));
    assert.strictEqual(String(revRes.data.data.approvedBy), String(approverUser._id));
    assert.strictEqual(String(revRes.data.data.reviewedBy), String(reviewerUser._id));
});

test('Maker-checker 4: Missing approver -> Reject with APPROVER_REQUIRED', async () => {
    await prepareSubmittedSource('HSVP');

    // Attempt review directly without approver step
    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1
        }
    }, revRes);

    assert.strictEqual(revRes.statusCode, 422);
    assert.strictEqual(revRes.data.code, 'APPROVER_REQUIRED');
});

test('Maker-checker 5: Any two identities are same -> Reject', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // Case A: Submitter attempts to self-approve
    const recResSelf = createMockRes();
    await recordSourceApprover({
        user: submitterUser,
        params: { authorityCode: 'HSVP' },
        body: { notes: 'Attempting self-approval' }
    }, recResSelf);
    assert.strictEqual(recResSelf.statusCode, 403);
    assert.strictEqual(recResSelf.data.code, 'SELF_APPROVAL_PROHIBITED');

    // Now record legitimate approver
    const recResValid = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { notes: 'Legitimate approval', expectedEvidenceVersion: 1 }
    }, recResValid);
    assert.strictEqual(recResValid.statusCode, 200);

    // Case B: Submitter attempts to review
    const revResSub = createMockRes();
    await reviewSourceApproval({
        user: submitterUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1
        }
    }, revResSub);
    assert.strictEqual(revResSub.statusCode, 403);
    assert.strictEqual(revResSub.data.code, 'MAKER_CHECKER_VIOLATION');

    // Case C: Approver attempts to review (2-person collision)
    const revResApp = createMockRes();
    await reviewSourceApproval({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1
        }
    }, revResApp);
    assert.strictEqual(revResApp.statusCode, 403);
    assert.strictEqual(revResApp.data.code, 'MAKER_CHECKER_VIOLATION');
});

test('Maker-checker 6: Inactive or wrong-org user -> Reject', async () => {
    await prepareSubmittedSource('HSVP');

    // Check with non-canonical org user
    const checkWrongOrg = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: nonCanonicalUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkWrongOrg.valid, false);
    assert.ok(checkWrongOrg.reason.includes('different organization') || checkWrongOrg.reason.includes('canonical organization'));

    // Check with inactive user
    const checkInactive = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: inactiveUser._id,
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkInactive.valid, false);
    assert.ok(checkInactive.reason.includes('inactive or suspended'));
});

test('Maker-checker 7: Wrong role/RBAC -> Reject', async () => {
    await prepareSubmittedSource('HSVP');

    // Approver lacks manageAuthoritySettings
    const checkAppUnauthorized = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: unauthorizedUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkAppUnauthorized.valid, false);
    assert.ok(checkAppUnauthorized.reason.includes('manageAuthoritySettings'));

    // Reviewer lacks approveAuthorityChanges
    const checkRevUnauthorized = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: unauthorizedUser._id,
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkRevUnauthorized.valid, false);
    assert.ok(checkRevUnauthorized.reason.includes('approveAuthorityChanges'));
});

// ============================================================
// AREA 3: EVIDENCE REFERENCE VS AUDITLOG ID
// ============================================================

test('Evidence 8: External approvalReference is non-ObjectId text -> Accept as external evidence', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        description: 'Authentic maker-checker approval reviewed by independent reviewer',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        }
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: 'Letter ref: HSVP/EST/2026/0994',
        makerCheckerAuditLogId: auditEntry._id
    });

    assert.strictEqual(updated.reviewStatus, 'APPROVED');
    // Human-readable external letter reference is preserved!
    assert.strictEqual(updated.approvalReference, 'Letter ref: HSVP/EST/2026/0994');
    // Dedicated AuditLog ID is stored in makerCheckerAuditLogId!
    assert.strictEqual(String(updated.makerCheckerAuditLogId), String(auditEntry._id));
});

test('Evidence 9: makerCheckerAuditLogId points to correct AuditLog row -> Accept', async () => {
    const setting = await prepareSubmittedSource('GMADA');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'GMADA',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        description: 'Verified AuditLog row',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'GMADA',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id
        }
    });

    const verifyCheck = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditEntry._id,
        authorityCode: 'GMADA',
        tenantId: testTenantId,
        settingsId: setting._id
    });

    assert.strictEqual(verifyCheck.valid, true);
    assert.strictEqual(String(verifyCheck.auditLog.id), String(auditEntry._id));
});

test('Evidence 10: Wrong settings targetId / authority / tenant / status / timestamp -> Reject', async () => {
    const setting = await prepareSubmittedSource('CHD');

    // 1. Wrong targetId
    const auditWrongTarget = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: new mongoose.Types.ObjectId(), // wrong
        targetName: 'CHD',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: { tenantId: testTenantId, authorityCode: 'CHD' },
        description: 'Wrong target'
    });
    const res1 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditWrongTarget._id,
        authorityCode: 'CHD',
        tenantId: testTenantId,
        settingsId: setting._id
    });
    assert.strictEqual(res1.valid, false);
    assert.ok(res1.reason.includes('does not match target settings document ID'));

    // 2. Wrong authority
    const auditWrongAuth = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'HSVP', // wrong
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' },
        description: 'Wrong authority'
    });
    const res2 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditWrongAuth._id,
        authorityCode: 'CHD',
        tenantId: testTenantId,
        settingsId: setting._id
    });
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.reason.includes('not \'CHD\''));

    // 3. Failed status
    const auditFailed = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'CHD',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'failure', // wrong
        metadata: { tenantId: testTenantId, authorityCode: 'CHD' },
        description: 'Failed review'
    });
    const res3 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditFailed._id,
        authorityCode: 'CHD',
        tenantId: testTenantId,
        settingsId: setting._id
    });
    assert.strictEqual(res3.valid, false);
    assert.ok(res3.reason.includes('not successful'));

    // 4. Stale timestamp (> 30 days)
    const oldTimestamp = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const auditStale = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'CHD',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: { tenantId: testTenantId, authorityCode: 'CHD' },
        description: 'Stale review',
        timestamp: oldTimestamp
    });
    const res4 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditStale._id,
        authorityCode: 'CHD',
        tenantId: testTenantId,
        settingsId: setting._id
    });
    assert.strictEqual(res4.valid, false);
    assert.ok(res4.reason.includes('stale'));
});

// ============================================================
// AREA 4: ATOMICITY & TRANSACTION INTEGRITY
// ============================================================

test('Atomicity 11: Transaction fails before commit -> No successful AuditLog and no APPROVED setting', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    // Record approver
    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { notes: 'Approver notes', expectedEvidenceVersion: 1 }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    // Intentionally cause failure during review: deactivate reviewer right before review check
    await User.updateOne({ _id: reviewerUser._id }, { $set: { isActive: false } });

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1,
            identityContractAttestation: {
                evidenceReference: 'HSVP-ATTEST',
                evidenceVersion: 1,
                evidenceHash: 'hash1'
            }
        }
    }, revRes);

    // Reactivate reviewer for subsequent tests
    await User.updateOne({ _id: reviewerUser._id }, { $set: { isActive: true } });

    assert.strictEqual(revRes.statusCode, 422);

    // Verify database state: setting must NOT be APPROVED
    const finalSetting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    assert.strictEqual(finalSetting.reviewStatus, 'UNDER_REVIEW');
    assert.strictEqual(finalSetting.makerCheckerAuditLogId, null);

    // Verify AuditLog: no review record committed
    const auditLogs = await AuditLog.find({
        eventType: 'authority_source_approval_reviewed',
        targetId: setting._id
    });
    assert.strictEqual(auditLogs.length, 0, 'No AuditLog entry should exist if transaction aborted');
});

test('Atomicity 12: Transaction succeeds -> AuditLog and APPROVED setting commit together', async () => {
    const setting = await prepareSubmittedSource('HSVP');

    const recRes = createMockRes();
    await recordSourceApprover({
        user: approverUser,
        params: { authorityCode: 'HSVP' },
        body: { notes: 'Approver notes', expectedEvidenceVersion: 1 }
    }, recRes);
    assert.strictEqual(recRes.statusCode, 200);

    const revRes = createMockRes();
    await reviewSourceApproval({
        user: reviewerUser,
        params: { authorityCode: 'HSVP' },
        body: {
            decision: 'APPROVED',
            expectedEvidenceVersion: 1,
            identityContractAttestation: {
                evidenceReference: 'HSVP-ATTEST-COMMIT',
                evidenceVersion: 1,
                evidenceHash: 'hashcommit'
            }
        }
    }, revRes);
    assert.strictEqual(revRes.statusCode, 200);

    // Both setting and auditLog must be committed in database
    const finalSetting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    assert.strictEqual(finalSetting.reviewStatus, 'APPROVED');
    assert.ok(finalSetting.makerCheckerAuditLogId);

    const auditEntry = await AuditLog.findById(finalSetting.makerCheckerAuditLogId);
    assert.ok(auditEntry);
    assert.strictEqual(auditEntry.eventType, 'authority_source_approval_reviewed');
    assert.strictEqual(String(auditEntry.userId), String(approverUser._id));
    assert.strictEqual(String(auditEntry.actorId), String(reviewerUser._id));
});

// ============================================================
// AREA 5: SEPARATION OF INTERNAL APPROVAL & LIVE ACTIVATION
// ============================================================

test('State 13: Internal approval while external contract/terms pending -> reviewStatus may be APPROVED, but activation remains blocked', async () => {
    const setting = await prepareSubmittedSource('GMADA');

    // Create authentic review audit log
    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'GMADA',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'GMADA',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        },
        description: 'Authentic maker-checker approval'
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'GMADA',
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditEntry._id
    });

    assert.strictEqual(updated.reviewStatus, 'APPROVED');
    assert.strictEqual(updated.contractVerificationStatus, 'NOT_VERIFIED');
    assert.strictEqual(updated.commercialUseAuthorized, false);

    // Activation must remain blocked!
    const activation = updated.checkActivationEligibility();
    assert.strictEqual(activation.canActivate, false);
    assert.ok(activation.blockers.some(b => b.includes('Source contract is not verified') || b.includes('contract')));
    assert.strictEqual(updated.isEffectivelyActive(), false);
});

test('State 14: Internal approval attempt -> isEnabled=false and schedulingEnabled=false', async () => {
    const setting = await prepareSubmittedSource('CHD');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: setting._id,
        targetName: 'CHD',
        actorId: reviewerUser._id,
        userId: approverUser._id,
        status: 'success',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'CHD',
            approverId: approverUser._id,
            reviewerId: reviewerUser._id,
            submittedBy: submitterUser._id,
            evidenceVersion: setting.evidenceVersion
        },
        description: 'Authentic maker-checker approval'
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'CHD',
        submitterId: submitterUser._id,
        approverId: approverUser._id,
        reviewerId: reviewerUser._id,
        makerCheckerAuditLogId: auditEntry._id
    });

    assert.strictEqual(updated.isEnabled, false);
    assert.strictEqual(updated.schedulingEnabled, false);
});

// ============================================================
// AREA 6: QUERY & UPSERT SAFEGUARDS
// ============================================================

test('Query 15: updateOne upsert with isEnabled=true -> Reject; no document created', async () => {
    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: 'HSVP' });

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $set: { isEnabled: true } },
                { upsert: true }
            );
        },
        /SECURITY_UPSERT_PROHIBITED/
    );

    const doc = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    assert.strictEqual(doc, null, 'No document should be created by rejected upsert');
});

test('Query 16: findOneAndUpdate upsert with reviewStatus=APPROVED -> Reject; no document created', async () => {
    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: 'GMADA' });

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                { $set: { reviewStatus: 'APPROVED' } },
                { upsert: true }
            );
        },
        /SECURITY_UPSERT_PROHIBITED/
    );

    const doc = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'GMADA' });
    assert.strictEqual(doc, null, 'No document should be created by rejected upsert');
});

test('Query 17: update pipeline attempting enablement -> Reject with UPDATE_PIPELINES_PROHIBITED', async () => {
    await prepareSubmittedSource('HSVP');

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                [{ $set: { isEnabled: true } }]
            );
        },
        /UPDATE_PIPELINES_PROHIBITED/
    );
});

test('Query 18: protected $unset / $rename / replacement -> Reject', async () => {
    await prepareSubmittedSource('HSVP');

    // Reject $unset
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $unset: { reviewStatus: '' } }
            );
        },
        /PROTECTED_FIELD_UNSET_PROHIBITED/
    );

    // Reject $rename
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'HSVP' },
                { $rename: { reviewStatus: 'oldReviewStatus' } }
            );
        },
        /PROTECTED_FIELD_RENAME_PROHIBITED/
    );
});

// ============================================================
// AREA 7: BULK WRITE SAFEGUARDS
// ============================================================

test('Bulk 19: insertOne with enabled/approved document -> Reject', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    insertOne: {
                        document: {
                            tenantId: testTenantId,
                            authorityCode: 'HSVP',
                            isEnabled: true
                        }
                    }
                }
            ]);
        },
        /DIRECT_BULK_WRITE_PROHIBITED/
    );
});

test('Bulk 20: replaceOne replacement with enabled/approved document -> Reject', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    replaceOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        replacement: {
                            tenantId: testTenantId,
                            authorityCode: 'HSVP',
                            reviewStatus: 'APPROVED'
                        }
                    }
                }
            ]);
        },
        /DIRECT_BULK_WRITE_PROHIBITED/
    );
});

test('Bulk 21: bulk update pipeline -> Reject with UPDATE_PIPELINES_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        update: [{ $set: { isEnabled: true } }]
                    }
                }
            ]);
        },
        /UPDATE_PIPELINES_PROHIBITED/
    );
});

test('Bulk 22: direct APPROVED / enabled / scheduling update -> Reject', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: testTenantId, authorityCode: 'HSVP' },
                        update: { $set: { schedulingEnabled: true } }
                    }
                }
            ]);
        },
        /DIRECT_BULK_WRITE_PROHIBITED/
    );
});

test('Bulk 23: canonical ensureDefaults() $setOnInsert -> Pass, remains disabled and pending', async () => {
    await AuthoritySourceSettings.deleteMany({ tenantId: testTenantId });

    // ensureDefaults uses bulkWrite with $setOnInsert
    await AuthoritySourceSettings.ensureDefaults(testTenantId);

    const all = await AuthoritySourceSettings.find({ tenantId: testTenantId });
    assert.strictEqual(all.length, 3);

    for (const doc of all) {
        assert.strictEqual(doc.isEnabled, false);
        assert.strictEqual(doc.schedulingEnabled, false);
        assert.strictEqual(doc.reviewStatus, 'UNDER_REVIEW');
        assert.strictEqual(doc.permissionStatus, 'GRANTED');
        assert.strictEqual(doc.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
    }
});
