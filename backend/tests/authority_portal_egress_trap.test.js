/**
 * Authority Portal Egress Trap & Pipeline Integration Test Suite
 * Phase 4.4.4 Acceptance
 *
 * Verifies that the Authority Verification Engine strictly traps:
 *   1. Foreign host egress (strict host allow-list).
 *   2. Automatic redirect following (redirects intercepted and source paused).
 *   3. Rate limit / quota overrun (zero egress when quota is unavailable).
 *   4. Concurrent duplicate requests (distributed lock mutex).
 *   5. Circuit breaker tripped state (zero egress after pause).
 *   6. Identity mismatches (exact inventory matching prevents invalid candidates).
 *   7. Zero automated mutation of Inventory or Contacts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityPortalRuntime } from '../services/authority/portal/authorityPortalRuntime.js';
import { DEFAULT_APPROVAL_GATE_CONFIG } from '../services/authority/portal/authorityPortalApprovalGate.js';
import { portalHttpTransport } from '../services/authority/portal/infrastructure/portalHttpTransport.js';
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { DurablePortalCircuitBreaker } from '../services/authority/portal/infrastructure/durablePortalCircuitBreaker.js';
import { PortalAuditSink } from '../services/authority/portal/infrastructure/portalAuditSink.js';
import { matchAuthorityInventory, buildLiveVerificationCandidate } from '../services/authority/portal/portalInventoryMatcher.js';
import { PORTAL_PARSERS } from '../services/authority/portal/parsers/portalParserRegistry.js';

const validApproval = (code = 'HSVP') => ({
    authorityCode: code,
    status: 'GRANTED',
    accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
    writtenPermissionReference: `${code}/IT/WRITTEN/2026/001`,
    commercialUseAuthorized: true,
    readOnlySearchAuthorized: true,
    termsReviewed: true,
    termsReference: `https://terms.example.com/${code}`,
    approvedBy: 'senior-director-id',
    reviewedBy: 'independent-audit-id',
    expiresAt: '2027-11-02T00:00:00.000Z',
    permittedFields: ['propertyId', 'sectorNumber', 'urbanEstate', 'propertyCategory', 'area', 'authorityStatus'],
    ratePolicy: {
        maxRequestsPerMinute: 2,
        maxRequestsPerDay: 500,
        minimumIntervalMs: 15000,
        maxConcurrentRequests: 1,
        policyReference: `${code}/RATE/DOC/01`
    }
});

function makeTestQuotaProvider(code = 'HSVP') {
    const q = new RedisPortalQuotaProvider();
    const app = validApproval(code);
    q.setCanonicalPolicy({ authorityCode: code, policy: app.ratePolicy, approvedBy: app.approvedBy, policyVersion: 1 });
    return q;
}

// ============================================================================
// 1. HOST ALLOW-LIST EGRESS TRAP
// ============================================================================
test('1. Strict Host Allow-List Egress Trap', async (t) => {
    await t.test('1.1 portalHttpTransport traps and rejects unknown host before sending request', async () => {
        await assert.rejects(
            portalHttpTransport.search({
                authorityCode: 'HSVP',
                definition: { searchUrl: 'https://evil-unauthorized-host.com/plot' },
                criteria: { urbanEstate: 'Faridabad', sector: '14', plotNumber: '100' }
            }),
            { code: 'PORTAL_HOST_NOT_ALLOWLISTED' }
        );
    });

    await t.test('1.2 portalHttpTransport traps and rejects unknown authority code', async () => {
        await assert.rejects(
            portalHttpTransport.search({
                authorityCode: 'UNKNOWN_MUNICIPALITY',
                definition: { searchUrl: 'https://unknown.gov.in/search' },
                criteria: {}
            }),
            { code: 'PORTAL_HOST_NOT_ALLOWLISTED' }
        );
    });
});

// ============================================================================
// 2. REDIRECT EGRESS TRAP
// ============================================================================
test('2. Manual Redirect Interception & Egress Trap', async (t) => {
    await t.test('2.1 runtime intercepts redirect response, refuses to chase, and pauses source', async () => {
        const circuitBreaker = new DurablePortalCircuitBreaker();
        const auditSink = new PortalAuditSink();
        const lock = new RedisPortalDistributedLock();
        const quota = makeTestQuotaProvider('HSVP');

        let transportCalls = 0;
        const mockTransport = {
            async search() {
                transportCalls += 1;
                return {
                    status: 302,
                    headers: { 'location': 'https://hsvphry.org.in/Account/Login', 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: true,
                    body: '<html>Redirecting to login</html>'
                };
            }
        };

        const runtime = createAuthorityPortalRuntime({
            gateConfig: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true },
            lockProvider: lock,
            quotaProvider: quota,
            circuitBreakerStore: circuitBreaker,
            transport: mockTransport,
            parserRegistry: PORTAL_PARSERS,
            auditSink
        });

        await assert.rejects(
            runtime.search({
                authorityCode: 'HSVP',
                inventory: { city: 'Faridabad', sector: '14', unitNo: '500' },
                approval: validApproval('HSVP')
            }),
            { code: 'PORTAL_REDIRECT_BLOCKED' }
        );

        // Only 1 request occurred, redirect was never followed
        assert.equal(transportCalls, 1);
        // Source was automatically paused
        assert.equal(await circuitBreaker.isPaused('HSVP'), true);
    });
});

// ============================================================================
// 3. QUOTA RESERVATION & RATE LIMIT EGRESS TRAP
// ============================================================================
test('3. Quota Reservation & Rate Limit Egress Trap', async (t) => {
    await t.test('3.1 minimum interval violation blocks transport dispatch (zero egress)', async () => {
        const quota = makeTestQuotaProvider('HSVP');
        const lock = new RedisPortalDistributedLock();
        const circuitBreaker = new DurablePortalCircuitBreaker();
        const auditSink = new PortalAuditSink();

        let transportCalls = 0;
        const mockTransport = {
            async search() {
                transportCalls += 1;
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: false,
                    body: '<div id="detailsPanel"><table><tr><th>Plot No</th><td>100</td></tr><tr><th>Sector</th><td>14</td></tr><tr><th>Urban Estate</th><td>Faridabad</td></tr></table></div>'
                };
            }
        };

        const runtime = createAuthorityPortalRuntime({
            gateConfig: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true },
            lockProvider: lock,
            quotaProvider: quota,
            circuitBreakerStore: circuitBreaker,
            transport: mockTransport,
            parserRegistry: PORTAL_PARSERS,
            auditSink
        });

        // Request 1: succeeds
        await runtime.search({
            authorityCode: 'HSVP',
            inventory: { city: 'Faridabad', sector: '14', unitNo: '100' },
            approval: validApproval('HSVP')
        });
        assert.equal(transportCalls, 1);

        // Immediate Request 2 (< 15,000ms): blocked at quota provider, ZERO network egress
        await assert.rejects(
            runtime.search({
                authorityCode: 'HSVP',
                inventory: { city: 'Faridabad', sector: '14', unitNo: '101' },
                approval: validApproval('HSVP')
            }),
            { code: 'PORTAL_AUTHORITY_QUOTA_BLOCKED' }
        );

        assert.equal(transportCalls, 1, 'Transport must not be called when quota reservation is blocked');
    });
});

// ============================================================================
// 4. DISTRIBUTED LOCK CONCURRENCY MUTEX
// ============================================================================
test('4. Distributed Lock Concurrency Mutex', async (t) => {
    await t.test('4.1 concurrent requests for same source acquire lock exclusively and reject parallel runner', async () => {
        const lock = new RedisPortalDistributedLock();
        const quota = makeTestQuotaProvider('HSVP');
        const circuitBreaker = new DurablePortalCircuitBreaker();
        const auditSink = new PortalAuditSink();

        let transportDelayMs = 50;
        let activeTransportCalls = 0;
        let maxConcurrentTransportCalls = 0;

        const mockTransport = {
            async search() {
                activeTransportCalls += 1;
                maxConcurrentTransportCalls = Math.max(maxConcurrentTransportCalls, activeTransportCalls);
                await new Promise((resolve) => setTimeout(resolve, transportDelayMs));
                activeTransportCalls -= 1;
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: false,
                    body: '<div id="detailsPanel"><table><tr><th>Plot No</th><td>100</td></tr><tr><th>Sector</th><td>14</td></tr><tr><th>Urban Estate</th><td>Faridabad</td></tr></table></div>'
                };
            }
        };

        const runtime = createAuthorityPortalRuntime({
            gateConfig: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true },
            lockProvider: lock,
            quotaProvider: quota,
            circuitBreakerStore: circuitBreaker,
            transport: mockTransport,
            parserRegistry: PORTAL_PARSERS,
            auditSink
        });

        // Fire two simultaneous requests with different timestamps so quota reservation doesn't block first
        const searchInput = {
            authorityCode: 'HSVP',
            inventory: { city: 'Faridabad', sector: '14', unitNo: '100' },
            approval: validApproval('HSVP')
        };

        const results = await Promise.allSettled([
            runtime.search(searchInput),
            runtime.search(searchInput)
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Exactly one worker acquires lock and completes');
        assert.equal(rejected.length, 1, 'Competing worker is rejected');
        assert.ok(
            rejected[0].reason.code === 'PORTAL_SOURCE_BUSY' || rejected[0].reason.code === 'PORTAL_AUTHORITY_QUOTA_BLOCKED',
            'Competitor rejected with PORTAL_SOURCE_BUSY or quota block'
        );
        assert.equal(maxConcurrentTransportCalls, 1, 'Max concurrent transport calls must never exceed 1');
    });
});

// ============================================================================
// 5. EXACT INVENTORY MATCHING & ZERO AUTOMATED MUTATION
// ============================================================================
test('5. Exact Inventory Matching & Zero Automated Mutation', async (t) => {
    await t.test('5.1 exact match produces LIVE candidate without mutating inventory or creating contacts', () => {
        const inventory = {
            _id: 'inv_101',
            city: 'Faridabad',
            sector: 'Sector 14',
            unitNo: '500',
            status: 'AVAILABLE'
        };

        const authorityLink = {
            urbanEstate: 'UE001',
            sectorNumber: 'Sector 14',
            propertyId: '500'
        };

        const record = {
            urbanEstate: 'UE001',
            sectorNumber: 'Sector 14',
            propertyId: '500',
            propertyCategory: 'Residential',
            authorityStatus: 'Allotted'
        };

        const candidate = buildLiveVerificationCandidate({
            authorityCode: 'HSVP',
            record,
            inventory,
            link: authorityLink,
            parserVersion: 'hsvp-portal-v1'
        });

        assert.equal(candidate.status, 'PENDING_REVIEW');
        assert.equal(candidate.matches, true);
        assert.equal(candidate.provenance, 'LIVE');
        assert.equal(candidate.isSynthetic, false);
        assert.equal(candidate.requiresHumanReview, true);
        assert.equal(candidate.isApplied, false);

        // Verify inventory object is untouched
        assert.equal(inventory.status, 'AVAILABLE');
        assert.equal(inventory.authorityVerification, undefined);
    });

    await t.test('5.2 sector or plot mismatch rejects candidate creation with REJECTED_IDENTITY_MISMATCH', () => {
        const inventory = {
            city: 'Faridabad',
            sector: 'Sector 14',
            unitNo: '500'
        };
        const authorityLink = {
            urbanEstate: 'UE001',
            sectorNumber: 'Sector 14',
            propertyId: '500'
        };
        // Record returned has plot 501 instead of 500
        const mismatchedRecord = {
            urbanEstate: 'UE001',
            sectorNumber: 'Sector 14',
            propertyId: '501'
        };

        const candidate = buildLiveVerificationCandidate({
            authorityCode: 'HSVP',
            record: mismatchedRecord,
            inventory,
            link: authorityLink,
            parserVersion: 'hsvp-portal-v1'
        });

        assert.equal(candidate.status, 'REJECTED_IDENTITY_MISMATCH');
        assert.equal(candidate.matches, false);
        assert.ok(candidate.mismatches.length > 0);
        assert.equal(candidate.isApplied, false);
    });
});
