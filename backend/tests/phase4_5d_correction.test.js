/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 4.5-D CORRECTION REGRESSION TEST SUITE
 * ============================================================================
 * 
 *  Rigorous regression verification for Section 10 requirements:
 *  1. No synthetic inventory creation in the live acceptance runner.
 *  2. No random tenant or synthetic organization context.
 *  3. No fake authenticated users.
 *  4. No auto-approval from three ObjectIds.
 *  5. No synthetic contract reference generation.
 *  6. No automatic terms review.
 *  7. No automatic commercial-use authorization.
 *  8. No live HTTP while maker-checker is pending.
 *  9. No in-memory fallback in the Redis operational runtime.
 *  10. No claim of durable staging from temporary test storage.
 *  11. No false claim of existing CRM inventory matches.
 *  12. No scheduler success claim without callback execution.
 *  13. Policy matrix consistency across model, static matrix, and gate.
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
    PERMISSION_STATUS,
    ACCESS_METHOD,
    isSourceActivated
} from '../services/authority/sourcePolicy.js';
import {
    createAuthorityPortalRuntime
} from '../services/authority/portal/authorityPortalRuntime.js';
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
import { runLiveAuthoritySmokeTest } from '../scripts/run_live_authority_smoke_test.js';

let mongod = null;
let testDbPath = null;
let testTenantId = null;

test.before(async () => {
    testDbPath = path.resolve(os.tmpdir(), `phase45d_correction_test_${Date.now()}`);
    fs.mkdirSync(testDbPath, { recursive: true });

    mongod = await MongoMemoryServer.create({
        instance: {
            dbPath: testDbPath,
            storageEngine: 'wiredTiger'
        }
    });
    await mongoose.connect(mongod.getUri());
    testTenantId = new mongoose.Types.ObjectId();
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
// 1. Regression Item 1: No Synthetic Inventory Creation in Live Acceptance Runner
// ============================================================================
test('Phase 4.5-D Correction — R1: Live acceptance runner creates ZERO synthetic inventory and reports BLOCKED', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(
        results.existingInventoryResolution.status,
        'BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY',
        'Runner must return BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY when genuine inventory is absent'
    );
    assert.strictEqual(results.existingInventoryResolution.existingInventoryCount, 0);
    assert.strictEqual(results.pilotCounts.HSVP.status, 'BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY');
    assert.strictEqual(results.pilotCounts.CHD.status, 'BLOCKED_NO_EXISTING_NON_PRODUCTION_INVENTORY');
});

// ============================================================================
// 2. Regression Item 2: No Random Tenant or Synthetic Organization Context
// ============================================================================
test('Phase 4.5-D Correction — R2: Organization context is strictly SINGLE_ORGANIZATION with tenant development on HOLD', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(results.organizationContext.model, 'SINGLE_ORGANIZATION');
    assert.strictEqual(results.organizationContext.tenantDevelopmentStatus, 'HOLD');
});

// ============================================================================
// 3. Regression Item 3: No Fake Authenticated Users
// ============================================================================
test('Phase 4.5-D Correction — R3: Live runner creates ZERO synthetic users and reports BLOCKED', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(
        results.makerChecker.status,
        'BLOCKED_AUTHENTIC_MAKER_CHECKER_UNAVAILABLE',
        'Must report BLOCKED_AUTHENTIC_MAKER_CHECKER_UNAVAILABLE when genuine CRM reviewers do not exist'
    );
    assert.strictEqual(results.makerChecker.submitter, null);
    assert.strictEqual(results.makerChecker.approver, null);
    assert.strictEqual(results.makerChecker.reviewer, null);
});

// ============================================================================
// 4. Regression Item 4: No Auto-Approval from Three ObjectIds
// ============================================================================
test('Phase 4.5-D Correction — R4: Supplying three ObjectIds does NOT auto-approve or auto-enable sources', async () => {
    const subId = new mongoose.Types.ObjectId();
    const appId = new mongoose.Types.ObjectId();
    const revId = new mongoose.Types.ObjectId();

    await AuthoritySourceSettings.reconcileOwnerAttestation(testTenantId, {
        submittedBy: subId,
        approvedBy: appId,
        reviewedBy: revId
        // Notice: reviewStatus and isEnabled not explicitly APPROVED/true
    });

    const settings = await AuthoritySourceSettings.find({ tenantId: testTenantId });
    for (const s of settings) {
        assert.strictEqual(
            s.reviewStatus,
            'UNDER_REVIEW',
            `Source ${s.authorityCode} must remain UNDER_REVIEW; ObjectIds alone do not grant approval`
        );
        assert.strictEqual(s.isEnabled, false, `Source ${s.authorityCode} must remain disabled`);
        assert.strictEqual(s.schedulingEnabled, false, `Source ${s.authorityCode} scheduling must remain disabled`);
        assert.strictEqual(s.approvedBy, null, `Source ${s.authorityCode} approvedBy must be null while UNDER_REVIEW`);
    }
});

// ============================================================================
// 5. Regression Item 5: No Synthetic Contract Reference Generation
// ============================================================================
test('Phase 4.5-D Correction — R5: No dummy approvalReference or contractEvidenceReference strings generated', async () => {
    await AuthoritySourceSettings.ensureDefaults(testTenantId);
    const settings = await AuthoritySourceSettings.find({ tenantId: testTenantId });

    for (const s of settings) {
        assert.strictEqual(s.approvalReference, null, `${s.authorityCode} approvalReference must be null in unreviewed state`);
        assert.strictEqual(s.contractEvidenceReference, null, `${s.authorityCode} contractEvidenceReference must be null in unreviewed state`);
        assert.strictEqual(s.contractVerificationStatus, 'NOT_VERIFIED', `${s.authorityCode} contractVerificationStatus must be NOT_VERIFIED`);
    }
});

// ============================================================================
// 6. Regression Item 6: No Automatic Terms Review
// ============================================================================
test('Phase 4.5-D Correction — R6: termsReviewed remains false for unreviewed sources', async () => {
    const settings = await AuthoritySourceSettings.find({ tenantId: testTenantId });
    for (const s of settings) {
        assert.strictEqual(s.termsReviewed, false, `${s.authorityCode} termsReviewed must remain false`);
    }
});

// ============================================================================
// 7. Regression Item 7: No Automatic Commercial-Use Authorization
// ============================================================================
test('Phase 4.5-D Correction — R7: commercialUseAuthorized remains false for unreviewed sources', async () => {
    const settings = await AuthoritySourceSettings.find({ tenantId: testTenantId });
    for (const s of settings) {
        assert.strictEqual(s.commercialUseAuthorized, false, `${s.authorityCode} commercialUseAuthorized must remain false`);
    }
});

// ============================================================================
// 8. Regression Item 8: Fail-Closed Live HTTP while Maker-Checker is Pending
// ============================================================================
test('Phase 4.5-D Correction — R8: Live HTTP search rejects fail-closed before network transport when review is pending', async () => {
    let httpTransportCalled = false;
    const mockTransport = {
        search: async () => {
            httpTransportCalled = true;
            return { records: [] };
        }
    };

    const dummyAuditSink = { write: async () => {} };
    const dummyLock = { acquire: async () => ({ acquired: true, release: async () => {} }), isCurrentFenceToken: async () => true };
    const dummyQuota = { reserve: async () => ({ allowed: true, quotaExceeded: false }), checkAndConsume: async () => ({ allowed: true }) };
    const circuitBreaker = new DurablePortalCircuitBreaker();
    const dummyFence = { recordIssuedFenceToken: async () => ({ highestIssuedFenceToken: 1 }) };

    const runtime = createAuthorityPortalRuntime({
        lockProvider: dummyLock,
        quotaProvider: dummyQuota,
        circuitBreakerStore: circuitBreaker,
        auditSink: dummyAuditSink,
        transport: mockTransport,
        parserRegistry: PORTAL_PARSERS,
        fenceWatermarkStore: dummyFence,
        gateConfig: {
            ...DEFAULT_APPROVAL_GATE_CONFIG,
            enabled: true, // gate enabled, but approval payload is UNDER_REVIEW
            readOnly: true
        }
    });

    const pendingApproval = {
        authorityCode: 'HSVP',
        status: 'GRANTED',
        reviewStatus: 'UNDER_REVIEW',
        accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
        termsReviewed: false,
        commercialUseAuthorized: false,
        readOnlySearchAuthorized: true,
        approvedBy: null,
        reviewedBy: null,
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrentRequests: 1,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_HSVP_1_REQ_PER_MIN'
        }
    };

    await assert.rejects(
        async () => {
            await runtime.search({
                authorityCode: 'HSVP',
                inventory: { sector: '13', unitNo: '55' },
                authorityLink: { urbanEstate: 'Kurukshetra', sectorNumber: '13', propertyId: '55' },
                approval: pendingApproval,
                tenantId: testTenantId
            });
        },
        /AUTHORITY_PORTAL_APPROVAL_BLOCKED|AUTHORITY_PORTAL_TERMS_REVIEW_REQUIRED/
    );

    assert.strictEqual(httpTransportCalled, false, 'ZERO HTTP requests must be sent when review is pending');
});

// ============================================================================
// 9. Regression Item 9: No In-Memory Fallback in Redis Operational Runtime
// ============================================================================
test('Phase 4.5-D Correction — R9: Redis distributed lock & quota provider reject without in-memory fallback in operational mode', async () => {
    // In operational mode: testMode: false, allowInMemoryFallback: false
    const operationalLock = new RedisPortalDistributedLock(null, {
        testMode: false,
        allowInMemoryFallback: false
    });

    await assert.rejects(
        async () => {
            await operationalLock.acquire({
                key: 'test_key',
                authorityCode: 'HSVP',
                tenantId: testTenantId
            });
        },
        /REDIS_UNAVAILABLE|REDIS_REQUIRED/
    );

    const operationalQuota = new RedisPortalQuotaProvider(null, {
        testMode: false,
        allowInMemoryFallback: false
    });

    await assert.rejects(
        async () => {
            await operationalQuota.reserve({
                authorityCode: 'HSVP',
                tenantId: testTenantId,
                policy: {
                    minIntervalMs: 60000,
                    maxRequestsPerMinute: 1
                }
            });
        },
        /REDIS_UNAVAILABLE|REDIS_REQUIRED/
    );
});

// ============================================================================
// 10. Regression Item 10: No Claim of Durable Staging from Temporary Test Storage
// ============================================================================
test('Phase 4.5-D Correction — R10: Temporary test database is never reported as PERSISTENT_NON_PRODUCTION_STAGING_VERIFIED', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.notStrictEqual(
        results.databaseClassification.persistentStagingStatus,
        'PERSISTENT_NON_PRODUCTION_STAGING_VERIFIED',
        'Temporary test storage must never be reported as PERSISTENT_NON_PRODUCTION_STAGING_VERIFIED'
    );
    assert.strictEqual(
        results.databaseClassification.persistentStagingStatus,
        'BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE'
    );
    assert.strictEqual(
        results.persistenceSurvival.status,
        'BLOCKED_PERSISTENT_NON_PRODUCTION_DATABASE_UNAVAILABLE'
    );
});

// ============================================================================
// 11. Regression Item 11: No False Claim of Existing CRM Inventory Matches
// ============================================================================
test('Phase 4.5-D Correction — R11: GMADA remains NEEDS_VERIFIED_IDENTIFIER and no fake match is claimed', async () => {
    const results = await runLiveAuthoritySmokeTest();
    assert.strictEqual(results.pilotCounts.GMADA.status, 'NEEDS_VERIFIED_IDENTIFIER');
    assert.strictEqual(results.pilotCounts.GMADA.matched, 0);
    assert.strictEqual(results.pilotCounts.HSVP.matched, 0);
    assert.strictEqual(results.pilotCounts.CHD.matched, 0);
});

// ============================================================================
// 12. Regression Item 12: Weekly Scheduler Success Requires Actual Callback Execution
// ============================================================================
test('Phase 4.5-D Correction — R12: Weekly scheduler verifies registration, idempotency, callback execution, and stops cleanly', async () => {
    let capturedCron = null;
    let capturedCallback = null;
    let stopped = false;

    const mockCronAdapter = {
        schedule: (cronExpr, callback, opts) => {
            capturedCron = cronExpr;
            capturedCallback = callback;
            return {
                stop: () => { stopped = true; }
            };
        }
    };

    const scheduler = new AuthorityRefreshScheduler({
        cronAdapter: mockCronAdapter,
        timezone: SCHEDULE_TIMEZONE
    });

    scheduler.start();
    assert.strictEqual(capturedCron, DEFAULT_WEEKLY_CRON);
    assert.strictEqual(scheduler.scheduledTasks.size, 1);

    // Idempotent duplicate start
    scheduler.start();
    assert.strictEqual(scheduler.scheduledTasks.size, 1, 'Duplicate start() must be idempotent');

    // Actually invoke callback
    assert.strictEqual(typeof capturedCallback, 'function');
    await capturedCallback();

    // Verify stop
    scheduler.stop();
    assert.strictEqual(stopped, true);
    assert.strictEqual(scheduler.scheduledTasks.size, 0);
});

// ============================================================================
// 13. Regression Item 13: Policy Matrix Consistency & Activation Gate Check
// ============================================================================
test('Phase 4.5-D Correction — R13: Policy matrix consistency across model, static matrix, and gate', () => {
    for (const code of ['HSVP', 'GMADA', 'ESTATE_OFFICE_CHD']) {
        const matrixPolicy = SOURCE_POLICY_MATRIX[code];
        assert.ok(matrixPolicy, `Policy exists for ${code}`);
        assert.strictEqual(matrixPolicy.permissionStatus, PERMISSION_STATUS.GRANTED);
        assert.strictEqual(matrixPolicy.reviewStatus, 'UNDER_REVIEW');
        assert.strictEqual(matrixPolicy.isEnabled, false);
        assert.strictEqual(matrixPolicy.maxRequestsPerMinute, 1);
        assert.strictEqual(matrixPolicy.maxRequestsPerDay, 1440);
        assert.strictEqual(matrixPolicy.maxConcurrentRequests, 1);

        const activation = isSourceActivated(code);
        assert.strictEqual(activation.allowed, false);
        assert.ok(activation.reason.includes('disabled') || activation.reason.includes('UNDER_REVIEW') || activation.reason.includes('checklist'));
    }

    // Check GMADA activationChecklist typo fix
    const gmadaChecklist = SOURCE_POLICY_MATRIX.GMADA.activationChecklist;
    const hasGmadaPermissionItem = gmadaChecklist.some(item => item.item.includes('Written permission from GMADA'));
    assert.ok(hasGmadaPermissionItem, 'GMADA activation checklist must reference GMADA, not Chandigarh');
});
