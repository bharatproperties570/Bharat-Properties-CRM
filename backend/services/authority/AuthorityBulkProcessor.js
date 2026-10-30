/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — AUTHORITY BULK VERIFICATION ENGINE
 *  Phase 4: Controlled Bulk Verification & Scalable Batch Processing
 * ============================================================================
 * 
 *  1. BOUNDED BATCH PROCESSING: Processes items in configurable chunks (default 50-100)
 *     to eliminate memory bloat, with capability to scale past 5,000+ records.
 *  2. IDEMPOTENT RUN & ITEM EXECUTION: Prevents duplicate processing of already completed items.
 *  3. ERROR ISOLATION: Per-item try-catch ensures single-item errors do not abort the run.
 *  4. PAUSE, RESUME & SAFE CANCELLATION: Full lifecycle state machine support.
 *  5. STRICT MULTI-TENANCY: All queries and mutations strictly scoped to tenantId.
 *  6. FAIL-CLOSED LIVE BOUNDARY: Live requests fail closed while authorizationStatus is NOT_OBTAINED.
 *     Synthetic fixtures used for safe pre-live testing and verification.
 * 
 *  @module services/authority/AuthorityBulkProcessor
 *  @version 4.0.0-phase4
 */

import mongoose from 'mongoose';
import PropertyVerificationRun from '../../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    ALLOWED_UPDATE_FIELDS,
    BLOCKED_UPDATE_FIELDS
} from '../../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../../models/PropertyVerificationSnapshot.js';
import PropertyAuthorityLink from '../../models/PropertyAuthorityLink.js';
import Inventory from '../../models/Inventory.js';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';
import AuthoritySourceSettings from '../../models/AuthoritySourceSettings.js';
import { getAdapter, executeFixturePipeline, isKnownAuthority } from './adapterRegistry.js';
import { HSVP_SYNTHETIC, CHD_SYNTHETIC, GMADA_SYNTHETIC } from './fixtures/syntheticPhase3AFixtures.js';

// Safe audit logging helper
async function logAuditEvent(eventType, userId, targetType, targetId, description, metadata = {}, status = 'success') {
    try {
        let user = null;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            user = await User.findById(userId).select('fullName email').lean();
        }
        await AuditLog.create({
            eventType,
            userId: userId || null,
            userName: user?.fullName || 'System/AuthorityEngine',
            userEmail: user?.email || 'system@crm.internal',
            targetType,
            targetId: targetId ? targetId.toString() : null,
            description,
            metadata,
            ipAddress: '127.0.0.1',
            userAgent: 'AuthorityBulkProcessor/v4.0',
            status
        });
    } catch (err) {
        console.error('[AuthorityBulkProcessor] AuditLog error:', err.message);
    }
}

/**
 * Generate a synthetic fixture payload for a specific authority and property/link context.
 * Used during demonstration, development, and load testing.
 */
function getSyntheticFixtureForLink(authorityCode, link, inventory) {
    const code = authorityCode.toUpperCase().trim();
    const sector = link.sectorNumber || inventory?.sector || '14';
    const propId = link.propertyId || inventory?.unitNo || inventory?.unitNumber || '101';
    const uEstate = link.urbanEstate || 'PANCHKULA';
    const phase = link.phaseCode || 'PHASE-1';

    if (code === 'HSVP') {
        const raw = JSON.parse(JSON.stringify(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData));
        raw['Property No.'] = propId;
        raw['Sector'] = sector.startsWith('Sector') ? sector : `Sector ${sector}`;
        raw['Urban Estate'] = uEstate.startsWith('Urban Estate') ? uEstate : `Urban Estate ${uEstate}`;
        return raw;
    } else if (code === 'CHD') {
        const raw = JSON.parse(JSON.stringify(CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData));
        raw['Property No.'] = propId;
        raw['Sector'] = sector;
        return raw;
    } else if (code === 'GMADA') {
        const raw = JSON.parse(JSON.stringify(GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData));
        raw['Plot No. / Property No.'] = propId;
        raw['Sector / Phase'] = sector.startsWith('Sector') ? sector : `Sector ${sector}`;
        return raw;
    }
    return null;
}

export class AuthorityBulkProcessor {
    /**
     * Create a new bulk verification run for a list of inventories.
     */
    static async createBulkRun({
        tenantId,
        authorityCode,
        requestedBy,
        inventoryIds = [],
        runMode = 'BULK_MANUAL',
        isFixtureMode = false
    }) {
        if (!tenantId || !authorityCode || !requestedBy) {
            throw new Error('MISSING_PARAM: tenantId, authorityCode, and requestedBy are required.');
        }

        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            throw new Error(`INVALID_AUTHORITY: Authority code "${authorityCode}" is not supported.`);
        }

        if (!['SINGLE', 'BULK_MANUAL', 'BULK_SCHEDULED'].includes(runMode)) {
            throw new Error(`INVALID_RUN_MODE: Run mode "${runMode}" is not supported.`);
        }

        // Live vs Fixture Check
        const sourceSettings = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        const isLiveActive = sourceSettings ? sourceSettings.isEffectivelyActive() : false;

        if (!isFixtureMode && !isLiveActive) {
            const blockers = sourceSettings ? sourceSettings.checkActivationEligibility().blockers : ['Source settings not found'];
            // Create record marked POLICY_REJECTED
            const rejectedRun = await PropertyVerificationRun.create({
                tenantId,
                authorityCode,
                requestedBy,
                runMode,
                policyVersion: sourceSettings?.policyVersion || '1.2.0',
                status: 'POLICY_REJECTED',
                completedAt: new Date(),
                totalItems: inventoryIds.length,
                policyRejectionReasons: blockers,
                errorSummary: 'Authority source is not activated. Live fetching is strictly prohibited.'
            });

            await logAuditEvent(
                'authority_run_policy_rejected',
                requestedBy,
                'authority_run',
                rejectedRun._id,
                `Bulk run POLICY_REJECTED for ${authorityCode}: source not activated`,
                { authorityCode, runMode, blockers }
            );

            return rejectedRun;
        }

        // Create run in CREATED state
        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode,
            requestedBy,
            runMode,
            policyVersion: sourceSettings?.policyVersion || '1.2.0',
            status: 'CREATED',
            totalItems: inventoryIds.length,
            errorSummary: isFixtureMode ? 'Demonstration run using synthetic fixtures' : null
        });

        // Create item records in bulk with duplicate prevention
        if (inventoryIds.length > 0) {
            const itemsToInsert = [];
            const chunkSize = 1000;

            for (let i = 0; i < inventoryIds.length; i += chunkSize) {
                const chunkIds = inventoryIds.slice(i, i + chunkSize);
                const inventories = await Inventory.find({ _id: { $in: chunkIds }, tenantId })
                    .select('_id unitNo unitNumber projectName sector')
                    .lean();

                const existingLinks = await PropertyAuthorityLink.find({
                    tenantId,
                    inventoryId: { $in: chunkIds },
                    authorityCode
                }).lean();

                const linkMap = new Map(existingLinks.map(l => [l.inventoryId.toString(), l]));
                const linksToCreate = [];

                for (const inv of inventories) {
                    const invIdStr = inv._id.toString();
                    if (!linkMap.has(invIdStr)) {
                        const newLinkId = new mongoose.Types.ObjectId();
                        const newLink = {
                            _id: newLinkId,
                            tenantId,
                            inventoryId: inv._id,
                            authorityCode,
                            propertyId: inv.unitNo || inv.unitNumber || '101',
                            sectorNumber: inv.sector || '14',
                            matchEligibility: 'ELIGIBLE',
                            createdBy: requestedBy
                        };
                        linksToCreate.push(newLink);
                        linkMap.set(invIdStr, newLink);
                    }
                }

                if (linksToCreate.length > 0) {
                    await PropertyAuthorityLink.insertMany(linksToCreate, { ordered: false }).catch(() => {});
                }

                for (const inv of inventories) {
                    const invIdStr = inv._id.toString();
                    const link = linkMap.get(invIdStr);
                    if (link) {
                        itemsToInsert.push({
                            tenantId,
                            runId: run._id,
                            inventoryId: inv._id,
                            linkId: link._id,
                            authorityCode,
                            status: 'PENDING'
                        });
                    }
                }
            }

            if (itemsToInsert.length > 0) {
                for (let j = 0; j < itemsToInsert.length; j += 1000) {
                    const subBatch = itemsToInsert.slice(j, j + 1000);
                    await PropertyVerificationRunItem.insertMany(subBatch, { ordered: false }).catch(err => {
                        if (err.code !== 11000) throw err;
                    });
                }
            }

            // Update actual count
            run.totalItems = itemsToInsert.length;
            await run.save();
        }

        await logAuditEvent(
            'authority_run_created',
            requestedBy,
            'authority_run',
            run._id,
            `Verification run created for ${authorityCode} (${runMode}, ${run.totalItems} items)`,
            { runId: run._id, authorityCode, runMode, totalItems: run.totalItems, isFixtureMode }
        );

        return run;
    }

    /**
     * Process an existing verification run in bounded batches.
     * 
     * @param {string|mongoose.Types.ObjectId} runId 
     * @param {object} options 
     * @param {string|mongoose.Types.ObjectId} options.tenantId Required tenant boundary
     * @param {number} [options.batchSize=50] Number of items per batch (bounded 1-500)
     * @param {boolean} [options.isFixtureMode=true] Whether to execute in fixture/simulation mode
     * @param {Function} [options.onProgress] Optional progress callback
     * @returns {Promise<object>} Processing outcome summary
     */
    static async processRun(runId, options = {}) {
        const { tenantId, batchSize = 50, isFixtureMode = true, onProgress = null } = options;

        if (!tenantId) {
            throw new Error('TENANT_REQUIRED: tenantId must be provided for multi-tenant isolation.');
        }

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found for this tenant.`);
        }

        // Idempotency check: Don't re-run completed or rejected runs
        if (['COMPLETED', 'POLICY_REJECTED'].includes(run.status)) {
            return {
                runId: run._id,
                status: run.status,
                alreadyCompleted: true,
                processedItems: run.processedItems,
                succeededItems: run.succeededItems,
                failedItems: run.failedItems
            };
        }

        // If cancelled, do not process
        if (run.status === 'CANCELLED') {
            return {
                runId: run._id,
                status: 'CANCELLED',
                cancellationReason: run.cancellationReason
            };
        }

        // Update run state to PROCESSING
        run.status = 'PROCESSING';
        if (!run.startedAt) run.startedAt = new Date();
        await run.save();

        const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
        let totalProcessed = run.processedItems || 0;
        let totalSucceeded = run.succeededItems || 0;
        let totalFailed = run.failedItems || 0;
        let hasRemaining = true;

        while (hasRemaining) {
            // Check cancellation signal between batches
            const checkRun = await PropertyVerificationRun.findOne({ _id: runId, tenantId }).select('status cancellationReason').lean();
            if (checkRun?.status === 'CANCELLED') {
                return {
                    runId: run._id,
                    status: 'CANCELLED',
                    cancellationReason: checkRun.cancellationReason,
                    processedItems: totalProcessed
                };
            }

            // Fetch a bounded batch of PENDING items
            const batchItems = await PropertyVerificationRunItem.find({
                tenantId,
                runId: run._id,
                status: { $in: ['PENDING', 'PROCESSING'] }
            })
                .sort({ _id: 1 })
                .limit(safeBatchSize)
                .populate('linkId')
                .populate('inventoryId');

            if (batchItems.length === 0) {
                hasRemaining = false;
                break;
            }

            let batchSucceeded = 0;
            let batchFailed = 0;

            for (const item of batchItems) {
                try {
                    const result = await this.processItem(item, {
                        tenantId,
                        isFixtureMode,
                        authorityCode: run.authorityCode
                    });

                    if (result.success) {
                        batchSucceeded++;
                    } else {
                        batchFailed++;
                    }
                } catch (itemErr) {
                    // Isolated item failure — do NOT fail the whole run
                    batchFailed++;
                    item.status = 'FAILED';
                    item.errorMessage = itemErr.message || 'Item processing error';
                    item.processedAt = new Date();
                    await item.save();
                }
            }

            // Atomically update run counters
            totalProcessed += batchItems.length;
            totalSucceeded += batchSucceeded;
            totalFailed += batchFailed;

            await PropertyVerificationRun.updateOne(
                { _id: runId, tenantId },
                {
                    $inc: {
                        processedItems: batchItems.length,
                        succeededItems: batchSucceeded,
                        failedItems: batchFailed
                    }
                }
            );

            // Audit batch completion
            await logAuditEvent(
                'authority_run_batch_processed',
                run.requestedBy,
                'authority_run',
                run._id,
                `Batch of ${batchItems.length} items processed for run ${run._id}`,
                {
                    runId: run._id,
                    batchSize: batchItems.length,
                    batchSucceeded,
                    batchFailed,
                    totalProcessed
                }
            );

            if (typeof onProgress === 'function') {
                onProgress({
                    runId: run._id,
                    processed: totalProcessed,
                    total: run.totalItems,
                    succeeded: totalSucceeded,
                    failed: totalFailed
                });
            }

            // Yield control briefly to event loop for cooperative concurrency
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Finalize run status
        const finalStatus = totalFailed === 0
            ? 'COMPLETED'
            : (totalSucceeded > 0 ? 'PARTIAL' : 'FAILED');

        const completedAt = new Date();
        await PropertyVerificationRun.updateOne(
            { _id: runId, tenantId },
            {
                $set: {
                    status: finalStatus,
                    completedAt
                }
            }
        );

        await logAuditEvent(
            'authority_run_completed',
            run.requestedBy,
            'authority_run',
            run._id,
            `Run ${run._id} finished with status ${finalStatus} (${totalProcessed} processed, ${totalSucceeded} succeeded, ${totalFailed} failed)`,
            {
                runId: run._id,
                status: finalStatus,
                totalItems: run.totalItems,
                processedItems: totalProcessed,
                succeededItems: totalSucceeded,
                failedItems: totalFailed
            }
        );

        return {
            runId: run._id,
            status: finalStatus,
            totalItems: run.totalItems,
            processedItems: totalProcessed,
            succeededItems: totalSucceeded,
            failedItems: totalFailed,
            completedAt
        };
    }

    /**
     * Process an individual RunItem.
     * Safe, idempotent, and error-isolated.
     */
    static async processItem(item, options = {}) {
        const { tenantId, isFixtureMode = true, authorityCode } = options;

        if (item.status === 'SUCCEEDED' && item.snapshotId) {
            // Already processed idempotently
            return { success: true, alreadyProcessed: true };
        }

        item.status = 'PROCESSING';
        await item.save();

        // 1. Fetch link & inventory with tenant isolation (or use pre-populated docs)
        const link = (item.linkId && typeof item.linkId === 'object' && item.linkId.authorityCode && String(item.linkId.tenantId) === String(tenantId))
            ? item.linkId
            : await PropertyAuthorityLink.findOne({ _id: item.linkId, tenantId });

        if (!link) {
            item.status = 'FAILED';
            item.errorMessage = 'Authority link not found or cross-tenant access rejected';
            item.processedAt = new Date();
            await item.save();
            return { success: false, reason: 'LINK_NOT_FOUND' };
        }

        const inventory = (item.inventoryId && typeof item.inventoryId === 'object' && item.inventoryId.unitNo && String(item.inventoryId.tenantId) === String(tenantId))
            ? item.inventoryId
            : await Inventory.findOne({ _id: item.inventoryId, tenantId });

        if (!inventory) {
            item.status = 'FAILED';
            item.errorMessage = 'Inventory record not found or cross-tenant access rejected';
            item.processedAt = new Date();
            await item.save();
            return { success: false, reason: 'INVENTORY_NOT_FOUND' };
        }

        // 2. Execution boundary: Live vs Fixture
        if (!isFixtureMode) {
            // Live authority fetching is strictly prohibited without authorization
            item.status = 'FAILED';
            item.errorMessage = 'Live authority verification is disabled. Authorization status: NOT_OBTAINED.';
            item.processedAt = new Date();
            await item.save();
            return { success: false, reason: 'LIVE_DISABLED' };
        }

        // 3. Fixture pipeline execution
        const rawFixture = getSyntheticFixtureForLink(authorityCode || item.authorityCode, link, inventory);
        if (!rawFixture) {
            item.status = 'NO_MATCH';
            item.matchStatus = 'NO_MATCH';
            item.errorMessage = `No fixture available for authority ${item.authorityCode}`;
            item.processedAt = new Date();
            await item.save();
            return { success: false, reason: 'NO_FIXTURE' };
        }

        const candidate = executeFixturePipeline(item.authorityCode, rawFixture, inventory);

        if (candidate.status === 'REJECTED_QUALITY') {
            item.status = 'FAILED';
            item.matchStatus = 'NOT_ATTEMPTED';
            item.errorMessage = `Quality rejection: ${(candidate.errors || []).join('; ')}`;
            item.processedAt = new Date();
            await item.save();
            return { success: false, reason: 'QUALITY_REJECTED' };
        }

        // 4. Create immutable verification snapshot
        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: item.authorityCode,
            linkId: link._id,
            runItemId: item._id,
            sourceReferenceUrl: `https://authority.fixture.internal/${item.authorityCode.toLowerCase()}`,
            observedAt: new Date(),
            identityEvidence: {
                compositeKey: link.compositeKey || candidate.compositeKey?.key || null,
                sectorNumber: link.sectorNumber || null,
                phaseCode: link.phaseCode || null,
                blockCode: link.blockCode || null,
                propertyId: link.propertyId || null,
                urbanEstate: link.urbanEstate || null,
                schemeName: link.schemeName || null
            },
            normalizedData: candidate.normalizedRecord || {},
            dataQualityStatus: ['READY_FOR_REVIEW', 'VERIFIED_OFFICIAL'].includes(candidate.status) ? 'COMPLETE' : 'PARTIAL'
        });

        // 5. Build proposed changes (filtering strictly against allowlist/blocklist)
        const proposedChanges = [];
        if (Array.isArray(candidate.proposedChanges)) {
            for (const pc of candidate.proposedChanges) {
                // Reject blocked fields
                if (BLOCKED_UPDATE_FIELDS.has(pc.field)) continue;
                // Allow only allowlisted fields
                if (!ALLOWED_UPDATE_FIELDS.has(pc.field)) continue;

                proposedChanges.push({
                    field: pc.field,
                    currentValue: pc.currentValue ?? null,
                    proposedValue: pc.proposedValue ?? null,
                    changeType: pc.changeType || 'UPDATE',
                    approved: null // Awaiting human review
                });
            }
        }

        // 6. Update item status to SUCCEEDED
        item.status = 'SUCCEEDED';
        item.matchStatus = candidate.matchEvidence?.confidence === 'EXACT'
            ? 'EXACT_MATCH'
            : (candidate.matchEvidence?.confidence === 'PARTIAL' ? 'PARTIAL_MATCH' : 'NO_MATCH');
        item.snapshotId = snapshot._id;
        item.proposedChanges = proposedChanges;
        item.reviewerDecision = 'PENDING';
        item.processedAt = new Date();
        item.errorMessage = null;

        await item.save();

        return {
            success: true,
            itemId: item._id,
            snapshotId: snapshot._id,
            matchStatus: item.matchStatus,
            proposedChangesCount: proposedChanges.length
        };
    }

    /**
     * Pause or safely cancel a verification run.
     */
    static async cancelRun(runId, tenantId, userId, reason = 'Cancelled by user') {
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found.`);
        }

        if (['COMPLETED', 'CANCELLED', 'POLICY_REJECTED'].includes(run.status)) {
            return run;
        }

        run.status = 'CANCELLED';
        run.cancelledBy = userId || null;
        run.cancelledAt = new Date();
        run.cancellationReason = reason;
        await run.save();

        await logAuditEvent(
            'authority_run_cancelled',
            userId,
            'authority_run',
            run._id,
            `Verification run ${run._id} cancelled: ${reason}`,
            { runId: run._id, reason }
        );

        return run;
    }

    /**
     * Resume an interrupted or paused verification run.
     */
    static async resumeRun(runId, tenantId, options = {}) {
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found.`);
        }

        if (run.status === 'COMPLETED') {
            return { message: 'Run already completed', run };
        }

        // Reset to CREATED or PROCESSING
        run.status = 'PROCESSING';
        run.cancellationReason = null;
        run.cancelledBy = null;
        run.cancelledAt = null;
        await run.save();

        return this.processRun(runId, {
            tenantId,
            ...options
        });
    }

    /**
     * Get real-time progress for a verification run.
     */
    static async getRunProgress(runId, tenantId) {
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId }).lean();
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found.`);
        }

        const pendingCount = await PropertyVerificationRunItem.countDocuments({
            tenantId,
            runId,
            status: { $in: ['PENDING', 'PROCESSING'] }
        });

        const succeededCount = await PropertyVerificationRunItem.countDocuments({
            tenantId,
            runId,
            status: 'SUCCEEDED'
        });

        const failedCount = await PropertyVerificationRunItem.countDocuments({
            tenantId,
            runId,
            status: { $in: ['FAILED', 'NO_MATCH'] }
        });

        return {
            runId: run._id,
            authorityCode: run.authorityCode,
            status: run.status,
            totalItems: run.totalItems,
            processedItems: (run.totalItems - pendingCount),
            pendingItems: pendingCount,
            succeededItems: succeededCount,
            failedItems: failedCount,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            isCompleted: ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'POLICY_REJECTED'].includes(run.status)
        };
    }
}

export default AuthorityBulkProcessor;
