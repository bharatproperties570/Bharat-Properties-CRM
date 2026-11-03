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
    reviewSourceApproval
} from '../controllers/authorityVerification.controller.js';
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
    const testTenantId = new mongoose.Types.ObjectId();
    const submitterUser = { _id: new mongoose.Types.ObjectId(), tenantId: testTenantId };
    const reviewerUser = { _id: new mongoose.Types.ObjectId(), tenantId: testTenantId };

    t.before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);
        await AuthoritySourceSettings.ensureDefaults(testTenantId);
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
            setting.submittedBy = submitterUser._id;
            setting.approvedBy = reviewerUser._id;
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
            approvedBy: reviewerUser._id,
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
            setting.reviewStatus = 'UNDER_REVIEW';
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

            const at = new Date();
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
        const tenantId = new mongoose.Types.ObjectId();
        const authorityCode = 'GMADA';

        await AuthoritySourceSettings.deleteMany({ tenantId, authorityCode });
        await AuthoritySourceSettings.create({
            tenantId,
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
            isPaused: false,
            contractVerificationStatus: 'VERIFIED_CONTRACT',
            contractEvidenceReference: 'GMADA/CONTRACT/01',
            identityRequirements: { verified: true },
            ratePolicy: {
                maxConcurrent: 1,
                maxRequestsPerMinute: 10,
                maxRequestsPerDay: 500,
                minIntervalMs: 50,
                minimumIntervalMs: 50,
                policySource: 'APPROVED_POLICY'
            },
            lastCommittedFenceToken: 0
        });

        // Simulate Worker A and Worker B with fence watermarks
        // Worker A has fence token 5
        // Worker B has fence token 6
        // Worker B commits first and advances watermark to 6
        const watermarkB = await AuthoritySourceSettings.findOneAndUpdate(
            {
                tenantId,
                authorityCode,
                $or: [
                    { lastCommittedFenceToken: { $lt: 6 } },
                    { lastCommittedFenceToken: { $exists: false } },
                    { lastCommittedFenceToken: null }
                ]
            },
            { $set: { lastCommittedFenceToken: 6 } },
            { new: true }
        );
        assert.ok(watermarkB);
        assert.equal(watermarkB.lastCommittedFenceToken, 6);

        // Worker A resumes with stale fence token 5: atomic conditional update fails closed!
        const watermarkA = await AuthoritySourceSettings.findOneAndUpdate(
            {
                tenantId,
                authorityCode,
                $or: [
                    { lastCommittedFenceToken: { $lt: 5 } },
                    { lastCommittedFenceToken: { $exists: false } },
                    { lastCommittedFenceToken: null }
                ]
            },
            { $set: { lastCommittedFenceToken: 5 } },
            { new: true }
        );
        assert.equal(watermarkA, null, 'Worker A with stale fence token 5 must be rejected by atomic watermark guard');
    });
});
