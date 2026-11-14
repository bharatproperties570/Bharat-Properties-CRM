import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_MARKETING_PDF_BYTES,
    normalizeMarketingDocumentCategory,
    isMarketingSafeDocumentCategory,
    isMarketingEligibleEntityType,
    isMarketingEligiblePdfVersion,
    isMarketingEligibleDocument,
    isValidMarketingDocumentReviewAttestation
} from '../services/marketing/MarketingDocumentApprovalPolicy.js';

test('marketing document category policy accepts only exact public marketing categories', () => {
    assert.equal(isMarketingSafeDocumentCategory('Project Brochure'), true);
    assert.equal(isMarketingSafeDocumentCategory(' floor   plan '), true);
    assert.equal(isMarketingSafeDocumentCategory('Project Presentation'), true);
    assert.equal(isMarketingSafeDocumentCategory('Registry'), false);
    assert.equal(isMarketingSafeDocumentCategory('Aadhaar'), false);
    assert.equal(isMarketingSafeDocumentCategory('Owner Documents'), false);
    assert.equal(normalizeMarketingDocumentCategory('  FLOOR   PLAN '), 'floor plan');
});

test('marketing approval policy limits parent entity types', () => {
    assert.equal(isMarketingEligibleEntityType('Project'), true);
    assert.equal(isMarketingEligibleEntityType('Inventory'), true);
    assert.equal(isMarketingEligibleEntityType('Deal'), true);
    assert.equal(isMarketingEligibleEntityType('Lead'), false);
    assert.equal(isMarketingEligibleEntityType('Contact'), false);
});

test('marketing approval policy requires an active, non-revoked, non-held current document', () => {
    const valid = { entityType: 'Project', state: 'ACTIVE', isRevoked: false, legalHold: false };
    assert.equal(isMarketingEligibleDocument(valid), true);
    assert.equal(isMarketingEligibleDocument({ ...valid, state: 'QUARANTINED' }), false);
    assert.equal(isMarketingEligibleDocument({ ...valid, isRevoked: true }), false);
    assert.equal(isMarketingEligibleDocument({ ...valid, legalHold: true }), false);
    assert.equal(isMarketingEligibleDocument({ ...valid, legacyMigrationState: 'LEGACY_UNRESOLVED' }), false);
    assert.equal(isMarketingEligibleDocument({ ...valid, entityType: 'Contact' }), false);
});

test('marketing approval policy enforces PDF MIME and bounded file size', () => {
    assert.equal(isMarketingEligiblePdfVersion({ mimeType: 'application/pdf', sizeBytes: 1024 }), true);
    assert.equal(isMarketingEligiblePdfVersion({ mimeType: 'image/png', sizeBytes: 1024 }), false);
    assert.equal(isMarketingEligiblePdfVersion({ mimeType: 'application/pdf', sizeBytes: MAX_MARKETING_PDF_BYTES + 1 }), false);
    assert.equal(isMarketingEligiblePdfVersion({ mimeType: 'application/pdf', sizeBytes: 0 }), false);
});

test('manual approval requires all explicit reviewer attestations', () => {
    assert.equal(isValidMarketingDocumentReviewAttestation({
        publicMarketingAsset: true,
        noSensitivePersonalData: true,
        rightsCleared: true
    }), true);
    assert.equal(isValidMarketingDocumentReviewAttestation({
        publicMarketingAsset: true,
        noSensitivePersonalData: false,
        rightsCleared: true
    }), false);
    assert.equal(isValidMarketingDocumentReviewAttestation({}), false);
    assert.equal(isValidMarketingDocumentReviewAttestation(null), false);
});
