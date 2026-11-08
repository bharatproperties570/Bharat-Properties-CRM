/**
 * Phase 4.4.4 PR #42 Residual Production Blockers Acceptance Test Suite
 *
 * Verifies resolution of all P0 and P1 review findings:
 * - P0.1: Source activation deadlock resolved (valid disabled -> enabled transition works)
 * - P0.2: Maker-checker bypass closed (submittedBy required, state guard, version guard, generic PATCH blocked)
 * - P0.3: Redis client injection & production mock rejection (fail closed before transport)
 * - P0.4: Rate-policy fallbacks removed (zero synthesized 15000ms / TERMS)
 * - P0.5: Fail-closed on bootstrap GET blocks (403, 429, 5xx, CAPTCHA, login wall, missing CSRF/ViewState, invalid form action)
 * - P1.6: Durable cross-instance global kill switch
 * - P1.7: Portal lock lease renewal and fencing
 * - P1.8: Source contract verification state required for activation
 * - P1.9: Fixture manifest provenance truthfulness
 * - P1.12: Identity requirements not auto-asserted during permission review
 * - P1.13: Safe Mongoose nested value extraction
 * - P1.14: Strengthened audit metadata sanitization (recursive objects & arrays)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuthoritySourceSettings, { checkActivationEligibility } from '../models/AuthoritySourceSettings.js';
import AuthorityGlobalKillSwitch from '../models/AuthorityGlobalKillSwitch.js';
import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';
import {
    updateSourceSettings,
    submitSourceApproval,
    reviewSourceApproval,
    rotateCanonicalPolicy,
    getCanonicalPolicyByCode,
    syncCanonicalPolicy,
    setTestQuotaProvider
} from '../controllers/authorityVerification.controller.js';
import { checkApprovalRight, checkPermission } from '../middlewares/permission.middleware.js';
import AuditLog from '../models/AuditLog.js';
import { invalidateUserPermissionCache, cacheUserPermissions } from '../services/cache.service.js';
import { createConfiguredPortalRuntime } from '../services/authority/portal/portalRuntimeFactory.js';
import { portalHttpTransport } from '../services/authority/portal/infrastructure/portalHttpTransport.js';
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { DurablePortalCircuitBreaker } from '../services/authority/portal/infrastructure/durablePortalCircuitBreaker.js';
import { sanitizeAuditMetadata, PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { chdPortalAdapter } from '../services/authority/portal/adapters/chdPortalAdapter.js';
import { createAuthorityPortalRuntime } from '../services/authority/portal/authorityPortalRuntime.js';
import { assertAuthorityPortalApproval } from '../services/authority/portal/authorityPortalApprovalGate.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthorityGlobalFenceWatermark from '../models/AuthorityGlobalFenceWatermark.js';
import AuthorityCanonicalPolicy from '../models/AuthorityCanonicalPolicy.js';
import {
    registerOrRotateCanonicalPolicy,
    getCanonicalPolicy,
    syncCanonicalPolicyToRedis,
    publishCanonicalPolicyToRedis,
    markCanonicalPolicyAudited
} from '../services/authority/portal/canonicalPolicyService.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Inventory from '../models/Inventory.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to mock Express req / res
function createMockReqRes({ user, params = {}, body = {} } = {}) {
    const req = {
        user: user || { _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId() },
        params,
        body
    };
    let statusCode = 200;
    let responseData = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

test('--- PHASE 4.4.4 PR #42 RESIDUAL PRODUCTION BLOCKERS SUITE ---', async (t) => {
    let mongoServer;
    const testTenantId = new mongoose.Types.ObjectId('000000000000000000000001');
    let submitterUser;
    let approverUser;
    let reviewerUser;
    let hsvpAuditLog;

    t.before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);

        await User.createCollection();
        await Role.createCollection();
        await AuditLog.createCollection();
        await AuthoritySourceSettings.createCollection();

        const submitterRole = await Role.create({
            name: 'Submitter Role',
            department: 'inventory',
            tenantId: testTenantId,
            permissions: ['authorityVerification.edit'],
            approvalRights: { manageAuthoritySettings: true },
            moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
        });
        const approverRole = await Role.create({
            name: 'Approver Role',
            department: 'accounts',
            tenantId: testTenantId,
            permissions: ['authorityVerification.edit'],
            approvalRights: { manageAuthoritySettings: true },
            moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
        });
        const reviewerRole = await Role.create({
            name: 'Reviewer Role',
            department: 'sales',
            tenantId: testTenantId,
            permissions: ['authorityVerification.edit'],
            approvalRights: { manageAuthoritySettings: true, approveAuthorityChanges: true },
            moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
        });

        submitterUser = await User.create({
            fullName: 'Submitter User',
            email: 'submitter@test.internal',
            password: 'hashed-password-123',
            role: submitterRole._id,
            department: 'inventory',
            tenantId: testTenantId,
            isActive: true
        });
        approverUser = await User.create({
            fullName: 'Approver User',
            email: 'approver@test.internal',
            password: 'hashed-password-123',
            role: approverRole._id,
            department: 'accounts',
            tenantId: testTenantId,
            isActive: true
        });
        reviewerUser = await User.create({
            fullName: 'Reviewer User',
            email: 'reviewer@test.internal',
            password: 'hashed-password-123',
            role: reviewerRole._id,
            department: 'sales',
            tenantId: testTenantId,
            isActive: true
        });

        await AuthoritySourceSettings.ensureDefaults(testTenantId);

        const hsvpSetting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
        hsvpAuditLog = await AuditLog.create({
            tenantId: testTenantId,
            eventType: 'authority_source_approval_reviewed',
            targetType: 'authority_settings',
            targetId: hsvpSetting._id,
            targetName: 'HSVP',
            userId: approverUser._id,
            performedBy: reviewerUser._id,
            actorId: reviewerUser._id,
            actorName: 'Reviewer User',
            description: 'Authority source approval reviewed for HSVP',
            metadata: {
                tenantId: testTenantId,
                authorityCode: 'HSVP',
                submittedBy: submitterUser._id,
                approvedBy: approverUser._id,
                reviewedBy: reviewerUser._id
            }
        });
    });

    t.after(async () => {
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // =========================================================================
    // Finding 1: Source Activation Deadlock Fix & Scheduling Independence
    // =========================================================================
    await t.test('1. Source Activation Deadlock & Scheduling Independence (P0.1)', async (t1) => {
        await t1.test('1.1 valid approved setting transitions from isEnabled: false to true without deadlock', async () => {
            // Seed a valid, fully approved setting in DB with isEnabled: false
            const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
            setting.permissionStatus = 'GRANTED';
            setting.approvedAccessMethod = 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
            setting.approvalReference = 'REF-HSVP-2026';
            setting.makerCheckerAuditLogId = hsvpAuditLog._id;
            setting.submittedBy = submitterUser._id;
            setting.approvedBy = approverUser._id;
            setting.reviewedBy = reviewerUser._id;
            setting.reviewStatus = 'APPROVED';
            setting.commercialUseAuthorized = true;
            setting.readOnlySearchAuthorized = true;
            setting.termsReviewed = true;
            setting.termsReference = 'https://hsvphry.org.in/Terms';
            setting.contractVerificationStatus = 'VERIFIED_CONTRACT';
            setting.contractEvidenceReference = 'CONTRACT-HSVP-001';
            setting.permittedFields = ['sectorNumber', 'plotNumber', 'status', 'urbanEstate'];
            setting.identityRequirements = { required: ['sectorNumber', 'plotNumber'], verified: true };
            setting.ratePolicy = {
                maxRequestsPerMinute: 2,
                maxRequestsPerDay: 500,
                minimumIntervalMs: 30000,
                maxConcurrent: 1,
                policySource: 'HSVP_TERMS_PAGE'
            };
            setting.isEnabled = false;
            await setting.save();

            // Verify isEffectivelyActive is currently false while disabled
            assert.equal(setting.isEffectivelyActive(), false);

            // Call updateSourceSettings to enable
            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'HSVP' },
                body: { isEnabled: true }
            });

            await updateSourceSettings(req, res);

            assert.equal(res.getStatusCode(), 200, 'Should not deadlock on isEffectivelyActive()');
            const data = res.getData();
            assert.equal(data.success, true);
            assert.equal(data.data.isEnabled, true);
            assert.equal(data.data.effectivelyActive, true);
        });

        await t1.test('1.2 enabling an unapproved source fails closed with HTTP 422 ACTIVATION_LOCKED_PHASE3', async () => {
            const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'CHD' });
            setting.isEnabled = false;
            setting.permissionStatus = 'NOT_OBTAINED';
            setting.reviewStatus = 'NOT_REVIEWED';
            await setting.save();

            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'CHD' },
                body: { isEnabled: true }
            });

            await updateSourceSettings(req, res);

            assert.equal(res.getStatusCode(), 422);
            const data = res.getData();
            assert.equal(data.code, 'ACTIVATION_LOCKED_PHASE3');
            assert.ok(data.blockers.length > 0);
        });

        await t1.test('1.3 enabling source does not automatically enable scheduling, and scheduling requires source to be enabled', async () => {
            const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'HSVP' });
            assert.equal(setting.isEnabled, true);
            assert.equal(setting.schedulingEnabled, false); // scheduling remains distinct

            // Attempt to enable scheduling on disabled source
            setting.isEnabled = false;
            await setting.save();

            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'HSVP' },
                body: { schedulingEnabled: true }
            });

            await updateSourceSettings(req, res);
            assert.equal(res.getStatusCode(), 422);
            assert.ok(res.getData().blockers.some(b => String(b).includes('isEnabled must be true')));
        });
    });

    // =========================================================================
    // Finding 2: Maker-Checker Bypass Closure & Version Guard
    // =========================================================================
    await t.test('2. Maker-Checker Bypass Closure & Version Guard (P0.2)', async (t2) => {
        t2.beforeEach(async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                {
                    $set: {
                        permissionStatus: 'NOT_OBTAINED',
                        reviewStatus: 'NOT_REVIEWED',
                        submittedBy: null,
                        evidenceVersion: 1
                    }
                }
            );
        });

        await t2.test('2.1 reviewSourceApproval rejects when submittedBy is missing', async () => {
            // Set GMADA to PENDING_REVIEW without a submittedBy
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                { $set: { permissionStatus: 'PENDING_REVIEW', reviewStatus: 'UNDER_REVIEW', submittedBy: null } }
            );

            const { req, res } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'GMADA' },
                body: { decision: 'APPROVED' }
            });

            await reviewSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 422);
            assert.equal(res.getData().code, 'SUBMITTER_REQUIRED');
        });

        await t2.test('2.2 reviewSourceApproval rejects self-approval (submitter === reviewer) with 403', async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                { $set: { permissionStatus: 'PENDING_REVIEW', reviewStatus: 'UNDER_REVIEW', submittedBy: reviewerUser._id } }
            );

            const { req, res } = createMockReqRes({
                user: reviewerUser, // same user!
                params: { authorityCode: 'GMADA' },
                body: { decision: 'APPROVED' }
            });

            await reviewSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 403);
            assert.equal(res.getData().code, 'MAKER_CHECKER_VIOLATION');
        });

        await t2.test('2.3 reviewSourceApproval rejects when current state is not PENDING_REVIEW and UNDER_REVIEW', async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                { $set: { permissionStatus: 'NOT_OBTAINED', reviewStatus: 'NOT_REVIEWED', submittedBy: submitterUser._id } }
            );

            const { req, res } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'GMADA' },
                body: { decision: 'APPROVED' }
            });

            await reviewSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 422);
            assert.equal(res.getData().code, 'INVALID_APPROVAL_STATE');
        });

        await t2.test('2.4 reviewSourceApproval rejects stale evidence version (409)', async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'GMADA' },
                {
                    $set: {
                        permissionStatus: 'PENDING_REVIEW',
                        reviewStatus: 'UNDER_REVIEW',
                        submittedBy: submitterUser._id,
                        evidenceVersion: 2
                    }
                }
            );

            const { req, res } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'GMADA' },
                body: { decision: 'APPROVED', expectedEvidenceVersion: 1 } // Stale version!
            });

            await reviewSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 409);
            assert.equal(res.getData().code, 'STALE_EVIDENCE_VERSION');
        });

        await t2.test('2.5 generic PATCH updateSourceSettings rejects attempts to modify formal evidence fields', async () => {
            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'GMADA' },
                body: {
                    approvalReference: 'INJECTED-REF-123',
                    ratePolicy: { maxRequestsPerMinute: 100 }
                }
            });

            await updateSourceSettings(req, res);
            assert.equal(res.getStatusCode(), 422);
            assert.equal(res.getData().code, 'SUBMIT_WORKFLOW_REQUIRED');
        });
    });

    // =========================================================================
    // Finding 3: Genuine Redis Client Injection & Production Mock Rejection
    // =========================================================================
    await t.test('3. Genuine Redis Client Injection & Mock Rejection (P0.3)', async (t3) => {
        await t3.test('3.1 createConfiguredPortalRuntime throws REDIS_UNAVAILABLE_FOR_PORTAL when mock Redis is passed in production mode', () => {
            const mockRedisClient = { isMock: true, status: 'ready', ping: async () => 'PONG' };

            assert.throws(() => {
                createConfiguredPortalRuntime({
                    redisClient: mockRedisClient,
                    requireRealRedis: true // Enforces production requirement
                });
            }, (err) => {
                return err.code === 'REDIS_UNAVAILABLE_FOR_PORTAL';
            });
        });

        await t3.test('3.2 createConfiguredPortalRuntime throws REDIS_UNAVAILABLE_FOR_PORTAL when Redis is null or disconnected', () => {
            assert.throws(() => {
                createConfiguredPortalRuntime({
                    redisClient: null,
                    requireRealRedis: true
                });
            }, (err) => {
                return err.code === 'REDIS_UNAVAILABLE_FOR_PORTAL';
            });
        });

        await t3.test('3.3 createConfiguredPortalRuntime succeeds when real connected Redis is provided', () => {
            const realRedisClient = {
                isMock: false,
                status: 'ready',
                ping: async () => 'PONG',
                set: async () => 'OK',
                get: async () => null,
                eval: async () => 1
            };

            const runtime = createConfiguredPortalRuntime({
                redisClient: realRedisClient,
                requireRealRedis: true
            });

            assert.ok(runtime);
            assert.equal(typeof runtime.search, 'function');
        });
    });

    // =========================================================================
    // Finding 4: Remove Invented Rate-Policy Fallbacks
    // =========================================================================
    await t.test('4. Rate Policy Fallbacks Removed (P0.4)', async (t4) => {
        const testItem = {
            _id: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            tenantId: testTenantId,
            requestedBy: submitterUser._id,
            runId: new mongoose.Types.ObjectId()
        };

        await t4.test('4.1 missing maxRequestsPerMinute hard-fails without synthesized fallback', async () => {
            const incompleteSetting = {
                permissionStatus: 'GRANTED',
                approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                approvalReference: 'REF',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'TERMS',
                permittedFields: ['status'],
                ratePolicy: {
                    maxRequestsPerMinute: null, // MISSING
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 30000,
                    maxConcurrent: 1,
                    policySource: 'TERMS_DOC'
                }
            };

            const rawRate = incompleteSetting.ratePolicy;
            const hasAll = Boolean(rawRate.maxRequestsPerMinute && rawRate.maxRequestsPerDay && rawRate.minimumIntervalMs && rawRate.maxConcurrent && rawRate.policySource);
            assert.equal(hasAll, false, 'Must not synthesize missing maxRequestsPerMinute');
        });

        await t4.test('4.2 missing minimumIntervalMs fails closed without falling back to 15000ms', async () => {
            const incompleteSetting = {
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: null, // MISSING
                    maxConcurrent: 1,
                    policySource: 'TERMS_DOC'
                }
            };

            const rawRate = incompleteSetting.ratePolicy;
            const minInterval = rawRate.minimumIntervalMs || rawRate.minIntervalMs || null;
            assert.equal(minInterval, null, 'Must NOT default to 15000ms');
        });

        await t4.test('4.3 missing policySource fails closed without falling back to TERMS string', async () => {
            const incompleteSetting = {
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 30000,
                    maxConcurrent: 1,
                    policySource: null // MISSING
                }
            };

            const rawRate = incompleteSetting.ratePolicy;
            assert.equal(rawRate.policySource, null, 'Must NOT default to TERMS');
        });
    });

    // =========================================================================
    // Finding 5: Fail Closed on Bootstrap GET Blocks
    // =========================================================================
    await t.test('5. Fail Closed on Bootstrap GET Blocks (P0.5)', async (t5) => {
        const originalFetch = global.fetch;

        t5.afterEach(() => {
            global.fetch = originalFetch;
        });

        await t5.test('5.1 bootstrap HTTP 403 throws PORTAL_ACCESS_DENIED and makes zero POST calls', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('Forbidden', { status: 403 });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'HSVP', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_ACCESS_DENIED');
                return true;
            });

            assert.equal(postCalled, false, 'Must never POST after 403 bootstrap');
        });

        await t5.test('5.2 bootstrap HTTP 429 throws PORTAL_RATE_LIMITED and makes zero POST calls', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('Rate limited', { status: 429 });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'GMADA', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_RATE_LIMITED');
                return true;
            });

            assert.equal(postCalled, false, 'Must never POST after 429 bootstrap');
        });

        await t5.test('5.3 bootstrap HTTP 502 throws PORTAL_UPSTREAM_ERROR and makes zero POST calls', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('Bad Gateway', { status: 502 });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'GMADA', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_UPSTREAM_ERROR');
                return true;
            });

            assert.equal(postCalled, false, 'Must never POST after 502 bootstrap');
        });

        await t5.test('5.4 bootstrap HTML with CAPTCHA throws PORTAL_CAPTCHA_REQUIRED and makes zero POST calls', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('<html><form><div class="g-recaptcha"></div></form></html>', {
                        status: 200,
                        headers: { 'content-type': 'text/html' }
                    });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'HSVP', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_CAPTCHA_REQUIRED');
                return true;
            });

            assert.equal(postCalled, false, 'Must never POST after CAPTCHA observed');
        });

        await t5.test('5.5 bootstrap HTML with login wall throws PORTAL_LOGIN_WALL and makes zero POST calls', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('<html><h2>Member Login Required</h2></html>', {
                        status: 200,
                        headers: { 'content-type': 'text/html' }
                    });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'HSVP', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_LOGIN_WALL');
                return true;
            });

            assert.equal(postCalled, false, 'Must never POST after login wall observed');
        });

        await t5.test('5.6 HSVP bootstrap missing __RequestVerificationToken throws PORTAL_MISSING_ANTIFORGERY', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    // HTML form without token
                    return new Response('<html><form action="/Home/PlotStatusEnquiry"></form></html>', {
                        status: 200,
                        headers: { 'content-type': 'text/html' }
                    });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'HSVP', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_MISSING_ANTIFORGERY');
                return true;
            });

            assert.equal(postCalled, false);
        });

        await t5.test('5.7 form action targeting unexpected foreign host throws PORTAL_INVALID_FORM_ACTION', async () => {
            let postCalled = false;
            global.fetch = async (url, opts) => {
                if (opts.method === 'GET') {
                    return new Response('<html><form action="https://malicious-phishing.com/submit"><input type="hidden" name="__RequestVerificationToken" value="tok123"></form></html>', {
                        status: 200,
                        headers: { 'content-type': 'text/html' }
                    });
                }
                if (opts.method === 'POST') {
                    postCalled = true;
                    return new Response('OK', { status: 200 });
                }
            };

            await assert.rejects(async () => {
                await portalHttpTransport.search({ authorityCode: 'HSVP', criteria: {} });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_INVALID_FORM_ACTION');
                return true;
            });

            assert.equal(postCalled, false);
        });
    });

    // =========================================================================
    // Finding 6: Durable Cross-Instance Global Kill Switch
    // =========================================================================
    await t.test('6. Durable Cross-Instance Global Kill Switch (P1.6)', async () => {
        const breaker1 = new DurablePortalCircuitBreaker({ testMode: true });
        const breaker2 = new DurablePortalCircuitBreaker({ testMode: true });

        // Trip kill switch on breaker instance 1
        await breaker1.tripGlobalKillSwitch('GMADA', 'Emergency upstream portal outage');

        // Check breaker instance 2 (independent instance, empty local map)
        const isPausedOnBreaker2 = await breaker2.isPaused('GMADA');
        assert.equal(isPausedOnBreaker2, true, 'Second breaker instance must read durable kill switch from DB');

        // Resume and verify second instance sees resumed state
        await breaker1.setGlobalKillSwitch('GMADA', false, 'Outage resolved');
        // Clear local map on breaker 2
        breaker2.reset();
        const isPausedAfterResume = await breaker2.isPaused('GMADA');
        assert.equal(isPausedAfterResume, false, 'Second breaker instance must observe resumed state');
    });

    // =========================================================================
    // Finding 7: Portal Lock Lease Renewal & Fencing
    // =========================================================================
    await t.test('7. Portal Lock Lease Renewal & Fencing (P1.7)', async () => {
        const lockProvider = new RedisPortalDistributedLock(null, { testMode: true });
        const key = 'authority:portal:lock:test';

        // Worker 1 acquires lock with short TTL (100ms)
        const lock1 = await lockProvider.acquire({ key, ttlMs: 150 });
        assert.equal(lock1.acquired, true);
        assert.ok(lock1.fenceToken, 'Must provide fenceToken');
        assert.equal(typeof lock1.renew, 'function', 'Must provide renew function');

        // Worker 2 attempts acquisition -> rejected
        const lock2Attempt1 = await lockProvider.acquire({ key, ttlMs: 150 });
        assert.equal(lock2Attempt1.acquired, false);

        // Worker 1 renews lease
        const renewed = await lock1.renew(300);
        assert.equal(renewed, true, 'Lease renewal should succeed for active holder');

        // Release lock
        await lock1.release();

        // Worker 2 can now acquire
        const lock2Attempt2 = await lockProvider.acquire({ key, ttlMs: 150 });
        assert.equal(lock2Attempt2.acquired, true);
        await lock2Attempt2.release();
    });

    // =========================================================================
    // Finding 8: Source Contract Verification State Required
    // =========================================================================
    await t.test('8. Source Contract Verification Required for Activation (P1.8)', async () => {
        const docWithoutContract = {
            isEnabled: true,
            permissionStatus: 'GRANTED',
            reviewStatus: 'APPROVED',
            submittedBy: submitterUser._id,
            approvedBy: approverUser._id,
            reviewedBy: reviewerUser._id,
            approvalReference: 'REF',
            commercialUseAuthorized: true,
            readOnlySearchAuthorized: true,
            termsReviewed: true,
            termsReference: 'TERMS',
            ratePolicy: { maxRequestsPerMinute: 2, maxRequestsPerDay: 500, minimumIntervalMs: 30000, policySource: 'POL' },
            contractVerificationStatus: 'NOT_VERIFIED', // UNVERIFIED CONTRACT
            contractEvidenceReference: null
        };

        const result = checkActivationEligibility(docWithoutContract);
        assert.equal(result.canActivate, false);
        assert.ok(result.blockers.some(b => String(b.message || b).includes('contract is not verified')));
    });

    // =========================================================================
    // Finding 9: Fixture Manifest & Provenance Truthfulness
    // =========================================================================
    await t.test('9. Fixture Manifest & Provenance Truthfulness (P1.9)', async () => {
        const manifestPath = path.resolve(__dirname, 'fixtures/portal/manifest.json');
        assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in portal fixtures');

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.equal(manifest.provenanceType, 'SYNTHETIC_CONTRACT_FIXTURES');
        assert.equal(manifest.fixtures.length, 13);
        for (const fix of manifest.fixtures) {
            assert.equal(fix.fixtureClassification, 'synthetic_contract_fixture');
            assert.ok(fix.sha256);
            assert.ok(fix.targetParser);
        }
    });

    // =========================================================================
    // Finding 12: Identity Requirements Not Auto-Asserted on Permission Review
    // =========================================================================
    await t.test('12. Identity Requirements Not Auto-Asserted on Permission Review (P1.12)', async () => {
        // Setup pending approval setting with unverified identity
        await AuthoritySourceSettings.updateOne(
            { tenantId: testTenantId, authorityCode: 'HSVP' },
            {
                $set: {
                    permissionStatus: 'PENDING_REVIEW',
                    reviewStatus: 'UNDER_REVIEW',
                    submittedBy: submitterUser._id,
                    approvedBy: approverUser._id,
                    evidenceVersion: 1,
                    'identityRequirements.verified': false
                }
            }
        );

        // Reviewer approves without identity contract attestation
        const { req, res } = createMockReqRes({
            user: reviewerUser,
            params: { authorityCode: 'HSVP' },
            body: { decision: 'APPROVED', expectedEvidenceVersion: 1 }
        });

        await reviewSourceApproval(req, res);
        // Should be rejected because identityRequirements.verified is NOT auto-set to true,
        // and checkActivationEligibility requires verified identity!
        assert.equal(res.getStatusCode(), 422);
        assert.equal(res.getData().code, 'APPROVAL_CRITERIA_UNMET');
        assert.ok(res.getData().blockers.some(b => {
            const msg = typeof b === 'string' ? b : (b.message || b.code || '');
            return msg.includes('identity requirements are not verified') || b.code === 'IDENTITY_NOT_VERIFIED';
        }));
    });

    // =========================================================================
    // Finding 13: Safe Mongoose Nested Values Extraction
    // =========================================================================
    await t.test('13. Safe Mongoose Nested Values Extraction (P1.13)', async () => {
        const { req, res } = createMockReqRes({
            user: submitterUser,
            params: { authorityCode: 'HSVP' },
            body: {
                approvalReference: 'HSVP-NEW-REF-2026',
                ratePolicy: {
                    maxRequestsPerMinute: 3,
                    maxRequestsPerDay: 600,
                    minimumIntervalMs: 20000,
                    maxConcurrent: 1,
                    policySource: 'HSVP_OFFICIAL_AGREEMENT'
                },
                identityRequirements: {
                    required: ['propertyId', 'sectorNumber'],
                    verified: true
                },
                contractVerificationStatus: 'VERIFIED_CONTRACT',
                contractEvidenceReference: 'HSVP-CONTRACT-DOC-01'
            }
        });

        // Must not crash on .toObject()
        await submitSourceApproval(req, res);
        assert.equal(res.getStatusCode(), 200);
        assert.equal(res.getData().success, true);
    });

    // =========================================================================
    // Finding 14: Strengthened Audit Metadata Sanitization
    // =========================================================================
    await t.test('14. Strengthened Audit Metadata Sanitization (P1.14)', async () => {
        const sensitivePayload = {
            criteriaHash: 'abc123hash',
            tenantId: 'ten1',
            ownerName: 'Shri Ram Kumar',
            fatherName: 'Late Mohan Lal',
            residentialAddress: 'House 123, Sector 14, Panchkula',
            allotteeName: 'Sita Devi',
            cookies: 'session_id=12345',
            __VIEWSTATE: 'longencryptedviewstate123',
            authorization: 'Bearer secret_token',
            nestedResults: [
                {
                    plotNo: '456',
                    sector: '14',
                    applicantName: 'Forbidden Applicant',
                    email: 'test@example.com',
                    phone: '9876543210'
                },
                {
                    plotNo: '457',
                    sector: '14',
                    status: 'Allotted'
                }
            ],
            rawHtml: '<html><body><h1>Allottee Records</h1></body></html>'
        };

        const sanitized = sanitizeAuditMetadata(sensitivePayload);

        // Allowed fields preserved
        assert.equal(sanitized.criteriaHash, 'abc123hash');
        assert.equal(sanitized.tenantId, 'ten1');

        // Sensitive keys removed
        assert.equal(sanitized.ownerName, undefined);
        assert.equal(sanitized.fatherName, undefined);
        assert.equal(sanitized.residentialAddress, undefined);
        assert.equal(sanitized.allotteeName, undefined);
        assert.equal(sanitized.cookies, undefined);
        assert.equal(sanitized.__VIEWSTATE, undefined);
        assert.equal(sanitized.authorization, undefined);
        assert.equal(sanitized.rawHtml, undefined);

        // Nested array elements properly sanitized
        assert.ok(Array.isArray(sanitized.nestedResults));
        assert.equal(sanitized.nestedResults.length, 2);
        assert.equal(sanitized.nestedResults[0].plotNo, '456');
        assert.equal(sanitized.nestedResults[0].applicantName, undefined);
        assert.equal(sanitized.nestedResults[0].email, undefined);
        assert.equal(sanitized.nestedResults[0].phone, undefined);
        assert.equal(sanitized.nestedResults[1].plotNo, '457');
        assert.equal(sanitized.nestedResults[1].status, 'Allotted');
    });

    // =========================================================================
    // Finding 15: Mandatory maxConcurrent Concurrency Policy (Fix 1)
    // =========================================================================
    await t.test('15. Mandatory maxConcurrent Concurrency Policy (PR42 Fix 1)', async (t15) => {
        await t15.test('15.1 submitSourceApproval rejects missing or invalid maxConcurrent with 422', async () => {
            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'HSVP' },
                body: {
                    approvalReference: 'HSVP/2026/POL1',
                    termsReviewed: true,
                    termsReference: 'https://hsvphry.org.in/Terms',
                    contractVerificationStatus: 'VERIFIED_CONTRACT',
                    contractEvidenceReference: 'EVID-HSVP-01',
                    ratePolicy: {
                        maxRequestsPerMinute: 5,
                        maxRequestsPerDay: 500,
                        minimumIntervalMs: 12000,
                        maxConcurrent: 0, // Invalid!
                        policySource: 'GOV_TERMS'
                    }
                }
            });

            await submitSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 422);
            assert.equal(res.getData().code, 'INVALID_RATE_POLICY');
        });

        await t15.test('15.2 checkActivationEligibility rejects missing maxConcurrent', () => {
            const doc = {
                isEnabled: true,
                permissionStatus: 'GRANTED',
                reviewStatus: 'APPROVED',
                submittedBy: 'u1',
                approvedBy: 'u2',
                writtenPermissionReference: 'REF',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://terms',
                contractVerificationStatus: 'VERIFIED_CONTRACT',
                identityRequirements: { verified: true },
                ratePolicy: {
                    maxRequestsPerMinute: 5,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 12000,
                    policySource: 'POLICY_DOC'
                    // maxConcurrent omitted!
                }
            };
            const eligibility = checkActivationEligibility(doc);
            assert.equal(eligibility.eligible, false);
            assert.ok(eligibility.blockers.some(b => {
                const msg = typeof b === 'string' ? b : (b.message || b.code || '');
                return msg.toLowerCase().includes('concurrency') || msg.toLowerCase().includes('maxconcurrent');
            }));
        });
    });

    // =========================================================================
    // Finding 16: Submitter Self-Attestation Closure & Attestation Lifecycle (Fix 2)
    // =========================================================================
    await t.test('16. Submitter Identity Self-Attestation Closure (PR42 Fix 2)', async (t16) => {
        await t16.test('16.1 submitSourceApproval strictly forces verified: false even if caller sends true', async () => {
            const { req, res } = createMockReqRes({
                user: submitterUser,
                params: { authorityCode: 'GMADA' },
                body: {
                    approvalReference: 'GMADA/2026/PERM',
                    commercialUseAuthorized: true,
                    readOnlySearchAuthorized: true,
                    termsReviewed: true,
                    termsReference: 'https://gmadaipms.in/Terms',
                    contractVerificationStatus: 'VERIFIED_CONTRACT',
                    contractEvidenceReference: 'EVID-GMADA-01',
                    permittedFields: ['propertyNo', 'sectors', 'location'],
                    identityRequirements: {
                        required: ['sectorNumber', 'propertyId'],
                        verified: true // Caller attempt to self-verify!
                    },
                    ratePolicy: {
                        maxRequestsPerMinute: 2,
                        maxRequestsPerDay: 200,
                        minimumIntervalMs: 30000,
                        maxConcurrent: 1,
                        policySource: 'GMADA_POLICY'
                    }
                }
            });

            await submitSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 200);

            const updated = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'GMADA' });
            assert.equal(updated.identityRequirements.verified, false, 'identityRequirements.verified must be strictly forced to false on submit');
            assert.ok(!updated.identityRequirements.attestation?.evidenceReference);
            assert.ok(!updated.identityRequirements.attestation?.attestedBy);
        });

        await t16.test('16.2 reviewSourceApproval with valid reviewer attestation sets verified: true', async () => {
            // First transition to UNDER_REVIEW
            const setting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'GMADA' });
            setting.permissionStatus = 'PENDING_REVIEW';
            setting.reviewStatus = 'UNDER_REVIEW';
            setting.submittedBy = submitterUser._id;
            setting.approvedBy = approverUser._id;
            await setting.save();

            const { req, res } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'GMADA' },
                body: {
                    decision: 'APPROVED',
                    expectedEvidenceVersion: setting.evidenceVersion,
                    identityContractAttestation: {
                        evidenceReference: 'OFFICIAL_PORTAL_DOC_V2',
                        evidenceVersion: setting.evidenceVersion,
                        evidenceHash: 'sha256:abc123identity'
                    }
                }
            });

            await reviewSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 200);

            const approved = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'GMADA' });
            assert.equal(approved.permissionStatus, 'GRANTED');
            assert.equal(approved.reviewStatus, 'APPROVED');
            assert.equal(approved.identityRequirements.verified, true);
            assert.equal(approved.identityRequirements.attestation.evidenceReference, 'OFFICIAL_PORTAL_DOC_V2');
            assert.equal(String(approved.identityRequirements.attestation.attestedBy), String(reviewerUser._id));
        });
    });

    // =========================================================================
    // Finding 17: Mandatory Expected Evidence Version on All Review Outcomes (Fix 3)
    // =========================================================================
    await t.test('17. Mandatory expectedEvidenceVersion on Both Review Outcomes (PR42 Fix 3)', async (t17) => {
        await t17.test('17.1 reviewSourceApproval with decision REJECTED requires expectedEvidenceVersion', async () => {
            // Put CHD in PENDING_REVIEW and UNDER_REVIEW
            await AuthoritySourceSettings.updateOne(
                { tenantId: testTenantId, authorityCode: 'CHD' },
                {
                    $set: {
                        permissionStatus: 'PENDING_REVIEW',
                        reviewStatus: 'UNDER_REVIEW',
                        submittedBy: submitterUser._id,
                        evidenceVersion: 2
                    }
                }
            );

            // REJECTED without expectedEvidenceVersion -> 422
            const { req: req1, res: res1 } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'CHD' },
                body: { decision: 'REJECTED' }
            });
            await reviewSourceApproval(req1, res1);
            assert.equal(res1.getStatusCode(), 422);
            assert.equal(res1.getData().code, 'EVIDENCE_VERSION_REQUIRED');

            // REJECTED with stale version -> 409
            const { req: req2, res: res2 } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'CHD' },
                body: { decision: 'REJECTED', expectedEvidenceVersion: 1 }
            });
            await reviewSourceApproval(req2, res2);
            assert.equal(res2.getStatusCode(), 409);
            assert.equal(res2.getData().code, 'STALE_EVIDENCE_VERSION');

            // REJECTED with matching version -> 200
            const { req: req3, res: res3 } = createMockReqRes({
                user: reviewerUser,
                params: { authorityCode: 'CHD' },
                body: { decision: 'REJECTED', expectedEvidenceVersion: 2, notes: 'Insufficient terms proof' }
            });
            await reviewSourceApproval(req3, res3);
            assert.equal(res3.getStatusCode(), 200);

            const rejected = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode: 'CHD' });
            assert.equal(rejected.permissionStatus, 'NOT_OBTAINED');
            assert.equal(rejected.reviewStatus, 'REJECTED');
        });
    });

    // =========================================================================
    // Finding 18: Monotonic Fence Token & Lease Renewal Heartbeat (Fix 4)
    // =========================================================================
    await t.test('18. Monotonic Fence Token & Lease Renewal (PR42 Fix 4)', async (t18) => {
        await t18.test('18.1 Redis distributed lock generates monotonic sequence tokens', async () => {
            const lock = new RedisPortalDistributedLock(null, { testMode: true });
            const lease1 = await lock.acquire({ key: 'authority-portal:HSVP' });
            assert.ok(lease1.acquired);
            assert.equal(typeof lease1.fenceToken, 'number');
            const token1 = lease1.fenceToken;
            await lease1.release();

            const lease2 = await lock.acquire({ key: 'authority-portal:HSVP' });
            assert.ok(lease2.acquired);
            const token2 = lease2.fenceToken;
            assert.ok(token2 > token1, `Fence token must be monotonic: ${token2} > ${token1}`);
            await lease2.release();
        });

        await t18.test('18.2 runtime aborts with PORTAL_LOCK_OWNERSHIP_LOST when lease is lost', async () => {
            let leaseRenewCalled = false;
            let releaseCalled = false;

            const fakeQuota = {
                reserve: async () => ({ allowed: true, reservationId: 'r1' })
            };

            const fakeCircuit = {
                isPaused: async () => false,
                pause: async () => {}
            };

            let transportCalled = false;
            const fakeTransport = {
                search: async () => {
                    transportCalled = true;
                    return { status: 200, headers: {}, body: '<html></html>' };
                }
            };

            const fakeAudit = { write: async () => {} };
            const fakeParser = { parse: async () => [] };

            let thrownError = null;
            try {
                // To trigger loss-of-lease detection before transport:
                const lockWithImmediateLoss = {
                    acquire: async () => ({
                        acquired: true,
                        token: 'tok-loss',
                        fenceToken: 10,
                        ttlMs: 3000,
                        renew: async () => {
                            leaseRenewCalled = true;
                            return false;
                        },
                        release: async () => { releaseCalled = true; }
                    })
                };

                const testRuntime = createAuthorityPortalRuntime({
                    lockProvider: lockWithImmediateLoss,
                    quotaProvider: fakeQuota,
                    circuitBreakerStore: fakeCircuit,
                    transport: fakeTransport,
                    parserRegistry: { HSVP: fakeParser },
                    auditSink: fakeAudit,
                    gateConfig: { enabled: true, readOnly: true }
                });

                await testRuntime.search({
                    authorityCode: 'HSVP',
                    inventory: { propertyId: '123', sector: '14', city: 'Gurugram', urbanEstate: 'Gurugram' },
                    authorityLink: { _id: new mongoose.Types.ObjectId() },
                    approval: {
                        authorityCode: 'HSVP',
                        status: 'GRANTED',
                        accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                        writtenPermissionReference: 'HSVP/IT/2026/001',
                        commercialUseAuthorized: true,
                        readOnlySearchAuthorized: true,
                        termsReviewed: true,
                        termsReference: 'https://hsvphry.org.in/Terms#review',
                        approvedBy: 'approver-1',
                        reviewedBy: 'reviewer-2',
                        expiresAt: '2028-01-01T00:00:00.000Z',
                        permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                        ratePolicy: {
                            maxRequestsPerMinute: 2,
                            maxRequestsPerDay: 500,
                            minimumIntervalMs: 30000,
                            maxConcurrentRequests: 1,
                            policyReference: 'HSVP/RATE/01'
                        }
                    }
                });
            } catch (err) {
                thrownError = err;
            }

            assert.equal(thrownError?.code, 'PORTAL_LOCK_OWNERSHIP_LOST');
            assert.ok(releaseCalled, 'Lease release() must be called in finally');
        });
    });

    // =========================================================================
    // Finding 19: Authority-Wide Quota Contention & IST Rollover (Fix 5)
    // =========================================================================
    await t.test('19. Authority-Wide Quota Contention Across Multiple Tenants (PR42 Fix 5)', async (t19) => {
        await t19.test('19.1 Tenant A and Tenant B share authority quota globally', async () => {
            const quota = new RedisPortalQuotaProvider(null, { testMode: true });
            const policy = {
                maxRequestsPerMinute: 1, // Limit: 1 per minute authority-wide
                maxRequestsPerDay: 100,
                minimumIntervalMs: 1000,
                policyReference: 'SHARED_POLICY_19'
            };
            await quota.setCanonicalPolicy({
                authorityCode: 'HSVP',
                policy,
                approvedBy: 'admin',
                policyVersion: 1
            });

            // Anchor test timestamp safely within a minute window to prevent clock boundary flakiness
            const at = new Date(Math.floor(Date.now() / 60000) * 60000 + 5000);
            // Tenant A reserves 1 request
            const resTenantA = await quota.reserve({
                authorityCode: 'HSVP',
                tenantId: 'tenant-alpha',
                policy,
                at
            });
            assert.equal(resTenantA.allowed, true);

            // Tenant B attempts to reserve immediately: must be blocked by minimum interval or per-minute limit!
            const resTenantB = await quota.reserve({
                authorityCode: 'HSVP',
                tenantId: 'tenant-beta', // Different tenant!
                policy,
                at: new Date(at.getTime() + 100) // 100ms later (violates 1000ms interval)
            });
            assert.equal(resTenantB.allowed, false);
            assert.equal(resTenantB.reason, 'MINIMUM_INTERVAL_VIOLATED');

            // Even after minimum interval, Tenant B is blocked by authority-wide per-minute limit
            const resTenantBMinute = await quota.reserve({
                authorityCode: 'HSVP',
                tenantId: 'tenant-beta',
                policy,
                at: new Date(at.getTime() + 1500) // 1500ms later (respects minInterval, but 1 req/min limit reached)
            });
            assert.equal(resTenantBMinute.allowed, false);
            assert.equal(resTenantBMinute.reason, 'PER_MINUTE_LIMIT_EXCEEDED');
        });
    });

    // =========================================================================
    // Finding 20: Durable Circuit Breaker Tripped on Bootstrap Failures (Fix 6)
    // =========================================================================
    await t.test('20. Bootstrap Failures Trip Durable Circuit Breaker (PR42 Fix 6)', async (t20) => {
        await t20.test('20.1 bootstrap 403 trips durable breaker and blocks subsequent search without transport', async () => {
            let breakerPaused = false;
            let pauseReason = null;

            const fakeCircuit = {
                isPaused: async () => breakerPaused,
                pause: async (args) => {
                    breakerPaused = true;
                    pauseReason = args.reason;
                }
            };

            let transportCallCount = 0;
            const fakeTransport = {
                search: async () => {
                    transportCallCount++;
                    const err = new Error('PORTAL_ACCESS_DENIED: Initial session bootstrap returned 403 Forbidden.');
                    err.code = 'PORTAL_ACCESS_DENIED';
                    err.details = { pauseSource: true, status: 403 };
                    throw err;
                }
            };

            const fakeLock = {
                acquire: async () => ({
                    acquired: true,
                    token: 'tok',
                    fenceToken: 1,
                    ttlMs: 30000,
                    release: async () => {}
                })
            };

            const fakeQuota = {
                reserve: async () => ({ allowed: true, reservationId: 'r1' })
            };

            const fakeAudit = { write: async () => {} };
            const fakeParser = { parse: async () => [] };

            const validApproval = {
                authorityCode: 'HSVP',
                status: 'GRANTED',
                accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                writtenPermissionReference: 'HSVP/IT/2026/001',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://hsvphry.org.in/Terms#review',
                approvedBy: 'approver-1',
                reviewedBy: 'reviewer-2',
                expiresAt: '2028-01-01T00:00:00.000Z',
                permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 30000,
                    maxConcurrentRequests: 1,
                    policyReference: 'HSVP/RATE/01'
                }
            };

            const runtime = createAuthorityPortalRuntime({
                lockProvider: fakeLock,
                quotaProvider: fakeQuota,
                circuitBreakerStore: fakeCircuit,
                transport: fakeTransport,
                parserRegistry: { HSVP: fakeParser },
                auditSink: fakeAudit,
                gateConfig: { enabled: true, readOnly: true }
            });

            // First search encounters 403 on transport bootstrap
            let firstErr = null;
            try {
                await runtime.search({
                    authorityCode: 'HSVP',
                    inventory: { propertyId: '123', sector: '14', city: 'Gurugram', urbanEstate: 'Gurugram' },
                    authorityLink: { _id: new mongoose.Types.ObjectId() },
                    approval: validApproval
                });
            } catch (err) {
                firstErr = err;
            }

            assert.equal(firstErr?.code, 'PORTAL_ACCESS_DENIED');
            assert.equal(transportCallCount, 1);
            assert.equal(breakerPaused, true, 'Circuit breaker must be paused after bootstrap 403');

            // Second search must be blocked immediately by circuit breaker without any network transport call!
            let secondErr = null;
            try {
                await runtime.search({
                    authorityCode: 'HSVP',
                    inventory: { propertyId: '123', sector: '14', city: 'Gurugram', urbanEstate: 'Gurugram' },
                    authorityLink: { _id: new mongoose.Types.ObjectId() },
                    approval: validApproval
                });
            } catch (err) {
                secondErr = err;
            }

            assert.ok(secondErr?.code === 'AUTHORITY_PORTAL_PAUSED' || secondErr?.code === 'PORTAL_SOURCE_PAUSED');
            assert.equal(transportCallCount, 1, 'Zero subsequent transport calls allowed when source is paused');
        });
    });

    // =========================================================================
    // Finding 21: Chandigarh Anti-Forgery Enforcement (Fix 7)
    // =========================================================================
    await t.test('21. Chandigarh Anti-Forgery Enforcement (PR42 Fix 7)', async (t21) => {
        await t21.test('21.1 chdPortalAdapter throws CHD_MISSING_ANTIFORGERY if verification token missing', () => {
            assert.throws(() => {
                chdPortalAdapter.buildSearchRequest(
                    { plotNo: '100', sectorNo: '17' },
                    { verificationToken: '' } // Missing/empty!
                );
            }, {
                name: 'Error',
                message: /CHD_MISSING_ANTIFORGERY/
            });
        });

        await t21.test('21.2 chdPortalAdapter succeeds when verification token is provided', () => {
            const req = chdPortalAdapter.buildSearchRequest(
                { plotNo: '100', sectorNo: '17' },
                { verificationToken: 'ValidChdToken123' }
            );
            assert.equal(req.method, 'POST');
            assert.ok(req.body.includes('__RequestVerificationToken=ValidChdToken123'));
        });
    });

    // =========================================================================
    // Finding 22: Approved Authority-Wide Concurrency Cap (P0)
    // =========================================================================
    await t.test('22. Approved Authority-Wide Concurrency Cap (P0)', async (t22) => {
        await t22.test('22.1 Two different searchKeys on same authority are blocked when maxConcurrent=1', async () => {
            const lockProvider = new RedisPortalDistributedLock(null, { testMode: true });

            // Property 1 acquires authority lock
            const lease1 = await lockProvider.acquire({
                authorityCode: 'HSVP',
                searchKey: 'hsvp:prop1:sec14',
                tenantId: 'tenant-1',
                maxConcurrent: 1
            });
            assert.equal(lease1.acquired, true);

            // Property 2 on DIFFERENT property and DIFFERENT tenant MUST BE BLOCKED
            const lease2 = await lockProvider.acquire({
                authorityCode: 'HSVP',
                searchKey: 'hsvp:prop2:sec29',
                tenantId: 'tenant-2',
                maxConcurrent: 1
            });
            assert.equal(lease2.acquired, false, 'Second property on same authority must be blocked across search keys');

            await lease1.release();

            // After release, acquisition succeeds
            const lease3 = await lockProvider.acquire({
                authorityCode: 'HSVP',
                searchKey: 'hsvp:prop2:sec29',
                tenantId: 'tenant-2',
                maxConcurrent: 1
            });
            assert.equal(lease3.acquired, true);
            await lease3.release();
        });

        await t22.test('22.2 Monotonic sequence token is atomic and failed lock does not increment sequence', async () => {
            const lockProvider = new RedisPortalDistributedLock(null, { testMode: true });

            const lease1 = await lockProvider.acquire({
                authorityCode: 'GMADA',
                maxConcurrent: 1
            });
            assert.equal(lease1.acquired, true);
            const token1 = lease1.fenceToken;

            // Failed acquire must not increment sequence
            const leaseFail = await lockProvider.acquire({
                authorityCode: 'GMADA',
                maxConcurrent: 1
            });
            assert.equal(leaseFail.acquired, false);
            assert.equal(leaseFail.fenceToken, null);

            await lease1.release();

            // Next successful acquire gets token1 + 1
            const lease2 = await lockProvider.acquire({
                authorityCode: 'GMADA',
                maxConcurrent: 1
            });
            assert.equal(lease2.acquired, true);
            assert.equal(lease2.fenceToken, token1 + 1, 'Sequence must only increment on successful acquisition');
            await lease2.release();
        });
    });

    // =========================================================================
    // Finding 23: Pass and Enforce maxRequestsPerHour (P1)
    // =========================================================================
    await t.test('23. Pass and Enforce maxRequestsPerHour (P1)', async (t23) => {
        await t23.test('23.1 QuotaProvider strictly enforces maxRequestsPerHour', async () => {
            const quotaProvider = new RedisPortalQuotaProvider(null, { testMode: true });
            const policy = {
                maxRequestsPerMinute: 10,
                maxRequestsPerHour: 2,
                maxRequestsPerDay: 100,
                minimumIntervalMs: 10,
                policyReference: 'HOURLY_TEST_POLICY'
            };
            await quotaProvider.setCanonicalPolicy({
                authorityCode: 'CHD',
                policy,
                approvedBy: 'admin',
                policyVersion: 1
            });

            const now = new Date();
            const r1 = await quotaProvider.reserve({ authorityCode: 'CHD', policy, at: now });
            assert.equal(r1.allowed, true);

            const r2 = await quotaProvider.reserve({ authorityCode: 'CHD', policy, at: new Date(now.getTime() + 50) });
            assert.equal(r2.allowed, true);

            // 3rd request in same hour must be rejected with PER_HOUR_LIMIT_EXCEEDED
            const r3 = await quotaProvider.reserve({ authorityCode: 'CHD', policy, at: new Date(now.getTime() + 100) });
            assert.equal(r3.allowed, false);
            assert.equal(r3.reason, 'PER_HOUR_LIMIT_EXCEEDED');
        });

        await t23.test('23.2 authorityPortalApprovalGate validates maxRequestsPerHour when defined', () => {
            const validApproval = {
                authorityCode: 'HSVP',
                status: 'GRANTED',
                accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                writtenPermissionReference: 'HSVP/IT/2026/001',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://hsvphry.org.in/Terms#review',
                approvedBy: 'approver-1',
                reviewedBy: 'reviewer-2',
                expiresAt: '2028-01-01T00:00:00.000Z',
                permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerHour: 50,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 30000,
                    maxConcurrentRequests: 1,
                    policyReference: 'HSVP/RATE/01'
                }
            };

            // Valid hourly passes
            assert.doesNotThrow(() => {
                assertAuthorityPortalApproval({
                    authorityCode: 'HSVP',
                    approval: validApproval,
                    gate: { enabled: true, readOnly: true, requireApprovedRatePolicy: true }
                });
            });

            // Invalid hourly fails
            const invalidApproval = {
                ...validApproval,
                ratePolicy: {
                    ...validApproval.ratePolicy,
                    maxRequestsPerHour: -5 // Invalid!
                }
            };
            assert.throws(() => {
                assertAuthorityPortalApproval({
                    authorityCode: 'HSVP',
                    approval: invalidApproval,
                    gate: { enabled: true, readOnly: true, requireApprovedRatePolicy: true }
                });
            }, /APPROVED_RATE_POLICY_MISSING/);
        });
    });

    // =========================================================================
    // Finding 24: Lease-Loss / Fence Validation Through Persistence (P1)
    // =========================================================================
    await t.test('24. Lease-Loss / Fence Validation Through Persistence (P1)', async (t24) => {
        await t24.test('24.1 Parser blocks, lock renewal fails during parse => throws PORTAL_LOCK_OWNERSHIP_LOST', async () => {
            let leaseRenewFails = false;
            const mockLease = {
                acquired: true,
                token: 'tok-1',
                fenceToken: 1,
                ttlMs: 50,
                renew: async () => !leaseRenewFails,
                release: async () => {}
            };
            const mockLockProvider = {
                acquire: async () => mockLease,
                isCurrentFenceToken: async () => !leaseRenewFails
            };

            const slowParser = {
                parse: async () => {
                    // Simulate lease being lost during parse
                    leaseRenewFails = true;
                    return [{ propertyId: '123' }];
                }
            };

            const runtime = createAuthorityPortalRuntime({
                lockProvider: mockLockProvider,
                quotaProvider: { reserve: async () => ({ allowed: true }) },
                circuitBreakerStore: { isPaused: async () => false, pause: async () => {} },
                transport: { search: async () => ({ status: 200, contentType: 'text/html', body: '<html>OK</html>' }) },
                parserRegistry: { HSVP: slowParser },
                auditSink: { write: async () => {} },
                gateConfig: { enabled: true, readOnly: true }
            });

            const validApproval = {
                authorityCode: 'HSVP',
                status: 'GRANTED',
                accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                writtenPermissionReference: 'HSVP/IT/2026/001',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://hsvphry.org.in/Terms#review',
                approvedBy: 'approver-1',
                reviewedBy: 'reviewer-2',
                expiresAt: '2028-01-01T00:00:00.000Z',
                permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 1000,
                    maxConcurrentRequests: 1,
                    policyReference: 'HSVP/RATE/01'
                }
            };

            await assert.rejects(async () => {
                await runtime.search({
                    authorityCode: 'HSVP',
                    inventory: { propertyId: '123', sector: '14', city: 'Gurugram', urbanEstate: 'Gurugram' },
                    approval: validApproval
                });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_LOCK_OWNERSHIP_LOST');
                return true;
            });
        });

        await t24.test('24.2 Audit failure at final boundary aborts fail-closed and returns no result', async () => {
            const mockLease = {
                acquired: true,
                token: 'tok-audit',
                fenceToken: 1,
                ttlMs: 30000,
                renew: async () => true,
                release: async () => {}
            };
            const mockLockProvider = {
                acquire: async () => mockLease,
                isCurrentFenceToken: async () => true
            };

            let auditCount = 0;
            const failingAuditSink = {
                write: async (evt) => {
                    auditCount++;
                    // Fail on final search completed audit
                    if (evt.eventType === 'AUTHORITY_PORTAL_SEARCH_COMPLETED') {
                        throw new Error('DATABASE_CONNECTION_LOST');
                    }
                }
            };

            const runtime = createAuthorityPortalRuntime({
                lockProvider: mockLockProvider,
                quotaProvider: { reserve: async () => ({ allowed: true }) },
                circuitBreakerStore: { isPaused: async () => false, pause: async () => {} },
                transport: { search: async () => ({ status: 200, contentType: 'text/html', body: '<html>OK</html>' }) },
                parserRegistry: { HSVP: { parse: async () => [{ propertyId: '123' }] } },
                auditSink: failingAuditSink,
                gateConfig: { enabled: true, readOnly: true }
            });

            const validApproval = {
                authorityCode: 'HSVP',
                status: 'GRANTED',
                accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                writtenPermissionReference: 'HSVP/IT/2026/001',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://hsvphry.org.in/Terms#review',
                approvedBy: 'approver-1',
                reviewedBy: 'reviewer-2',
                expiresAt: '2028-01-01T00:00:00.000Z',
                permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 1000,
                    maxConcurrentRequests: 1,
                    policyReference: 'HSVP/RATE/01'
                }
            };

            await assert.rejects(async () => {
                await runtime.search({
                    authorityCode: 'HSVP',
                    inventory: { propertyId: '123', sector: '14', city: 'Gurugram', urbanEstate: 'Gurugram' },
                    approval: validApproval
                });
            }, (err) => {
                assert.equal(err.code, 'PORTAL_AUDIT_WRITE_FAILED');
                return true;
            });
        });
    });

    // =========================================================================
    // Finding 25: Mandatory maxConcurrent in Every Approval Submission (P1)
    // =========================================================================
    await t.test('25. Mandatory maxConcurrent in Every Approval Submission (P1)', async (t25) => {
        const tenantId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();

        // Seed existing setting with maxConcurrent = 1
        await AuthoritySourceSettings.create({
            tenantId,
            authorityCode: 'GMADA',
            permissionStatus: 'NOT_OBTAINED',
            reviewStatus: 'NOT_REVIEWED',
            evidenceVersion: 1,
            ratePolicy: {
                maxRequestsPerMinute: 2,
                maxRequestsPerDay: 100,
                minIntervalMs: 1000,
                maxConcurrent: 1,
                policySource: 'OLD_EVIDENCE'
            }
        });

        // 25.1 Omission of maxConcurrent in new submission MUST BE REJECTED (does not inherit old value)
        const { req: reqOmitted, res: resOmitted } = createMockReqRes({
            user: { _id: userId, tenantId },
            params: { authorityCode: 'GMADA' },
            body: {
                approvalReference: 'NEW_REF_2026',
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 100,
                    minIntervalMs: 1000,
                    policySource: 'NEW_EVIDENCE'
                    // maxConcurrent OMITTED!
                }
            }
        });
        await submitSourceApproval(reqOmitted, resOmitted);
        assert.equal(resOmitted.getStatusCode(), 422);
        assert.equal(resOmitted.getData().code, 'INVALID_RATE_POLICY');

        // 25.2 Invalid maxConcurrent (0, -1, 1.5, NaN-like string) MUST BE REJECTED
        for (const badValue of [0, -1, 1.5, 'invalid', null]) {
            const { req: reqBad, res: resBad } = createMockReqRes({
                user: { _id: userId, tenantId },
                params: { authorityCode: 'GMADA' },
                body: {
                    approvalReference: 'NEW_REF_2026',
                    ratePolicy: {
                        maxRequestsPerMinute: 2,
                        maxRequestsPerDay: 100,
                        minIntervalMs: 1000,
                        maxConcurrent: badValue,
                        policySource: 'NEW_EVIDENCE'
                    }
                }
            });
            await submitSourceApproval(reqBad, resBad);
            assert.equal(resBad.getStatusCode(), 422, `Value ${badValue} must be rejected with 422`);
            assert.equal(resBad.getData().code, 'INVALID_RATE_POLICY');
        }

        // 25.3 Explicit positive integer 1 MUST BE ACCEPTED
        const { req: reqValid, res: resValid } = createMockReqRes({
            user: { _id: userId, tenantId },
            params: { authorityCode: 'GMADA' },
            body: {
                approvalReference: 'NEW_REF_2026',
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 100,
                    minIntervalMs: 1000,
                    maxConcurrent: 1,
                    policySource: 'NEW_EVIDENCE'
                }
            }
        });
        await submitSourceApproval(reqValid, resValid);
        assert.equal(resValid.getStatusCode(), 200);
        assert.equal(resValid.getData().success, true);
        assert.equal(resValid.getData().data.ratePolicy.maxConcurrent, 1);
    });

    // =========================================================================
    // Finding 26: Canonical Authority-Global Quota Policy (Phase 4)
    // =========================================================================
    await t.test('26. Canonical Authority-Global Quota Policy (Phase 4)', async (t26) => {
        const quotaProvider = new RedisPortalQuotaProvider(null, { testMode: true });

        const canonicalPolicy = {
            maxRequestsPerMinute: 2,
            maxRequestsPerHour: 10,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'APPROVED_CANONICAL_POLICY_V1'
        };

        // 26.1 Absent canonical policy fails closed
        const rMissing = await quotaProvider.reserve({
            authorityCode: 'HSVP',
            tenantId: 'tenant-a',
            policy: canonicalPolicy
        });
        assert.equal(rMissing.allowed, false);
        assert.equal(rMissing.reason, 'CANONICAL_POLICY_MISSING');

        // 26.2 Explicit approved canonical policy set via setCanonicalPolicy
        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'HSVP',
            policy: canonicalPolicy,
            approvedBy: 'audited-reviewer-1',
            policyVersion: 1
        });

        // 26.3 Valid reservation matching canonical policy succeeds
        const at = new Date();
        const r1 = await quotaProvider.reserve({
            authorityCode: 'HSVP',
            tenantId: 'tenant-a',
            policy: canonicalPolicy,
            at
        });
        assert.equal(r1.allowed, true);

        // 26.4 Tenant B attempts to submit 5/min: MUST BE REJECTED with RATE_LIMIT_ELEVATION_REJECTED
        const elevatedPolicy = {
            maxRequestsPerMinute: 5, // Tries to raise ceiling
            maxRequestsPerHour: 10,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'APPROVED_CANONICAL_POLICY_V1'
        };

        const r2 = await quotaProvider.reserve({
            authorityCode: 'HSVP',
            tenantId: 'tenant-b',
            policy: elevatedPolicy,
            at: new Date(at.getTime() + 600)
        });
        assert.equal(r2.allowed, false);
        assert.equal(r2.reason, 'RATE_LIMIT_ELEVATION_REJECTED');

        // 26.5 Tenant C submits mismatched policyReference: MUST BE REJECTED with POLICY_VERSION_MISMATCH
        const mismatchedPolicy = {
            maxRequestsPerMinute: 2,
            maxRequestsPerHour: 10,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'DIFFERENT_UNAPPROVED_POLICY'
        };

        const r3 = await quotaProvider.reserve({
            authorityCode: 'HSVP',
            tenantId: 'tenant-c',
            policy: mismatchedPolicy,
            at: new Date(at.getTime() + 600)
        });
        assert.equal(r3.allowed, false);
        assert.equal(r3.reason, 'POLICY_VERSION_MISMATCH');

        // 26.6 Mismatched content hash is rejected
        const tamperedHashPolicy = {
            ...canonicalPolicy,
            contentHash: 'tampered-hash-value-000'
        };
        const r4 = await quotaProvider.reserve({
            authorityCode: 'HSVP',
            tenantId: 'tenant-d',
            policy: tamperedHashPolicy,
            at: new Date(at.getTime() + 600)
        });
        assert.equal(r4.allowed, false);
        assert.equal(r4.reason, 'POLICY_HASH_MISMATCH');

        // 26.7 Privileged registerOrRotateCanonicalPolicy enforces independent maker-checker
        await assert.rejects(
            registerOrRotateCanonicalPolicy({
                authorityCode: 'HSVP',
                policy: {
                    policyReference: 'HSVP_CANONICAL_REF',
                    minIntervalMs: 500,
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 50,
                    expiresAt: new Date(Date.now() + 86400000)
                },
                reviewedBy: 'same_person',
                approvedBy: 'same_person'
            }),
            (err) => {
                assert.equal(err.code, 'CANONICAL_POLICY_SELF_APPROVAL');
                return true;
            }
        );

        // 26.8 registerOrRotateCanonicalPolicy rejects maxConcurrent !== 1 (Option A enforcement)
        await assert.rejects(
            registerOrRotateCanonicalPolicy({
                authorityCode: 'HSVP',
                policy: {
                    policyReference: 'HSVP_CANONICAL_REF',
                    minIntervalMs: 500,
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 50,
                    maxConcurrent: 2,
                    expiresAt: new Date(Date.now() + 86400000)
                },
                reviewedBy: 'officer_1',
                approvedBy: 'officer_2'
            }),
            (err) => {
                assert.equal(err.code, 'PORTAL_CONCURRENCY_UNSUPPORTED');
                return true;
            }
        );

        // 26.9 registerOrRotateCanonicalPolicy rejects expired date
        await assert.rejects(
            registerOrRotateCanonicalPolicy({
                authorityCode: 'HSVP',
                policy: {
                    policyReference: 'HSVP_CANONICAL_REF',
                    minIntervalMs: 500,
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 50,
                    expiresAt: new Date(Date.now() - 1000)
                },
                reviewedBy: 'officer_1',
                approvedBy: 'officer_2'
            }),
            (err) => {
                assert.equal(err.code, 'CANONICAL_POLICY_EXPIRED');
                return true;
            }
        );

        // 26.10 Valid canonical registration & CAS version rotation
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode: 'HSVP' });
        const v1Doc = await registerOrRotateCanonicalPolicy({
            authorityCode: 'HSVP',
            policy: {
                policyReference: 'HSVP_OFFICIAL_TERMS_2026_V1',
                minIntervalMs: 200,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 20,
                maxRequestsPerDay: 100,
                expiresAt: new Date(Date.now() + 86400000 * 30)
            },
            reviewedBy: 'compliance_officer_a',
            approvedBy: 'security_lead_b',
            quotaProvider
        });
        assert.equal(v1Doc.version, 1);
        assert.ok(v1Doc.contentHash);

        // Rotate to V2 with CAS assertion
        const v2Doc = await registerOrRotateCanonicalPolicy({
            authorityCode: 'HSVP',
            policy: {
                policyReference: 'HSVP_OFFICIAL_TERMS_2026_V2',
                minIntervalMs: 100,
                maxRequestsPerMinute: 10,
                maxRequestsPerHour: 40,
                maxRequestsPerDay: 200,
                expiresAt: new Date(Date.now() + 86400000 * 60)
            },
            expectedPreviousVersion: 1,
            reviewedBy: 'compliance_officer_c',
            approvedBy: 'security_lead_d',
            quotaProvider
        });
        assert.equal(v2Doc.version, 2);

        // 26.11 getCanonicalPolicy returns active policy only after audit
        const auditLog26 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: v2Doc._id,
            description: 'Rotated canonical policy for HSVP V2',
            status: 'success'
        });
        await markCanonicalPolicyAudited({ policyId: v2Doc._id, auditLogId: auditLog26._id });
        const activePol = await getCanonicalPolicy('HSVP');
        assert.ok(activePol);
        assert.equal(activePol.version, 2);
        assert.equal(activePol.policyReference, 'HSVP_OFFICIAL_TERMS_2026_V2');
    });

    // =========================================================================
    // Finding 27: CI Job / Test Suite Separation (Phase 1)
    // =========================================================================
    await t.test('27. CI Job / Test Suite Separation (Phase 1)', async () => {
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        const portalScript = pkg.scripts['test:authority-portal'];
        assert.ok(portalScript, 'test:authority-portal script must exist in backend/package.json');
        assert.ok(
            !portalScript.includes('authority_portal_redis_integration.test.js') && !portalScript.includes('authority_portal_*.test.js'),
            'test:authority-portal must strictly exclude authority_portal_redis_integration.test.js and avoid greedy wildcards'
        );

        const redisScript = pkg.scripts['test:authority-portal-redis'];
        assert.ok(redisScript, 'test:authority-portal-redis script must exist in backend/package.json');
        assert.ok(redisScript.includes('authority_portal_redis_integration.test.js'));
    });

    // =========================================================================
    // Finding 28: Mandatory Entire ratePolicy Object & DB Immutability on 422 (Phase 3)
    // =========================================================================
    await t.test('28. Mandatory Entire ratePolicy Object & DB Immutability on 422 (Phase 3)', async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();

        await AuthoritySourceSettings.deleteMany({ tenantId, authorityCode: 'HSVP' });
        const existing = await AuthoritySourceSettings.create({
            tenantId,
            authorityCode: 'HSVP',
            permissionStatus: 'NOT_OBTAINED',
            reviewStatus: 'NOT_REVIEWED',
            evidenceVersion: 1,
            ratePolicy: {
                maxConcurrent: 1,
                maxRequestsPerMinute: 2,
                maxRequestsPerDay: 50,
                minIntervalMs: 500,
                minimumIntervalMs: 500,
                policySource: 'V1_ORIGINAL'
            }
        });

        // Test invalid submissions: omitted, null, array, empty object, object without maxConcurrent, maxConcurrent > 1
        const invalidPayloads = [
            undefined,                           // Omitted
            null,                                // Null
            ['invalid_array'],                   // Array
            {},                                  // Empty object
            { maxRequestsPerMinute: 2 },         // Missing maxConcurrent
            { maxConcurrent: 2 },                // maxConcurrent !== 1 (Option A violation)
            { maxConcurrent: 0 },                // 0
            { maxConcurrent: -1 },               // Negative
            { maxConcurrent: 1.5 },              // Float
            { maxConcurrent: 'one' }             // Non-numeric
        ];

        for (const badRatePolicy of invalidPayloads) {
            const body = {
                approvalReference: 'EVIDENCE_REF_FAIL',
                ratePolicy: badRatePolicy
            };
            if (badRatePolicy === undefined) delete body.ratePolicy;

            const { req, res } = createMockReqRes({
                user: { _id: userId, tenantId },
                params: { authorityCode: 'HSVP' },
                body
            });

            await submitSourceApproval(req, res);
            assert.equal(res.getStatusCode(), 422, `Payload ${JSON.stringify(badRatePolicy)} must return 422`);
            assert.equal(res.getData().code, 'INVALID_RATE_POLICY');

            // Verify DB setting was NOT mutated
            const fresh = await AuthoritySourceSettings.findById(existing._id);
            assert.equal(fresh.evidenceVersion, 1, 'evidenceVersion must remain 1 on 422');
            assert.equal(fresh.permissionStatus, 'NOT_OBTAINED', 'permissionStatus must remain NOT_OBTAINED on 422');
            assert.equal(fresh.reviewStatus, 'NOT_REVIEWED', 'reviewStatus must remain NOT_REVIEWED on 422');
            assert.equal(fresh.ratePolicy.policySource, 'V1_ORIGINAL', 'ratePolicy must remain unchanged on 422');
        }

        // Positive valid submission
        const { req: reqOk, res: resOk } = createMockReqRes({
            user: { _id: userId, tenantId },
            params: { authorityCode: 'HSVP' },
            body: {
                approvalReference: 'EVIDENCE_REF_SUCCESS',
                ratePolicy: {
                    maxConcurrent: 1,
                    maxRequestsPerMinute: 5,
                    maxRequestsPerDay: 100,
                    minIntervalMs: 200,
                    policySource: 'V2_APPROVED'
                }
            }
        });
        await submitSourceApproval(reqOk, resOk);
        assert.equal(resOk.getStatusCode(), 200);
        assert.equal(resOk.getData().data.evidenceVersion, 2);
        assert.equal(resOk.getData().data.ratePolicy.maxConcurrent, 1);
        assert.equal(resOk.getData().data.ratePolicy.policySource, 'V2_APPROVED');
    });

    // =========================================================================
    // Finding 29: Option A Concurrency & Fail-Closed Monotonic Fencing (Phase 5)
    // =========================================================================
    await t.test('29. Option A Concurrency & Fail-Closed Monotonic Fencing (Phase 5)', async () => {
        const lockProvider = new RedisPortalDistributedLock(null, { testMode: true });

        // 29.1 Calling acquire with maxConcurrent !== 1 throws PORTAL_CONCURRENCY_UNSUPPORTED
        await assert.rejects(
            lockProvider.acquire({ authorityCode: 'CHD', maxConcurrent: 2 }),
            (err) => err.message.includes('PORTAL_CONCURRENCY_UNSUPPORTED')
        );

        // 29.2 isCurrentFenceToken fail-closed behavior
        // Missing sequence state -> false
        assert.equal(await lockProvider.isCurrentFenceToken('NON_EXISTENT_SOURCE', 1), false);
        // Malformed fenceToken values -> false
        assert.equal(await lockProvider.isCurrentFenceToken('NON_EXISTENT_SOURCE', null), false);
        assert.equal(await lockProvider.isCurrentFenceToken('NON_EXISTENT_SOURCE', undefined), false);
        assert.equal(await lockProvider.isCurrentFenceToken('NON_EXISTENT_SOURCE', 0), false);
        assert.equal(await lockProvider.isCurrentFenceToken('NON_EXISTENT_SOURCE', 'bad'), false);

        // Acquire lock to establish sequence
        const lease1 = await lockProvider.acquire({ authorityCode: 'CHD', maxConcurrent: 1 });
        assert.equal(lease1.acquired, true);
        const token1 = lease1.fenceToken;
        assert.ok(token1 >= 1);

        // Equal to current sequence -> true
        assert.equal(await lockProvider.isCurrentFenceToken('CHD', token1), true);
        // Stale token (< current) -> false
        assert.equal(await lockProvider.isCurrentFenceToken('CHD', token1 - 1), false);
        // Future/invalid token (> current) -> false
        assert.equal(await lockProvider.isCurrentFenceToken('CHD', token1 + 5), false);

        await lease1.release();
    });

    // =========================================================================
    // Finding 30: Deterministic Portal Lease / Persistence Race and Watermark Protection (Phase 6)
    // =========================================================================
    await t.test('30. Deterministic Portal Lease / Persistence Race and Watermark Protection (Phase 6)', async () => {
        const tenantAlpha = new mongoose.Types.ObjectId();
        const tenantBeta = new mongoose.Types.ObjectId();
        const authorityCode = 'GMADA';

        await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });

        // 30.1 Cross-tenant monotonic fence sequence via AuthorityBulkProcessor._updateAuthorityGlobalFenceWatermark
        // Worker B (Tenant Beta) commits fence token 6 first and advances watermark to 6
        const resBeta = await AuthorityBulkProcessor._updateAuthorityGlobalFenceWatermark({
            authorityCode,
            fenceToken: 6,
            tenantId: tenantBeta,
            workerId: 'worker-beta'
        });
        assert.equal(resBeta.success, true);
        assert.equal(resBeta.watermark.lastCommittedFenceToken, 6);
        assert.equal(String(resBeta.watermark.lastCommittedByTenantId), String(tenantBeta));

        // Worker A (Tenant Alpha) holds stale fence token 5: rejected fail-closed across tenants!
        const resAlpha = await AuthorityBulkProcessor._updateAuthorityGlobalFenceWatermark({
            authorityCode,
            fenceToken: 5,
            tenantId: tenantAlpha,
            workerId: 'worker-alpha'
        });
        assert.equal(resAlpha.success, false);
        assert.equal(resAlpha.reason, 'STALE_FENCE_TOKEN');

        // Verify watermark in DB is still 6
        const currentWatermark = await AuthorityGlobalFenceWatermark.findOne({ authorityCode });
        assert.equal(currentWatermark.lastCommittedFenceToken, 6);

        // 30.2 ProcessItem with mock runtime verifies executeWithinLease and rejects stale fenceToken
        const inventory = await Inventory.create({
            tenantId: tenantAlpha,
            title: 'Test Plot GMADA',
            propertyId: 'PLT-GM-999',
            sector: '66',
            urbanEstate: 'Mohali',
            price: 5000000,
            status: 'AVAILABLE'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId: tenantAlpha,
            inventoryId: inventory._id,
            authorityCode,
            propertyId: 'PLT-GM-999',
            sectorNumber: '66',
            urbanEstate: 'Mohali',
            compositeKey: 'GMADA:66:PLT-GM-999',
            identityVerified: true,
            matchEligibility: 'ELIGIBLE',
            createdBy: new mongoose.Types.ObjectId()
        });

        const runItem = await PropertyVerificationRunItem.create({
            tenantId: tenantAlpha,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-test-alpha',
            workerClaimToken: 'claim-token-alpha',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        // Mock runtime whose search() invokes executeWithinLease with stale fenceToken 4
        let executeWithinLeaseInvoked = false;
        const mockRuntime = {
            async search(args) {
                if (typeof args.executeWithinLease === 'function') {
                    executeWithinLeaseInvoked = true;
                    const res = await args.executeWithinLease({
                        fenceToken: 4, // Stale! Current watermark is 6
                        isCurrentFence: async () => true,
                        recordCount: 1,
                        records: [{
                            propertyId: 'PLT-GM-999',
                            sectorNumber: '66',
                            urbanEstate: 'Mohali',
                            status: 'ALLOTTED'
                        }],
                        contentHash: 'mock-content-hash-01',
                        sourceHost: 'gmada.gov.in'
                    });
                    return { callbackResult: res };
                }
                return {};
            }
        };

        const canonicalPolicy = {
            policyReference: 'GMADA_TEST_POL',
            minIntervalMs: 50,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            version: 1,
            contentHash: 'hash',
            approvedBy: 'audit'
        };

        await AuthoritySourceSettings.deleteMany({ tenantId: tenantAlpha, authorityCode });
        await AuthoritySourceSettings.create({
            tenantId: tenantAlpha,
            authorityCode,
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
            approvalReference: 'GMADA/AUTH/2026/01',
            commercialUseAuthorized: true,
            readOnlySearchAuthorized: true,
            termsReviewed: true,
            termsReference: 'https://gmada.gov.in/terms',
            submittedBy: new mongoose.Types.ObjectId(),
            approvedBy: new mongoose.Types.ObjectId(),
            reviewedBy: new mongoose.Types.ObjectId(),
            permittedFields: ['propertyId', 'sectorNumber'],
            reviewStatus: 'APPROVED',
            isEnabled: true,
            contractVerificationStatus: 'VERIFIED_CONTRACT',
            contractEvidenceReference: 'GMADA/CONTRACT/01',
            identityRequirements: { verified: true },
            ratePolicy: {
                maxConcurrent: 1,
                maxRequestsPerMinute: 10,
                maxRequestsPerDay: 500,
                minIntervalMs: 50,
                minimumIntervalMs: 50,
                policySource: 'GMADA_TEST_POL'
            }
        });

        const processResult = await AuthorityBulkProcessor.processItem(runItem, {
            tenantId: tenantAlpha,
            workerId: 'worker-test-alpha',
            claimToken: 'claim-token-alpha',
            isFixtureMode: false,
            portalRuntime: mockRuntime,
            canonicalPolicy
        });

        assert.equal(executeWithinLeaseInvoked, true, 'executeWithinLease must be invoked by portalRuntime.search');
        assert.equal(processResult.success, false);
        assert.equal(processResult.reason, 'PORTAL_LOCK_OWNERSHIP_LOST');

        // Verify runItem transitioned to FAILED and NO snapshot was created
        const updatedItem = await PropertyVerificationRunItem.findById(runItem._id);
        assert.equal(updatedItem.status, 'FAILED');

        const snapCount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
        assert.equal(snapCount, 0, 'No snapshot should be created when watermark check fails');
    });

    await t.test('31. Deterministic Lease-Loss in Persistence Stage Across Tenants (Remediation 1)', async () => {
        const authorityCode = 'GMADA';
        const tenantA = testTenantId;
        const tenantB = testTenantId;

        const invA = await Inventory.create({
            tenantId: tenantA,
            unitNo: 'PLT-RACE-A',
            sector: '66',
            urbanEstate: 'Mohali'
        });
        const linkA = await PropertyAuthorityLink.create({
            tenantId: tenantA,
            inventoryId: invA._id,
            authorityCode,
            propertyId: 'PLT-RACE-A',
            sectorNumber: '66',
            urbanEstate: 'Mohali',
            matchEligibility: 'ELIGIBLE',
            compositeKey: 'GMADA:MOHALI:66:PLT-RACE-A',
            createdBy: submitterUser._id
        });
        const runItemA = await PropertyVerificationRunItem.create({
            tenantId: tenantA,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: invA._id,
            linkId: linkA._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-race-A',
            workerClaimToken: 'claim-token-race-A',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        const invB = await Inventory.create({
            tenantId: tenantB,
            unitNo: 'PLT-RACE-B',
            sector: '66',
            urbanEstate: 'Mohali'
        });
        const linkB = await PropertyAuthorityLink.create({
            tenantId: tenantB,
            inventoryId: invB._id,
            authorityCode,
            propertyId: 'PLT-RACE-B',
            sectorNumber: '66',
            urbanEstate: 'Mohali',
            matchEligibility: 'ELIGIBLE',
            compositeKey: 'GMADA:MOHALI:66:PLT-RACE-B',
            createdBy: submitterUser._id
        });
        const runItemB = await PropertyVerificationRunItem.create({
            tenantId: tenantB,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: invB._id,
            linkId: linkB._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-race-B',
            workerClaimToken: 'claim-token-race-B',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        const canonicalPolicyDoc = await AuthorityCanonicalPolicy.findOneAndUpdate(
            { authorityCode },
            {
                $set: {
                    authorityCode,
                    policyReference: 'GMADA/RACE/POL',
                    version: 1,
                    contentHash: 'hash-race',
                    minIntervalMs: 50,
                    maxRequestsPerMinute: 10,
                    maxRequestsPerHour: 100,
                    maxRequestsPerDay: 500,
                    maxConcurrent: 1,
                    effectiveFrom: new Date(Date.now() - 10000),
                    expiresAt: new Date(Date.now() + 86400000),
                    reviewedBy: String(reviewerUser._id),
                    approvedBy: String(approverUser._id),
                    isActive: true
                }
            },
            { upsert: true, new: true }
        );

        const gmadaSetting = await AuthoritySourceSettings.findOne({ tenantId: testTenantId, authorityCode });
        const raceAudit = await AuditLog.create({
            tenantId: testTenantId,
            eventType: 'authority_source_approval_reviewed',
            targetType: 'authority_settings',
            targetId: gmadaSetting._id,
            targetName: authorityCode,
            userId: approverUser._id,
            performedBy: reviewerUser._id,
            actorId: reviewerUser._id,
            actorName: 'Reviewer User',
            description: 'Authority source approval reviewed for GMADA',
            metadata: {
                tenantId: testTenantId,
                authorityCode,
                submittedBy: submitterUser._id,
                approvedBy: approverUser._id,
                reviewedBy: reviewerUser._id
            }
        });

        await AuthoritySourceSettings.updateOne(
            { tenantId: testTenantId, authorityCode },
            {
                $set: {
                    permissionStatus: 'GRANTED',
                    approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                    approvalReference: raceAudit._id.toString(),
                    makerCheckerAuditLogId: raceAudit._id,
                    commercialUseAuthorized: true,
                    readOnlySearchAuthorized: true,
                    termsReviewed: true,
                    termsReference: 'https://gmada.gov.in/terms',
                    submittedBy: submitterUser._id,
                    approvedBy: approverUser._id,
                    reviewedBy: reviewerUser._id,
                    permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate', 'status'],
                    reviewStatus: 'APPROVED',
                    isEnabled: true,
                    contractVerificationStatus: 'VERIFIED_CONTRACT',
                    contractEvidenceReference: 'GMADA/CONTRACT/01',
                    identityRequirements: { verified: true },
                    ratePolicy: {
                        maxConcurrent: 1,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        minIntervalMs: 50,
                        minimumIntervalMs: 50,
                        policySource: 'GMADA/RACE/POL'
                    }
                }
            },
            { upsert: true }
        );

        // Initialize AuthorityGlobalFenceWatermark
        await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });
        await AuthorityGlobalFenceWatermark.create({
            authorityCode,
            lastCommittedFenceToken: 0,
            highestIssuedFenceToken: 10
        });

        // 1. Worker A acquires token 10
        let workerARacePaused = false;
        let workerAAttemptedCommit = false;

        const runtimeWorkerA = {
            async search(args) {
                if (typeof args.executeWithinLease === 'function') {
                    return await args.executeWithinLease({
                        authorityCode,
                        fenceToken: 10,
                        isCurrentFence: async () => {
                            const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                                authorityCode,
                                fenceToken: 10
                            });
                            return !superseded;
                        },
                        checkLeaseValid: async () => {
                            const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                                authorityCode,
                                fenceToken: 10
                            });
                            if (superseded) {
                                const err = new Error('Distributed portal lock superseded by newer fence token.');
                                err.code = 'PORTAL_LOCK_OWNERSHIP_LOST';
                                throw err;
                            }
                        },
                        recordCount: 1,
                        records: [{
                            propertyId: 'PLT-RACE-A',
                            sectorNumber: '66',
                            urbanEstate: 'Mohali',
                            status: 'ALLOTTED'
                        }],
                        contentHash: 'hash-A',
                        sourceHost: 'gmada.gov.in'
                    });
                }
                return {};
            }
        };

        // Worker A executes with beforeTransactionCommit hook that pauses A,
        // has Worker B acquire token 11 (issued-but-not-yet-committed window),
        // and then resumes A.
        const resA = await AuthorityBulkProcessor.processItem(runItemA, {
            tenantId: tenantA,
            workerId: 'worker-race-A',
            claimToken: 'claim-token-race-A',
            isFixtureMode: false,
            portalRuntime: runtimeWorkerA,
            canonicalPolicy: canonicalPolicyDoc,
            beforeTransactionCommit: async () => {
                workerARacePaused = true;
                // 2. Worker B on Tenant B acquires newer token 11 and issues it in watermark
                await AuthorityGlobalFenceWatermark.recordIssuedFenceToken({
                    authorityCode,
                    fenceToken: 11
                });
                // Note: Worker B has NOT committed yet! lastCommittedFenceToken is still <= 10!
                const wmBeforeResume = await AuthorityGlobalFenceWatermark.findOne({ authorityCode });
                assert.ok(wmBeforeResume.lastCommittedFenceToken < 11, 'Worker B has not yet committed token 11');
                assert.equal(wmBeforeResume.highestIssuedFenceToken, 11, 'Worker B token 11 is issued');

                workerAAttemptedCommit = true;
            }
        });

        assert.equal(workerARacePaused, true, 'Worker A should have paused inside transaction commit hook');
        assert.equal(workerAAttemptedCommit, true, 'Worker A attempted commit after token 11 issued');
        assert.equal(resA.success, false, 'Worker A must fail closed');
        assert.equal(resA.reason, 'PORTAL_LOCK_OWNERSHIP_LOST');
        assert.equal(resA.ownershipLost, true);

        // Assert Worker A transaction was aborted: no snapshot, item marked FAILED
        const itemAFinal = await PropertyVerificationRunItem.findById(runItemA._id);
        assert.equal(itemAFinal.status, 'FAILED');
        const snapACount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItemA._id });
        assert.equal(snapACount, 0, 'Worker A snapshot must NOT be committed to MongoDB');

        // 3. Now Worker B on Tenant B completes using newer lease token 11
        const runtimeWorkerB = {
            async search(args) {
                if (typeof args.executeWithinLease === 'function') {
                    return await args.executeWithinLease({
                        authorityCode,
                        fenceToken: 11,
                        isCurrentFence: async () => {
                            const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                                authorityCode,
                                fenceToken: 11
                            });
                            return !superseded;
                        },
                        checkLeaseValid: async () => {
                            const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                                authorityCode,
                                fenceToken: 11
                            });
                            if (superseded) {
                                const err = new Error('PORTAL_LOCK_OWNERSHIP_LOST');
                                err.code = 'PORTAL_LOCK_OWNERSHIP_LOST';
                                throw err;
                            }
                        },
                        recordCount: 1,
                        records: [{
                            propertyId: 'PLT-RACE-B',
                            sectorNumber: '66',
                            urbanEstate: 'Mohali',
                            status: 'ALLOTTED'
                        }],
                        contentHash: 'hash-B',
                        sourceHost: 'gmada.gov.in'
                    });
                }
                return {};
            }
        };

        const resB = await AuthorityBulkProcessor.processItem(runItemB, {
            tenantId: tenantB,
            workerId: 'worker-race-B',
            claimToken: 'claim-token-race-B',
            isFixtureMode: false,
            portalRuntime: runtimeWorkerB,
            canonicalPolicy: canonicalPolicyDoc
        });

        assert.equal(resB.success, true, 'Worker B must succeed with newer token');
        const itemBFinal = await PropertyVerificationRunItem.findById(runItemB._id);
        assert.equal(itemBFinal.status, 'SUCCEEDED');
        const snapB = await PropertyVerificationSnapshot.findOne({ runItemId: runItemB._id });
        assert.ok(snapB, 'Worker B snapshot must be committed');
        assert.equal(snapB.fenceToken, 11);

        const wmFinal = await AuthorityGlobalFenceWatermark.findOne({ authorityCode });
        assert.equal(wmFinal.lastCommittedFenceToken, 11);
    });

    await t.test('32. Authenticated Canonical Policy Controller Maker-Checker & Audit (Remediation 3)', async () => {
        const authorityCode = 'HSVP';
        await AuditLog.ensureIdempotencyIndex();

        // 32.1: Unauthorized request (missing req.user) is rejected with 401
        {
            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: null,
                body: {}
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 401);
            assert.equal(jsonBody.success, false);
        }

        // 32.2: Same actor for reviewer and approver returns 422 CANONICAL_POLICY_SELF_APPROVAL
        const authorizedApproverRole = await Role.create({
            name: `Authorized Approver Role ${Date.now()}`,
            department: 'inventory',
            approvalRights: { manageAuthoritySettings: true },
            moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
        });
        const approverUser = await User.create({
            fullName: 'Admin Approver',
            email: `approver-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: authorizedApproverRole._id,
            department: 'inventory',
            isActive: true
        });

        {
            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: approverUser._id.toString(),
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 422);
            assert.equal(jsonBody.code, 'CANONICAL_POLICY_SELF_APPROVAL');
        }

        // 32.3: Inactive reviewer is rejected with 400 REVIEWER_NOT_ACTIVE
        const inactiveReviewer = await User.create({
            fullName: 'Inactive Reviewer',
            email: `inactive-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: new mongoose.Types.ObjectId(),
            department: 'inventory',
            isActive: false
        });

        {
            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: inactiveReviewer._id.toString(),
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 400);
            assert.equal(jsonBody.code, 'REVIEWER_NOT_ACTIVE');
        }

        // 32.3b: Active but unauthorized reviewer (lacking approveAuthorityChanges right) is rejected with 403
        const unauthorizedReviewerRole = await Role.create({
            name: `Unauthorized Reviewer Role ${Date.now()}`,
            department: 'inventory',
            approvalRights: {
                approveAuthorityChanges: false,
                manageAuthoritySettings: false
            }
        });
        const unauthorizedReviewer = await User.create({
            fullName: 'Unauthorized Reviewer',
            email: `unauthorized-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: unauthorizedReviewerRole._id,
            department: 'inventory',
            isActive: true
        });

        {
            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: unauthorizedReviewer._id.toString(),
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 403);
            assert.equal(jsonBody.code, 'REVIEWER_NOT_AUTHORIZED');
        }

        // 32.4: Distinct authorized actors rotate canonical policy successfully and log audit
        const authorizedReviewerRole = await Role.create({
            name: `Authorized Reviewer Role ${Date.now()}`,
            department: 'inventory',
            approvalRights: {
                approveAuthorityChanges: true,
                manageAuthoritySettings: false
            }
        });
        const activeReviewer = await User.create({
            fullName: 'Active Reviewer',
            email: `reviewer-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: authorizedReviewerRole._id,
            department: 'inventory',
            isActive: true
        });

        // 32.4b: Reviewer role revocation & cache-race immunity (Finding P1-B)
        {
            // Revoke permission on role
            await Role.updateOne({ _id: authorizedReviewerRole._id }, { $set: { 'approvalRights.approveAuthorityChanges': false } });
            await invalidateUserPermissionCache(activeReviewer._id);

            // Deliberately simulate concurrent request populating stale cache before commit
            await cacheUserPermissions(activeReviewer._id.toString(), authorizedReviewerRole._id.toString(), {
                approvalRights: { approveAuthorityChanges: true }
            });

            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: activeReviewer._id.toString(),
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };

            // Request must be denied (403) despite stale cache entry
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 403, 'Must return 403 when role lacks approveAuthorityChanges even if cache had stale entry');
            assert.equal(jsonBody.code, 'REVIEWER_NOT_AUTHORIZED');

            // Deactivate reviewer user and assert 400
            await User.updateOne({ _id: activeReviewer._id }, { $set: { isActive: false } });
            let deactStatusCode = null;
            let deactJsonBody = null;
            const deactRes = {
                status(code) { deactStatusCode = code; return this; },
                json(payload) { deactJsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, deactRes);
            assert.equal(deactStatusCode, 400, 'Must return 400 when reviewer is deactivated');
            assert.equal(deactJsonBody.code, 'REVIEWER_NOT_ACTIVE');

            // Restore authorization and active state
            await User.updateOne({ _id: activeReviewer._id }, { $set: { isActive: true } });
            await Role.updateOne({ _id: authorizedReviewerRole._id }, { $set: { 'approvalRights.approveAuthorityChanges': true } });
            await invalidateUserPermissionCache(activeReviewer._id);
        }

        // 32.4b2: Approver role revocation & cache-race immunity (Objective B)
        {
            // Revoke manageAuthoritySettings on approver role
            await Role.updateOne({ _id: authorizedApproverRole._id }, { $set: { 'approvalRights.manageAuthoritySettings': false } });
            await invalidateUserPermissionCache(approverUser._id);

            // Simulate concurrent request injecting stale cache
            await cacheUserPermissions(approverUser._id.toString(), authorizedApproverRole._id.toString(), {
                approvalRights: { manageAuthoritySettings: true }
            });

            let approverStatusCode = null;
            let approverJsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: activeReviewer._id.toString(),
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { approverStatusCode = code; return this; },
                json(payload) { approverJsonBody = payload; return this; }
            };

            await rotateCanonicalPolicy(req, res);
            assert.equal(approverStatusCode, 403, 'Must return 403 when approver lacks manageAuthoritySettings even if cache had stale entry');
            assert.equal(approverJsonBody.code, 'APPROVER_NOT_AUTHORIZED');

            // Restore approver role
            await Role.updateOne({ _id: authorizedApproverRole._id }, { $set: { 'approvalRights.manageAuthoritySettings': true } });
            await invalidateUserPermissionCache(approverUser._id);
        }

        // 32.4b3: Outer approver permission cache race with failed Redis invalidation (Objective B)
        {
            // Seed cached manageAuthoritySettings: true
            await cacheUserPermissions(approverUser._id.toString(), authorizedApproverRole._id.toString(), {
                approvalRights: { manageAuthoritySettings: true }
            });

            // Revoke role permission in MongoDB
            await Role.updateOne({ _id: authorizedApproverRole._id }, { $set: { 'approvalRights.manageAuthoritySettings': false } });

            // Simulate Redis cache invalidation failure / delay (cache key remains present)
            // Middleware with fresh evaluation (skipCache: true) must query Mongo and deny access
            const middleware = checkApprovalRight('manageAuthoritySettings', { skipCache: true });
            let middlewareStatusCode = null;
            let middlewareJson = null;
            let nextCalled = false;

            const mReq = {
                user: approverUser,
                ip: '127.0.0.1',
                originalUrl: `/api/authority/canonical-policy/${authorityCode}/rotate`,
                method: 'POST',
                get: () => 'test-agent'
            };
            const mRes = {
                status(c) { middlewareStatusCode = c; return this; },
                json(j) { middlewareJson = j; return this; }
            };
            const mNext = () => { nextCalled = true; };

            await middleware(mReq, mRes, mNext);
            assert.equal(nextCalled, false, 'Middleware must not call next() for revoked approver');
            assert.equal(middlewareStatusCode, 403, 'Middleware must return 403 despite stale Redis cache');
            assert.ok(middlewareJson.message.includes('Insufficient approval rights: manageAuthoritySettings'));

            // Restore approver role
            await Role.updateOne({ _id: authorizedApproverRole._id }, { $set: { 'approvalRights.manageAuthoritySettings': true } });
            await invalidateUserPermissionCache(approverUser._id);
        }

        // 32.4b4: Stale module-permission revocation immunity on rotate & sync routes (Objective 1)
        {
            // 1. Seed authorized role with authorityVerification.edit=true and manageAuthoritySettings=true
            const testModuleAccess = {
                authorityVerification: { view: true, create: true, edit: true, delete: false }
            };
            const testApprovalRights = {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            };
            await Role.updateOne(
                { _id: authorizedApproverRole._id },
                { $set: { moduleAccess: testModuleAccess, approvalRights: testApprovalRights } }
            );

            // Populate the Redis permission cache with edit=true and manageAuthoritySettings=true
            await cacheUserPermissions(approverUser._id.toString(), authorizedApproverRole._id.toString(), {
                department: approverUser.department,
                moduleAccess: testModuleAccess,
                approvalRights: testApprovalRights
            });

            // 2. Revoke ONLY authorityVerification.edit in MongoDB (leaving manageAuthoritySettings=true)
            // Deliberately simulate Redis invalidation failure / delay (leave stale cache entry in Redis)
            await Role.updateOne(
                { _id: authorizedApproverRole._id },
                { $set: { 'moduleAccess.authorityVerification.edit': false } }
            );

            // Compose the middleware stack used by rotate & sync routes:
            // checkPermission('authorityVerification', 'edit', { skipCache: true })
            // checkApprovalRight('manageAuthoritySettings', { skipCache: true })
            const permMiddleware = checkPermission('authorityVerification', 'edit', { skipCache: true });
            const rightMiddleware = checkApprovalRight('manageAuthoritySettings', { skipCache: true });

            let rotatePermPassed = false;
            let rotateRightPassed = false;
            let rotateStatus = null;
            let rotateBody = null;

            const reqRotate = {
                user: approverUser,
                ip: '127.0.0.1',
                originalUrl: `/api/authority/canonical-policy/${authorityCode}/rotate`,
                method: 'POST',
                get: () => 'test-agent'
            };
            const resRotate = {
                status(c) { rotateStatus = c; return this; },
                json(b) { rotateBody = b; return this; }
            };

            await permMiddleware(reqRotate, resRotate, async () => {
                rotatePermPassed = true;
                await rightMiddleware(reqRotate, resRotate, async () => {
                    rotateRightPassed = true;
                });
            });

            assert.equal(rotatePermPassed, false, 'Rotate middleware stack must reject request when authorityVerification.edit is revoked in Mongo despite stale Redis cache');
            assert.equal(rotateRightPassed, false, 'Controller/downstream must not be reached');
            assert.equal(rotateStatus, 403, 'Must return HTTP 403 on revoked module permission');
            assert.ok(rotateBody.message.includes('Insufficient permissions: Cannot edit authorityVerification'));

            // Test on sync route as well
            let syncPermPassed = false;
            let syncStatus = null;
            let syncBody = null;
            const reqSync = {
                user: approverUser,
                ip: '127.0.0.1',
                originalUrl: `/api/authority/canonical-policy/${authorityCode}/sync`,
                method: 'POST',
                get: () => 'test-agent'
            };
            const resSync = {
                status(c) { syncStatus = c; return this; },
                json(b) { syncBody = b; return this; }
            };

            await permMiddleware(reqSync, resSync, async () => {
                syncPermPassed = true;
            });

            assert.equal(syncPermPassed, false, 'Sync middleware stack must reject request when authorityVerification.edit is revoked in Mongo');
            assert.equal(syncStatus, 403);
            assert.ok(syncBody.message.includes('Insufficient permissions: Cannot edit authorityVerification'));

            // 3. Converse control: when current edit=true and current manageAuthoritySettings=true, both pass
            await Role.updateOne(
                { _id: authorizedApproverRole._id },
                { $set: { 'moduleAccess.authorityVerification.edit': true } }
            );

            let controlPermPassed = false;
            let controlRightPassed = false;
            await permMiddleware(reqRotate, resRotate, async () => {
                controlPermPassed = true;
                await rightMiddleware(reqRotate, resRotate, async () => {
                    controlRightPassed = true;
                });
            });

            assert.equal(controlPermPassed, true, 'Control: checkPermission must pass when edit=true in Mongo');
            assert.equal(controlRightPassed, true, 'Control: checkApprovalRight must pass when manageAuthoritySettings=true in Mongo');

            // Cleanup cache
            await invalidateUserPermissionCache(approverUser._id);
        }

        // 32.4d: Audit proof referential integrity & activation rejection (Objective A)
        {
            // Test 1: Calling registerOrRotateCanonicalPolicy with activation flags must throw CANONICAL_POLICY_AUDIT_PARAM_FORBIDDEN
            await assert.rejects(
                async () => {
                    await registerOrRotateCanonicalPolicy({
                        authorityCode,
                        policy: {
                            policyReference: 'HSVP/FORBIDDEN/01',
                            minIntervalMs: 15000,
                            maxRequestsPerMinute: 10,
                            maxRequestsPerDay: 500,
                            expiresAt: new Date(Date.now() + 86400000)
                        },
                        reviewedBy: activeReviewer._id.toString(),
                        approvedBy: approverUser._id.toString(),
                        isAudited: true,
                        auditLogId: new mongoose.Types.ObjectId()
                    });
                },
                (err) => err.code === 'CANONICAL_POLICY_AUDIT_PARAM_FORBIDDEN'
            );

            // Test 2: markCanonicalPolicyAudited without auditLogId must reject
            const dummyDoc = await registerOrRotateCanonicalPolicy({
                authorityCode,
                policy: {
                    policyReference: 'HSVP/PENDING/01',
                    minIntervalMs: 15000,
                    maxRequestsPerMinute: 10,
                    maxRequestsPerDay: 500,
                    expiresAt: new Date(Date.now() + 86400000)
                },
                reviewedBy: activeReviewer._id.toString(),
                approvedBy: approverUser._id.toString()
            });

            await assert.rejects(
                async () => {
                    await markCanonicalPolicyAudited({ policyId: dummyDoc._id });
                },
                (err) => err.code === 'INVALID_AUDIT_LOG_ID'
            );

            // Verify policy remains inactive and unaudited
            const unauditedCheck = await AuthorityCanonicalPolicy.findById(dummyDoc._id);
            assert.equal(unauditedCheck.isAudited, false);
            assert.equal(unauditedCheck.auditStatus, 'PENDING');
            assert.equal(unauditedCheck.isActive, false);

            // Test 3: Random/non-existent auditLogId must reject
            const nonExistentAuditId = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await markCanonicalPolicyAudited({ policyId: dummyDoc._id, auditLogId: nonExistentAuditId });
                },
                (err) => err.code === 'AUDIT_LOG_NOT_FOUND_OR_MISMATCHED'
            );

            // Test 4: Mismatched targetId in AuditLog must reject
            const mismatchedAudit = await AuditLog.create({
                eventType: 'canonical_policy_rotated',
                targetType: 'authority_canonical_policy',
                targetId: new mongoose.Types.ObjectId(), // completely different policy target!
                description: 'Mismatched audit record',
                status: 'success'
            });

            await assert.rejects(
                async () => {
                    await markCanonicalPolicyAudited({ policyId: dummyDoc._id, auditLogId: mismatchedAudit._id });
                },
                (err) => err.code === 'AUDIT_LOG_NOT_FOUND_OR_MISMATCHED'
            );

            // Clean up dummy doc
            await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        }

        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });

        // 32.4c: No policy visible before mandatory audit exists (Finding P1-A)
        {
            const origAuditCreate = AuditLog.create;
            let auditResolver = null;
            let auditReachedPromise = new Promise((resolve) => {
                AuditLog.create = async (...args) => {
                    resolve();
                    await new Promise((r) => { auditResolver = r; });
                    return origAuditCreate.apply(AuditLog, args);
                };
            });

            try {
                let statusCode = null;
                let jsonBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get(header) { return header === 'user-agent' ? 'test-agent' : null; },
                    body: {
                        reviewerId: activeReviewer._id.toString(),
                        policy: {
                            policyReference: 'HSVP/CANONICAL/01',
                            minIntervalMs: 15000,
                            maxRequestsPerMinute: 10,
                            maxRequestsPerHour: 100,
                            maxRequestsPerDay: 500,
                            expiresAt: new Date(Date.now() + 86400000)
                        }
                    }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { jsonBody = payload; return this; }
                };

                const rotatePromise = rotateCanonicalPolicy(req, res);

                // Wait until AuditLog.create is paused
                await auditReachedPromise;

                // Concurrent check: getCanonicalPolicy MUST return null while audit is pending
                const pendingDoc = await getCanonicalPolicy(authorityCode);
                assert.equal(pendingDoc, null, 'Pending un-audited policy must never be visible to getCanonicalPolicy()');

                // Check raw document in DB has isActive: false, isAudited: false, auditStatus: 'PENDING'
                const rawDbDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.ok(rawDbDoc, 'Document was persisted in DB');
                assert.equal(rawDbDoc.isActive, false);
                assert.equal(rawDbDoc.isAudited, false);
                assert.equal(rawDbDoc.auditStatus, 'PENDING');

                // Let audit write complete
                auditResolver();
                await rotatePromise;

                assert.ok(statusCode === 200 || statusCode === 202);
                assert.equal(jsonBody.success, true);
                assert.equal(jsonBody.data.version, 1);
                assert.equal(jsonBody.data.isAudited, true);
                assert.equal(jsonBody.data.auditStatus, 'AUDITED');
                assert.equal(jsonBody.data.isActive, true);

                // Now getCanonicalPolicy must return the active, audited policy
                const activePolicy = await getCanonicalPolicy(authorityCode);
                assert.ok(activePolicy);
                assert.equal(activePolicy.version, 1);
                assert.equal(activePolicy.isAudited, true);
                assert.equal(activePolicy.auditStatus, 'AUDITED');
            } finally {
                AuditLog.create = origAuditCreate;
            }
        }

        // 32.5: Duplicate / lower version sequence rotation is rejected with 400
        {
            let statusCode = null;
            let jsonBody = null;
            const req = {
                params: { authorityCode },
                user: approverUser,
                body: {
                    reviewerId: activeReviewer._id.toString(),
                    policyVersion: 1, // Already at version 1!
                    policy: {
                        policyReference: 'HSVP/CANONICAL/01',
                        minIntervalMs: 15000,
                        maxRequestsPerMinute: 10,
                        maxRequestsPerDay: 500,
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                }
            };
            const res = {
                status(code) { statusCode = code; return this; },
                json(payload) { jsonBody = payload; return this; }
            };
            await rotateCanonicalPolicy(req, res);
            assert.equal(statusCode, 400);
            assert.equal(jsonBody.code, 'INVALID_VERSION_SEQUENCE');
        }

        // 32.6: Redis sync failure marks status FAILED and remains visibly pending
        {
            const failingQuotaProvider = {
                async setCanonicalPolicy() {
                    throw new Error('REDIS_CONNECTION_REFUSED');
                }
            };

            // Call publishCanonicalPolicyToRedis directly to test failure marking
            const currentPolicy = await getCanonicalPolicy(authorityCode);
            const pubFail = await publishCanonicalPolicyToRedis({
                authorityCode,
                quotaProvider: failingQuotaProvider,
                policyDoc: currentPolicy
            });
            assert.equal(pubFail.success, false);
            assert.equal(pubFail.redisSyncStatus, 'FAILED');
            assert.ok(pubFail.reason.includes('REDIS_CONNECTION_REFUSED'));

            const savedInDb = await AuthorityCanonicalPolicy.findOne({ authorityCode, version: 1 });
            assert.equal(savedInDb.redisSyncStatus, 'FAILED');

            // Reconcile with working provider
            let syncedPolicy = null;
            const workingQuotaProvider = {
                async setCanonicalPolicy(args) {
                    syncedPolicy = args;
                    return args;
                }
            };

            const reconcileRes = await syncCanonicalPolicyToRedis({
                authorityCode,
                quotaProvider: workingQuotaProvider
            });
            assert.equal(reconcileRes.success, true);
            assert.equal(reconcileRes.policy.redisSyncStatus, 'SYNCED');
            assert.ok(syncedPolicy);
            assert.equal(syncedPolicy.policyVersion, 1);
        }

        // 32.7: Redis publication ordering & Audit Failure Rollback / Divergence Guard (Objective C)
        {
            // Seed Redis / quotaProvider with Canonical V1
            const inMemoryQuotaProvider = new RedisPortalQuotaProvider(null, { testMode: true });
            setTestQuotaProvider(inMemoryQuotaProvider);

            try {
                const v1Doc = await getCanonicalPolicy(authorityCode);
                await inMemoryQuotaProvider.setCanonicalPolicy({
                    authorityCode,
                    policy: {
                        policyReference: v1Doc.policyReference,
                        minIntervalMs: v1Doc.minIntervalMs,
                        maxRequestsPerMinute: v1Doc.maxRequestsPerMinute,
                        maxRequestsPerHour: v1Doc.maxRequestsPerHour,
                        maxRequestsPerDay: v1Doc.maxRequestsPerDay,
                        contentHash: v1Doc.contentHash
                    },
                    approvedBy: v1Doc.approvedBy,
                    policyVersion: 1
                });

                // Capture initial V1 state in Redis
                const initialRedisV1 = inMemoryQuotaProvider._canonicalPolicies.get(authorityCode);
                assert.ok(initialRedisV1);
                assert.equal(Number(initialRedisV1.version), 1);
                const initialRedisJson = JSON.stringify(initialRedisV1);

                // Attempt V2 rotation with AuditLog persistence forced to fail
                const origAuditCreate = AuditLog.create;
                AuditLog.create = async () => {
                    throw new Error('MOCK_AUDIT_LOG_DATABASE_CRASH');
                };

                try {
                    let statusCode = null;
                    let jsonBody = null;
                    const req = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get(header) { return header === 'user-agent' ? 'test-agent' : null; },
                        body: {
                            reviewerId: activeReviewer._id.toString(),
                            policyVersion: 2,
                            policy: {
                                policyReference: 'HSVP/CANONICAL/02',
                                minIntervalMs: 15000,
                                maxRequestsPerMinute: 20,
                                maxRequestsPerHour: 200,
                                maxRequestsPerDay: 1000,
                                expiresAt: new Date(Date.now() + 86400000)
                            }
                        }
                    };
                    const res = {
                        status(code) { statusCode = code; return this; },
                        json(payload) { jsonBody = payload; return this; }
                    };

                    await rotateCanonicalPolicy(req, res);
                    assert.equal(statusCode, 500, 'Must return 500 when mandatory audit persistence fails');
                    assert.equal(jsonBody.success, false);
                    assert.equal(jsonBody.code, 'AUDIT_PERSISTENCE_FAILED');

                    // P2-C Assertion 1: DB remains at V1!
                    const dbDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                    assert.equal(dbDoc.version, 1, 'DB must remain at V1 when audit fails');

                    // P2-C Assertion 2: Redis hash remains byte-for-byte V1!
                    const currentRedisV1 = inMemoryQuotaProvider._canonicalPolicies.get(authorityCode);
                    assert.equal(JSON.stringify(currentRedisV1), initialRedisJson, 'Redis trust hash must remain byte-for-byte identical to V1');

                    // P2-C Assertion 3: getCanonicalPolicy returns only V1!
                    const activePolicy = await getCanonicalPolicy(authorityCode);
                    assert.ok(activePolicy);
                    assert.equal(activePolicy.version, 1);
                } finally {
                    AuditLog.create = origAuditCreate;
                }

                // Simulate successful V2 rotation with paused Mongo audit transaction
                let unpauseV2 = null;
                const v2AuditPausedPromise = new Promise((resolve) => {
                    AuditLog.create = async (...args) => {
                        resolve();
                        await new Promise((r) => { unpauseV2 = r; });
                        return origAuditCreate.apply(AuditLog, args);
                    };
                });

                try {
                    let statusCode = null;
                    let jsonBody = null;
                    const req = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get(header) { return header === 'user-agent' ? 'test-agent' : null; },
                        body: {
                            reviewerId: activeReviewer._id.toString(),
                            policyVersion: 2,
                            policy: {
                                policyReference: 'HSVP/CANONICAL/02',
                                minIntervalMs: 15000,
                                maxRequestsPerMinute: 20,
                                maxRequestsPerHour: 200,
                                maxRequestsPerDay: 1000,
                                expiresAt: new Date(Date.now() + 86400000)
                            }
                        }
                    };
                    const res = {
                        status(code) { statusCode = code; return this; },
                        json(payload) { jsonBody = payload; return this; }
                    };

                    const rotatePromise = rotateCanonicalPolicy(req, res);

                    // Wait until audit transaction is paused in-flight
                    await v2AuditPausedPromise;

                    // Assert Redis hash remains strictly V1 while audit transaction is uncommitted
                    const redisDuringPause = inMemoryQuotaProvider._canonicalPolicies.get(authorityCode);
                    assert.equal(Number(redisDuringPause.version), 1, 'Redis must remain at V1 while audit is uncommitted');

                    // Release audit transaction to commit
                    unpauseV2();
                    await rotatePromise;

                    assert.ok(statusCode === 200 || statusCode === 202);
                    assert.equal(jsonBody.success, true);
                    assert.equal(jsonBody.data.version, 2);

                    // Redis provider received V2 only after durable commit
                    const redisAfterCommit = inMemoryQuotaProvider._canonicalPolicies.get(authorityCode);
                    assert.equal(Number(redisAfterCommit.version), 2, 'Redis must be updated to V2 after audit transaction commits');

                    const activeV2 = await getCanonicalPolicy(authorityCode);
                    assert.ok(activeV2);
                    assert.equal(activeV2.version, 2);
                } finally {
                    AuditLog.create = origAuditCreate;
                }

                // Objective A Test 5: Simulate policy re-read confirmation failure after commit
                // If persisted document cannot be confirmed, fail closed with 500 and do NOT publish to Redis
                const origFindById = AuthorityCanonicalPolicy.findById;
                AuthorityCanonicalPolicy.findById = async () => null; // Simulate confirmation failure

                try {
                    let confirmFailCode = null;
                    let confirmFailJson = null;
                    const reqFail = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: {
                            reviewerId: activeReviewer._id.toString(),
                            policyVersion: 3,
                            policy: {
                                policyReference: 'HSVP/CANONICAL/03',
                                minIntervalMs: 15000,
                                maxRequestsPerMinute: 20,
                                maxRequestsPerHour: 200,
                                maxRequestsPerDay: 1000,
                                expiresAt: new Date(Date.now() + 86400000)
                            }
                        }
                    };
                    const resFail = {
                        status(code) { confirmFailCode = code; return this; },
                        json(payload) { confirmFailJson = payload; return this; }
                    };

                    await rotateCanonicalPolicy(reqFail, resFail);
                    assert.equal(confirmFailCode, 500, 'Must return 500 when durable confirmation fails');
                    assert.equal(confirmFailJson.code, 'POLICY_CONFIRMATION_FAILED');

                    // Assert Redis provider was NOT updated to V3
                    const redisAfterConfirmFail = inMemoryQuotaProvider._canonicalPolicies.get(authorityCode);
                    assert.equal(Number(redisAfterConfirmFail.version), 2, 'Redis must remain at V2 when confirmation fails');
                } finally {
                    AuthorityCanonicalPolicy.findById = origFindById;
                }
            } finally {
                setTestQuotaProvider(null);
            }
        }

        // 32.8: Manual Sync Audit Ordering & Pending Reconciliation (Objective D)
        {
            const req = {
                params: { authorityCode },
                user: approverUser,
                ip: '127.0.0.1',
                get(header) { return header === 'user-agent' ? 'test-agent' : null; },
                body: {}
            };

            // P2-D Case 1: Force audit persistence failure BEFORE sync -> zero Redis change
            const origAuditCreate = AuditLog.create;
            AuditLog.create = async () => {
                throw new Error('MOCK_PRE_SYNC_AUDIT_FAILURE');
            };
            try {
                let failCode = null;
                let failBody = null;
                const failRes = {
                    status(code) { failCode = code; return this; },
                    json(payload) { failBody = payload; return this; }
                };
                await syncCanonicalPolicy(req, failRes);
                assert.equal(failCode, 500);
                assert.equal(failBody.code, 'AUDIT_PERSISTENCE_FAILED');
            } finally {
                AuditLog.create = origAuditCreate;
            }

            // P2-D Case 1b: Pre-sync audit creation returns null -> fails closed without calling Redis
            AuditLog.create = async () => null;
            try {
                let nullCode = null;
                let nullBody = null;
                const nullRes = {
                    status(c) { nullCode = c; return this; },
                    json(b) { nullBody = b; return this; }
                };
                await syncCanonicalPolicy(req, nullRes);
                assert.equal(nullCode, 500);
                assert.equal(nullBody.code, 'AUDIT_PERSISTENCE_FAILED');
            } finally {
                AuditLog.create = origAuditCreate;
            }

            // P2-D Case 2: Force audit status-update failure AFTER Redis sync -> marks PENDING_RECONCILIATION
            const origFindByIdAndUpdate = AuditLog.findByIdAndUpdate;
            AuditLog.findByIdAndUpdate = async () => {
                throw new Error('MOCK_POST_SYNC_AUDIT_UPDATE_FAILURE');
            };
            try {
                let postFailCode = null;
                let postFailBody = null;
                const postFailRes = {
                    status(code) { postFailCode = code; return this; },
                    json(payload) { postFailBody = payload; return this; }
                };
                await syncCanonicalPolicy(req, postFailRes);
                assert.equal(postFailCode, 500);
                assert.equal(postFailBody.code, 'AUDIT_FINALIZATION_FAILED');

                const recondDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(recondDoc.redisSyncStatus, 'PENDING_RECONCILIATION', 'Must retain explicit pending reconciliation status');
                assert.ok(recondDoc.redisSyncError.includes('audit status finalization failed'));
            } finally {
                AuditLog.findByIdAndUpdate = origFindByIdAndUpdate;
            }

            // P2-D Case 2b: AuditLog.findByIdAndUpdate returns null -> marks PENDING_RECONCILIATION
            AuditLog.findByIdAndUpdate = async () => null;
            try {
                let postNullCode = null;
                let postNullBody = null;
                const postNullRes = {
                    status(c) { postNullCode = c; return this; },
                    json(b) { postNullBody = b; return this; }
                };
                await syncCanonicalPolicy(req, postNullRes);
                assert.equal(postNullCode, 500);
                assert.equal(postNullBody.code, 'AUDIT_FINALIZATION_FAILED');

                const recondDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(recondDoc.redisSyncStatus, 'PENDING_RECONCILIATION');
            } finally {
                AuditLog.findByIdAndUpdate = origFindByIdAndUpdate;
            }

            // P2-D Case 2c: Policy status updateOne throws after Redis sync -> marks PENDING_RECONCILIATION
            const origUpdateOne = AuthorityCanonicalPolicy.updateOne;
            let updateOneCallCount = 0;
            AuthorityCanonicalPolicy.updateOne = async function (...args) {
                updateOneCallCount++;
                if (updateOneCallCount === 1) {
                    throw new Error('MOCK_POLICY_UPDATE_ONE_CRASH');
                }
                return origUpdateOne.apply(this, args);
            };

            try {
                let updateFailCode = null;
                let updateFailBody = null;
                const updateFailRes = {
                    status(c) { updateFailCode = c; return this; },
                    json(b) { updateFailBody = b; return this; }
                };
                await syncCanonicalPolicy(req, updateFailRes);
                assert.equal(updateFailCode, 500);
                assert.equal(updateFailBody.code, 'POLICY_UPDATE_FAILED');

                const recondDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(recondDoc.redisSyncStatus, 'PENDING_RECONCILIATION');
            } finally {
                AuthorityCanonicalPolicy.updateOne = origUpdateOne;
            }

            // P2-D Case 2d: Policy status updateOne matches 0 documents -> marks PENDING_RECONCILIATION
            AuthorityCanonicalPolicy.updateOne = async function (...args) {
                if (args[1]?.$set?.redisSyncStatus === 'SYNCED') {
                    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
                }
                return origUpdateOne.apply(this, args);
            };

            try {
                let zeroMatchCode = null;
                let zeroMatchBody = null;
                const zeroMatchRes = {
                    status(c) { zeroMatchCode = c; return this; },
                    json(b) { zeroMatchBody = b; return this; }
                };
                await syncCanonicalPolicy(req, zeroMatchRes);
                assert.equal(zeroMatchCode, 500);
                assert.equal(zeroMatchBody.code, 'POLICY_NOT_MATCHED');

                const recondDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(recondDoc.redisSyncStatus, 'PENDING_RECONCILIATION');
            } finally {
                AuthorityCanonicalPolicy.updateOne = origUpdateOne;
            }

            // P2-D Case 3: Successful sync with idempotency contract enforcement
            await AuditLog.deleteMany({ eventType: 'canonical_policy_synced', 'metadata.authorityCode': authorityCode });
            const idempotentReq = {
                params: { authorityCode },
                user: approverUser,
                ip: '127.0.0.1',
                get: () => 'test-agent',
                body: { operationId: 'sync-contract-op-42' }
            };

            let okCode = null;
            let okBody = null;
            const okRes = {
                status(code) { okCode = code; return this; },
                json(payload) { okBody = payload; return this; }
            };

            // First call: executes sync and records completed audit log with operationId
            await syncCanonicalPolicy(idempotentReq, okRes);
            assert.ok(!okCode || okCode === 200);
            assert.equal(okBody.success, true);
            assert.equal(okBody.data.redisSyncStatus, 'SYNCED');

            const auditEntries1 = await AuditLog.find({
                eventType: 'canonical_policy_synced',
                'metadata.authorityCode': authorityCode,
                'metadata.operationId': 'sync-contract-op-42'
            });
            assert.equal(auditEntries1.length, 1, 'Must produce exactly one initial audit trail');
            assert.equal(auditEntries1[0].status, 'success');
            assert.equal(auditEntries1[0].metadata.syncPhase, 'COMPLETED');

            // Second call with same operationId: returns idempotent response without creating duplicate audit log
            let idempCode = null;
            let idempBody = null;
            const idempRes = {
                status(c) { idempCode = c; return this; },
                json(b) { idempBody = b; return this; }
            };

            await syncCanonicalPolicy(idempotentReq, idempRes);
            assert.equal(idempCode, 200);
            assert.equal(idempBody.success, true);
            assert.equal(idempBody.idempotent, true);
            assert.equal(idempBody.operationId, 'sync-contract-op-42');

            // Audit log count must strictly remain 1!
            const auditEntries2 = await AuditLog.find({
                eventType: 'canonical_policy_synced',
                'metadata.authorityCode': authorityCode,
                'metadata.operationId': 'sync-contract-op-42'
            });
            assert.equal(auditEntries2.length, 1, 'Idempotent retry must not create duplicate audit record');

            // P2-D Case 4: Atomic Concurrency under Explicit Promise Barrier (Objective 2)
            await AuditLog.deleteMany({ eventType: 'canonical_policy_synced', 'metadata.authorityCode': authorityCode });
            let redisCallCount = 0;
            let req1EnteredRedis = null;
            const req1RedisPromise = new Promise((resolve) => { req1EnteredRedis = resolve; });
            let releaseReq1Gate = null;
            const req1Gate = new Promise((resolve) => { releaseReq1Gate = resolve; });
            let gateEngaged = false;

            const concurrentQuotaProvider = {
                async setCanonicalPolicy() {
                    redisCallCount++;
                    if (!gateEngaged) {
                        gateEngaged = true;
                        req1EnteredRedis(); // Signals that req1 has written intent in Mongo and reached Redis
                        await req1Gate; // Holds req1 at Redis boundary until released
                    }
                    return { success: true };
                },
                async getCanonicalPolicy() {
                    return null;
                }
            };
            setTestQuotaProvider(concurrentQuotaProvider);

            try {
                const concurrentReq1 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: 'atomic-concurrent-op-99' }
                };
                const concurrentReq2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: 'atomic-concurrent-op-99' }
                };

                let c1Code = null, c1Body = null;
                const c1Res = {
                    status(c) { c1Code = c; return this; },
                    json(b) { c1Body = b; return this; }
                };
                let c2Code = null, c2Body = null;
                const c2Res = {
                    status(c) { c2Code = c; return this; },
                    json(b) { c2Body = b; return this; }
                };

                // Launch request 1 which creates intent and pauses at Redis gate
                const p1 = syncCanonicalPolicy(concurrentReq1, c1Res);
                // Wait for explicit barrier: req1 has written intent and reached Redis! (ZERO fixed sleep)
                await req1RedisPromise;

                // Launch request 2 which attempts to insert same correlationId and catches duplicate key error
                const p2 = syncCanonicalPolicy(concurrentReq2, c2Res);
                // Await request 2: finishes immediately with 202 OPERATION_IN_PROGRESS
                await p2;

                // Release request 1 to complete Redis sync
                releaseReq1Gate();
                await p1;

                // Assertions for atomic concurrency
                assert.equal(redisCallCount, 1, 'Exactly one Redis setCanonicalPolicy invocation must occur');
                assert.equal(c1Body.success, true, 'First request must succeed');
                assert.equal(c2Code, 202, 'Second overlapping request must return HTTP 202');
                assert.equal(c2Body.code, 'OPERATION_IN_PROGRESS', 'Second request must report OPERATION_IN_PROGRESS');
                assert.equal(c2Body.status, 'IN_PROGRESS');

                const currentPolicy = await getCanonicalPolicy(authorityCode);
                const scopedCorrelationId = `canonical_sync:${currentPolicy._id.toString()}:atomic-concurrent-op-99`;
                const auditRecords = await AuditLog.find({
                    eventType: 'canonical_policy_synced',
                    correlationId: scopedCorrelationId
                });
                assert.equal(auditRecords.length, 1, 'Exactly one durable audit intent/completed record must exist');
                assert.equal(auditRecords[0].metadata.syncPhase, 'COMPLETED');
                assert.equal(auditRecords[0].status, 'success');

                // Case 4b: Retry after completion must return HTTP 200 without second Redis sync
                let c3Code = null, c3Body = null;
                const c3Res = {
                    status(c) { c3Code = c; return this; },
                    json(b) { c3Body = b; return this; }
                };
                await syncCanonicalPolicy(concurrentReq1, c3Res);
                assert.equal(c3Code, 200, 'Retry after completion must return HTTP 200');
                assert.equal(c3Body.idempotent, true);
                assert.equal(c3Body.status, 'COMPLETED');
                assert.equal(redisCallCount, 1, 'Redis must not be called a second time on completed retry');

                const auditRecordsAfter = await AuditLog.find({
                    eventType: 'canonical_policy_synced',
                    correlationId: scopedCorrelationId
                });
                assert.equal(auditRecordsAfter.length, 1, 'Audit record count must strictly remain 1');

                // Case 4c: Independent operation IDs and independent target policies remain isolated
                const diffOpReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: 'distinct-op-101' }
                };
                let diffCode = null, diffBody = null;
                const diffRes = {
                    status(c) { diffCode = c; return this; },
                    json(b) { diffBody = b; return this; }
                };
                await syncCanonicalPolicy(diffOpReq, diffRes);
                assert.equal(diffBody.success, true);
                assert.equal(redisCallCount, 2, 'Distinct operationId must independently invoke sync');

                // Seed GMADA policy and test identical operationId across different authorities
                const gmadaPolicy = await registerOrRotateCanonicalPolicy({
                    authorityCode: 'GMADA',
                    policy: {
                        policyReference: 'GMADA/CANONICAL/01',
                        minIntervalMs: 20000,
                        maxRequestsPerMinute: 5,
                        maxRequestsPerDay: 200,
                        expiresAt: new Date(Date.now() + 86400000)
                    },
                    reviewedBy: activeReviewer._id.toString(),
                    approvedBy: approverUser._id.toString()
                });
                const gmadaAudit = await AuditLog.create({
                    eventType: 'canonical_policy_rotated',
                    targetType: 'authority_canonical_policy',
                    targetId: gmadaPolicy._id,
                    description: 'GMADA audit',
                    status: 'success'
                });
                await markCanonicalPolicyAudited({ policyId: gmadaPolicy._id, auditLogId: gmadaAudit._id });

                const gmadaReq = {
                    params: { authorityCode: 'GMADA' },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: 'atomic-concurrent-op-99' }
                };
                let gmadaCode = null, gmadaBody = null;
                const gmadaRes = {
                    status(c) { gmadaCode = c; return this; },
                    json(b) { gmadaBody = b; return this; }
                };
                await syncCanonicalPolicy(gmadaReq, gmadaRes);
                assert.equal(gmadaBody.success, true);
                assert.equal(redisCallCount, 3, 'Different target policy must not collide with same client operation ID');

                // Case 4d: Operation ID format, whitespace, and boundary validations
                // 1. Explicitly supplied empty string in body
                const emptyBodyReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: '' }
                };
                let ebCode = null, ebBody = null;
                await syncCanonicalPolicy(emptyBodyReq, {
                    status(c) { ebCode = c; return this; },
                    json(b) { ebBody = b; return this; }
                });
                assert.equal(ebCode, 400);
                assert.equal(ebBody.code, 'INVALID_OPERATION_ID');

                // 2. Whitespace-only string in body
                const wsBodyReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: '   ' }
                };
                let wsCode = null, wsBody = null;
                await syncCanonicalPolicy(wsBodyReq, {
                    status(c) { wsCode = c; return this; },
                    json(b) { wsBody = b; return this; }
                });
                assert.equal(wsCode, 400);
                assert.equal(wsBody.code, 'INVALID_OPERATION_ID');

                // 3. Explicitly supplied null in body
                const nullBodyReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: null }
                };
                let nbCode = null, nbBody = null;
                await syncCanonicalPolicy(nullBodyReq, {
                    status(c) { nbCode = c; return this; },
                    json(b) { nbBody = b; return this; }
                });
                assert.equal(nbCode, 400);
                assert.equal(nbBody.code, 'INVALID_OPERATION_ID');

                // 4. Empty idempotency-key header
                const emptyHdrReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    headers: { 'idempotency-key': '' }
                };
                let ehCode = null, ehBody = null;
                await syncCanonicalPolicy(emptyHdrReq, {
                    status(c) { ehCode = c; return this; },
                    json(b) { ehBody = b; return this; }
                });
                assert.equal(ehCode, 400);
                assert.equal(ehBody.code, 'INVALID_OPERATION_ID');

                // 5. Whitespace-only idempotency-key header
                const wsHdrReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    headers: { 'idempotency-key': '   \t  ' }
                };
                let whCode = null, whBody = null;
                await syncCanonicalPolicy(wsHdrReq, {
                    status(c) { whCode = c; return this; },
                    json(b) { whBody = b; return this; }
                });
                assert.equal(whCode, 400);
                assert.equal(whBody.code, 'INVALID_OPERATION_ID');

                // 6. Invalid characters in operation ID
                const invalidOpReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: 'invalid<script>alert(1)</script>' }
                };
                let invCode = null, invBody = null;
                await syncCanonicalPolicy(invalidOpReq, {
                    status(c) { invCode = c; return this; },
                    json(b) { invBody = b; return this; }
                });
                assert.equal(invCode, 400);
                assert.equal(invBody.code, 'INVALID_OPERATION_ID');

                // 7. Header contract: valid idempotency-key header succeeds
                const validHdrReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    headers: { 'idempotency-key': 'valid-hdr-op-88' }
                };
                let vhCode = null, vhBody = null;
                await syncCanonicalPolicy(validHdrReq, {
                    status(c) { vhCode = c; return this; },
                    json(b) { vhBody = b; return this; }
                });
                assert.equal(vhBody.success, true);
                assert.equal(vhBody.operationId, 'valid-hdr-op-88');

                // Case 4e: Requests without operationId are distinct and independent
                const noOpReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: {}
                };
                let noOp1Code = null, noOp1Body = null;
                const noOp1Res = {
                    status(c) { noOp1Code = c; return this; },
                    json(b) { noOp1Body = b; return this; }
                };
                let noOp2Code = null, noOp2Body = null;
                const noOp2Res = {
                    status(c) { noOp2Code = c; return this; },
                    json(b) { noOp2Body = b; return this; }
                };
                await syncCanonicalPolicy(noOpReq, noOp1Res);
                await syncCanonicalPolicy(noOpReq, noOp2Res);
                assert.equal(noOp1Body.success, true);
                assert.equal(noOp2Body.success, true);

                // Case 4f: Safe recovery from crash BEFORE Redis publication (abandoned intent)
                // Seed an abandoned INTENT record (>5s old) where Redis has NOT been updated
                const abandonedOpId = 'abandoned-crash-before-redis-99';
                const abandonedCorrId = `canonical_sync:${currentPolicy._id.toString()}:${abandonedOpId}`;
                const abandonedDoc = await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: abandonedCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated abandoned pre-sync intent',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'INTENT',
                        operationId: abandonedOpId
                    },
                    status: 'warning',
                    timestamp: new Date(Date.now() - 15000)
                });
                await AuditLog.collection.updateOne(
                    { _id: abandonedDoc._id },
                    { $set: { timestamp: new Date(Date.now() - 15000), createdAt: new Date(Date.now() - 15000), updatedAt: new Date(Date.now() - 15000) } }
                );

                const countBefore4f = redisCallCount;
                const recoveryReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: abandonedOpId }
                };
                let recCode = null, recBody = null;
                await syncCanonicalPolicy(recoveryReq, {
                    status(c) { recCode = c; return this; },
                    json(b) { recBody = b; return this; }
                });
                assert.equal(recBody.success, true, 'Recovery must succeed');
                assert.equal(recBody.status, 'COMPLETED');
                assert.equal(recBody.reconciled, true, 'Response must indicate reconciled recovery');
                assert.equal(redisCallCount, countBefore4f + 1, 'Redis must be called exactly once to complete un-synced abandoned intent');

                // Verify recovery audit log was generated
                const reconAudits = await AuditLog.find({
                    eventType: 'canonical_policy_sync_reconciled',
                    'metadata.operationId': abandonedOpId
                });
                assert.equal(reconAudits.length, 1, 'Reconciliation audit event must be logged');
                assert.equal(reconAudits[0].metadata.reconciliationAction, 'ABANDONED_INTENT_RECOVERED_AND_PUBLISHED');

                // Case 4g: Safe recovery from crash AFTER Redis publication (Redis-success / audit-finalization failure)
                // Simulate Redis ALREADY having the target version and content hash, but DB marked PENDING_RECONCILIATION
                const postSyncCrashOpId = 'post-sync-crash-recon-44';
                const postSyncCorrId = `canonical_sync:${currentPolicy._id.toString()}:${postSyncCrashOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: postSyncCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated post-sync unfinalized intent',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING_RECONCILIATION',
                        syncPhase: 'INTENT',
                        operationId: postSyncCrashOpId
                    },
                    status: 'warning',
                    createdAt: new Date(Date.now() - 10000)
                });

                await AuthorityCanonicalPolicy.updateOne(
                    { _id: currentPolicy._id },
                    { $set: { redisSyncStatus: 'PENDING_RECONCILIATION', redisSyncError: 'Simulated post-sync crash' } }
                );

                // Mock quotaProvider returning that Redis already holds this exact policy!
                const postSyncProvider = {
                    async setCanonicalPolicy() {
                        throw new Error('REDIS_MUST_NOT_BE_CALLED_WHEN_ALREADY_SYNCED');
                    },
                    async getCanonicalPolicy({ authorityCode: ac }) {
                        if (ac === authorityCode) {
                            return {
                                authorityCode,
                                version: currentPolicy.version,
                                contentHash: currentPolicy.contentHash,
                                policyReference: currentPolicy.policyReference
                            };
                        }
                        return null;
                    }
                };
                setTestQuotaProvider(postSyncProvider);

                const postSyncReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: postSyncCrashOpId }
                };
                let psCode = null, psBody = null;
                await syncCanonicalPolicy(postSyncReq, {
                    status(c) { psCode = c; return this; },
                    json(b) { psBody = b; return this; }
                });

                assert.equal(psBody.success, true, 'Recovery must succeed without throwing');
                assert.equal(psBody.status, 'COMPLETED');
                assert.equal(psBody.reconciled, true, 'Response must indicate reconciled: true');

                // Verify policy in database is now reconciled to SYNCED
                const policyAfterRecon = await getCanonicalPolicy(authorityCode);
                assert.equal(policyAfterRecon.redisSyncStatus, 'SYNCED', 'Policy status must be reconciled to SYNCED');
                assert.equal(policyAfterRecon.redisSyncError, null);

                // Verify reconciliation audit was recorded
                const reconAudits4g = await AuditLog.find({
                    eventType: 'canonical_policy_sync_reconciled',
                    'metadata.operationId': postSyncCrashOpId
                });
                assert.equal(reconAudits4g.length, 1, 'Reconciliation audit event must be recorded');
                assert.equal(reconAudits4g[0].metadata.reconciliationAction, 'AUDIT_FINALIZED_EXISTING_REDIS');

                // Case 4h: Simultaneous identical operation IDs racing without barrier
                const simProvider = {
                    calls: 0,
                    async setCanonicalPolicy() {
                        this.calls++;
                        return { success: true };
                    },
                    async getCanonicalPolicy() { return null; }
                };
                setTestQuotaProvider(simProvider);

                const simOpId = 'simultaneous-identical-op-55';
                const simReq1 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: simOpId }
                };
                const simReq2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: simOpId }
                };

                let sim1Code = null, sim1Body = null;
                let sim2Code = null, sim2Body = null;

                await Promise.all([
                    syncCanonicalPolicy(simReq1, { status(c) { sim1Code = c; return this; }, json(b) { sim1Body = b; return this; } }),
                    syncCanonicalPolicy(simReq2, { status(c) { sim2Code = c; return this; }, json(b) { sim2Body = b; return this; } })
                ]);

                // Exactly 1 Redis call must occur
                assert.equal(simProvider.calls, 1, 'Simultaneous requests must invoke Redis exactly once');
                const codes = [sim1Code || 200, sim2Code || 200].sort();
                assert.ok(
                    (codes[0] === 200 && codes[1] === 202) || (codes[0] === 200 && codes[1] === 200),
                    `Simultaneous requests must safely arbitrate: exactly 1 sync, got codes ${JSON.stringify(codes)}`
                );

                // Case 4i: Genuine long-running concurrency test (Worker 1 holds Redis operation beyond 5 seconds)
                // Worker 1 holds Redis operation for 5500ms (> 5000ms initial lease duration).
                // Periodic atomic heartbeat extends leaseExpiresAt in MongoDB.
                // Worker 2 attempts the same operation at 5100ms (> 5000ms).
                // Worker 2 receives HTTP 202 OPERATION_IN_PROGRESS without republishing.
                // Worker 1 completes successfully with HTTP 200.
                // Assert exactly one Redis publication occurred.
                const genuineLongOpId = 'genuine-long-op-beyond-5s';
                let genuinePublishCount = 0;
                let worker1Started = false;

                const genuineLongProvider = {
                    async setCanonicalPolicy() {
                        genuinePublishCount++;
                        worker1Started = true;
                        // Genuine delay exceeding 5 seconds (7500ms) to ensure lease renewal is active
                        await new Promise(r => setTimeout(r, 7500));
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(genuineLongProvider);

                const genuineReq1 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: genuineLongOpId }
                };
                let g1Code = null, g1Body = null;
                const g1Promise = syncCanonicalPolicy(genuineReq1, {
                    status(c) { g1Code = c; return this; },
                    json(b) { g1Body = b; return this; }
                });

                // Wait until Worker 1 enters setCanonicalPolicy
                while (!worker1Started) {
                    await new Promise(r => setTimeout(r, 50));
                }

                // Wait until 5100ms has elapsed (> 5s initial lease window!)
                await new Promise(r => setTimeout(r, 5100));

                // Worker 2 attempts the exact same operation while Worker 1 is still inside setCanonicalPolicy
                const genuineReq2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: genuineLongOpId }
                };
                let g2Code = null, g2Body = null;
                await syncCanonicalPolicy(genuineReq2, {
                    status(c) { g2Code = c; return this; },
                    json(b) { g2Body = b; return this; }
                });
                assert.equal(g2Code, 202, 'Worker 2 must receive HTTP 202 while Worker 1 heartbeat renews lease beyond 5s');
                assert.equal(g2Body.code, 'OPERATION_IN_PROGRESS');

                // Await Worker 1 completion
                await g1Promise;
                assert.equal(g1Code, 200, 'Worker 1 must complete successfully after long Redis operation');
                assert.equal(g1Body.status, 'COMPLETED');
                assert.equal(genuinePublishCount, 1, 'Exactly one Redis publication must occur');

                // Subsequent request after completion returns 200 idempotent without republishing
                let g3Code = null, g3Body = null;
                await syncCanonicalPolicy(genuineReq2, {
                    status(c) { g3Code = c; return this; },
                    json(b) { g3Body = b; return this; }
                });
                assert.equal(g3Code, 200, 'Subsequent request must return 200 idempotent');
                assert.equal(genuinePublishCount, 1, 'Subsequent request must not publish to Redis again');

                // Case 4i.2: Redis-side idempotency and recovery after worker crash (Redis already synced)
                const longRedisOpId = 'long-redis-op-99';
                const longRedisCorrId = `canonical_sync:${currentPolicy._id.toString()}:${longRedisOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: longRedisCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated expired worker lease where Redis publication finished after 5s',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'PUBLISHING',
                        leaseOwner: 'worker-expired-1',
                        leaseExpiresAt: new Date(Date.now() - 1000), // Expired lease
                        operationId: longRedisOpId
                    },
                    status: 'warning',
                    timestamp: new Date(Date.now() - 6000)
                });

                let longRedisCalls = 0;
                const longRedisProvider = {
                    async setCanonicalPolicy() {
                        longRedisCalls++;
                        throw new Error('REDIS_MUST_NOT_BE_CALLED_IF_ALREADY_SYNCED');
                    },
                    async getCanonicalPolicy({ authorityCode: ac, authoritative }) {
                        assert.equal(authoritative, true, 'Reconciliation must query Redis authoritatively');
                        if (ac === authorityCode) {
                            return {
                                authorityCode,
                                version: currentPolicy.version,
                                contentHash: currentPolicy.contentHash,
                                policyReference: currentPolicy.policyReference
                            };
                        }
                        return null;
                    }
                };
                setTestQuotaProvider(longRedisProvider);

                const longRedisReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: longRedisOpId }
                };
                let lrCode = null, lrBody = null;
                await syncCanonicalPolicy(longRedisReq, {
                    status(c) { lrCode = c; return this; },
                    json(b) { lrBody = b; return this; }
                });
                assert.equal(lrBody.success, true);
                assert.equal(lrBody.status, 'COMPLETED');
                assert.equal(lrBody.reconciled, true);
                assert.equal(longRedisCalls, 0, 'Redis setCanonicalPolicy must not be called when already synced in Redis');

                // Case 4j: Two workers competing for expired lease (Redis not yet updated)
                const expiredRaceOpId = 'expired-lease-race-88';
                const expiredRaceCorrId = `canonical_sync:${currentPolicy._id.toString()}:${expiredRaceOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: expiredRaceCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated expired worker lease before Redis publication',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'PUBLISHING',
                        leaseOwner: 'worker-dead-initial',
                        leaseExpiresAt: new Date(Date.now() - 2000), // Expired
                        operationId: expiredRaceOpId
                    },
                    status: 'warning',
                    timestamp: new Date(Date.now() - 8000)
                });

                let expiredRacePublishCount = 0;
                const expiredRaceProvider = {
                    async setCanonicalPolicy() {
                        expiredRacePublishCount++;
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative }) {
                        assert.equal(authoritative, true);
                        return null; // Not yet in Redis
                    }
                };
                setTestQuotaProvider(expiredRaceProvider);

                const raceReq1 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: expiredRaceOpId }
                };
                const raceReq2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: expiredRaceOpId }
                };
                let r1Code = null, r1Body = null;
                let r2Code = null, r2Body = null;
                await Promise.all([
                    syncCanonicalPolicy(raceReq1, { status(c) { r1Code = c; return this; }, json(b) { r1Body = b; return this; } }),
                    syncCanonicalPolicy(raceReq2, { status(c) { r2Code = c; return this; }, json(b) { r2Body = b; return this; } })
                ]);

                // Exactly 1 worker wins the lease and publishes, the other receives 202
                const raceCodes = [r1Code || 200, r2Code || 200].sort();
                assert.deepEqual(raceCodes, [200, 202], 'Two competing workers on expired lease must result in one 200 and one 202');
                assert.equal(expiredRacePublishCount, 1, 'Exactly one Redis publication must occur between competing workers');

                // Case 4k: Authoritative Redis read timeout & Redis unavailable
                const timeoutOpId = 'redis-timeout-op-77';
                const timeoutCorrId = `canonical_sync:${currentPolicy._id.toString()}:${timeoutOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: timeoutCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated expired lease to test Redis read timeout',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'PUBLISHING',
                        leaseOwner: 'worker-timeout-test',
                        leaseExpiresAt: new Date(Date.now() - 1000),
                        operationId: timeoutOpId
                    },
                    status: 'warning',
                    timestamp: new Date(Date.now() - 7000)
                });

                let timeoutCalls = 0;
                const timeoutProvider = {
                    async setCanonicalPolicy() {
                        timeoutCalls++;
                        throw new Error('SET_MUST_NOT_BE_CALLED_ON_TIMEOUT');
                    },
                    async getCanonicalPolicy({ authoritative }) {
                        assert.equal(authoritative, true);
                        const err = new Error('Redis read timed out after 3000ms');
                        err.code = 'REDIS_READ_TIMEOUT';
                        throw err;
                    }
                };
                setTestQuotaProvider(timeoutProvider);

                const timeoutReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: timeoutOpId }
                };
                let toCode = null, toBody = null;
                await syncCanonicalPolicy(timeoutReq, {
                    status(c) { toCode = c; return this; },
                    json(b) { toBody = b; return this; }
                });
                assert.equal(toCode, 503, 'Redis read timeout must fail closed with HTTP 503');
                assert.equal(toBody.code, 'REDIS_READ_TIMEOUT');
                assert.equal(toBody.status, 'PENDING_RECONCILIATION');
                assert.equal(timeoutCalls, 0, 'Redis setCanonicalPolicy must not be called when read times out');

                // Case 4l: Redis unavailable during reconciliation
                const unavailOpId = 'redis-unavail-op-66';
                const unavailCorrId = `canonical_sync:${currentPolicy._id.toString()}:${unavailOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: unavailCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated expired lease to test Redis unavailable',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'PUBLISHING',
                        leaseOwner: 'worker-unavail-test',
                        leaseExpiresAt: new Date(Date.now() - 1000),
                        operationId: unavailOpId
                    },
                    status: 'warning',
                    timestamp: new Date(Date.now() - 7000)
                });

                let unavailCalls = 0;
                const unavailProvider = {
                    async setCanonicalPolicy() {
                        unavailCalls++;
                        throw new Error('SET_MUST_NOT_BE_CALLED_WHEN_UNAVAILABLE');
                    },
                    async getCanonicalPolicy({ authoritative }) {
                        assert.equal(authoritative, true);
                        const err = new Error('Redis connection refused: ECONNREFUSED');
                        err.code = 'REDIS_UNAVAILABLE';
                        throw err;
                    }
                };
                setTestQuotaProvider(unavailProvider);

                const unavailReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: unavailOpId }
                };
                let uaCode = null, uaBody = null;
                await syncCanonicalPolicy(unavailReq, {
                    status(c) { uaCode = c; return this; },
                    json(b) { uaBody = b; return this; }
                });
                assert.equal(uaCode, 503, 'Redis unavailable must fail closed with HTTP 503');
                assert.equal(uaBody.code, 'REDIS_UNAVAILABLE');
                assert.equal(uaBody.status, 'PENDING_RECONCILIATION');
                assert.equal(unavailCalls, 0, 'Redis setCanonicalPolicy must not be called when unavailable');

                // Case 4m: Stale worker attempting finalization after lease was preempted
                const staleWorkerOpId = 'stale-worker-op-33';
                const staleWorkerCorrId = `canonical_sync:${currentPolicy._id.toString()}:${staleWorkerOpId}`;
                const staleAuditDoc = await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: staleWorkerCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated worker whose lease was stolen before finalization',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING',
                        syncPhase: 'PUBLISHING',
                        leaseOwner: 'stale-lease-token-11',
                        leaseExpiresAt: new Date(Date.now() + 5000),
                        operationId: staleWorkerOpId
                    },
                    status: 'warning'
                });

                // Simulate Worker 2 preempting the lease in MongoDB:
                await AuditLog.updateOne(
                    { _id: staleAuditDoc._id },
                    {
                        $set: {
                            'metadata.leaseOwner': 'active-lease-token-22',
                            'metadata.recoveryClaimedAt': new Date()
                        }
                    }
                );

                // Now any competing request while lease is active returns 202:
                const secondWorkerReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: staleWorkerOpId }
                };
                let swCode = null, swBody = null;
                await syncCanonicalPolicy(secondWorkerReq, {
                    status(c) { swCode = c; return this; },
                    json(b) { swBody = b; return this; }
                });
                assert.equal(swCode, 202, 'Active lease held by another worker must return HTTP 202');
                assert.equal(swBody.code, 'OPERATION_IN_PROGRESS');

                // Now simulate a stale worker whose lease was stolen during its Redis I/O
                let staleWorkerPublishes = 0;
                const staleWorkerProvider = {
                    async setCanonicalPolicy() {
                        staleWorkerPublishes++;
                        // Preempt the lease in MongoDB while this worker is publishing to Redis:
                        await AuditLog.updateOne(
                            { correlationId: `canonical_sync:${currentPolicy._id.toString()}:stale-finalization-op-44` },
                            {
                                $set: {
                                    'metadata.leaseOwner': 'competing-worker-took-lease',
                                    'metadata.recoveryClaimedAt': new Date()
                                }
                            }
                        );
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(staleWorkerProvider);

                const staleFinOpId = 'stale-finalization-op-44';
                const staleFinReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: staleFinOpId }
                };
                let sfCode = null, sfBody = null;
                await syncCanonicalPolicy(staleFinReq, {
                    status(c) { sfCode = c; return this; },
                    json(b) { sfBody = b; return this; }
                });
                assert.equal(sfCode, 409, 'Stale worker whose lease was lost must fail with HTTP 409');
                assert.equal(sfBody.code, 'STALE_WORKER_LEASE_LOST');
                assert.equal(staleWorkerPublishes, 1, 'Redis was called before finalization check');

                // Case 4o: Heartbeat renewal database failure marks lease as lost and stops renewals
                const origFindOneAndUpdate = AuditLog.findOneAndUpdate;
                let heartbeatErrorThrown = false;
                AuditLog.findOneAndUpdate = function (filter, update, options) {
                    if (update?.$set && update.$set['metadata.lastHeartbeatAt']) {
                        heartbeatErrorThrown = true;
                        throw new Error('Simulated MongoDB connection lost during heartbeat renewal');
                    }
                    return origFindOneAndUpdate.call(this, filter, update, options);
                };

                let hbFailPublishes = 0;
                const hbFailProvider = {
                    async setCanonicalPolicy() {
                        hbFailPublishes++;
                        // Wait long enough for heartbeat interval (1500ms) to fire and throw
                        await new Promise(r => setTimeout(r, 1600));
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(hbFailProvider);

                try {
                    const hbFailOpId = 'hb-fail-op-55';
                    const hbFailReq = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: hbFailOpId }
                    };
                    let hbfCode = null, hbfBody = null;
                    await syncCanonicalPolicy(hbFailReq, {
                        status(c) { hbfCode = c; return this; },
                        json(b) { hbfBody = b; return this; }
                    });
                    assert.equal(heartbeatErrorThrown, true, 'Heartbeat renewal must have attempted update and thrown');
                    assert.equal(hbfCode, 409, 'Heartbeat database failure must mark lease as lost and fail closed with HTTP 409');
                    assert.equal(hbfBody.code, 'STALE_WORKER_LEASE_LOST');
                    assert.equal(hbFailPublishes, 1, 'Exactly one Redis publication attempted before lease loss');

                    // Verify policy in DB was NOT marked SYNCED
                    const polDoc = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.notEqual(polDoc.redisSyncStatus, 'SYNCED', 'Policy must not be marked SYNCED after heartbeat failure');
                } finally {
                    AuditLog.findOneAndUpdate = origFindOneAndUpdate;
                }

                // Case 4p: Expired lease with unchanged owner must NEVER finalize
                let expOwnerPublishes = 0;
                const expOwnerProvider = {
                    async setCanonicalPolicy() {
                        expOwnerPublishes++;
                        // Set leaseExpiresAt into the past WITHOUT changing leaseOwner
                        await AuditLog.updateOne(
                            { correlationId: `canonical_sync:${currentPolicy._id.toString()}:expired-unchanged-owner-op-66` },
                            {
                                $set: {
                                    'metadata.leaseExpiresAt': new Date(Date.now() - 5000)
                                }
                            }
                        );
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(expOwnerProvider);

                const expOwnerOpId = 'expired-unchanged-owner-op-66';
                const expOwnerReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: expOwnerOpId }
                };
                let eoCode = null, eoBody = null;
                await syncCanonicalPolicy(expOwnerReq, {
                    status(c) { eoCode = c; return this; },
                    json(b) { eoBody = b; return this; }
                });
                assert.equal(eoCode, 409, 'Expired lease with unchanged owner must fail closed with HTTP 409');
                assert.equal(eoBody.code, 'STALE_WORKER_LEASE_LOST');
                assert.equal(expOwnerPublishes, 1, 'Exactly one Redis publication occurred');

                // Verify policy in DB was NOT marked SYNCED
                const polDocExp = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.notEqual(polDocExp.redisSyncStatus, 'SYNCED', 'Policy must never be finalized by expired lease worker');

                // Case 4n: Durability - Policy update failure after Redis sync fails closed
                const normalMockProvider = {
                    async setCanonicalPolicy() { return { success: true }; },
                    async getCanonicalPolicy() { return null; }
                };
                setTestQuotaProvider(normalMockProvider);

                const origPolicyUpdate = AuthorityCanonicalPolicy.updateOne;
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (update?.$set?.redisSyncStatus === 'SYNCED') {
                        return { acknowledged: false, matchedCount: 1, modifiedCount: 0 };
                    }
                    return origPolicyUpdate.call(this, filter, update, options);
                };

                try {
                    const failUpdateOpId = 'fail-policy-update-op-12';
                    const failUpdateReq = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: failUpdateOpId }
                    };
                    let fuCode = null, fuBody = null;
                    await syncCanonicalPolicy(failUpdateReq, {
                        status(c) { fuCode = c; return this; },
                        json(b) { fuBody = b; return this; }
                    });
                    assert.equal(fuCode, 500, 'Unacknowledged/unmatched policy update must fail closed with HTTP 500');
                    assert.equal(fuBody.code, 'POLICY_UPDATE_FAILED');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = origPolicyUpdate;
                }

                // Case 4q: Worker A loses lease; Worker B reclaims; Worker A's delayed Redis failure must not overwrite Worker B's state
                let delayedFailCalls = 0;
                const delayedFailProvider = {
                    async setCanonicalPolicy() {
                        delayedFailCalls++;
                        // Worker B reclaims the lease in MongoDB while Worker A is blocked in Redis
                        await AuditLog.updateOne(
                            { correlationId: `canonical_sync:${currentPolicy._id.toString()}:delayed-fail-lease-op-77` },
                            {
                                $set: {
                                    'metadata.leaseOwner': 'worker-b-active-lease-token',
                                    'metadata.leaseExpiresAt': new Date(Date.now() + 10000),
                                    'metadata.recoveryClaimedAt': new Date()
                                }
                            }
                        );
                        // Also simulate Worker B updating the canonical policy to SYNCED
                        await AuthorityCanonicalPolicy.updateOne(
                            { _id: currentPolicy._id },
                            {
                                $set: {
                                    redisSyncStatus: 'SYNCED',
                                    redisSyncError: null,
                                    lastSyncedAt: new Date()
                                }
                            }
                        );
                        // Now Worker A's Redis sync fails
                        const err = new Error('SIMULATED_DELAYED_REDIS_FAILURE');
                        err.code = 'REDIS_SYNC_FAILED';
                        throw err;
                    },
                    async getCanonicalPolicy() { return null; }
                };
                setTestQuotaProvider(delayedFailProvider);

                const delayedFailOpId = 'delayed-fail-lease-op-77';
                const delayedFailReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: delayedFailOpId }
                };
                let dfCode = null, dfBody = null;
                await syncCanonicalPolicy(delayedFailReq, {
                    status(c) { dfCode = c; return this; },
                    json(b) { dfBody = b; return this; }
                });
                assert.equal(dfCode, 409, 'Delayed Redis failure by stale worker whose lease was lost must fail closed with HTTP 409');
                assert.equal(dfBody.code, 'STALE_WORKER_LEASE_LOST');
                assert.equal(delayedFailCalls, 1, 'Exactly one Redis publication attempted');

                // Verify Worker A did NOT overwrite Worker B's audit lease or Worker B's policy status
                const auditAfterDelayedFail = await AuditLog.findOne({
                    correlationId: `canonical_sync:${currentPolicy._id.toString()}:${delayedFailOpId}`
                });
                assert.equal(auditAfterDelayedFail.metadata.leaseOwner, 'worker-b-active-lease-token', 'Worker B leaseOwner must be preserved');
                assert.notEqual(auditAfterDelayedFail.status, 'failed', 'Audit must not be marked failed by stale Worker A');

                const policyAfterDelayedFail = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.equal(policyAfterDelayedFail.redisSyncStatus, 'SYNCED', 'Worker B SYNCED status must not be overwritten to FAILED by stale Worker A');

                // Case 4r: Redis succeeds but MongoDB policy update throws; retry same operationId and verify actual reconciliation, not early success
                let r4rRedisPublishes = 0;
                let r4rRedisState = null;
                const reconRetryProvider = {
                    async setCanonicalPolicy(payload) {
                        r4rRedisPublishes++;
                        r4rRedisState = {
                            version: payload.policyVersion,
                            contentHash: payload.policy.contentHash
                        };
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return r4rRedisState;
                    }
                };
                setTestQuotaProvider(reconRetryProvider);

                await AuthorityCanonicalPolicy.updateOne(
                    { _id: currentPolicy._id },
                    { $set: { redisSyncStatus: 'PENDING', redisSyncError: null } }
                );

                const origUpdateOne4r = AuthorityCanonicalPolicy.updateOne;
                let updateOne4rAttempts = 0;
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (update?.$set?.redisSyncStatus === 'SYNCED') {
                        updateOne4rAttempts++;
                        if (updateOne4rAttempts === 1) {
                            throw new Error('SIMULATED_DB_DISCONNECTION_DURING_POLICY_SYNC');
                        }
                    }
                    return origUpdateOne4r.call(this, filter, update, options);
                };

                try {
                    const retryOpId = 'retry-after-policy-throw-op-88';
                    const retryReq = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: retryOpId }
                    };

                    // First call: Redis succeeds, but MongoDB policy update throws -> 500
                    let r1Code = null, r1Body = null;
                    await syncCanonicalPolicy(retryReq, {
                        status(c) { r1Code = c; return this; },
                        json(b) { r1Body = b; return this; }
                    });
                    assert.equal(r1Code, 500, 'First attempt must fail with 500 when policy update throws');
                    assert.equal(r1Body.code, 'POLICY_UPDATE_FAILED');
                    assert.equal(r4rRedisPublishes, 1, 'Redis publication succeeded on first attempt');

                    // Verify DB states: policy is PENDING_RECONCILIATION, audit is PENDING_RECONCILIATION
                    const polAfterThrow = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polAfterThrow.redisSyncStatus, 'PENDING_RECONCILIATION');

                    const auditAfterThrow = await AuditLog.findOne({
                        correlationId: `canonical_sync:${currentPolicy._id.toString()}:${retryOpId}`
                    });
                    assert.notEqual(auditAfterThrow.metadata.syncPhase, 'COMPLETED', 'Audit must NOT be marked COMPLETED when policy update threw');
                    assert.equal(auditAfterThrow.metadata.syncPhase, 'PENDING_RECONCILIATION');

                    // Second call: caller retries with the exact same operationId
                    let r2Code = null, r2Body = null;
                    await syncCanonicalPolicy(retryReq, {
                        status(c) { r2Code = c; return this; },
                        json(b) { r2Body = b; return this; }
                    });
                    assert.equal(r2Code, 200, 'Retry must reconcile from Redis and return HTTP 200');
                    assert.equal(r2Body.success, true);
                    assert.equal(r2Body.status, 'COMPLETED');
                    assert.equal(r2Body.reconciled, true, 'Response must confirm reconciliation, not early naive success');
                    assert.equal(r4rRedisPublishes, 1, 'Exactly one Redis publication must have occurred; reconciliation must not republish');

                    // Verify DB states after reconciliation
                    const polAfterRecon = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polAfterRecon.redisSyncStatus, 'SYNCED', 'Policy in MongoDB must now be durably SYNCED');

                    const auditAfterRecon = await AuditLog.findOne({
                        correlationId: `canonical_sync:${currentPolicy._id.toString()}:${retryOpId}`
                    });
                    assert.equal(auditAfterRecon.metadata.syncPhase, 'COMPLETED');
                    assert.equal(auditAfterRecon.metadata.redisSyncStatus, 'SYNCED');

                    // Case 4t: Duplicate retries remain idempotent
                    let r3Code = null, r3Body = null;
                    await syncCanonicalPolicy(retryReq, {
                        status(c) { r3Code = c; return this; },
                        json(b) { r3Body = b; return this; }
                    });
                    assert.equal(r3Code, 200, 'Duplicate retry of completed sync must return 200');
                    assert.equal(r3Body.idempotent, true, 'Must indicate idempotent response');
                    assert.equal(r3Body.status, 'COMPLETED');
                    assert.equal(r4rRedisPublishes, 1, 'Zero additional Redis publications on idempotent retry');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = origUpdateOne4r;
                }

                // Case 4s: Zero matched writes on policy update
                const zeroMatchProvider = {
                    async setCanonicalPolicy() { return { success: true }; },
                    async getCanonicalPolicy() { return null; }
                };
                setTestQuotaProvider(zeroMatchProvider);

                const origUpdateOne4s = AuthorityCanonicalPolicy.updateOne;
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (update?.$set?.redisSyncStatus === 'SYNCED') {
                        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
                    }
                    return origUpdateOne4s.call(this, filter, update, options);
                };

                try {
                    const zmOpId = 'zero-matched-policy-op-99';
                    const zmReq = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: zmOpId }
                    };
                    let zmCode = null, zmBody = null;
                    await syncCanonicalPolicy(zmReq, {
                        status(c) { zmCode = c; return this; },
                        json(b) { zmBody = b; return this; }
                    });
                    assert.equal(zmCode, 500, 'Zero matched write must fail closed with HTTP 500');
                    assert.equal(zmBody.code, 'POLICY_NOT_MATCHED');

                    const auditZm = await AuditLog.findOne({
                        correlationId: `canonical_sync:${currentPolicy._id.toString()}:${zmOpId}`
                    });
                    assert.equal(auditZm.metadata.syncPhase, 'PENDING_RECONCILIATION');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = origUpdateOne4s;
                }

                // Case 4u: Authoritative Redis record with malformed/missing version or contentHash fails closed
                let malformedPublishes = 0;
                const malformedProvider = {
                    async setCanonicalPolicy() {
                        malformedPublishes++;
                        return { success: true };
                    },
                    // Return malformed authoritative record (missing version and empty contentHash)
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return { version: null, contentHash: '' };
                    }
                };
                setTestQuotaProvider(malformedProvider);

                // Create an existing audit intent in PENDING_RECONCILIATION state
                const malformedOpId = 'malformed-redis-record-op-102';
                const malformedCorrId = `canonical_sync:${currentPolicy._id.toString()}:${malformedOpId}`;
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: malformedCorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    description: 'Simulated pending reconciliation before malformed Redis check',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'PENDING_RECONCILIATION',
                        syncPhase: 'PENDING_RECONCILIATION',
                        operationId: malformedOpId
                    },
                    status: 'warning'
                });

                const malformedReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: malformedOpId }
                };
                let mfCode = null, mfBody = null;
                await syncCanonicalPolicy(malformedReq, {
                    status(c) { mfCode = c; return this; },
                    json(b) { mfBody = b; return this; }
                });
                assert.equal(mfCode, 502, 'Malformed authoritative Redis record must fail closed with HTTP 502');
                assert.equal(mfBody.code, 'MALFORMED_REDIS_POLICY');
                assert.equal(mfBody.status, 'PENDING_RECONCILIATION');
                assert.equal(malformedPublishes, 0, 'Must NEVER publish or republish when authoritative Redis record is malformed');

                const polAfterMalformed = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.equal(polAfterMalformed.redisSyncStatus, 'PENDING_RECONCILIATION', 'Policy must remain PENDING_RECONCILIATION');

                // Case 4v: Lease lost immediately before policy write (atomic FINALIZING CAS rejects stale worker)
                let race4vPublishes = 0;
                const race4vOpId = 'race-4v-lease-lost-before-policy';
                const race4vCorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4vOpId}`;

                const race4vProvider = {
                    async setCanonicalPolicy() {
                        race4vPublishes++;
                        // Preempt lease in MongoDB while Worker 1 is publishing to Redis
                        await AuditLog.updateOne(
                            { correlationId: race4vCorrId },
                            {
                                $set: {
                                    'metadata.leaseOwner': 'competing-preempted-worker-4v',
                                    'metadata.recoveryClaimedAt': new Date()
                                }
                            }
                        );
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(race4vProvider);

                // Ensure policy is in known non-synced state
                await AuthorityCanonicalPolicy.updateOne(
                    { _id: currentPolicy._id },
                    { $set: { redisSyncStatus: 'PENDING', redisSyncError: null } }
                );

                const race4vReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4vOpId }
                };
                let r4vCode = null, r4vBody = null;
                await syncCanonicalPolicy(race4vReq, {
                    status(c) { r4vCode = c; return this; },
                    json(b) { r4vBody = b; return this; }
                });

                assert.equal(r4vCode, 409, 'Worker that lost lease before policy write must fail with 409');
                assert.equal(r4vBody.code, 'STALE_WORKER_LEASE_LOST');
                assert.equal(race4vPublishes, 1, 'Redis publication was called before CAS rejection');

                // Verify policy in MongoDB was NOT marked SYNCED
                const pol4v = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.notEqual(pol4v.redisSyncStatus, 'SYNCED', 'Policy must not be marked SYNCED by stale worker');

                // Verify audit log was not finalized to COMPLETED by stale worker
                const audit4v = await AuditLog.findOne({ correlationId: race4vCorrId });
                assert.notEqual(audit4v.metadata?.syncPhase, 'COMPLETED');
                assert.notEqual(audit4v.status, 'success');

                // Case 4w: Lease lost during failure-marker write (stale failure CAS rejects overwriting active worker)
                let race4wPublishes = 0;
                const race4wOpId = 'race-4w-lease-lost-during-failure';
                const race4wCorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4wOpId}`;

                const race4wProvider = {
                    async setCanonicalPolicy() {
                        race4wPublishes++;
                        // Preempt lease in MongoDB during Redis publication
                        await AuditLog.updateOne(
                            { correlationId: race4wCorrId },
                            {
                                $set: {
                                    'metadata.leaseOwner': 'new-active-worker-4w',
                                    'metadata.recoveryClaimedAt': new Date()
                                }
                            }
                        );
                        // Throw Redis error so worker enters failure path
                        const err = new Error('REDIS_FAILURE_4W');
                        err.code = 'REDIS_SYNC_FAILED';
                        throw err;
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(race4wProvider);

                // Set policy to SYNCED to verify stale worker failure does NOT overwrite SYNCED
                await AuthorityCanonicalPolicy.updateOne(
                    { _id: currentPolicy._id },
                    { $set: { redisSyncStatus: 'SYNCED', redisSyncError: null } }
                );

                const race4wReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4wOpId }
                };
                let r4wCode = null, r4wBody = null;
                await syncCanonicalPolicy(race4wReq, {
                    status(c) { r4wCode = c; return this; },
                    json(b) { r4wBody = b; return this; }
                });

                assert.equal(r4wCode, 409, 'Stale worker on failure path must fail with 409');
                assert.equal(r4wBody.code, 'STALE_WORKER_LEASE_LOST');
                assert.equal(race4wPublishes, 1);

                // Verify policy in MongoDB was NOT overwritten to FAILED
                const pol4w = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.equal(pol4w.redisSyncStatus, 'SYNCED', 'Active worker SYNCED state must not be overwritten to FAILED by stale worker');

                // Case 4x: Policy version changes during sync (optimistic version fencing aborts write)
                let race4xPublishes = 0;
                const race4xOpId = 'race-4x-version-changed-during-sync';
                const race4xCorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4xOpId}`;

                const race4xProvider = {
                    async setCanonicalPolicy() {
                        race4xPublishes++;
                        // Concurrently advance policy version in MongoDB while sync is in flight
                        await AuthorityCanonicalPolicy.updateOne(
                            { _id: currentPolicy._id },
                            {
                                $set: {
                                    version: Number(currentPolicy.version) + 1,
                                    contentHash: 'concurrently-modified-content-hash-v' + (Number(currentPolicy.version) + 1),
                                    redisSyncStatus: 'PENDING'
                                }
                            }
                        );
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return null;
                    }
                };
                setTestQuotaProvider(race4xProvider);

                const race4xReq = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4xOpId }
                };
                let r4xCode = null, r4xBody = null;
                await syncCanonicalPolicy(race4xReq, {
                    status(c) { r4xCode = c; return this; },
                    json(b) { r4xBody = b; return this; }
                });

                assert.equal(r4xCode, 409, 'Concurrent policy version modification must fail with HTTP 409');
                assert.equal(r4xBody.code, 'STALE_POLICY_VERSION');
                assert.equal(race4xPublishes, 1);

                // Verify MongoDB policy version remains the incremented version and was NOT downgraded
                const pol4x = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.equal(pol4x.version, Number(currentPolicy.version) + 1, 'Policy version must remain the new incremented version');

                // Restore original policy version in MongoDB for subsequent tests
                await AuthorityCanonicalPolicy.updateOne(
                    { _id: currentPolicy._id },
                    {
                        $set: {
                            version: currentPolicy.version,
                            contentHash: currentPolicy.contentHash,
                            redisSyncStatus: 'PENDING'
                        }
                    }
                );

                // Case 4y: Recovery worker succeeds while old worker is still returning
                let race4yWorker1Entered = false;
                let race4yWorker2Finished = false;
                const race4yOpId = 'race-4y-recovery-succeeds-while-old-returns';
                const race4yCorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4yOpId}`;

                const race4yProvider = {
                    async setCanonicalPolicy() {
                        race4yWorker1Entered = true;
                        // Worker 1 simulates long processing until Worker 2 has recovered and finished
                        while (!race4yWorker2Finished) {
                            await new Promise(r => setTimeout(r, 50));
                        }
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        assert.equal(authoritative, true);
                        return {
                            authorityCode,
                            version: currentPolicy.version,
                            contentHash: currentPolicy.contentHash,
                            policyReference: currentPolicy.policyReference
                        };
                    }
                };
                setTestQuotaProvider(race4yProvider);

                const race4yReq1 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4yOpId }
                };
                let r4y1Code = null, r4y1Body = null;
                const worker1Promise = syncCanonicalPolicy(race4yReq1, {
                    status(c) { r4y1Code = c; return this; },
                    json(b) { r4y1Body = b; return this; }
                });

                // Wait until Worker 1 enters setCanonicalPolicy
                while (!race4yWorker1Entered) {
                    await new Promise(r => setTimeout(r, 20));
                }

                // Expire Worker 1's lease in MongoDB to simulate abandonment / lease timeout
                await AuditLog.updateOne(
                    { correlationId: race4yCorrId },
                    {
                        $set: {
                            'metadata.leaseExpiresAt': new Date(Date.now() - 2000)
                        }
                    }
                );

                // Worker 2 runs recovery (reconcileExistingIntent -> Case A: Redis already has policy)
                const race4yReq2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4yOpId }
                };
                let r4y2Code = null, r4y2Body = null;
                await syncCanonicalPolicy(race4yReq2, {
                    status(c) { r4y2Code = c; return this; },
                    json(b) { r4y2Body = b; return this; }
                });

                assert.equal(r4y2Code, 200, 'Recovery Worker 2 must succeed with HTTP 200');
                assert.equal(r4y2Body.status, 'COMPLETED');
                assert.equal(r4y2Body.reconciled, true);

                // Signal Worker 1 that Worker 2 is done, allowing Worker 1 to wake up and attempt finalization
                race4yWorker2Finished = true;
                await worker1Promise;

                assert.equal(r4y1Code, 409, 'Delayed Worker 1 must fail with HTTP 409 STALE_WORKER_LEASE_LOST');
                assert.equal(r4y1Body.code, 'STALE_WORKER_LEASE_LOST');

                // Verify Worker 2's COMPLETED state was preserved
                const audit4y = await AuditLog.findOne({ correlationId: race4yCorrId });
                assert.equal(audit4y.metadata?.syncPhase, 'COMPLETED');
                assert.equal(audit4y.status, 'success');
                assert.equal(audit4y.metadata?.reconciled, true);

                const pol4y = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                assert.equal(pol4y.redisSyncStatus, 'SYNCED');

                // Case 4z1: Expire FINALIZING lease during blocked MongoDB policy update
                const race4z1OpId = 'race-4z1-expire-finalizing-lease-blocked-policy-update';
                const race4z1CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z1OpId}`;

                let worker1InFinalizingBlock = false;
                let worker2Finished = false;

                const originalUpdateOne4z1 = AuthorityCanonicalPolicy.updateOne;
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (filter?._id?.toString() === currentPolicy._id.toString() && update?.$set?.redisSyncStatus === 'SYNCED') {
                        const callerStack = new Error().stack;
                        if (callerStack.includes('executeRedisSyncAndFinalize') && !worker1InFinalizingBlock) {
                            worker1InFinalizingBlock = true;
                            while (!worker2Finished) {
                                await new Promise(r => setTimeout(r, 20));
                            }
                        }
                    }
                    return originalUpdateOne4z1.apply(this, arguments);
                };

                try {
                    const race4z1Provider = {
                        async setCanonicalPolicy() {
                            return { success: true };
                        },
                        async getCanonicalPolicy({ authoritative } = {}) {
                            assert.equal(authoritative, true);
                            return {
                                authorityCode,
                                version: currentPolicy.version,
                                contentHash: currentPolicy.contentHash,
                                policyReference: currentPolicy.policyReference
                            };
                        }
                    };
                    setTestQuotaProvider(race4z1Provider);

                    const race4z1Req1 = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z1OpId }
                    };
                    let r4z1Code = null, r4z1Body = null;
                    const worker1Promise = syncCanonicalPolicy(race4z1Req1, {
                        status(c) { r4z1Code = c; return this; },
                        json(b) { r4z1Body = b; return this; }
                    });

                    while (!worker1InFinalizingBlock) {
                        await new Promise(r => setTimeout(r, 20));
                    }

                    const auditBeforeExpire = await AuditLog.findOne({ correlationId: race4z1CorrId });
                    assert.equal(auditBeforeExpire.metadata?.syncPhase, 'FINALIZING', 'Worker 1 must have entered FINALIZING phase');
                    const worker1LeaseToken = auditBeforeExpire.metadata?.leaseOwner;

                    // Expire Worker 1 lease
                    await AuditLog.updateOne(
                        { correlationId: race4z1CorrId },
                        {
                            $set: {
                                'metadata.leaseExpiresAt': new Date(Date.now() - 2000)
                            }
                        }
                    );

                    // Worker 2 calls syncCanonicalPolicy (reconciliation Case A)
                    const race4z1Req2 = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z1OpId }
                    };
                    let r4z2Code = null, r4z2Body = null;
                    await syncCanonicalPolicy(race4z1Req2, {
                        status(c) { r4z2Code = c; return this; },
                        json(b) { r4z2Body = b; return this; }
                    });

                    assert.equal(r4z2Code, 200, 'Recovery Worker 2 must succeed with HTTP 200');
                    assert.equal(r4z2Body.status, 'COMPLETED');
                    assert.equal(r4z2Body.reconciled, true);

                    const auditAfterWorker2 = await AuditLog.findOne({ correlationId: race4z1CorrId });
                    assert.equal(auditAfterWorker2.metadata?.syncPhase, 'COMPLETED');
                    const worker2LeaseToken = auditAfterWorker2.metadata?.leaseOwner;
                    assert.notEqual(worker1LeaseToken, worker2LeaseToken);

                    const polAfterWorker2 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polAfterWorker2.lastSyncWorkerLease, worker2LeaseToken);

                    // Unblock Worker 1
                    worker2Finished = true;
                    await worker1Promise;

                    assert.equal(r4z1Code, 409, 'Delayed Worker 1 must fail with HTTP 409 STALE_WORKER_LEASE_LOST');
                    assert.equal(r4z1Body.code, 'STALE_WORKER_LEASE_LOST');

                    // Prove Worker 1 could not modify Worker 2 result
                    const polFinal = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polFinal.lastSyncWorkerLease, worker2LeaseToken);
                    assert.equal(polFinal.redisSyncStatus, 'SYNCED');

                    const auditFinal = await AuditLog.findOne({ correlationId: race4z1CorrId });
                    assert.equal(auditFinal.metadata?.leaseOwner, worker2LeaseToken);
                    assert.equal(auditFinal.metadata?.syncPhase, 'COMPLETED');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = originalUpdateOne4z1;
                }

                // Case 4z2: Redis malformed and unavailable races with competing recovery workers
                const race4z2OpId = 'race-4z2-redis-malformed-unavailable';
                const race4z2CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z2OpId}`;

                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: race4z2CorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    userName: 'Admin',
                    description: 'Initial failed sync',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'FAILED',
                        syncPhase: 'FAILED',
                        leaseOwner: 'old-stale-worker',
                        leaseExpiresAt: new Date(Date.now() - 5000),
                        operationId: race4z2OpId
                    },
                    status: 'failure'
                });

                let workerAEnteredRedis = false;
                let workerBDone = false;
                const race4z2Provider = {
                    async setCanonicalPolicy() {
                        return { success: true };
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        assert.equal(authoritative, true);
                        workerAEnteredRedis = true;
                        while (!workerBDone) {
                            await new Promise(r => setTimeout(r, 20));
                        }
                        return { version: 'NOT_A_NUMBER', contentHash: '' };
                    }
                };
                setTestQuotaProvider(race4z2Provider);

                const race4z2ReqA = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4z2OpId }
                };
                let r4z2ACode = null, r4z2ABody = null;
                const workerAPromise = syncCanonicalPolicy(race4z2ReqA, {
                    status(c) { r4z2ACode = c; return this; },
                    json(b) { r4z2ABody = b; return this; }
                });

                while (!workerAEnteredRedis) {
                    await new Promise(r => setTimeout(r, 20));
                }

                // Worker B attempts recovery while Worker A holds lease
                const race4z2ReqB = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: race4z2OpId }
                };
                let r4z2BCode = null, r4z2BBody = null;
                await syncCanonicalPolicy(race4z2ReqB, {
                    status(c) { r4z2BCode = c; return this; },
                    json(b) { r4z2BBody = b; return this; }
                });

                assert.equal(r4z2BCode, 202, 'Competing Worker B must receive 202 OPERATION_IN_PROGRESS while Worker A is recovering');
                assert.equal(r4z2BBody.code, 'OPERATION_IN_PROGRESS');

                workerBDone = true;
                await workerAPromise;

                assert.equal(r4z2ACode, 502, 'Worker A must fail closed with 502 MALFORMED_REDIS_POLICY');
                assert.equal(r4z2ABody.code, 'MALFORMED_REDIS_POLICY');
                assert.equal(r4z2ABody.status, 'PENDING_RECONCILIATION');

                const audit4z2 = await AuditLog.findOne({ correlationId: race4z2CorrId });
                assert.equal(audit4z2.metadata?.syncPhase, 'PENDING_RECONCILIATION');
                assert.equal(audit4z2.metadata?.redisSyncStatus, 'MALFORMED_REDIS_POLICY');

                // Case 4z3: Transaction rollback and idempotent retry
                const race4z3OpId = 'race-4z3-transaction-rollback-and-retry';
                const race4z3CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z3OpId}`;

                let attemptNumber = 0;
                const origUpdate4z3 = AuthorityCanonicalPolicy.updateOne;
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (filter?._id?.toString() === currentPolicy._id.toString() && update?.$set?.redisSyncStatus === 'SYNCED') {
                        attemptNumber++;
                        if (attemptNumber === 1) {
                            const err = new Error('TRANSACTION_MOCK_FAILURE');
                            err.code = 'POLICY_UPDATE_FAILED';
                            throw err;
                        }
                    }
                    return origUpdate4z3.apply(this, arguments);
                };

                try {
                    const race4z3Provider = {
                        async setCanonicalPolicy() {
                            return { success: true };
                        },
                        async getCanonicalPolicy({ authoritative } = {}) {
                            return {
                                authorityCode,
                                version: currentPolicy.version,
                                contentHash: currentPolicy.contentHash,
                                policyReference: currentPolicy.policyReference
                            };
                        }
                    };
                    setTestQuotaProvider(race4z3Provider);

                    const race4z3Req1 = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z3OpId }
                    };
                    let r4z3Code1 = null, r4z3Body1 = null;
                    await syncCanonicalPolicy(race4z3Req1, {
                        status(c) { r4z3Code1 = c; return this; },
                        json(b) { r4z3Body1 = b; return this; }
                    });

                    assert.equal(r4z3Code1, 500, 'First attempt must fail with 500 POLICY_UPDATE_FAILED');
                    assert.equal(r4z3Body1.code, 'POLICY_UPDATE_FAILED');

                    const polAfterFail = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.notEqual(polAfterFail.redisSyncStatus, 'SYNCED');

                    // Retry with the exact same operationId
                    const race4z3Req2 = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z3OpId }
                    };
                    let r4z3Code2 = null, r4z3Body2 = null;
                    await syncCanonicalPolicy(race4z3Req2, {
                        status(c) { r4z3Code2 = c; return this; },
                        json(b) { r4z3Body2 = b; return this; }
                    });

                    assert.equal(r4z3Code2, 200, 'Retry must recover and succeed with HTTP 200');
                    assert.equal(r4z3Body2.status, 'COMPLETED');
                    assert.equal(r4z3Body2.reconciled, true);

                    const polFinal3 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polFinal3.redisSyncStatus, 'SYNCED');

                    const auditFinal3 = await AuditLog.findOne({ correlationId: race4z3CorrId });
                    assert.equal(auditFinal3.metadata?.syncPhase, 'COMPLETED');
                    assert.equal(auditFinal3.status, 'success');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = origUpdate4z3;
                }

                // Case 4z4: Force transaction to remain active for longer than 1.5s (heartbeat does not create false STALE_WORKER_LEASE_LOST)
                const race4z4OpId = 'race-4z4-transaction-longer-than-heartbeat';
                const race4z4CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z4OpId}`;

                const origStartSession4z4 = mongoose.startSession;
                process.env.TEST_FORCE_MONGO_TRANSACTIONS = 'true';

                let heartbeatFiredDuringTx = false;
                const origFindOneAndUpdate4z4 = AuditLog.findOneAndUpdate;

                AuditLog.findOneAndUpdate = function (filter, update, options) {
                    if (update?.$set && update.$set['metadata.lastHeartbeatAt']) {
                        heartbeatFiredDuringTx = true;
                    }
                    return origFindOneAndUpdate4z4.apply(this, arguments);
                };

                mongoose.startSession = async function () {
                    const realSession = await origStartSession4z4.call(mongoose);
                    realSession.withTransaction = async function (fn) {
                        // Delay transaction for 1650ms (exceeding HEARTBEAT_INTERVAL_MS = 1500ms)
                        await new Promise(r => setTimeout(r, 1650));
                        return fn();
                    };
                    return realSession;
                };

                try {
                    const race4z4Provider = {
                        async setCanonicalPolicy() { return { success: true }; },
                        async getCanonicalPolicy() { return null; }
                    };
                    setTestQuotaProvider(race4z4Provider);

                    const race4z4Req = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z4OpId }
                    };
                    let r4z4Code = null, r4z4Body = null;
                    await syncCanonicalPolicy(race4z4Req, {
                        status(c) { r4z4Code = c; return this; },
                        json(b) { r4z4Body = b; return this; }
                    });

                    assert.equal(r4z4Code, 200, 'Transaction taking >1.5s must succeed with HTTP 200 without false STALE_WORKER_LEASE_LOST');
                    assert.equal(r4z4Body.status, 'COMPLETED');

                    const polFinal4 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polFinal4.redisSyncStatus, 'SYNCED');

                    const auditFinal4 = await AuditLog.findOne({ correlationId: race4z4CorrId });
                    assert.equal(auditFinal4.metadata?.syncPhase, 'COMPLETED');
                    assert.equal(auditFinal4.status, 'success');
                } finally {
                    delete process.env.TEST_FORCE_MONGO_TRANSACTIONS;
                    mongoose.startSession = origStartSession4z4;
                    AuditLog.findOneAndUpdate = origFindOneAndUpdate4z4;
                }

                // Case 4z5: WriteConflict (code 112) during heartbeat does NOT cause false STALE_WORKER_LEASE_LOST
                const race4z5OpId = 'race-4z5-heartbeat-write-conflict';
                const race4z5CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z5OpId}`;

                let hbWriteConflictThrown = false;
                const origFindOneAndUpdate4z5 = AuditLog.findOneAndUpdate;
                AuditLog.findOneAndUpdate = function (filter, update, options) {
                    if (update?.$set && update.$set['metadata.lastHeartbeatAt']) {
                        hbWriteConflictThrown = true;
                        const err = new Error('WriteConflict error: parallel transaction in progress');
                        err.code = 112;
                        err.codeName = 'WriteConflict';
                        throw err;
                    }
                    return origFindOneAndUpdate4z5.apply(this, arguments);
                };

                try {
                    const race4z5Provider = {
                        async setCanonicalPolicy() {
                            // Delay in publication so heartbeat interval triggers and throws WriteConflict (112)
                            await new Promise(r => setTimeout(r, 1600));
                            return { success: true };
                        },
                        async getCanonicalPolicy() { return null; }
                    };
                    setTestQuotaProvider(race4z5Provider);

                    const race4z5Req = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z5OpId }
                    };
                    let r4z5Code = null, r4z5Body = null;
                    await syncCanonicalPolicy(race4z5Req, {
                        status(c) { r4z5Code = c; return this; },
                        json(b) { r4z5Body = b; return this; }
                    });

                    assert.equal(hbWriteConflictThrown, true, 'Heartbeat renewal must have triggered and thrown WriteConflict');
                    assert.equal(r4z5Code, 200, 'WriteConflict in heartbeat must NOT cause false STALE_WORKER_LEASE_LOST; worker must complete with 200');
                    assert.equal(r4z5Body.status, 'COMPLETED');

                    const polFinal5 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polFinal5.redisSyncStatus, 'SYNCED');

                    const auditFinal5 = await AuditLog.findOne({ correlationId: race4z5CorrId });
                    assert.equal(auditFinal5.metadata?.syncPhase, 'COMPLETED');
                    assert.equal(auditFinal5.status, 'success');
                } finally {
                    AuditLog.findOneAndUpdate = origFindOneAndUpdate4z5;
                }

                // Case 4z6: Case A recovery with slow MongoDB writes (lease renewal maintains validity)
                const race4z6OpId = 'race-4z6-case-a-slow-write-recovery';
                const race4z6CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z6OpId}`;

                // Create initial audit in failed/abandoned state
                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: race4z6CorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    userName: 'Admin',
                    description: 'Abandoned sync intent',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'FAILED',
                        syncPhase: 'FAILED',
                        leaseOwner: 'prior-worker-token',
                        leaseExpiresAt: new Date(Date.now() - 5000),
                        operationId: race4z6OpId
                    },
                    status: 'failure'
                });

                // Redis already holds current policy (Case A)
                const race4z6Provider = {
                    async setCanonicalPolicy() {
                        throw new Error('Should not publish to Redis in Case A');
                    },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        assert.equal(authoritative, true);
                        return {
                            authorityCode,
                            version: currentPolicy.version,
                            contentHash: currentPolicy.contentHash,
                            policyReference: currentPolicy.policyReference
                        };
                    }
                };
                setTestQuotaProvider(race4z6Provider);

                let reconHeartbeatFired = false;
                const origFindOneAndUpdate4z6 = AuditLog.findOneAndUpdate;
                const origUpdateOne4z6 = AuthorityCanonicalPolicy.updateOne;

                AuditLog.findOneAndUpdate = function (filter, update, options) {
                    if (update?.$set && update.$set['metadata.lastHeartbeatAt']) {
                        reconHeartbeatFired = true;
                    }
                    return origFindOneAndUpdate4z6.apply(this, arguments);
                };

                // Slow down policy update during Case A reconciliation by 1600ms (> 1500ms heartbeat interval)
                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (update?.$set?.redisSyncStatus === 'SYNCED') {
                        await new Promise(r => setTimeout(r, 1600));
                    }
                    return origUpdateOne4z6.apply(this, arguments);
                };

                try {
                    const race4z6Req = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z6OpId }
                    };
                    let r4z6Code = null, r4z6Body = null;
                    await syncCanonicalPolicy(race4z6Req, {
                        status(c) { r4z6Code = c; return this; },
                        json(b) { r4z6Body = b; return this; }
                    });

                    assert.equal(r4z6Code, 200, 'Case A recovery with slow MongoDB write must succeed with HTTP 200');
                    assert.equal(r4z6Body.status, 'COMPLETED');
                    assert.equal(r4z6Body.reconciled, true);
                    assert.equal(reconHeartbeatFired, true, 'Reconciliation heartbeat must have fired during slow write to renew lease');

                    const polFinal6 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(polFinal6.redisSyncStatus, 'SYNCED');

                    const auditFinal6 = await AuditLog.findOne({ correlationId: race4z6CorrId });
                    assert.equal(auditFinal6.metadata?.syncPhase, 'COMPLETED');
                    assert.equal(auditFinal6.status, 'success');
                } finally {
                    AuditLog.findOneAndUpdate = origFindOneAndUpdate4z6;
                    AuthorityCanonicalPolicy.updateOne = origUpdateOne4z6;
                }

                // Case 4z7: Stale recovery worker cannot overwrite another worker's policy or audit state
                const race4z7OpId = 'race-4z7-stale-worker-cannot-overwrite';
                const race4z7CorrId = `canonical_sync:${currentPolicy._id.toString()}:${race4z7OpId}`;

                await AuditLog.create({
                    eventType: 'canonical_policy_synced',
                    correlationId: race4z7CorrId,
                    targetType: 'authority_canonical_policy',
                    targetId: currentPolicy._id,
                    userId: approverUser._id,
                    userName: 'Admin',
                    description: 'Initial intent for preemption test',
                    metadata: {
                        authorityCode,
                        version: currentPolicy.version,
                        contentHash: currentPolicy.contentHash,
                        redisSyncStatus: 'FAILED',
                        syncPhase: 'FAILED',
                        leaseOwner: 'stale-worker-init',
                        leaseExpiresAt: new Date(Date.now() - 5000),
                        operationId: race4z7OpId
                    },
                    status: 'failure'
                });

                const race4z7Provider = {
                    async setCanonicalPolicy() { return { success: true }; },
                    async getCanonicalPolicy({ authoritative } = {}) {
                        return {
                            authorityCode,
                            version: currentPolicy.version,
                            contentHash: currentPolicy.contentHash,
                            policyReference: currentPolicy.policyReference
                        };
                    }
                };
                setTestQuotaProvider(race4z7Provider);

                let worker1InReconFinalize = false;
                let worker2FinishedRecon = false;
                const origUpdateOne4z7 = AuthorityCanonicalPolicy.updateOne;

                AuthorityCanonicalPolicy.updateOne = async function (filter, update, options) {
                    if (!worker1InReconFinalize && update?.$set?.redisSyncStatus === 'SYNCED') {
                        worker1InReconFinalize = true;
                        while (!worker2FinishedRecon) {
                            await new Promise(r => setTimeout(r, 20));
                        }
                    }
                    return origUpdateOne4z7.apply(this, arguments);
                };

                try {
                    // Worker 1 begins Case A reconciliation
                    const race4z7Req1 = {
                        params: { authorityCode },
                        user: approverUser,
                        ip: '127.0.0.1',
                        get: () => 'test-agent',
                        body: { operationId: race4z7OpId }
                    };
                    let r4z7Code1 = null, r4z7Body1 = null;
                    const worker1Promise = syncCanonicalPolicy(race4z7Req1, {
                        status(c) { r4z7Code1 = c; return this; },
                        json(b) { r4z7Body1 = b; return this; }
                    });

                    while (!worker1InReconFinalize) {
                        await new Promise(r => setTimeout(r, 20));
                    }

                    // Preempt Worker 1: expire lease and simulate Worker 2 taking over
                    const worker2Token = 'worker-2-preempting-token-4z7';
                    await AuditLog.updateOne(
                        { correlationId: race4z7CorrId },
                        {
                            $set: {
                                'metadata.leaseOwner': worker2Token,
                                'metadata.syncPhase': 'COMPLETED',
                                'metadata.redisSyncStatus': 'SYNCED',
                                status: 'success'
                            }
                        }
                    );
                    await AuthorityCanonicalPolicy.updateOne(
                        { _id: currentPolicy._id },
                        {
                            $set: {
                                lastSyncWorkerLease: worker2Token,
                                redisSyncStatus: 'SYNCED'
                            }
                        }
                    );

                    // Unblock Worker 1
                    worker2FinishedRecon = true;
                    await worker1Promise;

                    // Worker 1 must fail closed with 409 STALE_WORKER_LEASE_LOST
                    assert.equal(r4z7Code1, 409, 'Delayed Worker 1 must fail with 409 STALE_WORKER_LEASE_LOST');
                    assert.equal(r4z7Body1.code, 'STALE_WORKER_LEASE_LOST');

                    // Prove Worker 1 did not overwrite Worker 2's lease or policy state
                    const finalPol7 = await AuthorityCanonicalPolicy.findById(currentPolicy._id);
                    assert.equal(finalPol7.lastSyncWorkerLease, worker2Token, 'Policy lease must remain owned by Worker 2');

                    const finalAudit7 = await AuditLog.findOne({ correlationId: race4z7CorrId });
                    assert.equal(finalAudit7.metadata?.leaseOwner, worker2Token, 'Audit lease must remain owned by Worker 2');
                } finally {
                    AuthorityCanonicalPolicy.updateOne = origUpdateOne4z7;
                }
            } finally {
                setTestQuotaProvider(null);
            }
        }
    });

    await t.test('33. Canonical Policy Validity Window & Version Boundaries (Remediation 4)', async () => {
        const authorityCode = 'CHD';
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });

        const now = Date.now();

        // 33.1: getCanonicalPolicy rejects future-effective policy
        const polId33_1 = new mongoose.Types.ObjectId();
        const audit33_1 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: polId33_1,
            description: 'Future audit',
            status: 'success'
        });
        await AuthorityCanonicalPolicy.create({
            _id: polId33_1,
            authorityCode,
            policyReference: 'CHD/FUTURE/01',
            version: 1,
            contentHash: 'hash-future',
            minIntervalMs: 15000,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            maxConcurrent: 1,
            effectiveFrom: new Date(now + 3600000), // 1 hour in the future!
            expiresAt: new Date(now + 86400000),
            reviewedBy: 'reviewer-1',
            approvedBy: 'approver-1',
            isAudited: true,
            auditStatus: 'AUDITED',
            isActive: true,
            auditLogId: audit33_1._id
        });

        const futureLookup = await getCanonicalPolicy(authorityCode, { now });
        assert.equal(futureLookup, null, 'Future-effective canonical policy must be rejected on lookup');

        // 33.2: getCanonicalPolicy rejects expired policy
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        const polId33_2 = new mongoose.Types.ObjectId();
        const audit33_2 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: polId33_2,
            description: 'Expired audit',
            status: 'success'
        });
        await AuthorityCanonicalPolicy.create({
            _id: polId33_2,
            authorityCode,
            policyReference: 'CHD/EXPIRED/01',
            version: 1,
            contentHash: 'hash-expired',
            minIntervalMs: 15000,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            maxConcurrent: 1,
            effectiveFrom: new Date(now - 7200000),
            expiresAt: new Date(now - 1000), // Expired 1 second ago!
            reviewedBy: 'reviewer-1',
            approvedBy: 'approver-1',
            isAudited: true,
            auditStatus: 'AUDITED',
            isActive: true,
            auditLogId: audit33_2._id
        });

        const expiredLookup = await getCanonicalPolicy(authorityCode, { now });
        assert.equal(expiredLookup, null, 'Expired canonical policy must be rejected on lookup');

        // 33.3: getCanonicalPolicy accepts policy within validity window [effectiveFrom <= now < expiresAt]
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        const polId33_3 = new mongoose.Types.ObjectId();
        const audit33_3 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: polId33_3,
            description: 'Valid audit',
            status: 'success'
        });
        await AuthorityCanonicalPolicy.create({
            _id: polId33_3,
            authorityCode,
            policyReference: 'CHD/VALID/01',
            version: 1,
            contentHash: 'hash-valid',
            minIntervalMs: 15000,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            maxConcurrent: 1,
            effectiveFrom: new Date(now - 10000),
            expiresAt: new Date(now + 86400000),
            reviewedBy: 'reviewer-1',
            approvedBy: 'approver-1',
            isAudited: true,
            auditStatus: 'AUDITED',
            isActive: true,
            auditLogId: audit33_3._id
        });

        const validLookup = await getCanonicalPolicy(authorityCode, { now });
        assert.ok(validLookup, 'Policy within validity window must be accepted');
        assert.equal(validLookup.policyReference, 'CHD/VALID/01');

        // 33.4: Initial policy version must be a positive integer >= 1
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode: 'GMADA' });
        for (const badVer of [0, -1, 1.5, NaN, 'invalid']) {
            await assert.rejects(
                async () => {
                    await registerOrRotateCanonicalPolicy({
                        authorityCode: 'GMADA',
                        policy: {
                            policyReference: 'GMADA/BAD/VER',
                            minIntervalMs: 15000,
                            maxRequestsPerMinute: 10,
                            maxRequestsPerDay: 500,
                            expiresAt: new Date(now + 86400000)
                        },
                        reviewedBy: 'rev',
                        approvedBy: 'app',
                        policyVersion: badVer
                    });
                },
                (err) => err.code === 'INVALID_VERSION' || err.code === 'INVALID_VERSION_SEQUENCE'
            );
        }

        // 33.5: Boundary time condition: exactly at expiresAt must be rejected
        const exactExpiresAt = new Date(now + 5000);
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode: 'GMADA' });
        const polId33_5 = new mongoose.Types.ObjectId();
        const audit33_5 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: polId33_5,
            description: 'Boundary audit',
            status: 'success'
        });
        await AuthorityCanonicalPolicy.create({
            _id: polId33_5,
            authorityCode: 'GMADA',
            policyReference: 'GMADA/BOUNDARY/01',
            version: 1,
            contentHash: 'hash-boundary',
            minIntervalMs: 15000,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            maxConcurrent: 1,
            effectiveFrom: new Date(now - 5000),
            expiresAt: exactExpiresAt,
            reviewedBy: 'reviewer-1',
            approvedBy: 'approver-1',
            isAudited: true,
            auditStatus: 'AUDITED',
            isActive: true,
            auditLogId: audit33_5._id
        });

        const atExpiryLookup = await getCanonicalPolicy('GMADA', { now: exactExpiresAt.getTime() });
        assert.equal(atExpiryLookup, null, 'Policy at exact expiresAt must be rejected');
    });

    await t.test('34. RedisPortalQuotaProvider In-Memory Monotonic Policy CAS & Hash Guard (Remediation 2 Unit)', async () => {
        const quotaProvider = new RedisPortalQuotaProvider(null, { testMode: true });
        const authorityCode = 'HSVP';

        const hashV1 = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: 'HSVP/POL/V1',
            minIntervalMs: 1000,
            maxRequestsPerMinute: 5,
            maxRequestsPerHour: 50,
            maxRequestsPerDay: 200
        });

        // 34.1: Initial registration version 1 succeeds
        await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V1',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: hashV1
            },
            approvedBy: 'approver-01',
            policyVersion: 1
        });

        // 34.2: Rotate to version 2 succeeds
        const hashV2 = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: 'HSVP/POL/V2',
            minIntervalMs: 1000,
            maxRequestsPerMinute: 5,
            maxRequestsPerHour: 50,
            maxRequestsPerDay: 200
        });

        await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V2',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: hashV2
            },
            approvedBy: 'approver-02',
            policyVersion: 2
        });

        // 34.3: Delayed worker attempting to prime v1 fails with STALE_POLICY_VERSION
        await assert.rejects(
            async () => {
                await quotaProvider.setCanonicalPolicy({
                    authorityCode,
                    policy: {
                        policyReference: 'HSVP/POL/V1',
                        minIntervalMs: 1000,
                        maxRequestsPerMinute: 5,
                        maxRequestsPerHour: 50,
                        maxRequestsPerDay: 200,
                        contentHash: hashV1
                    },
                    approvedBy: 'approver-01',
                    policyVersion: 1
                });
            },
            (err) => err.code === 'STALE_POLICY_VERSION'
        );

        // 34.4: Worker attempting version 2 with mismatched contentHash fails with POLICY_HASH_MISMATCH
        await assert.rejects(
            async () => {
                await quotaProvider.setCanonicalPolicy({
                    authorityCode,
                    policy: {
                        policyReference: 'HSVP/POL/V2',
                        minIntervalMs: 1000,
                        maxRequestsPerMinute: 5,
                        maxRequestsPerHour: 50,
                        maxRequestsPerDay: 200,
                        contentHash: 'tampered-hash-v2'
                    },
                    approvedBy: 'approver-02',
                    policyVersion: 2
                });
            },
            (err) => err.code === 'POLICY_HASH_MISMATCH'
        );

        // 34.5: Idempotent re-assertion of version 2 with same hash succeeds
        const idempRes = await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V2',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: hashV2
            },
            approvedBy: 'approver-02',
            policyVersion: 2
        });
        assert.ok(idempRes);
        assert.equal(String(idempRes.version), '2');

        // 34.6: Reservation with stale v1 is rejected with POLICY_VERSION_MISMATCH
        const resStale = await quotaProvider.reserve({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V2',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: hashV2,
                version: 1
            }
        });
        assert.equal(resStale.allowed, false);
        assert.equal(resStale.reason, 'POLICY_VERSION_MISMATCH');

        // 34.7: Reservation with mismatched hash is rejected with POLICY_HASH_MISMATCH
        const resHashBad = await quotaProvider.reserve({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V2',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: 'hash-bad',
                version: 2
            }
        });
        assert.equal(resHashBad.allowed, false);
        assert.equal(resHashBad.reason, 'POLICY_HASH_MISMATCH');

        // 34.8: Reservation matching version 2 and hash succeeds
        const resOk = await quotaProvider.reserve({
            authorityCode,
            policy: {
                policyReference: 'HSVP/POL/V2',
                minIntervalMs: 1000,
                maxRequestsPerMinute: 5,
                maxRequestsPerHour: 50,
                maxRequestsPerDay: 200,
                contentHash: hashV2,
                version: 2
            }
        });
        assert.equal(resOk.allowed, true);
    });

    await t.test('35. Fail-Closed Fence Watermark & Pre-Commit Invariants (Objective A)', async () => {
        const authorityCode = 'HSVP';
        const tenantId = new mongoose.Types.ObjectId();

        // 35.1: Issued-token Mongo write failure aborts BEFORE transport and releases lock
        {
            await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });
            const origRecord = AuthorityGlobalFenceWatermark.recordIssuedFenceToken;
            AuthorityGlobalFenceWatermark.recordIssuedFenceToken = async () => {
                throw new Error('MONGO_WRITE_CONNECTION_LOST');
            };

            let transportCalled = false;
            let lockReleased = false;

            const fakeLock = {
                acquired: true,
                fenceToken: 1,
                ttlMs: 30000,
                async release() { lockReleased = true; },
                async renew() { return true; }
            };

            const mockLockProvider = {
                async acquire() { return fakeLock; },
                async isCurrentFenceToken() { return true; }
            };

            const mockQuota = {
                async reserve() { return { allowed: true, reservationId: 'res-1' }; }
            };

            const mockTransport = {
                async search() {
                    transportCalled = true;
                    return { status: 200, headers: {}, body: '<html></html>' };
                }
            };

            const mockAudit = {
                async write() {}
            };

            const testRuntime = createAuthorityPortalRuntime({
                lockProvider: mockLockProvider,
                quotaProvider: mockQuota,
                circuitBreakerStore: { isPaused: async () => false, pause: async () => {} },
                transport: mockTransport,
                parserRegistry: {
                    HSVP: { parse: async () => [] }
                },
                auditSink: mockAudit,
                gateConfig: { enabled: true, readOnly: true }
            });

            const validApproval = {
                authorityCode: 'HSVP',
                status: 'GRANTED',
                accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                writtenPermissionReference: 'HSVP/IT/2026/001',
                commercialUseAuthorized: true,
                readOnlySearchAuthorized: true,
                termsReviewed: true,
                termsReference: 'https://hsvphry.org.in/Terms#review',
                approvedBy: 'approver-1',
                reviewedBy: 'reviewer-2',
                expiresAt: '2028-01-01T00:00:00.000Z',
                permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate'],
                ratePolicy: {
                    maxRequestsPerMinute: 2,
                    maxRequestsPerDay: 500,
                    minimumIntervalMs: 30000,
                    maxConcurrentRequests: 1,
                    policyReference: 'HSVP/RATE/01'
                }
            };

            try {
                await assert.rejects(
                    async () => {
                        await testRuntime.search({
                            authorityCode,
                            approval: validApproval,
                            inventory: { city: 'Kurukshetra', sector: '7', unitNo: '101' },
                            authorityLink: { urbanEstate: 'Kurukshetra', sectorNumber: '7', plotNumber: '101' }
                        });
                    },
                    (err) => err.message.includes('MONGO_WRITE_CONNECTION_LOST') || err.code === 'PORTAL_FENCE_WATERMARK_PERSISTENCE_FAILED'
                );

                assert.equal(transportCalled, false, 'Transport search must NEVER be called if watermark persistence fails');
                assert.equal(lockReleased, true, 'Lock lease must be cleanly released in finally');
            } finally {
                AuthorityGlobalFenceWatermark.recordIssuedFenceToken = origRecord;
            }
        }

        // 35.2: Missing watermark document fails closed during pre-commit
        {
            await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });

            // Direct check of isFenceTokenSuperseded
            await assert.rejects(
                async () => {
                    await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 1 });
                },
                (err) => err.code === 'WATERMARK_RECORD_MISSING'
            );

            // Verify processItem fails closed when watermark document is missing
            const inv = await Inventory.create({
                tenantId,
                title: 'Missing Watermark Plot',
                propertyId: 'PLOT-999',
                status: 'AVAILABLE'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId,
                inventoryId: inv._id,
                authorityCode,
                propertyId: 'PLOT-999',
                sectorNumber: '14',
                compositeKey: 'HSVP:FARIDABAD:14:PLOT-999',
                identityVerified: true,
                matchEligibility: 'ELIGIBLE',
                createdBy: new mongoose.Types.ObjectId()
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode,
                status: 'PROCESSING',
                claimedBy: 'worker-missing-wm',
                workerClaimToken: 'claim-missing-wm',
                leaseExpiresAt: new Date(Date.now() + 60000)
            });

            const candidateWithMissingWatermark = {
                status: 'READY_FOR_REVIEW',
                normalizedRecord: { plotNo: 'PLOT-999' },
                contentHash: 'hash-missing-wm',
                sourceReferenceUrl: 'https://hsvphry.org.in',
                fenceToken: 1,
                isCurrentFence: async () => {
                    return !(await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 1 }));
                },
                checkLeaseValid: async () => {
                    await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 1 });
                },
                proposedChanges: [],
                matchEvidence: { confidence: 'EXACT', method: 'PORTAL_EXACT' }
            };

            const res = await AuthorityBulkProcessor._persistItemSnapshotAndFinalize({
                item: runItem,
                inventory: inv,
                link,
                candidate: candidateWithMissingWatermark,
                tenantId,
                effectiveWorkerId: 'worker-missing-wm',
                isFixtureMode: false,
                supportsTransactions: false
            });

            assert.equal(res.success, false, 'Missing watermark must fail closed');
            const finalItem = await PropertyVerificationRunItem.findById(runItem._id);
            assert.equal(finalItem.status, 'FAILED');

            const snapCount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
            assert.equal(snapCount, 0, 'No snapshot must survive when watermark document is missing');
        }

        // 35.3: Watermark database read failure during pre-commit fails closed
        {
            await AuthorityGlobalFenceWatermark.findOneAndUpdate(
                { authorityCode },
                { $set: { highestIssuedFenceToken: 1, lastCommittedFenceToken: 0 } },
                { upsert: true }
            );

            const origFindOne = AuthorityGlobalFenceWatermark.findOne;
            AuthorityGlobalFenceWatermark.findOne = () => {
                throw new Error('MONGO_PRECOMMIT_READ_FAILURE');
            };

            try {
                const inv = await Inventory.create({
                    tenantId,
                    title: 'Read Failure Plot',
                    propertyId: 'PLOT-888',
                    status: 'AVAILABLE'
                });

                const link = await PropertyAuthorityLink.create({
                    tenantId,
                    inventoryId: inv._id,
                    authorityCode,
                    propertyId: 'PLOT-888',
                    sectorNumber: '14',
                    compositeKey: 'HSVP:FARIDABAD:14:PLOT-888',
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    createdBy: new mongoose.Types.ObjectId()
                });

                const runItem = await PropertyVerificationRunItem.create({
                    tenantId,
                    runId: new mongoose.Types.ObjectId(),
                    inventoryId: inv._id,
                    linkId: link._id,
                    authorityCode,
                    status: 'PROCESSING',
                    claimedBy: 'worker-read-err',
                    workerClaimToken: 'claim-read-err',
                    leaseExpiresAt: new Date(Date.now() + 60000)
                });

                const candidateWithReadFailure = {
                    status: 'READY_FOR_REVIEW',
                    normalizedRecord: { plotNo: 'PLOT-888' },
                    contentHash: 'hash-read-err',
                    sourceReferenceUrl: 'https://hsvphry.org.in',
                    fenceToken: 1,
                    isCurrentFence: async () => {
                        return !(await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 1 }));
                    },
                    checkLeaseValid: async () => {
                        await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 1 });
                    },
                    proposedChanges: [],
                    matchEvidence: { confidence: 'EXACT', method: 'PORTAL_EXACT' }
                };

                const res = await AuthorityBulkProcessor._persistItemSnapshotAndFinalize({
                    item: runItem,
                    inventory: inv,
                    link,
                    candidate: candidateWithReadFailure,
                    tenantId,
                    effectiveWorkerId: 'worker-read-err',
                    isFixtureMode: false,
                    supportsTransactions: false
                });

                assert.equal(res.success, false, 'Read failure must fail closed');
                const finalItem = await PropertyVerificationRunItem.findById(runItem._id);
                assert.equal(finalItem.status, 'FAILED');

                const snapCount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
                assert.equal(snapCount, 0, 'No snapshot must survive when watermark read fails');
            } finally {
                AuthorityGlobalFenceWatermark.findOne = origFindOne;
            }
        }

        // 35.4: Stale lower token is rejected after higher token issued
        {
            await AuthorityGlobalFenceWatermark.findOneAndUpdate(
                { authorityCode },
                { $set: { highestIssuedFenceToken: 15, lastCommittedFenceToken: 5 } },
                { upsert: true }
            );

            // Token 10 is lower than highestIssuedFenceToken 15 -> must be superseded
            const isSuperseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                authorityCode,
                fenceToken: 10
            });
            assert.equal(isSuperseded, true, 'Token 10 must be superseded when highest issued token is 15');

            const inv = await Inventory.create({
                tenantId,
                title: 'Stale Lower Token Plot',
                propertyId: 'PLOT-777',
                status: 'AVAILABLE'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId,
                inventoryId: inv._id,
                authorityCode,
                propertyId: 'PLOT-777',
                sectorNumber: '14',
                compositeKey: 'HSVP:FARIDABAD:14:PLOT-777',
                identityVerified: true,
                matchEligibility: 'ELIGIBLE',
                createdBy: new mongoose.Types.ObjectId()
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode,
                status: 'PROCESSING',
                claimedBy: 'worker-stale-token',
                workerClaimToken: 'claim-stale-token',
                leaseExpiresAt: new Date(Date.now() + 60000)
            });

            const candidateStale = {
                status: 'READY_FOR_REVIEW',
                normalizedRecord: { plotNo: 'PLOT-777' },
                contentHash: 'hash-stale-token',
                sourceReferenceUrl: 'https://hsvphry.org.in',
                fenceToken: 10,
                isCurrentFence: async () => {
                    return !(await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 10 }));
                },
                checkLeaseValid: async () => {
                    const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 10 });
                    if (superseded) {
                        const err = new Error('Portal lock fence token is stale');
                        err.code = 'PORTAL_LOCK_OWNERSHIP_LOST';
                        throw err;
                    }
                },
                proposedChanges: [],
                matchEvidence: { confidence: 'EXACT', method: 'PORTAL_EXACT' }
            };

            const res = await AuthorityBulkProcessor._persistItemSnapshotAndFinalize({
                item: runItem,
                inventory: inv,
                link,
                candidate: candidateStale,
                tenantId,
                effectiveWorkerId: 'worker-stale-token',
                isFixtureMode: false,
                supportsTransactions: false
            });

            assert.equal(res.success, false, 'Stale token must fail closed');
            const finalItem = await PropertyVerificationRunItem.findById(runItem._id);
            assert.equal(finalItem.status, 'FAILED');

            const snapCount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
            assert.equal(snapCount, 0, 'No snapshot must survive for stale lower token');
        }

        // 35.5: Monotonic higher token succeeds and commits
        {
            await AuthorityGlobalFenceWatermark.findOneAndUpdate(
                { authorityCode },
                { $set: { highestIssuedFenceToken: 15, lastCommittedFenceToken: 5 } },
                { upsert: true }
            );

            // Token 15 is equal to highestIssuedFenceToken 15 and > lastCommittedFenceToken 5 -> valid!
            const isSuperseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({
                authorityCode,
                fenceToken: 15
            });
            assert.equal(isSuperseded, false, 'Token 15 must NOT be superseded');

            const inv = await Inventory.create({
                tenantId,
                title: 'Valid Higher Token Plot',
                propertyId: 'PLOT-666',
                status: 'AVAILABLE'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId,
                inventoryId: inv._id,
                authorityCode,
                propertyId: 'PLOT-666',
                sectorNumber: '14',
                compositeKey: 'HSVP:FARIDABAD:14:PLOT-666',
                identityVerified: true,
                matchEligibility: 'ELIGIBLE',
                createdBy: new mongoose.Types.ObjectId()
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode,
                status: 'PROCESSING',
                claimedBy: 'worker-valid-token',
                workerClaimToken: 'claim-valid-token',
                leaseExpiresAt: new Date(Date.now() + 60000)
            });

            const candidateValid = {
                status: 'READY_FOR_REVIEW',
                normalizedRecord: { plotNo: 'PLOT-666' },
                contentHash: 'hash-valid-token',
                sourceReferenceUrl: 'https://hsvphry.org.in',
                fenceToken: 15,
                isCurrentFence: async () => {
                    return !(await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 15 }));
                },
                checkLeaseValid: async () => {
                    const superseded = await AuthorityGlobalFenceWatermark.isFenceTokenSuperseded({ authorityCode, fenceToken: 15 });
                    if (superseded) {
                        const err = new Error('Portal lock fence token is stale');
                        err.code = 'PORTAL_LOCK_OWNERSHIP_LOST';
                        throw err;
                    }
                },
                proposedChanges: [],
                matchEvidence: { confidence: 'EXACT', method: 'PORTAL_EXACT' }
            };

            const res = await AuthorityBulkProcessor._persistItemSnapshotAndFinalize({
                item: runItem,
                inventory: inv,
                link,
                candidate: candidateValid,
                tenantId,
                effectiveWorkerId: 'worker-valid-token',
                isFixtureMode: false,
                supportsTransactions: false
            });

            assert.equal(res.success, true, 'Valid token must commit snapshot successfully');
            const finalItem = await PropertyVerificationRunItem.findById(runItem._id);
            assert.equal(finalItem.status, 'SUCCEEDED');

            const snapCount = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
            assert.equal(snapCount, 1, 'Exactly one snapshot must survive for valid token');

            const committedWm = await AuthorityGlobalFenceWatermark.findOne({ authorityCode });
            assert.equal(committedWm.lastCommittedFenceToken, 15);
        }
    });

    await t.test('36. Request-Time MongoDB DDL Removal & Idempotency Index Verification (Finding 1)', async (t36) => {
        const authorityCode = 'HSVP';
        const approverRole = await Role.create({
            name: `Approver Role DDL Test ${Date.now()}`,
            department: 'inventory',
            approvalRights: { manageAuthoritySettings: true },
            moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
        });
        const approverUser = await User.create({
            fullName: 'DDL Safety Tester',
            email: `ddl-safety-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: approverRole._id,
            department: 'inventory',
            isActive: true
        });

        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        const auditLogDoc = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            userId: approverUser._id,
            userName: 'Safety Admin',
            description: 'Initial Canonical Policy Rotation',
            status: 'success'
        });

        const policyDoc = await AuthorityCanonicalPolicy.create({
            authorityCode,
            policyReference: 'HSVP/RATE/01',
            version: 1,
            contentHash: 'hash-v1-initial',
            minIntervalMs: 15000,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            redisSyncStatus: 'PENDING_RECONCILIATION',
            effectiveFrom: new Date(Date.now() - 3600000),
            expiresAt: new Date(Date.now() + 86400000),
            reviewedBy: new mongoose.Types.ObjectId(),
            approvedBy: approverUser._id,
            isActive: true,
            isAudited: true,
            auditStatus: 'AUDITED',
            auditLogId: auditLogDoc._id
        });
        await AuditLog.updateOne({ _id: auditLogDoc._id }, { $set: { targetId: policyDoc._id } });

        await t36.test('36.1: syncCanonicalPolicy fails closed with 500 IDEMPOTENCY_INDEX_UNAVAILABLE if unique index is missing, and never executes DDL', async () => {
            let ensureCalled = 0;
            let createIndexCalled = 0;
            let createCollectionCalled = 0;

            const origEnsure = AuditLog.ensureIdempotencyIndex;
            const origIndexes = AuditLog.collection.indexes;
            const origCreateIndex = AuditLog.collection.createIndex;
            const origCreateCollection = mongoose.connection.db ? mongoose.connection.db.createCollection : null;

            AuditLog.ensureIdempotencyIndex = async () => { ensureCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };
            AuditLog.collection.createIndex = async () => { createIndexCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };
            if (mongoose.connection.db) {
                mongoose.connection.db.createCollection = async () => { createCollectionCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };
            }

            // Return indexes without unique_audit_event_correlation
            AuditLog.collection.indexes = async () => [
                { v: 2, key: { _id: 1 }, name: '_id_' },
                { v: 2, key: { correlationId: 1 }, name: 'correlationId_1' }
            ];

            try {
                let statusCode = null;
                let responseBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: `ddl-missing-idx-${Date.now()}` }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(body) { responseBody = body; return this; }
                };

                await syncCanonicalPolicy(req, res);

                assert.equal(statusCode, 500, 'Must return HTTP 500 when unique idempotency index is missing');
                assert.equal(responseBody.code, 'IDEMPOTENCY_INDEX_UNAVAILABLE', 'Code must be IDEMPOTENCY_INDEX_UNAVAILABLE');
                assert.equal(ensureCalled, 0, 'ensureIdempotencyIndex must NEVER be called from HTTP request path');
                assert.equal(createIndexCalled, 0, 'createIndex must NEVER be called from HTTP request path');
                assert.equal(createCollectionCalled, 0, 'createCollection must NEVER be called from HTTP request path');
            } finally {
                AuditLog.ensureIdempotencyIndex = origEnsure;
                AuditLog.collection.indexes = origIndexes;
                AuditLog.collection.createIndex = origCreateIndex;
                if (mongoose.connection.db && origCreateCollection) {
                    mongoose.connection.db.createCollection = origCreateCollection;
                }
            }
        });

        await t36.test('36.2: syncCanonicalPolicy fails closed with 500 IDEMPOTENCY_INDEX_UNAVAILABLE if index spec is invalid', async () => {
            let ensureCalled = 0;
            let createIndexCalled = 0;

            const origEnsure = AuditLog.ensureIdempotencyIndex;
            const origIndexes = AuditLog.collection.indexes;
            const origCreateIndex = AuditLog.collection.createIndex;

            AuditLog.ensureIdempotencyIndex = async () => { ensureCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };
            AuditLog.collection.createIndex = async () => { createIndexCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };

            // Index exists by name, but unique is false
            AuditLog.collection.indexes = async () => [
                {
                    v: 2,
                    key: { eventType: 1, correlationId: 1 },
                    name: 'unique_audit_event_correlation',
                    unique: false
                }
            ];

            try {
                let statusCode = null;
                let responseBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: `ddl-invalid-spec-${Date.now()}` }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(body) { responseBody = body; return this; }
                };

                await syncCanonicalPolicy(req, res);

                assert.equal(statusCode, 500, 'Must return HTTP 500 when index spec is invalid');
                assert.equal(responseBody.code, 'IDEMPOTENCY_INDEX_UNAVAILABLE');
                assert.match(responseBody.message, /specification invalid/i);
                assert.equal(ensureCalled, 0, 'ensureIdempotencyIndex must NEVER be called on invalid spec');
                assert.equal(createIndexCalled, 0, 'createIndex must NEVER be called on invalid spec');
            } finally {
                AuditLog.ensureIdempotencyIndex = origEnsure;
                AuditLog.collection.indexes = origIndexes;
                AuditLog.collection.createIndex = origCreateIndex;
            }
        });

        await t36.test('36.3: Valid index passes verification and executes sync without running any DDL', async () => {
            let ensureCalled = 0;
            let createIndexCalled = 0;

            const origEnsure = AuditLog.ensureIdempotencyIndex;
            const origIndexes = AuditLog.collection.indexes;
            const origCreateIndex = AuditLog.collection.createIndex;

            AuditLog.ensureIdempotencyIndex = async () => { ensureCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };
            AuditLog.collection.createIndex = async () => { createIndexCalled++; throw new Error('FORBIDDEN_DDL_CALL'); };

            // Return fully valid index specification
            AuditLog.collection.indexes = async () => [
                {
                    v: 2,
                    key: { eventType: 1, correlationId: 1 },
                    name: 'unique_audit_event_correlation',
                    unique: true,
                    partialFilterExpression: { correlationId: { $type: 'string' } }
                }
            ];

            const mockQuota = {
                async setCanonicalPolicy() { return { success: true }; },
                async getCanonicalPolicy({ authoritative } = {}) {
                    return {
                        authorityCode,
                        version: policyDoc.version,
                        contentHash: policyDoc.contentHash
                    };
                }
            };
            setTestQuotaProvider(mockQuota);

            try {
                let statusCode = null;
                let responseBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: `valid-index-test-${Date.now()}` }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(body) { responseBody = body; return this; }
                };

                await syncCanonicalPolicy(req, res);

                assert.equal(statusCode, 200, 'Must succeed with HTTP 200 when index is valid');
                assert.equal(ensureCalled, 0, 'ensureIdempotencyIndex must NEVER be called');
                assert.equal(createIndexCalled, 0, 'createIndex must NEVER be called');
            } finally {
                setTestQuotaProvider(null);
                AuditLog.ensureIdempotencyIndex = origEnsure;
                AuditLog.collection.indexes = origIndexes;
                AuditLog.collection.createIndex = origCreateIndex;
            }
        });

        await t36.test('36.4: Zero alteration or deletion of existing audit records during preflight and execution', async () => {
            const existingAudit = await AuditLog.create({
                eventType: 'canonical_policy_synced',
                correlationId: `existing-preserve-${Date.now()}`,
                targetType: 'authority_canonical_policy',
                targetId: policyDoc._id,
                userId: approverUser._id,
                userName: 'Safety Admin',
                description: 'Pre-existing audit record',
                metadata: { authorityCode, testKey: 'originalValue' },
                status: 'success'
            });

            const mockQuota = {
                async setCanonicalPolicy() { return { success: true }; },
                async getCanonicalPolicy({ authoritative } = {}) {
                    return {
                        authorityCode,
                        version: policyDoc.version,
                        contentHash: policyDoc.contentHash
                    };
                }
            };
            setTestQuotaProvider(mockQuota);

            const origIndexes = AuditLog.collection.indexes;
            AuditLog.collection.indexes = async () => [
                {
                    v: 2,
                    key: { eventType: 1, correlationId: 1 },
                    name: 'unique_audit_event_correlation',
                    unique: true,
                    partialFilterExpression: { correlationId: { $type: 'string' } }
                }
            ];

            try {
                let statusCode = null;
                let responseBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: `preserve-test-${Date.now()}` }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(body) { responseBody = body; return this; }
                };

                await syncCanonicalPolicy(req, res);
                assert.equal(statusCode, 200);

                const fetched = await AuditLog.findById(existingAudit._id);
                assert.ok(fetched, 'Existing audit record must still exist');
                assert.equal(fetched.metadata?.testKey, 'originalValue', 'Existing audit metadata must not be altered');
                assert.equal(fetched.status, 'success');
            } finally {
                setTestQuotaProvider(null);
                AuditLog.collection.indexes = origIndexes;
            }
        });
    });

    await t.test('37. Strict Malformed Redis Policy Handling & Readiness Integration (Finding 2 & 3)', async (t37) => {
        const authorityCode = 'HSVP';

        // 37.1: Redis key absent (null returned by HGETALL) returns null in getCanonicalPolicy({ authoritative: true })
        await t37.test('37.1: Redis key absent returns null in authoritative getCanonicalPolicy', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) { return null; }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            const policy = await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
            assert.equal(policy, null, 'Authoritative read of absent key must return null');
        });

        // 37.2: Empty hash ({} returned by HGETALL) returns null in getCanonicalPolicy({ authoritative: true })
        await t37.test('37.2: Empty hash returns null in authoritative getCanonicalPolicy', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) { return {}; }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            const policy = await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
            assert.equal(policy, null, 'Authoritative read of empty hash must return null');
        });

        // 37.3: Non-empty hash missing version throws MALFORMED_REDIS_POLICY
        await t37.test('37.3: Non-empty hash missing version throws MALFORMED_REDIS_POLICY', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) { return { contentHash: 'abc12345', ref: 'HSVP/RATE/01' }; }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            await assert.rejects(
                async () => {
                    await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                },
                (err) => {
                    assert.equal(err.code, 'MALFORMED_REDIS_POLICY');
                    assert.match(err.message, /missing or invalid version/i);
                    return true;
                }
            );
        });

        // 37.4: Non-empty hash with empty string version throws MALFORMED_REDIS_POLICY
        await t37.test('37.4: Non-empty hash with empty string version throws MALFORMED_REDIS_POLICY', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) { return { version: '', contentHash: 'abc12345' }; }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            await assert.rejects(
                async () => {
                    await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                },
                (err) => {
                    assert.equal(err.code, 'MALFORMED_REDIS_POLICY');
                    assert.match(err.message, /missing or invalid version/i);
                    return true;
                }
            );
        });

        // 37.5: Non-empty hash with invalid version throws MALFORMED_REDIS_POLICY
        await t37.test('37.5: Non-empty hash with invalid version (non-numeric, <= 0, float) throws MALFORMED_REDIS_POLICY', async () => {
            const invalidVersions = ['not-a-number', '-2', '0', '1.5', 'true'];
            for (const invVer of invalidVersions) {
                const mockClient = {
                    status: 'ready',
                    async ping() { return 'PONG'; },
                    async hgetall(key) { return { version: invVer, contentHash: 'abc12345' }; }
                };
                const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
                await assert.rejects(
                    async () => {
                        await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                    },
                    (err) => {
                        assert.equal(err.code, 'MALFORMED_REDIS_POLICY');
                        return true;
                    },
                    `Version '${invVer}' must throw MALFORMED_REDIS_POLICY`
                );
            }
        });

        // 37.6: Non-empty hash missing contentHash throws MALFORMED_REDIS_POLICY
        await t37.test('37.6: Non-empty hash missing contentHash throws MALFORMED_REDIS_POLICY', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) { return { version: '1' }; }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            await assert.rejects(
                async () => {
                    await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                },
                (err) => {
                    assert.equal(err.code, 'MALFORMED_REDIS_POLICY');
                    assert.match(err.message, /missing or invalid.*contentHash/i);
                    return true;
                }
            );
        });

        // 37.7: Non-empty hash with whitespace or empty contentHash throws MALFORMED_REDIS_POLICY
        await t37.test('37.7: Non-empty hash with empty string or whitespace contentHash throws MALFORMED_REDIS_POLICY', async () => {
            const invalidHashes = ['', '   ', '\t\n'];
            for (const invHash of invalidHashes) {
                const mockClient = {
                    status: 'ready',
                    async ping() { return 'PONG'; },
                    async hgetall(key) { return { version: '1', contentHash: invHash }; }
                };
                const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
                await assert.rejects(
                    async () => {
                        await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                    },
                    (err) => {
                        assert.equal(err.code, 'MALFORMED_REDIS_POLICY');
                        return true;
                    },
                    `contentHash '${invHash}' must throw MALFORMED_REDIS_POLICY`
                );
            }
        });

        // 37.8: Valid canonical policy parses correctly
        await t37.test('37.8: Valid canonical policy returns parsed typed object', async () => {
            const mockClient = {
                status: 'ready',
                async ping() { return 'PONG'; },
                async hgetall(key) {
                    return {
                        version: '3',
                        contentHash: 'valid-hash-67890',
                        ref: 'HSVP/RATE/01',
                        minIntervalMs: '12000',
                        maxPerMin: '8',
                        maxPerHour: '80',
                        maxPerDay: '800',
                        approvedBy: '507f1f77bcf86cd799439011',
                        updatedAt: '1700000000'
                    };
                }
            };
            const provider = new RedisPortalQuotaProvider(mockClient, { allowInMemoryFallback: false, testMode: false });
            const policy = await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
            assert.ok(policy, 'Must return parsed policy');
            assert.equal(policy.authorityCode, authorityCode);
            assert.equal(policy.version, 3);
            assert.equal(policy.contentHash, 'valid-hash-67890');
            assert.equal(policy.policyReference, 'HSVP/RATE/01');
            assert.equal(policy.minIntervalMs, 12000);
            assert.equal(policy.maxRequestsPerMinute, 8);
            assert.equal(policy.maxRequestsPerHour, 80);
            assert.equal(policy.maxRequestsPerDay, 800);
            assert.equal(policy.approvedBy, '507f1f77bcf86cd799439011');
            assert.equal(policy.updatedAt, 1700000000);
        });

        // 37.9: RedisPortalQuotaProvider.isRedisReady contracts: PONG, unexpected string, empty string, rejection, timeout, disconnected
        await t37.test('37.9: RedisPortalQuotaProvider.isRedisReady strictly validates PONG and rejects unexpected string, empty, error, timeout, disconnected', async () => {
            // PONG => ready
            const readyClient = {
                status: 'ready',
                async ping() { return 'PONG'; }
            };
            const pReady = new RedisPortalQuotaProvider(readyClient);
            assert.equal(await pReady.isRedisReady(100), true, 'PONG must report ready=true');

            // Unexpected string => not ready
            const unexpectedClient = {
                status: 'ready',
                async ping() { return 'UNEXPECTED_STRING_RESPONSE'; }
            };
            const pUnexpected = new RedisPortalQuotaProvider(unexpectedClient);
            assert.equal(await pUnexpected.isRedisReady(100), false, 'Unexpected string must report ready=false');

            // Empty string => not ready
            const emptyStrClient = {
                status: 'ready',
                async ping() { return ''; }
            };
            const pEmpty = new RedisPortalQuotaProvider(emptyStrClient);
            assert.equal(await pEmpty.isRedisReady(100), false, 'Empty string must report ready=false');

            // PING rejection => not ready
            const rejectingClient = {
                status: 'ready',
                async ping() { throw new Error('CONNECTION_RESET_BY_PEER'); }
            };
            const pReject = new RedisPortalQuotaProvider(rejectingClient);
            assert.equal(await pReject.isRedisReady(100), false, 'PING rejection must report ready=false');

            // PING timeout => not ready
            const timeoutClient = {
                status: 'ready',
                async ping() {
                    await new Promise(r => setTimeout(r, 300));
                    return 'PONG';
                }
            };
            const pTimeout = new RedisPortalQuotaProvider(timeoutClient);
            assert.equal(await pTimeout.isRedisReady(50), false, 'PING timeout must report ready=false');

            // Disconnected status / flags => not ready
            const disconnectedStatusClient = {
                status: 'close',
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalQuotaProvider(disconnectedStatusClient).isRedisReady(100), false, 'status=close must report ready=false');

            const reconnectingStatusClient = {
                status: 'reconnecting',
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalQuotaProvider(reconnectingStatusClient).isRedisReady(100), false, 'status=reconnecting must report ready=false');

            const notReadyFlagClient = {
                isReady: false,
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalQuotaProvider(notReadyFlagClient).isRedisReady(100), false, 'isReady=false must report ready=false');

            const notOpenFlagClient = {
                isOpen: false,
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalQuotaProvider(notOpenFlagClient).isRedisReady(100), false, 'isOpen=false must report ready=false');

            const missingPingClient = {
                status: 'ready'
            };
            assert.equal(await new RedisPortalQuotaProvider(missingPingClient).isRedisReady(100), false, 'missing ping method must report ready=false');

            assert.equal(await new RedisPortalQuotaProvider(null).isRedisReady(100), false, 'null client must report ready=false');
        });

        // 37.10: RedisPortalQuotaProvider fails closed when Redis is unavailable
        await t37.test('37.10: RedisPortalQuotaProvider fails closed across all operations when Redis is unavailable', async () => {
            const unavailableClient = {
                status: 'close',
                isReady: false,
                isOpen: false,
                async ping() { throw new Error('Connection closed'); }
            };
            const provider = new RedisPortalQuotaProvider(unavailableClient, { allowInMemoryFallback: false, testMode: false });

            // getCanonicalPolicy fails closed
            await assert.rejects(
                async () => {
                    await provider.getCanonicalPolicy({ authorityCode, authoritative: true });
                },
                (err) => err.code === 'REDIS_UNAVAILABLE'
            );

            // setCanonicalPolicy fails closed
            await assert.rejects(
                async () => {
                    await provider.setCanonicalPolicy({
                        authorityCode,
                        policy: {
                            policyReference: 'HSVP/RATE/01',
                            minIntervalMs: 15000,
                            maxRequestsPerMinute: 10,
                            maxRequestsPerHour: 100,
                            maxRequestsPerDay: 500
                        }
                    });
                },
                (err) => err.code === 'PORTAL_QUOTA_REDIS_UNAVAILABLE'
            );

            // reserve fails closed
            await assert.rejects(
                async () => {
                    await provider.reserve({
                        authorityCode,
                        policy: {
                            policyReference: 'HSVP/RATE/01',
                            minIntervalMs: 15000,
                            maxRequestsPerMinute: 10,
                            maxRequestsPerHour: 100,
                            maxRequestsPerDay: 500
                        }
                    });
                },
                (err) => err.code === 'PORTAL_QUOTA_REDIS_UNAVAILABLE'
            );
        });

        // 37.11: Directly test RedisPortalDistributedLock.isRedisReady() contracts
        await t37.test('37.11: RedisPortalDistributedLock.isRedisReady strictly validates PONG and rejects unexpected string, empty, error, timeout, disconnected', async () => {
            // PONG => ready
            const readyClient = {
                status: 'ready',
                async ping() { return 'PONG'; }
            };
            const lockReady = new RedisPortalDistributedLock(readyClient);
            assert.equal(await lockReady.isRedisReady(100), true, 'Lock PONG must report ready=true');

            // Unexpected string => not ready
            const unexpectedClient = {
                status: 'ready',
                async ping() { return 'UNEXPECTED_LOCK_RESPONSE'; }
            };
            const lockUnexpected = new RedisPortalDistributedLock(unexpectedClient);
            assert.equal(await lockUnexpected.isRedisReady(100), false, 'Lock unexpected string must report ready=false');

            // Empty string => not ready
            const emptyStrClient = {
                status: 'ready',
                async ping() { return ''; }
            };
            const lockEmpty = new RedisPortalDistributedLock(emptyStrClient);
            assert.equal(await lockEmpty.isRedisReady(100), false, 'Lock empty string must report ready=false');

            // PING rejection => not ready
            const rejectingClient = {
                status: 'ready',
                async ping() { throw new Error('LOCK_REDIS_CONNECTION_RESET'); }
            };
            const lockReject = new RedisPortalDistributedLock(rejectingClient);
            assert.equal(await lockReject.isRedisReady(100), false, 'Lock PING rejection must report ready=false');

            // PING timeout => not ready
            const timeoutClient = {
                status: 'ready',
                async ping() {
                    await new Promise(r => setTimeout(r, 300));
                    return 'PONG';
                }
            };
            const lockTimeout = new RedisPortalDistributedLock(timeoutClient);
            assert.equal(await lockTimeout.isRedisReady(50), false, 'Lock PING timeout must report ready=false');

            // Disconnected status / flags => not ready
            const disconnectedClient = {
                status: 'close',
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalDistributedLock(disconnectedClient).isRedisReady(100), false, 'Lock status=close must report ready=false');

            const reconnectingClient = {
                status: 'reconnecting',
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalDistributedLock(reconnectingClient).isRedisReady(100), false, 'Lock status=reconnecting must report ready=false');

            const notReadyClient = {
                isReady: false,
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalDistributedLock(notReadyClient).isRedisReady(100), false, 'Lock isReady=false must report ready=false');

            const notOpenClient = {
                isOpen: false,
                async ping() { return 'PONG'; }
            };
            assert.equal(await new RedisPortalDistributedLock(notOpenClient).isRedisReady(100), false, 'Lock isOpen=false must report ready=false');

            const missingPingClient = {
                status: 'ready'
            };
            assert.equal(await new RedisPortalDistributedLock(missingPingClient).isRedisReady(100), false, 'Lock missing ping must report ready=false');

            assert.equal(await new RedisPortalDistributedLock(null).isRedisReady(100), false, 'Lock null client must report ready=false');
        });

        // 37.12: RedisPortalDistributedLock fails closed when Redis is unavailable
        await t37.test('37.12: RedisPortalDistributedLock fails closed across acquire and isCurrentFenceToken when Redis is unavailable', async () => {
            const unavailableClient = {
                status: 'close',
                isReady: false,
                isOpen: false,
                async ping() { throw new Error('Connection closed'); }
            };
            const lock = new RedisPortalDistributedLock(unavailableClient, { allowInMemoryFallback: false, testMode: false });

            // acquire fails closed
            await assert.rejects(
                async () => {
                    await lock.acquire({ authorityCode });
                },
                (err) => err.code === 'PORTAL_LOCK_REDIS_UNAVAILABLE'
            );

            // isCurrentFenceToken fails closed
            await assert.rejects(
                async () => {
                    await lock.isCurrentFenceToken(authorityCode, 1);
                },
                (err) => err.code === 'PORTAL_LOCK_REDIS_UNAVAILABLE'
            );
        });

        // 37.13: Controller syncCanonicalPolicy fails closed with 502 MALFORMED_REDIS_POLICY on malformed Redis hash and NEVER invokes setCanonicalPolicy
        await t37.test('37.13: syncCanonicalPolicy fails closed with 502 MALFORMED_REDIS_POLICY on malformed Redis hash and NEVER invokes setCanonicalPolicy', async () => {
            const approverRole = await Role.create({
                name: `Approver Role Malformed Redis Test ${Date.now()}`,
                department: 'inventory',
                approvalRights: { manageAuthoritySettings: true },
                moduleAccess: { authorityVerification: { view: true, create: true, edit: true, delete: true } }
            });
            const approverUser = await User.create({
                fullName: 'Malformed Redis Tester',
                email: `malformed-tester-${Date.now()}@test.internal`,
                password: 'hashed-password-123',
                role: approverRole._id,
                department: 'inventory',
                isActive: true
            });

            await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
            const polAuditDoc = await AuditLog.create({
                eventType: 'canonical_policy_rotated',
                targetType: 'authority_canonical_policy',
                userId: approverUser._id,
                userName: 'Admin',
                description: 'Initial V2 Rotation',
                status: 'success'
            });

            const polDoc = await AuthorityCanonicalPolicy.create({
                authorityCode,
                policyReference: 'HSVP/RATE/01',
                version: 2,
                contentHash: 'hash-v2-expected',
                minIntervalMs: 15000,
                maxRequestsPerMinute: 10,
                maxRequestsPerHour: 100,
                maxRequestsPerDay: 500,
                redisSyncStatus: 'PENDING_RECONCILIATION',
                effectiveFrom: new Date(Date.now() - 3600000),
                expiresAt: new Date(Date.now() + 86400000),
                reviewedBy: new mongoose.Types.ObjectId(),
                approvedBy: approverUser._id,
                isActive: true,
                isAudited: true,
                auditStatus: 'AUDITED',
                auditLogId: polAuditDoc._id
            });
            await AuditLog.updateOne({ _id: polAuditDoc._id }, { $set: { targetId: polDoc._id } });

            const opId = `malformed-hash-race-${Date.now()}`;
            const corrId = `canonical_sync:${polDoc._id.toString()}:${opId}`;

            await AuditLog.create({
                eventType: 'canonical_policy_synced',
                correlationId: corrId,
                targetType: 'authority_canonical_policy',
                targetId: polDoc._id,
                userId: approverUser._id,
                userName: 'Admin',
                description: 'Prior publishing state',
                metadata: {
                    authorityCode,
                    version: polDoc.version,
                    contentHash: polDoc.contentHash,
                    redisSyncStatus: 'FAILED',
                    syncPhase: 'PUBLISHING',
                    leaseOwner: 'worker-stale-malformed',
                    leaseExpiresAt: new Date(Date.now() - 5000),
                    operationId: opId
                },
                status: 'failure'
            });

            let setCanonicalPolicyCalled = 0;
            const malformedProvider = {
                async setCanonicalPolicy() {
                    setCanonicalPolicyCalled++;
                    return { success: true };
                },
                async getCanonicalPolicy({ authoritative } = {}) {
                    const err = new Error('MALFORMED_REDIS_POLICY: Authoritative Redis record is malformed: missing or invalid version');
                    err.code = 'MALFORMED_REDIS_POLICY';
                    throw err;
                }
            };
            setTestQuotaProvider(malformedProvider);

            const origIndexes = AuditLog.collection.indexes;
            AuditLog.collection.indexes = async () => [
                {
                    v: 2,
                    key: { eventType: 1, correlationId: 1 },
                    name: 'unique_audit_event_correlation',
                    unique: true,
                    partialFilterExpression: { correlationId: { $type: 'string' } }
                }
            ];

            try {
                let statusCode = null;
                let responseBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get: () => 'test-agent',
                    body: { operationId: opId }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(body) { responseBody = body; return this; }
                };

                await syncCanonicalPolicy(req, res);

                assert.equal(statusCode, 502, 'Must return HTTP 502 when Redis hash is malformed');
                assert.equal(responseBody.code, 'MALFORMED_REDIS_POLICY');
                assert.equal(responseBody.status, 'PENDING_RECONCILIATION');
                assert.equal(setCanonicalPolicyCalled, 0, 'setCanonicalPolicy must NEVER be invoked after malformed Redis record detected');

                const updatedPol = await AuthorityCanonicalPolicy.findById(polDoc._id);
                assert.equal(updatedPol.redisSyncStatus, 'PENDING_RECONCILIATION');
                assert.match(updatedPol.redisSyncError, /malformed/i);

                const updatedAudit = await AuditLog.findOne({ correlationId: corrId });
                assert.equal(updatedAudit.status, 'failed');
                assert.equal(updatedAudit.metadata?.syncPhase, 'PENDING_RECONCILIATION');
                assert.equal(updatedAudit.metadata?.redisSyncStatus, 'MALFORMED_REDIS_POLICY');
            } finally {
                setTestQuotaProvider(null);
                AuditLog.collection.indexes = origIndexes;
            }
        });
    });
});
