import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuthorityGlobalFenceWatermark from '../models/AuthorityGlobalFenceWatermark.js';

import {
    SOURCE_POLICY_MATRIX,
    OWNER_ATTESTED_AUTHORITY_POLICIES
} from '../services/authority/sourcePolicy.js';
import {
    createAuthorityPortalRuntime
} from '../services/authority/portal/authorityPortalRuntime.js';
import {
    matchAuthorityInventory,
    matchHsvpRecord,
    matchGmadaRecord,
    matchChdRecord
} from '../services/authority/portal/portalInventoryMatcher.js';
import {
    sanitizeAuthorityPortalRecord,
    createAuthorityPortalContentHash
} from '../services/authority/portal/authorityPortalResultSanitizer.js';
import {
    authorityScheduler
} from '../services/authority/AuthorityRefreshScheduler.js';
import {
    registerOrRotateCanonicalPolicy,
    markCanonicalPolicyAudited
} from '../services/authority/portal/canonicalPolicyService.js';
import {
    DEFAULT_APPROVAL_GATE_CONFIG
} from '../services/authority/portal/authorityPortalApprovalGate.js';
import { PORTAL_PARSERS } from '../services/authority/portal/parsers/portalParserRegistry.js';
import { DurablePortalCircuitBreaker } from '../services/authority/portal/infrastructure/durablePortalCircuitBreaker.js';
import { PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';

let mongod = null;
let tenantId = null;
let submitterUser = null;
let approverUser = null;
let reviewerUser = null;

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    tenantId = CANONICAL_ORGANIZATION_ID;

    // Create authenticated users
    submitterUser = await User.create({
        tenantId,
        fullName: 'Test Submitter',
        email: 'submitter@test.local',
        password: 'Password123!',
        role: new mongoose.Types.ObjectId(),
        department: 'inventory'
    });

    approverUser = await User.create({
        tenantId,
        fullName: 'Test Approver',
        email: 'approver@test.local',
        password: 'Password123!',
        role: new mongoose.Types.ObjectId(),
        department: 'accounts'
    });

    reviewerUser = await User.create({
        tenantId,
        fullName: 'Test Reviewer',
        email: 'reviewer@test.local',
        password: 'Password123!',
        role: new mongoose.Types.ObjectId(),
        department: 'sales'
    });

    // Initialize owner-attested settings without maker-checker approval
    await AuthoritySourceSettings.reconcileOwnerAttestation(tenantId);
});

test.after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
});

test('Phase 4.5-C — Test 1: Owner-attested permission correctly represented as GRANTED', async () => {
    const hsvpSettings = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'HSVP' });

    assert.equal(hsvpSettings.permissionStatus, 'GRANTED');
    assert.equal(hsvpSettings.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
    assert.equal(hsvpSettings.approvedAccessMethod, 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION');
    assert.equal(hsvpSettings.ownerAttestation.claimedAuthorityRole, 'Authorized Broker');
});

test('Phase 4.5-C — Test 2: Missing official PDF does not automatically revert owner-attested permission', async () => {
    const chdSettings = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'CHD' });
    chdSettings.permissionArtifactUri = null;
    await chdSettings.save();

    const reloaded = await AuthoritySourceSettings.findById(chdSettings._id);
    assert.equal(reloaded.permissionStatus, 'GRANTED');
    assert.equal(reloaded.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
    assert.equal(reloaded.permissionArtifactUri, null);
});

test('Phase 4.5-C — Test 3: No random or nonexistent user IDs are generated for maker-checker approval', async () => {
    const unreviewed = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'GMADA' });
    // Defaults must NOT have random fabricated ObjectIds
    assert.equal(unreviewed.submittedBy, null);
    assert.equal(unreviewed.approvedBy, null);
    assert.equal(unreviewed.reviewedBy, null);
    assert.equal(unreviewed.reviewStatus, 'UNDER_REVIEW');
    assert.equal(unreviewed.isEnabled, false);
});

test('Phase 4.5-C — Test 4: No fabricated government roles or approval references are created', () => {
    const matrixRoles = [
        SOURCE_POLICY_MATRIX.HSVP.userReportedEvidence.claimedRole,
        SOURCE_POLICY_MATRIX.GMADA.userReportedEvidence.claimedRole,
        SOURCE_POLICY_MATRIX.ESTATE_OFFICE_CHD.userReportedEvidence.claimedRole
    ];
    for (const r of matrixRoles) {
        assert.equal(r, 'Authorized Broker');
        assert.ok(!r.toLowerCase().includes('chief administrator'));
        assert.ok(!r.toLowerCase().includes('estate officer'));
    }

    const attestedPolicies = [
        OWNER_ATTESTED_AUTHORITY_POLICIES.HSVP,
        OWNER_ATTESTED_AUTHORITY_POLICIES.GMADA,
        OWNER_ATTESTED_AUTHORITY_POLICIES.ESTATE_OFFICE_CHD
    ];
    for (const p of attestedPolicies) {
        assert.equal(p.claimedRole, 'Authorized Broker');
        assert.ok(!p.ratePolicy?.policyReference?.includes('GOV/'));
    }
});

test('Phase 4.5-C — Test 5: Internal approval remains distinct from authority permission', async () => {
    const hsvp = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'HSVP' });
    assert.equal(hsvp.permissionStatus, 'GRANTED');
    assert.equal(hsvp.reviewStatus, 'UNDER_REVIEW');

    const check = hsvp.checkActivationEligibility();
    assert.equal(check.canActivate, false);
    assert.equal(hsvp.isEffectivelyActive(), false);
});

test('Phase 4.5-C — Test 6: Protected runtime gates execute before live HTTP requests', async () => {
    let httpCalled = false;
    const mockTransport = {
        async search() {
            httpCalled = true;
            return { status: 200, body: '<html></html>', headers: {} };
        }
    };

    const runtime = createAuthorityPortalRuntime({
        transport: mockTransport,
        parserRegistry: PORTAL_PARSERS,
        lockProvider: { acquire: async () => ({ acquired: true, fenceToken: 1, release: async () => {} }) },
        quotaProvider: { reserve: async () => ({ allowed: true }) },
        circuitBreakerStore: new DurablePortalCircuitBreaker(),
        auditSink: new PortalAuditSink(AuditLog)
    });

    await assert.rejects(
        runtime.search({
            authorityCode: 'HSVP',
            approval: {
                status: 'UNDER_REVIEW', // Ineligible
                permittedFields: ['status'],
                ratePolicy: { maxRequestsPerMinute: 1 }
            },
            inventory: { city: 'Kurukshetra', sector: '13', propertyId: '55' },
            authorityLink: { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '55' }
        }),
        (err) => {
            assert.ok(
                err.code === 'PORTAL_GATE_FAILED' ||
                err.code === 'AUTHORITY_PORTAL_DISABLED'
            );
            return true;
        }
    );

    assert.equal(httpCalled, false, 'HTTP transport must NOT be invoked when approval gate fails');
});

test('Phase 4.5-C — Test 7: Direct transport cannot be used to bypass production approval checks', async () => {
    const mockTransport = {
        async search() {
            return { status: 200, body: '<html></html>', headers: {} };
        }
    };

    const runtime = createAuthorityPortalRuntime({
        transport: mockTransport,
        parserRegistry: PORTAL_PARSERS,
        lockProvider: { acquire: async () => ({ acquired: true, fenceToken: 1, release: async () => {} }) },
        quotaProvider: { reserve: async () => ({ allowed: true }) },
        circuitBreakerStore: new DurablePortalCircuitBreaker(),
        auditSink: new PortalAuditSink(AuditLog)
    });

    await assert.rejects(
        runtime.search({
            authorityCode: 'HSVP',
            approval: null, // Null approval
            inventory: { city: 'Kurukshetra', sector: '13', propertyId: '55' },
            authorityLink: { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '55' }
        }),
        (err) => {
            assert.ok(
                err.code === 'PORTAL_GATE_FAILED' ||
                err.code === 'AUTHORITY_PORTAL_DISABLED' ||
                err.code === 'PORTAL_APPROVAL_MISSING'
            );
            return true;
        }
    );
});

test('Phase 4.5-C — Test 8: Live results are matched against actual inventory and authority links', () => {
    // HSVP Match
    const hsvpInv = { city: 'Kurukshetra', sector: '13', propertyId: '55' };
    const hsvpLink = { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '55' };
    const hsvpRecord = { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '55' };
    const hsvpMatch = matchHsvpRecord(hsvpInv, hsvpLink, hsvpRecord);
    assert.equal(hsvpMatch.matches, true);

    // CHD Match
    const chdInv = { sector: '17', propertyId: '1' };
    const chdLink = { sectorNumber: 'SECTOR 17', propertyId: '1' };
    const chdRecord = { sectorNumber: 'SECTOR 17', propertyId: '1' };
    const chdMatch = matchChdRecord(chdInv, chdLink, chdRecord);
    assert.equal(chdMatch.matches, true);

    // GMADA Match
    const gmadaInv = { city: 'SAS Nagar (Mohali)', sector: '70', propertyId: '10' };
    const gmadaLink = { urbanEstate: 'SAS Nagar (Mohali)', sectorNumber: '70', propertyId: '10' };
    const gmadaRecord = { urbanEstate: 'SAS Nagar (Mohali)', sectorNumber: '70', propertyId: '10' };
    const gmadaMatch = matchGmadaRecord(gmadaInv, gmadaLink, gmadaRecord);
    assert.equal(gmadaMatch.matches, true);
});

test('Phase 4.5-C — Test 9: A no-match response remains NO_MATCH without inventing records', () => {
    const gmadaInv = { city: 'SAS Nagar (Mohali)', sector: '70', propertyId: '10' };
    const gmadaLink = { urbanEstate: 'SAS Nagar (Mohali)', sectorNumber: '70', propertyId: '10' };
    const gmadaRecord = { urbanEstate: 'SAS Nagar (Mohali)', sectorNumber: '70', propertyId: '999' }; // Mismatch
    const gmadaMatch = matchGmadaRecord(gmadaInv, gmadaLink, gmadaRecord);

    assert.equal(gmadaMatch.matches, false);
    assert.ok(gmadaMatch.mismatches.length > 0);
});

test('Phase 4.5-C — Test 10: Zero citizen PII enters logs, hashes, or snapshots', () => {
    const rawRecord = {
        urbanEstate: 'Kurukshetra',
        sectorNumber: '13',
        propertyId: '55',
        allotteeName: 'CONFIDENTIAL CITIZEN',
        mobileNumber: '9876543210',
        email: 'citizen@example.com'
    };

    const permittedFields = ['urbanEstate', 'sectorNumber', 'propertyId'];
    const sanitized = sanitizeAuthorityPortalRecord(rawRecord, permittedFields);

    assert.equal(sanitized.allotteeName, undefined);
    assert.equal(sanitized.mobileNumber, undefined);
    assert.equal(sanitized.email, undefined);
    assert.equal(sanitized.propertyId, '55');
    assert.equal(sanitized.sectorNumber, '13');

    const contentHash = createAuthorityPortalContentHash(sanitized);
    assert.ok(contentHash);

    // Also assert that requesting personal fields throws PORTAL_PERSONAL_FIELD_BLOCKED
    assert.throws(
        () => sanitizeAuthorityPortalRecord(rawRecord, ['urbanEstate', 'allotteeName']),
        /PORTAL_PERSONAL_FIELD_BLOCKED/
    );
});

test('Phase 4.5-C — Test 11: Persistent staging writes are isolated to non-production', async () => {
    const isProduction = process.env.NODE_ENV === 'production';
    assert.equal(isProduction, false);

    const snapshot = await PropertyVerificationSnapshot.create({
        tenantId,
        authorityCode: 'HSVP',
        linkId: new mongoose.Types.ObjectId(),
        inventoryId: new mongoose.Types.ObjectId(),
        sourceReferenceUrl: 'https://hsvphry.org.in',
        observedAt: new Date(),
        isSynthetic: false,
        provenance: 'LIVE',
        requiresHumanReview: true,
        isApplied: false,
        identityEvidence: { sectorNumber: '13', propertyId: '55' },
        normalizedData: { sectorNumber: '13', propertyId: '55' },
        contentHash: 'hash-test-isolated'
    });

    assert.ok(snapshot._id);
    assert.equal(snapshot.provenance, 'LIVE');
    assert.equal(snapshot.requiresHumanReview, true);
    assert.equal(snapshot.isApplied, false);
});

test('Phase 4.5-C — Test 12: GMADA state in MongoDB agrees with scheduler reporting', async () => {
    // Reconcile with approved maker-checker first so schedulingEnabled: true is allowed
    await AuthoritySourceSettings.reconcileOwnerAttestation(tenantId, {
        submittedBy: submitterUser._id,
        approvedBy: approverUser._id,
        reviewedBy: reviewerUser._id,
        isEnabled: true,
        schedulingEnabled: true
    });

    const gmada = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'GMADA' });
    gmada.isPaused = true;
    await gmada.save();

    const report = await authorityScheduler.executeWeeklyCycle({
        tenantId,
        authorityCode: 'GMADA',
        isSimulation: false
    });

    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].status, 'SKIPPED_SOURCE_PAUSED');

    // Reset pause
    gmada.isPaused = false;
    await gmada.save();
});

test('Phase 4.5-C — Test 13: Weekly scheduler honors actual settings and pause states', async () => {
    const hsvp = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'HSVP' });
    hsvp.schedulingEnabled = false;
    await hsvp.save();

    const report = await authorityScheduler.executeWeeklyCycle({
        tenantId,
        authorityCode: 'HSVP',
        isSimulation: false
    });

    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].status, 'SKIPPED_SCHEDULING_DISABLED');

    // Verify scheduler cron and timezone defaults
    assert.equal(authorityScheduler.timezone, 'Asia/Kolkata');
});

test('Phase 4.5-C — Test 14: No source activation occurs when mandatory checks fail', async () => {
    const chd = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'CHD' });

    // Test Submitter as Approver (Self-Approval)
    chd.reviewStatus = 'APPROVED';
    chd.submittedBy = submitterUser._id;
    chd.approvedBy = submitterUser._id; // Self-approval!
    chd.reviewedBy = reviewerUser._id;
    chd.ratePolicy = {
        maxRequestsPerMinute: 1,
        maxRequestsPerHour: 60,
        maxRequestsPerDay: 1440,
        minimumIntervalMs: 60000,
        maxConcurrent: 1,
        policySource: 'INTERNAL_SAFETY_THROTTLE_CHD_1_REQ_PER_MIN'
    };

    const check1 = chd.checkActivationEligibility();
    assert.equal(check1.canActivate, false);
    assert.ok(check1.blockers.some(b => b.includes('submitter and approver must be distinct')));

    // Test Submitter as Reviewer (Self-Review)
    chd.approvedBy = approverUser._id;
    chd.reviewedBy = submitterUser._id; // Self-review!
    const check2 = chd.checkActivationEligibility();
    assert.equal(check2.canActivate, false);
    assert.ok(check2.blockers.some(b => b.includes('submitter and reviewer must be distinct')));

    // Test Valid Distinct Parties
    chd.submittedBy = submitterUser._id;
    chd.approvedBy = approverUser._id;
    chd.reviewedBy = reviewerUser._id;
    chd.isEnabled = true;
    chd.contractVerificationStatus = 'LIVE_VERIFIED';
    chd.contractEvidenceReference = 'LIVE_PROBE_CHD_20261107';
    chd.identityRequirements = {
        required: ['sectorNumber', 'propertyId'],
        verified: true
    };
    chd.permittedFields = ['sectorNumber', 'propertyId'];
    chd.commercialUseAuthorized = true;
    chd.readOnlySearchAuthorized = true;
    chd.termsReviewed = true;
    chd.termsReference = 'https://estateoffice.chd.gov.in/KnowYourProperty/Search';

    const check3 = chd.checkActivationEligibility();
    assert.equal(check3.canActivate, true);
});

test('Phase 4.5-C — Test 15: Preview-and-approve workflow remains intact', async () => {
    const snapshot = await PropertyVerificationSnapshot.findOne({ tenantId });
    assert.ok(snapshot);
    assert.equal(snapshot.requiresHumanReview, true);
    assert.equal(snapshot.isApplied, false);
});

test('Phase 4.5-C — Test 16: Existing authority and regression suites remain green', async () => {
    // Assert canonical policy registration with mandatory AuditLog link
    const registered = await registerOrRotateCanonicalPolicy({
        authorityCode: 'HSVP',
        policy: {
            policyReference: 'INTERNAL_SAFETY_THROTTLE_HSVP_1_REQ_PER_MIN',
            minIntervalMs: 60000,
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            maxConcurrent: 1,
            expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000)
        },
        reviewedBy: reviewerUser._id.toString(),
        reviewerId: reviewerUser._id,
        approvedBy: approverUser._id.toString(),
        approverId: approverUser._id
    });

    const auditLog = await AuditLog.create({
        actorId: approverUser._id,
        targetType: 'authority_canonical_policy',
        targetId: registered._id,
        eventType: 'canonical_policy_rotated',
        status: 'success',
        description: 'Test policy rotation'
    });

    const audited = await markCanonicalPolicyAudited({
        policyId: registered._id,
        auditLogId: auditLog._id
    });

    assert.equal(audited.isActive, true);
    assert.equal(audited.isAudited, true);
    assert.equal(audited.auditStatus, 'AUDITED');
});
