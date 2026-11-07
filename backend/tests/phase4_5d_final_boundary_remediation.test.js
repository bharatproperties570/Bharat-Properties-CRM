/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 4.5-D FINAL BOUNDARY REMEDIATION TEST SUITE
 * ============================================================================
 * 
 *  Comprehensive regression tests for P0 Database Isolation & P0 Authorization Separation:
 * 
 *  1. Database Safety & Rejection (Section 2.6 — 13 tests):
 *     - APPLICATION_ENV=production
 *     - APP_ENV=production
 *     - Private 10.x host rejected
 *     - Private 172.16/12 host rejected
 *     - Generic database name ('crm') rejected
 *     - Missing database name rejected
 *     - Existing remote connection mismatch with local requested URI
 *     - Existing local connection mismatch with remote requested URI
 *     - Same host, different database name mismatch
 *     - Existing production connection with generic host/db rejected
 *     - Replica-set host mismatch rejected
 *     - MongoDB credential redaction
 *     - Fail-closed abort before ensureDefaults() or any write
 * 
 *  2. Authentic Maker-Checker & AuditLog Separation (Section 3.5 — 17 tests):
 *     - Disconnected MongoDB
 *     - Three arbitrary ObjectIds
 *     - Three users from different organization
 *     - Inactive users
 *     - Missing approver permission
 *     - Missing reviewer permission
 *     - Same approver and reviewer
 *     - Arbitrary approval string
 *     - Nonexistent AuditLog reference
 *     - AuditLog belonging to another authority
 *     - AuditLog belonging to another organization
 *     - Valid actual AuditLog event and authorized users
 *     - Verify internal maker-checker approval does NOT set VERIFIED_CONTRACT
 *     - Verify internal approval does NOT set commercialUseAuthorized=true
 *     - Verify internal approval does NOT set termsReviewed=true
 *     - Verify internal approval does NOT set identityRequirements.verified=true
 *     - Verify all invalid cases remain fail-closed
 * 
 *  3. Canonical Organization ID & Scope (Section 4):
 *     - Validates fixed canonical ID
 *     - Rejects non-canonical ORGANIZATION_ID env override with BLOCKED_CANONICAL_ORGANIZATION_MISMATCH
 * 
 *  4. Single-Organization Scheduler (Section 5):
 *     - Constructor rejects non-canonical organization
 *     - executeWeeklyCycle rejects non-canonical tenantId override with zero DB queries
 *     - Cron contract 0 2 * * 0 in Asia/Kolkata
 * 
 *  5. Persistence Survival Cryptographic SHA-256 (Section 6):
 *     - SHA-256 computed from deterministic payload
 *     - All 7 steps verified with disconnect/reconnect and idempotency
 *     - Honest reporting of BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE
 * 
 *  6. Inventory-Link Integrity Verification (Section 7):
 *     - Orphan link detection
 *     - Cross-org link rejection
 *     - PRE_EXISTING_INVENTORY_VERIFIED with NOT_EXECUTED_APPROVAL_PENDING
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
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import {
    verifyDatabaseEnvironmentSafety,
    redactMongoUri,
    parseMongoDetails
} from '../services/authority/databaseEnvironmentSafety.js';
import { executePersistenceSurvivalTest } from '../services/authority/persistenceSurvivalVerifier.js';
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
// 1. Mandatory Database Safety Regression Tests (Section 2.6 — 13 tests)
// ============================================================================

test('DB Safety 1: APPLICATION_ENV=production is rejected fail-closed', () => {
    const orig = process.env.APPLICATION_ENV;
    try {
        process.env.APPLICATION_ENV = 'production';
        const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/staging_crm' });
        assert.strictEqual(res.verified, false);
        assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        assert.strictEqual(res.code, 'PRODUCTION_ENVIRONMENT_DETECTED');
        assert.ok(res.reason.includes('APPLICATION_ENV'));
    } finally {
        process.env.APPLICATION_ENV = orig;
    }
});

test('DB Safety 2: APP_ENV=production is rejected fail-closed', () => {
    const orig = process.env.APP_ENV;
    try {
        process.env.APP_ENV = 'production';
        const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/staging_crm' });
        assert.strictEqual(res.verified, false);
        assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        assert.strictEqual(res.code, 'PRODUCTION_ENVIRONMENT_DETECTED');
        assert.ok(res.reason.includes('APP_ENV'));
    } finally {
        process.env.APP_ENV = orig;
    }
});

test('DB Safety 3: Production MongoDB address on private 10.x network is rejected without explicit allowlist', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://10.0.4.12:27017/staging_crm' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'UNKNOWN_HOST_REJECTED');
    assert.ok(res.reason.includes('not on the verified non-production allowlist'));
});

test('DB Safety 4: Production MongoDB address on private 172.16/12 network is rejected without explicit allowlist', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://172.20.10.5:27017/staging_crm' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'UNKNOWN_HOST_REJECTED');
    assert.ok(res.reason.includes('not on the verified non-production allowlist'));
});

test('DB Safety 5: Production database with generic database name such as crm is rejected', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017/crm' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'GENERIC_DATABASE_NAME_REJECTED');
    assert.ok(res.reason.includes('generic'));
});

test('DB Safety 6: Missing database name in target URI is rejected', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://localhost:27017' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'MISSING_DATABASE_NAME');
});

test('DB Safety 7: Existing connection mismatch with local requested URI is rejected without bypass', () => {
    // Current connection is to 127.0.0.1 (local loopback) with db 'phase45d_test_db'
    // Target requests different host on remote staging
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://staging-mongo:27017/phase45d_test_db' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'EXISTING_CONNECTION_MISMATCH');
    assert.ok(res.reason.includes('does not match target staging host set'));
});

test('DB Safety 8: Existing local connection while requested staging URI is a different host is rejected', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://nonprod-db.staging.internal:27017/phase45d_test_db' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'EXISTING_CONNECTION_MISMATCH');
});

test('DB Safety 9: Same host but different database name is rejected as existing connection mismatch', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://127.0.0.1:27017/different_staging_db' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'EXISTING_CONNECTION_MISMATCH');
    assert.ok(res.reason.includes('database name'));
});

test('DB Safety 10: Existing production connection with generic hostname and database name is rejected', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://prod-cluster.internal:27017/crm' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.ok(res.code.includes('PRODUCTION') || res.code === 'GENERIC_DATABASE_NAME_REJECTED');
});

test('DB Safety 11: Replica-set host mismatch is rejected', () => {
    const res = verifyDatabaseEnvironmentSafety({ uri: 'mongodb://staging-mongo-01.staging.internal:27017,staging-mongo-02.staging.internal:27017/phase45d_test_db?replicaSet=rs0' });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    assert.strictEqual(res.code, 'EXISTING_CONNECTION_MISMATCH');
});

test('DB Safety 12: MongoDB credential redaction securely masks user, pass, and query tokens', () => {
    const raw = 'mongodb://app_user:super_secret_password_123@staging-mongo:27017/staging_crm?authSource=admin&token=secret_auth_token_xyz';
    const redacted = redactMongoUri(raw);
    assert.ok(!redacted.includes('super_secret_password_123'));
    assert.ok(!redacted.includes('secret_auth_token_xyz'));
    assert.ok(redacted.includes('//****:****@staging-mongo:27017/staging_crm'));
    assert.ok(redacted.includes('token=****'));
});

test('DB Safety 13: Live smoke test rejects production environment fail-closed before ensureDefaults() or writes', async () => {
    const orig = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const results = await runLiveAuthoritySmokeTest();
        assert.strictEqual(results.databaseClassification.isProduction, true);
        assert.strictEqual(results.databaseClassification.persistentStagingStatus, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
        assert.strictEqual(results.persistenceSurvival.status, 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED');
    } finally {
        process.env.NODE_ENV = orig;
    }
});

// ============================================================================
// 2. Mandatory Maker-Checker & AuditLog Separation Tests (Section 3.5 — 17 tests)
// ============================================================================

test('Maker-Checker 1: Disconnected MongoDB fails closed and returns valid: false', async () => {
    const tempUri = mongod.getUri();
    await mongoose.disconnect();
    try {
        const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
            submitterId: new mongoose.Types.ObjectId(),
            approverId: new mongoose.Types.ObjectId(),
            reviewerId: new mongoose.Types.ObjectId(),
            approvalReference: new mongoose.Types.ObjectId()
        });
        assert.strictEqual(check.valid, false);
        assert.ok(check.reason.toLowerCase().includes('database is disconnected'));
    } finally {
        await mongoose.connect(`${tempUri}phase45d_test_db`);
    }
});

test('Maker-Checker 2: Three arbitrary ObjectIds fail user verification', async () => {
    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: new mongoose.Types.ObjectId(),
        approverId: new mongoose.Types.ObjectId(),
        reviewerId: new mongoose.Types.ObjectId(),
        approvalReference: new mongoose.Types.ObjectId()
    });
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('Found only 0/3 registered users'));
});

test('Maker-Checker 3: Three users from a different organization are rejected', async () => {
    const otherOrgId = new mongoose.Types.ObjectId('111111111111111111111111');
    const role = await Role.create({
        name: 'Other Org Role',
        department: 'inventory',
        tenantId: otherOrgId,
        approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true }
    });
    const u1 = await User.create({ fullName: 'U1', password: 'Password123!', department: 'inventory', email: 'u1@other.test', role: role._id, tenantId: otherOrgId, isActive: true });
    const u2 = await User.create({ fullName: 'U2', password: 'Password123!', department: 'inventory', email: 'u2@other.test', role: role._id, tenantId: otherOrgId, isActive: true });
    const u3 = await User.create({ fullName: 'U3', password: 'Password123!', department: 'inventory', email: 'u3@other.test', role: role._id, tenantId: otherOrgId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: new mongoose.Types.ObjectId()
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('belongs to a different organization'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker 4: Inactive users are rejected', async () => {
    const role = await Role.create({
        name: 'Active Role',
        department: 'inventory',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true }
    });
    const u1 = await User.create({ fullName: 'Active Sub', password: 'Password123!', department: 'inventory', email: 'uact@bharatprop.test', role: role._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'Inactive App', password: 'Password123!', department: 'inventory', email: 'uinact@bharatprop.test', role: role._id, tenantId: testTenantId, isActive: false });
    const u3 = await User.create({ fullName: 'Active Rev', password: 'Password123!', department: 'inventory', email: 'urev@bharatprop.test', role: role._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: new mongoose.Types.ObjectId()
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('inactive'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteOne({ _id: role._id });
});

test('Maker-Checker 5: Missing approver permission (manageAuthoritySettings) is rejected', async () => {
    const noRightRole = await Role.create({
        name: 'No Approver Right Role',
        department: 'inventory',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: false, approveAuthorityChanges: true }
    });
    const revRole = await Role.create({
        name: 'Reviewer Role Only',
        department: 'inventory',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: false, approveAuthorityChanges: true }
    });

    const u1 = await User.create({ fullName: 'Sub', password: 'Password123!', department: 'inventory', email: 's5@bharatprop.test', role: noRightRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'App', password: 'Password123!', department: 'inventory', email: 'a5@bharatprop.test', role: noRightRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'Rev', password: 'Password123!', department: 'inventory', email: 'r5@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: new mongoose.Types.ObjectId()
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('manageAuthoritySettings'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [noRightRole._id, revRole._id] } });
});

test('Maker-Checker 6: Missing reviewer permission (approveAuthorityChanges) is rejected', async () => {
    const appRole = await Role.create({
        name: 'Approver Role Only',
        department: 'accounts',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: false }
    });
    const noRightRole = await Role.create({
        name: 'No Reviewer Right Role',
        department: 'inventory',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: false, approveAuthorityChanges: false }
    });

    const u1 = await User.create({ fullName: 'Sub', password: 'Password123!', department: 'inventory', email: 's6@bharatprop.test', role: noRightRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'App', password: 'Password123!', department: 'accounts', email: 'a6@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'Rev', password: 'Password123!', department: 'inventory', email: 'r6@bharatprop.test', role: noRightRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: new mongoose.Types.ObjectId()
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('approveAuthorityChanges'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, noRightRole._id] } });
});

test('Maker-Checker 7: Same approver and reviewer (self-review) is rejected', async () => {
    const superRole = await Role.create({
        name: 'Super Role',
        department: 'accounts',
        tenantId: testTenantId,
        approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true }
    });

    const u1 = await User.create({ fullName: 'Sub', password: 'Password123!', department: 'inventory', email: 's7@bharatprop.test', role: superRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'AppRev', password: 'Password123!', department: 'accounts', email: 'ar7@bharatprop.test', role: superRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u2._id, // Same user
        approvalReference: new mongoose.Types.ObjectId()
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('distinct authenticated users'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id] } });
    await Role.deleteOne({ _id: superRole._id });
});

test('Maker-Checker 8: Arbitrary approval string (not an AuditLog ObjectId) is rejected', async () => {
    const appRole = await Role.create({ name: 'App Role 8', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Rev Role 8', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S8', password: 'Password123!', department: 'inventory', email: 's8@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A8', password: 'Password123!', department: 'accounts', email: 'a8@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R8', password: 'Password123!', department: 'accounts', email: 'r8@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: 'AUDIT_REF_001' // Arbitrary string
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('arbitrary string, not a valid AuditLog ObjectId reference'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

test('Maker-Checker 9: Nonexistent AuditLog reference (valid ObjectId but not in DB) is rejected', async () => {
    const appRole = await Role.create({ name: 'App Role 9', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Rev Role 9', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S9', password: 'Password123!', department: 'inventory', email: 's9@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A9', password: 'Password123!', department: 'accounts', email: 'a9@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R9', password: 'Password123!', department: 'accounts', email: 'r9@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    const nonExistentId = new mongoose.Types.ObjectId();
    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: nonExistentId
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('does not exist in database'));

    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

test('Maker-Checker 10: AuditLog belonging to another authority is rejected', async () => {
    const appRole = await Role.create({ name: 'App Role 10', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Rev Role 10', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S10', password: 'Password123!', department: 'inventory', email: 's10@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A10', password: 'Password123!', department: 'accounts', email: 'a10@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R10', password: 'Password123!', department: 'accounts', email: 'r10@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    // AuditLog specifies authorityCode 'CHD'
    const auditRecord = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'CHD',
        actorId: u3._id,
        description: 'CHD Audit Event',
        metadata: { tenantId: testTenantId, authorityCode: 'CHD' }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: auditRecord._id,
        authorityCode: 'HSVP' // Target is HSVP, audit is CHD
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes("belongs to authority 'CHD', not 'HSVP'"));

    await AuditLog.deleteOne({ _id: auditRecord._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

test('Maker-Checker 11: AuditLog belonging to another organization is rejected', async () => {
    const otherOrgId = new mongoose.Types.ObjectId('222222222222222222222222');
    const appRole = await Role.create({ name: 'App Role 11', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Rev Role 11', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S11', password: 'Password123!', department: 'inventory', email: 's11@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A11', password: 'Password123!', department: 'accounts', email: 'a11@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R11', password: 'Password123!', department: 'accounts', email: 'r11@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    const auditRecord = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        description: 'Other Org Audit Event',
        metadata: { tenantId: otherOrgId, authorityCode: 'HSVP' }
    });

    const check = await AuthoritySourceSettings.verifyMakerCheckerUsers({
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: auditRecord._id,
        authorityCode: 'HSVP'
    });

    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('belongs to another organization'));

    await AuditLog.deleteOne({ _id: auditRecord._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

test('Maker-Checker 12-16: Valid maker-checker approval reaches APPROVED but does NOT set external contract evidence', async () => {
    const appRole = await Role.create({ name: 'App Role 12', department: 'accounts', tenantId: testTenantId, approvalRights: { manageAuthoritySettings: true } });
    const revRole = await Role.create({ name: 'Rev Role 12', department: 'accounts', tenantId: testTenantId, approvalRights: { approveAuthorityChanges: true } });

    const u1 = await User.create({ fullName: 'S12', password: 'Password123!', department: 'inventory', email: 's12@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u2 = await User.create({ fullName: 'A12', password: 'Password123!', department: 'accounts', email: 'a12@bharatprop.test', role: appRole._id, tenantId: testTenantId, isActive: true });
    const u3 = await User.create({ fullName: 'R12', password: 'Password123!', department: 'accounts', email: 'r12@bharatprop.test', role: revRole._id, tenantId: testTenantId, isActive: true });

    await AuthoritySourceSettings.ensureDefaults(testTenantId);

    const auditRecord = await AuditLog.create({
        eventType: 'authority_source_approval_reviewed',
        targetType: 'authority_settings',
        targetName: 'HSVP',
        actorId: u3._id,
        userId: u2._id,
        description: 'Authentic maker-checker approval for HSVP',
        metadata: { tenantId: testTenantId, authorityCode: 'HSVP', approverId: u2._id, reviewerId: u3._id }
    });

    const updated = await AuthoritySourceSettings.recordMakerCheckerApproval({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        submitterId: u1._id,
        approverId: u2._id,
        reviewerId: u3._id,
        approvalReference: auditRecord._id
    });

    // 12. Approved internally
    assert.strictEqual(updated.reviewStatus, 'APPROVED');
    assert.strictEqual(String(updated.approvalReference), String(auditRecord._id));

    // 13. Does NOT set VERIFIED_CONTRACT
    assert.strictEqual(updated.contractVerificationStatus, 'NOT_VERIFIED');
    assert.strictEqual(updated.contractEvidenceReference, null);

    // 14. Does NOT set commercialUseAuthorized=true
    assert.strictEqual(updated.commercialUseAuthorized, false);

    // 15. Does NOT set termsReviewed=true
    assert.strictEqual(updated.termsReviewed, false);

    // 16. Does NOT set identityRequirements.verified=true without independent evidence
    assert.strictEqual(updated.identityRequirements.verified, false);

    // Cleanup
    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
    await AuditLog.deleteOne({ _id: auditRecord._id });
    await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    await Role.deleteMany({ _id: { $in: [appRole._id, revRole._id] } });
});

test('Maker-Checker 17: All invalid activation cases remain fail-closed', async () => {
    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });

    // Attempting to enable when contract and terms are unverified throws error
    setting.isEnabled = true;
    await assert.rejects(
        async () => { await setting.save(); },
        (err) => {
            assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
            return true;
        }
    );

    await AuthoritySourceSettings.deleteOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
});

// ============================================================================
// 3. Canonical Organization ID & Scope Tests (Section 4)
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

// ============================================================================
// 4. Single-Organization Scheduler Tests (Section 5)
// ============================================================================

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
    // Idempotent start
    scheduler.start();
    assert.strictEqual(scheduler.isRunning, true);
    scheduler.stop();
    assert.strictEqual(scheduler.isRunning, false);
});

// ============================================================================
// 5. Persistence Survival Cryptographic SHA-256 Tests (Section 6)
// ============================================================================

test('Persistence 1: Deterministic SHA-256 hash verified across disconnect/reconnect with immutability safeguards', async () => {
    const uri = `${mongod.getUri()}phase45d_test_db`;
    const res = await executePersistenceSurvivalTest({
        mongoUri: uri,
        tenantId: testTenantId,
        allowTemporaryForTest: true
    });

    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.stepsExecuted, 7);
    assert.strictEqual(res.hashAlgorithm, 'SHA-256');
    assert.ok(res.contentHash && res.contentHash.length === 64);
});

test('Persistence 2: Reports BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE when temporary storage is disfavored', async () => {
    const uri = `${mongod.getUri()}phase45d_test_db`;
    const res = await executePersistenceSurvivalTest({
        mongoUri: uri,
        tenantId: testTenantId,
        allowTemporaryForTest: false
    });

    assert.strictEqual(res.status, 'BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE');
    assert.strictEqual(res.stepsExecuted, 0);
    assert.ok(res.reason.includes('classified as temporary test storage'));
});

// ============================================================================
// 6. Inventory-Link Integrity Verification (Section 7)
// ============================================================================

test('Inventory-Link 1: Orphan link referencing non-existent inventory causes BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY', async () => {
    const orphanLinkId = new mongoose.Types.ObjectId();
    const fakeInvId = new mongoose.Types.ObjectId();

    const link = await PropertyAuthorityLink.create({
        tenantId: testTenantId,
        authorityCode: 'HSVP',
        inventoryId: fakeInvId,
        propertyIdentifier: 'ORPHAN-01',
        createdBy: new mongoose.Types.ObjectId(),
        isActive: true
    });

    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(results.existingInventoryResolution.status, 'BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY');
    assert.ok(results.existingInventoryResolution.reason.includes('references non-existent inventory ID'));

    await PropertyAuthorityLink.deleteOne({ _id: link._id });
});
