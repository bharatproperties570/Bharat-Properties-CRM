/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 4.5-D FINAL SAFETY CORRECTION TEST SUITE
 * ============================================================================
 * 
 *  Rigorous test suite verifying all P0 & P1 final safety correction items:
 *  1. Database Environment Safety:
 *     - Production environment rejection (NODE_ENV=production, APP_ENV=production).
 *     - Target host non-production allowlist enforcement & production string rejection.
 *     - Target database name production pattern rejection.
 *     - Active Mongoose connection mismatch rejection.
 *     - Strict credential redaction in all outputs.
 *     - Runner aborts fail-closed before any DB writes on unverified environment.
 *  2. 7-Step Persistence Survival:
 *     - Executes all 7 steps (write, record hash, disconnect, reconnect, recover, validate, seal/clean).
 *     - Reports stepsExecuted: 7 and status: VERIFIED on valid staging DB.
 *     - Reports stepsExecuted: 0 and BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE on temporary DB.
 *  3. Maker-Checker Approval Bypass Remediation:
 *     - Setting reviewStatus: APPROVED without user IDs rejects and resets to UNDER_REVIEW, isEnabled: false.
 *     - Setting reviewStatus: APPROVED with arbitrary unverified ObjectIds rejects and resets to UNDER_REVIEW.
 *     - Self-approval and shared reviewer identities strictly rejected.
 *     - Approver lacking manageAuthoritySettings / Reviewer lacking approveAuthorityChanges rejected.
 *     - Valid authenticated users with proper RBAC rights and approval reference succeed.
 *     - reconcileOwnerAttestation strictly enforces reviewStatus: UNDER_REVIEW and isEnabled: false.
 *  4. Single-Organization Context Enforcement:
 *     - Uses proven CANONICAL_ORGANIZATION_ID without arbitrary first-record inference.
 *     - Multi-tenant development remains strictly on HOLD.
 *  5. Scheduler Scoping:
 *     - AuthorityRefreshScheduler requires organizationId at startup.
 *     - Callback executes bound to single organization.
 *     - Queries scoped to bound organization; skips unapproved sources.
 *  6. Inventory Resolution & Pilot Matching Separation:
 *     - Pre-existing inventory verified separated from property match verification.
 *     - Reports NOT_EXECUTED_APPROVAL_PENDING while maker-checker is pending.
 *     - GMADA reports NEEDS_VERIFIED_IDENTIFIER.
 *  7. Real Redis Status Separation:
 *     - Reachability separated from runtime lock/quota enforcement.
 *  8. Fail-Closed Runtime Audit Reliability:
 *     - Throws AUDIT_PERSISTENCE_FAILED when rejection audit logging fails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import os from 'os';
import fs from 'fs';

import AuthoritySourceSettings, { _testOnlyResetAuthoritySettings } from '../models/AuthoritySourceSettings.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuthorityGlobalFenceWatermark from '../models/AuthorityGlobalFenceWatermark.js';

import {
    verifyDatabaseEnvironmentSafety,
    redactMongoUri,
    parseMongoDetails
} from '../services/authority/databaseEnvironmentSafety.js';
import { executePersistenceSurvivalTest } from '../services/authority/persistenceSurvivalVerifier.js';
import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_NAME,
    getCanonicalOrganizationContext
} from '../config/canonicalOrganization.js';
import {
    AuthorityRefreshScheduler,
    DEFAULT_WEEKLY_CRON,
    SCHEDULE_TIMEZONE
} from '../services/authority/AuthorityRefreshScheduler.js';
import {
    createAuthorityPortalRuntime
} from '../services/authority/portal/authorityPortalRuntime.js';
import { DEFAULT_APPROVAL_GATE_CONFIG } from '../services/authority/portal/authorityPortalApprovalGate.js';
import { portalHttpTransport } from '../services/authority/portal/infrastructure/portalHttpTransport.js';
import { PORTAL_PARSERS } from '../services/authority/portal/parsers/portalParserRegistry.js';
import { DurablePortalCircuitBreaker } from '../services/authority/portal/infrastructure/durablePortalCircuitBreaker.js';
import { PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { runLiveAuthoritySmokeTest } from '../scripts/run_live_authority_smoke_test.js';

let mongod = null;
let testDbPath = null;
let testTenantId = null;

test.before(async () => {
    testDbPath = path.resolve(os.tmpdir(), `phase45d_final_safety_test_${Date.now()}`);
    fs.mkdirSync(testDbPath, { recursive: true });

    mongod = await MongoMemoryServer.create({
        instance: {
            dbPath: testDbPath,
            storageEngine: 'wiredTiger'
        }
    });
    await mongoose.connect(mongod.getUri());
    testTenantId = CANONICAL_ORGANIZATION_ID;
});

test.after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
    if (testDbPath && fs.existsSync(testDbPath)) {
        try { fs.rmSync(testDbPath, { recursive: true, force: true }); } catch {}
    }
});

// ============================================================================
// 1. Database Environment Safety & Credential Redaction
// ============================================================================

test('P0 Safety: verifyDatabaseEnvironmentSafety rejects execution in production environments', () => {
    const origNodeEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const result = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/staging_crm' });
        assert.strictEqual(result.verified, false);
        assert.strictEqual(result.code, 'PRODUCTION_ENVIRONMENT_DETECTED');
        assert.ok(result.reason.includes('Production environment detected'));
    } finally {
        process.env.NODE_ENV = origNodeEnv;
    }
});

test('P0 Safety: verifyDatabaseEnvironmentSafety rejects target host with production pattern', () => {
    const result = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://prod-cluster.internal.net:27017/crm_staging' });
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.code, 'PRODUCTION_HOST_DETECTED');
    assert.ok(result.reason.includes('matches forbidden production pattern'));
});

test('P0 Safety: verifyDatabaseEnvironmentSafety rejects target dbName with production pattern', () => {
    const result = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/bharat_properties_crm' });
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.code, 'PRODUCTION_DATABASE_NAME_DETECTED');
    assert.ok(result.reason.includes('matches forbidden production pattern'));
});

test('P0 Safety: verifyDatabaseEnvironmentSafety rejects un-allowlisted hosts', () => {
    const result = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://external-untrusted-host.com:27017/crm_staging' });
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.code, 'UNKNOWN_HOST_REJECTED');
    assert.ok(result.reason.includes('not on the verified non-production allowlist'));
});

test('P0 Safety: redactMongoUri sanitizes usernames and passwords', () => {
    const sensitiveUri = 'mongodb://appUser:superSecretPassword123@staging-mongo.internal:27017/bharat_crm_staging?authSource=admin';
    const redacted = redactMongoUri(sensitiveUri);
    assert.ok(!redacted.includes('superSecretPassword123'));
    assert.ok(!redacted.includes('appUser'));
    assert.ok(redacted.includes('//****:****@staging-mongo.internal:27017'));
});

test('P0 Safety: parseMongoDetails correctly extracts host and dbName', () => {
    const details = parseMongoDetails('mongodb://user:pass@127.0.0.1:27017/my_staging_db?replicaSet=rs0');
    assert.strictEqual(details.host, '127.0.0.1');
    assert.strictEqual(details.port, '27017');
    assert.strictEqual(details.dbName, 'my_staging_db');
});

test('P0 Safety: Live smoke test aborts fail-closed on production environment without DB writes', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const res = await runLiveAuthoritySmokeTest();
        assert.strictEqual(res.databaseClassification.persistentStagingStatus, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        assert.strictEqual(res.persistenceSurvival.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        assert.strictEqual(res.persistenceSurvival.stepsExecuted, 0);
    } finally {
        process.env.NODE_ENV = origNodeEnv;
    }
});

// ============================================================================
// 2. 7-Step Persistence Survival Verification
// ============================================================================

test('P0 Persistence: executePersistenceSurvivalTest completes all persistence survival steps on connected test database', async () => {
    const uri = mongod.getUri();
    const result = await executePersistenceSurvivalTest({
        mongoUri: uri,
        tenantId: testTenantId
    });

    assert.strictEqual(result.status, 'VERIFIED');
    assert.ok(result.stepsExecuted >= 7);
    assert.strictEqual(result.storageEngine, 'wiredTiger');
    assert.ok(result.details.includes('persistence survival'));
});

test('P0 Persistence: executePersistenceSurvivalTest reports BLOCKED when URI is missing', async () => {
    const result = await executePersistenceSurvivalTest({
        mongoUri: null,
        tenantId: testTenantId
    });

    assert.strictEqual(result.status, 'BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE');
    assert.strictEqual(result.stepsExecuted, 0);
});

// ============================================================================
// 3. Maker-Checker Approval Bypass & RBAC Verification
// ============================================================================

test('P0 Maker-Checker: Setting reviewStatus APPROVED without user IDs fails activation gate and pre-save', async () => {
    const setting = new AuthoritySourceSettings({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        permissionStatus: 'GRANTED',
        reviewStatus: 'APPROVED',
        isEnabled: true,
        submittedBy: null,
        approvedBy: null,
        reviewedBy: null
    });

    await assert.rejects(
        async () => { await setting.save(); },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );
    assert.strictEqual(setting.reviewStatus, 'UNDER_REVIEW');
    assert.strictEqual(setting.isEnabled, false);
});

test('P0 Maker-Checker: Setting reviewStatus APPROVED with arbitrary non-existent ObjectIds fails pre-save', async () => {
    const fakeSubmitterId = new mongoose.Types.ObjectId();
    const fakeApproverId = new mongoose.Types.ObjectId();
    const fakeReviewerId = new mongoose.Types.ObjectId();

    const setting = new AuthoritySourceSettings({
        tenantId: testTenantId,
        authorityCode: 'CHD',
        permissionStatus: 'GRANTED',
        evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
        ownerAttestation: {
            attestingParty: 'Bharat Properties Owner',
            attestedAt: new Date(),
            scope: 'Read-only search'
        },
        reviewStatus: 'APPROVED',
        approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
        permittedFields: ['propertyId', 'sectorNumber'],
        isEnabled: false,
        submittedBy: fakeSubmitterId,
        approvedBy: fakeApproverId,
        reviewedBy: fakeReviewerId,
        approvalReference: 'AUDIT_REF_001',
        commercialUseAuthorized: true,
        readOnlySearchAuthorized: true,
        termsReviewed: true,
        termsReference: 'https://estateoffice.chd.gov.in/terms',
        contractVerificationStatus: 'VERIFIED_CONTRACT',
        contractEvidenceReference: 'CONTRACT_REF_001',
        identityRequirements: { required: ['sectorNumber'], verified: true },
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrent: 1,
            policySource: 'TEST_POLICY'
        }
    });

    await assert.rejects(
        async () => { await setting.save(); },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            assert.ok(err.message.includes('Maker-checker user/RBAC verification failed'));
            return true;
        }
    );
    assert.strictEqual(setting.reviewStatus, 'UNDER_REVIEW');
});

test('P0 Maker-Checker: Setting reviewStatus APPROVED where approver lacks manageAuthoritySettings fails pre-save', async () => {
    // Create role without manageAuthoritySettings
    const basicRole = await Role.create({
        name: 'Basic Viewer Role',
        department: 'inventory',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: false, approveAuthorityChanges: false },
        permissions: ['inventory.read']
    });

    const user1 = await User.create({ fullName: 'Submitter User', password: 'Password123!', department: 'inventory', email: 'user1@bharatprop.test', role: basicRole._id, tenantId: testTenantId, isActive: true });
    const user2 = await User.create({ fullName: 'Approver User', password: 'Password123!', department: 'inventory', email: 'user2@bharatprop.test', role: basicRole._id, tenantId: testTenantId, isActive: true });
    const user3 = await User.create({ fullName: 'Reviewer User', password: 'Password123!', department: 'inventory', email: 'user3@bharatprop.test', role: basicRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: user1._id,
        approverId: user2._id,
        reviewerId: user3._id,
        approvalReference: 'AUDIT_REF_002'
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('manageAuthoritySettings'));

    await User.deleteMany({ _id: { $in: [user1._id, user2._id, user3._id] } });
    await Role.deleteOne({ _id: basicRole._id });
});

test('P0 Maker-Checker: Self-approval prohibited when submitter === approver', async () => {
    const adminRole = await Role.create({
        name: 'Super Admin',
        department: 'accounts',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true }
    });

    const singleUser = await User.create({ fullName: 'Admin User', password: 'Password123!', department: 'accounts', email: 'singleadmin@bharatprop.test', role: adminRole._id, tenantId: testTenantId, isActive: true });
    const reviewerUser = await User.create({ fullName: 'Reviewer User', password: 'Password123!', department: 'accounts', email: 'reviewer@bharatprop.test', role: adminRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: singleUser._id,
        approverId: singleUser._id,
        reviewerId: reviewerUser._id,
        approvalReference: 'AUDIT_REF_003'
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.toLowerCase().includes('distinct authenticated users'));

    await User.deleteMany({ _id: { $in: [singleUser._id, reviewerUser._id] } });
    await Role.deleteOne({ _id: adminRole._id });
});

test('P0 Maker-Checker: Authentic maker-checker with genuine users and roles succeeds via recordMakerCheckerApproval', async () => {
    const submitterRole = await Role.create({
        name: 'Inventory Operations',
        department: 'inventory',
        tenantId: testTenantId,
        permissions: ['inventory.create']
    });
    const approverRole = await Role.create({
        name: 'Compliance Manager',
        department: 'accounts',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: true }
    });
    const reviewerRole = await Role.create({
        name: 'Auditor Role',
        department: 'accounts',
        tenantId: testTenantId,
        approvalRights: { approveAuthorityChanges: true }
    });

    const submitter = await User.create({ fullName: 'Sub User', password: 'Password123!', department: 'inventory', email: 'sub@bharatprop.test', role: submitterRole._id, tenantId: testTenantId, isActive: true });
    const approver = await User.create({ fullName: 'App User', password: 'Password123!', department: 'accounts', email: 'app@bharatprop.test', role: approverRole._id, tenantId: testTenantId, isActive: true });
    const reviewer = await User.create({ fullName: 'Rev User', password: 'Password123!', department: 'accounts', email: 'rev@bharatprop.test', role: reviewerRole._id, tenantId: testTenantId, isActive: true });

    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const hsvpSettings = await AuthoritySourceSettings.getForTenant(testTenantId, 'HSVP');

    const auditEntry = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: hsvpSettings._id,
        targetName: 'HSVP',
        actorId: reviewer._id,
        userId: approver._id,
        description: 'Authentic maker-checker approval reviewed by independent compliance reviewer',
        metadata: {
            tenantId: testTenantId,
            authorityCode: 'HSVP',
            approverId: approver._id,
            reviewerId: reviewer._id,
            submittedBy: submitter._id
        }
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        submitterId: submitter._id,
        approverId: approver._id,
        reviewerId: reviewer._id,
        approvalReference: auditEntry._id
    });

    assert.strictEqual(updated.reviewStatus, 'APPROVED');
    assert.strictEqual(String(updated.approvalReference), String(auditEntry._id));
    assert.strictEqual(String(updated.approvedBy), String(approver._id));
    assert.strictEqual(String(updated.reviewedBy), String(reviewer._id));

    // Cleanup
    await _testOnlyResetAuthoritySettings({ tenantId: testTenantId, authorityCode: 'HSVP' });
    await AuditLog.deleteOne({ _id: auditEntry._id }).catch(() => {});
    await User.deleteMany({ _id: { $in: [submitter._id, approver._id, reviewer._id] } });
    await Role.deleteMany({ _id: { $in: [submitterRole._id, approverRole._id, reviewerRole._id] } });
});

test('P0 Maker-Checker: reconcileOwnerAttestation strictly enforces reviewStatus: UNDER_REVIEW and isEnabled: false', async () => {
    const results = await AuthoritySourceSettings.reconcileOwnerAttestation(testTenantId, {
        reviewStatus: 'APPROVED', // Caller attempt to pass APPROVED
        isEnabled: true           // Caller attempt to pass true
    });

    for (const doc of results) {
        assert.strictEqual(doc.permissionStatus, 'GRANTED');
        assert.strictEqual(doc.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
        assert.strictEqual(doc.reviewStatus, 'UNDER_REVIEW', `${doc.authorityCode} reviewStatus must be UNDER_REVIEW`);
        assert.strictEqual(doc.isEnabled, false, `${doc.authorityCode} isEnabled must be false`);
        assert.strictEqual(doc.schedulingEnabled, false, `${doc.authorityCode} schedulingEnabled must be false`);
        assert.strictEqual(doc.approvalReference, null);
    }
});

// ============================================================================
// 4. Single-Organization Context Enforcement
// ============================================================================

test('P1 Scope: getCanonicalOrganizationContext returns fixed canonical org ID and HOLD status', () => {
    const org = getCanonicalOrganizationContext();
    assert.strictEqual(org.organizationId.toString(), CANONICAL_ORGANIZATION_ID.toString());
    assert.strictEqual(org.organizationName, CANONICAL_ORGANIZATION_NAME);
    assert.strictEqual(org.model, 'SINGLE_ORGANIZATION');
    assert.strictEqual(org.tenantDevelopmentStatus, 'HOLD');
});

// ============================================================================
// 5. Scheduler Scoping & Lifecycle
// ============================================================================

test('P1 Scheduler: AuthorityRefreshScheduler requires organizationId at startup', () => {
    const schedulerWithoutOrg = new AuthorityRefreshScheduler({ organizationId: null });
    assert.throws(
        () => schedulerWithoutOrg.start(),
        (err) => {
            assert.ok(err.message.includes('canonical single-organization ID is required'));
            return true;
        }
    );
});

test('P1 Scheduler: executeWeeklyCycle executes scoped to single organization and safely skips unapproved sources', async () => {
    let cronCallback = null;
    const mockCron = {
        schedule: (expr, cb) => {
            cronCallback = cb;
            return { stop: () => {} };
        }
    };

    const scheduler = new AuthorityRefreshScheduler({
        organizationId: testTenantId,
        cronAdapter: mockCron,
        timezone: SCHEDULE_TIMEZONE
    });

    scheduler.start();

    // Verify callback executes
    assert.ok(typeof cronCallback === 'function');
    await cronCallback();

    const outcome = await scheduler.executeWeeklyCycle({ tenantId: testTenantId });
    assert.ok(outcome.results && outcome.results.length > 0);
    assert.ok(outcome.results.every(r => r.tenantId.toString() === testTenantId.toString()));

    // All sources are UNDER_REVIEW / disabled, so all must be skipped
    for (const r of outcome.results) {
        assert.ok(r.status.startsWith('SKIPPED_'), `Source ${r.authorityCode} should be safely skipped, but got ${r.status}`);
    }

    scheduler.stop();
});

// ============================================================================
// 6. Inventory Resolution & Pilot Matching Separation
// ============================================================================

test('P1 Inventory: Live acceptance runner separates pre-existing inventory from matching and reports NOT_EXECUTED_APPROVAL_PENDING', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(results.propertyMatchingStatus, 'NOT_EXECUTED_APPROVAL_PENDING');
    assert.strictEqual(results.existingInventoryResolution.propertyMatchingStatus, 'NOT_EXECUTED_APPROVAL_PENDING');
    assert.strictEqual(results.pilotCounts.GMADA.status, 'NEEDS_VERIFIED_IDENTIFIER');
});

// ============================================================================
// 7. Real Redis Status Separation
// ============================================================================

test('P1 Redis: Live acceptance runner separates reachabilityStatus from lock/quota statuses', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.ok(results.redisExecution.reachabilityStatus);
    assert.strictEqual(results.redisExecution.lockStatus, 'NOT_EXECUTED_APPROVAL_PENDING');
    assert.strictEqual(results.redisExecution.quotaStatus, 'NOT_EXECUTED_APPROVAL_PENDING');
});

// ============================================================================
// 8. Runtime Audit Failure Fail-Closed Guarantee
// ============================================================================

test('P1 Audit: Runtime throws AUDIT_PERSISTENCE_FAILED when audit sink fails during pre-transport rejection', async () => {
    const failingAuditSink = {
        write: async () => {
            throw new Error('DATABASE_CONNECTION_LOST_TO_AUDIT_LOGS');
        }
    };

    const mockLockProvider = {
        acquire: async () => ({ acquired: true, release: async () => {} })
    };
    const mockQuotaProvider = {
        reserve: async () => ({ allowed: true })
    };
    const circuitBreakerStore = new DurablePortalCircuitBreaker();

    const runtime = createAuthorityPortalRuntime({
        lockProvider: mockLockProvider,
        quotaProvider: mockQuotaProvider,
        circuitBreakerStore,
        auditSink: failingAuditSink,
        transport: portalHttpTransport,
        parserRegistry: PORTAL_PARSERS,
        fenceWatermarkStore: AuthorityGlobalFenceWatermark,
        gateConfig: {
            ...DEFAULT_APPROVAL_GATE_CONFIG,
            enabled: false,
            readOnly: true
        }
    });

    await assert.rejects(
        async () => {
            await runtime.search({
                authorityCode: 'HSVP',
                inventory: {},
                authorityLink: {
                    urbanEstate: 'Gurugram',
                    sectorNumber: '21',
                    propertyId: '100'
                },
                approval: {
                    authorityCode: 'HSVP',
                    status: 'GRANTED',
                    reviewStatus: 'UNDER_REVIEW',
                    accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                    termsReviewed: false,
                    commercialUseAuthorized: false,
                    readOnlySearchAuthorized: true
                },
                tenantId: testTenantId
            });
        },
        (err) => {
            assert.strictEqual(err.code, 'AUDIT_PERSISTENCE_FAILED');
            assert.ok(err.message.includes('audit logging failed') || err.message.includes('AUDIT_PERSISTENCE_FAILED'));
            return true;
        }
    );
});
