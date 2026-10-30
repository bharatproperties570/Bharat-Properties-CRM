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

// Mandatory operational audit logging helper (Phase 4.4 - Finding F-03)
// Critical business/security audit records must NOT be silently swallowed.
async function logMandatoryAuditEvent({
    eventType,
    userId,
    targetType,
    targetId,
    description,
    metadata = {},
    status = 'success',
    tenantId = null,
    session = null
}) {
    let user = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId).select('fullName email').lean();
    }

    // Idempotency check: avoid duplicate mandatory audit records on retries
    const query = {
        eventType,
        targetType,
        targetId: targetId ? targetId.toString() : null,
        status
    };
    if (metadata?.runId) {
        query['metadata.runId'] = metadata.runId;
    }
    const existingAudit = await AuditLog.findOne(query);
    if (existingAudit && ['authority_run_created', 'authority_run_completed', 'authority_run_policy_rejected'].includes(eventType)) {
        return existingAudit;
    }

    const auditDoc = {
        eventType,
        userId: userId || null,
        userName: user?.fullName || 'System/AuthorityEngine',
        userEmail: user?.email || 'system@crm.internal',
        targetType,
        targetId: targetId ? targetId.toString() : null,
        description,
        metadata: {
            ...metadata,
            ...(tenantId ? { tenantId: tenantId.toString() } : {})
        },
        ipAddress: '127.0.0.1',
        userAgent: 'AuthorityBulkProcessor/v4.4',
        status
    };

    const [created] = await AuditLog.create([auditDoc], session ? { session } : {});
    return created;
}

// Diagnostic audit logging helper (Phase 4.4 - Finding F-03)
// Best-effort progress events are non-fatal.
async function logDiagnosticAuditEvent({
    eventType,
    userId,
    targetType,
    targetId,
    description,
    metadata = {},
    status = 'success',
    tenantId = null
}) {
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
            metadata: {
                ...metadata,
                ...(tenantId ? { tenantId: tenantId.toString() } : {})
            },
            ipAddress: '127.0.0.1',
            userAgent: 'AuthorityBulkProcessor/v4.4',
            status
        });
    } catch (err) {
        console.warn('[AuthorityBulkProcessor] Diagnostic audit log non-fatal error:', err.message);
    }
}

// Legacy signature bridge delegating to logMandatoryAuditEvent
async function logAuditEvent(eventType, userId, targetType, targetId, description, metadata = {}, status = 'success', tenantId = null) {
    return logMandatoryAuditEvent({
        eventType,
        userId,
        targetType,
        targetId,
        description,
        metadata,
        status,
        tenantId
    });
}

/**
 * Safely inserts documents with ordered: false, trapping ONLY confirmed duplicate key errors (11000/11001)
 * while propagating any unexpected validation, schema, network, or mixed database errors. (Phase 4.4 - Finding F-04)
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
        // Mongoose client-side validation errors must propagate immediately
        if (err.name === 'ValidationError' || (err.errors && !err.writeErrors && !err.errorResponse?.writeErrors)) {
            throw err;
        }

        // Write concern errors must propagate immediately
        if (err.writeConcernError) {
            throw err;
        }

        const isDuplicateCode = (code) => code === 11000 || code === 11001;

        // Extract individual write errors from standard and driver-specific structures
        let writeErrors = [];
        if (Array.isArray(err.writeErrors)) {
            writeErrors = err.writeErrors;
        } else if (Array.isArray(err.errorResponse?.writeErrors)) {
            writeErrors = err.errorResponse.writeErrors;
        } else if (typeof err.getWriteErrors === 'function') {
            writeErrors = err.getWriteErrors() || [];
        } else if (Array.isArray(err.result?.writeErrors)) {
            writeErrors = err.result.writeErrors;
        }

        if (writeErrors.length > 0) {
            // Check if ANY individual write error is non-duplicate
            const hasNonDuplicate = writeErrors.some(e => {
                const code = e.code ?? e.err?.code ?? (typeof e.toJSON === 'function' ? e.toJSON().code : null);
                return !isDuplicateCode(code);
            });
            if (hasNonDuplicate) {
                // Mixed or non-duplicate errors detected; MUST NOT suppress!
                throw err;
            }

            // Confirmed: Every single write error is a duplicate-key error
            const duplicateCount = writeErrors.length;
            const insertedCount = (typeof err.result?.insertedCount === 'number')
                ? err.result.insertedCount
                : Math.max(0, docs.length - duplicateCount);
            return { insertedCount, duplicateCount };
        }

        // Top-level duplicate error code where writeErrors is empty
        // Must NOT suppress if there are signs of validation or unexpected issues
        if (isDuplicateCode(err.code) && !err.message?.toLowerCase().includes('validation')) {
            return {
                insertedCount: Math.max(0, docs.length - 1),
                duplicateCount: 1
            };
        }

        // Propagate unexpected validation, network, and database errors
        throw err;
    }
}

/**
 * Heartbeat helper to periodically renew in-flight worker leases during item processing (Phase 4.4 - Finding F-01)
 */
function createItemHeartbeat(itemId, tenantId, workerId, claimToken, intervalMs = 10000) {
    let leaseLost = false;
    let timer = null;

    if (intervalMs > 0 && workerId) {
        timer = setInterval(async () => {
            try {
                const renewed = await AuthorityBulkProcessor.renewItemLease(itemId, tenantId, workerId, claimToken);
                if (!renewed) {
                    leaseLost = true;
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            } catch (err) {
                leaseLost = true;
                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }
            }
        }, intervalMs);
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
    }

    return {
        isLeaseLost: () => leaseLost,
        stop: () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }
    };
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

export { safeInsertMany };

export class AuthorityBulkProcessor {
    static safeInsertMany = safeInsertMany;

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

            try {
                await logMandatoryAuditEvent({
                    eventType: 'authority_run_policy_rejected',
                    userId: requestedBy,
                    targetType: 'authority_run',
                    targetId: rejectedRun._id,
                    description: `Bulk run POLICY_REJECTED for ${authorityCode}: source not activated`,
                    metadata: { authorityCode, runMode, blockers },
                    tenantId
                });
            } catch (auditErr) {
                await PropertyVerificationRun.deleteOne({ _id: rejectedRun._id, tenantId });
                const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to create audit log for rejected run: ${auditErr.message}`);
                err.code = 'AUDIT_LOG_FAILED';
                throw err;
            }

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

        try {
            await logMandatoryAuditEvent({
                eventType: 'authority_run_created',
                userId: requestedBy,
                targetType: 'authority_run',
                targetId: run._id,
                description: `Bulk verification run created for ${authorityCode} (${actualCount} items, mode: ${runMode}, provenance: ${run.provenance})`,
                metadata: { runId: run._id, authorityCode, totalItems: actualCount, runMode, isFixtureMode, tenantId },
                tenantId
            });
        } catch (auditErr) {
            // Roll back created run and items to prevent unaudited operations
            await PropertyVerificationRunItem.deleteMany({ runId: run._id, tenantId });
            await PropertyVerificationRun.deleteOne({ _id: run._id, tenantId });
            const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to create audit log for run creation: ${auditErr.message}`);
            err.code = 'AUDIT_LOG_FAILED';
            throw err;
        }

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

        // Update run state to PROCESSING
        run.status = 'PROCESSING';
        if (!run.startedAt) run.startedAt = new Date();
        await run.save();

        const safeBatchSize = Math.max(1, Math.min(batchSize, 500));
        const workerId = `worker_${new mongoose.Types.ObjectId().toString()}`;
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

            // Atomically claim items for this worker with an expiring worker lease and fencing tokens
            const claimedItems = [];
            for (const cand of candidates) {
                const claimTime = new Date();
                const claimToken = `claim_${new mongoose.Types.ObjectId().toString()}`;
                const leaseExpiresAt = new Date(claimTime.getTime() + WORKER_LEASE_MS);
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
                            workerClaimToken: claimToken,
                            claimedAt: claimTime,
                            leaseExpiresAt: leaseExpiresAt
                        },
                        $inc: { workerFenceToken: 1 }
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
                    if (Boolean(item.isSynthetic) !== isFixtureMode) {
                        try {
                            await AuthorityBulkProcessor.updateItemTerminalState({
                                itemId: item._id,
                                tenantId,
                                runId: run._id,
                                workerId,
                                claimToken: item.workerClaimToken,
                                status: 'FAILED',
                                updateData: {
                                    errorMessage: 'MODE_MISMATCH: Item synthetic flag does not match run mode',
                                    processedAt: new Date()
                                }
                            });
                            batchFailed++;
                        } catch (saveErr) {
                            if (saveErr.code === 'STALE_WORKER') {
                                console.warn(`[AuthorityBulkProcessor] Stale worker ${workerId} suppressed for item ${item._id}`);
                            } else {
                                throw saveErr;
                            }
                        }
                        continue;
                    }

                    const result = await this.processItem(item, {
                        tenantId,
                        isFixtureMode,
                        authorityCode: run.authorityCode,
                        workerId,
                        claimToken: item.workerClaimToken,
                        runId: run._id
                    });

                    if (result.success) {
                        batchSucceeded++;
                    } else {
                        batchFailed++;
                    }
                } catch (itemErr) {
                    if (itemErr.code === 'STALE_WORKER') {
                        // Stale worker write rejected; do not increment counters or overwrite newer worker state
                        console.warn(`[AuthorityBulkProcessor] Stale worker ${workerId} suppressed for item ${item._id}: ${itemErr.message}`);
                        continue;
                    }

                    try {
                        await AuthorityBulkProcessor.updateItemTerminalState({
                            itemId: item._id,
                            tenantId,
                            runId: run._id,
                            workerId,
                            claimToken: item.workerClaimToken,
                            status: 'FAILED',
                            updateData: {
                                errorMessage: itemErr.message || 'Item processing error',
                                processedAt: new Date()
                            }
                        });
                        batchFailed++;
                    } catch (saveErr) {
                        if (saveErr.code === 'STALE_WORKER') {
                            console.warn(`[AuthorityBulkProcessor] Stale worker ${workerId} could not mark item ${item._id} failed: already reclaimed.`);
                        } else {
                            throw saveErr;
                        }
                    }
                }
            }

            // Atomically increment run counters strictly reflecting committed items
            const batchProcessed = batchSucceeded + batchFailed;
            if (batchProcessed > 0) {
                await PropertyVerificationRun.updateOne(
                    { _id: runId, tenantId },
                    {
                        $inc: {
                            processedItems: batchProcessed,
                            succeededItems: batchSucceeded,
                            failedItems: batchFailed
                        }
                    }
                );
            }

            // Audit batch completion (diagnostic progress event)
            await logDiagnosticAuditEvent({
                eventType: 'authority_run_batch_processed',
                userId: run.requestedBy,
                targetType: 'authority_run',
                targetId: run._id,
                description: `Batch of ${claimedItems.length} items processed for run ${run._id}`,
                metadata: {
                    runId: run._id,
                    batchSize: claimedItems.length,
                    batchSucceeded,
                    batchFailed
                },
                tenantId
            });

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
            try {
                await logMandatoryAuditEvent({
                    eventType: 'authority_run_completed',
                    userId: run.requestedBy,
                    targetType: 'authority_run',
                    targetId: run._id,
                    description: `Run ${run._id} finished with status ${finalStatus} (${totalProcessed} processed, ${totalSucceeded} succeeded, ${totalFailed} failed)`,
                    metadata: {
                        runId: run._id,
                        status: finalStatus,
                        totalItems: run.totalItems,
                        processedItems: totalProcessed,
                        succeededItems: totalSucceeded,
                        failedItems: totalFailed
                    },
                    tenantId
                });
            } catch (auditErr) {
                // Roll back completed run status to PROCESSING to prevent unaudited completion
                await PropertyVerificationRun.updateOne(
                    { _id: runId, tenantId },
                    {
                        $set: {
                            status: 'PROCESSING',
                            completedAt: null
                        }
                    }
                );
                const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to record authority_run_completed audit log: ${auditErr.message}`);
                err.code = 'AUDIT_LOG_FAILED';
                throw err;
            }
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
     * Renew active worker lease for an in-flight run item.
     * Must only renew an unexpired lease belonging to the requesting worker and claimToken.
     * 
     * @param {string|mongoose.Types.ObjectId} itemId 
     * @param {string|mongoose.Types.ObjectId} tenantId 
     * @param {string} workerId 
     * @param {string} [claimToken=null]
     * @returns {Promise<PropertyVerificationRunItem|null>}
     */
    static async renewItemLease(itemId, tenantId, workerId, claimToken = null) {
        const now = new Date();
        const newExpiry = new Date(now.getTime() + WORKER_LEASE_MS);
        const query = {
            _id: itemId,
            tenantId,
            claimedBy: workerId,
            status: 'PROCESSING',
            leaseExpiresAt: { $gt: now }
        };
        if (claimToken) {
            query.workerClaimToken = claimToken;
        }
        return PropertyVerificationRunItem.findOneAndUpdate(
            query,
            {
                $set: { leaseExpiresAt: newExpiry }
            },
            { new: true }
        );
    }

    /**
     * Atomically update an item to its terminal state with lease fencing and ownership validation.
     * Throws STALE_WORKER if the worker's lease expired or was reclaimed.
     */
    static async updateItemTerminalState({
        itemId,
        tenantId,
        runId = null,
        workerId = null,
        claimToken = null,
        status,
        updateData = {}
    }) {
        const now = new Date();
        const query = {
            _id: itemId,
            tenantId,
            status: 'PROCESSING'
        };

        if (runId) {
            query.runId = runId;
        }
        if (workerId) {
            query.claimedBy = workerId;
            query.leaseExpiresAt = { $gt: now };
        }
        if (claimToken) {
            query.workerClaimToken = claimToken;
        }

        const update = {
            $set: {
                status,
                leaseExpiresAt: null,
                processedAt: updateData.processedAt || now,
                ...updateData
            }
        };

        const updated = await PropertyVerificationRunItem.findOneAndUpdate(query, update, { new: true });
        if (!updated) {
            const err = new Error(`STALE_WORKER: Worker ${workerId || 'unknown'} lost lease or ownership for item ${itemId}. Write rejected to prevent state corruption.`);
            err.code = 'STALE_WORKER';
            throw err;
        }
        return updated;
    }

    /**
     * Process an individual RunItem.
     * Safe, idempotent, and error-isolated.
     */
    static async processItem(item, options = {}) {
        const { tenantId, isFixtureMode = true, authorityCode, workerId: optWorkerId, claimToken: optClaimToken, runId: optRunId } = options;
        const workerId = optWorkerId || item.claimedBy || null;
        const claimToken = optClaimToken || item.workerClaimToken || null;
        const runId = optRunId || item.runId || null;

        if (item.status === 'SUCCEEDED' && item.snapshotId) {
            return { success: true, alreadyProcessed: true };
        }

        const heartbeat = (workerId && claimToken)
            ? createItemHeartbeat(item._id, tenantId, workerId, claimToken, options.heartbeatIntervalMs || 10000)
            : null;

        try {
            // 1. Fetch link & inventory with tenant isolation (or use pre-populated docs)
            const link = (item.linkId && typeof item.linkId === 'object' && item.linkId.authorityCode && String(item.linkId.tenantId) === String(tenantId))
                ? item.linkId
                : await PropertyAuthorityLink.findOne({ _id: item.linkId, tenantId });

            if (!link) {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'FAILED',
                    updateData: {
                        errorMessage: 'Authority link not found or cross-tenant access rejected',
                        processedAt: new Date()
                    }
                });
                return { success: false, reason: 'LINK_NOT_FOUND' };
            }

            const inventory = (item.inventoryId && typeof item.inventoryId === 'object' && item.inventoryId.unitNo && String(item.inventoryId.tenantId) === String(tenantId))
                ? item.inventoryId
                : await Inventory.findOne({ _id: item.inventoryId, tenantId });

            if (!inventory) {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'FAILED',
                    updateData: {
                        errorMessage: 'Inventory record not found or cross-tenant access rejected',
                        processedAt: new Date()
                    }
                });
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
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'FAILED',
                    updateData: {
                        matchStatus: 'IDENTITY_MISMATCH',
                        errorMessage: 'Incomplete identity: propertyId and sectorNumber are required',
                        isSynthetic: Boolean(isFixtureMode),
                        provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                        processedAt: new Date()
                    }
                });
                return { success: false, reason: 'INCOMPLETE_IDENTITY' };
            }

            // 3. Execution boundary: Live vs Fixture
            if (!isFixtureMode) {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'FAILED',
                    updateData: {
                        errorMessage: 'Live authority verification is disabled. Authorization status: NOT_OBTAINED.',
                        isSynthetic: false,
                        provenance: 'LIVE',
                        processedAt: new Date()
                    }
                });
                return { success: false, reason: 'LIVE_DISABLED' };
            }

            // 4. Concurrency Protection: Check if a snapshot already exists for this run item
            const existingSnapshot = await PropertyVerificationSnapshot.findOne({
                runItemId: item._id,
                tenantId
            });
            if (existingSnapshot) {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'SUCCEEDED',
                    updateData: {
                        snapshotId: existingSnapshot._id,
                        isSynthetic: true,
                        provenance: 'SYNTHETIC_FIXTURE',
                        processedAt: new Date()
                    }
                });
                return { success: true, snapshotId: existingSnapshot._id, alreadyProcessed: true };
            }

            // 5. Fixture pipeline execution
            const rawFixture = getSyntheticFixtureForLink(auth, link, inventory);
            if (!rawFixture) {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'NO_MATCH',
                    updateData: {
                        matchStatus: 'NO_MATCH',
                        errorMessage: `No fixture available for authority ${item.authorityCode} with current identity`,
                        isSynthetic: Boolean(isFixtureMode),
                        provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                        processedAt: new Date()
                    }
                });
                return { success: false, reason: 'NO_FIXTURE' };
            }

            const candidate = executeFixturePipeline(item.authorityCode, rawFixture, inventory);

            if (candidate.status === 'REJECTED_QUALITY') {
                await AuthorityBulkProcessor.updateItemTerminalState({
                    itemId: item._id,
                    tenantId,
                    runId,
                    workerId,
                    claimToken,
                    status: 'FAILED',
                    updateData: {
                        matchStatus: 'NOT_ATTEMPTED',
                        errorMessage: `Quality rejection: ${(candidate.errors || []).join('; ')}`,
                        isSynthetic: Boolean(isFixtureMode),
                        provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                        processedAt: new Date()
                    }
                });
                return { success: false, reason: 'QUALITY_REJECTED' };
            }

            // 6. Create immutable verification snapshot with explicit synthetic provenance
            let snapshot;
            try {
                snapshot = await PropertyVerificationSnapshot.create({
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
                    contentHash: candidate.contentHash || null,
                    isSealed: true,
                    dataQualityStatus: ['READY_FOR_REVIEW', 'VERIFIED_OFFICIAL'].includes(candidate.status) ? 'COMPLETE' : 'PARTIAL'
                });
            } catch (snapErr) {
                if (snapErr.code === 11000) {
                    // Handled gracefully via unique database index constraint
                    const existingSnap = await PropertyVerificationSnapshot.findOne({
                        tenantId,
                        runItemId: item._id
                    });
                    if (existingSnap) {
                        snapshot = existingSnap;
                    } else {
                        throw snapErr;
                    }
                } else {
                    throw snapErr;
                }
            }

            // Check lease heartbeat before committing terminal update
            if (heartbeat?.isLeaseLost()) {
                const err = new Error(`STALE_WORKER: Heartbeat lost lease for item ${item._id} during execution.`);
                err.code = 'STALE_WORKER';
                throw err;
            }

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

            // 8. Update item status to SUCCEEDED with lease fencing protection
            const updatedItem = await AuthorityBulkProcessor.updateItemTerminalState({
                itemId: item._id,
                tenantId,
                runId,
                workerId,
                claimToken,
                status: 'SUCCEEDED',
                updateData: {
                    matchStatus: candidate.matchEvidence?.confidence === 'EXACT'
                        ? 'EXACT_MATCH'
                        : (candidate.matchEvidence?.confidence === 'PARTIAL' ? 'PARTIAL_MATCH' : 'NO_MATCH'),
                    snapshotId: snapshot._id,
                    proposedChanges,
                    reviewerDecision: 'PENDING',
                    isSynthetic: Boolean(isFixtureMode),
                    provenance: isFixtureMode ? 'SYNTHETIC_FIXTURE' : 'LIVE',
                    errorMessage: null,
                    processedAt: new Date()
                }
            });

            return {
                success: true,
                itemId: updatedItem._id,
                snapshotId: snapshot._id,
                matchStatus: updatedItem.matchStatus,
                proposedChangesCount: proposedChanges.length
            };
        } finally {
            if (heartbeat) {
                heartbeat.stop();
            }
        }
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

        const previousStatus = run.status;
        const previousPausedAt = run.pausedAt;
        const previousPauseReason = run.pauseReason;
        const previousPausedBy = run.pausedBy;

        run.status = 'PAUSED';
        run.pausedBy = userId || null;
        run.pausedAt = new Date();
        run.pauseReason = reason;
        await run.save();

        try {
            await logMandatoryAuditEvent({
                eventType: 'authority_run_paused',
                userId,
                targetType: 'authority_run',
                targetId: run._id,
                description: `Verification run ${run._id} paused: ${reason}`,
                metadata: { runId: run._id, reason },
                tenantId
            });
        } catch (auditErr) {
            run.status = previousStatus;
            run.pausedAt = previousPausedAt;
            run.pauseReason = previousPauseReason;
            run.pausedBy = previousPausedBy;
            await run.save();
            const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to record authority_run_paused audit log: ${auditErr.message}`);
            err.code = 'AUDIT_LOG_FAILED';
            throw err;
        }

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

        const previousStatus = run.status;
        const previousCancelledAt = run.cancelledAt;
        const previousCancellationReason = run.cancellationReason;
        const previousCancelledBy = run.cancelledBy;

        run.status = 'CANCELLED';
        run.cancelledBy = userId || null;
        run.cancelledAt = new Date();
        run.cancellationReason = reason;
        await run.save();

        try {
            await logMandatoryAuditEvent({
                eventType: 'authority_run_cancelled',
                userId,
                targetType: 'authority_run',
                targetId: run._id,
                description: `Verification run ${run._id} cancelled: ${reason}`,
                metadata: { runId: run._id, reason },
                tenantId
            });
        } catch (auditErr) {
            run.status = previousStatus;
            run.cancelledAt = previousCancelledAt;
            run.cancellationReason = previousCancellationReason;
            run.cancelledBy = previousCancelledBy;
            await run.save();
            const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to record authority_run_cancelled audit log: ${auditErr.message}`);
            err.code = 'AUDIT_LOG_FAILED';
            throw err;
        }

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

        const previousStatus = run.status;
        const previousPausedAt = run.pausedAt;
        const previousPauseReason = run.pauseReason;
        const previousPausedBy = run.pausedBy;

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
                    leaseExpiresAt: null,
                    workerClaimToken: null
                }
            }
        );

        run.status = 'PROCESSING';
        run.pausedAt = null;
        run.pauseReason = null;
        run.pausedBy = null;
        await run.save();

        try {
            await logMandatoryAuditEvent({
                eventType: 'authority_run_resumed',
                userId: options.userId || null,
                targetType: 'authority_run',
                targetId: run._id,
                description: `Verification run ${run._id} resumed`,
                metadata: { runId: run._id, tenantId },
                tenantId
            });
        } catch (auditErr) {
            run.status = previousStatus;
            run.pausedAt = previousPausedAt;
            run.pauseReason = previousPauseReason;
            run.pausedBy = previousPausedBy;
            await run.save();
            const err = new Error(`MANDATORY_AUDIT_LOG_FAILED: Failed to record authority_run_resumed audit log: ${auditErr.message}`);
            err.code = 'AUDIT_LOG_FAILED';
            throw err;
        }

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
