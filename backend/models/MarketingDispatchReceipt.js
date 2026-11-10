import mongoose from 'mongoose';

/**
 * MarketingDispatchReceipt
 * ─────────────────────────────────────────────────────────────────────────────
 * Durable safety boundary and state machine for marketing dispatches (PR #51 / Phase 6).
 *
 * Implements atomic conditional claim semantics, recipient-level & channel-level
 * idempotency, fail-closed database connectivity checks, ambiguous dispatch tracking,
 * and operator reconciliation workflows.
 */
const MarketingDispatchReceiptSchema = new mongoose.Schema({
    dispatchKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    idempotencyKey: {
        type: String,
        index: true,
        sparse: true
    },
    jobName: {
        type: String,
        required: true
    },
    eventId: {
        type: String,
        index: true
    },
    tenantId: {
        type: String
    },
    channel: {
        type: String,
        default: 'whatsapp'
    },
    recipientMobile: {
        type: String
    },
    recipientEmail: {
        type: String
    },
    recipientId: {
        type: String
    },
    campaignId: {
        type: String
    },
    status: {
        type: String,
        enum: ['PENDING', 'QUEUED', 'DISPATCHING', 'SENT', 'COMPLETED', 'FAILED', 'AMBIGUOUS', 'SKIPPED_DUPLICATE'],
        default: 'PENDING',
        index: true
    },
    providerRef: {
        type: mongoose.Schema.Types.Mixed
    },
    providerIdempotencyKey: {
        type: String
    },
    claimToken: {
        type: String
    },
    claimedAt: {
        type: Date
    },
    attempts: {
        type: Number,
        default: 0
    },
    result: {
        type: mongoose.Schema.Types.Mixed
    },
    error: {
        type: String
    },
    lastError: {
        type: String
    },
    reconciliationNotes: {
        type: String
    },
    reconciliationStatus: {
        type: String,
        enum: ['NONE', 'PENDING_REVIEW', 'MANUALLY_RECONCILED', 'CONFIRMED_DELIVERED', 'CONFIRMED_FAILED'],
        default: 'NONE'
    },
    dispatchedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    }
}, { timestamps: true });

/**
 * Atomic conditional claim for marketing dispatch (Job-level or Recipient-level).
 * Prevents concurrent workers from executing the same dispatch twice.
 * Fails closed if MongoDB connection is not ready.
 */
MarketingDispatchReceiptSchema.statics.claimDispatch = async function({
    dispatchKey,
    idempotencyKey,
    jobName,
    channel,
    recipientMobile,
    recipientEmail,
    recipientId,
    campaignId,
    eventId,
    tenantId,
    providerIdempotencyKey,
    leaseMs = 300000, // 5 minutes
    isBatch = false
}) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        const dbErr = new Error('RECEIPT_DB_UNAVAILABLE: Database connection is not ready for dispatch claim');
        dbErr.code = 'RECEIPT_DB_UNAVAILABLE';
        throw dbErr;
    }

    const key = dispatchKey || idempotencyKey;
    if (!key) {
        throw new Error('RECEIPT_CLAIM_INVALID: dispatchKey or idempotencyKey is required');
    }

    const effectiveIdempotencyKey = idempotencyKey || key;
    const now = new Date();
    const claimToken = new mongoose.Types.ObjectId().toString();

    // 1. Check existing record
    const existing = await this.findOne({
        $or: [{ dispatchKey: key }, { idempotencyKey: effectiveIdempotencyKey }]
    });

    if (existing) {
        if (existing.status === 'COMPLETED' || existing.status === 'SENT') {
            return {
                canDispatch: false,
                status: 'SKIPPED_DUPLICATE',
                reason: 'ALREADY_COMPLETED',
                receipt: existing
            };
        }

        if (existing.status === 'AMBIGUOUS') {
            return {
                canDispatch: false,
                status: 'AMBIGUOUS',
                reason: 'AMBIGUOUS_RECONCILIATION_REQUIRED',
                receipt: existing
            };
        }

        if (existing.status === 'DISPATCHING') {
            // For batch/campaign jobs, BullMQ retry must be allowed to resume remaining recipients!
            if (isBatch) {
                const refreshed = await this.findOneAndUpdate(
                    { _id: existing._id, status: 'DISPATCHING' },
                    {
                        $set: {
                            claimToken,
                            claimedAt: now,
                            dispatchedAt: now
                        },
                        $inc: { attempts: 1 }
                    },
                    { new: true }
                );

                return {
                    canDispatch: true,
                    status: 'DISPATCHING',
                    receipt: refreshed || existing,
                    claimToken,
                    isResumed: true
                };
            }

            // Recipient-level or single-dispatch: check lease
            const claimedTime = existing.claimedAt ? new Date(existing.claimedAt).getTime() : 0;
            const isExpired = (now.getTime() - claimedTime) > leaseMs;
            if (!isExpired) {
                return {
                    canDispatch: false,
                    status: 'SKIPPED_IN_FLIGHT',
                    reason: 'CONCURRENT_CLAIM_ACTIVE',
                    receipt: existing
                };
            }
            // Expired in-flight claim without completion -> treat as AMBIGUOUS to prevent duplicate provider call
            await this.updateOne(
                { _id: existing._id, status: 'DISPATCHING' },
                {
                    $set: {
                        status: 'AMBIGUOUS',
                        lastError: 'Worker claim expired without completion; delivery outcome uncertain.',
                        reconciliationNotes: 'Worker lease expired while DISPATCHING. Marked AMBIGUOUS for operator review.'
                    }
                }
            );
            return {
                canDispatch: false,
                status: 'AMBIGUOUS',
                reason: 'LEASE_EXPIRED_MARKED_AMBIGUOUS',
                receipt: existing
            };
        }

        // Status is PENDING, QUEUED, or FAILED: Attempt atomic conditional claim
        const updated = await this.findOneAndUpdate(
            {
                _id: existing._id,
                status: { $in: ['PENDING', 'QUEUED', 'FAILED'] }
            },
            {
                $set: {
                    status: 'DISPATCHING',
                    claimToken,
                    claimedAt: now,
                    dispatchedAt: now,
                    channel: channel || existing.channel,
                    recipientMobile: recipientMobile || existing.recipientMobile,
                    recipientEmail: recipientEmail || existing.recipientEmail,
                    recipientId: recipientId || existing.recipientId,
                    campaignId: campaignId || existing.campaignId,
                    providerIdempotencyKey: providerIdempotencyKey || existing.providerIdempotencyKey,
                    lastError: null
                },
                $inc: { attempts: 1 }
            },
            { new: true }
        );

        if (!updated) {
            // Raced with another worker
            const fresh = await this.findById(existing._id);
            return {
                canDispatch: false,
                status: 'SKIPPED_CONCURRENT',
                reason: 'CONCURRENT_CLAIM_WON_BY_OTHER',
                receipt: fresh
            };
        }

        return {
            canDispatch: true,
            status: 'DISPATCHING',
            receipt: updated,
            claimToken
        };
    }

    // 2. Record does not exist: Attempt atomic creation with status DISPATCHING
    try {
        const created = await this.create({
            dispatchKey: key,
            idempotencyKey: effectiveIdempotencyKey,
            jobName,
            channel: channel || 'whatsapp',
            recipientMobile,
            recipientEmail,
            recipientId,
            campaignId,
            eventId,
            tenantId,
            providerIdempotencyKey,
            status: 'DISPATCHING',
            claimToken,
            claimedAt: now,
            dispatchedAt: now,
            attempts: 1
        });

        return {
            canDispatch: true,
            status: 'DISPATCHING',
            receipt: created,
            claimToken
        };
    } catch (createErr) {
        if (createErr.code === 11000) {
            // Concurrent insert race: Another worker created it first!
            const fresh = await this.findOne({
                $or: [{ dispatchKey: key }, { idempotencyKey: effectiveIdempotencyKey }]
            });
            if (fresh?.status === 'COMPLETED' || fresh?.status === 'SENT') {
                return {
                    canDispatch: false,
                    status: 'SKIPPED_DUPLICATE',
                    reason: 'ALREADY_COMPLETED',
                    receipt: fresh
                };
            }
            if (fresh?.status === 'AMBIGUOUS') {
                return {
                    canDispatch: false,
                    status: 'AMBIGUOUS',
                    reason: 'AMBIGUOUS_RECONCILIATION_REQUIRED',
                    receipt: fresh
                };
            }
            return {
                canDispatch: false,
                status: 'SKIPPED_CONCURRENT',
                reason: 'CONCURRENT_INSERT_WON_BY_OTHER',
                receipt: fresh
            };
        }
        // Genuine DB failure must THROW to fail closed
        throw createErr;
    }
};

/**
 * Record successful completion of dispatch durably.
 * Uses claim token fencing to prevent stale workers from overwriting newer states.
 * Throws RECEIPT_COMPLETION_FAILED if database write fails.
 */
MarketingDispatchReceiptSchema.statics.recordSuccess = async function(key, { providerRef, result, completedStatus = 'COMPLETED', claimToken } = {}) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        const dbErr = new Error('RECEIPT_DB_UNAVAILABLE: Database connection is not ready for recordSuccess');
        dbErr.code = 'RECEIPT_DB_UNAVAILABLE';
        throw dbErr;
    }

    try {
        const filter = {
            $or: [{ dispatchKey: key }, { idempotencyKey: key }]
        };

        // Claim token fencing: Only update if claimToken matches and not manually reconciled
        if (claimToken) {
            filter.claimToken = claimToken;
            filter.reconciliationStatus = { $in: ['NONE', null] };
        }

        const updated = await this.findOneAndUpdate(
            filter,
            {
                $set: {
                    status: completedStatus,
                    completedAt: new Date(),
                    providerRef: providerRef || null,
                    result: typeof result === 'object' ? result : { value: result }
                }
            },
            { new: true }
        );

        if (!updated) {
            if (claimToken) {
                const existing = await this.findOne({
                    $or: [{ dispatchKey: key }, { idempotencyKey: key }]
                });
                if (existing) {
                    const staleErr = new Error(`STALE_CLAIM_REJECTED: Stale worker with claimToken '${claimToken}' cannot overwrite newer receipt state (${existing.status}, claimToken=${existing.claimToken})`);
                    staleErr.code = 'STALE_CLAIM_REJECTED';
                    staleErr.receipt = existing;
                    throw staleErr;
                }
            }

            return await this.create({
                dispatchKey: key,
                idempotencyKey: key,
                jobName: 'unknown',
                status: completedStatus,
                completedAt: new Date(),
                providerRef: providerRef || null,
                result: typeof result === 'object' ? result : { value: result }
            });
        }
        return updated;
    } catch (err) {
        if (err.code === 'STALE_CLAIM_REJECTED' || err.code === 'RECEIPT_DB_UNAVAILABLE') {
            throw err;
        }
        const compErr = new Error(`RECEIPT_COMPLETION_FAILED: Provider dispatch succeeded but receipt completion write failed for '${key}': ${err.message}`);
        compErr.code = 'RECEIPT_COMPLETION_FAILED';
        compErr.originalError = err;
        throw compErr;
    }
};

/**
 * Record failure or ambiguity of dispatch durably.
 * Uses claim token fencing to prevent stale workers from overwriting newer states.
 * Fails closed without swallowing database errors.
 */
MarketingDispatchReceiptSchema.statics.recordFailure = async function(key, { error, isAmbiguous = false, reconciliationNotes = '', claimToken } = {}) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        const dbErr = new Error('RECEIPT_DB_UNAVAILABLE: Database connection is not ready for recordFailure');
        dbErr.code = 'RECEIPT_DB_UNAVAILABLE';
        throw dbErr;
    }

    try {
        const status = isAmbiguous ? 'AMBIGUOUS' : 'FAILED';
        const filter = {
            $or: [{ dispatchKey: key }, { idempotencyKey: key }]
        };

        if (claimToken) {
            filter.claimToken = claimToken;
            filter.reconciliationStatus = { $in: ['NONE', null] };
        }

        const updated = await this.findOneAndUpdate(
            filter,
            {
                $set: {
                    status,
                    lastError: typeof error === 'string' ? error : error?.message || 'Unknown error',
                    reconciliationNotes: reconciliationNotes || (isAmbiguous ? 'Requires operator review' : '')
                }
            },
            { new: true, upsert: false }
        );

        if (!updated && claimToken) {
            const existing = await this.findOne({
                $or: [{ dispatchKey: key }, { idempotencyKey: key }]
            });
            if (existing) {
                const staleErr = new Error(`STALE_CLAIM_REJECTED: Stale worker with claimToken '${claimToken}' cannot overwrite newer receipt state (${existing.status}, claimToken=${existing.claimToken})`);
                staleErr.code = 'STALE_CLAIM_REJECTED';
                staleErr.receipt = existing;
                throw staleErr;
            }
        }

        return updated;
    } catch (err) {
        if (err.code === 'STALE_CLAIM_REJECTED' || err.code === 'RECEIPT_DB_UNAVAILABLE') {
            throw err;
        }
        const failErr = new Error(`RECEIPT_FAILURE_RECORD_FAILED: Error recording failure for '${key}': ${err.message}`);
        failErr.code = 'RECEIPT_FAILURE_RECORD_FAILED';
        failErr.originalError = err;
        throw failErr;
    }
};

/**
 * Operator reconciliation for ambiguous dispatch receipts.
 */
MarketingDispatchReceiptSchema.statics.reconcileAmbiguous = async function(key, { resolution, operatorNotes = '' }) {
    if (!key || !resolution) {
        throw new Error('RECONCILE_INVALID: key and resolution are required');
    }

    const validResolutions = ['CONFIRM_DELIVERED', 'CONFIRM_FAILED', 'MARK_SKIPPED'];
    if (!validResolutions.includes(resolution)) {
        throw new Error(`RECONCILE_INVALID: resolution must be one of ${validResolutions.join(', ')}`);
    }

    let newStatus;
    let reconciliationStatus;
    if (resolution === 'CONFIRM_DELIVERED') {
        newStatus = 'COMPLETED';
        reconciliationStatus = 'CONFIRMED_DELIVERED';
    } else if (resolution === 'CONFIRM_FAILED') {
        newStatus = 'FAILED';
        reconciliationStatus = 'CONFIRMED_FAILED';
    } else {
        newStatus = 'SKIPPED_DUPLICATE';
        reconciliationStatus = 'MANUALLY_RECONCILED';
    }

    const receipt = await this.findOneAndUpdate(
        {
            $or: [{ dispatchKey: key }, { idempotencyKey: key }]
        },
        {
            $set: {
                status: newStatus,
                reconciliationStatus,
                reconciliationNotes: `Operator [${resolution}]: ${operatorNotes}`.trim()
            }
        },
        { new: true }
    );

    if (!receipt) {
        throw new Error(`RECONCILE_NOT_FOUND: Receipt not found for key '${key}'`);
    }
    return receipt;
};

const MarketingDispatchReceipt = mongoose.models.MarketingDispatchReceipt || mongoose.model('MarketingDispatchReceipt', MarketingDispatchReceiptSchema);

export default MarketingDispatchReceipt;
