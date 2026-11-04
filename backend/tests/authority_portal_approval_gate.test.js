import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_APPROVAL_GATE_CONFIG,
    evaluateAuthorityPortalApproval,
    assertAuthorityPortalApproval
} from '../services/authority/portal/authorityPortalApprovalGate.js';

const approvedFixture = () => ({
    status: 'GRANTED',
    accessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
    writtenPermissionReference: 'LETTER/IT/2026/001',
    commercialUseAuthorized: true,
    readOnlySearchAuthorized: true,
    termsReviewed: true,
    termsReference: 'https://authority.example/terms-reviewed-2026-11-02',
    approvedBy: 'authority-approver',
    reviewedBy: 'independent-compliance-reviewer',
    expiresAt: '2027-11-02T00:00:00.000Z',
    permittedFields: ['propertyId', 'sectorNumber', 'propertyCategory', 'area', 'authorityStatus'],
    ratePolicy: {
        maxRequestsPerMinute: 2,
        maxRequestsPerDay: 500,
        minimumIntervalMs: 30000,
        maxConcurrentRequests: 1,
        policyReference: 'LETTER/IT/2026/001-ANNEX-A'
    }
});

const baseOptions = () => ({
    authorityCode: 'HSVP',
    approval: approvedFixture(),
    now: new Date('2026-11-02T00:00:00.000Z'),
    gate: { ...DEFAULT_APPROVAL_GATE_CONFIG, enabled: true }
});

test('gate is disabled by default for all sources', () => {
    const result = evaluateAuthorityPortalApproval({ authorityCode: 'HSVP', approval: approvedFixture() });
    assert.equal(result.approved, false);
    assert.ok(result.blockers.some((b) => b.code === 'GATE_DISABLED'));
});

test('missing written approval blocks collection', () => {
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval: null });
    assert.equal(result.approved, false);
    assert.ok(result.blockers.some((b) => b.code === 'APPROVAL_REQUIRED'));
});

test('public page availability alone does not authorize automation', () => {
    const approval = approvedFixture();
    approval.status = 'NOT_OBTAINED';
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'WRITTEN_APPROVAL_NOT_GRANTED'));
});

test('generic portal permission does not imply scraper permission', () => {
    const approval = approvedFixture();
    approval.accessMethod = 'PUBLIC_API';
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'ACCESS_METHOD_NOT_APPROVED'));
});

test('permission must explicitly allow commercial CRM use and read-only search', () => {
    const approval = approvedFixture();
    approval.commercialUseAuthorized = false;
    approval.readOnlySearchAuthorized = false;
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'COMMERCIAL_USE_NOT_AUTHORIZED'));
    assert.ok(result.blockers.some((b) => b.code === 'READ_ONLY_SEARCH_NOT_AUTHORIZED'));
});

test('expired approval is rejected', () => {
    const approval = approvedFixture();
    approval.expiresAt = '2026-11-01T00:00:00.000Z';
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'APPROVAL_EXPIRED_OR_INVALID'));
});

test('unreviewed or unreferenced terms block automation', () => {
    const approval = approvedFixture();
    approval.termsReviewed = false;
    approval.termsReference = '';
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'TERMS_REVIEW_MISSING'));
});

test('missing permitted field scope blocks automation', () => {
    const approval = approvedFixture();
    approval.permittedFields = [];
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_SCOPE_MISSING'));
});

test('owner and contact PII fields cannot be enabled', () => {
    const approval = approvedFixture();
    approval.permittedFields.push('allotteeName', 'ownerPhone');
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'PERSONAL_DATA_FIELD_BLOCKED'));
});

test('rate limits must be authority-defined and one-worker only', () => {
    const approval = approvedFixture();
    approval.ratePolicy.maxRequestsPerDay = null;
    approval.ratePolicy.maxConcurrentRequests = 3;
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'APPROVED_RATE_POLICY_MISSING'));
});

test('source paused after CAPTCHA/403/429 remains blocked', () => {
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), sourcePaused: true });
    assert.ok(result.blockers.some((b) => b.code === 'SOURCE_PAUSED'));
});

test('independent maker-checker review is required', () => {
    const approval = approvedFixture();
    approval.reviewedBy = '';
    const result = evaluateAuthorityPortalApproval({ ...baseOptions(), approval });
    assert.ok(result.blockers.some((b) => b.code === 'MAKER_CHECKER_REVIEW_MISSING'));
});

test('valid authority approval passes and can be asserted', () => {
    const options = baseOptions();
    const result = evaluateAuthorityPortalApproval(options);
    assert.equal(result.approved, true);
    assert.equal(assertAuthorityPortalApproval(options).liveAutomationAllowed, true);
});

test('assertion fails closed with actionable blocker codes', () => {
    assert.throws(
        () => assertAuthorityPortalApproval({ authorityCode: 'HSVP' }),
        (error) => error.code === 'AUTHORITY_PORTAL_APPROVAL_BLOCKED' && error.blockers.length > 0
    );
});
