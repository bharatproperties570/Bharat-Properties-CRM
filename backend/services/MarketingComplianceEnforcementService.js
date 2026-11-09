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
 * - Post-sanitization audit guarantees zero unsupported or prohibited claims reach providers.
 */

import mongoose from 'mongoose';
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
     * @param {Object} [user=null] - Authenticated user context
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

            if (normType === 'project') {
                const Project = mongoose.model('Project');
                entity = await Project.findById(idStr).lean();
            } else if (normType === 'inventory') {
                const Inventory = mongoose.model('Inventory');
                entity = await Inventory.findById(idStr).lean();
                if (entity?.projectId) {
                    const Project = mongoose.model('Project');
                    const proj = await Project.findById(entity.projectId).lean();
                    if (proj) entity.project = proj;
                }
            } else {
                // Default: Deal
                const Deal = mongoose.model('Deal');
                entity = await Deal.findById(idStr).lean();
                
                // If Deal has linked inventory, hydrate authority verification if not on Deal
                if (entity?.inventoryId) {
                    try {
                        const Inventory = mongoose.model('Inventory');
                        const inv = await Inventory.findById(entity.inventoryId).lean();
                        if (inv) entity.inventory = inv;
                    } catch (_) {}
                }

                // If Deal has linked project, hydrate project approvals if not on Deal
                if (entity?.projectId) {
                    try {
                        const Project = mongoose.model('Project');
                        const proj = await Project.findById(entity.projectId).lean();
                        if (proj) entity.project = proj;
                    } catch (_) {}
                }
            }

            if (!entity) return null;

            // Authorization / tenant verification check
            if (user && user.tenantId && entity.tenantId) {
                if (String(user.tenantId) !== String(entity.tenantId)) {
                    console.warn(`[ComplianceEnforcement] Tenant mismatch: user=${user.tenantId}, entity=${entity.tenantId}`);
                    return null; // Deny access
                }
            }

            return entity;
        } catch (err) {
            console.error(`[ComplianceEnforcement] Failed to resolve canonical entity ${entityId}:`, err.message);
            return null; // Fail closed
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

        // Fetch fresh canonical record from database at time of worker execution
        const canonicalEntity = await this.resolveAuthoritativeEntity(entityId, entityType);

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
