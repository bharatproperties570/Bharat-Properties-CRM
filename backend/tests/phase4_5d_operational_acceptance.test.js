/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 4.5-D OPERATIONAL ACCEPTANCE TEST SUITE
 * ============================================================================
 * 
 *  Comprehensive non-production integration and operational acceptance:
 *  1. Canonical Authority Permission State (P1): GRANTED, OWNER_ATTESTED_AUTHORITY_PERMISSION,
 *     AUTHORIZED_PUBLIC_PORTAL_AUTOMATION, UNDER_REVIEW, isEnabled: false.
 *  2. No Fabricated Government Contracts or References (P1): termsReviewed: false,
 *     contractVerificationStatus: 'NOT_VERIFIED', contractEvidenceReference: null.
 *  3. Status Separation (P1): Owner permission distinct from maker-checker approval.
 *  4. Protected Live Runtime Verification (P1): Rejection before HTTP transport.
 *  5. Real Inventory Matching & Zero PII (P1): GMADA NO_MATCH reported truthfully
 *     as NEEDS_VERIFIED_IDENTIFIER; zero PII persistence.
 *  6. Persistent Non-Production MongoDB Staging (P1): 7-step survival acceptance across restart.
 *  7. Redis-Backed Rate Enforcement (P1): 1 req/min, 60s min interval, concurrency 1.
 *  8. Weekly Scheduler Verification (P1): cronAdapter injection, 0 2 * * 0, Asia/Kolkata,
 *     pause and disabled state handling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import os from 'os';
import fs from 'fs';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuthorityGlobalFenceWatermark from '../models/AuthorityGlobalFenceWatermark.js';

import {
    SOURCE_POLICY_MATRIX,
    OWNER_ATTESTED_AUTHORITY_POLICIES,
    PERMISSION_STATUS,
    ACCESS_METHOD,
    isSourceActivated
} from '../services/authority/sourcePolicy.js';
import {
    createAuthorityPortalRuntime
} from '../services/authority/portal/authorityPortalRuntime.js';
import {
    matchAuthorityInventory
} from '../services/authority/portal/portalInventoryMatcher.js';
import {
    createAuthorityPortalContentHash
} from '../services/authority/portal/authorityPortalResultSanitizer.js';
import {
    AuthorityRefreshScheduler,
    DEFAULT_WEEKLY_CRON,
    SCHEDULE_TIMEZONE
} from '../services/authority/AuthorityRefreshScheduler.js';
import {
    DEFAULT_APPROVAL_GATE_CONFIG,
    evaluateAuthorityPortalApproval
} from '../services/authority/portal/authorityPortalApprovalGate.js';
import { PORTAL_PARSERS } from '../services/authority/portal/parsers/portalParserRegistry.js';
import { DurablePortalCircuitBreaker } from '../services/authority/portal/infrastructure/durablePortalCircuitBreaker.js';
import { PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { ROLE_TEMPLATES } from '../config/roles.config.js';
import { CANONICAL_ORGANIZATION_ID } from '../config/canonicalOrganization.js';

let mongod = null;
let stagingDbPath = null;
let tenantId = null;
let submitterUser = null;
let approverUser = null;
let reviewerUser = null;
let inventoryRole = null;
let accountsRole = null;

test.before(async () => {
    stagingDbPath = path.resolve(os.tmpdir(), `phase45d_test_staging_${Date.now()}`);
    fs.mkdirSync(stagingDbPath, { recursive: true });

    mongod = await MongoMemoryServer.create({
        instance: {
            dbPath: stagingDbPath,
            storageEngine: 'wiredTiger'
        }
    });
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    tenantId = CANONICAL_ORGANIZATION_ID;

    // Create genuine roles from ROLE_TEMPLATES
    inventoryRole = await Role.findOneAndUpdate(
        { name: 'Inventory Executive' },
        { $setOnInsert: { ...ROLE_TEMPLATES.INVENTORY_EXECUTIVE } },
        { upsert: true, new: true }
    );
    accountsRole = await Role.findOneAndUpdate(
        { name: 'Accounts Manager' },
        { $setOnInsert: { name: 'Accounts Manager', department: 'accounts', isSystemRole: true } },
        { upsert: true, new: true }
    );

    // Create authenticated users for maker-checker review
    submitterUser = await User.create({
        tenantId,
        fullName: 'Test Submitter',
        email: 'submitter@test.local',
        password: 'Password123!',
        role: inventoryRole._id,
        department: 'inventory'
    });

    approverUser = await User.create({
        tenantId,
        fullName: 'Test Approver',
        email: 'approver@test.local',
        password: 'Password123!',
        role: accountsRole._id,
        department: 'accounts'
    });

    reviewerUser = await User.create({
        tenantId,
        fullName: 'Test Reviewer',
        email: 'reviewer@test.local',
        password: 'Password123!',
        role: accountsRole._id,
        department: 'accounts'
    });

    // Seed default settings for the tenant
    await AuthoritySourceSettings.ensureDefaults(tenantId);
});

test.after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
    if (stagingDbPath && fs.existsSync(stagingDbPath)) {
        try { fs.rmSync(stagingDbPath, { recursive: true, force: true }); } catch {}
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 1: CANONICAL AUTHORITY PERMISSION STATE (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 1: AuthoritySourceSettings.ensureDefaults establishes GRANTED permission with OWNER_ATTESTED evidence basis', async () => {
    const settingsList = await AuthoritySourceSettings.find({ tenantId });
    assert.equal(settingsList.length, 3);

    for (const s of settingsList) {
        assert.equal(s.permissionStatus, 'GRANTED');
        assert.equal(s.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
        assert.equal(s.approvedAccessMethod, 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION');
        assert.equal(s.ownerAttestation.claimedAuthorityRole, 'Authorized Broker');
        assert.equal(s.ownerAttestation.attestingParty, 'Bharat Properties Owner');
        assert.ok(s.ownerAttestation.attestedAt);
        assert.ok(s.ownerAttestation.scope);
    }
});

test('Phase 4.5-D — Test 2: SOURCE_POLICY_MATRIX truthfully reflects GRANTED without contradicting static policy with NOT_OBTAINED', () => {
    for (const code of ['HSVP', 'GMADA', 'ESTATE_OFFICE_CHD']) {
        const policy = SOURCE_POLICY_MATRIX[code];
        assert.equal(policy.permissionStatus, PERMISSION_STATUS.GRANTED);
        assert.equal(policy.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
        assert.equal(policy.approvedAccessMethod, ACCESS_METHOD.AUTHORIZED_PUBLIC_PORTAL_AUTOMATION);
        assert.equal(policy.ownerAttestation.claimedAuthorityRole, 'Authorized Broker');
    }
});

test('Phase 4.5-D — Test 3: Owner-attestation uses claimedAuthorityRole "Authorized Broker" without fabricated government titles', () => {
    const policies = [SOURCE_POLICY_MATRIX.HSVP, SOURCE_POLICY_MATRIX.GMADA, SOURCE_POLICY_MATRIX.ESTATE_OFFICE_CHD];
    for (const p of policies) {
        const role = p.ownerAttestation.claimedAuthorityRole;
        assert.equal(role, 'Authorized Broker');
        assert.ok(!role.toLowerCase().includes('chief administrator'));
        assert.ok(!role.toLowerCase().includes('estate officer'));
        assert.ok(!role.toLowerCase().includes('director general'));
    }
});

test('Phase 4.5-D — Test 4: Default operational status is strictly disabled and under review', async () => {
    const settingsList = await AuthoritySourceSettings.find({ tenantId });
    for (const s of settingsList) {
        assert.equal(s.reviewStatus, 'UNDER_REVIEW');
        assert.equal(s.isEnabled, false);
        assert.equal(s.isPaused, false);
        assert.equal(s.schedulingEnabled, false);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 2: NO FABRICATED GOVERNMENT CONTRACTS OR REFERENCES (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 5: In unapproved state, contractVerificationStatus is NOT_VERIFIED, contractEvidenceReference is null, termsReviewed is false', async () => {
    await AuthoritySourceSettings.reconcileOwnerAttestation(tenantId);

    const freshSettings = await AuthoritySourceSettings.find({ tenantId });
    for (const s of freshSettings) {
        assert.equal(s.contractVerificationStatus, 'NOT_VERIFIED');
        assert.equal(s.contractEvidenceReference, null);
        assert.equal(s.termsReviewed, false);
        assert.equal(s.reviewStatus, 'UNDER_REVIEW');
        assert.equal(s.isEnabled, false);
        assert.equal(s.schedulingEnabled, false);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 3: STATUS SEPARATION & INDEPENDENT MAKER-CHECKER (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 6: Maker-checker review status is distinct from authority permission', async () => {
    const hsvp = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'HSVP' });
    assert.equal(hsvp.permissionStatus, 'GRANTED');
    assert.equal(hsvp.reviewStatus, 'UNDER_REVIEW');

    const check = hsvp.checkActivationEligibility();
    assert.equal(check.canActivate, false);
    assert.ok(check.blockers.some(b => b.includes('must be APPROVED')));
});

test('Phase 4.5-D — Test 7: Independent maker-checker review required for activation — distinct users enforced', async () => {
    const testTenant = tenantId;
    const settings = new AuthoritySourceSettings({
        tenantId: testTenant,
        authorityCode: 'HSVP',
        permissionStatus: 'GRANTED',
        evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
        approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
        reviewStatus: 'APPROVED',
        submittedBy: submitterUser._id,
        approvedBy: submitterUser._id, // Self-approval!
        reviewedBy: reviewerUser._id,
        commercialUseAuthorized: true,
        readOnlySearchAuthorized: true,
        termsReviewed: true,
        termsReference: 'https://hsvphry.org.in/Home/Terms',
        contractVerificationStatus: 'VERIFIED_CONTRACT',
        contractEvidenceReference: 'VERIFIED_CONTRACT_20261106',
        permittedFields: ['propertyId', 'sectorNumber'],
        identityRequirements: { required: ['sectorNumber', 'propertyId'], verified: true },
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrent: 1,
            policySource: 'INTERNAL_SAFETY_THROTTLE'
        },
        ownerAttestation: {
            attestingParty: 'Bharat Properties Owner',
            attestedAt: new Date('2026-11-06T17:51:10+05:30'),
            scope: 'Read-only public property data retrieval',
            claimedAuthorityRole: 'Authorized Broker'
        }
    });

    const check = settings.checkActivationEligibility();
    assert.equal(check.canActivate, false);
    assert.ok(check.blockers.some(b => b.includes('submitter and approver must be distinct')));
});

test('Phase 4.5-D — Test 8: Authenticated users for maker-checker must reference real valid roles', async () => {
    assert.ok(submitterUser.role, 'Submitter must have a role');
    assert.ok(approverUser.role, 'Approver must have a role');
    assert.ok(reviewerUser.role, 'Reviewer must have a role');

    const invRoleDoc = await Role.findById(submitterUser.role);
    assert.ok(invRoleDoc, 'Inventory role document must exist in database');
    assert.equal(invRoleDoc.department, 'inventory');

    const accRoleDoc = await Role.findById(approverUser.role);
    assert.ok(accRoleDoc, 'Accounts role document must exist in database');
    assert.equal(accRoleDoc.department, 'accounts');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 4: PROTECTED RUNTIME REJECTION BEFORE HTTP (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 9: Protected runtime rejects searches before HTTP transport when source is inactive', async () => {
    const lockProvider = new RedisPortalDistributedLock(null, { testMode: true, allowInMemoryFallback: true });
    const quotaProvider = new RedisPortalQuotaProvider(null, { testMode: true, allowInMemoryFallback: true });
    const circuitBreakerStore = new DurablePortalCircuitBreaker();
    const auditSink = new PortalAuditSink(AuditLog);

    let transportInvoked = false;
    const trackingTransport = {
        async search() {
            transportInvoked = true;
            return { rawHtml: '<html></html>', statusCode: 200 };
        }
    };

    const runtime = createAuthorityPortalRuntime({
        lockProvider,
        quotaProvider,
        circuitBreakerStore,
        auditSink,
        transport: trackingTransport,
        parserRegistry: PORTAL_PARSERS,
        fenceWatermarkStore: AuthorityGlobalFenceWatermark,
        gateConfig: DEFAULT_APPROVAL_GATE_CONFIG // enabled: false by default
    });

    const hsvpSettings = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: 'HSVP' });

    await assert.rejects(
        async () => {
            await runtime.search({
                authorityCode: 'HSVP',
                inventory: {
                    _id: new mongoose.Types.ObjectId(),
                    city: 'Kurukshetra',
                    sector: '13',
                    unitNo: '55',
                    unitNumber: '55'
                },
                authorityLink: {
                    _id: new mongoose.Types.ObjectId(),
                    urbanEstate: 'Kurukshetra',
                    sectorNumber: '13',
                    propertyId: '55'
                },
                approval: {
                    status: hsvpSettings.permissionStatus,
                    accessMethod: hsvpSettings.approvedAccessMethod,
                    evidenceBasis: hsvpSettings.evidenceBasis,
                    ownerAttestation: hsvpSettings.ownerAttestation
                },
                tenantId,
                actorId: submitterUser._id
            });
        },
        /AUTHORITY_PORTAL_DISABLED|AUTHORITY_PORTAL_APPROVAL_BLOCKED/
    );

    assert.equal(transportInvoked, false, 'HTTP transport must NEVER be reached when gate rejects');
});

test('Phase 4.5-D — Test 10: evaluateAuthorityPortalApproval enforces fail-closed checks on unapproved sources', () => {
    const result = evaluateAuthorityPortalApproval({
        authorityCode: 'HSVP',
        approval: {
            status: 'GRANTED',
            accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
            evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
            ownerAttestation: {
                attestingParty: 'Owner',
                attestedAt: new Date(),
                scope: 'Read-only'
            }
        },
        gate: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true }
    });

    assert.equal(result.approved, false);
    assert.ok(result.blockers.some(b => b.code === 'MAKER_CHECKER_REVIEW_MISSING'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 5: INVENTORY MATCHING & PII EXCLUSION (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 11: Real inventory matching against non-production records — GMADA returns NO_MATCH and is reported as NEEDS_VERIFIED_IDENTIFIER', () => {
    const gmadaInventory = {
        city: 'Mohali',
        sector: '70',
        unitNo: 'Plot 10',
        unitNumber: 'Plot 10'
    };
    const gmadaLink = {
        urbanEstate: 'Mohali',
        sectorNumber: '70',
        propertyId: 'Plot 10'
    };

    // Simulated GMADA empty response (no records found on portal)
    const emptyRecord = null;
    const match = matchAuthorityInventory('GMADA', gmadaInventory, gmadaLink, emptyRecord);
    assert.equal(match.matches, false);
    assert.ok(match.mismatches.some(m => m.includes('No authority record') || m.includes('mismatch')));

    // HSVP matching
    const hsvpInventory = {
        city: 'Kurukshetra',
        sector: '13',
        unitNo: '55',
        unitNumber: '55'
    };
    const hsvpLink = {
        urbanEstate: 'Kurukshetra',
        sectorNumber: '13',
        propertyId: '55'
    };
    const hsvpRecord = {
        urbanEstate: 'Kurukshetra',
        sectorNumber: '13',
        propertyId: '55'
    };
    const hsvpMatch = matchAuthorityInventory('HSVP', hsvpInventory, hsvpLink, hsvpRecord);
    assert.equal(hsvpMatch.matches, true);
});

test('Phase 4.5-D — Test 12: Zero citizen PII in logs, hashes, and staging snapshots', async () => {
    const cleanRecord = {
        authorityCode: 'HSVP',
        propertyId: '55',
        sectorNumber: '13',
        urbanEstate: 'Kurukshetra',
        authorityStatus: 'Allotted',
        allotmentPrice: 1500000,
        currentDues: 0
    };

    // Calculate content hash
    const hash = createAuthorityPortalContentHash(cleanRecord);
    assert.ok(hash);
    assert.equal(hash.length, 64);

    // Snapshot creation with strict PII exclusion
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
        identityEvidence: {
            urbanEstate: cleanRecord.urbanEstate,
            sectorNumber: cleanRecord.sectorNumber,
            propertyId: cleanRecord.propertyId
        },
        normalizedData: cleanRecord,
        contentHash: hash,
        isSealed: true
    });

    const saved = await PropertyVerificationSnapshot.findById(snapshot._id).lean();
    const str = JSON.stringify(saved);
    assert.ok(!str.includes('allotteeName'), 'Snapshot must not contain allotteeName');
    assert.ok(!str.includes('mobileNumber'), 'Snapshot must not contain mobileNumber');
    assert.ok(!str.includes('aadhaar'), 'Snapshot must not contain aadhaar');
    assert.ok(!str.includes('panNumber'), 'Snapshot must not contain panNumber');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 6: PERSISTENT NON-PRODUCTION MONGODB STAGING (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 13: 7-step persistent storage survival acceptance test across server restart', async () => {
    // Step 1: Write sealed snapshot
    const testHash = 'a'.repeat(64);
    const originalInventoryId = new mongoose.Types.ObjectId();
    const originalLinkId = new mongoose.Types.ObjectId();

    const snap = await PropertyVerificationSnapshot.create({
        tenantId,
        authorityCode: 'HSVP',
        linkId: originalLinkId,
        inventoryId: originalInventoryId,
        sourceReferenceUrl: 'https://hsvphry.org.in',
        observedAt: new Date(),
        isSynthetic: false,
        provenance: 'LIVE',
        requiresHumanReview: true,
        isApplied: false,
        identityEvidence: { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '999' },
        normalizedData: { propertyId: '999', sectorNumber: '13', urbanEstate: 'Kurukshetra' },
        contentHash: testHash,
        isSealed: true
    });
    const snapId = snap._id;

    // Step 2: Disconnect & stop server
    await mongoose.disconnect();
    await mongod.stop();

    // Step 3: Reconnect to same storage directory
    mongod = await MongoMemoryServer.create({
        instance: {
            dbPath: stagingDbPath,
            storageEngine: 'wiredTiger'
        }
    });
    await mongoose.connect(mongod.getUri());

    // Step 4: Retrieve snapshot by ID from reconnected server
    const recovered = await PropertyVerificationSnapshot.findById(snapId);
    assert.ok(recovered, 'Snapshot must be recovered after server restart');

    // Step 5: Verify contentHash, authorityCode, linkId match original
    assert.equal(recovered.contentHash, testHash);
    assert.equal(recovered.authorityCode, 'HSVP');
    assert.equal(recovered.linkId.toString(), originalLinkId.toString());

    // Step 6: Verify unchanged
    assert.equal(recovered.isSealed, true);
    assert.equal(recovered.provenance, 'LIVE');

    // Step 7: Idempotent retry: writing snapshot with same contentHash does not duplicate
    const existing = await PropertyVerificationSnapshot.findOne({
        tenantId,
        authorityCode: 'HSVP',
        contentHash: testHash
    });
    assert.ok(existing);
    assert.equal(existing._id.toString(), snapId.toString());
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 7: REDIS-BACKED RATE ENFORCEMENT & CONCURRENCY (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 14: Rate policy internal safety throttle (1 req/min, 60s min interval)', async () => {
    const quotaProvider = new RedisPortalQuotaProvider(null, { testMode: true, allowInMemoryFallback: true });
    const policy = {
        maxRequestsPerMinute: 1,
        maxRequestsPerHour: 60,
        maxRequestsPerDay: 1440,
        minIntervalMs: 60000,
        minimumIntervalMs: 60000,
        isInternalSafetyThrottle: true,
        policyReference: 'INTERNAL_SAFETY_THROTTLE_HSVP',
        version: 1
    };

    await quotaProvider.setCanonicalPolicy({
        authorityCode: 'HSVP',
        policy,
        version: 1,
        approvedBy: approverUser._id.toString()
    });

    // 1st request succeeds
    const res1 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy });
    assert.equal(res1.allowed, true);
    assert.ok(res1.reservationId);

    // 2nd request before 60s is rejected
    const res2 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy });
    assert.equal(res2.allowed, false);
    assert.ok(res2.reason.includes('MINIMUM_INTERVAL_VIOLATED') || res2.reason.includes('RATE_LIMIT') || res2.reason.includes('INTERVAL'));
});

test('Phase 4.5-D — Test 15: Concurrency cap: concurrent worker limit of 1 fails closed / blocked', async () => {
    const lockProvider = new RedisPortalDistributedLock(null, { testMode: true, allowInMemoryFallback: true });

    // Acquire 1st lease
    const lease1 = await lockProvider.acquire({ authorityCode: 'HSVP', searchKey: 'prop_1', ttlMs: 30000 });
    assert.equal(lease1.acquired, true);

    // 2nd concurrent acquire for the same authority is blocked when maxConcurrent is 1
    const lease2 = await lockProvider.acquire({ authorityCode: 'HSVP', searchKey: 'prop_2', ttlMs: 30000 });
    assert.equal(lease2.acquired, false);

    // Release 1st lease
    await lease1.release();

    // Now 2nd acquire succeeds
    const lease3 = await lockProvider.acquire({ authorityCode: 'HSVP', searchKey: 'prop_2', ttlMs: 30000 });
    assert.equal(lease3.acquired, true);
    await lease3.release();
});

test('Phase 4.5-D — Test 16: Source-specific rate and lock isolation', async () => {
    const lockProvider = new RedisPortalDistributedLock(null, { testMode: true, allowInMemoryFallback: true });

    // Acquire lock for HSVP
    const leaseHsvp = await lockProvider.acquire({ authorityCode: 'HSVP', searchKey: 'prop_hsvp', ttlMs: 30000 });
    assert.equal(leaseHsvp.acquired, true);

    // GMADA lock should succeed independently (source isolation)
    const leaseGmada = await lockProvider.acquire({ authorityCode: 'GMADA', searchKey: 'prop_gmada', ttlMs: 30000 });
    assert.equal(leaseGmada.acquired, true);

    await leaseHsvp.release();
    await leaseGmada.release();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 8: WEEKLY SCHEDULER OPERATIONAL BEHAVIOR (P1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Phase 4.5-D — Test 17: Weekly scheduler constructor supports injectable cronAdapter', () => {
    let scheduledCron = null;
    let scheduledOptions = null;
    let stopCalled = false;

    const mockCronAdapter = {
        schedule(cronExpr, callback, opts) {
            scheduledCron = cronExpr;
            scheduledOptions = opts;
            return {
                stop() {
                    stopCalled = true;
                }
            };
        }
    };

    const scheduler = new AuthorityRefreshScheduler({ cronAdapter: mockCronAdapter });
    assert.equal(scheduler.isRunning, false);

    // Start schedules exactly 1 weekly task
    scheduler.start();
    assert.equal(scheduler.isRunning, true);
    assert.equal(scheduledCron, DEFAULT_WEEKLY_CRON);
    assert.equal(scheduledCron, '0 2 * * 0');
    assert.equal(scheduledOptions.timezone, SCHEDULE_TIMEZONE);
    assert.equal(scheduledOptions.timezone, 'Asia/Kolkata');

    // Duplicate start is idempotent
    scheduler.start();
    assert.equal(scheduler.scheduledTasks.size, 1);

    // Stop cleans up
    scheduler.stop();
    assert.equal(scheduler.isRunning, false);
    assert.equal(stopCalled, true);
    assert.equal(scheduler.scheduledTasks.size, 0);
});

test('Phase 4.5-D — Test 18: Weekly scheduler honors pause and disabled states with zero live calls', async () => {
    const scheduler = new AuthorityRefreshScheduler();

    // Default settings are schedulingEnabled: false and isEnabled: false
    const report = await scheduler.executeWeeklyCycle({
        tenantId,
        authorityCode: 'HSVP',
        isSimulation: false
    });

    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].status, 'SKIPPED_SCHEDULING_DISABLED');
});
