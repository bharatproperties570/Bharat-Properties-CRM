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
async function logAuditEvent(eventType, userId, targetType, targetId, description, metadata = {}, status = 'success', options = {}) {
    try {
        let user = null;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            user = await User.findById(userId).select('fullName email').lean();
        }
        const doc = {
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
        };
        if (options?.session) {
            const created = await AuditLog.create([doc], { session: options.session });
            return created[0];
        }
        return await AuditLog.create(doc);
    } catch (err) {
        console.error('[AuthorityBulkProcessor] AuditLog error:', err.message);
        if (options?.throwOnError) {
            const auditErr = new Error(`AUDIT_LOG_PERSISTENCE_FAILED: ${err.message}`);
            auditErr.cause = err;
            throw auditErr;
        }
    }
}

/**
 * Safely inserts documents with ordered: false, trapping expected duplicate key errors (11000)
 * while propagating any unexpected validation, disk, or network database errors.
 */
async function safeInsertMany(Model, docs, { ordered = false } = {}) {
    if (!docs || docs.length === 0) return { insertedCount: 0, duplicateCount: 0 };
    try {
        const result = await Model.insertMany(docs, { ordered });
        return {
            insertedCount: Array.isArray(result) ? result.length : (result.insertedCount || docs.length),
            duplicateCount: 0
        };
    } catch (err) {
        const isDuplicateCode = (code) => code === 11000 || code === 11001;
        const writeErrors = err.writeErrors || err.errorResponse?.writeErrors || [];
        const isAllDuplicates = isDuplicateCode(err.code) || 
            (writeErrors.length > 0 && writeErrors.every(e => isDuplicateCode(e.code)));

        if (isAllDuplicates) {
            const dupCount = writeErrors.length || 1;
            const insCount = Math.max(0, docs.length - dupCount);
            return { insertedCount: insCount, duplicateCount: dupCount };
        }

        // Propagate unexpected validation, network, and database errors
        throw err;
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

const WORKER_LEASE_MS = 30 * 1000; // 30-second worker lease for resilient concurrent batch execution

export { safeInsertMany, WORKER_LEASE_MS };

export class AuthorityBulkProcessor {
    static safeInsertMany = safeInsertMany;
    static WORKER_LEASE_MS = WORKER_LEASE_MS;

    /**
     * Create a new bulk verification run for a list of inventories using bounded operations.
     */
    static async createBulkRun({
        tenantId,
        authorityCode,
        requestedBy,
        inventoryIds = [],
        runMode = 'BULK_MANUAL',
        isFixtureMode = false,
        onlyEligible = false
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
                    await safeInsertMany(PropertyAuthorityLink, linksToCreate, { ordered: false });
                }

                const itemsChunk = [];
                const foundInvMap = new Map(inventories.map(inv => [inv._id.toString(), inv]));

                for (const inv of inventories) {
                    const invIdStr = inv._id.toString();
                    const link = linkMap.get(invIdStr);
                    // Filter for eligible records if requested
                    if (link && (!onlyEligible || link.matchEligibility === 'ELIGIBLE')) {
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

                // If not onlyEligible, create explicit failure items for any requested IDs not found in tenant inventory
                if (!onlyEligible) {
                    for (const reqId of chunkIds) {
                        const reqIdStr = reqId.toString();
                        if (!foundInvMap.has(reqIdStr)) {
                            itemsChunk.push({
                                tenantId,
                                runId: run._id,
                                inventoryId: reqId,
                                linkId: null,
                                authorityCode,
                                status: 'FAILED',
                                errorMessage: 'Inventory record not found in tenant inventory or access denied',
                                isSynthetic: Boolean(isFixtureMode),
                                provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                                processedAt: new Date()
                            });
                        }
                    }
                }

                if (itemsChunk.length > 0) {
                    await safeInsertMany(PropertyVerificationRunItem, itemsChunk, { ordered: false });
                }
            }
        }

        // Reconcile run.totalItems with the actual number of inserted run items
        const actualCount = await PropertyVerificationRunItem.countDocuments({
            tenantId,
            runId: run._id
        });
        run.totalItems = actualCount;
        await run.save();

        await logAuditEvent(
            'authority_run_created',
            requestedBy,
            'authority_run',
            run._id,
            `Bulk verification run created for ${authorityCode} (${actualCount} items, mode: ${runMode}, provenance: ${run.provenance})`,
            { runId: run._id, authorityCode, totalItems: actualCount, runMode, isFixtureMode, tenantId }
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
        const { tenantId, batchSize = 50, onProgress = null } = options;

        if (!tenantId) {
            throw new Error('TENANT_REQUIRED: tenantId must be provided for multi-tenant isolation.');
        }

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            throw new Error(`RUN_NOT_FOUND: Run ${runId} not found for this tenant.`);
        }

        // Derive fixture / live mode strictly from the stored run
        const isFixtureMode = Boolean(run.isFixtureMode);
        if (options.isFixtureMode !== undefined && Boolean(options.isFixtureMode) !== isFixtureMode) {
            throw new Error('MODE_MISMATCH: Requested isFixtureMode does not match persisted run configuration.');
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

        // Check transaction requirement vs capability
        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

        if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true' && !supportsTransactions) {
            return {
                runId: run._id,
                status: 'FAILED',
                code: 'TRANSACTIONS_UNAVAILABLE',
                reason: 'TRANSACTIONS_UNAVAILABLE',
                errorMessage: 'MongoDB replica set transactions required by configuration but not available'
            };
        }

        // Update run state to PROCESSING
        run.status = 'PROCESSING';
        if (!run.startedAt) run.startedAt = new Date();
        await run.save();

        const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
        const workerId = options.workerId || `worker_${new mongoose.Types.ObjectId().toString()}`;
        const workerLeaseMs = options.workerLeaseMs || WORKER_LEASE_MS;
        let hasRemaining = true;
        let emptyWaitAttempts = 0;

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
                // Pause safely at batch boundary without prematurely resetting items
                return {
                    runId: run._id,
                    status: 'PAUSED',
                    pauseReason: checkRun.pauseReason,
                    processedItems: run.processedItems
                };
            }

            // Find candidates for processing: PENDING or expired stale worker leases
            const now = new Date();
            const candidates = await PropertyVerificationRunItem.find({
                tenantId,
                runId: run._id,
                $or: [
                    { status: 'PENDING' },
                    { status: 'PROCESSING', leaseExpiresAt: { $lt: now } }
                ]
            })
                .select('_id')
                .sort({ _id: 1 })
                .limit(safeBatchSize)
                .lean();

            if (candidates.length === 0) {
                // Check if any items are still being processed by other active workers
                const stillProcessing = await PropertyVerificationRunItem.countDocuments({
                    tenantId,
                    runId: run._id,
                    status: 'PROCESSING',
                    leaseExpiresAt: { $gte: now }
                });

                const maxWaitAttempts = options.maxWaitAttempts !== undefined ? options.maxWaitAttempts : 3;
                if (stillProcessing > 0 && emptyWaitAttempts < maxWaitAttempts) {
                    emptyWaitAttempts++;
                    await new Promise(r => setTimeout(r, options.waitIntervalMs || 50));
                    continue;
                }

                // Check if any items are pending
                const pendingCount = await PropertyVerificationRunItem.countDocuments({
                    tenantId,
                    runId: run._id,
                    status: 'PENDING'
                });

                if (pendingCount > 0 && emptyWaitAttempts < maxWaitAttempts) {
                    emptyWaitAttempts++;
                    await new Promise(r => setTimeout(r, options.waitIntervalMs || 50));
                    continue;
                }

                hasRemaining = false;
                break;
            }
            emptyWaitAttempts = 0;

            // Atomically claim items for this worker with an expiring worker lease
            const claimedItems = [];
            for (const cand of candidates) {
                const claimTime = new Date();
                const leaseExpiresAt = new Date(claimTime.getTime() + workerLeaseMs);
                const claimed = await PropertyVerificationRunItem.findOneAndUpdate(
                    {
                        _id: cand._id,
                        tenantId,
                        $or: [
                            { status: 'PENDING' },
                            { status: 'PROCESSING', leaseExpiresAt: { $lt: claimTime } }
                        ]
                    },
                    {
                        $set: {
                            status: 'PROCESSING',
                            claimedBy: workerId,
                            claimedAt: claimTime,
                            leaseExpiresAt: leaseExpiresAt
                        }
                    },
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
                    // Enforce per-item worker lease renewal right before processing
                    const renewed = await this.renewItemLease(item._id, tenantId, workerId, workerLeaseMs);
                    if (!renewed) {
                        // Another worker reclaimed this item after lease expiry, or lease expired
                        continue;
                    }
                    item.leaseExpiresAt = renewed.leaseExpiresAt;

                    if (typeof options.beforeItemProcessing === 'function') {
                        await options.beforeItemProcessing(item, workerId);
                    }

                    if (Boolean(item.isSynthetic) !== isFixtureMode) {
                        const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                            item._id,
                            tenantId,
                            workerId,
                            {
                                status: 'FAILED',
                                errorMessage: 'MODE_MISMATCH: Item synthetic flag does not match run mode',
                                processedAt: new Date()
                            }
                        );
                        if (finalized) {
                            batchFailed++;
                        }
                        continue;
                    }

                    const result = await this.processItem(item, {
                        tenantId,
                        isFixtureMode,
                        authorityCode: run.authorityCode,
                        workerId,
                        beforeSnapshotPersistence: options.beforeSnapshotPersistence,
                        beforeOrphanCleanup: options.beforeOrphanCleanup,
                        afterOrphanPurged: options.afterOrphanPurged,
                        disableOrphanRecovery: options.disableOrphanRecovery
                    });

                    if (result.success && !result.alreadyProcessed) {
                        batchSucceeded++;
                    } else if (result.success && result.alreadyProcessed) {
                        // Already processed by another worker — avoid double-counting
                    } else if (!result.ownershipLost) {
                        batchFailed++;
                    }
                } catch (itemErr) {
                    const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                        item._id,
                        tenantId,
                        workerId,
                        {
                            status: 'FAILED',
                            errorMessage: itemErr.message || 'Item processing error',
                            processedAt: new Date()
                        }
                    );
                    if (finalized) {
                        batchFailed++;
                    }
                }
            }

            // Atomically increment run counters by actually committed items to prevent duplicate counters
            const batchCommitted = batchSucceeded + batchFailed;
            if (batchCommitted > 0) {
                await PropertyVerificationRun.updateOne(
                    { _id: runId, tenantId },
                    {
                        $inc: {
                            processedItems: batchCommitted,
                            succeededItems: batchSucceeded,
                            failedItems: batchFailed
                        }
                    }
                );
            }

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

        // Check authoritative terminal state: do NOT finalize run while active leases or pending items exist
        const nonTerminalCount = await PropertyVerificationRunItem.countDocuments({
            tenantId,
            runId: run._id,
            status: { $in: ['PENDING', 'PROCESSING'] }
        });

        if (nonTerminalCount > 0) {
            const currentRun = await PropertyVerificationRun.findById(runId);
            return {
                runId: run._id,
                status: currentRun?.status || 'PROCESSING',
                totalItems: run.totalItems,
                processedItems: currentRun?.processedItems || 0,
                succeededItems: currentRun?.succeededItems || 0,
                failedItems: currentRun?.failedItems || 0
            };
        }

        // Finalize run status directly from authoritative item states in database
        const finalCounts = await PropertyVerificationRunItem.aggregate([
            { $match: { runId: run._id, tenantId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const countMap = Object.fromEntries(finalCounts.map(c => [c._id, c.count]));
        const totalSucceeded = countMap.SUCCEEDED || 0;
        const totalFailed = (countMap.FAILED || 0) + (countMap.NO_MATCH || 0) + (countMap.SKIPPED || 0);
        const totalProcessed = totalSucceeded + totalFailed;

        const finalStatus = totalFailed === 0
            ? 'COMPLETED'
            : (totalSucceeded > 0 ? 'PARTIAL' : 'FAILED');

        const completedAt = new Date();
        const completedRun = await PropertyVerificationRun.findOneAndUpdate(
            { _id: runId, tenantId, status: { $nin: ['CANCELLED', 'PAUSED', 'COMPLETED', 'PARTIAL', 'FAILED'] } },
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
     * Atomically finalizes a RunItem state conditional upon active worker lease ownership.
     * Prevents a stale/expired worker from overwriting state or clearing the lease
     * of a new worker that may have reclaimed the item.
     * 
     * @param {string|mongoose.Types.ObjectId} itemId
     * @param {string|mongoose.Types.ObjectId} tenantId
     * @param {string|null} workerId
     * @param {Object} updateFields
     * @param {mongoose.ClientSession} [session=null]
     * @returns {Promise<PropertyVerificationRunItem|null>}
     */
    static async _finalizeItemWithOwnershipCheck(itemId, tenantId, workerId, updateFields, session = null) {
        const now = new Date();
        const query = {
            _id: itemId,
            tenantId,
            status: 'PROCESSING'
        };

        if (workerId) {
            query.claimedBy = workerId;
            query.leaseExpiresAt = { $gt: now };
        }

        const opts = { new: true };
        if (session) {
            opts.session = session;
        }

        return PropertyVerificationRunItem.findOneAndUpdate(
            query,
            {
                $set: {
                    ...updateFields,
                    leaseExpiresAt: null
                }
            },
            opts
        );
    }

    /**
     * Atomically updates an item's recovery state conditional upon active worker lease ownership.
     * Fences every orphan-recovery success and failure update:
     * - _id
     * - tenantId
     * - status: 'PROCESSING'
     * - claimedBy: workerId
     * - leaseExpiresAt: { $gt: now }
     *
     * If the update does not match exactly one active owner, returns null (indicating ownershipLost).
     * 
     * @param {string|mongoose.Types.ObjectId} itemId
     * @param {string|mongoose.Types.ObjectId} tenantId
     * @param {string} workerId
     * @param {Object} updateOps ($set, $inc, etc.)
     * @param {mongoose.ClientSession} [session=null]
     * @returns {Promise<PropertyVerificationRunItem|null>}
     */
    static async _updateOrphanRecoveryStateWithOwnershipCheck(itemId, tenantId, workerId, updateOps, session = null) {
        if (!itemId || !tenantId || !workerId) return null;
        const now = new Date();
        const query = {
            _id: itemId,
            tenantId,
            status: 'PROCESSING',
            claimedBy: workerId,
            leaseExpiresAt: { $gt: now }
        };

        const opts = { new: true };
        if (session) {
            opts.session = session;
        }

        return PropertyVerificationRunItem.findOneAndUpdate(query, updateOps, opts);
    }

    /**
     * Verify that a worker holds an active, non-expired lease for an in-flight run item.
     * 
     * @param {string|mongoose.Types.ObjectId} itemId
     * @param {string|mongoose.Types.ObjectId} tenantId
     * @param {string|null} workerId
     * @param {mongoose.ClientSession} [session=null]
     * @returns {Promise<PropertyVerificationRunItem|null>}
     */
    static async _verifyWorkerLeaseOwnership(itemId, tenantId, workerId, session = null) {
        if (!itemId || !tenantId) return null;
        const now = new Date();
        const query = {
            _id: itemId,
            tenantId,
            status: 'PROCESSING'
        };

        if (workerId) {
            query.claimedBy = workerId;
            query.leaseExpiresAt = { $gt: now };
        }

        const queryObj = PropertyVerificationRunItem.findOne(query);
        if (session) {
            queryObj.session(session);
        }
        return queryObj;
    }

    /**
     * Renew active worker lease for an in-flight run item.
     * 
     * @param {string|mongoose.Types.ObjectId} itemId 
     * @param {string|mongoose.Types.ObjectId} tenantId 
     * @param {string} workerId 
     * @param {number} [leaseDurationMs=WORKER_LEASE_MS]
     * @returns {Promise<PropertyVerificationRunItem|null>}
     */
    static async renewItemLease(itemId, tenantId, workerId, leaseDurationMs = WORKER_LEASE_MS) {
        if (!itemId || !tenantId || !workerId) return null;
        const now = new Date();
        const newExpiry = new Date(now.getTime() + leaseDurationMs);
        return PropertyVerificationRunItem.findOneAndUpdate(
            {
                _id: itemId,
                tenantId,
                claimedBy: workerId,
                status: 'PROCESSING',
                leaseExpiresAt: { $gt: now }
            },
            {
                $set: { leaseExpiresAt: newExpiry }
            },
            { new: true }
        );
    }

    /**
     * Process an individual RunItem.
     * Safe, idempotent, and error-isolated.
     */
    static async processItem(item, options = {}) {
        const {
            tenantId,
            isFixtureMode = true,
            authorityCode,
            workerId,
            beforeSnapshotPersistence,
            beforeOrphanCleanup,
            afterOrphanPurged,
            disableOrphanRecovery = false
        } = options;
        const effectiveWorkerId = workerId || item.claimedBy || null;

        if (item.status === 'SUCCEEDED' && item.snapshotId) {
            return { success: true, alreadyProcessed: true };
        }

        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

        if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true' && !supportsTransactions) {
            return {
                success: false,
                code: 'TRANSACTIONS_UNAVAILABLE',
                reason: 'TRANSACTIONS_UNAVAILABLE',
                errorMessage: 'MongoDB replica set transactions required by configuration but not available'
            };
        }

        // 1. Fetch link & inventory with tenant isolation (or use pre-populated docs)
        const link = (item.linkId && typeof item.linkId === 'object' && item.linkId.authorityCode && String(item.linkId.tenantId) === String(tenantId))
            ? item.linkId
            : await PropertyAuthorityLink.findOne({ _id: item.linkId, tenantId });

        if (!link) {
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'FAILED',
                    errorMessage: 'Authority link not found or cross-tenant access rejected',
                    processedAt: new Date()
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
            return { success: false, reason: 'LINK_NOT_FOUND' };
        }

        const inventory = (item.inventoryId && typeof item.inventoryId === 'object' && item.inventoryId.unitNo && String(item.inventoryId.tenantId) === String(tenantId))
            ? item.inventoryId
            : await Inventory.findOne({ _id: item.inventoryId, tenantId });

        if (!inventory) {
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'FAILED',
                    errorMessage: 'Inventory record not found or cross-tenant access rejected',
                    processedAt: new Date()
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
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
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'FAILED',
                    matchStatus: 'IDENTITY_MISMATCH',
                    errorMessage: 'Incomplete identity: propertyId and sectorNumber are required',
                    processedAt: new Date(),
                    isSynthetic: Boolean(isFixtureMode),
                    provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE'
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
            return { success: false, reason: 'INCOMPLETE_IDENTITY' };
        }

        // 3. Execution boundary: Live vs Fixture
        if (!isFixtureMode) {
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'FAILED',
                    errorMessage: 'Live authority verification is disabled. Authorization status: NOT_OBTAINED.',
                    processedAt: new Date(),
                    isSynthetic: false,
                    provenance: 'LIVE'
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
            return { success: false, reason: 'LIVE_DISABLED' };
        }

        // 4. Concurrency Protection & Orphan Recovery:
        // Case 4A: Check if prior worker crashed after purging snapshot but before completing audit/recovery-state update
        if (!item.snapshotId && item.recoveryState?.stage === 'ORPHAN_DETECTED') {
            const existingSnapshotForCheck = await PropertyVerificationSnapshot.findOne({
                runItemId: item._id,
                tenantId
            });

            if (!existingSnapshotForCheck) {
                // Prior worker crashed after snapshot was purged! Reconcile missing audit and mark recovery state.
                const activeLease = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                    item._id,
                    tenantId,
                    effectiveWorkerId
                );
                if (!activeLease) {
                    return {
                        success: false,
                        reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                        ownershipLost: true
                    };
                }

                await logAuditEvent(
                    'authority_orphan_snapshot_purged',
                    item.requestedBy || null,
                    'authority_snapshot',
                    item.recoveryState.orphanedSnapshotId,
                    `Unfinalized orphan snapshot ${item.recoveryState.orphanedSnapshotId} purged by prior worker, reconciled after crash by worker ${effectiveWorkerId}`,
                    {
                        snapshotId: item.recoveryState.orphanedSnapshotId,
                        runItemId: item._id,
                        tenantId,
                        orphanedByWorkerId: item.recoveryState.orphanedByWorkerId,
                        recoveredByWorkerId: effectiveWorkerId,
                        reconciledAfterCrash: true
                    },
                    'success',
                    { throwOnError: true }
                );

                const recoveredItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                    item._id,
                    tenantId,
                    effectiveWorkerId,
                    {
                        $set: {
                            'recoveryState.stage': 'ORPHAN_RECOVERED',
                            'recoveryState.recoveredByWorkerId': effectiveWorkerId,
                            'recoveryState.recoveredAt': new Date(),
                            'recoveryState.error': null,
                            'recoveryState.crashReconciled': true
                        },
                        $inc: { 'recoveryState.retryCount': 1 }
                    }
                );

                if (!recoveredItem) {
                    return {
                        success: false,
                        reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                        ownershipLost: true
                    };
                }
            }
        }

        // Check if a snapshot already exists for this run item
        const existingSnapshot = await PropertyVerificationSnapshot.findOne({
            runItemId: item._id,
            tenantId
        });
        if (existingSnapshot) {
            // Check if snapshot is already bound to this finalized item
            const isAlreadyBound = item.snapshotId && String(item.snapshotId) === String(existingSnapshot._id);
            if (isAlreadyBound) {
                return { success: true, snapshotId: existingSnapshot._id, alreadyProcessed: true };
            }

            // Check if snapshot was created by active worker in current lease attempt
            const isOwnedByCurrentWorker = effectiveWorkerId && existingSnapshot.createdByWorkerId === effectiveWorkerId;
            if (isOwnedByCurrentWorker) {
                const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                    item._id,
                    tenantId,
                    effectiveWorkerId,
                    {
                        status: 'SUCCEEDED',
                        snapshotId: existingSnapshot._id,
                        isSynthetic: true,
                        provenance: 'SYNTHETIC_FIXTURE',
                        processedAt: new Date()
                    }
                );
                if (!finalized) {
                    return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
                }
                return { success: true, snapshotId: existingSnapshot._id };
            }

            // Snapshot exists from a different or stale worker and item was NOT finalized.
            // This is an unfinalized orphan snapshot from a crashed or expired worker.
            if (disableOrphanRecovery) {
                return {
                    success: false,
                    reason: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                    code: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                    ownershipLost: true
                };
            }

            // Verify active worker holds valid lease before attempting orphan cleanup
            const activeLease = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                item._id,
                tenantId,
                effectiveWorkerId
            );
            if (!activeLease) {
                return {
                    success: false,
                    reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                    ownershipLost: true
                };
            }

            if (supportsTransactions) {
                let session = null;
                try {
                    session = await mongoose.startSession();
                    session.startTransaction();

                    // Fenced verification within transaction
                    const inTxLease = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        session
                    );
                    if (!inTxLease) {
                        await session.abortTransaction();
                        await session.endSession();
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    if (typeof beforeOrphanCleanup === 'function') {
                        await beforeOrphanCleanup(existingSnapshot, effectiveWorkerId);
                    }

                    // Purge orphan snapshot within transaction
                    const purgeRes = await PropertyVerificationSnapshot.purgeOrphanedSnapshot({
                        tenantId,
                        runItemId: item._id,
                        snapshotId: existingSnapshot._id,
                        createdByWorkerId: existingSnapshot.createdByWorkerId,
                        session
                    });

                    const isDeleted = (typeof purgeRes === 'boolean' && purgeRes) ||
                        (typeof purgeRes === 'number' && purgeRes > 0) ||
                        (purgeRes && typeof purgeRes === 'object' && purgeRes.deletedCount > 0);

                    if (!isDeleted) {
                        throw new Error(`ORPHAN_DELETION_UNCONFIRMED: Snapshot purge returned deletedCount: ${purgeRes?.deletedCount ?? 0}`);
                    }

                    if (typeof afterOrphanPurged === 'function') {
                        await afterOrphanPurged(existingSnapshot, effectiveWorkerId);
                    }

                    // Audit log within transaction
                    await logAuditEvent(
                        'authority_orphan_snapshot_purged',
                        item.requestedBy || null,
                        'authority_snapshot',
                        existingSnapshot._id,
                        `Unfinalized orphan snapshot ${existingSnapshot._id} purged during crash recovery by worker ${effectiveWorkerId}`,
                        {
                            snapshotId: existingSnapshot._id,
                            runItemId: item._id,
                            tenantId,
                            orphanedByWorkerId: existingSnapshot.createdByWorkerId,
                            recoveredByWorkerId: effectiveWorkerId,
                            contentHash: existingSnapshot.contentHash,
                            authorityCode: existingSnapshot.authorityCode
                        },
                        'success',
                        { session, throwOnError: true }
                    );

                    // Fenced recovery state update within transaction
                    const recoveredItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            $set: {
                                'recoveryState.stage': 'ORPHAN_RECOVERED',
                                'recoveryState.orphanedSnapshotId': existingSnapshot._id,
                                'recoveryState.orphanedByWorkerId': existingSnapshot.createdByWorkerId,
                                'recoveryState.recoveredByWorkerId': effectiveWorkerId,
                                'recoveryState.recoveredAt': new Date(),
                                'recoveryState.error': null
                            },
                            $inc: { 'recoveryState.retryCount': 1 }
                        },
                        session
                    );

                    if (!recoveredItem) {
                        await session.abortTransaction();
                        await session.endSession();
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    await session.commitTransaction();
                    await session.endSession();
                } catch (txErr) {
                    if (session) {
                        try { await session.abortTransaction(); } catch (_) {}
                        try { await session.endSession(); } catch (_) {}
                    }

                    const leaseStillValid = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                        item._id,
                        tenantId,
                        effectiveWorkerId
                    );
                    if (!leaseStillValid) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    let auditError = null;
                    try {
                        await logAuditEvent(
                            'authority_orphan_cleanup_failed',
                            item.requestedBy || null,
                            'authority_snapshot',
                            existingSnapshot._id,
                            `Failed to purge orphaned snapshot ${existingSnapshot._id} in transaction: ${txErr.message}`,
                            {
                                snapshotId: existingSnapshot._id,
                                runItemId: item._id,
                                tenantId,
                                orphanedByWorkerId: existingSnapshot.createdByWorkerId,
                                workerId: effectiveWorkerId,
                                error: txErr.message
                            },
                            'failure',
                            { throwOnError: true }
                        );
                    } catch (logErr) {
                        auditError = logErr;
                        console.error('[AuthorityBulkProcessor] AuditLog failure during transaction cleanup error recording:', logErr.message);
                    }

                    const combinedErrorMessage = auditError
                        ? `ORPHAN_CLEANUP_FAILED: ${txErr.message}; AUDIT_LOG_FAILED: ${auditError.message}`
                        : `ORPHAN_CLEANUP_FAILED: ${txErr.message}`;

                    const failedItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            $set: {
                                'recoveryState.stage': 'CLEANUP_FAILED',
                                'recoveryState.orphanedSnapshotId': existingSnapshot._id,
                                'recoveryState.orphanedByWorkerId': existingSnapshot.createdByWorkerId,
                                'recoveryState.failedAt': new Date(),
                                'recoveryState.error': combinedErrorMessage,
                                status: 'FAILED',
                                errorMessage: combinedErrorMessage,
                                processedAt: new Date(),
                                leaseExpiresAt: null
                            },
                            $inc: { 'recoveryState.retryCount': 1 }
                        }
                    );

                    if (!failedItem) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    return {
                        success: false,
                        reason: 'ORPHAN_CLEANUP_FAILED',
                        code: 'ORPHAN_CLEANUP_FAILED',
                        error: combinedErrorMessage,
                        auditError: auditError ? auditError.message : null,
                        ownershipLost: false
                    };
                }
            } else {
                // Standalone mode without transactions: durable fail-closed recovery lifecycle
                try {
                    if (typeof beforeOrphanCleanup === 'function') {
                        await beforeOrphanCleanup(existingSnapshot, effectiveWorkerId);
                    }

                    // 1. Re-verify lease immediately before purge
                    const leaseStillValid = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                        item._id,
                        tenantId,
                        effectiveWorkerId
                    );
                    if (!leaseStillValid) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    // 2. Stage ORPHAN_DETECTED state on RunItem with fenced ownership check
                    const stagedItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            $set: {
                                'recoveryState.stage': 'ORPHAN_DETECTED',
                                'recoveryState.orphanedSnapshotId': existingSnapshot._id,
                                'recoveryState.orphanedByWorkerId': existingSnapshot.createdByWorkerId,
                                'recoveryState.recoveredByWorkerId': effectiveWorkerId,
                                'recoveryState.detectedAt': new Date()
                            }
                        }
                    );
                    if (!stagedItem) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    // 3. Purge orphaned snapshot
                    const purgeRes = await PropertyVerificationSnapshot.purgeOrphanedSnapshot({
                        tenantId,
                        runItemId: item._id,
                        snapshotId: existingSnapshot._id,
                        createdByWorkerId: existingSnapshot.createdByWorkerId
                    });

                    const isDeleted = (typeof purgeRes === 'boolean' && purgeRes) ||
                        (typeof purgeRes === 'number' && purgeRes > 0) ||
                        (purgeRes && typeof purgeRes === 'object' && purgeRes.deletedCount > 0);

                    if (!isDeleted) {
                        const activeLeaseAfterPurge = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                            item._id,
                            tenantId,
                            effectiveWorkerId
                        );
                        if (!activeLeaseAfterPurge) {
                            return {
                                success: false,
                                reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                                ownershipLost: true
                            };
                        }
                        throw new Error(`ORPHAN_DELETION_UNCONFIRMED: Snapshot purge returned deletedCount: ${purgeRes?.deletedCount ?? 0}`);
                    }

                    if (typeof afterOrphanPurged === 'function') {
                        await afterOrphanPurged(existingSnapshot, effectiveWorkerId);
                    }

                    // 4. Observable audit persistence (throwOnError: true)
                    await logAuditEvent(
                        'authority_orphan_snapshot_purged',
                        item.requestedBy || null,
                        'authority_snapshot',
                        existingSnapshot._id,
                        `Unfinalized orphan snapshot ${existingSnapshot._id} purged during crash recovery by worker ${effectiveWorkerId}`,
                        {
                            snapshotId: existingSnapshot._id,
                            runItemId: item._id,
                            tenantId,
                            orphanedByWorkerId: existingSnapshot.createdByWorkerId,
                            recoveredByWorkerId: effectiveWorkerId,
                            contentHash: existingSnapshot.contentHash,
                            authorityCode: existingSnapshot.authorityCode
                        },
                        'success',
                        { throwOnError: true }
                    );

                    // 5. Fenced update: MUST match current worker ownership and unexpired lease
                    const recoveredItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            $set: {
                                'recoveryState.stage': 'ORPHAN_RECOVERED',
                                'recoveryState.orphanedSnapshotId': existingSnapshot._id,
                                'recoveryState.orphanedByWorkerId': existingSnapshot.createdByWorkerId,
                                'recoveryState.recoveredByWorkerId': effectiveWorkerId,
                                'recoveryState.recoveredAt': new Date(),
                                'recoveryState.error': null
                            },
                            $inc: { 'recoveryState.retryCount': 1 }
                        }
                    );

                    if (!recoveredItem) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }
                } catch (cleanupErr) {
                    const leaseStillValid = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                        item._id,
                        tenantId,
                        effectiveWorkerId
                    );
                    if (!leaseStillValid) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    let auditError = null;
                    try {
                        await logAuditEvent(
                            'authority_orphan_cleanup_failed',
                            item.requestedBy || null,
                            'authority_snapshot',
                            existingSnapshot._id,
                            `Failed to purge orphaned snapshot ${existingSnapshot._id}: ${cleanupErr.message}`,
                            {
                                snapshotId: existingSnapshot._id,
                                runItemId: item._id,
                                tenantId,
                                orphanedByWorkerId: existingSnapshot.createdByWorkerId,
                                workerId: effectiveWorkerId,
                                error: cleanupErr.message
                            },
                            'failure',
                            { throwOnError: true }
                        );
                    } catch (logErr) {
                        auditError = logErr;
                        console.error('[AuthorityBulkProcessor] AuditLog failure during cleanup error recording:', logErr.message);
                    }

                    const combinedErrorMessage = auditError
                        ? `ORPHAN_CLEANUP_FAILED: ${cleanupErr.message}; AUDIT_LOG_FAILED: ${auditError.message}`
                        : `ORPHAN_CLEANUP_FAILED: ${cleanupErr.message}`;

                    const failedItem = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            $set: {
                                'recoveryState.stage': 'CLEANUP_FAILED',
                                'recoveryState.orphanedSnapshotId': existingSnapshot._id,
                                'recoveryState.orphanedByWorkerId': existingSnapshot.createdByWorkerId,
                                'recoveryState.failedAt': new Date(),
                                'recoveryState.error': combinedErrorMessage,
                                status: 'FAILED',
                                errorMessage: combinedErrorMessage,
                                processedAt: new Date(),
                                leaseExpiresAt: null
                            },
                            $inc: { 'recoveryState.retryCount': 1 }
                        }
                    );

                    if (!failedItem) {
                        return {
                            success: false,
                            reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                            ownershipLost: true
                        };
                    }

                    return {
                        success: false,
                        reason: 'ORPHAN_CLEANUP_FAILED',
                        code: 'ORPHAN_CLEANUP_FAILED',
                        error: combinedErrorMessage,
                        auditError: auditError ? auditError.message : null,
                        ownershipLost: false
                    };
                }
            }
        }

        // 5. Fixture pipeline execution
        const rawFixture = getSyntheticFixtureForLink(auth, link, inventory);
        if (!rawFixture) {
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'NO_MATCH',
                    matchStatus: 'NO_MATCH',
                    errorMessage: `No fixture available for authority ${item.authorityCode} with current identity`,
                    processedAt: new Date(),
                    isSynthetic: Boolean(isFixtureMode),
                    provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE'
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
            return { success: false, reason: 'NO_FIXTURE' };
        }

        const candidate = executeFixturePipeline(item.authorityCode, rawFixture, inventory);

        if (candidate.status === 'REJECTED_QUALITY') {
            const finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'FAILED',
                    matchStatus: 'NOT_ATTEMPTED',
                    errorMessage: `Quality rejection: ${(candidate.errors || []).join('; ')}`,
                    processedAt: new Date(),
                    isSynthetic: Boolean(isFixtureMode),
                    provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE'
                }
            );
            if (!finalized) {
                return { success: false, reason: 'LEASE_EXPIRED_OR_PREEMPTED', ownershipLost: true };
            }
            return { success: false, reason: 'QUALITY_REJECTED' };
        }

        // In-flight hook prior to snapshot persistence for testing deterministic races
        if (typeof beforeSnapshotPersistence === 'function') {
            await beforeSnapshotPersistence(item, effectiveWorkerId, candidate);
        }

        // Fail-closed lease ownership check immediately before snapshot persistence
        const preCheck = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
            item._id,
            tenantId,
            effectiveWorkerId
        );
        if (!preCheck) {
            return {
                success: false,
                reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                ownershipLost: true
            };
        }

        // 6. Create immutable verification snapshot with explicit synthetic provenance & worker identity
        const snapshotPayload = {
            tenantId,
            authorityCode: item.authorityCode,
            linkId: link._id,
            runItemId: item._id,
            createdByWorkerId: effectiveWorkerId || null,
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
            contentHash: candidate.contentHash || null,
            isSealed: true,
            dataQualityStatus: ['READY_FOR_REVIEW', 'VERIFIED_OFFICIAL'].includes(candidate.status) ? 'COMPLETE' : 'PARTIAL'
        };

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

        const matchStatus = candidate.matchEvidence?.confidence === 'EXACT'
            ? 'EXACT_MATCH'
            : (candidate.matchEvidence?.confidence === 'PARTIAL' ? 'PARTIAL_MATCH' : 'NO_MATCH');

        let snapshot = null;
        let finalized = null;

        if (supportsTransactions) {
            let session = null;
            try {
                session = await mongoose.startSession();
                session.startTransaction();

                // Fenced verification within transaction
                const inTxLease = await AuthorityBulkProcessor._verifyWorkerLeaseOwnership(
                    item._id,
                    tenantId,
                    effectiveWorkerId,
                    session
                );
                if (!inTxLease) {
                    await session.abortTransaction();
                    await session.endSession();
                    return {
                        success: false,
                        reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                        ownershipLost: true
                    };
                }

                // Create snapshot inside transaction
                const createdDocs = await PropertyVerificationSnapshot.create([snapshotPayload], { session });
                snapshot = createdDocs[0];

                // Finalize item inside transaction
                finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                    item._id,
                    tenantId,
                    effectiveWorkerId,
                    {
                        status: 'SUCCEEDED',
                        matchStatus,
                        snapshotId: snapshot._id,
                        proposedChanges,
                        reviewerDecision: 'PENDING',
                        isSynthetic: Boolean(isFixtureMode),
                        provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                        processedAt: new Date(),
                        errorMessage: null
                    },
                    session
                );

                if (!finalized) {
                    await session.abortTransaction();
                    await session.endSession();
                    return {
                        success: false,
                        reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                        ownershipLost: true
                    };
                }

                await session.commitTransaction();
                await session.endSession();
            } catch (txErr) {
                if (session) {
                    try {
                        if (session.inTransaction()) {
                            await session.abortTransaction();
                        }
                    } catch {}
                    try {
                        await session.endSession();
                    } catch {}
                }

                if (txErr.code === 11000) {
                    const existingSnap = await PropertyVerificationSnapshot.findOne({
                        tenantId,
                        runItemId: item._id
                    });
                    if (existingSnap && effectiveWorkerId && existingSnap.createdByWorkerId && existingSnap.createdByWorkerId !== effectiveWorkerId) {
                        return {
                            success: false,
                            reason: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                            code: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                            ownershipLost: true
                        };
                    }
                }
                throw txErr;
            }
        } else {
            // Standalone MongoDB path
            try {
                snapshot = await PropertyVerificationSnapshot.create(snapshotPayload);
            } catch (snapErr) {
                if (snapErr.code === 11000) {
                    const existingSnap = await PropertyVerificationSnapshot.findOne({
                        tenantId,
                        runItemId: item._id
                    });
                    if (existingSnap) {
                        if (effectiveWorkerId && existingSnap.createdByWorkerId && existingSnap.createdByWorkerId !== effectiveWorkerId) {
                            return {
                                success: false,
                                reason: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                                code: 'STALE_SNAPSHOT_ADOPTION_REJECTED',
                                ownershipLost: true
                            };
                        }
                        snapshot = existingSnap;
                    } else {
                        throw snapErr;
                    }
                } else {
                    // Database / persistence failure during snapshot insert
                    const failFinalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                        item._id,
                        tenantId,
                        effectiveWorkerId,
                        {
                            status: 'FAILED',
                            errorMessage: `SNAPSHOT_PERSISTENCE_FAILED: ${snapErr.message}`,
                            processedAt: new Date()
                        }
                    );
                    return {
                        success: false,
                        reason: 'SNAPSHOT_PERSISTENCE_FAILED',
                        code: 'SNAPSHOT_PERSISTENCE_FAILED',
                        error: snapErr.message,
                        ownershipLost: !failFinalized
                    };
                }
            }

            finalized = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantId,
                effectiveWorkerId,
                {
                    status: 'SUCCEEDED',
                    matchStatus,
                    snapshotId: snapshot._id,
                    proposedChanges,
                    reviewerDecision: 'PENDING',
                    isSynthetic: Boolean(isFixtureMode),
                    provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                    processedAt: new Date(),
                    errorMessage: null
                }
            );

            if (!finalized) {
                // Standalone rollback: clean up orphaned snapshot using audited purge method so unique index is not blocked
                if (snapshot && snapshot._id) {
                    try {
                        const purgeRes = await PropertyVerificationSnapshot.purgeOrphanedSnapshot({
                            tenantId,
                            runItemId: item._id,
                            snapshotId: snapshot._id,
                            createdByWorkerId: effectiveWorkerId
                        });
                        const isDeleted = (typeof purgeRes === 'boolean' && purgeRes) ||
                            (typeof purgeRes === 'number' && purgeRes > 0) ||
                            (purgeRes && typeof purgeRes === 'object' && purgeRes.deletedCount > 0);
                        if (!isDeleted) {
                            throw new Error(`ORPHAN_DELETION_UNCONFIRMED: Snapshot purge returned deletedCount: ${purgeRes?.deletedCount ?? 0}`);
                        }
                        await logAuditEvent(
                            'authority_orphan_snapshot_purged',
                            item.requestedBy || null,
                            'authority_snapshot',
                            snapshot._id,
                            `Orphaned snapshot ${snapshot._id} purged after worker lease preemption during finalization`,
                            {
                                snapshotId: snapshot._id,
                                runItemId: item._id,
                                tenantId,
                                workerId: effectiveWorkerId,
                                reason: 'FINALIZATION_OWNERSHIP_LOST'
                            },
                            'success',
                            { throwOnError: true }
                        );
                    } catch (cleanupErr) {
                        // Never suppress cleanup failure: record durable recovery state and audit event
                        let auditError = null;
                        try {
                            await logAuditEvent(
                                'authority_orphan_cleanup_failed',
                                item.requestedBy || null,
                                'authority_snapshot',
                                snapshot._id,
                                `Failed to purge orphaned snapshot ${snapshot._id} after preemption: ${cleanupErr.message}`,
                                {
                                    snapshotId: snapshot._id,
                                    runItemId: item._id,
                                    tenantId,
                                    workerId: effectiveWorkerId,
                                    error: cleanupErr.message
                                },
                                'failure',
                                { throwOnError: true }
                            );
                        } catch (auditErr) {
                            auditError = auditErr;
                            console.error('[AuthorityBulkProcessor] Critical: orphan cleanup failure audit log failed in standalone rollback:', auditErr.message);
                        }

                        const combinedErrorMessage = auditError
                            ? `CLEANUP_FAILED: ${cleanupErr.message}; AUDIT_LOG_FAILED: ${auditError.message}`
                            : `CLEANUP_FAILED: ${cleanupErr.message}`;

                        // Fenced failure update: check whether fenced update matched active owner
                        const fencedRes = await AuthorityBulkProcessor._updateOrphanRecoveryStateWithOwnershipCheck(
                            item._id,
                            tenantId,
                            effectiveWorkerId,
                            {
                                $set: {
                                    'recoveryState.stage': 'CLEANUP_FAILED',
                                    'recoveryState.orphanedSnapshotId': snapshot._id,
                                    'recoveryState.orphanedByWorkerId': effectiveWorkerId,
                                    'recoveryState.failedAt': new Date(),
                                    'recoveryState.error': combinedErrorMessage
                                }
                            }
                        );
                        if (!fencedRes) {
                            console.warn(`[AuthorityBulkProcessor] Stale worker ${effectiveWorkerId} lost ownership during rollback failure recording; state preserved for replacement worker.`);
                        }
                    }
                }
                return {
                    success: false,
                    reason: 'LEASE_EXPIRED_OR_PREEMPTED',
                    ownershipLost: true
                };
            }
        }

        item.status = 'SUCCEEDED';
        item.matchStatus = matchStatus;
        item.snapshotId = snapshot._id;
        item.proposedChanges = proposedChanges;
        item.reviewerDecision = 'PENDING';
        item.isSynthetic = Boolean(isFixtureMode);
        item.provenance = isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE';
        item.processedAt = finalized.processedAt;
        item.errorMessage = null;
        item.leaseExpiresAt = null;

        return {
            success: true,
            itemId: item._id,
            snapshotId: snapshot._id,
            matchStatus,
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

        // Derive fixture/live mode from stored run
        const isFixtureMode = Boolean(run.isFixtureMode);
        if (options.isFixtureMode !== undefined && Boolean(options.isFixtureMode) !== isFixtureMode) {
            throw new Error('MODE_MISMATCH: Requested isFixtureMode does not match persisted run configuration.');
        }

        // Reclaim ONLY genuinely abandoned/stale worker claims whose lease has expired
        const now = new Date();
        await PropertyVerificationRunItem.updateMany(
            {
                tenantId,
                runId: run._id,
                status: 'PROCESSING',
                leaseExpiresAt: { $lt: now }
            },
            {
                $set: {
                    status: 'PENDING',
                    claimedBy: null,
                    claimedAt: null,
                    leaseExpiresAt: null
                }
            }
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
            { runId: run._id, tenantId }
        );

        return this.processRun(runId, {
            tenantId,
            ...options,
            isFixtureMode
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
