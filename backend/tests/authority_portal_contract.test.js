import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getAuthorityPortalDefinition,
    AUTHORITY_PORTAL_CODES
} from '../services/authority/portal/authorityPortalDefinitions.js';
import {
    buildAuthorityPortalSearchInput,
    normalizeAuthorityLocation,
    resolveExactPortalOption
} from '../services/authority/portal/authorityPortalSearchMapper.js';
import {
    assertAuthorityPortalAutomationAllowed,
    classifyAuthorityPortalResponse,
    DEFAULT_AUTHORITY_PORTAL_POLICY,
    getNextPortalRequestAt
} from '../services/authority/portal/authorityPortalSafety.js';

test('three authority portal contracts are registered and disabled by default', () => {
    assert.deepEqual(AUTHORITY_PORTAL_CODES, ['HSVP', 'GMADA', 'CHD']);
    for (const code of AUTHORITY_PORTAL_CODES) {
        const definition = getAuthorityPortalDefinition(code);
        assert.equal(definition.access.automationEnabled, false);
        assert.equal(definition.access.termsReviewStatus, 'NOT_REVIEWED');
    }
});

test('HSVP search uses Urban Estate + Sector + Plot Number from CRM identity', () => {
    const result = buildAuthorityPortalSearchInput({
        authorityCode: 'HSVP',
        inventory: { city: 'Kurukshetra', sector: '7', unitNo: '101' }
    });
    assert.equal(result.ready, true);
    assert.deepEqual(result.criteria, { urbanEstate: 'Kurukshetra', sector: '7', plotNumber: '101' });
});

test('HSVP prefers saved authority link identity over generic inventory fields', () => {
    const result = buildAuthorityPortalSearchInput({
        authorityCode: 'HSVP',
        inventory: { city: 'Kurukshetra', sector: '7', unitNo: '101' },
        authorityLink: { urbanEstate: 'Urban Estate Kurukshetra', sectorNumber: '8', propertyId: 'P-19' }
    });
    assert.deepEqual(result.criteria, { urbanEstate: 'Urban Estate Kurukshetra', sector: '8', plotNumber: 'P-19' });
});

test('GMADA maps SAS Nagar to Mohali and category/subcategory to search dropdown criteria', () => {
    const result = buildAuthorityPortalSearchInput({
        authorityCode: 'GMADA',
        inventory: { city: 'SAS Nagar', sector: '82', unitNo: 'C-101', category: 'Commercial', subCategory: 'SCO' }
    });
    assert.equal(result.ready, true);
    assert.equal(result.criteria.location, 'Mohali');
    assert.equal(result.criteria.sectors, '82');
    assert.equal(result.criteria.usageType, 'Commercial');
    assert.equal(result.criteria.propertyType, 'SCO');
    assert.equal(result.criteria.propertyNo, 'C-101');
    assert.equal(result.searchMode, 'PROPERTY_NUMBER');
});

test('GMADA only infers a project location when a known locality is the suffix', () => {
    const matched = buildAuthorityPortalSearchInput({
        authorityCode: 'GMADA',
        inventory: { projectName: 'IT City Phase 2 Mohali', sector: '82', unitNo: 'A-1' }
    });
    assert.equal(matched.criteria.location, 'Mohali');
    assert.equal(matched.ready, true);

    const notMatched = buildAuthorityPortalSearchInput({
        authorityCode: 'GMADA',
        inventory: { projectName: 'Mohali Urban Developments', sector: '82', unitNo: 'A-1' }
    });
    assert.equal(notMatched.criteria.location, '');
    assert.equal(notMatched.ready, false);
});

test('GMADA supports Form No fallback when Property No is absent', () => {
    const result = buildAuthorityPortalSearchInput({
        authorityCode: 'GMADA',
        inventory: { city: 'Mohali', sector: '66A' },
        authorityLink: { formNumber: 'GM/1234' }
    });
    assert.equal(result.ready, true);
    assert.equal(result.searchMode, 'FORM_NUMBER');
});

test('Chandigarh prefers Plot + Sector and supports File Type + File Number fallback', () => {
    const plotResult = buildAuthorityPortalSearchInput({
        authorityCode: 'CHD',
        inventory: { city: 'Chandigarh', sector: '22', unitNo: '22-B' }
    });
    assert.equal(plotResult.ready, true);
    assert.equal(plotResult.searchMode, 'PLOT_SECTOR');

    const fileResult = buildAuthorityPortalSearchInput({
        authorityCode: 'CHD',
        inventory: {},
        authorityLink: { fileNumber: 'EO/1234' },
        overrides: { fileType: 'Allotment' }
    });
    assert.equal(fileResult.ready, true);
    assert.equal(fileResult.searchMode, 'FILE_NUMBER');
});

test('dropdown mapping requires exact normalized option matches', () => {
    assert.deepEqual(resolveExactPortalOption(' Mohali ', ['Mohali', 'Kharar']), {
        matched: true, value: 'Mohali', reason: null
    });
    assert.equal(resolveExactPortalOption('Mohali Urban', ['Mohali']).matched, false);
});

test('location alias normalization is constrained to SAS Nagar', () => {
    assert.equal(normalizeAuthorityLocation('SAS Nagar'), 'Mohali');
    assert.equal(normalizeAuthorityLocation('Kurukshetra'), 'Kurukshetra');
});

test('source stays disabled by default; activation requires read-only mode and terms review', () => {
    assert.equal(DEFAULT_AUTHORITY_PORTAL_POLICY.enabled, false);
    assert.throws(() => assertAuthorityPortalAutomationAllowed(), { code: 'AUTHORITY_PORTAL_DISABLED' });
    assert.throws(() => assertAuthorityPortalAutomationAllowed({
        policy: { enabled: true, readOnly: true }, termsReviewed: false
    }), { code: 'AUTHORITY_PORTAL_TERMS_REVIEW_REQUIRED' });
    assert.throws(() => assertAuthorityPortalAutomationAllowed({
        policy: { enabled: true, readOnly: false }, termsReviewed: true
    }), { code: 'AUTHORITY_PORTAL_READ_ONLY_REQUIRED' });
    assert.equal(assertAuthorityPortalAutomationAllowed({
        policy: { enabled: true, readOnly: true }, termsReviewed: true
    }), true);
});

test('HTTP 403, 429, CAPTCHA and login walls pause the source', () => {
    assert.deepEqual(classifyAuthorityPortalResponse({ status: 403 }), {
        action: 'PAUSE_SOURCE', reason: 'HTTP_403_FORBIDDEN', retry: false
    });
    assert.deepEqual(classifyAuthorityPortalResponse({ status: 429 }), {
        action: 'PAUSE_SOURCE', reason: 'HTTP_429_RATE_LIMITED', retry: false, respectRetryAfter: true
    });
    assert.equal(classifyAuthorityPortalResponse({ status: 200, body: 'Verify you are human' }).action, 'PAUSE_SOURCE');
    assert.equal(classifyAuthorityPortalResponse({ status: 302, location: '/Account/Login' }).reason, 'LOGIN_OR_SESSION_REQUIRED');
    assert.equal(classifyAuthorityPortalResponse({ status: 503 }).action, 'RETRY_LATER');
});

test('per-source request spacing never schedules earlier than the minimum interval', () => {
    const nextAt = getNextPortalRequestAt({ now: 100_000, lastRequestAt: 95_000, minimumIntervalMs: 15_000 });
    assert.equal(nextAt.getTime(), 110_000);
});
