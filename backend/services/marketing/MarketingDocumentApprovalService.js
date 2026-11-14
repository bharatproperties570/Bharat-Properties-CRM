import mongoose from 'mongoose';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import Lookup from '../../models/Lookup.js';
import MarketingDocumentApproval from '../../models/MarketingDocumentApproval.js';
import AuditLog from '../../models/AuditLog.js';
import { hasApprovalRight } from '../permission.service.js';
import { withMongoTransaction } from '../../utils/withMongoTransaction.js';
import { getService as getDocumentStorageService } from '../storage/index.js';
import {
    MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION,
    isMarketingEligibleDocument,
    isMarketingEligiblePdfVersion,
    isMarketingSafeDocumentCategory,
    normalizeMarketingDocumentCategory
} from './MarketingDocumentApprovalPolicy.js';

const approvalRight = 'marketingDocumentUse';

class MarketingDocumentApprovalError extends Error {
    constructor(code, statusCode = 400) {
        super(code);
        this.name = 'MarketingDocumentApprovalError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const resolveCategoryLookup = async (document, session = null) => {
    const raw = document?.metadata?.documentCategory;
    const rawId = raw && typeof raw === 'object' ? (raw._id || raw.id) : raw;
    const rawValue = raw && typeof raw === 'object'
        ? (raw.lookup_value || raw.value || raw.label)
        : raw;
    const query = { lookup_type: { $in: ['Document-Category', 'DocumentCategory'] }, isActive: true };
    if (rawId && mongoose.Types.ObjectId.isValid(String(rawId))) {
        query._id = rawId;
    } else if (rawValue && !mongoose.Types.ObjectId.isValid(String(rawValue))) {
        const escaped = String(rawValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.lookup_value = new RegExp('^' + escaped + '$', 'i');
    } else {
        return null;
    }
    let lookupQuery = Lookup.findOne(query);
    if (session) lookupQuery = lookupQuery.session(session);
    const lookup = await lookupQuery.lean();
    if (!lookup || !isMarketingSafeDocumentCategory(lookup.lookup_value)) return null;
    return lookup;
};

export class MarketingDocumentApprovalService {
    constructor({ storageService = getDocumentStorageService() } = {}) {
        this.storageService = storageService;
    }

    async _authorizeReviewer(user) {
        if (!user?._id || !mongoose.Types.ObjectId.isValid(String(user._id))) {
            throw new MarketingDocumentApprovalError('AUTHENTICATION_REQUIRED', 401);
        }
        const allowed = await hasApprovalRight(user, approvalRight, { skipCache: true });
        if (allowed !== true) {
            throw new MarketingDocumentApprovalError('MARKETING_DOCUMENT_APPROVAL_FORBIDDEN', 403);
        }
    }

    async _resolveCurrentEligibleDocument(user, documentId) {
        if (!documentId || typeof documentId !== 'string') {
            throw new MarketingDocumentApprovalError('INVALID_DOCUMENT_ID', 400);
        }
        const document = await Document.findOne({ documentId }).lean();
        if (!document) throw new MarketingDocumentApprovalError('DOCUMENT_NOT_FOUND', 404);
        if (!isMarketingEligibleDocument(document)) {
            throw new MarketingDocumentApprovalError('DOCUMENT_NOT_ELIGIBLE', 409);
        }
        if (!document.currentVersionId) {
            throw new MarketingDocumentApprovalError('DOCUMENT_VERSION_MISSING', 409);
        }

        const version = await DocumentVersion.findById(document.currentVersionId).lean();
        if (!version || String(version.documentId) !== String(document.documentId)) {
            throw new MarketingDocumentApprovalError('DOCUMENT_VERSION_MISMATCH', 409);
        }
        if (!isMarketingEligiblePdfVersion(version)) {
            throw new MarketingDocumentApprovalError('PDF_POLICY_REJECTED', 415);
        }

        // Reuse the canonical storage ACL and lifecycle boundary; never instantiate an unconfigured registry.
        await this.storageService.readDocumentStream(user, document.documentId, version.versionId).then(stream => {
            if (stream && typeof stream.destroy === 'function') stream.destroy();
        });
        return { document, version };
    }

    async approve({ user, documentId }) {
        await this._authorizeReviewer(user);
        const { document, version } = await this._resolveCurrentEligibleDocument(user, documentId);
        const lookup = await resolveCategoryLookup(document);
        if (!lookup) throw new MarketingDocumentApprovalError('DOCUMENT_CATEGORY_NOT_MARKETING_SAFE', 422);

        const approvedAt = new Date();
        return withMongoTransaction(async (session) => {
            const current = await Document.findById(document._id).session(session).lean();
            if (!isMarketingEligibleDocument(current) ||
                String(current.currentVersionId) !== String(version._id)) {
                throw new MarketingDocumentApprovalError('DOCUMENT_CHANGED_DURING_APPROVAL', 409);
            }
            const currentLookup = await resolveCategoryLookup(current, session);
            if (!currentLookup || String(currentLookup._id) !== String(lookup._id)) {
                throw new MarketingDocumentApprovalError('DOCUMENT_CATEGORY_CHANGED', 409);
            }
            const currentVersion = await DocumentVersion.findById(version._id).session(session).lean();
            if (!isMarketingEligiblePdfVersion(currentVersion) ||
                String(currentVersion.documentId) !== String(current.documentId)) {
                throw new MarketingDocumentApprovalError('PDF_POLICY_REJECTED', 415);
            }

            const approval = await MarketingDocumentApproval.findOneAndUpdate(
                { documentRef: current._id, versionRef: currentVersion._id },
                {
                    $set: {
                        documentId: current.documentId,
                        versionId: currentVersion.versionId,
                        entityType: current.entityType,
                        categoryLookupId: currentLookup._id,
                        categoryValue: currentLookup.lookup_value,
                        status: 'APPROVED',
                        approvedBy: user._id,
                        approvedAt,
                        revokedBy: null,
                        revokedAt: null,
                        policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
                    }
                },
                { new: true, upsert: true, runValidators: true, session }
            );

            await AuditLog.create([{
                eventType: 'marketing_document_approval_granted',
                userId: user._id,
                actorId: user._id,
                targetType: 'other',
                targetId: current._id,
                description: 'Marketing-safe document approval granted',
                metadata: {
                    documentId: current.documentId,
                    versionId: currentVersion.versionId,
                    entityType: current.entityType,
                    category: currentLookup.lookup_value,
                    policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
                },
                status: 'success',
                timestamp: approvedAt
            }], { session });

            return {
                documentId: current.documentId,
                versionId: currentVersion.versionId,
                status: approval.status,
                approvedAt: approval.approvedAt,
                policyVersion: approval.policyVersion
            };
        });
    }

    async revoke({ user, documentId }) {
        await this._authorizeReviewer(user);
        const { document, version } = await this._resolveCurrentEligibleDocument(user, documentId);
        const revokedAt = new Date();

        return withMongoTransaction(async (session) => {
            const current = await Document.findById(document._id).session(session).lean();
            if (!current || String(current.currentVersionId) !== String(version._id)) {
                throw new MarketingDocumentApprovalError('DOCUMENT_CHANGED_DURING_REVOCATION', 409);
            }
            const approval = await MarketingDocumentApproval.findOne({
                documentRef: current._id,
                versionRef: version._id,
                status: 'APPROVED'
            }).session(session);
            if (!approval) throw new MarketingDocumentApprovalError('ACTIVE_APPROVAL_NOT_FOUND', 404);

            approval.status = 'REVOKED';
            approval.revokedBy = user._id;
            approval.revokedAt = revokedAt;
            await approval.save({ session });

            await AuditLog.create([{
                eventType: 'marketing_document_approval_revoked',
                userId: user._id,
                actorId: user._id,
                targetType: 'other',
                targetId: current._id,
                description: 'Marketing-safe document approval revoked',
                metadata: {
                    documentId: current.documentId,
                    versionId: version.versionId,
                    policyVersion: MARKETING_DOCUMENT_APPROVAL_POLICY_VERSION
                },
                status: 'success',
                timestamp: revokedAt
            }], { session });

            return {
                documentId: current.documentId,
                versionId: version.versionId,
                status: approval.status,
                revokedAt
            };
        });
    }
}

export default new MarketingDocumentApprovalService();
