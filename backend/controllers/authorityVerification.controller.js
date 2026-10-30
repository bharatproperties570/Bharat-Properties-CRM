/**
 * Authority Verification Controller
 * 
 * Phase 2 Foundation — inactive backend only.
 * No live HTTP requests to authority portals.
 * All sources default to DISABLED.
 */

import mongoose from 'mongoose';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS,
    CRM_TO_CANONICAL_FIELD_MAP
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import { buildCompositeKey, computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';
import { isSentinel } from '../services/authority/authorityFieldDictionary.js';
import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';

// ============================================================
// HELPERS
// ============================================================

function getTenantId(req) {
    // tenantId from authenticated user context
    return req.user?.tenantId || req.user?._id?.toString() || null;
}

function auditEvent(eventType, userId, targetType, targetId, description, metadata = {}, options = {}) {
    return AuditLog.logEntityUpdate(
        eventType,
        targetType,
        targetId,
        null,
        userId,
        metadata,
        description,
        options
    );
}

// ============================================================
// SOURCE SETTINGS
// ============================================================

/**
 * GET /api/authority/settings
 * List all authority source settings for current tenant.
 * Permission: authorityVerification.view
 */
export const getSourceSettings = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        // Ensure defaults exist
        await AuthoritySourceSettings.ensureDefaults(tenantId);
        const settings = await AuthoritySourceSettings.getAllForTenant(tenantId);

        // Include activation eligibility for each
        const result = settings.map(s => ({
            ...s.toObject(),
            activationCheck: s.checkActivationEligibility(),
            effectivelyActive: s.isEffectivelyActive()
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('getSourceSettings error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve source settings' });
    }
};

/**
 * GET /api/authority/settings/:authorityCode
 * Get settings for a specific authority.
 * Permission: authorityVerification.view
 */
export const getSourceSettingByCode = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        await AuthoritySourceSettings.ensureDefaults(tenantId);
        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);

        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        res.json({
            success: true,
            data: {
                ...setting.toObject(),
                activationCheck: setting.checkActivationEligibility(),
                effectivelyActive: setting.isEffectivelyActive()
            }
        });
    } catch (error) {
        console.error('getSourceSettingByCode error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve source setting' });
    }
};

/**
 * PATCH /api/authority/settings/:authorityCode
 * Update source policy settings.
 * Permission: authorityVerification admin (approvalRights.manageAuthoritySettings)
 * 
 * The frontend CANNOT:
 * - Set permissionStatus to GRANTED without approval evidence
 * - Enable a source that fails activation checks
 * - Supply arbitrary field names
 */
export const updateSourceSettings = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        // Server-side allowlist of updatable fields
        const ALLOWED_SETTINGS_FIELDS = new Set([
            'permissionStatus', 'policyVersion', 'approvedAccessMethod',
            'permittedFields', 'approvalReference', 'approvalDate',
            'approvalExpiryDate', 'reviewStatus', 'ratePolicy',
            'isEnabled', 'isPaused', 'schedulingEnabled', 'scheduleCron',
            'identityRequirements'
        ]);

        const changes = {};
        const before = {};

        for (const [key, value] of Object.entries(req.body)) {
            if (ALLOWED_SETTINGS_FIELDS.has(key)) {
                before[key] = setting[key];
                changes[key] = value;
            }
            // Silently ignore unknown/disallowed fields
        }

        if (Object.keys(changes).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        // Phase 3 Server-Side Activation Lock:
        // Sources remain strictly offline and fixture-only. Live authority activation,
        // approval granting, and scheduling are prohibited until a future phase authorizes live integration.
        const activationBlockers = [];
        if (changes.isEnabled === true) {
            activationBlockers.push('isEnabled cannot be set to true: live authority fetching is prohibited in Phase 3');
        }
        if (changes.schedulingEnabled === true) {
            activationBlockers.push('schedulingEnabled cannot be set to true: background authority scheduling is prohibited in Phase 3');
        }
        if (changes.reviewStatus === 'APPROVED') {
            activationBlockers.push('reviewStatus cannot be set to APPROVED via settings update: requires independent maker-checker review');
        }
        if (changes.permissionStatus === 'GRANTED') {
            activationBlockers.push('permissionStatus cannot be set to GRANTED: requires formal written authorization and MoU from authority');
        }

        if (activationBlockers.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'ACTIVATION_LOCKED_PHASE3',
                message: 'Source activation is locked: Live authority integrations and approvals are prohibited during Phase 3.',
                blockers: activationBlockers
            });
        }

        // If enabling, enforce activation gate
        if (changes.isEnabled === true) {
            // Apply other changes first to check eligibility
            Object.assign(setting, changes);
            const check = setting.checkActivationEligibility();
            if (!check.canActivate) {
                return res.status(422).json({
                    success: false,
                    message: 'Cannot enable source — activation requirements not met',
                    blockers: check.blockers
                });
            }
        }

        // If setting reviewStatus to APPROVED, record reviewer
        if (changes.reviewStatus === 'APPROVED') {
            setting.reviewedBy = req.user._id;
            setting.reviewedAt = new Date();
        }

        Object.assign(setting, changes);
        await setting.save();

        // Audit the change
        await auditEvent(
            'authority_settings_updated',
            req.user._id,
            'authority_settings',
            setting._id,
            `Authority source settings updated for ${authorityCode}`,
            { changes: { before, after: changes } }
        );

        res.json({
            success: true,
            data: {
                ...setting.toObject(),
                activationCheck: setting.checkActivationEligibility(),
                effectivelyActive: setting.isEffectivelyActive()
            }
        });
    } catch (error) {
        console.error('updateSourceSettings error:', error);
        res.status(500).json({ success: false, message: 'Failed to update source settings' });
    }
};

// ============================================================
// AUTHORITY LINKS
// ============================================================

/**
 * GET /api/authority/links/:inventoryId
 * Get all authority links for an inventory record.
 * Permission: authorityVerification.view + inventory visibility
 */
export const getLinksForInventory = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId } = req.params;

        // Verify inventory exists and tenant has access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id unitNo unitNumber').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        const links = await PropertyAuthorityLink.getForInventory(tenantId, inventoryId);
        res.json({ success: true, data: links });
    } catch (error) {
        console.error('getLinksForInventory error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve authority links' });
    }
};

/**
 * POST /api/authority/links
 * Create or update an authority link for an inventory.
 * Permission: authorityVerification.create
 */
export const createOrUpdateLink = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId, authorityCode, sectorNumber, phaseCode, blockCode,
            propertyId, schemeName, urbanEstate, fileNumber, formNumber } = req.body;

        if (!inventoryId || !authorityCode) {
            return res.status(400).json({ success: false, message: 'inventoryId and authorityCode required' });
        }
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        // Verify inventory exists and tenant has access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // Build composite key using Phase 1 contract
        const keyResult = buildCompositeKey(authorityCode, sectorNumber || null, propertyId || null, urbanEstate || null, phaseCode || null);

        const linkData = {
            tenantId,
            inventoryId,
            authorityCode,
            sectorNumber: sectorNumber || null,
            phaseCode: phaseCode || null,
            blockCode: blockCode || null,
            propertyId: propertyId || null,
            schemeName: schemeName || null,
            urbanEstate: urbanEstate || null,
            fileNumber: fileNumber || null,
            formNumber: formNumber || null,
            compositeKey: keyResult.status === 'COMPLETE' ? keyResult.key : null,
            matchEligibility: keyResult.status === 'COMPLETE' ? 'ELIGIBLE' :
                keyResult.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'INCOMPLETE',
            updatedBy: req.user._id
        };

        const link = await PropertyAuthorityLink.findOneAndUpdate(
            { tenantId, inventoryId, authorityCode },
            {
                $set: linkData,
                $setOnInsert: { createdBy: req.user._id }
            },
            { upsert: true, new: true, runValidators: true }
        );

        // Audit
        await auditEvent(
            'authority_link_created',
            req.user._id,
            'inventory',
            inventoryId,
            `Authority link ${link.isNew ? 'created' : 'updated'} for ${authorityCode}`,
            { authorityCode, compositeKey: linkData.compositeKey, matchEligibility: linkData.matchEligibility }
        );

        res.status(201).json({ success: true, data: link });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Link already exists for this inventory and authority' });
        }
        console.error('createOrUpdateLink error:', error);
        res.status(500).json({ success: false, message: 'Failed to create authority link' });
    }
};

// ============================================================
// VERIFICATION RUNS
// ============================================================

/**
 * POST /api/authority/runs
 * Create a new verification run (disabled state — no actual fetching).
 * Permission: authorityVerification.create
 */
export const createVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode, runMode = 'SINGLE', inventoryIds, isFixtureMode = false, autoProcess = false } = req.body;

        if (!authorityCode || !runMode) {
            return res.status(400).json({ success: false, message: 'authorityCode and runMode required' });
        }
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }
        if (!['SINGLE', 'BULK_MANUAL', 'BULK_SCHEDULED'].includes(runMode)) {
            return res.status(400).json({ success: false, message: 'Only SINGLE, BULK_MANUAL, and BULK_SCHEDULED modes supported' });
        }

        const ids = Array.isArray(inventoryIds) ? inventoryIds : (inventoryIds ? [inventoryIds] : []);

        // Use bounded bulk creation service (eliminating serial lookups, preserving tenant isolation)
        const run = await AuthorityBulkProcessor.createBulkRun({
            tenantId,
            authorityCode,
            requestedBy: req.user._id,
            inventoryIds: ids,
            runMode,
            isFixtureMode: Boolean(isFixtureMode)
        });

        if (run.status === 'POLICY_REJECTED') {
            await auditEvent(
                'authority_run_policy_rejected',
                req.user._id,
                'authority_run',
                run._id,
                `Verification run POLICY_REJECTED for ${authorityCode}: source not activated`,
                { runId: run._id, authorityCode, blockers: run.policyRejectionReasons }
            );

            return res.status(422).json({
                success: false,
                message: 'Verification source is not activated',
                data: run.toSummary ? run.toSummary() : run,
                blockers: run.policyRejectionReasons || ['Source is not effectively active (disabled or paused)']
            });
        }

        await auditEvent(
            'authority_run_created',
            req.user._id,
            'authority_run',
            run._id,
            `Verification run created for ${authorityCode} (${runMode})`,
            { runId: run._id, authorityCode, runMode, totalItems: run.totalItems, isFixtureMode: run.isFixtureMode }
        );

        if (autoProcess) {
            AuthorityBulkProcessor.processRun(run._id, {
                tenantId,
                isFixtureMode: Boolean(isFixtureMode)
            }).catch(err => console.error('[AutoProcess] Run error:', err));
        }

        res.status(201).json({ success: true, data: run.toSummary ? run.toSummary() : run });
    } catch (error) {
        console.error('createVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create verification run' });
    }
};

/**
 * GET /api/authority/runs
 * List recent verification runs for current tenant.
 * Permission: authorityVerification.view
 */
export const getVerificationRuns = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const runs = await PropertyVerificationRun.getRecentForTenant(tenantId, limit);

        res.json({ success: true, data: runs.map(r => r.toSummary()) });
    } catch (error) {
        console.error('getVerificationRuns error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification runs' });
    }
};

/**
 * GET /api/authority/runs/:runId
 * Get a single run with its items.
 * Permission: authorityVerification.view
 */
export const getVerificationRunById = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId })
            .populate('requestedBy', 'fullName email');
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        const items = await PropertyVerificationRunItem.getForRun(tenantId, runId);

        res.json({ success: true, data: { run: run.toSummary(), items } });
    } catch (error) {
        console.error('getVerificationRunById error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/process
 * Execute or advance a verification run in bounded batches.
 * Permission: authorityVerification.create or edit
 */
export const processVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { batchSize = 50, isFixtureMode } = req.body;

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        // Derive mode strictly from stored run; reject mode mismatch if provided
        if (isFixtureMode !== undefined && Boolean(isFixtureMode) !== Boolean(run.isFixtureMode)) {
            return res.status(422).json({
                success: false,
                code: 'MODE_MISMATCH',
                message: 'Mode mismatch: requested isFixtureMode does not match persisted run configuration'
            });
        }

        const outcome = await AuthorityBulkProcessor.processRun(runId, {
            tenantId,
            batchSize: Number(batchSize) || 50,
            isFixtureMode: Boolean(run.isFixtureMode),
            userId: req.user._id
        });

        res.json({ success: true, data: outcome });
    } catch (error) {
        console.error('processVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to process verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/pause
 * Pause an active verification run.
 * Permission: authorityVerification.edit
 */
export const pauseVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { reason = 'Paused by user' } = req.body;
        const run = await AuthorityBulkProcessor.pauseRun(runId, tenantId, req.user._id, reason);

        res.json({ success: true, data: run.toSummary() });
    } catch (error) {
        console.error('pauseVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to pause verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/resume
 * Resume an interrupted or paused verification run.
 * Permission: authorityVerification.edit
 */
export const resumeVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { isFixtureMode } = req.body;

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        // Derive mode strictly from stored run; reject mode mismatch if provided
        if (isFixtureMode !== undefined && Boolean(isFixtureMode) !== Boolean(run.isFixtureMode)) {
            return res.status(422).json({
                success: false,
                code: 'MODE_MISMATCH',
                message: 'Mode mismatch: requested isFixtureMode does not match persisted run configuration'
            });
        }

        const outcome = await AuthorityBulkProcessor.resumeRun(runId, tenantId, {
            isFixtureMode: Boolean(run.isFixtureMode),
            userId: req.user._id
        });

        res.json({ success: true, data: outcome });
    } catch (error) {
        console.error('resumeVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to resume verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/cancel
 * Cancel a verification run.
 * Permission: authorityVerification.edit
 */
export const cancelVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { reason = 'Cancelled by user' } = req.body;

        const run = await AuthorityBulkProcessor.cancelRun(runId, tenantId, req.user._id, reason);

        res.json({ success: true, data: run.toSummary() });
    } catch (error) {
        console.error('cancelVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to cancel verification run' });
    }
};

/**
 * GET /api/authority/runs/:runId/progress
 * Get progress status for a verification run.
 * Permission: authorityVerification.view
 */
export const getRunProgress = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const progress = await AuthorityBulkProcessor.getRunProgress(runId, tenantId);

        res.json({ success: true, data: progress });
    } catch (error) {
        console.error('getRunProgress error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get run progress' });
    }
};


// ============================================================
// REVIEW & APPLY
// ============================================================

/**
 * GET /api/authority/review/pending
 * Get items pending review.
 * Permission: authorityVerification.edit (review capability)
 */
export const getPendingReviews = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const items = await PropertyVerificationRunItem.getPendingReview(tenantId);
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('getPendingReviews error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve pending reviews' });
    }
};

/**
 * POST /api/authority/review/:itemId
 * Submit a review decision for a run item.
 * Permission: authorityVerification.edit (review capability)
 */
export const submitReview = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { itemId } = req.params;
        const { decision, approvedFields, notes } = req.body;

        if (!['APPROVED', 'REJECTED', 'PARTIAL', 'DEFERRED'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Invalid decision' });
        }

        const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Verify inventory exists and belongs to tenant
        const inventory = await Inventory.findOne({ _id: item.inventoryId, tenantId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        if (item.reviewerDecision !== 'PENDING') {
            return res.status(409).json({ success: false, message: 'Item already reviewed' });
        }

        item.reviewerDecision = decision;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        item.reviewNotes = notes || null;

        // For PARTIAL approval, mark only specific fields as approved
        if (decision === 'PARTIAL' && Array.isArray(approvedFields)) {
            for (const change of item.proposedChanges) {
                change.approved = approvedFields.includes(change.field);
            }
        } else if (decision === 'APPROVED') {
            for (const change of item.proposedChanges) {
                change.approved = true;
            }
        } else if (decision === 'REJECTED') {
            for (const change of item.proposedChanges) {
                change.approved = false;
            }
        }

        await item.save();

        await auditEvent(
            'authority_review_submitted',
            req.user._id,
            'inventory',
            item.inventoryId,
            `Authority verification review: ${decision}`,
            { itemId, decision, authorityCode: item.authorityCode, runId: item.runId }
        );

        res.json({ success: true, data: item });
    } catch (error) {
        console.error('submitReview error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
};

// ============================================================
// SAGA COMPENSATION & FENCING HELPERS (Phase 4.2)
// ============================================================

/**
 * Durably compensates an interrupted or failed apply saga (standalone MongoDB fallback).
 * Restores Inventory to pre-apply values (matching claimId), records durable compensation audit,
 * and records FAILED/COMPENSATED or COMPENSATION_FAILED state on PropertyVerificationRunItem.
 */
export const compensateApplySaga = async ({
    itemId,
    tenantId,
    inventoryId,
    claimId,
    stage,
    compensation,
    errorMsg,
    appliedBy = null,
    session = null
}) => {
    let inventoryRevertError = null;
    let auditCompensationError = null;

    // 1. Revert Inventory mutation if stage indicates possible or confirmed mutation
    if (stage && ['INVENTORY_MUTATING', 'INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(stage)) {
        if (compensation?.inventoryBefore && typeof compensation.inventoryBefore === 'object') {
            try {
                // Check whether Inventory was actually tagged/mutated with this claimId
                const mutatedDoc = await Inventory.findOne({
                    _id: inventoryId,
                    tenantId,
                    'authorityVerification.applyClaimId': claimId
                });

                if (mutatedDoc) {
                    const revertOps = {};
                    for (const [key, val] of Object.entries(compensation.inventoryBefore)) {
                        revertOps[key] = (val === undefined || val === null) ? null : val;
                    }
                    revertOps['authorityVerification.applyClaimId'] = null;

                    const invRes = await Inventory.updateOne(
                        {
                            _id: inventoryId,
                            tenantId,
                            'authorityVerification.applyClaimId': claimId
                        },
                        { $set: revertOps },
                        session ? { session } : {}
                    );

                    if (invRes.matchedCount !== 1) {
                        throw new Error(`Inventory rollback failed: matchedCount was ${invRes.matchedCount}`);
                    }
                } else if (stage !== 'INVENTORY_MUTATING') {
                    // Stage indicated mutated, but document does not have this claimId.
                    // Verify if it is already reverted (idempotency check)
                    const existingInv = await Inventory.findOne({ _id: inventoryId, tenantId });
                    if (existingInv?.authorityVerification?.applyClaimId && String(existingInv.authorityVerification.applyClaimId) !== String(claimId)) {
                        console.warn(`[SagaCompensation] Inventory ${inventoryId} claimed by another claim ${existingInv.authorityVerification.applyClaimId}; skipping overwrite`);
                    }
                }
            } catch (invErr) {
                console.error(`[SagaCompensation] Error reverting inventory ${inventoryId}:`, invErr);
                inventoryRevertError = invErr;
            }
        }
    }

    // 2. Record durable compensation audit record (integrity over silent deletion)
    if (compensation?.auditId) {
        try {
            await auditEvent(
                'authority_changes_apply_compensated',
                appliedBy || null,
                'inventory',
                inventoryId,
                `Authority verification changes apply compensated for claim ${claimId}`,
                {
                    before: {
                        claimId: claimId ? claimId.toString() : null,
                        originalAuditId: compensation.auditId ? compensation.auditId.toString() : null,
                        stage,
                        revertedChanges: compensation.inventoryBefore
                    },
                    after: {
                        status: 'COMPENSATED',
                        applyState: 'FAILED',
                        revertedAt: new Date(),
                        error: errorMsg
                    }
                },
                session ? { session } : {}
            );

            // Update original audit record status to compensated
            try {
                await AuditLog.updateOne(
                    { _id: compensation.auditId },
                    {
                        $set: {
                            status: 'compensated',
                            'metadata.compensated': true,
                            'metadata.compensationClaimId': claimId ? claimId.toString() : null
                        }
                    },
                    session ? { session } : {}
                );
            } catch (origErr) {
                console.warn(`[SagaCompensation] Warning updating original audit ${compensation.auditId}:`, origErr);
            }
        } catch (auditErr) {
            console.error(`[SagaCompensation] Error recording compensation audit for item ${itemId}:`, auditErr);
            auditCompensationError = auditErr;
        }
    }

    // 3. Mark RunItem state: fail-closed if any compensation step failed
    if (inventoryRevertError || auditCompensationError) {
        const failureDetails = [
            inventoryRevertError ? `Inventory revert failed: ${inventoryRevertError.message}` : null,
            auditCompensationError ? `Audit compensation failed: ${auditCompensationError.message}` : null
        ].filter(Boolean).join('; ');

        try {
            await PropertyVerificationRunItem.updateOne(
                {
                    _id: itemId,
                    tenantId,
                    'applyClaim.claimId': claimId
                },
                {
                    $set: {
                        applyState: 'COMPENSATION_FAILED',
                        'applyClaim.stage': 'COMPENSATION_FAILED',
                        'applyClaim.leaseExpiresAt': null,
                        applyError: `Compensation failed: ${failureDetails}`
                    }
                },
                session ? { session } : {}
            );
        } catch (itemErr) {
            console.error(`[SagaCompensation] Error updating run item ${itemId} to COMPENSATION_FAILED:`, itemErr);
        }

        const compErr = new Error(`Compensation failed: ${failureDetails}`);
        compErr.code = 'COMPENSATION_FAILED';
        throw compErr;
    }

    try {
        const itemRes = await PropertyVerificationRunItem.updateOne(
            {
                _id: itemId,
                tenantId,
                'applyClaim.claimId': claimId
            },
            {
                $set: {
                    applyState: 'FAILED',
                    'applyClaim.stage': 'COMPENSATED',
                    'applyClaim.leaseExpiresAt': null,
                    applyError: errorMsg || 'Apply failed; saga compensated'
                }
            },
            session ? { session } : {}
        );
        if (itemRes.matchedCount !== 1) {
            console.warn(`[SagaCompensation] RunItem ${itemId} not updated during compensation: matchedCount was ${itemRes.matchedCount}`);
        }
    } catch (itemErr) {
        console.error(`[SagaCompensation] Error updating run item ${itemId}:`, itemErr);
        throw itemErr;
    }
};

/**
 * Reconciles an interrupted or stale apply claim whose lease has expired.
 * Atomically claims ownership of the expired saga, rolls back any partial Inventory mutation,
 * records durable compensation audit logs, and returns the item to a clean FAILED/COMPENSATED state.
 */
export const reconcileInterruptedApplySaga = async (itemId, tenantId) => {
    const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
    if (!item || item.applied || item.applyState === 'APPLIED') {
        return { reconciled: false, reason: 'ALREADY_COMPLETED' };
    }

    if (item.applyState === 'COMPENSATION_FAILED' || item.applyClaim?.stage === 'COMPENSATION_FAILED') {
        return { reconciled: false, reason: 'COMPENSATION_UNRESOLVED' };
    }

    const claim = item.applyClaim;
    const now = new Date();

    if (item.applyState !== 'APPLYING' || !claim?.leaseExpiresAt || claim.leaseExpiresAt >= now) {
        return { reconciled: false, reason: 'NOT_ELIGIBLE_OR_LEASE_ACTIVE' };
    }

    // Atomically reserve the expired saga for this reconciler (prevents concurrent double-reconciliation)
    const reconcilerClaimId = new mongoose.Types.ObjectId();
    const reconcilerExpiry = new Date(now.getTime() + 30000);

    const reservedItem = await PropertyVerificationRunItem.findOneAndUpdate(
        {
            _id: itemId,
            tenantId,
            applyState: 'APPLYING',
            'applyClaim.claimId': claim.claimId,
            'applyClaim.leaseExpiresAt': { $lt: now },
            'applyClaim.stage': { $ne: 'RECONCILING' }
        },
        {
            $set: {
                'applyClaim.stage': 'RECONCILING',
                'applyClaim.reconcilerClaimId': reconcilerClaimId,
                'applyClaim.leaseExpiresAt': reconcilerExpiry
            }
        },
        { new: true }
    );

    if (!reservedItem) {
        return { reconciled: false, reason: 'LOCKED_BY_ANOTHER_RECONCILER_OR_INELIGIBLE' };
    }

    const originalStage = claim.stage;
    let inventoryMutated = false;

    if (['INVENTORY_MUTATING', 'INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(originalStage)) {
        const inv = await Inventory.findOne({
            _id: reservedItem.inventoryId,
            tenantId,
            'authorityVerification.applyClaimId': claim.claimId
        });
        if (inv) {
            inventoryMutated = true;
        }
    }

    if (inventoryMutated || ['INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(originalStage)) {
        await compensateApplySaga({
            itemId: reservedItem._id,
            tenantId,
            inventoryId: reservedItem.inventoryId,
            claimId: claim.claimId,
            stage: originalStage,
            compensation: claim.compensation,
            errorMsg: 'Interrupted apply saga lease expired; compensated by reconciler'
        });
        return { reconciled: true, action: 'COMPENSATED' };
    } else {
        // Stage was CLAIMED or INVENTORY_MUTATING (where Inventory was never mutated)
        // Safely release the expired claim
        await PropertyVerificationRunItem.updateOne(
            { _id: reservedItem._id, tenantId, 'applyClaim.claimId': claim.claimId },
            {
                $set: {
                    applyState: 'FAILED',
                    'applyClaim.stage': 'COMPENSATED',
                    'applyClaim.leaseExpiresAt': null,
                    applyError: 'Lease expired before mutation stage; claim released'
                }
            }
        );
        return { reconciled: true, action: 'RELEASED' };
    }
};

/**
 * Renews the active lease on an in-progress apply claim.
 * Fails closed if the claim has expired, fenceToken mismatches, or was preempted by another worker.
 * Supports flexible signature:
 * - renewApplyClaimLease(itemId, tenantId, claimId, extensionMs)
 * - renewApplyClaimLease(itemId, tenantId, claimId, fenceToken, extensionMs)
 * - renewApplyClaimLease(itemId, tenantId, claimId, { fenceToken, extensionMs })
 */
export const renewApplyClaimLease = async (itemId, tenantId, claimId, fenceTokenOrExtension = null, extensionMs = 30000) => {
    let fenceToken = null;
    let extension = extensionMs;

    if (typeof fenceTokenOrExtension === 'number') {
        if (fenceTokenOrExtension >= 1000) {
            // Called as renewApplyClaimLease(itemId, tenantId, claimId, extensionMs)
            extension = fenceTokenOrExtension;
        } else {
            // Called as renewApplyClaimLease(itemId, tenantId, claimId, fenceToken, extensionMs)
            fenceToken = fenceTokenOrExtension;
        }
    } else if (typeof fenceTokenOrExtension === 'object' && fenceTokenOrExtension !== null) {
        fenceToken = fenceTokenOrExtension.fenceToken ?? null;
        extension = fenceTokenOrExtension.extensionMs ?? extensionMs;
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + extension);
    const filter = {
        _id: itemId,
        tenantId,
        'applyClaim.claimId': claimId,
        'applyClaim.leaseExpiresAt': { $gt: now },
        applyState: 'APPLYING'
    };
    if (fenceToken !== null && fenceToken !== undefined) {
        filter['applyClaim.fenceToken'] = fenceToken;
    }
    const updated = await PropertyVerificationRunItem.findOneAndUpdate(
        filter,
        {
            $set: {
                'applyClaim.leaseExpiresAt': newExpiry
            }
        },
        { new: true }
    );
    return updated;
};

/**
 * POST /api/authority/apply/:itemId
 * Apply approved changes to the Inventory record.
 * Permission: authorityVerification.edit (apply capability)
 * 
 * SAFETY:
 * - Only fields in the server-side ALLOWED_UPDATE_FIELDS set are applied
 * - BLOCKED_UPDATE_FIELDS (including Inventory.status) can NEVER be modified
 * - Each field must have been individually approved in the review
 * - Duplicate applications are prevented
 * - Every application creates a durable audit record
 */
export const applyApprovedChanges = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { itemId } = req.params;

        const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Verify inventory exists and belongs to tenant
        const inventory = await Inventory.findOne({ _id: item.inventoryId, tenantId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // 0. Fail-Closed Check: previous compensation failed and requires manual reconciliation
        if (item.applyState === 'COMPENSATION_FAILED' || item.applyClaim?.stage === 'COMPENSATION_FAILED') {
            return res.status(422).json({
                success: false,
                code: 'COMPENSATION_UNRESOLVED',
                message: 'Cannot apply changes: previous application compensation failed and requires manual reconciliation',
                error: item.applyError
            });
        }

        // 1. Synthetic Fixture Protection: reject immediately if item is marked synthetic
        if (
            item.isSynthetic === true ||
            item.provenance === 'SYNTHETIC_FIXTURE'
        ) {
            return res.status(422).json({
                success: false,
                code: 'SYNTHETIC_FIXTURE_BLOCKED',
                message: 'Cannot apply changes: synthetic fixture data is prohibited from modifying Inventory records'
            });
        }

        // 2. Prevent duplicate application (idempotency check)
        if (item.applied || item.applyState === 'APPLIED') {
            return res.status(409).json({
                success: false,
                code: 'ALREADY_APPLIED',
                message: 'Changes already applied',
                appliedAt: item.appliedAt,
                appliedBy: item.appliedBy,
                applicationAuditId: item.applicationAuditId
            });
        }

        // 3. Must be reviewed and at least partially approved
        if (!['APPROVED', 'PARTIAL'].includes(item.reviewerDecision)) {
            return res.status(422).json({
                success: false,
                message: `Cannot apply — review decision is ${item.reviewerDecision}`
            });
        }

        // Collect approved, allowed changes
        const updateOps = {};
        const appliedFields = [];
        const rejectedFields = [];
        const FORBIDDEN_PATH_REGEX = /(?:^|\.)(?:__proto__|constructor|prototype|\$)/i;

        for (const change of item.proposedChanges) {
            if (change.approved !== true) continue;

            // Prototype-pollution and injection guard
            if (!change.field || typeof change.field !== 'string' || FORBIDDEN_PATH_REGEX.test(change.field)) {
                rejectedFields.push({ field: String(change.field), reason: 'Illegal or dangerous field name' });
                continue;
            }

            // Server-side safety checks: blocked fields
            if (BLOCKED_UPDATE_FIELDS.has(change.field)) {
                rejectedFields.push({ field: change.field, reason: 'Blocked field' });
                continue;
            }

            // Server-side safety checks: allowlist
            if (!ALLOWED_UPDATE_FIELDS.has(change.field)) {
                rejectedFields.push({ field: change.field, reason: 'Field not in allowlist or unknown nested path' });
                continue;
            }

            // Check for MongoDB operators or prototype pollution in object values
            if (typeof change.proposedValue === 'object' && change.proposedValue !== null) {
                const dangerousKey = Object.keys(change.proposedValue).find(k => k.startsWith('$') || FORBIDDEN_PATH_REGEX.test(k));
                if (dangerousKey) {
                    rejectedFields.push({ field: change.field, reason: `Disallowed operator or key in proposed value: ${dangerousKey}` });
                    continue;
                }
            }

            // Do not clear existing data with null/undefined, empty string, unknown, or sentinel values
            const isNullOrUndefined = change.proposedValue === null || change.proposedValue === undefined;
            const isEmptyString = typeof change.proposedValue === 'string' && change.proposedValue.trim() === '';
            const isUnknownOrSentinelString = typeof change.proposedValue === 'string' &&
                ['unknown', 'not_applicable', 'not applicable', 'n/a', 'na', 'null', 'undefined', 'sentinel'].includes(change.proposedValue.trim().toLowerCase());
            const isSentinelVal = isSentinel(change.proposedValue) || (
                typeof change.proposedValue === 'object' && change.proposedValue !== null && (
                    Boolean(change.proposedValue._sentinel) ||
                    Boolean(change.proposedValue.sentinel) ||
                    (change.proposedValue.value === null && change.proposedValue.value !== undefined)
                )
            );

            if (isNullOrUndefined || isEmptyString || isUnknownOrSentinelString || isSentinelVal) {
                rejectedFields.push({
                    field: change.field,
                    reason: 'Proposed value is missing, empty, unknown, or sentinel — will not clear existing data'
                });
                continue;
            }

            // Date casting & normalization for Date fields
            let valToSet = change.proposedValue;
            if (['authorityVerification.allotmentDate', 'authorityVerification.transferDate', 'authorityVerification.possessionDate'].includes(change.field)) {
                let d = valToSet;
                if (typeof d === 'object' && d !== null && d.date) {
                    d = d.date;
                }
                const parsedDate = new Date(d);
                if (isNaN(parsedDate.getTime())) {
                    rejectedFields.push({ field: change.field, reason: 'Invalid date format' });
                    continue;
                }
                valToSet = parsedDate;
            }

            // Area validation
            if (change.field === 'authorityVerification.propertyAreaValue') {
                const num = Number(valToSet);
                if (isNaN(num)) {
                    rejectedFields.push({ field: change.field, reason: 'Invalid numeric area value' });
                    continue;
                }
                valToSet = num;
            }

            // Encumbrance string contract enforcement (ensures strictly String types for Inventory)
            if (change.field === 'authorityVerification.litigationStatus') {
                if (typeof valToSet === 'object' && valToSet !== null && (valToSet.status || valToSet.detail)) {
                    valToSet = String(valToSet.status || valToSet.detail).trim();
                } else if (valToSet === false) {
                    valToSet = 'NO_LITIGATION';
                } else if (valToSet === true) {
                    valToSet = 'LITIGATION_REPORTED';
                } else if (typeof valToSet === 'string') {
                    valToSet = valToSet.trim();
                }
            }

            if (change.field === 'authorityVerification.mortgageStatus') {
                if (typeof valToSet === 'object' && valToSet !== null && (valToSet.status || valToSet.detail)) {
                    valToSet = String(valToSet.status || valToSet.detail).trim();
                } else if (valToSet === false) {
                    valToSet = 'NO_MORTGAGE';
                } else if (valToSet === true) {
                    valToSet = 'MORTGAGE_REPORTED';
                } else if (typeof valToSet === 'string') {
                    valToSet = valToSet.trim();
                }
            }

            updateOps[change.field] = valToSet;
            appliedFields.push({
                field: change.field,
                before: change.currentValue,
                after: valToSet
            });
        }

        // Strict-mode validation check: If ANY approved field has an invalid/forbidden/unknown path or operator,
        // we MUST reject the entire operation with 422 to prevent silent stripping or partial execution of an untrusted request.
        const fatalRejections = rejectedFields.filter(r =>
            r.reason === 'Blocked field' ||
            r.reason === 'Field not in allowlist or unknown nested path' ||
            r.reason === 'Illegal or dangerous field name' ||
            r.reason === 'Invalid date format' ||
            r.reason === 'Invalid numeric area value' ||
            r.reason.includes('Disallowed operator')
        );

        if (fatalRejections.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'Validation failed: unknown, blocked, or disallowed field paths detected',
                rejectedFields: fatalRejections
            });
        }

        if (appliedFields.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'No approved fields eligible for application',
                rejectedFields
            });
        }

        // ============================================================
        // STRICT FAIL-CLOSED VERIFICATION & PROVENANCE GATES
        // Must pass before any CRM Inventory mutation is permitted
        // ============================================================

        // 1. Snapshot existence and tenant matching
        if (!item.snapshotId) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_SNAPSHOT',
                message: 'Cannot apply changes: run item lacks a referenced verification snapshot'
            });
        }
        const snapshot = await PropertyVerificationSnapshot.findOne({ _id: item.snapshotId, tenantId });
        if (!snapshot) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_SNAPSHOT',
                message: 'Cannot apply changes: referenced verification snapshot does not exist or tenant mismatch'
            });
        }

        // 2. Run existence and tenant matching
        if (!item.runId) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_RUN',
                message: 'Cannot apply changes: run item lacks a referenced verification run'
            });
        }
        const run = await PropertyVerificationRun.findOne({ _id: item.runId, tenantId });
        if (!run) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_RUN',
                message: 'Cannot apply changes: referenced verification run does not exist or tenant mismatch'
            });
        }

        // 3. Strict Synthetic Protection: reject if any flag indicates fixture/synthetic mode
        if (
            item.isSynthetic === true ||
            item.provenance === 'SYNTHETIC_FIXTURE' ||
            snapshot.isSynthetic === true ||
            snapshot.provenance === 'SYNTHETIC_FIXTURE' ||
            run.isFixtureMode === true ||
            run.provenance === 'SYNTHETIC_FIXTURE'
        ) {
            return res.status(422).json({
                success: false,
                code: 'SYNTHETIC_FIXTURE_BLOCKED',
                message: 'Cannot apply changes: synthetic fixture data is prohibited from modifying Inventory records'
            });
        }

        // 4. Strict Explicit LIVE Provenance: do not infer LIVE from schema defaults or legacy missing values
        const isExplicitLiveItem = item.isSynthetic === false && item.provenance === 'LIVE';
        const isExplicitLiveSnapshot = snapshot.isSynthetic === false && snapshot.provenance === 'LIVE';
        const isExplicitLiveRun = run.isFixtureMode === false && run.provenance === 'LIVE';

        if (!isExplicitLiveItem || !isExplicitLiveSnapshot || !isExplicitLiveRun) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_PROVENANCE',
                message: 'Cannot apply changes: explicit LIVE provenance required on run, item, and snapshot'
            });
        }

        // 5. Authorized LIVE Source check: authority source must be actively approved & enabled
        const authorityCode = item.authorityCode || run.authorityCode || snapshot.authorityCode;
        const sourceSettings = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!sourceSettings || sourceSettings.permissionStatus !== 'GRANTED' || !sourceSettings.isEnabled || sourceSettings.isPaused) {
            return res.status(422).json({
                success: false,
                code: 'SOURCE_NOT_AUTHORIZED',
                message: `Cannot apply changes: authority source ${authorityCode} is not authorized for live operation`
            });
        }

        const activationCheck = sourceSettings.checkActivationEligibility ? sourceSettings.checkActivationEligibility() : { canActivate: true, blockers: [] };
        const nonFieldBlockers = (activationCheck.blockers || []).filter(b => !b.includes('permitted fields'));
        if (nonFieldBlockers.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'SOURCE_NOT_AUTHORIZED',
                message: `Cannot apply changes: authority source ${authorityCode} has configuration blockers: ${nonFieldBlockers.join(', ')}`
            });
        }

        // 6. Source-Specific Permitted Fields Enforcement (Finding 1)
        const permittedList = Array.isArray(sourceSettings.permittedFields) ? sourceSettings.permittedFields : [];
        const permittedSet = new Set(permittedList);
        const unauthorizedSourceFields = [];

        if (permittedList.length === 0) {
            // Empty permissions list authorizes zero fields
            for (const af of appliedFields) {
                const canonicalName = CRM_TO_CANONICAL_FIELD_MAP[af.field] || af.field.replace(/^authorityVerification\./, '');
                unauthorizedSourceFields.push({
                    field: af.field,
                    canonicalField: canonicalName,
                    reason: `Authority source ${authorityCode} has an empty permittedFields list — no fields are authorized`
                });
            }
        } else {
            for (const af of appliedFields) {
                const canonicalName = CRM_TO_CANONICAL_FIELD_MAP[af.field] || af.field.replace(/^authorityVerification\./, '');
                if (!permittedSet.has(canonicalName) && !permittedSet.has(af.field)) {
                    unauthorizedSourceFields.push({
                        field: af.field,
                        canonicalField: canonicalName,
                        reason: `Field '${canonicalName}' is not in permittedFields for source ${authorityCode}`
                    });
                }
            }
        }

        if (unauthorizedSourceFields.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'UNAUTHORIZED_SOURCE_FIELDS',
                message: `Validation failed: source ${authorityCode} is not authorized to update field(s): ${unauthorizedSourceFields.map(f => f.canonicalField || f.field).join(', ')}`,
                rejectedFields: unauthorizedSourceFields
            });
        }

        // 7. Snapshot Cryptographic Integrity Verification (Finding 5)
        if (snapshot.isSealed !== true) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot is not sealed'
            });
        }

        if (!snapshot.contentHash || typeof snapshot.contentHash !== 'string' || !/^[a-f0-9]{32,64}$/i.test(snapshot.contentHash.trim())) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot lacks a valid cryptographic content hash'
            });
        }

        // Recompute content hash over canonical normalized data
        const recomputedHash = computeSnapshotContentHash(snapshot.normalizedData || {});
        if (!recomputedHash || recomputedHash.toLowerCase() !== snapshot.contentHash.trim().toLowerCase()) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot cryptographic integrity verification failed (content hash mismatch)'
            });
        }

        // 8. Maker-Checker Separation Gate (Phase 4.4 - Finding F-02)
        // The reviewer who approved the changes cannot be the user applying them.
        // Server-side identity verified via req.user._id (ignoring any request payload).
        if (!item.reviewedBy) {
            return res.status(422).json({
                success: false,
                code: 'MAKER_CHECKER_VIOLATION',
                message: 'Cannot apply changes: run item lacks a verified reviewer identity (maker-checker requirement)'
            });
        }

        const applierUserId = req.user?._id?.toString();
        const reviewerUserId = item.reviewedBy?.toString();

        if (applierUserId && reviewerUserId && applierUserId === reviewerUserId) {
            return res.status(403).json({
                success: false,
                code: 'MAKER_CHECKER_VIOLATION',
                message: 'Maker-checker policy violation: The user who reviewed and approved these changes cannot apply them'
            });
        }

        // 9. Durable Saga Compensation Snapshot & Fencing Initialization (Phase 4.2)
        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

        if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true' && !supportsTransactions) {
            return res.status(503).json({
                success: false,
                code: 'TRANSACTIONS_UNAVAILABLE',
                message: 'Cannot apply changes: MongoDB replica set transactions required by configuration but not available'
            });
        }

        // Snapshot previous state for durable saga compensation
        const previousValues = {};
        const currentAv = inventory.authorityVerification
            ? (typeof inventory.authorityVerification.toObject === 'function'
                ? inventory.authorityVerification.toObject()
                : inventory.authorityVerification)
            : {};

        for (const key of Object.keys(updateOps)) {
            const fieldPath = key.replace(/^authorityVerification\./, '');
            previousValues[key] = currentAv[fieldPath] !== undefined ? currentAv[fieldPath] : null;
        }
        previousValues['authorityVerification.applyClaimId'] = currentAv.applyClaimId || null;
        const expectedPreviousClaimId = currentAv.applyClaimId || null;

        const claimNow = new Date();
        const claimExpiry = new Date(claimNow.getTime() + 30000); // 30-second bounded claim lease
        const claimId = new mongoose.Types.ObjectId();
        const idempotencyKey = `${item._id}_${item.snapshotId}_${Date.now()}`;

        // If an abandoned claim with expired lease exists on this item, reconcile it before claiming
        const existingItem = await PropertyVerificationRunItem.findOne({ _id: item._id, tenantId });
        if (existingItem?.applyState === 'APPLYING' && existingItem.applyClaim?.leaseExpiresAt && existingItem.applyClaim.leaseExpiresAt < claimNow) {
            await reconcileInterruptedApplySaga(existingItem._id, tenantId);
        }

        const claimedItem = await PropertyVerificationRunItem.findOneAndUpdate(
            {
                _id: item._id,
                tenantId,
                applied: false,
                $or: [
                    { applyState: { $in: ['UNAPPLIED', 'FAILED', null] } },
                    { 'applyClaim.leaseExpiresAt': { $lt: claimNow } }
                ]
            },
            {
                $set: {
                    applyState: 'APPLYING',
                    'applyClaim.claimedBy': req.user._id,
                    'applyClaim.claimId': claimId,
                    'applyClaim.claimedAt': claimNow,
                    'applyClaim.leaseExpiresAt': claimExpiry,
                    'applyClaim.stage': 'CLAIMED',
                    'applyClaim.idempotencyKey': idempotencyKey,
                    'applyClaim.expectedPreviousClaimId': expectedPreviousClaimId,
                    'applyClaim.compensation': {
                        inventoryBefore: previousValues,
                        auditId: null
                    },
                    applyError: null
                },
                $inc: {
                    'applyClaim.fenceToken': 1
                }
            },
            { new: true }
        );

        if (!claimedItem) {
            // Concurrency contention or duplicate apply
            const freshItem = await PropertyVerificationRunItem.findOne({ _id: item._id, tenantId });
            if (freshItem?.applied || freshItem?.applyState === 'APPLIED') {
                return res.status(409).json({
                    success: false,
                    code: 'ALREADY_APPLIED',
                    message: 'Changes already applied',
                    appliedAt: freshItem.appliedAt,
                    appliedBy: freshItem.appliedBy,
                    applicationAuditId: freshItem.applicationAuditId
                });
            }
            return res.status(409).json({
                success: false,
                code: 'APPLICATION_IN_PROGRESS',
                message: 'Application already in progress by another request'
            });
        }

        // 9. Coordinate Mutation, AuditLog, and Run Item State (Durable Recoverable Saga)
        updateOps['authorityVerification.lastVerifiedAt'] = new Date();
        updateOps['authorityVerification.authorityCode'] = item.authorityCode;
        updateOps['authorityVerification.verificationRunId'] = item.runId;
        updateOps['authorityVerification.verificationSnapshotId'] = item.snapshotId;
        updateOps['authorityVerification.snapshotContentHash'] = snapshot.contentHash;
        updateOps['authorityVerification.rawSnapshotHash'] = snapshot.contentHash;
        updateOps['authorityVerification.applyClaimId'] = claimId;

        let session = null;
        let useTransaction = false;

        if (supportsTransactions) {
            try {
                session = await mongoose.startSession();
                session.startTransaction();
                useTransaction = true;
            } catch (sessionErr) {
                if (session) {
                    try { await session.endSession(); } catch {}
                    session = null;
                }
                if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true') {
                    return res.status(503).json({
                        success: false,
                        code: 'TRANSACTIONS_UNAVAILABLE',
                        message: `Cannot apply changes: Failed to initialize replica set transaction: ${sessionErr.message}`
                    });
                }
                useTransaction = false;
            }
        }

        let currentStage = 'CLAIMED';
        let recordedAuditId = null;

        try {
            // Stage 1a: Persist INVENTORY_MUTATING conditionally BEFORE touching Inventory
            const mutatingRes = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        'applyClaim.stage': 'INVENTORY_MUTATING'
                    }
                },
                useTransaction ? { session } : {}
            );
            if (mutatingRes.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'INVENTORY_MUTATING';

            // Stage 1b: Mutate Inventory with strict claim fencing
            if (!inventory.authorityVerification || typeof inventory.authorityVerification !== 'object') {
                await Inventory.updateOne(
                    { _id: item.inventoryId, tenantId },
                    { $set: { authorityVerification: {} } },
                    useTransaction ? { session } : {}
                );
            }

            const inventoryFilter = {
                _id: item.inventoryId,
                tenantId
            };
            if (expectedPreviousClaimId) {
                inventoryFilter['authorityVerification.applyClaimId'] = expectedPreviousClaimId;
            } else {
                inventoryFilter['$or'] = [
                    { 'authorityVerification.applyClaimId': null },
                    { 'authorityVerification.applyClaimId': { $exists: false } }
                ];
            }

            const mutatedInventory = await Inventory.findOneAndUpdate(
                inventoryFilter,
                { $set: updateOps },
                { strict: 'throw', runValidators: true, new: true, ...(useTransaction ? { session } : {}) }
            );
            if (!mutatedInventory) {
                const err = new Error('INVENTORY_MUTATION_FENCED_PREEMPTED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }

            // Stage 1c: Persist INVENTORY_MUTATED conditionally validating lease & claim
            const stage1Res = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: { 'applyClaim.stage': 'INVENTORY_MUTATED' }
                },
                useTransaction ? { session } : {}
            );
            if (stage1Res.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'INVENTORY_MUTATED';

            // Stage 2: AuditLog Insertion
            currentStage = 'AUDIT_LOGGING';
            const auditRecord = await auditEvent(
                'authority_changes_applied',
                req.user._id,
                'inventory',
                item.inventoryId,
                `Authority verification changes applied from ${item.authorityCode}`,
                {
                    itemId: item._id,
                    runId: item.runId,
                    authorityCode: item.authorityCode,
                    appliedFields,
                    rejectedFields,
                    claimId: claimId.toString(),
                    changes: { before: previousValues, after: updateOps }
                },
                useTransaction ? { session } : {}
            );
            recordedAuditId = auditRecord?._id || null;

            // Record stage AUDIT_LOGGED conditionally validating lease & claim
            const stage2Res = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        'applyClaim.stage': 'AUDIT_LOGGED',
                        'applyClaim.compensation.auditId': recordedAuditId
                    }
                },
                useTransaction ? { session } : {}
            );
            if (stage2Res.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'AUDIT_LOGGED';

            // Stage 3: RunItem Finalization
            currentStage = 'FINALIZING';
            const appliedAt = new Date();
            const finalRes = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        applied: true,
                        applyState: 'APPLIED',
                        'applyClaim.stage': 'COMPLETED',
                        appliedAt,
                        appliedBy: req.user._id,
                        applicationAuditId: recordedAuditId,
                        'applyClaim.leaseExpiresAt': null
                    }
                },
                useTransaction ? { session } : {}
            );

            if (finalRes.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'COMPLETED';

            if (useTransaction && session) {
                await session.commitTransaction();
                await session.endSession();
                session = null;
            }

            return res.json({
                success: true,
                message: `Applied ${appliedFields.length} field(s)`,
                data: {
                    appliedFields,
                    rejectedFields,
                    auditId: recordedAuditId
                }
            });
        } catch (execErr) {
            if (useTransaction && session) {
                try { await session.abortTransaction(); } catch {}
                try { await session.endSession(); } catch {}
                session = null;
            }

            // Execute durable saga compensation
            try {
                await compensateApplySaga({
                    itemId: item._id,
                    tenantId,
                    inventoryId: item.inventoryId,
                    claimId,
                    stage: currentStage,
                    compensation: {
                        inventoryBefore: previousValues,
                        auditId: recordedAuditId
                    },
                    errorMsg: execErr.message,
                    appliedBy: req.user._id
                });
            } catch (compErr) {
                console.error(`[applyApprovedChanges] Compensation execution error:`, compErr);
            }

            if (
                execErr.code === 'CLAIM_PREEMPTED' ||
                execErr.message === 'APPLY_CLAIM_PREEMPTED_OR_EXPIRED' ||
                execErr.message === 'INVENTORY_MUTATION_FENCED_PREEMPTED' ||
                execErr.codeName === 'WriteConflict' ||
                execErr.code === 112 ||
                execErr.codeName === 'LockTimeout' ||
                execErr.code === 24 ||
                (typeof execErr.hasErrorLabel === 'function' && execErr.hasErrorLabel('TransientTransactionError'))
            ) {
                return res.status(409).json({
                    success: false,
                    code: 'CLAIM_PREEMPTED',
                    message: 'Apply claim expired or was preempted by concurrent write conflict before completion'
                });
            }

            if (execErr.name === 'StrictModeError' || (execErr.message && execErr.message.includes('strict mode is set to throw'))) {
                return res.status(422).json({
                    success: false,
                    message: execErr.message,
                    errorType: 'StrictModeError'
                });
            }

            throw execErr;
        }
    } catch (error) {
        console.error('applyApprovedChanges error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply changes' });
    }
};

// ============================================================
// VERIFICATION HISTORY
// ============================================================

/**
 * GET /api/authority/history/:inventoryId
 * Get verification snapshot history for an inventory.
 * Permission: authorityVerification.view
 */
export const getVerificationHistory = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId } = req.params;

        // Verify inventory access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // Get all links for this inventory
        const links = await PropertyAuthorityLink.find({ tenantId, inventoryId, isActive: true });

        const history = {};
        for (const link of links) {
            const snapshots = await PropertyVerificationSnapshot.getHistoryForLink(tenantId, link._id, 5);
            history[link.authorityCode] = {
                link: link.toObject(),
                snapshots
            };
        }

        res.json({ success: true, data: history });
    } catch (error) {
        console.error('getVerificationHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification history' });
    }
};
