import mongoose from 'mongoose';
import { Worker } from 'node:worker_threads';
import { Buffer } from 'node:buffer';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import Lookup from '../../models/Lookup.js';
import MarketingDocumentApproval from '../../models/MarketingDocumentApproval.js';
import { getVisibilityFilter } from '../../utils/visibility.js';
import { getService as getDocumentStorageService } from '../storage/index.js';
import {
    MAX_MARKETING_PDF_BYTES,
    MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION,
    isMarketingEligibleDocument,
    isMarketingEligiblePdfVersion,
    isMarketingSafeDocumentCategory
} from './MarketingDocumentApprovalPolicy.js';

const MAX_PDF_PAGES = 25;
const PDF_PARSE_TIMEOUT_MS = 8000;
const MAX_CONTEXT_CHARS = 12000;

export class MarketingDocumentContextError extends Error {
    constructor(code, statusCode = 422) {
        super(code);
        this.name = 'MarketingDocumentContextError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

export const collectBounded = async (stream, limit) => {
    if (Buffer.isBuffer(stream) || stream instanceof Uint8Array) {
        const buffer = Buffer.from(stream);
        if (buffer.length > limit) throw new MarketingDocumentContextError('PDF_SIZE_LIMIT_EXCEEDED', 413);
        return buffer;
    }
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new MarketingDocumentContextError('PDF_STREAM_UNAVAILABLE', 422);
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        total += buffer.length;
        if (total > limit) {
            if (typeof stream.destroy === 'function') stream.destroy();
            throw new MarketingDocumentContextError('PDF_SIZE_LIMIT_EXCEEDED', 413);
        }
        chunks.push(buffer);
    }
    if (!total) throw new MarketingDocumentContextError('PDF_EMPTY', 422);
    return Buffer.concat(chunks, total);
};

const parseInIsolatedWorker = (pdfBytes) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./MarketingPdfExtractionWorker.js', import.meta.url), {
        workerData: { pdfBytes },
        resourceLimits: {
            maxOldGenerationSizeMb: 64,
            maxYoungGenerationSizeMb: 16,
            codeRangeSizeMb: 16,
            stackSizeMb: 4
        }
    });
    let settled = false;
    const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        if (error) reject(error);
        else resolve(result);
    };
    const timer = setTimeout(() => finish(new MarketingDocumentContextError('PDF_PARSE_TIMEOUT', 422)), PDF_PARSE_TIMEOUT_MS);
    worker.once('message', (message) => finish(null, message));
    worker.once('error', () => finish(new MarketingDocumentContextError('PDF_PARSE_FAILED', 422)));
    worker.once('exit', (code) => {
        if (code !== 0) finish(new MarketingDocumentContextError('PDF_PARSE_FAILED', 422));
    });
});

export const sanitizePublicText = (value) => String(value || '')
    .normalize('NFKC')
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[REDACTED_ID]')
    .replace(/\b[2-9][0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g, '[REDACTED_ID]')
    .replace(/\b\d{9,18}\b/g, '[REDACTED_NUMBER]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CONTEXT_CHARS);

export class MarketingDocumentContextService {
    constructor({ storageService = getDocumentStorageService() } = {}) {
        this.storageService = storageService;
    }

    async getApprovedPdfContext({ user, documentId, versionId }) {
        if (!user?._id || !mongoose.Types.ObjectId.isValid(String(user._id))) {
            throw new MarketingDocumentContextError('AUTHENTICATION_REQUIRED', 401);
        }
        if (typeof documentId !== 'string' || !documentId || typeof versionId !== 'string' || !versionId) {
            throw new MarketingDocumentContextError('INVALID_DOCUMENT_REFERENCE', 400);
        }

        // Normal model queries intentionally exclude soft-deleted documents.
        const document = await Document.findOne({ documentId }).lean();
        if (!document || !isMarketingEligibleDocument(document)) {
            throw new MarketingDocumentContextError('DOCUMENT_NOT_ELIGIBLE', 404);
        }
        if (!document.currentVersionId) {
            throw new MarketingDocumentContextError('DOCUMENT_VERSION_NOT_CURRENT', 409);
        }
        const version = await DocumentVersion.findOne({ _id: document.currentVersionId, documentId, versionId }).lean();
        if (!version || !isMarketingEligiblePdfVersion(version) || version.sizeBytes > MAX_MARKETING_PDF_BYTES) {
            throw new MarketingDocumentContextError('DOCUMENT_VERSION_NOT_ELIGIBLE', 409);
        }

        const approval = await MarketingDocumentApproval.findOne({
            documentRef: document._id,
            documentId,
            versionRef: version._id,
            versionId,
            entityType: document.entityType,
            status: 'APPROVED',
            policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
        }).lean();
        if (!approval || !approval.reviewAttestation?.publicMarketingAsset ||
            !approval.reviewAttestation?.noSensitivePersonalData || !approval.reviewAttestation?.rightsCleared) {
            throw new MarketingDocumentContextError('ACTIVE_MARKETING_APPROVAL_REQUIRED', 403);
        }

        const category = await Lookup.findOne({
            _id: approval.categoryLookupId,
            lookup_type: { $in: ['Document-Category', 'DocumentCategory'] },
            isActive: true
        }).lean();
        if (!category || !isMarketingSafeDocumentCategory(category.lookup_value) ||
            category.lookup_value !== approval.categoryValue) {
            throw new MarketingDocumentContextError('DOCUMENT_CATEGORY_NOT_ELIGIBLE', 409);
        }

        const ParentModel = mongoose.models[document.entityType];
        if (!ParentModel) throw new MarketingDocumentContextError('DOCUMENT_PARENT_UNAVAILABLE', 409);
        const visibilityFilter = await getVisibilityFilter(user);
        const parent = await ParentModel.exists({ _id: document.entityId, ...visibilityFilter });
        if (!parent) throw new MarketingDocumentContextError('DOCUMENT_NOT_VISIBLE', 404);

        // Canonical storage ACL is re-evaluated immediately before content access.
        await this.storageService.accessService.authorizeAccess(user, documentId, 'READ', versionId);
        const stored = await this.storageService.readDocumentStream(user, documentId, versionId);
        if (String(stored.mimeType || '').toLowerCase() !== 'application/pdf') {
            throw new MarketingDocumentContextError('PDF_MIME_MISMATCH', 415);
        }
        const bytes = await collectBounded(stored.stream, MAX_MARKETING_PDF_BYTES);
        if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
            throw new MarketingDocumentContextError('PDF_MAGIC_BYTES_INVALID', 415);
        }

        const parsed = await parseInIsolatedWorker(bytes);
        if (!parsed?.ok) {
            throw new MarketingDocumentContextError(parsed?.code || 'PDF_PARSE_FAILED', 422);
        }
        if (!Number.isInteger(parsed.pageCount) || parsed.pageCount < 1 || parsed.pageCount > MAX_PDF_PAGES) {
            throw new MarketingDocumentContextError('PDF_PAGE_POLICY_REJECTED', 422);
        }

        // Close the revoke/version race: approval and current-version binding must still hold after parsing.
        const [latestDocument, latestApproval, latestCategory] = await Promise.all([
            Document.findOne({ _id: document._id, documentId, currentVersionId: version._id }).lean(),
            MarketingDocumentApproval.findOne({
                _id: approval._id,
                documentRef: document._id,
                versionRef: version._id,
                status: 'APPROVED',
                policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
            }).lean(),
            Lookup.findOne({
                _id: approval.categoryLookupId,
                lookup_type: { $in: ['Document-Category', 'DocumentCategory'] },
                isActive: true
            }).lean()
        ]);
        if (!latestDocument || !isMarketingEligibleDocument(latestDocument) || !latestApproval) {
            throw new MarketingDocumentContextError('MARKETING_DOCUMENT_APPROVAL_REVOKED_OR_STALE', 409);
        }
        if (!latestCategory || !isMarketingSafeDocumentCategory(latestCategory.lookup_value) ||
            latestCategory.lookup_value !== approval.categoryValue) {
            throw new MarketingDocumentContextError('DOCUMENT_CATEGORY_NOT_ELIGIBLE', 409);
        }
        const latestParent = await ParentModel.exists({
            _id: latestDocument.entityId,
            ...visibilityFilter
        });
        if (!latestParent) {
            throw new MarketingDocumentContextError('DOCUMENT_NOT_VISIBLE', 404);
        }

        return Object.freeze({
            documentId,
            versionId,
            entityType: document.entityType,
            category: category.lookup_value,
            pageCount: parsed.pageCount,
            contextText: sanitizePublicText(parsed.text),
            policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
        });
    }
}

export default new MarketingDocumentContextService();
