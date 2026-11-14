export const MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION = 'marketing-document-v1';
export const MAX_MARKETING_PDF_BYTES = 8 * 1024 * 1024;

export const MARKETING_SAFE_DOCUMENT_CATEGORIES = Object.freeze([
    'project brochure',
    'floor plan',
    'project presentation'
]);

export const MARKETING_ALLOWED_ENTITY_TYPES = Object.freeze(['Deal', 'Inventory', 'Project']);

export const normalizeMarketingDocumentCategory = (value) =>
    String(value || '').normalize('NFKC').trim().replace(/\\s+/g, ' ').toLowerCase();

export const isMarketingSafeDocumentCategory = (value) =>
    MARKETING_SAFE_DOCUMENT_CATEGORIES.includes(normalizeMarketingDocumentCategory(value));

export const isMarketingEligibleEntityType = (value) =>
    MARKETING_ALLOWED_ENTITY_TYPES.includes(String(value || '').trim());

export const isMarketingEligiblePdfVersion = (version) =>
    Boolean(
        version &&
        String(version.mimeType || '').toLowerCase() === 'application/pdf' &&
        Number.isSafeInteger(Number(version.sizeBytes)) &&
        Number(version.sizeBytes) > 0 &&
        Number(version.sizeBytes) <= MAX_MARKETING_PDF_BYTES
    );

export const isMarketingEligibleDocument = (document, now = new Date()) => {
    if (!document || !isMarketingEligibleEntityType(document.entityType)) return false;
    if (document.state !== 'ACTIVE') return false;
    if (document.isRevoked === true || document.isDeleted === true || document.deletedAt) return false;
    if (document.legalHold === true) return false;
    if (document.retentionUntil && new Date(document.retentionUntil) <= now) return false;
    if (document.legacyMigrationState && document.legacyMigrationState !== 'MIGRATED') return false;
    return true;
};
