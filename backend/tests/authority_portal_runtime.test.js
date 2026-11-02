import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityPortalRuntime } from '../services/authority/portal/authorityPortalRuntime.js';
import { DEFAULT_APPROVAL_GATE_CONFIG } from '../services/authority/portal/authorityPortalApprovalGate.js';

const approved = () => ({
    authorityCode: 'HSVP',
    status: 'GRANTED',
    accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
    writtenPermissionReference: 'HSVP/IT/WRITTEN/2026/001',
    commercialUseAuthorized: true,
    readOnlySearchAuthorized: true,
    termsReviewed: true,
    termsReference: 'https://hsvphry.org.in/Home/Terms#review-record-2026-11-02',
    approvedBy: 'authority-approver-id',
    reviewedBy: 'independent-reviewer-id',
    expiresAt: '2027-11-02T00:00:00.000Z',
    permittedFields: ['propertyId', 'sectorNumber', 'propertyCategory', 'area', 'authorityStatus'],
    ratePolicy: {
        maxRequestsPerMinute: 2,
        maxRequestsPerDay: 500,
        minimumIntervalMs: 30000,
        maxConcurrentRequests: 1,
        policyReference: 'HSVP/IT/WRITTEN/2026/001-ANNEX-A'
    }
});

function makeRuntime(overrides = {}) {
    const calls = { transport: 0, audit: [], paused: [], quota: 0, acquired: 0, released: 0 };
    const deps = {
        gateConfig: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true },
        lockProvider: {
            async acquire() {
                calls.acquired += 1;
                return { acquired: true, async release() { calls.released += 1; } };
            }
        },
        quotaProvider: {
            async reserve() { calls.quota += 1; return { allowed: true, reservationId: 'quota-1' }; }
        },
        circuitBreakerStore: {
            paused: false,
            async isPaused() { return this.paused; },
            async pause(event) { this.paused = true; calls.paused.push(event); }
        },
        transport: {
            async search() {
                calls.transport += 1;
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: false,
                    body: '<html><table><tr><td>Property No</td><td>101</td></tr></table></html>'
                };
            }
        },
        parserRegistry: {
            HSVP: {
                version: 'test-parser-v1',
                async parse() {
                    return [{
                        propertyId: '101',
                        sectorNumber: '7',
                        propertyCategory: 'Residential',
                        area: '10 Marla',
                        authorityStatus: 'Allotted',
                        allotteeName: 'DO NOT STORE',
                        ownerPhone: '+91-9999999999',
                        unapprovedField: 'drop-me'
                    }];
                }
            }
        },
        auditSink: {
            async write(event) { calls.audit.push(event); }
        },
        clock: () => new Date('2026-11-02T07:00:00.000+05:30'),
        ...overrides
    };
    return { runtime: createAuthorityPortalRuntime(deps), deps, calls };
}

const searchArgs = () => ({
    authorityCode: 'HSVP',
    inventory: { city: 'Kurukshetra', sector: '7', unitNo: '101' },
    approval: approved()
});

test('runtime defaults fail-closed and never touches transport without enabled gate', async () => {
    const { runtime, calls } = makeRuntime({ gateConfig: { ...DEFAULT_APPROVAL_GATE_CONFIG } });
    await assert.rejects(runtime.search(searchArgs()), { code: 'AUTHORITY_PORTAL_DISABLED' });
    assert.equal(calls.transport, 0);
    assert.equal(calls.acquired, 0);
});

test('valid authorized lookup returns LIVE candidate but never applies CRM changes', async () => {
    const { runtime, calls } = makeRuntime();
    const result = await runtime.search(searchArgs());
    assert.equal(result.provenance, 'LIVE');
    assert.equal(result.isSynthetic, false);
    assert.equal(result.requiresHumanReview, true);
    assert.equal(result.isApplied, false);
    assert.equal(result.rawPortalResponsePersisted, false);
    assert.equal(result.recordCount, 1);
    assert.deepEqual(result.records[0], {
        propertyId: '101',
        sectorNumber: '7',
        propertyCategory: 'Residential',
        area: '10 Marla',
        authorityStatus: 'Allotted'
    });
    assert.equal(calls.transport, 1);
    assert.equal(calls.released, 1);
    assert.ok(calls.audit.some((event) => event.eventType === 'AUTHORITY_PORTAL_SEARCH_COMPLETED'));
});

test('verbal-only permission cannot pass the written approval gate', async () => {
    const { runtime, calls } = makeRuntime();
    const approval = approved();
    approval.writtenPermissionReference = '';
    await assert.rejects(runtime.search({ ...searchArgs(), approval }), (error) => {
        assert.equal(error.code, 'AUTHORITY_PORTAL_APPROVAL_BLOCKED');
        assert.ok(error.blockers.some((item) => item.code === 'WRITTEN_PERMISSION_REFERENCE_MISSING'));
        return true;
    });
    assert.equal(calls.transport, 0);
});

test('incomplete CRM identity is rejected before lock, quota or network', async () => {
    const { runtime, calls } = makeRuntime();
    await assert.rejects(runtime.search({ authorityCode: 'HSVP', inventory: {}, approval: approved() }), {
        code: 'PORTAL_SEARCH_CRITERIA_INCOMPLETE'
    });
    assert.equal(calls.acquired, 0);
    assert.equal(calls.quota, 0);
    assert.equal(calls.transport, 0);
});

test('403 pauses source and does not retry', async () => {
    const { runtime, deps, calls } = makeRuntime();
    deps.transport.search = async () => ({ status: 403, body: 'Forbidden', finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry' });
    await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_SOURCE_PAUSED' });
    assert.equal(calls.transport, 0);
    assert.equal(calls.paused.length, 1);
    assert.equal(calls.paused[0].reason, 'HTTP_403_FORBIDDEN');
});

test('429 pauses source and is never retried/escalated', async () => {
    const { runtime, deps, calls } = makeRuntime();
    deps.transport.search = async () => ({ status: 429, body: 'Too Many Requests', finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry' });
    await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_SOURCE_PAUSED' });
    assert.equal(calls.paused.length, 1);
    assert.equal(calls.transport, 0);
});

test('challenge/captcha and login wall pause source', async (t) => {
    for (const body of ['Verify you are human', '<form><input type="password"></form>']) {
        await t.test(body, async () => {
            const { runtime, deps, calls } = makeRuntime();
            deps.transport.search = async () => ({ status: 200, body, finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry' });
            await assert.rejects(runtime.search(searchArgs()));
            assert.equal(calls.paused.length, 1);
        });
    }
});

test('unexpected redirects and off-host final URLs are blocked', async (t) => {
    await t.test('redirect', async () => {
        const { runtime, deps, calls } = makeRuntime();
        deps.transport.search = async () => ({ status: 302, body: '', location: '/Account/Login', finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry' });
        await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_REDIRECT_BLOCKED' });
        assert.equal(calls.paused.length, 1);
    });
    await t.test('foreign host', async () => {
        const { runtime, deps, calls } = makeRuntime();
        deps.transport.search = async () => ({ status: 200, body: '<html/>', finalUrl: 'https://untrusted.example/' });
        await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_HOST_MISMATCH' });
        assert.equal(calls.paused.length, 1);
    });
});

test('a busy distributed source lock blocks the request', async () => {
    const { runtime, calls } = makeRuntime({
        lockProvider: { async acquire() { calls.acquired += 1; return { acquired: false }; } }
    });
    await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_SOURCE_BUSY' });
    assert.equal(calls.transport, 0);
    assert.equal(calls.quota, 0);
});

test('authority quota denial blocks transport', async () => {
    const { runtime, calls } = makeRuntime({
        quotaProvider: { async reserve() { calls.quota += 1; return { allowed: false, reason: 'MINIMUM_INTERVAL' }; } }
    });
    await assert.rejects(runtime.search(searchArgs()), { code: 'PORTAL_AUTHORITY_QUOTA_BLOCKED' });
    assert.equal(calls.transport, 0);
});

test('mandatory audit failure blocks transport', async () => {
    const { runtime, deps, calls } = makeRuntime({
        auditSink: { async write() { throw new Error('audit DB unavailable'); } }
    });
    await assert.rejects(runtime.search(searchArgs()), /audit DB unavailable/);
    assert.equal(calls.transport, 0);
});

test('source pause state blocks a previously paused authority', async () => {
    const { runtime, deps, calls } = makeRuntime();
    deps.circuitBreakerStore.paused = true;
    await assert.rejects(runtime.search(searchArgs()), { code: 'AUTHORITY_PORTAL_PAUSED' });
    assert.equal(calls.transport, 0);
});
