/**
 * MarketingComplianceEnforcementService.js
 * 
 * Enterprise Backend Compliance Enforcement Service for Marketing OS & Social Publishing
 * 
 * Enforces server-side statutory compliance across all social publishing routes:
 * - Direct immediate social dispatch (Facebook, Instagram, LinkedIn, Twitter/X, Google Business, YouTube)
 * - Scheduled Outbox event generation (pre-dispatch validation)
 * - Worker execution-time revalidation (fencing against expired or revoked verification)
 * - Stored MarketingContent publishing (multi-channel syndication)
 * 
 * Strict Invariants:
 * - Never trust client-supplied verification facts, `isVerified`, or authority claims.
 * - Facts are extracted exclusively from authoritative canonical Deal, Inventory, or Project records.
 * - Missing or inaccessible entities fail closed (all claims treated as unverified).
 * - Enforces record-level RBAC & visibility (via getVisibilityFilter) so unauthorized users cannot access or leak records.
 * - Supports authorized internal system execution path (`user.isSystem === true`) for BullMQ background workers.
 * - Post-sanitization audit guarantees zero unsupported or prohibited claims reach providers.
 */

import mongoose from 'mongoose';
import '../models/Document.js';
import '../models/DocumentVersion.js';
import '../models/Deal.js';
import '../models/Project.js';
import '../models/Inventory.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    hasAuthoritativeBankApproval,
    hasAuthoritativeReadyPossession,
    extractVerificationFacts,
    validateAndSanitizeCopy,
    generateCompliantFallback
} from '../utils/propertyComplianceValidator.js';

class MarketingComplianceEnforcementService {
    /**
     * Resolves the canonical entity (Deal, Inventory, or Project) from the database
     * using the authorized identifier and enforces visibility/authorization checks.
     * 
     * @param {string|mongoose.Types.ObjectId} entityId - Entity identifier
     * @param {string} [entityType='deal'] - 'deal' | 'inventory' | 'project'
     * @param {Object} [user=null] - Authenticated user context (or { isSystem: true } for workers)
     * @returns {Promise<Object|null>} Canonical entity document (or null if missing/inaccessible)
     */
    async resolveAuthoritativeEntity(entityId, entityType = 'deal', user = null) {
        if (!entityId) return null;

        const idStr = String(entityId).trim();
        if (!mongoose.Types.ObjectId.isValid(idStr)) {
            return null;
        }

        const normType = String(entityType || 'deal').toLowerCase();

        try {
            let entity = null;
            const isSystemExecution = Boolean(user && user.isSystem === true);

            // Compute visibility filter unless executing as authorized internal system worker
            let visibilityFilter = {};
            if (!isSystemExecution) {
                // If user is null/undefined, getVisibilityFilter(null) safely locks down to { _id: null }
                visibilityFilter = await getVisibilityFilter(user);
            }

            const query = {
                _id: new mongoose.Types.ObjectId(idStr),
                ...visibilityFilter
            };

            if (normType === 'project') {
                const Project = mongoose.model('Project');
                entity = await Project.findOne(query).lean();
            } else if (normType === 'inventory') {
                const Inventory = mongoose.model('Inventory');
                entity = await Inventory.findOne(query).lean();
                if (entity?.projectId) {
                    const Project = mongoose.model('Project');
                    const projQuery = isSystemExecution 
                        ? { _id: entity.projectId } 
                        : { _id: entity.projectId, ...visibilityFilter };
                    const proj = await Project.findOne(projQuery).lean();
                    if (proj) {
                        entity.project = proj;
                    } else {
                        // Inaccessible linked project: reject linkage
                        entity.project = null;
                    }
                }
            } else {
                // Default: Deal
                const Deal = mongoose.model('Deal');
                entity = await Deal.findOne(query).lean();
                
                // If Deal has linked inventory, hydrate ONLY if user has visibility to it (Gate 6 RBAC)
                if (entity?.inventoryId) {
                    try {
                        const Inventory = mongoose.model('Inventory');
                        const invQuery = isSystemExecution
                            ? { _id: entity.inventoryId }
                            : { _id: entity.inventoryId, ...visibilityFilter };
                        const inv = await Inventory.findOne(invQuery).lean();
                        if (inv) {
                            entity.inventory = inv;
                        } else {
                            // Inaccessible linked inventory: reject linkage so it cannot contribute evidence
                            entity.inventory = null;
                        }
                    } catch (_) {
                        entity.inventory = null;
                    }
                }

                // If Deal has linked project, hydrate ONLY if user has visibility to it (Gate 6 RBAC)
                if (entity?.projectId) {
                    try {
                        const Project = mongoose.model('Project');
                        const projQuery = isSystemExecution
                            ? { _id: entity.projectId }
                            : { _id: entity.projectId, ...visibilityFilter };
                        const proj = await Project.findOne(projQuery).lean();
                        if (proj) {
                            entity.project = proj;
                        } else {
                            // Inaccessible linked project: reject linkage so it cannot contribute evidence
                            entity.project = null;
                        }
                    } catch (_) {
                        entity.project = null;
                    }
                }
            }

            if (!entity) return null;

            // Authorization / tenant verification check (defense-in-depth)
            if (user && user.tenantId && entity.tenantId) {
                if (String(user.tenantId) !== String(entity.tenantId)) {
                    console.warn(`[ComplianceEnforcement] Tenant mismatch: user=${user.tenantId}, entity=${entity.tenantId}`);
                    return null; // Deny access
                }
            }

            // Resolve and validate authentic CRM evidence records (Document, DocumentVersion, Snapshot)
            await this.resolveAuthoritativeEvidence(entity, user);

            return entity;
        } catch (err) {
            console.error(`[ComplianceEnforcement] Failed to resolve canonical entity ${entityId}:`, err.message);
            return null; // Fail closed
        }
    }

    /**
     * Resolves and validates referenced CRM Document and DocumentVersion records from MongoDB.
     * Prevents client-supplied or synthesized document IDs/hashes from bypassing evidence verification.
     * 
     * @param {Object} entity - Resolved Deal, Inventory, or Project record
     * @param {Object} [user=null] - User context
     */
    async resolveAuthoritativeEvidence(entity, user = null) {
        if (!entity || typeof entity !== 'object') return;
        if (mongoose.connection?.readyState !== 1) return;

        try {
            const Document = mongoose.model('Document');
            const DocumentVersion = mongoose.model('DocumentVersion');

            // Helper to resolve and validate a single candidate document
            const resolveSingleDoc = async (docCandidate) => {
                if (!docCandidate || typeof docCandidate !== 'object') return;
                const docId = docCandidate.documentId || docCandidate.crmDocumentId;
                if (!docId || typeof docId !== 'string') return;

                const docRecord = await Document.findOne({
                    documentId: String(docId).trim(),
                    isDeleted: false
                }).lean();

                if (!docRecord) {
                    // Document does not exist in CRM repository
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Verify lifecycle state
                if (docRecord.state !== 'ACTIVE') {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Verify entity ownership: must be linked to this entity or its linked project/inventory
                const entityIdStr = String(entity._id || entity.id || '');
                const projIdStr = String(entity.projectId?._id || entity.projectId || '');
                const invIdStr = String(entity.inventoryId?._id || entity.inventoryId || '');
                const docEntityIdStr = String(docRecord.entityId?._id || docRecord.entityId || '');

                const isLinked = docEntityIdStr === entityIdStr || (projIdStr && docEntityIdStr === projIdStr) || (invIdStr && docEntityIdStr === invIdStr);
                if (!isLinked) {
                    // Document belongs to a different entity!
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Verify current document version
                if (!docRecord.currentVersionId) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                const versionRecord = await DocumentVersion.findById(docRecord.currentVersionId).lean();
                if (!versionRecord || !versionRecord.checksum) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Successfully verified authentic CRM document record
                docCandidate.documentRecord = {
                    ...docRecord,
                    currentVersion: versionRecord
                };
                docCandidate._isVerifiedRecord = true;
            };

            // 1. Resolve Bank Approval candidate documents
            if (entity.bankApproval) await resolveSingleDoc(entity.bankApproval);
            if (Array.isArray(entity.bankApprovals)) {
                for (const b of entity.bankApprovals) await resolveSingleDoc(b);
            }
            if (entity.project?.bankApproval) await resolveSingleDoc(entity.project.bankApproval);
            if (Array.isArray(entity.project?.bankApprovals)) {
                for (const b of entity.project.bankApprovals) await resolveSingleDoc(b);
            }

            // 2. Resolve Possession (OC/CC) candidate documents
            if (entity.occupancyCertificate) await resolveSingleDoc(entity.occupancyCertificate);
            if (entity.completionCertificate) await resolveSingleDoc(entity.completionCertificate);
            if (entity.project?.occupancyCertificate) await resolveSingleDoc(entity.project.occupancyCertificate);
            if (entity.project?.completionCertificate) await resolveSingleDoc(entity.project.completionCertificate);

            // 3. Resolve Approvals array documents
            if (Array.isArray(entity.approvals)) {
                for (const a of entity.approvals) await resolveSingleDoc(a);
            }
            if (Array.isArray(entity.project?.approvals)) {
                for (const a of entity.project.approvals) await resolveSingleDoc(a);
            }

            // 4. Resolve RERA Snapshots if PropertyVerificationSnapshot model exists
            const snapshotId = entity.reraVerificationSnapshotId || entity.verificationSnapshotId || entity.authorityVerification?.verificationSnapshotId;
            if (snapshotId && mongoose.modelNames().includes('PropertyVerificationSnapshot')) {
                const PropertyVerificationSnapshot = mongoose.model('PropertyVerificationSnapshot');
                if (mongoose.Types.ObjectId.isValid(String(snapshotId))) {
                    const snapDoc = await PropertyVerificationSnapshot.findById(snapshotId).lean();
                    if (snapDoc) {
                        entity._resolvedSnapshot = snapDoc;
                        if (entity.authorityVerification) entity.authorityVerification.snapshotRecord = snapDoc;
                    }
                }
            }
        } catch (err) {
            console.warn('[ComplianceEnforcement] Evidence resolution non-fatal warning:', err.message);
        }
    }

    /**
     * Extracts verification facts exclusively from a resolved canonical record.
     * Never trusts client-supplied facts or boolean flags.
     * If entity is null or unresolvable, returns an all-unverified facts object.
     * 
     * @param {Object|null} canonicalEntity - Resolved database entity record
     * @returns {Object} Authoritative verification facts
     */
    extractAuthoritativeFacts(canonicalEntity) {
        if (!canonicalEntity || typeof canonicalEntity !== 'object') {
            return {
                isTitleVerified: false,
                isReraApproved: false,
                isBankApproved: false,
                isBankLoanApproved: false,
                isReadyPossession: false,
                authorityCode: null,
                titleEvidenceCode: null,
                reraNumber: null
            };
        }

        return extractVerificationFacts(canonicalEntity);
    }

    /**
     * Enforces statutory compliance on copy before immediate social dispatch or Outbox creation.
     * 
     * @param {string} rawText - Unsanitized copy from request or content store
     * @param {Object|null} canonicalEntity - Authoritative entity from database
     * @param {string} [platform='facebook'] - Target social platform
     * @param {Object} [context={}] - Additional context (format, tone, options)
     * @returns {{ sanitizedText: string, facts: Object, entityResolved: boolean }}
     */
    enforceCompliance(rawText, canonicalEntity, platform = 'facebook', context = {}) {
        const facts = this.extractAuthoritativeFacts(canonicalEntity);
        const entityResolved = Boolean(canonicalEntity);

        const sanitizedText = validateAndSanitizeCopy(
            rawText,
            facts,
            {
                ...context,
                deal: canonicalEntity || {},
                platform: platform?.toLowerCase() || 'facebook'
            }
        );

        return {
            sanitizedText,
            facts,
            entityResolved
        };
    }

    /**
     * Execution-time revalidation for scheduled posts in workers.
     * Resolves the latest canonical record from the database to fence against
     * verification expiry or revocation between schedule time and execution time.
     * 
     * @param {Object} jobData - { platform, text, imageUrl, format, entityId, entityType }
     * @returns {Promise<{ sanitizedText: string, facts: Object, canonicalEntity: Object|null }>}
     */
    async revalidateScheduledPost(jobData) {
        const { entityId, entityType, text, platform, format } = jobData;

        // Fetch fresh canonical record from database at time of worker execution via authorized system execution path
        const canonicalEntity = await this.resolveAuthoritativeEntity(entityId, entityType, { isSystem: true });

        // Re-extract authoritative facts and sanitize copy against latest status
        const { sanitizedText, facts } = this.enforceCompliance(
            text,
            canonicalEntity,
            platform,
            { format }
        );

        return {
            sanitizedText,
            facts,
            canonicalEntity
        };
    }
}

export const marketingComplianceEnforcementService = new MarketingComplianceEnforcementService();
export default marketingComplianceEnforcementService;
