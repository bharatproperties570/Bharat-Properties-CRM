/**
 * Authority Verification Controller
 * 
 * Phase 2 Foundation — inactive backend only.
 * No live HTTP requests to authority portals.
 * All sources default to DISABLED.
 */

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import { buildCompositeKey } from '../services/authority/authorityNormalizer.js';
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

        const { authorityCode, runMode, inventoryIds, isFixtureMode = false, autoProcess = false } = req.body;

        if (!authorityCode || !runMode) {
            return res.status(400).json({ success: false, message: 'authorityCode and runMode required' });
        }
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }
        if (!['SINGLE', 'BULK_MANUAL', 'BULK_SCHEDULED'].includes(runMode)) {
            return res.status(400).json({ success: false, message: 'Only SINGLE, BULK_MANUAL, and BULK_SCHEDULED modes supported' });
        }

        // Check source activation status — MUST be fail-closed for live requests
        const sourceSettings = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!sourceSettings) {
            return res.status(422).json({
                success: false,
                message: 'Authority source not configured',
                status: 'POLICY_REJECTED'
            });
        }

        const activationCheck = sourceSettings.checkActivationEligibility();
        if (!isFixtureMode && !sourceSettings.isEffectivelyActive()) {
            // Create the run record but immediately mark as POLICY_REJECTED
            const run = await PropertyVerificationRun.create({
                tenantId,
                authorityCode,
                requestedBy: req.user._id,
                runMode,
                policyVersion: sourceSettings.policyVersion,
                status: 'POLICY_REJECTED',
                completedAt: new Date(),
                totalItems: Array.isArray(inventoryIds) ? inventoryIds.length : 0,
                policyRejectionReasons: activationCheck.blockers.length > 0
                    ? activationCheck.blockers
                    : ['Source is not effectively active (disabled or paused)'],
                errorSummary: 'Verification source is not activated. Live adapters are not implemented in Phase 2.'
            });

            await auditEvent(
                'authority_run_policy_rejected',
                req.user._id,
                'authority_run',
                run._id,
                `Verification run POLICY_REJECTED for ${authorityCode}: source not activated`,
                { runId: run._id, authorityCode, blockers: activationCheck.blockers }
            );

            return res.status(422).json({
                success: false,
                message: 'Verification source is not activated',
                data: run.toSummary(),
                blockers: activationCheck.blockers
            });
        }

        // Source is active or executing in demonstration fixture mode — create run in CREATED state
        const totalItems = Array.isArray(inventoryIds) ? inventoryIds.length : 1;

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode,
            requestedBy: req.user._id,
            runMode,
            policyVersion: sourceSettings.policyVersion,
            status: 'CREATED',
            totalItems,
            errorSummary: isFixtureMode
                ? 'Demonstration run using synthetic fixtures'
                : 'Run created. Live verification adapters are not yet implemented (Phase 2 foundation only).'
        });

        // Create run items for each inventory if provided
        if (Array.isArray(inventoryIds) && inventoryIds.length > 0) {
            const itemOps = [];
            for (const invId of inventoryIds) {
                // Verify inventory and link exist
                const inv = await Inventory.findOne({ _id: invId, tenantId }).select('_id').lean();
                if (!inv) continue;

                const link = await PropertyAuthorityLink.findOne({
                    tenantId, inventoryId: invId, authorityCode, isActive: true
                });
                if (!link) continue;

                itemOps.push({
                    tenantId,
                    runId: run._id,
                    inventoryId: invId,
                    linkId: link._id,
                    authorityCode,
                    status: 'PENDING'
                });
            }

            if (itemOps.length > 0) {
                await PropertyVerificationRunItem.insertMany(itemOps, { ordered: false }).catch(err => {
                    // Duplicates are ok — unique index on runId+inventoryId
                    if (err.code !== 11000) throw err;
                });
            }

            run.totalItems = itemOps.length;
            await run.save();
        }

        await auditEvent(
            'authority_run_created',
            req.user._id,
            'authority_run',
            run._id,
            `Verification run created for ${authorityCode} (${runMode}, ${run.totalItems} items)`,
            { runId: run._id, authorityCode, runMode, totalItems: run.totalItems }
        );

        res.status(201).json({ success: true, data: run.toSummary() });
    } catch (error) {
        console.error('createVerificationRun error:', error);
        res.status(500).json({ success: false, message: 'Failed to create verification run' });
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
        const { batchSize = 50, isFixtureMode = true } = req.body;

        const outcome = await AuthorityBulkProcessor.processRun(runId, {
            tenantId,
            batchSize: Number(batchSize) || 50,
            isFixtureMode: Boolean(isFixtureMode)
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
        const run = await AuthorityBulkProcessor.cancelRun(runId, tenantId, req.user._id, 'Paused by user');

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
        const { isFixtureMode = true } = req.body;

        const outcome = await AuthorityBulkProcessor.resumeRun(runId, tenantId, {
            isFixtureMode: Boolean(isFixtureMode)
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

        // Prevent duplicate application
        if (item.applied) {
            return res.status(409).json({
                success: false,
                message: 'Changes already applied',
                appliedAt: item.appliedAt,
                appliedBy: item.appliedBy
            });
        }

        // Must be reviewed and at least partially approved
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

        // Add verification audit metadata to subdocument
        updateOps['authorityVerification.lastVerifiedAt'] = new Date();
        updateOps['authorityVerification.authorityCode'] = item.authorityCode;
        updateOps['authorityVerification.verificationRunId'] = item.runId;
        if (item.snapshotId) {
            updateOps['authorityVerification.verificationSnapshotId'] = item.snapshotId;
            const snapshot = await PropertyVerificationSnapshot.findOne({ _id: item.snapshotId, tenantId });
            if (snapshot && snapshot.contentHash) {
                updateOps['authorityVerification.snapshotContentHash'] = snapshot.contentHash;
                updateOps['authorityVerification.rawSnapshotHash'] = snapshot.contentHash;
            }
        }

        // Verify inventory still exists and belongs to tenant
        const inventory = await Inventory.findOne({ _id: item.inventoryId, tenantId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // If legacy document has authorityVerification: null, initialize it to an empty object
        // so MongoDB dotted path $set does not fail with PathNotViable (code 28).
        // Retains strict tenant-scope filter on the recovery write.
        if (!inventory.authorityVerification || typeof inventory.authorityVerification !== 'object') {
            await Inventory.updateOne(
                { _id: item.inventoryId, tenantId },
                { $set: { authorityVerification: {} } }
            );
        }

        // Apply update with strict schema enforcement (strict: 'throw' and runValidators: true)
        try {
            await Inventory.findOneAndUpdate(
                { _id: item.inventoryId, tenantId },
                { $set: updateOps },
                { strict: 'throw', runValidators: true }
            );
        } catch (dbError) {
            if (dbError.name === 'StrictModeError' || (dbError.message && dbError.message.includes('strict mode is set to throw'))) {
                return res.status(422).json({
                    success: false,
                    message: dbError.message,
                    errorType: 'StrictModeError'
                });
            }
            throw dbError;
        }

        // Create audit record
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
                changes: { before: {}, after: updateOps }
            }
        );

        // Mark item as applied
        item.applied = true;
        item.appliedAt = new Date();
        item.appliedBy = req.user._id;
        item.applicationAuditId = auditRecord?._id || null;
        await item.save();

        res.json({
            success: true,
            message: `Applied ${appliedFields.length} field(s)`,
            data: {
                appliedFields,
                rejectedFields,
                auditId: auditRecord?._id
            }
        });
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
