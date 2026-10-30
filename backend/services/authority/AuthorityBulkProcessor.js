/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — AUTHORITY BULK VERIFICATION ENGINE
 *  Phase 4: Controlled Bulk Verification & Scalable Batch Processing
 * ============================================================================
 * 
 *  1. BOUNDED BATCH PROCESSING: Processes items in configurable chunks (default 50-250)
 *     to eliminate memory bloat, with capability to scale past 5,000+ records.
 *  2. CONCURRENCY PROTECTION & ATOMIC CLAIMING: Atomic item claims via workerId prevent
 *     duplicate snapshots and duplicate processing when multiple workers run concurrently.
 *  3. IDENTITY INTEGRITY: No fallback '101' or '14'. Missing identity fields remain
 *     INCOMPLETE and ineligible; incomplete links are never processed or marked eligible.
 *  4. REAL PAUSE & RESUME LIFECYCLE: Safe stop at batch boundaries with PAUSED state,
 *     atomic counter preservation, and seamless resumption without duplicates.
 *  5. PROVENANCE & SYNTHETIC PROTECTION: Runs, items, and snapshots explicitly record
 *     isSynthetic and provenance ('SYNTHETIC_FIXTURE' vs 'LIVE').
 *  6. STRICT MULTI-TENANCY: All operations strictly scoped by tenantId.
 *  7. FAIL-CLOSED LIVE BOUNDARY: Live requests reject while authorizationStatus is NOT_OBTAINED.
 * 
 *  @module services/authority/AuthorityBulkProcessor
 *  @version 4.1.0-phase4
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
import { executeFixturePipeline } from './adapterRegistry.js';
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
            userAgent: 'AuthorityBulkProcessor/v4.1',
            status
        });
    } catch (err) {
        console.error('[AuthorityBulkProcessor] AuditLog error:', err.message);
    }
}

/**
 * Generate a synthetic fixture payload for a specific authority and property/link context.
 * Strictly adheres to identity requirements: if required fields are missing, returns null.
 * NEVER invents fake identity values (no fallback '101' or '14').
 */
function getSyntheticFixtureForLink(authorityCode, link, inventory) {
    const code = authorityCode.toUpperCase().trim();
    const sector = link?.sectorNumber || inventory?.sector;
    const propId = link?.propertyId || inventory?.unitNo || inventory?.unitNumber;
    const uEstate = link?.urbanEstate || inventory?.city || inventory?.location;
    const phase = link?.phaseCode;

    // Strict validation: Required fields MUST be present
    if (!propId || !sector) {
        return null;
    }
    if (code === 'HSVP' && !uEstate) {
        return null;
    }

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
        if (phase) {
            raw['Phase'] = phase;
        }
        return raw;
    }
    return null;
}

export class AuthorityBulkProcessor {
    /**
     * Create a new bulk verification run for a list of inventories using bounded operations.
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
                isFixtureMode: false,
                provenance: 'LIVE',
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

        // Create run in CREATED state with explicit provenance
        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode,
            requestedBy,
            runMode,
            policyVersion: sourceSettings?.policyVersion || '1.2.0',
            status: 'CREATED',
            totalItems: inventoryIds.length,
            isFixtureMode: Boolean(isFixtureMode),
            provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
            errorSummary: isFixtureMode ? 'Demonstration run using synthetic fixtures' : null
        });

        // Create item records in bulk using bounded chunks (500 per chunk)
        if (inventoryIds.length > 0) {
            const chunkSize = 500;

            for (let i = 0; i < inventoryIds.length; i += chunkSize) {
                const chunkIds = inventoryIds.slice(i, i + chunkSize);
                const inventories = await Inventory.find({ _id: { $in: chunkIds }, tenantId })
                    .select('_id unitNo unitNumber projectName sector city location')
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
                        const propId = inv.unitNo || inv.unitNumber || null;
                        const sector = inv.sector || null;
                        const urbanEstate = authorityCode === 'HSVP' ? (inv.city || inv.location || null) : null;

                        // Strict identity evaluation: Never mark incomplete links ELIGIBLE
                        const hasRequired = Boolean(propId && sector && (authorityCode !== 'HSVP' || urbanEstate));
                        const eligibility = hasRequired ? 'ELIGIBLE' : 'INCOMPLETE';

                        const newLink = {
                            _id: newLinkId,
                            tenantId,
                            inventoryId: inv._id,
                            authorityCode,
                            propertyId: propId,
                            sectorNumber: sector,
                            urbanEstate,
                            matchEligibility: eligibility,
                            createdBy: requestedBy
                        };
                        linksToCreate.push(newLink);
                        linkMap.set(invIdStr, newLink);
                    }
                }

                if (linksToCreate.length > 0) {
                    await PropertyAuthorityLink.insertMany(linksToCreate, { ordered: false }).catch(() => {});
                }

                const itemsChunk = [];
                for (const inv of inventories) {
                    const invIdStr = inv._id.toString();
                    const link = linkMap.get(invIdStr);
                    if (link) {
                        itemsChunk.push({
                            tenantId,
                            runId: run._id,
                            inventoryId: inv._id,
                            linkId: link._id,
                            authorityCode,
                            status: 'PENDING',
                            isSynthetic: Boolean(isFixtureMode),
                            provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE'
                        });
                    }
                }

                if (itemsChunk.length > 0) {
                    await PropertyVerificationRunItem.insertMany(itemsChunk, { ordered: false }).catch(() => {});
                }
            }
        }

        await logAuditEvent(
            'authority_run_created',
            requestedBy,
            'authority_run',
            run._id,
            `Bulk verification run created for ${authorityCode} (${inventoryIds.length} items, mode: ${runMode}, provenance: ${run.provenance})`,
            { runId: run._id, authorityCode, totalItems: inventoryIds.length, runMode, isFixtureMode }
        );

        return run;
    }

    /**
     * Process an existing verification run in bounded batches with atomic concurrency protection.
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

        // Idempotency check: Don't re-run completed, paused or rejected runs
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

        if (run.status === 'CANCELLED') {
            return {
                runId: run._id,
                status: 'CANCELLED',
                cancellationReason: run.cancellationReason
            };
        }

        if (run.status === 'PAUSED') {
            return {
                runId: run._id,
                status: 'PAUSED',
                pauseReason: run.pauseReason
            };
        }

        // Update run state to PROCESSING
        run.status = 'PROCESSING';
        if (!run.startedAt) run.startedAt = new Date();
        await run.save();

        const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
        const workerId = `worker_${new mongoose.Types.ObjectId().toString()}`;
        let hasRemaining = true;

        while (hasRemaining) {
            // Check cancellation or pause signal between batches
            const checkRun = await PropertyVerificationRun.findOne({ _id: runId, tenantId })
                .select('status cancellationReason pauseReason')
                .lean();

            if (checkRun?.status === 'CANCELLED') {
                return {
                    runId: run._id,
                    status: 'CANCELLED',
                    cancellationReason: checkRun.cancellationReason,
                    processedItems: run.processedItems
                };
            }

            if (checkRun?.status === 'PAUSED') {
                // Release any unclaimed/in-flight items back to PENDING
                await PropertyVerificationRunItem.updateMany(
                    { tenantId, runId: run._id, status: 'PROCESSING', claimedBy: workerId },
                    { $set: { status: 'PENDING', claimedBy: null } }
                );
                return {
                    runId: run._id,
                    status: 'PAUSED',
                    pauseReason: checkRun.pauseReason,
                    processedItems: run.processedItems
                };
            }

            // Find candidates for processing
            const candidates = await PropertyVerificationRunItem.find({
                tenantId,
                runId: run._id,
                status: 'PENDING'
            })
                .select('_id')
                .sort({ _id: 1 })
                .limit(safeBatchSize)
                .lean();

            if (candidates.length === 0) {
                // Check if any items are still being processed by other workers
                const stillProcessing = await PropertyVerificationRunItem.countDocuments({
                    tenantId,
                    runId: run._id,
                    status: 'PROCESSING'
                });

                if (stillProcessing === 0) {
                    hasRemaining = false;
                    break;
                }
                // Yield briefly and recheck
                await new Promise(r => setTimeout(r, 100));
                continue;
            }

            // Atomically claim items for this worker to prevent concurrent duplicate execution
            const claimedItems = [];
            for (const cand of candidates) {
                const claimed = await PropertyVerificationRunItem.findOneAndUpdate(
                    { _id: cand._id, tenantId, status: 'PENDING' },
                    { $set: { status: 'PROCESSING', claimedBy: workerId, claimedAt: new Date() } },
                    { new: true }
                ).populate('linkId').populate('inventoryId');

                if (claimed) {
                    claimedItems.push(claimed);
                }
            }

            if (claimedItems.length === 0) {
                continue;
            }

            let batchSucceeded = 0;
            let batchFailed = 0;

            for (const item of claimedItems) {
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
                    batchFailed++;
                    item.status = 'FAILED';
                    item.errorMessage = itemErr.message || 'Item processing error';
                    item.processedAt = new Date();
                    await item.save();
                }
            }

            // Atomically increment run counters to prevent lost updates across concurrent workers
            await PropertyVerificationRun.updateOne(
                { _id: runId, tenantId },
                {
                    $inc: {
                        processedItems: claimedItems.length,
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
                `Batch of ${claimedItems.length} items processed for run ${run._id}`,
                {
                    runId: run._id,
                    batchSize: claimedItems.length,
                    batchSucceeded,
                    batchFailed
                }
            );

            if (typeof onProgress === 'function') {
                const currentUpdatedRun = await PropertyVerificationRun.findById(runId).select('processedItems succeededItems failedItems totalItems').lean();
                onProgress({
                    runId: run._id,
                    processed: currentUpdatedRun?.processedItems || 0,
                    total: run.totalItems,
                    succeeded: currentUpdatedRun?.succeededItems || 0,
                    failed: currentUpdatedRun?.failedItems || 0
                });
            }

            // Yield control briefly to event loop for cooperative concurrency
            await new Promise(resolve => setImmediate(resolve));
        }

        // Finalize run status
        const finalCounts = await PropertyVerificationRunItem.aggregate([
            { $match: { runId: run._id, tenantId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const countMap = Object.fromEntries(finalCounts.map(c => [c._id, c.count]));
        const totalSucceeded = countMap.SUCCEEDED || 0;
        const totalFailed = (countMap.FAILED || 0) + (countMap.NO_MATCH || 0);
        const totalProcessed = totalSucceeded + totalFailed;

        const finalStatus = totalFailed === 0
            ? 'COMPLETED'
            : (totalSucceeded > 0 ? 'PARTIAL' : 'FAILED');

        const completedAt = new Date();
        const completedRun = await PropertyVerificationRun.findOneAndUpdate(
            { _id: runId, tenantId, status: { $nin: ['CANCELLED', 'PAUSED'] } },
            {
                $set: {
                    status: finalStatus,
                    completedAt,
                    processedItems: totalProcessed,
                    succeededItems: totalSucceeded,
                    failedItems: totalFailed
                }
            },
            { new: true }
        );

        if (completedRun) {
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
        }

        return {
            runId: run._id,
            status: completedRun?.status || finalStatus,
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
            return { success: true, alreadyProcessed: true };
        }

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

        // 2. Strict Identity Evaluation: Reject incomplete identity without inventing fake values
        const auth = authorityCode || item.authorityCode;
        if (
            link.matchEligibility === 'INCOMPLETE' ||
            !link.propertyId ||
            !link.sectorNumber ||
            (auth === 'HSVP' && !link.urbanEstate)
        ) {
            item.status = 'FAILED';
            item.matchStatus = 'IDENTITY_MISMATCH';
            item.errorMessage = 'Incomplete identity: propertyId and sectorNumber are required';
            item.processedAt = new Date();
            item.isSynthetic = Boolean(isFixtureMode);
            item.provenance = isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE';
            await item.save();
            return { success: false, reason: 'INCOMPLETE_IDENTITY' };
        }

        // 3. Execution boundary: Live vs Fixture
        if (!isFixtureMode) {
            item.status = 'FAILED';
            item.errorMessage = 'Live authority verification is disabled. Authorization status: NOT_OBTAINED.';
            item.processedAt = new Date();
            item.isSynthetic = false;
            item.provenance = 'LIVE';
            await item.save();
            return { success: false, reason: 'LIVE_DISABLED' };
        }

        // 4. Concurrency Protection: Check if a snapshot already exists for this run item
        const existingSnapshot = await PropertyVerificationSnapshot.findOne({
            runItemId: item._id,
            tenantId
        });
        if (existingSnapshot) {
            item.status = 'SUCCEEDED';
            item.snapshotId = existingSnapshot._id;
            item.isSynthetic = true;
            item.provenance = 'SYNTHETIC_FIXTURE';
            item.processedAt = new Date();
            await item.save();
            return { success: true, snapshotId: existingSnapshot._id, alreadyProcessed: true };
        }

        // 5. Fixture pipeline execution
        const rawFixture = getSyntheticFixtureForLink(auth, link, inventory);
        if (!rawFixture) {
            item.status = 'NO_MATCH';
            item.matchStatus = 'NO_MATCH';
            item.errorMessage = `No fixture available for authority ${item.authorityCode} with current identity`;
            item.processedAt = new Date();
            item.isSynthetic = Boolean(isFixtureMode);
            item.provenance = isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE';
            await item.save();
            return { success: false, reason: 'NO_FIXTURE' };
        }

        const candidate = executeFixturePipeline(item.authorityCode, rawFixture, inventory);

        if (candidate.status === 'REJECTED_QUALITY') {
            item.status = 'FAILED';
            item.matchStatus = 'NOT_ATTEMPTED';
            item.errorMessage = `Quality rejection: ${(candidate.errors || []).join('; ')}`;
            item.processedAt = new Date();
            item.isSynthetic = Boolean(isFixtureMode);
            item.provenance = isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE';
            await item.save();
            return { success: false, reason: 'QUALITY_REJECTED' };
        }

        // 6. Create immutable verification snapshot with explicit synthetic provenance
        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: item.authorityCode,
            linkId: link._id,
            runItemId: item._id,
            sourceReferenceUrl: `https://authority.fixture.internal/${item.authorityCode.toLowerCase()}`,
            observedAt: new Date(),
            isSynthetic: Boolean(isFixtureMode),
            provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
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

        // 7. Build proposed changes (filtering strictly against allowlist/blocklist)
        const proposedChanges = [];
        if (Array.isArray(candidate.proposedChanges)) {
            for (const pc of candidate.proposedChanges) {
                if (BLOCKED_UPDATE_FIELDS.has(pc.field)) continue;
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

        // 8. Update item status to SUCCEEDED with explicit synthetic provenance
        item.status = 'SUCCEEDED';
        item.matchStatus = candidate.matchEvidence?.confidence === 'EXACT'
            ? 'EXACT_MATCH'
            : (candidate.matchEvidence?.confidence === 'PARTIAL' ? 'PARTIAL_MATCH' : 'NO_MATCH');
        item.snapshotId = snapshot._id;
        item.proposedChanges = proposedChanges;
        item.reviewerDecision = 'PENDING';
        item.isSynthetic = Boolean(isFixtureMode);
        item.provenance = isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE';
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
     * Pause a verification run safely at batch boundary.
     */
    static async pauseRun(runId, tenantId, userId, reason = 'Paused by user') {
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found.`);
        }

        if (['COMPLETED', 'CANCELLED', 'POLICY_REJECTED', 'FAILED'].includes(run.status)) {
            return run;
        }

        run.status = 'PAUSED';
        run.pausedBy = userId || null;
        run.pausedAt = new Date();
        run.pauseReason = reason;
        await run.save();

        await logAuditEvent(
            'authority_run_paused',
            userId,
            'authority_run',
            run._id,
            `Verification run ${run._id} paused: ${reason}`,
            { runId: run._id, reason }
        );

        return run;
    }

    /**
     * Safely cancel a verification run.
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

        if (['CANCELLED', 'COMPLETED', 'POLICY_REJECTED'].includes(run.status)) {
            throw new Error(`Cannot resume run in ${run.status} state`);
        }

        // Reset any orphaned PROCESSING items back to PENDING so they are cleanly claimed
        await PropertyVerificationRunItem.updateMany(
            { tenantId, runId: run._id, status: 'PROCESSING' },
            { $set: { status: 'PENDING', claimedBy: null } }
        );

        run.status = 'PROCESSING';
        run.pausedAt = null;
        run.pauseReason = null;
        run.pausedBy = null;
        await run.save();

        await logAuditEvent(
            'authority_run_resumed',
            options.userId || null,
            'authority_run',
            run._id,
            `Verification run ${run._id} resumed`,
            { runId: run._id }
        );

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
            pausedAt: run.pausedAt,
            pauseReason: run.pauseReason,
            isCompleted: ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'POLICY_REJECTED'].includes(run.status)
        };
    }
}

export default AuthorityBulkProcessor;
