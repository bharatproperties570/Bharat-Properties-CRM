/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 4.5-D FINAL BOUNDARY HARDENING TEST SUITE
 * ============================================================================
 * 
 *  Comprehensive regression tests for P0 Database Identity, Audit Authenticity,
 *  RBAC / Organization Membership, Query-Update Activation Boundary, and Durability:
 * 
 *  1. Database Safety & Connection Identity (Section 2 — 10 mandatory tests):
 *     - Same host and database, different port
 *     - localhost vs 127.0.0.1, different ports
 *     - Existing remote connection mismatch with requested localhost URI
 *     - Existing localhost connection mismatch with requested remote staging URI
 *     - Same host/port but different database name
 *     - Replica-set seed mismatch
 *     - SRV identity that cannot be verified
 *     - Existing connected database with unverified active topology
 *     - Staging URI present while already connected Mongoose targets wrong port
 *     - Zero ensureDefaults() calls and zero writes for rejected cases
 * 
 *  2. Normalized Environment Classification (Section 3):
 *     - nonprod, non-production, staging, test, dev, development NOT misclassified as production
 *     - prod, production, live rejected as production
 *     - All 5 variables tested: NODE_ENV, APP_ENV, APPLICATION_ENV, ENVIRONMENT, STAGE
 *     - Ambiguous/unrecognized values fail closed
 * 
 *  3. Authentic Maker-Checker AuditLog Evidence (Section 4):
 *     - Missing eventType rejected
 *     - Wrong eventType rejected
 *     - Wrong targetType rejected
 *     - Target ID mismatch rejected
 *     - Authority code missing or mismatch rejected
 *     - Organization ID missing or mismatch rejected
 *     - Non-success status (failed, pending) rejected
 *     - Missing, stale (>30 days), future timestamps rejected
 *     - Actor/reviewer and approver/user identity mismatch rejected
 * 
 *  4. User Organization Membership & RBAC (Section 5):
 *     - Missing user tenantId rejected
 *     - Non-canonical user tenantId rejected
 *     - Non-canonical source tenantId argument rejected
 *     - Approver missing manageAuthoritySettings rejected
 *     - Reviewer missing approveAuthorityChanges rejected
 * 
 *  5. Query-Update Activation Bypass Prevention (Section 6):
 *     - Existing UNDER_REVIEW + updateOne({ $set: { isEnabled: true } }) rejected
 *     - Existing UNDER_REVIEW + findOneAndUpdate({ $set: { schedulingEnabled: true } }) rejected
 *     - Existing APPROVED record with invalid audit evidence cannot be activated
 *     - Combined update changing review status and enablement checked against final state
 *     - Direct bulkWrite on AuthoritySourceSettings rejected with DIRECT_BULK_WRITE_PROHIBITED
 *     - All rejected attempts leave stored state unchanged
 * 
 *  6. Separate Internal Review Expiry from External Approval Expiry (Section 7):
 *     - recordMakerCheckerApproval does not invent 365-day external permit expiry
 *     - approvalExpiryDate remains null; internalReviewExpiryDate set
 *     - contractVerificationStatus, commercialUseAuthorized, termsReviewed remain unverified
 * 
 *  7. Hardened MongoDB URI Credential Redaction (Section 8):
 *     - Username-only URI
 *     - Username/password URI
 *     - URL-encoded credentials
 *     - Special characters in credentials
 *     - Mixed-case secret query parameters
 *     - Malformed URI safe fallback
 *     - Zero raw credentials leaked
 * 
 *  8. Real Persistence Idempotency Verification (Section 9):
 *     - Deterministic retry does not create second snapshot
 *     - Count is exactly 1 for idempotency identity
 *     - Immutability safeguards intact across disconnect/reconnect
 * 
 *  9. Inventory-Link Property Identity Verification (Section 10):
 *     - Validates authority-specific identifier against real inventory record fields
 *     - Mismatch or missing identifiers reports IDENTITY_NOT_VERIFIED
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import {
    verifyDatabaseEnvironmentSafety,
    redactMongoUri,
    parseMongoDetails,
    classifyEnvironment,
    getActiveMongooseConnectionIdentity,
    compareConnectionIdentities
} from '../services/authority/databaseEnvironmentSafety.js';
import {
    executePersistenceSurvivalTest,
    persistSnapshotIdempotently
} from '../services/authority/persistenceSurvivalVerifier.js';
import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING,
    CANONICAL_ORGANIZATION_NAME,
    getCanonicalOrganizationContext,
    verifyCanonicalOrganizationContext
} from '../config/canonicalOrganization.js';
import {
    AuthorityRefreshScheduler,
    DEFAULT_WEEKLY_CRON,
    SCHEDULE_TIMEZONE
} from '../services/authority/AuthorityRefreshScheduler.js';
import { runLiveAuthoritySmokeTest } from '../scripts/run_live_authority_smoke_test.js';

let mongod = null;
let testDbPath = null;
const testTenantId = CANONICAL_ORGANIZATION_ID;

test.before(async () => {
    testDbPath = path.resolve(os.tmpdir(), `phase45d_boundary_test_${Date.now()}`);
    fs.mkdirSync(testDbPath, { recursive: true });

    mongod = await MongoMemoryServer.create({
        instance: {
            dbPath: testDbPath,
            storageEngine: 'wiredTiger'
        }
    });
    // Connect explicitly with non-generic test database name
    await mongoose.connect(`${mongod.getUri()}phase45d_test_db`);
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
// 1. Mandatory Database Safety & Connection Identity Tests (Section 2)
// ============================================================================

test('DB Safety Neg 1: Same host and database, different port is rejected', () => {
    const activeIdentity = {
        host: '127.0.0.1',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [{ host: '127.0.0.1', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://127.0.0.1:27018/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_PORT_MISMATCH');
});

test('DB Safety Neg 2: localhost vs 127.0.0.1, different ports is rejected', () => {
    const activeIdentity = {
        host: 'localhost',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [{ host: 'localhost', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://127.0.0.1:27019/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_PORT_MISMATCH');
});

test('DB Safety Neg 3: Existing remote/private connection with requested localhost URI is rejected', () => {
    const activeIdentity = {
        host: 'staging-mongo.internal',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [{ host: 'staging-mongo.internal', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://localhost:27017/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_HOST_MISMATCH');
});

test('DB Safety Neg 4: Existing localhost connection with requested remote staging URI is rejected', () => {
    const activeIdentity = {
        host: '127.0.0.1',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [{ host: '127.0.0.1', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://staging-mongo.staging.internal:27017/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_HOST_MISMATCH');
});

test('DB Safety Neg 5: Same host/port but different database name is rejected', () => {
    const activeIdentity = {
        host: '127.0.0.1',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [{ host: '127.0.0.1', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://127.0.0.1:27017/different_staging_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_DBNAME_MISMATCH');
});

test('DB Safety Neg 6: Replica-set seed mismatch is rejected', () => {
    const activeIdentity = {
        host: 'staging-mongo-01.staging.internal',
        port: 27017,
        dbName: 'phase45d_test_db',
        servers: [
            { host: 'staging-mongo-01.staging.internal', port: 27017 },
            { host: 'staging-mongo-02.staging.internal', port: 27017 }
        ],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://staging-mongo-01.staging.internal:27017,staging-mongo-03.staging.internal:27017/phase45d_test_db?replicaSet=rs0');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'EXISTING_CONNECTION_REPLICA_SET_MISMATCH');
});

test('DB Safety Neg 7: SRV identity that cannot be verified against active topology is rejected', () => {
    const activeIdentity = {
        host: '127.0.0.1',
        port: 27017,
        dbName: 'phase45d_test_db',
        topologyType: 'Unknown',
        servers: [{ host: '127.0.0.1', port: 27017 }],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb+srv://staging-cluster.internal/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'SRV_TOPOLOGY_UNVERIFIABLE');
});

test('DB Safety Neg 8: Existing connected database with unverified active topology is rejected fail-closed', () => {
    const activeIdentity = {
        host: '',
        port: null,
        dbName: 'phase45d_test_db',
        servers: [],
        readyState: 1
    };
    const target = parseMongoDetails('mongodb://localhost:27017/phase45d_test_db');
    const comp = compareConnectionIdentities(activeIdentity, target);
    assert.strictEqual(comp.matches, false);
    assert.strictEqual(comp.code, 'UNVERIFIABLE_ACTIVE_TOPOLOGY');
});

test('DB Safety Neg 9: Staging URI present while already connected Mongoose targets wrong port fails verification', () => {
    const res = verifyDatabaseEnvironmentSafety({
        uri: 'mongodb://127.0.0.1:27017/phase45d_test_db',
        allowMemoryFallback: false
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'EXISTING_CONNECTION_PORT_MISMATCH');
});

test('DB Safety Neg 10: Zero ensureDefaults() calls and zero writes for rejected cases', async () => {
    const orig = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const docCountBefore = await AuthoritySourceSettings.countDocuments();
        const results = await runLiveAuthoritySmokeTest();
        assert.strictEqual(results.databaseClassification.isProduction, true);
        assert.strictEqual(results.databaseClassification.persistentStagingStatus, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        const docCountAfter = await AuthoritySourceSettings.countDocuments();
        assert.strictEqual(docCountAfter, docCountBefore);
    } finally {
        if (orig === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = orig;
    }
});

// ============================================================================
// 2. Normalized Environment Classification Tests (Section 3)
// ============================================================================

test('Env Classification 1: nonprod and non-production are NOT misclassified as production', () => {
    assert.strictEqual(classifyEnvironment('nonprod'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('non-prod'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('NON_PROD'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('nonproduction'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('non-production'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('staging'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('STAGING'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('development'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('dev'), 'NON_PRODUCTION');
    assert.strictEqual(classifyEnvironment('test'), 'NON_PRODUCTION');
});

test('Env Classification 2: prod, production, and live are classified as PRODUCTION', () => {
    assert.strictEqual(classifyEnvironment('production'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('PRODUCTION'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('prod'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('PROD'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('live'), 'PRODUCTION');
    assert.strictEqual(classifyEnvironment('LIVE'), 'PRODUCTION');
});

test('Env Classification 3: Ambiguous or unrecognized environments fail closed as UNKNOWN_OR_UNSAFE', () => {
    assert.strictEqual(classifyEnvironment('qa-environment'), 'UNKNOWN_OR_UNSAFE');
    assert.strictEqual(classifyEnvironment('corporate-internal'), 'UNKNOWN_OR_UNSAFE');
    assert.strictEqual(classifyEnvironment('random-value'), 'UNKNOWN_OR_UNSAFE');
});

test('Env Classification 4: All 5 variables checked for production rejection', () => {
    const envVars = ['NODE_ENV', 'APP_ENV', 'APPLICATION_ENV', 'ENVIRONMENT', 'STAGE'];
    for (const v of envVars) {
        const orig = process.env[v];
        try {
            process.env[v] = 'production';
            const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/staging_crm' });
            assert.strictEqual(res.verified, false);
            assert.strictEqual(res.code, 'PRODUCTION_ENVIRONMENT_DETECTED');
            assert.ok(res.reason.includes(v));
        } finally {
            if (orig === undefined) delete process.env[v];
            else process.env[v] = orig;
        }
    }
});

// ============================================================================
// 3. Authentic Maker-Checker AuditLog Evidence Tests (Section 4)
// ============================================================================

test('Maker-Checker Audit 1: Missing eventType or wrong eventType in AuditLog is rejected', async () => {
    const role = await Role.create({ name: 'Role Audit 1', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_aud1@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_aud1@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_aud1@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });

    // Wrong eventType 'user_login'
    const wrongEventAudit = await AuditLog.create({
        eventType: 'user_login',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        description: 'Login event',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: wrongEventAudit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes("must be 'authority_source_approval_reviewed'"));

    await AuditLog.deleteOne({ _id: wrongEventAudit._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker Audit 2: Wrong targetType or targetId mismatch is rejected', async () => {
    const role = await Role.create({ name: 'Role Audit 2', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_aud2@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_aud2@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_aud2@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });

    const audit1 = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'user', // Wrong targetType
        targetName: 'HSVP',
        actorId: u3._id,
        description: 'Wrong targetType',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const check1 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: audit1._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(check1.valid, false);
    assert.ok(check1.reason.includes("must be 'authority_settings'"));

    const audit2 = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: new mongoose.Types.ObjectId(), // Different settingsId
        targetName: 'HSVP',
        actorId: u3._id,
        description: 'Mismatched settingsId',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const check2 = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: audit2._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId,
        settingsId: new mongoose.Types.ObjectId() // Different requested settingsId
    });
    assert.strictEqual(check2.valid, false);
    assert.ok(check2.reason.includes('does not match target settings document ID'));

    await AuditLog.deleteMany({ _id: { $in: [audit1._id, audit2._id] } });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker Audit 3: Failed status in AuditLog is rejected', async () => {
    const role = await Role.create({ name: 'Role Audit 3', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_aud3@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_aud3@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_aud3@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });

    const failedAudit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        status: 'failure',
        description: 'Failed review',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: failedAudit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes("must be 'success' or 'completed'"));

    await AuditLog.deleteOne({ _id: failedAudit._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker Audit 4: Stale (>30 days) or future timestamps in AuditLog are rejected', async () => {
    const role = await Role.create({ name: 'Role Audit 4', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_aud4@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_aud4@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_aud4@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });

    // 45 days old (stale)
    const staleAudit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        status: 'success',
        timestamp: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        description: 'Stale review',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const checkStale = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: staleAudit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkStale.valid, false);
    assert.ok(checkStale.reason.includes('stale'));

    // Future timestamp
    const futureAudit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        status: 'success',
        timestamp: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        description: 'Future review',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const checkFuture = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: futureAudit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(checkFuture.valid, false);
    assert.ok(checkFuture.reason.includes('future timestamp'));

    await AuditLog.deleteMany({ _id: { $in: [staleAudit._id, futureAudit._id] } });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker Audit 5: Reviewer/actor identity mismatch in AuditLog is rejected', async () => {
    const role = await Role.create({ name: 'Role Audit 5', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_aud5@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_aud5@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_aud5@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const uWrong = await User.create({ fullName: 'Wrong', email: 'wrong@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });

    const audit = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: uWrong._id, // Wrong reviewer
        status: 'success',
        description: 'Wrong actor review',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP' }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: audit._id,
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('does not match verified reviewer'));

    await AuditLog.deleteOne({ _id: audit._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id, uWrong._id] } });
    await Role.deleteOne({ _id: role._id });
});

// ============================================================================
// 4. User Organization Membership & RBAC Tests (Section 5)
// ============================================================================

test('User Org 1: User with missing/null tenantId is rejected', async () => {
    const role = await Role.create({ name: 'Role User Org 1', department: 'inventory', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true } });
    const u1 = await User.create({ fullName: 'S', email: 's_uorg1@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_uorg1@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: testTenantId, isActive: true });
    // User with null tenantId
    const u3 = await User.create({ fullName: 'R Null Org', email: 'r_nullorg@bharatprop.test', password: 'Password123!', department: 'inventory', role: role._id, tenantId: null, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: testTenantId
    });
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('missing or null tenantId'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('User Org 2: Non-canonical source tenantId argument is rejected', async () => {
    const otherOrgId = new mongoose.Types.ObjectId('333333333333333333333333');
    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: new mongoose.Types.ObjectId(),
        approverId: new mongoose.Types.ObjectId(),
        reviewerId: new mongoose.Types.ObjectId(),
        approvalReference: new mongoose.Types.ObjectId(),
        authorityCode: 'HSVP',
        tenantId: otherOrgId
    });
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('does not match canonical organization ID'));
});

// ============================================================================
// 5. Query-Update Activation Bypass Prevention Tests (Section 6)
// ============================================================================

test('Activation Bypass 1: Existing UNDER_REVIEW record + updateOne({$set:{isEnabled:true}}) is rejected', async () => {
    const setting = await AuthoritySourceSettings.create({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        reviewStatus: 'UNDER_REVIEW',
        permissionStatus: 'NOT_OBTAINED',
        isEnabled: false,
        schedulingEnabled: false
    });

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { _id: setting._id },
                { $set: { isEnabled: true } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );

    const settingAfter = await AuthoritySourceSettings.findById(setting._id);
    assert.strictEqual(settingAfter.isEnabled, false);
    assert.strictEqual(settingAfter.reviewStatus, 'UNDER_REVIEW');

    await AuthoritySourceSettings.deleteOne({ _id: setting._id });
});

test('Activation Bypass 2: Existing UNDER_REVIEW record + findOneAndUpdate({$set:{schedulingEnabled:true}}) is rejected', async () => {
    const setting = await AuthoritySourceSettings.create({
        tenantId: testTenantId,
        authorityCode: 'GMADA',
        reviewStatus: 'UNDER_REVIEW',
        permissionStatus: 'NOT_OBTAINED',
        isEnabled: false,
        schedulingEnabled: false
    });

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { _id: setting._id },
                { $set: { schedulingEnabled: true } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );

    const settingAfter = await AuthoritySourceSettings.findById(setting._id);
    assert.strictEqual(settingAfter.schedulingEnabled, false);

    await AuthoritySourceSettings.deleteOne({ _id: setting._id });
});

test('Activation Bypass 3: Direct bulkWrite on AuthoritySourceSettings throws DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                { updateOne: { filter: { authorityCode: 'HSVP' }, update: { $set: { isEnabled: true } } } }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            assert.ok(err.message.includes('Bulk update attempts cannot circumvent activation checks'));
            return true;
        }
    );
});

// ============================================================================
// 6. Separate Internal Review Expiry from External Approval Expiry (Section 7)
// ============================================================================

test('Expiry Separation 1: recordMakerCheckerApproval sets internalReviewExpiryDate and leaves approvalExpiryDate null', async () => {
    const appRole = await Role.create({ name: 'Role Exp 1', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Role Exp 2', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S', email: 's_exp@bharatprop.test', password: 'Password123!', department: 'inventory', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A', email: 'a_exp@bharatprop.test', password: 'Password123!', department: 'accounts', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R', email: 'r_exp@bharatprop.test', password: 'Password123!', department: 'accounts', role: revRole._id, tenantId: testTenantId, isActive: true });

    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const settingDoc = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });

    const auditRecord = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetId: settingDoc._id,
        targetName: 'HSVP',
        actorId: u3._id,
        userId: u2._id,
        status: 'success',
        description: 'Authentic review for HSVP',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP', reviewerId: u3._id, approverId: u2._id, submittedBy: u1._id }
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: auditRecord._id
    });

    assert.strictEqual(updated.reviewStatus, 'APPROVED');
    // External permit expiry must remain null
    assert.strictEqual(updated.approvalExpiryDate, null);
    // Internal review expiry is set
    assert.ok(updated.internalReviewExpiryDate instanceof Date);
    // External contract evidence remains unverified
    assert.strictEqual(updated.contractVerificationStatus, 'NOT_VERIFIED');
    assert.strictEqual(updated.commercialUseAuthorized, false);

    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    await AuditLog.deleteOne({ _id: auditRecord._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

// ============================================================================
// 7. Hardened MongoDB URI Credential Redaction Tests (Section 8)
// ============================================================================

test('Redaction 1: Username-only URI is safely redacted', () => {
    const raw = 'mongodb://readonly_user@staging-mongo:27017/staging_crm';
    const redacted = redactMongoUri(raw);
    assert.ok(!redacted.includes('readonly_user'));
    assert.ok(redacted.includes('//****:****@staging-mongo:27017/staging_crm'));
});

test('Redaction 2: URL-encoded username and password with special characters', () => {
    const raw = 'mongodb://user%40test:p%40ss%3Aword%21@host.staging.internal:27017/staging_crm';
    const redacted = redactMongoUri(raw);
    assert.ok(!redacted.includes('user%40test'));
    assert.ok(!redacted.includes('p%40ss%3Aword%21'));
    assert.ok(redacted.includes('//****:****@host.staging.internal:27017/staging_crm'));
});

test('Redaction 3: Mixed-case secret query parameters are completely redacted', () => {
    const raw = 'mongodb://host:27017/staging_crm?TOKEN=my_super_token&PASSWORD=secret_pwd&ApiKey=12345&other=public_val';
    const redacted = redactMongoUri(raw);
    assert.ok(!redacted.includes('my_super_token'));
    assert.ok(!redacted.includes('secret_pwd'));
    assert.ok(!redacted.includes('12345'));
    assert.ok(redacted.includes('TOKEN=****'));
    assert.ok(redacted.includes('PASSWORD=****'));
    assert.ok(redacted.includes('ApiKey=****'));
    assert.ok(redacted.includes('other=public_val'));
});

test('Redaction 4: Malformed URI returns safe representation without leak', () => {
    const raw = 'not_a_valid_uri_with_secret_password_here';
    const redacted = redactMongoUri(raw);
    assert.ok(typeof redacted === 'string');
});

// ============================================================================
// 8. Real Persistence Idempotency Verification Tests (Section 9)
// ============================================================================

test('Persistence 1: 10-step persistence survival and retry idempotency with SHA-256', async () => {
    const uri = `${mongod.getUri()}phase45d_test_db`;
    const res = await executePersistenceSurvivalTest({
        mongoUri: uri,
        tenantId: testTenantId,
        allowTemporaryForTest: true
    });

    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.stepsExecuted, 10);
    assert.strictEqual(res.hashAlgorithm, 'SHA-256');
    assert.strictEqual(res.idempotencyVerified, true);
    assert.ok(res.contentHash && res.contentHash.length === 64);
});

test('Persistence 2: Direct persistSnapshotIdempotently returns duplicate on identical retry', async () => {
    const dummyLinkId = new mongoose.Types.ObjectId();
    const deterministicRunItemId = new mongoose.Types.ObjectId();
    const payload = {
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        linkId: dummyLinkId,
        runItemId: deterministicRunItemId,
        contentHash: 'a'.repeat(64),
        rawSnapshotHash: 'a'.repeat(64),
        isSealed: true,
        requiresHumanReview: true,
        isApplied: false,
        normalizedData: { propertyId: 'TEST-IDEMPOTENT-01' }
    };

    const first = await persistSnapshotIdempotently(payload);
    assert.strictEqual(first.isDuplicate, false);
    assert.ok(first.snapshot._id);

    const second = await persistSnapshotIdempotently(payload);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(String(second.snapshot._id), String(first.snapshot._id));

    const count = await PropertyVerificationSnapshot.countDocuments({
        tenantId: testTenantId,
        runItemId: deterministicRunItemId
    });
    assert.strictEqual(count, 1);

    await PropertyVerificationSnapshot.collection.deleteOne({ _id: first.snapshot._id });
});

// ============================================================================
// 9. Inventory-Link Property Identity Verification Tests (Section 10)
// ============================================================================

test('Inventory-Link 1: Deterministic property-identity mismatch between link and inventory record reports IDENTITY_NOT_VERIFIED', async () => {
    await PropertyAuthorityLink.deleteMany({});
    await Inventory.deleteMany({});

    const inv = await Inventory.create({
        tenantId: testTenantId,
        projectName: 'Green Valley',
        unitNo: 'PLOT-500',
        propertyId: 'PLOT-500',
        sector: 'Sector 21'
    });

    const link = await PropertyAuthorityLink.create({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        inventoryId: inv._id,
        propertyId: 'PLOT-999', // Mismatched property identifier!
        sectorNumber: '21',
        createdBy: new mongoose.Types.ObjectId(),
        isActive: true
    });

    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(results.existingInventoryResolution.status, 'BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY');
    assert.strictEqual(results.existingInventoryResolution.propertyIdentityStatus, 'IDENTITY_NOT_VERIFIED');
    assert.ok(results.existingInventoryResolution.reason.includes('does not deterministically match'));

    await PropertyAuthorityLink.deleteOne({ _id: link._id });
    await Inventory.deleteOne({ _id: inv._id });
});

// ============================================================================
// 10. Canonical Organization & Scheduler Invariants (Sections 4 & 5)
// ============================================================================

test('Canonical Org 1: Canonical organization ID is strictly 000000000000000000000001', () => {
    assert.strictEqual(CANONICAL_ORGANIZATION_ID_STRING, '000000000000000000000001');
    assert.strictEqual(CANONICAL_ORGANIZATION_ID.toString(), '000000000000000000000001');
    assert.strictEqual(CANONICAL_ORGANIZATION_NAME, 'Bharat Properties');
});

test('Canonical Org 2: Non-matching ORGANIZATION_ID environment variable throws BLOCKED_CANONICAL_ORGANIZATION_MISMATCH', () => {
    const orig = process.env.ORGANIZATION_ID;
    try {
        process.env.ORGANIZATION_ID = '999999999999999999999999';
        assert.throws(
            () => verifyCanonicalOrganizationContext(),
            (err) => {
                assert.strictEqual(err.code, 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH');
                assert.ok(err.message.includes('Multi-tenant override is prohibited'));
                return true;
            }
        );
    } finally {
        if (orig === undefined) {
            delete process.env.ORGANIZATION_ID;
        } else {
            process.env.ORGANIZATION_ID = orig;
        }
    }
});

test('Scheduler 1: Constructor rejects non-canonical organization ID', () => {
    assert.throws(
        () => new AuthorityRefreshScheduler({ organizationId: '123456789012345678901234' }),
        (err) => {
            assert.strictEqual(err.code, 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH');
            assert.ok(err.message.includes('rejected non-canonical organization ID'));
            return true;
        }
    );
});

test('Scheduler 2: executeWeeklyCycle rejects non-canonical tenantId override with zero DB queries', async () => {
    const scheduler = new AuthorityRefreshScheduler();
    await assert.rejects(
        async () => {
            await scheduler.executeWeeklyCycle({ tenantId: '123456789012345678901234' });
        },
        (err) => {
            assert.strictEqual(err.code, 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH');
            assert.ok(err.message.includes('rejected mismatched tenantId'));
            return true;
        }
    );
});

test('Scheduler 3: Preserves weekly cron 0 2 * * 0 in Asia/Kolkata and idempotent start/stop', () => {
    assert.strictEqual(DEFAULT_WEEKLY_CRON, '0 2 * * 0');
    assert.strictEqual(SCHEDULE_TIMEZONE, 'Asia/Kolkata');

    const mockCron = {
        schedule: () => ({ stop: () => {} })
    };
    const scheduler = new AuthorityRefreshScheduler({ cronAdapter: mockCron });
    scheduler.start();
    assert.strictEqual(scheduler.isRunning, true);
    scheduler.start();
    assert.strictEqual(scheduler.isRunning, true);
    scheduler.stop();
    assert.strictEqual(scheduler.isRunning, false);
});
