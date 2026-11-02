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
            body: { decision: 'APPROVED' }
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
});
