import IntegrationGuard from "../src/utils/IntegrationGuard.js";

import axios from 'axios';
import axiosRetry from 'axios-retry';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { isMonotonicStatusTransition } from '../utils/whatsappWebhook.utils.js';

// 🧠 SENIOR PROFESSIONAL: Resilience Layer
// Configure automated retries for transient failures (Network, 5xx, 429)
axiosRetry(axios, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
    }
});

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

const _reconcileLocks = new Map();

// 🔒 Atomic Redis Lua Scripts for Ownership-Safe Distributed Lock Operations
const LUA_RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

const LUA_RENEW_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], ARGV[2])
else
    return 0
end
`;

const LUA_ACQUIRE_FENCED_LOCK = `
local lockSet = redis.call("set", KEYS[1], ARGV[1], "NX", "EX", tonumber(ARGV[2]))
if lockSet then
    local gen = redis.call("incr", KEYS[2])
    return gen
else
    return 0
end
`;

async function _withReconcileKeyLock(key, fn, options = {}) {
    if (!key || typeof key !== 'string' || !key.trim()) {
        throw new Error('DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE: Valid reconciliation lock key is required');
    }
    const idKey = String(key).trim();
    const prev = _reconcileLocks.get(idKey) || Promise.resolve();
    let releaseLocal;
    const current = new Promise(resolve => { releaseLocal = resolve; });
    _reconcileLocks.set(idKey, current);

    // 1. Process-local queue to serialize requests within the same Node.js runtime
    await prev;

    // 2. Distributed Exclusive Synchronization across separate Node.js processes / PM2 cluster
    let redisProxy = null;
    let distributedLockToken = null;
    let fencingToken = 0;
    const lockKey = `lock:dispatch_reconcile:${idKey}`;
    const genKey = `lock:dispatch_reconcile_gen:${idKey}`;
    const LOCK_TTL_SEC = options.lockTtlSec || 15;
    const HEARTBEAT_INTERVAL_MS = options.heartbeatIntervalMs || 5000;
    const MAX_LOCK_WAIT_MS = options.maxWaitMs !== undefined ? options.maxWaitMs : 10000;
    let renewalTimer = null;
    const abortController = new AbortController();
    const lockState = { acquired: false, lost: false, lossReason: null };

    try {
        try {
            const redisMod = await import('../src/config/redis.js');
            redisProxy = redisMod.default;
            if (!redisProxy) {
                throw new Error(`DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE: Redis client is unavailable for key '${idKey}'. Distributed lock mandatory.`);
            }

            distributedLockToken = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const startWait = Date.now();
            let lockAcquired = false;

            while (Date.now() - startWait < MAX_LOCK_WAIT_MS) {
                const res = await redisProxy.eval(LUA_ACQUIRE_FENCED_LOCK, 2, lockKey, genKey, distributedLockToken, LOCK_TTL_SEC);
                const genRes = Number(res);
                if (genRes > 0) {
                    lockAcquired = true;
                    fencingToken = genRes;
                    break;
                }
                // Bounded jittered retry (40-70ms)
                await new Promise(r => setTimeout(r, 40 + Math.floor(Math.random() * 30)));
            }

            if (!lockAcquired) {
                throw new Error(`DISTRIBUTED_LOCK_TIMEOUT: Timed out waiting for reconciliation lock '${lockKey}' after ${MAX_LOCK_WAIT_MS}ms`);
            }

            lockState.acquired = true;

            // P0-D: Active Heartbeat Lease Renewal every 5s for 15s TTL
            renewalTimer = setInterval(async () => {
                try {
                    const renewed = await redisProxy.eval(LUA_RENEW_LOCK, 1, lockKey, distributedLockToken, LOCK_TTL_SEC);
                    if (!renewed || renewed === 0) {
                        lockState.lost = true;
                        lockState.lossReason = 'TOKEN_EXPIRED_OR_REPLACED';
                        abortController.abort(new Error(`DISTRIBUTED_LOCK_LOST: Reconciliation lock for '${idKey}' expired or was acquired by another process.`));
                        console.error(`[WhatsAppService] CRITICAL: Reconciliation lock lost for '${idKey}'. Aborting reconciliation.`);
                    }
                } catch (renewErr) {
                    lockState.lost = true;
                    lockState.lossReason = renewErr.message;
                    abortController.abort(new Error(`DISTRIBUTED_LOCK_LOST: Heartbeat renewal failed for '${idKey}': ${renewErr.message}`));
                    console.error(`[WhatsAppService] CRITICAL: Reconciliation lock renewal error for '${idKey}': ${renewErr.message}. Aborting reconciliation.`);
                }
            }, HEARTBEAT_INTERVAL_MS);

        } catch (lockErr) {
            // P0-A: Fail-Closed: Never execute fn() if Redis lock could not be acquired!
            if (lockErr.message?.includes('DISTRIBUTED_LOCK_TIMEOUT') || lockErr.message?.includes('DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE')) {
                throw lockErr;
            }
            throw new Error(`DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE: Failed to acquire distributed lock for '${idKey}': ${lockErr.message}`);
        }

        if (lockState.lost) {
            throw new Error(`DISTRIBUTED_LOCK_LOST: Reconciliation lock was lost before execution for '${idKey}'`);
        }

        const lockContext = {
            fencingToken,
            lockToken: distributedLockToken,
            signal: abortController.signal,
            isLockLost: () => lockState.lost,
            getLockToken: () => distributedLockToken,
            validateOwnership: async () => {
                if (lockState.lost || abortController.signal.aborted) return false;
                try {
                    const current = await redisProxy.get(lockKey);
                    if (current !== distributedLockToken) {
                        lockState.lost = true;
                        return false;
                    }
                    return true;
                } catch (_) {
                    return false;
                }
            }
        };

        const taskPromise = (async () => {
            return await fn(lockContext);
        })();

        const abortPromise = new Promise((_, reject) => {
            if (abortController.signal.aborted) {
                reject(abortController.signal.reason);
            } else {
                abortController.signal.addEventListener('abort', () => {
                    reject(abortController.signal.reason);
                }, { once: true });
            }
        });

        return await Promise.race([taskPromise, abortPromise]);
    } finally {
        if (renewalTimer) {
            clearInterval(renewalTimer);
            renewalTimer = null;
        }
        if (distributedLockToken && redisProxy) {
            try {
                await redisProxy.eval(LUA_RELEASE_LOCK, 1, lockKey, distributedLockToken);
            } catch (relErr) {
                console.error(`[WhatsAppService] Error releasing distributed reconciliation lock '${lockKey}':`, {
                    error: relErr.message,
                    key: lockKey,
                    token: distributedLockToken
                });
            }
        }
        releaseLocal();
        if (_reconcileLocks.get(idKey) === current) {
            _reconcileLocks.delete(idKey);
        }
    }
}

class WhatsAppService {
    constructor() {
        this._idempotencyCache = new Map();
        this._idempotencyTTL = 10 * 60 * 1000; // 10 minutes
    }

    _getIdempotentResult(key) {
        if (!key) return null;
        const entry = this._idempotencyCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this._idempotencyTTL) {
            this._idempotencyCache.delete(key);
            return null;
        }
        return entry;
    }

    _setIdempotentResult(key, result, recipient = null, payloadHash = null) {
        if (!key || !result) return;
        if (this._idempotencyCache.size > 2000) {
            const now = Date.now();
            for (const [k, v] of this._idempotencyCache.entries()) {
                if (now - v.timestamp > this._idempotencyTTL) {
                    this._idempotencyCache.delete(k);
                }
            }
        }
        this._idempotencyCache.set(key, { result, recipient, payloadHash, timestamp: Date.now() });
    }

    _computePayloadHash(payload) {
        if (!payload) return null;
        try {
            if (typeof payload === 'string') {
                return crypto.createHash('sha256').update(payload).digest('hex');
            }
            const sortedKeys = Object.keys(payload).sort();
            const normalized = {};
            for (const k of sortedKeys) {
                normalized[k] = payload[k];
            }
            return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
        } catch (_) {
            return null;
        }
    }

    async _claimOrGetDurableDispatch({ idempotencyKey, mobile, messageType, provider, payload, options = {} }) {
        if (!idempotencyKey) {
            return { canDispatch: true, isReplay: false };
        }

        const normalizedMobile = this._normalizeTarget(mobile) || String(mobile || '');
        const payloadHash = this._computePayloadHash(payload);

        // L1 fast in-memory check with immutability enforcement
        const l1Entry = this._getIdempotentResult(idempotencyKey);
        if (l1Entry) {
            // Validate recipient and payload immutability on L1 cache hit
            if (l1Entry.recipient && normalizedMobile && l1Entry.recipient !== normalizedMobile) {
                console.error(`[WhatsAppService] L1 cache: Recipient mismatch on idempotency key '${idempotencyKey}': cached='${l1Entry.recipient}', requested='${normalizedMobile}'`);
                return {
                    canDispatch: false,
                    error: `Idempotency key '${idempotencyKey}' was already claimed for recipient '${l1Entry.recipient}', cannot reuse for '${normalizedMobile}'. Keys must be unique per message intent.`,
                    code: 'IDEMPOTENCY_KEY_RECIPIENT_MISMATCH'
                };
            }
            if (l1Entry.payloadHash && payloadHash && l1Entry.payloadHash !== payloadHash) {
                console.error(`[WhatsAppService] L1 cache: Payload mismatch on idempotency key '${idempotencyKey}'`);
                return {
                    canDispatch: false,
                    error: `Idempotency key '${idempotencyKey}' was previously claimed with a different payload. Changing payload with the same idempotency key is prohibited.`,
                    code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
                };
            }
            return {
                canDispatch: false,
                isReplay: true,
                result: {
                    ...(typeof l1Entry.result === 'object' ? l1Entry.result : {}),
                    alreadySent: true,
                    duplicate: true
                }
            };
        }

        // Check if mongoose is connected — FAIL CLOSED for keyed dispatches
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            console.error(`[WhatsAppService] Keyed dispatch for '${idempotencyKey}' failed-closed: Database is unavailable.`);
            return {
                canDispatch: false,
                error: 'Durable dispatch ledger is unavailable (database disconnected). Keyed dispatches fail-closed to prevent duplicate delivery.',
                code: 'DURABLE_LEDGER_UNAVAILABLE'
            };
        }

        const workerId = `pid_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
        const now = new Date();

        try {
            const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
            const existing = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();

            if (existing) {
                // 1. Recipient Immutability Check
                if (existing.recipient && existing.recipient !== normalizedMobile) {
                    console.error(`[WhatsAppService] Recipient mismatch on idempotency key '${idempotencyKey}': existing='${existing.recipient}', requested='${normalizedMobile}'`);
                    return {
                        canDispatch: false,
                        error: `Idempotency key '${idempotencyKey}' was already claimed for recipient '${existing.recipient}', cannot reuse for '${normalizedMobile}'. Keys must be unique per message intent.`,
                        code: 'IDEMPOTENCY_KEY_RECIPIENT_MISMATCH'
                    };
                }

                // 2. Payload Immutability Check
                if (existing.requestPayloadHash && payloadHash && existing.requestPayloadHash !== payloadHash) {
                    console.error(`[WhatsAppService] Payload mismatch on idempotency key '${idempotencyKey}'`);
                    return {
                        canDispatch: false,
                        error: `Idempotency key '${idempotencyKey}' was previously claimed with a different payload. Changing payload with the same idempotency key is prohibited.`,
                        code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
                    };
                }

                // 3. Already Dispatched (Replay)
                if (existing.status === 'DISPATCHED') {
                    this._setIdempotentResult(idempotencyKey, existing.responsePayload);
                    return {
                        canDispatch: false,
                        isReplay: true,
                        result: {
                            ...(existing.responsePayload || {}),
                            alreadySent: true,
                            duplicate: true,
                            durableLedgerId: existing._id,
                            providerMessageId: existing.providerMessageId
                        }
                    };
                }

                // 4. Ambiguous Timeout (Block blind automatic retries)
                if (existing.status === 'AMBIGUOUS_TIMEOUT') {
                    if (!options?.forceRetryAmbiguous) {
                        console.warn(`[WhatsAppService] Automatic retry blocked for key '${idempotencyKey}': Previous attempt ended in ambiguous provider timeout.`);
                        return {
                            canDispatch: false,
                            isAmbiguousBlocked: true,
                            result: {
                                success: false,
                                error: 'Dispatch outcome is ambiguous due to provider network timeout. Automatic retry blocked to prevent duplicate message dispatch. Awaiting webhook reconciliation or administrative override.',
                                code: 'AMBIGUOUS_TIMEOUT_BLOCKED',
                                isAmbiguous: true,
                                durableLedgerId: existing._id
                            }
                        };
                    }
                }

                // 5. In-flight claim (CLAIMED)
                if (existing.status === 'CLAIMED') {
                    const claimAgeMs = now.getTime() - new Date(existing.claimedAt || existing.createdAt).getTime();
                    if (claimAgeMs < 30000) {
                        // In-flight by another active worker: Poll up to 2 seconds for completion
                        for (let poll = 0; poll < 10; poll++) {
                            await new Promise(r => setTimeout(r, 200));
                            const polled = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                            if (polled && polled.status === 'DISPATCHED') {
                                this._setIdempotentResult(idempotencyKey, polled.responsePayload);
                                return {
                                    canDispatch: false,
                                    isReplay: true,
                                    result: {
                                        ...(typeof polled.responsePayload === 'object' ? polled.responsePayload : {}),
                                        alreadySent: true,
                                        duplicate: true,
                                        durableLedgerId: polled._id,
                                        providerMessageId: polled.providerMessageId
                                    }
                                };
                            }
                            if (polled && (polled.status === 'FAILED' || polled.status === 'AMBIGUOUS_TIMEOUT')) {
                                break;
                            }
                        }
                        const finalCheck = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                        if (finalCheck && finalCheck.status === 'DISPATCHED') {
                            this._setIdempotentResult(idempotencyKey, finalCheck.responsePayload);
                            return {
                                canDispatch: false,
                                isReplay: true,
                                result: {
                                    ...(typeof finalCheck.responsePayload === 'object' ? finalCheck.responsePayload : {}),
                                    alreadySent: true,
                                    duplicate: true,
                                    durableLedgerId: finalCheck._id,
                                    providerMessageId: finalCheck.providerMessageId
                                }
                            };
                        }
                        return {
                            canDispatch: false,
                            inFlight: true,
                            result: {
                                success: false,
                                error: `Concurrent dispatch attempt detected for key '${idempotencyKey}'. In-flight by worker ${existing.claimWorkerId}`,
                                code: 'CONCURRENT_DISPATCH_IN_FLIGHT'
                            }
                        };
                    }

                    // Stale claim (>=30s): Reclaim atomically with generation fencing!
                    const nextGen = (existing.claimGeneration || 1) + 1;
                    const reclaimed = await WhatsAppDispatch.findOneAndUpdate(
                        {
                            idempotencyKey,
                            status: 'CLAIMED',
                            claimGeneration: existing.claimGeneration || 1
                        },
                        {
                            $set: {
                                claimedAt: now,
                                claimWorkerId: workerId,
                                claimGeneration: nextGen,
                                provider: provider || 'META',
                                requestPayload: payload,
                                requestPayloadHash: payloadHash
                            }
                        },
                        { new: true }
                    );
                    if (reclaimed) {
                        return {
                            canDispatch: true,
                            isReplay: false,
                            dispatchId: reclaimed._id,
                            claimGeneration: nextGen
                        };
                    }

                    // If CAS update missed (refreshed by concurrent worker)
                    const refreshed = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                    if (refreshed && refreshed.status === 'DISPATCHED') {
                        this._setIdempotentResult(idempotencyKey, refreshed.responsePayload);
                        return {
                            canDispatch: false,
                            isReplay: true,
                            result: {
                                ...(refreshed.responsePayload || {}),
                                alreadySent: true,
                                duplicate: true,
                                durableLedgerId: refreshed._id,
                                providerMessageId: refreshed.providerMessageId
                            }
                        };
                    }
                }

                // 6. Failed claim (or AMBIGUOUS_TIMEOUT with explicit forceRetryAmbiguous)
                if (existing.status === 'FAILED' || (existing.status === 'AMBIGUOUS_TIMEOUT' && options?.forceRetryAmbiguous)) {
                    const nextGen = (existing.claimGeneration || 1) + 1;
                    const reclaimed = await WhatsAppDispatch.findOneAndUpdate(
                        {
                            idempotencyKey,
                            status: existing.status,
                            claimGeneration: existing.claimGeneration || 1
                        },
                        {
                            $set: {
                                status: 'CLAIMED',
                                isAmbiguous: false,
                                claimedAt: now,
                                claimWorkerId: workerId,
                                claimGeneration: nextGen,
                                provider: provider || 'META',
                                requestPayload: payload,
                                requestPayloadHash: payloadHash
                            }
                        },
                        { new: true }
                    );
                    if (reclaimed) {
                        return {
                            canDispatch: true,
                            isReplay: false,
                            dispatchId: reclaimed._id,
                            claimGeneration: nextGen
                        };
                    }
                }
            }

            // Fresh claim
            try {
                const newRecord = await WhatsAppDispatch.create({
                    idempotencyKey,
                    recipient: normalizedMobile,
                    provider: provider || 'META',
                    messageType: messageType || 'text',
                    status: 'CLAIMED',
                    claimGeneration: 1,
                    claimedAt: now,
                    claimWorkerId: workerId,
                    correlationId: String(idempotencyKey).slice(0, 512),
                    requestPayload: payload,
                    requestPayloadHash: payloadHash,
                    tenantId: null
                });
                return {
                    canDispatch: true,
                    isReplay: false,
                    dispatchId: newRecord._id,
                    claimGeneration: 1
                };
            } catch (createErr) {
                if (createErr.code === 11000) {
                    // Poll for completion by racing worker
                    for (let poll = 0; poll < 10; poll++) {
                        await new Promise(r => setTimeout(r, 200));
                        const polled = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                        if (polled && polled.status === 'DISPATCHED') {
                            this._setIdempotentResult(idempotencyKey, polled.responsePayload);
                            return {
                                canDispatch: false,
                                isReplay: true,
                                result: {
                                    ...(polled.responsePayload || {}),
                                    alreadySent: true,
                                    duplicate: true,
                                    durableLedgerId: polled._id,
                                    providerMessageId: polled.providerMessageId
                                }
                            };
                        }
                        if (polled && (polled.status === 'FAILED' || polled.status === 'AMBIGUOUS_TIMEOUT')) {
                            break;
                        }
                    }
                    const raced = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                    if (raced && raced.status === 'DISPATCHED') {
                        this._setIdempotentResult(idempotencyKey, raced.responsePayload);
                        return {
                            canDispatch: false,
                            isReplay: true,
                            result: {
                                ...(raced.responsePayload || {}),
                                alreadySent: true,
                                duplicate: true,
                                durableLedgerId: raced._id,
                                providerMessageId: raced.providerMessageId
                            }
                        };
                    }
                    return {
                        canDispatch: false,
                        inFlight: true,
                        result: {
                            success: false,
                            error: `Concurrent dispatch attempt detected for key '${idempotencyKey}'. In-flight by worker ${raced?.claimWorkerId}`,
                            code: 'CONCURRENT_DISPATCH_IN_FLIGHT'
                        }
                    };
                }
                throw createErr;
            }
        } catch (err) {
            console.error(`[WhatsAppService] Durable dispatch claim check failed for key '${idempotencyKey}':`, err.message);
            return {
                canDispatch: false,
                error: `Durable dispatch ledger failure: ${err.message}. Keyed dispatches fail-closed to prevent duplicate delivery.`,
                code: 'DURABLE_LEDGER_ERROR'
            };
        }
    }

    async _recordDurableSuccess({ idempotencyKey, claimGeneration, result, providerMessageId, recipient, payloadHash }) {
        if (!idempotencyKey) return { success: true };
        this._setIdempotentResult(idempotencyKey, result, recipient, payloadHash);
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return { success: true };
        try {
            const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
            const query = { idempotencyKey };
            if (claimGeneration !== undefined && claimGeneration !== null) {
                query.claimGeneration = claimGeneration;
            }
            const update = {
                $set: {
                    status: 'DISPATCHED',
                    isAmbiguous: false,
                    dispatchedAt: new Date(),
                    providerMessageId: providerMessageId || result?.messageId || result?.messages?.[0]?.id,
                    responsePayload: this.sanitizeSecrets(result)
                }
            };
            const updated = await WhatsAppDispatch.findOneAndUpdate(query, update, { new: true });
            if (updated) {
                this._setIdempotentResult(idempotencyKey, result, updated.recipient || recipient, updated.requestPayloadHash || payloadHash);
            }
            if (!updated && claimGeneration) {
                console.warn(`[WhatsAppService] Stale worker finalization rejected for key '${idempotencyKey}' (generation ${claimGeneration} was superseded).`);
                return { superseded: true };
            }
            return { success: true };
        } catch (err) {
            console.warn(`[WhatsAppService] Failed to record durable success for key '${idempotencyKey}':`, err.message);
            return { success: false, error: err.message };
        }
    }

    async _recordDurableFailure({ idempotencyKey, claimGeneration, error, rawError, isAmbiguous = false }) {
        if (!idempotencyKey) return { success: true };
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return { success: true };
        try {
            const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
            const query = { idempotencyKey };
            if (claimGeneration !== undefined && claimGeneration !== null) {
                query.claimGeneration = claimGeneration;
            }
            const status = isAmbiguous ? 'AMBIGUOUS_TIMEOUT' : 'FAILED';
            const update = {
                $set: {
                    status,
                    isAmbiguous,
                    errorDetails: {
                        message: typeof error === 'string' ? error : (error?.message || String(error)),
                        raw: rawError || null,
                        failedAt: new Date(),
                        isAmbiguous
                    }
                }
            };
            const updated = await WhatsAppDispatch.findOneAndUpdate(query, update, { new: true });
            if (!updated && claimGeneration) {
                console.warn(`[WhatsAppService] Stale worker failure rejected for key '${idempotencyKey}' (generation ${claimGeneration} was superseded).`);
                return { superseded: true };
            }
            return { success: true };
        } catch (err) {
            console.warn(`[WhatsAppService] Failed to record durable failure for key '${idempotencyKey}':`, err.message);
            return { success: false, error: err.message };
        }
    }

    async reconcileAmbiguousDispatch(idempotencyKey, { providerMessageId, status = 'DISPATCHED', resolutionReason = 'Webhook reconciliation' } = {}) {
        if (!idempotencyKey) throw new Error('idempotencyKey is required for reconciliation');
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            throw new Error('Database is unavailable for reconciliation');
        }
        const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
        const targetStatus = status === 'FAILED' ? 'FAILED' : 'DISPATCHED';
        const update = {
            $set: {
                status: targetStatus,
                isAmbiguous: false,
                reconciledAt: new Date(),
                reconciliationStatus: 'RECONCILED',
                reconciliationReason: resolutionReason
            }
        };
        if (providerMessageId) {
            update.$set.providerMessageId = providerMessageId;
        }
        const reconciled = await WhatsAppDispatch.findOneAndUpdate(
            { idempotencyKey, status: 'AMBIGUOUS_TIMEOUT' },
            update,
            { new: true }
        );
        if (reconciled && targetStatus === 'DISPATCHED') {
            this._setIdempotentResult(idempotencyKey, reconciled.responsePayload || { messageId: providerMessageId, success: true }, reconciled.recipient, reconciled.requestPayloadHash);
        }
        return reconciled;
    }

    _buildMonotonicQueryCondition(newStatus) {
        const s = String(newStatus || '').toLowerCase();
        if (s === 'read') {
            return { deliveryStatus: { $ne: 'failed' } };
        }
        if (s === 'delivered') {
            return { deliveryStatus: { $nin: ['read', 'failed'] } };
        }
        if (s === 'sent') {
            return { deliveryStatus: { $nin: ['delivered', 'read', 'failed'] } };
        }
        if (s === 'failed') {
            return { deliveryStatus: { $nin: ['delivered', 'read', 'failed'] } };
        }
        return {};
    }

    /**
     * Reconcile outbound WhatsAppDispatch records with incoming status webhook
     * Enforces deterministic correlation, monotonic status progression, and
     * explicit manual reconciliation flagging when correlation data is ambiguous.
     */
    async reconcileWebhookStatus(statusObj, options = {}) {
        if (!statusObj || !statusObj.id) {
            return { reconciled: false, reason: 'INVALID_STATUS_PAYLOAD' };
        }

        // P0-B: Prefer biz_opaque_callback_data when it is a valid canonical dispatch idempotency key
        let canonicalIdempotencyKey = null;
        if (statusObj.biz_opaque_callback_data && typeof statusObj.biz_opaque_callback_data === 'string' && statusObj.biz_opaque_callback_data.trim()) {
            canonicalIdempotencyKey = statusObj.biz_opaque_callback_data.trim();
        }

        // If absent, resolve canonical key from durable dispatch record using providerMessageId
        if (!canonicalIdempotencyKey) {
            if (!mongoose.connection || mongoose.connection.readyState !== 1) {
                console.error('[WhatsAppService] Database unavailable while resolving canonical lock key for webhook:', statusObj.id);
                return { reconciled: false, reason: 'DATABASE_UNAVAILABLE' };
            }

            try {
                const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
                const found = await WhatsAppDispatch.findOne({ providerMessageId: statusObj.id }).select('idempotencyKey').lean();
                if (found?.idempotencyKey) {
                    canonicalIdempotencyKey = found.idempotencyKey.trim();
                } else {
                    // Check if ambiguous dispatches exist for recipient that need manual reconciliation flagging
                    const rawRecipient = statusObj.recipient_id;
                    const normalizedRecipient = this._normalizeTarget(rawRecipient) || String(rawRecipient || '');
                    const ambiguousForRecipient = await WhatsAppDispatch.find({
                        recipient: { $in: [normalizedRecipient, rawRecipient] },
                        $or: [{ status: 'AMBIGUOUS_TIMEOUT' }, { isAmbiguous: true }]
                    }).lean();

                    if (ambiguousForRecipient.length > 0) {
                        await WhatsAppDispatch.updateMany(
                            { _id: { $in: ambiguousForRecipient.map(d => d._id) } },
                            {
                                $set: {
                                    reconciliationStatus: 'MANUAL_RECONCILIATION_REQUIRED',
                                    reconciliationReason: `INSUFFICIENT_CORRELATION_DATA: Webhook ${statusObj.id} arrived without matching opaque correlation token. ${ambiguousForRecipient.length} ambiguous dispatch(es) exist for recipient.`
                                }
                            }
                        );
                        console.warn(`[WhatsAppService] Webhook ${statusObj.id} cannot be safely correlated: Missing deterministic correlation token. Flagged ${ambiguousForRecipient.length} ambiguous dispatch(es) for recipient ${normalizedRecipient} as MANUAL_RECONCILIATION_REQUIRED.`);
                        return {
                            reconciled: false,
                            reason: 'MANUAL_RECONCILIATION_REQUIRED',
                            ambiguousCount: ambiguousForRecipient.length,
                            providerMessageId: statusObj.id,
                            recipient: normalizedRecipient
                        };
                    }

                    // P0-B: No matching durable dispatch record exists. Return controlled outcome. Do NOT fallback to providerMessageId.
                    console.warn(`[WhatsAppService] No durable dispatch record found for providerMessageId '${statusObj.id}'. Cannot resolve canonical lock key.`);
                    return {
                        reconciled: false,
                        reason: 'DISPATCH_NOT_FOUND',
                        providerMessageId: statusObj.id
                    };
                }
            } catch (dbErr) {
                // P0-B: Do not silently swallow database lookup errors; abort reconciliation.
                console.error(`[WhatsAppService] Database lookup error while resolving canonical lock key for '${statusObj.id}':`, dbErr.message);
                return { reconciled: false, reason: 'DATABASE_ERROR', error: dbErr.message };
            }
        }

        if (!canonicalIdempotencyKey) {
            return { reconciled: false, reason: 'CANONICAL_KEY_UNRESOLVABLE', providerMessageId: statusObj.id };
        }

        const lockOptions = { ...(options || {}), ...(statusObj?.lockOptions || {}) };
        try {
            return await _withReconcileKeyLock(canonicalIdempotencyKey, async (lockContext) => {
                return await this._reconcileWebhookStatusInternal(statusObj, lockContext);
            }, lockOptions);
        } catch (lockErr) {
            console.error(`[WhatsAppService] Reconciliation aborted due to distributed lock failure for '${canonicalIdempotencyKey}':`, lockErr.message);
            return {
                reconciled: false,
                reason: lockErr.message?.includes('DISTRIBUTED_LOCK_TIMEOUT')
                    ? 'DISTRIBUTED_LOCK_TIMEOUT'
                    : 'DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE',
                error: lockErr.message,
                idempotencyKey: canonicalIdempotencyKey
            };
        }
    }

    async _reconcileWebhookStatusInternal(statusObj, lockContext = null) {
        if (!statusObj || !statusObj.id) {
            return { reconciled: false, reason: 'INVALID_STATUS_PAYLOAD' };
        }
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            console.error('[WhatsAppService] Database unavailable during webhook status reconciliation');
            return { reconciled: false, reason: 'DATABASE_UNAVAILABLE' };
        }

        const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
        const providerMessageId = statusObj.id;
        const statusVal = String(statusObj.status || '').toLowerCase();
        const statusTimestamp = statusObj.timestamp
            ? new Date(parseInt(statusObj.timestamp, 10) * 1000)
            : new Date();
        const rawRecipient = statusObj.recipient_id;
        const normalizedRecipient = this._normalizeTarget(rawRecipient) || String(rawRecipient || '');
        const opaqueCallbackData = statusObj.biz_opaque_callback_data || null;

        // 1. Direct Match: Check if a dispatch record already possesses this providerMessageId
        let dispatch = await WhatsAppDispatch.findOne({ providerMessageId }).lean();

        if (dispatch) {
            // Check monotonic delivery status transition
            const currentDeliveryStatus = dispatch.deliveryStatus || dispatch.responsePayload?.deliveryStatus || null;
            if (!isMonotonicStatusTransition(currentDeliveryStatus, statusVal)) {
                console.log(`[WhatsAppService] Regressive status '${statusVal}' ignored for dispatch ${dispatch.idempotencyKey} (current: '${currentDeliveryStatus}')`);
                return {
                    reconciled: false,
                    reason: 'REGRESSIVE_STATUS_IGNORED',
                    idempotencyKey: dispatch.idempotencyKey,
                    currentStatus: currentDeliveryStatus,
                    attemptedStatus: statusVal
                };
            }

            // Check if repeated webhook delivery (idempotency check)
            if (currentDeliveryStatus === statusVal && dispatch.status !== 'AMBIGUOUS_TIMEOUT') {
                return {
                    reconciled: true,
                    alreadyReconciled: true,
                    idempotencyKey: dispatch.idempotencyKey,
                    status: dispatch.status,
                    deliveryStatus: statusVal
                };
            }

            // Update dispatch atomically with monotonic race condition guard
            const updateFields = {
                deliveryStatus: statusVal,
                deliveryStatusAt: statusTimestamp,
                isAmbiguous: false,
                'responsePayload.deliveryStatus': statusVal,
                'responsePayload.deliveryStatusAt': statusTimestamp,
                reconciledAt: new Date(),
                reconciliationStatus: 'RECONCILED',
                reconciliationReason: 'DIRECT_PROVIDER_MESSAGE_ID'
            };
            if (statusVal === 'failed') {
                updateFields.status = 'FAILED';
                updateFields['responsePayload.success'] = false;
                if (statusObj.errors && statusObj.errors.length > 0) {
                    updateFields.errorDetails = this.sanitizeSecrets(statusObj.errors[0]);
                }
            } else if (dispatch.status !== 'DISPATCHED') {
                updateFields.status = 'DISPATCHED';
                updateFields['responsePayload.success'] = true;
            }

            const monotonicCondition = this._buildMonotonicQueryCondition(statusVal);
            const updateQuery = {
                _id: dispatch._id,
                ...monotonicCondition
            };

            // P0-D: Verify lease ownership before executing atomic state mutation
            if (lockContext?.isLockLost?.()) {
                console.error(`[WhatsAppService] Reconciliation lock lost before updating dispatch '${dispatch.idempotencyKey}'. Aborting mutation.`);
                return { reconciled: false, reason: 'DISTRIBUTED_LOCK_LOST' };
            }

            if (lockContext?.validateOwnership) {
                const isOwner = await lockContext.validateOwnership();
                if (!isOwner) {
                    console.error(`[WhatsAppService] Webhook reconciliation lock ownership validation failed for dispatch '${dispatch.idempotencyKey}'. Aborting mutation.`);
                    return { reconciled: false, reason: 'DISTRIBUTED_LOCK_LOST' };
                }
            }

            // P0-D: Hook for deterministic cross-store race testing
            if (statusObj?.hooks?.beforeMongoCas) {
                await statusObj.hooks.beforeMongoCas({ updateQuery, updateFields, lockContext, dispatch });
            }

            // Monotonic fencing token enforcement
            if (lockContext?.fencingToken) {
                updateQuery.$and = updateQuery.$and || [];
                updateQuery.$and.push({
                    $or: [
                        { reconcileGeneration: { $exists: false } },
                        { reconcileGeneration: null },
                        { reconcileGeneration: { $lt: lockContext.fencingToken } }
                    ]
                });
                updateFields.reconcileGeneration = lockContext.fencingToken;
            }

            const updated = await WhatsAppDispatch.findOneAndUpdate(updateQuery, { $set: updateFields }, { new: true });
            if (!updated) {
                // A concurrent worker already advanced the document or recorded conflicting status
                const currentDoc = await WhatsAppDispatch.findById(dispatch._id).lean();
                if (currentDoc) {
                    if (currentDoc.reconcileGeneration && lockContext?.fencingToken && currentDoc.reconcileGeneration >= lockContext.fencingToken) {
                        console.warn(`[WhatsAppService] Webhook reconciliation rejected due to stale fencing generation for '${dispatch.idempotencyKey}': docGen=${currentDoc.reconcileGeneration}, lockGen=${lockContext.fencingToken}`);
                        return {
                            reconciled: false,
                            reason: 'STALE_FENCING_GENERATION',
                            idempotencyKey: currentDoc.idempotencyKey,
                            reconcileGeneration: currentDoc.reconcileGeneration,
                            fencingToken: lockContext.fencingToken
                        };
                    }
                    if (currentDoc.deliveryStatus === statusVal && currentDoc.status !== 'AMBIGUOUS_TIMEOUT') {
                        return {
                            reconciled: true,
                            alreadyReconciled: true,
                            idempotencyKey: currentDoc.idempotencyKey,
                            status: currentDoc.status,
                            deliveryStatus: currentDoc.deliveryStatus
                        };
                    }
                    if (!isMonotonicStatusTransition(currentDoc.deliveryStatus, statusVal)) {
                        return {
                            reconciled: false,
                            reason: 'REGRESSIVE_STATUS_IGNORED',
                            idempotencyKey: currentDoc.idempotencyKey,
                            currentStatus: currentDoc.deliveryStatus,
                            attemptedStatus: statusVal
                        };
                    }
                }
            }

            if (updated && updated.status === 'DISPATCHED') {
                const cachedRes = {
                    ...(updated.responsePayload || {}),
                    success: true,
                    messageId: providerMessageId,
                    providerMessageId
                };
                this._setIdempotentResult(updated.idempotencyKey, cachedRes, updated.recipient, updated.requestPayloadHash);
            }
            return {
                reconciled: true,
                idempotencyKey: updated?.idempotencyKey || dispatch.idempotencyKey,
                status: updated?.status || dispatch.status,
                deliveryStatus: statusVal
            };
        }

        // 2. Deterministic Correlation via biz_opaque_callback_data (idempotencyKey / correlationId)
        if (opaqueCallbackData) {
            const candidateByOpaque = await WhatsAppDispatch.findOne({
                $or: [{ idempotencyKey: opaqueCallbackData }, { correlationId: opaqueCallbackData }]
            }).lean();

            if (candidateByOpaque) {
                // Verified safety check: recipient must match
                const candidateRecipient = this._normalizeTarget(candidateByOpaque.recipient) || candidateByOpaque.recipient;
                if (candidateRecipient !== normalizedRecipient && candidateByOpaque.recipient !== rawRecipient) {
                    console.error(`[WhatsAppService] Security mismatch: biz_opaque_callback_data '${opaqueCallbackData}' recipient '${candidateRecipient}' does not match webhook recipient '${normalizedRecipient}'`);
                    return {
                        reconciled: false,
                        reason: 'SECURITY_RECIPIENT_MISMATCH',
                        idempotencyKey: opaqueCallbackData
                    };
                }

                // Provider Message ID rebinding protection: cannot overwrite confirmed providerMessageId with a different ID
                if (candidateByOpaque.providerMessageId && candidateByOpaque.providerMessageId !== providerMessageId) {
                    console.warn(`[WhatsAppService] Webhook providerMessageId '${providerMessageId}' does not match confirmed providerMessageId '${candidateByOpaque.providerMessageId}' for dispatch '${candidateByOpaque.idempotencyKey}'. Rebinding rejected.`);
                    return {
                        reconciled: false,
                        reason: 'PROVIDER_ID_REBIND_FORBIDDEN',
                        idempotencyKey: candidateByOpaque.idempotencyKey,
                        existingProviderMessageId: candidateByOpaque.providerMessageId,
                        incomingProviderMessageId: providerMessageId
                    };
                }

                // Deterministic correlation verified!
                const currentDelivery = candidateByOpaque.deliveryStatus || candidateByOpaque.responsePayload?.deliveryStatus || null;
                if (!isMonotonicStatusTransition(currentDelivery, statusVal)) {
                    return {
                        reconciled: false,
                        reason: 'REGRESSIVE_STATUS_IGNORED',
                        idempotencyKey: candidateByOpaque.idempotencyKey
                    };
                }

                const updateFields = {
                    providerMessageId,
                    deliveryStatus: statusVal,
                    deliveryStatusAt: statusTimestamp,
                    isAmbiguous: false,
                    'responsePayload.success': true,
                    'responsePayload.deliveryStatus': statusVal,
                    'responsePayload.deliveryStatusAt': statusTimestamp,
                    'responsePayload.messageId': providerMessageId,
                    reconciledAt: new Date(),
                    reconciliationStatus: 'RECONCILED',
                    reconciliationReason: 'DETERMINISTIC_OPAQUE_CALLBACK_DATA'
                };
                if (statusVal === 'failed') {
                    updateFields.status = 'FAILED';
                    updateFields['responsePayload.success'] = false;
                    if (statusObj.errors && statusObj.errors.length > 0) {
                        updateFields.errorDetails = this.sanitizeSecrets(statusObj.errors[0]);
                    }
                } else {
                    updateFields.status = 'DISPATCHED';
                }

                const monotonicCondition = this._buildMonotonicQueryCondition(statusVal);
                const updateQuery = {
                    _id: candidateByOpaque._id,
                    $or: [
                        { providerMessageId: null },
                        { providerMessageId: { $exists: false } },
                        { providerMessageId: providerMessageId }
                    ],
                    ...monotonicCondition
                };

                // P0-D: Verify lease ownership before executing atomic state mutation
                if (lockContext?.isLockLost?.()) {
                    console.error(`[WhatsAppService] Reconciliation lock lost before updating dispatch '${candidateByOpaque.idempotencyKey}'. Aborting mutation.`);
                    return { reconciled: false, reason: 'DISTRIBUTED_LOCK_LOST' };
                }

                if (lockContext?.validateOwnership) {
                    const isOwner = await lockContext.validateOwnership();
                    if (!isOwner) {
                        console.error(`[WhatsAppService] Webhook reconciliation lock ownership validation failed for dispatch '${candidateByOpaque.idempotencyKey}'. Aborting mutation.`);
                        return { reconciled: false, reason: 'DISTRIBUTED_LOCK_LOST' };
                    }
                }

                // P0-D: Hook for deterministic cross-store race testing
                if (statusObj?.hooks?.beforeMongoCas) {
                    await statusObj.hooks.beforeMongoCas({ updateQuery, updateFields, lockContext, dispatch: candidateByOpaque });
                }

                // Monotonic fencing token enforcement
                if (lockContext?.fencingToken) {
                    updateQuery.$and = updateQuery.$and || [];
                    updateQuery.$and.push({
                        $or: [
                            { reconcileGeneration: { $exists: false } },
                            { reconcileGeneration: null },
                            { reconcileGeneration: { $lt: lockContext.fencingToken } }
                        ]
                    });
                    updateFields.reconcileGeneration = lockContext.fencingToken;
                }

                let updated;
                try {
                    updated = await WhatsAppDispatch.findOneAndUpdate(updateQuery, { $set: updateFields }, { new: true });
                } catch (dbErr) {
                    if (dbErr.code === 11000 && String(dbErr.message).includes('providerMessageId')) {
                        console.warn(`[WhatsAppService] Provider message ID collision for '${providerMessageId}': already bound to another dispatch.`);
                        return {
                            reconciled: false,
                            reason: 'PROVIDER_ID_COLLISION',
                            providerMessageId,
                            idempotencyKey: candidateByOpaque.idempotencyKey
                        };
                    }
                    throw dbErr;
                }

                if (!updated) {
                    const currentDoc = await WhatsAppDispatch.findById(candidateByOpaque._id).lean();
                    if (currentDoc) {
                        if (currentDoc.reconcileGeneration && lockContext?.fencingToken && currentDoc.reconcileGeneration >= lockContext.fencingToken) {
                            console.warn(`[WhatsAppService] Webhook reconciliation rejected due to stale fencing generation for '${candidateByOpaque.idempotencyKey}': docGen=${currentDoc.reconcileGeneration}, lockGen=${lockContext.fencingToken}`);
                            return {
                                reconciled: false,
                                reason: 'STALE_FENCING_GENERATION',
                                idempotencyKey: currentDoc.idempotencyKey,
                                reconcileGeneration: currentDoc.reconcileGeneration,
                                fencingToken: lockContext.fencingToken
                            };
                        }
                        if (currentDoc.deliveryStatus === statusVal && currentDoc.status !== 'AMBIGUOUS_TIMEOUT') {
                            return {
                                reconciled: true,
                                alreadyReconciled: true,
                                idempotencyKey: currentDoc.idempotencyKey,
                                status: currentDoc.status,
                                deliveryStatus: currentDoc.deliveryStatus
                            };
                        }
                        if (!isMonotonicStatusTransition(currentDoc.deliveryStatus, statusVal)) {
                            return {
                                reconciled: false,
                                reason: 'REGRESSIVE_STATUS_IGNORED',
                                idempotencyKey: currentDoc.idempotencyKey,
                                currentStatus: currentDoc.deliveryStatus,
                                attemptedStatus: statusVal
                            };
                        }
                    }
                }

                if (updated && updated.status === 'DISPATCHED') {
                    const cachedRes = {
                        ...(updated.responsePayload || {}),
                        success: true,
                        messageId: providerMessageId,
                        providerMessageId
                    };
                    this._setIdempotentResult(updated.idempotencyKey, cachedRes, updated.recipient, updated.requestPayloadHash);
                }
                return {
                    reconciled: true,
                    correlatedViaOpaqueData: true,
                    idempotencyKey: updated?.idempotencyKey || candidateByOpaque.idempotencyKey,
                    providerMessageId,
                    status: updated?.status || candidateByOpaque.status,
                    deliveryStatus: statusVal
                };
            }
        }

        // 3. Fallback / Ambiguous Safety Gate:
        // Provider message ID is unknown, and biz_opaque_callback_data is missing or unmapped.
        // Check if there are any AMBIGUOUS_TIMEOUT dispatches for this recipient.
        const ambiguousForRecipient = await WhatsAppDispatch.find({
            recipient: { $in: [normalizedRecipient, rawRecipient] },
            $or: [{ status: 'AMBIGUOUS_TIMEOUT' }, { isAmbiguous: true }]
        }).lean();

        if (ambiguousForRecipient.length > 0) {
            // DO NOT GUESS! DO NOT ARBITRARILY BIND TO ANY DISPATCH!
            // Retain ambiguous state and flag records as requiring manual reconciliation.
            await WhatsAppDispatch.updateMany(
                { _id: { $in: ambiguousForRecipient.map(d => d._id) } },
                {
                    $set: {
                        reconciliationStatus: 'MANUAL_RECONCILIATION_REQUIRED',
                        reconciliationReason: `INSUFFICIENT_CORRELATION_DATA: Webhook ${providerMessageId} arrived without matching opaque correlation token. ${ambiguousForRecipient.length} ambiguous dispatch(es) exist for recipient.`
                    }
                }
            );

            console.warn(`[WhatsAppService] Webhook ${providerMessageId} cannot be safely correlated: Missing deterministic correlation token. Flagged ${ambiguousForRecipient.length} ambiguous dispatch(es) for recipient ${normalizedRecipient} as MANUAL_RECONCILIATION_REQUIRED.`);

            return {
                reconciled: false,
                reason: 'MANUAL_RECONCILIATION_REQUIRED',
                ambiguousCount: ambiguousForRecipient.length,
                providerMessageId,
                recipient: normalizedRecipient
            };
        }

        // No matching dispatch found and no ambiguous records exist
        return {
            reconciled: false,
            reason: 'NO_MATCHING_DISPATCH',
            providerMessageId
        };
    }

    /**
     * Manually reconcile an ambiguous or failed dispatch record by an authorized operator.
     * Enforces:
     * Manually reconcile an ambiguous or failed dispatch record by an authorized operator or trusted service.
     * Enforces:
     * 1. Authorization: Verified server-side actor identity or trusted service context
     *    - Strict permission: 'whatsapp.dispatch.reconcile' (or privileged administrative role)
     *    - No broad bypass on role.isSystemRole or unverified client claims
     *    - Impersonation prevention (client actorId must match authenticated context)
     *    - Rejects unknown, inactive, or suspended users
     * 2. Fail-closed database availability verification
     * 3. Immutable recipient matching verification
     * 4. Mandatory source state transitions (DISPATCHED requires providerMessageId; cannot regress confirmed delivery)
     * 5. Collision & rebinding prevention on providerMessageId
     * 6. Comprehensive audit metadata (reconciledBy, reconciledAt, reconciliationReason)
     */
    async manualReconcileDispatch(params = {}, options = {}) {
        const { idempotencyKey } = params || {};
        if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
            return { success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' };
        }
        const lockOptions = { ...(options || {}), ...(params?.lockOptions || {}) };
        try {
            return await _withReconcileKeyLock(idempotencyKey, async (lockContext) => {
                return await this._manualReconcileDispatchInternal(params, lockContext);
            }, lockOptions);
        } catch (lockErr) {
            console.error(`[WhatsAppService] Manual reconciliation aborted due to lock failure for '${idempotencyKey}':`, lockErr.message);
            return {
                success: false,
                error: lockErr.message?.includes('DISTRIBUTED_LOCK_TIMEOUT')
                    ? 'DISTRIBUTED_LOCK_TIMEOUT'
                    : 'DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE',
                detail: lockErr.message,
                idempotencyKey
            };
        }
    }

    async _manualReconcileDispatchInternal({ idempotencyKey, targetStatus, providerMessageId, actorId, actorContext, serviceContext, reason, recipient, hooks } = {}, lockContext = null) {
        if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
            return { success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' };
        }
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            return { success: false, error: 'DATABASE_UNAVAILABLE: Cannot perform manual reconciliation while database is disconnected' };
        }

        // 🚀 BOUNDARY AUTHORIZATION: Derive identity from verified server context or trusted service context
        let verifiedAuditActor = null;

        if (serviceContext) {
            // Trusted internal service-to-service invocation
            const TRUSTED_SERVICES = ['WhatsAppDispatchReconcilerWorker', 'DispatchAuditCron', 'WhatsAppAutomationEngine'];

            const configuredSecret = process.env.INTERNAL_SERVICE_SECRET;
            if (!configuredSecret || typeof configuredSecret !== 'string' || !configuredSecret.trim()) {
                return { success: false, error: 'AUTHORIZATION_DENIED: Service secret not configured' };
            }

            if (!serviceContext || typeof serviceContext !== 'object') {
                return { success: false, error: 'AUTHORIZATION_DENIED: Untrusted service context' };
            }

            const { isService, serviceName, serviceSecret } = serviceContext;

            if (isService !== true) {
                return { success: false, error: 'AUTHORIZATION_DENIED: Untrusted service context' };
            }

            if (!serviceName || typeof serviceName !== 'string' || !TRUSTED_SERVICES.includes(serviceName.trim())) {
                return { success: false, error: 'AUTHORIZATION_DENIED: Untrusted service name' };
            }

            if (!serviceSecret || typeof serviceSecret !== 'string' || !serviceSecret.trim()) {
                return { success: false, error: 'AUTHORIZATION_DENIED: Missing service secret' };
            }

            // Timing-safe secret comparison
            const providedBuf = Buffer.from(serviceSecret.trim());
            const configuredBuf = Buffer.from(configuredSecret.trim());
            const isSecretMatch = providedBuf.length === configuredBuf.length && crypto.timingSafeEqual(providedBuf, configuredBuf);

            if (!isSecretMatch) {
                return { success: false, error: 'AUTHORIZATION_DENIED: Invalid service secret' };
            }

            verifiedAuditActor = `service:${serviceName.trim()}`;
        } else {
            // User-initiated reconciliation: require verified server-side authentication context
            if (!actorContext || typeof actorContext !== 'object') {
                return {
                    success: false,
                    error: 'AUTHENTICATION_REQUIRED: Verified server-side actorContext is required for user reconciliation'
                };
            }

            const contextUserId = String(actorContext._id || actorContext.id || '').trim();
            if (!contextUserId) {
                return {
                    success: false,
                    error: 'AUTHENTICATION_REQUIRED: actorContext must contain a valid user identity (_id or id)'
                };
            }

            // If caller passes actorId, require it to match authenticated context; never use it as a substitute for that context
            if (actorId !== undefined && actorId !== null) {
                const requestedActorId = String(actorId).trim();
                if (requestedActorId && requestedActorId !== contextUserId) {
                    return {
                        success: false,
                        error: 'AUTHORIZATION_DENIED: Client actorId does not match authenticated context'
                    };
                }
            }

            const User = mongoose.models.User || (await import('../models/User.js')).default;
            let authorizedUser = null;
            if (mongoose.Types.ObjectId.isValid(contextUserId)) {
                authorizedUser = await User.findById(contextUserId).populate('role').lean();
            } else {
                authorizedUser = await User.findOne({ email: contextUserId.toLowerCase() }).populate('role').lean();
            }

            if (!authorizedUser) {
                return { success: false, error: `AUTHORIZATION_DENIED: Authenticated user '${contextUserId}' not found in database` };
            }
            if (!authorizedUser.isActive || ['inactive', 'suspended'].includes(authorizedUser.status)) {
                return { success: false, error: `AUTHORIZATION_DENIED: Actor '${contextUserId}' account is inactive or suspended` };
            }

            // 🚀 ESTABLISHED RBAC PERMISSION CHECK: Require explicit 'whatsapp.dispatch.reconcile'
            // Enforce explicit permission on Role or User.
            // Do NOT grant access merely because an email matches an allowlist or a role has a broad name (e.g. 'Admin', 'Super Admin')
            const role = authorizedUser.role;

            const hasRolePermission = Boolean(
                (Array.isArray(role?.permissions) && role.permissions.includes('whatsapp.dispatch.reconcile')) ||
                (role?.permissions && typeof role.permissions === 'object' && role.permissions['whatsapp.dispatch.reconcile'] === true) ||
                (role?.moduleAccess?.whatsapp?.reconcile === true || role?.moduleAccess?.whatsapp?.admin === true)
            );

            const hasUserPermission = Boolean(
                (Array.isArray(authorizedUser.permissions) && authorizedUser.permissions.includes('whatsapp.dispatch.reconcile')) ||
                (authorizedUser.permissions && typeof authorizedUser.permissions === 'object' && authorizedUser.permissions['whatsapp.dispatch.reconcile'] === true) ||
                (authorizedUser.moduleAccess?.whatsapp?.reconcile === true || authorizedUser.moduleAccess?.whatsapp?.admin === true)
            );

            if (!hasRolePermission && !hasUserPermission) {
                return {
                    success: false,
                    error: `AUTHORIZATION_DENIED: Actor '${contextUserId}' lacks explicit 'whatsapp.dispatch.reconcile' permission`
                };
            }

            verifiedAuditActor = authorizedUser._id ? authorizedUser._id.toString() : contextUserId;
        }

        const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || (await import('../models/WhatsAppDispatch.js')).default;
        const dispatch = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
        if (!dispatch) {
            return { success: false, error: 'DISPATCH_NOT_FOUND' };
        }

        // Immutable recipient check
        if (recipient) {
            const normProvided = this._normalizeTarget(recipient) || String(recipient);
            const normDispatch = this._normalizeTarget(dispatch.recipient) || String(dispatch.recipient);
            if (normProvided !== normDispatch && dispatch.recipient !== recipient) {
                return { success: false, error: 'SECURITY_RECIPIENT_MISMATCH: Provided recipient does not match dispatch record' };
            }
        }

        const normStatus = String(targetStatus || '').toUpperCase();
        if (!['DISPATCHED', 'FAILED'].includes(normStatus)) {
            return { success: false, error: 'INVALID_STATUS: Manual reconciliation targetStatus must be DISPATCHED or FAILED' };
        }

        let cleanMsgId = null;
        if (normStatus === 'DISPATCHED') {
            if (!providerMessageId || typeof providerMessageId !== 'string' || !providerMessageId.trim()) {
                return { success: false, error: 'PROVIDER_MESSAGE_ID_REQUIRED: providerMessageId is required to reconcile dispatch as DISPATCHED' };
            }
            cleanMsgId = providerMessageId.trim();

            // Check if existing record already has a different confirmed providerMessageId
            if (dispatch.providerMessageId && dispatch.providerMessageId !== cleanMsgId) {
                return {
                    success: false,
                    error: `STATE_TRANSITION_CONFLICT: PROVIDER_ID_REBIND_FORBIDDEN: Dispatch already bound to '${dispatch.providerMessageId}', cannot rebind to '${cleanMsgId}'`
                };
            }

            const collision = await WhatsAppDispatch.findOne({ providerMessageId: cleanMsgId }).lean();
            if (collision && collision._id.toString() !== dispatch._id.toString()) {
                return { success: false, error: `PROVIDER_ID_COLLISION: Provider message ID is already bound to dispatch '${collision.idempotencyKey}'` };
            }
        }

        // Prevent regressive transition from confirmed delivered states to failed
        const currentDelivery = dispatch.deliveryStatus || dispatch.responsePayload?.deliveryStatus;
        if (['delivered', 'read'].includes(currentDelivery) && normStatus === 'FAILED') {
            return { success: false, error: 'REGRESSIVE_STATUS_FORBIDDEN: Cannot transition confirmed delivered dispatch to FAILED' };
        }

        // Mandatory source status definition:
        // Transition to DISPATCHED is valid ONLY from: AMBIGUOUS_TIMEOUT, FAILED, CLAIMED
        // Transition to FAILED is valid ONLY from: AMBIGUOUS_TIMEOUT, CLAIMED
        const permittedSourceStatuses = normStatus === 'DISPATCHED'
            ? ['AMBIGUOUS_TIMEOUT', 'FAILED', 'CLAIMED']
            : ['AMBIGUOUS_TIMEOUT', 'CLAIMED'];

        // Enforce allowed source statuses as a mandatory pre-condition
        if (!permittedSourceStatuses.includes(dispatch.status)) {
            // Check for idempotent repetition of an already successful outcome
            const isAlreadyTarget = dispatch.status === normStatus;
            const isMatchingMsgId = normStatus !== 'DISPATCHED' || dispatch.providerMessageId === cleanMsgId;
            if (isAlreadyTarget && isMatchingMsgId) {
                return {
                    success: true,
                    reconciled: true,
                    alreadyReconciled: true,
                    idempotencyKey: dispatch.idempotencyKey,
                    status: dispatch.status,
                    providerMessageId: dispatch.providerMessageId,
                    reconciledBy: dispatch.reconciledBy,
                    reconciledAt: dispatch.reconciledAt,
                    reconciliationReason: dispatch.reconciliationReason
                };
            }
            return {
                success: false,
                error: `STATE_TRANSITION_CONFLICT: INVALID_SOURCE_STATUS: Dispatch in status '${dispatch.status}' cannot transition to '${normStatus}'`
            };
        }

        // Atomic CAS filter:
        // MANDATORY: status MUST be in permittedSourceStatuses. Ambiguity flags do NOT bypass status restriction!
        const casFilter = {
            _id: dispatch._id,
            status: { $in: permittedSourceStatuses }
        };

        if (normStatus === 'FAILED') {
            casFilter.deliveryStatus = { $nin: ['delivered', 'read'] };
            casFilter['responsePayload.deliveryStatus'] = { $nin: ['delivered', 'read'] };
        }

        if (normStatus === 'DISPATCHED' && cleanMsgId) {
            casFilter.$or = [
                { providerMessageId: null },
                { providerMessageId: { $exists: false } },
                { providerMessageId: cleanMsgId }
            ];
        }

        const updateFields = {
            status: normStatus,
            isAmbiguous: false,
            reconciledAt: new Date(),
            reconciledBy: verifiedAuditActor,
            reconciliationStatus: 'RECONCILED',
            reconciliationReason: String(reason || 'MANUAL_OPERATOR_RECONCILIATION').trim()
        };

        if (normStatus === 'DISPATCHED') {
            updateFields.providerMessageId = cleanMsgId;
            updateFields['responsePayload.success'] = true;
            updateFields['responsePayload.messageId'] = cleanMsgId;
            updateFields['responsePayload.providerMessageId'] = cleanMsgId;
        } else {
            updateFields['responsePayload.success'] = false;
            updateFields.errorDetails = this.sanitizeSecrets({
                error: String(reason || 'Manually marked as failed by operator').trim(),
                actorId: verifiedAuditActor
            });
        }

        // P0-D: Verify lease ownership before executing atomic state mutation
        if (lockContext?.isLockLost?.()) {
            console.error(`[WhatsAppService] Reconciliation lock lost before updating dispatch '${dispatch.idempotencyKey}'. Aborting mutation.`);
            return {
                success: false,
                error: 'DISTRIBUTED_LOCK_LOST: Reconciliation lock was lost or expired before database update'
            };
        }

        if (lockContext?.validateOwnership) {
            const isOwner = await lockContext.validateOwnership();
            if (!isOwner) {
                console.error(`[WhatsAppService] Reconciliation lock ownership validation failed for dispatch '${dispatch.idempotencyKey}'. Aborting mutation.`);
                return {
                    success: false,
                    error: 'DISTRIBUTED_LOCK_LOST: Reconciliation lock ownership validation failed before database update'
                };
            }
        }

        // P0-D: Test hook for deterministic cross-store CAS race testing
        if (hooks?.beforeMongoCas) {
            await hooks.beforeMongoCas({ casFilter, updateFields, lockContext, dispatch });
        }

        // Monotonic fencing token condition
        if (lockContext?.fencingToken) {
            casFilter.$and = casFilter.$and || [];
            casFilter.$and.push({
                $or: [
                    { reconcileGeneration: { $exists: false } },
                    { reconcileGeneration: null },
                    { reconcileGeneration: { $lt: lockContext.fencingToken } }
                ]
            });
            updateFields.reconcileGeneration = lockContext.fencingToken;
        }

        let updated;
        try {
            updated = await WhatsAppDispatch.findOneAndUpdate(casFilter, { $set: updateFields }, { new: true });
        } catch (dbErr) {
            if (dbErr.code === 11000 || String(dbErr.message).includes('11000')) {
                return { success: false, error: 'PROVIDER_ID_COLLISION: Provider message ID is already bound to another dispatch' };
            }
            throw dbErr;
        }

        if (!updated) {
            const currentDoc = await WhatsAppDispatch.findById(dispatch._id).lean();
            if (!currentDoc) {
                return { success: false, error: 'DISPATCH_NOT_FOUND' };
            }

            // Check if rejected due to stale fencing generation
            if (currentDoc.reconcileGeneration && lockContext?.fencingToken && currentDoc.reconcileGeneration >= lockContext.fencingToken) {
                console.warn(`[WhatsAppService] Reconciliation mutation rejected due to stale fencing generation for '${dispatch.idempotencyKey}': docGen=${currentDoc.reconcileGeneration}, lockGen=${lockContext.fencingToken}`);
                return {
                    success: false,
                    error: `STALE_FENCING_GENERATION: Stale reconciliation mutation rejected. Document reconcileGeneration (${currentDoc.reconcileGeneration}) >= current lock fencingToken (${lockContext.fencingToken})`,
                    reconcileGeneration: currentDoc.reconcileGeneration,
                    fencingToken: lockContext.fencingToken
                };
            }

            // Check if already in target status with matching providerMessageId (idempotent success)
            const isAlreadyTarget = currentDoc.status === normStatus;
            const isMatchingMsgId = normStatus !== 'DISPATCHED' || currentDoc.providerMessageId === cleanMsgId;

            if (isAlreadyTarget && isMatchingMsgId) {
                return {
                    success: true,
                    reconciled: true,
                    alreadyReconciled: true,
                    idempotencyKey: currentDoc.idempotencyKey,
                    status: currentDoc.status,
                    providerMessageId: currentDoc.providerMessageId,
                    reconciledBy: currentDoc.reconciledBy,
                    reconciledAt: currentDoc.reconciledAt,
                    reconciliationReason: currentDoc.reconciliationReason
                };
            }

            const activeDelivery = currentDoc.deliveryStatus || currentDoc.responsePayload?.deliveryStatus;
            if (['delivered', 'read'].includes(activeDelivery) && normStatus === 'FAILED') {
                return {
                    success: false,
                    error: 'REGRESSIVE_STATUS_FORBIDDEN: Cannot transition confirmed delivered dispatch to FAILED',
                    currentStatus: currentDoc.status,
                    deliveryStatus: activeDelivery
                };
            }

            return {
                success: false,
                error: `STATE_TRANSITION_CONFLICT: Dispatch status is '${currentDoc.status}' (deliveryStatus: '${activeDelivery || 'none'}') and cannot be transitioned to '${normStatus}'`,
                currentStatus: currentDoc.status,
                deliveryStatus: activeDelivery
            };
        }

        if (updated && updated.status === 'DISPATCHED') {
            const cachedRes = {
                ...(updated.responsePayload || {}),
                success: true,
                messageId: updated.providerMessageId,
                providerMessageId: updated.providerMessageId
            };
            this._setIdempotentResult(updated.idempotencyKey, cachedRes, updated.recipient, updated.requestPayloadHash);
        }

        return {
            success: true,
            reconciled: true,
            idempotencyKey: updated.idempotencyKey,
            status: updated.status,
            providerMessageId: updated.providerMessageId,
            reconciledBy: updated.reconciledBy,
            reconciledAt: updated.reconciledAt,
            reconciliationReason: updated.reconciliationReason
        };
    }

    async isRecipientOptedOut(mobile) {
        if (!mobile) return false;
        const digits = String(mobile).replace(/\D/g, '');
        if (digits.length < 10) return false;
        const clean10 = digits.slice(-10);
        const phoneFormats = [digits, `+${digits}`, clean10, `91${clean10}`, `+91${clean10}`];

        // 🛡️ Fail-Closed Policy: If database is disconnected or unreachable, treat as opted-out to prevent compliance breach
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            console.warn(`[WhatsAppService] Database unavailable while verifying opt-out status for ${mobile}. Failing closed (treating as opted out).`);
            return true;
        }

        try {
            const Lead = mongoose.models.Lead || (await import('../models/Lead.js')).default;
            const Contact = mongoose.models.Contact || (await import('../models/Contact.js')).default;
            const Conversation = mongoose.models.Conversation || (await import('../models/Conversation.js')).default;

            const lead = await Lead.findOne({
                $or: [
                    { mobile: { $in: phoneFormats } },
                    { mobile: { $regex: new RegExp(clean10 + '$') } }
                ],
                whatsappOptOut: true
            }).select('_id whatsappOptOut').lean();
            if (lead) return true;

            const contact = await Contact.findOne({
                'phones.number': { $in: phoneFormats },
                whatsappOptOut: true
            }).select('_id whatsappOptOut').lean();
            if (contact) return true;

            const conv = await Conversation.findOne({
                phoneNumber: { $in: phoneFormats },
                isOptedOut: true
            }).select('_id isOptedOut').lean();
            if (conv) return true;

            return false;
        } catch (err) {
            // 🛡️ Fail-Closed Policy: Any DB query error / timeout must block dispatch
            console.error(`[WhatsAppService] Error checking opt-out status for ${mobile} (Failing closed):`, err.message);
            return true;
        }
    }

    async _markIntegrationRevoked(integrationId, reason) {
        try {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                $set: {
                    status: 'REVOKED',
                    onboardingStatus: 'REVOKED',
                    failureReason: reason,
                    revokedAt: new Date()
                }
            });
            console.warn(`[WhatsAppService] Marked integration ${integrationId} as REVOKED: ${reason}`);
        } catch (e) {
            console.error('[WhatsAppService] Failed to mark integration as revoked:', e.message);
        }
    }

    sanitizeSecrets(input) {
        if (!input) return input;
        const isObj = typeof input === 'object';
        const text = isObj ? JSON.stringify(input) : String(input);
        const redacted = text
            .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
            .replace(/((?:access_)?token=)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
            .replace(/(systemUserToken":\s*")[^"]+/gi, '$1[REDACTED]')
            .replace(/(appSecret":\s*")[^"]+/gi, '$1[REDACTED]');
        if (isObj) {
            try {
                return JSON.parse(redacted);
            } catch (_) {
                return redacted;
            }
        }
        return redacted;
    }
    /**
     * Resolve configuration from DB or Env
     * Supports multi-account resolution via integrationId or phoneNumberId,
     * while preserving 100% backward compatibility by falling back to meta_wa_config.
     */
    async _getMetaConfig(integrationIdOrPhoneId = null) {
        const isPlaceholder = (val) => !val || val.includes('YOUR_') || val.includes('SYSTEM_USER');

        // 1. If explicit account ID or Phone ID is requested, look in WhatsAppIntegration
        if (integrationIdOrPhoneId && integrationIdOrPhoneId !== 'legacy_default') {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            const query = mongoose.Types.ObjectId.isValid(integrationIdOrPhoneId)
                ? { _id: integrationIdOrPhoneId }
                : { phoneNumberId: String(integrationIdOrPhoneId) };

            const integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                throw new Error(`Target Meta WhatsApp account '${integrationIdOrPhoneId}' was not found.`);
            }
            if (integration.status !== 'ACTIVE') {
                throw new Error(`Target Meta WhatsApp account '${integration.accountLabel || integrationIdOrPhoneId}' is not active (${integration.status}).`);
            }
            if (integration.provider === 'BAILEYS') {
                throw new Error(`Target account '${integration.accountLabel || integrationIdOrPhoneId}' is a WhatsApp Web (Baileys) line, not a Meta Cloud API account.`);
            }

            if (!integration.credentials?.systemUserToken || isPlaceholder(integration.credentials.systemUserToken)) {
                throw new Error(`Target WhatsApp account '${integration.accountLabel || integration._id}' has no valid credentials`);
            }
            return {
                integrationId: integration._id,
                token: integration.credentials.systemUserToken,
                phoneId: integration.phoneNumberId,
                businessId: integration.wabaId,
                appId: process.env.FB_GRAPH_APP_ID || process.env.META_WA_APP_ID,
                displayPhoneNumber: integration.displayPhoneNumber,
                accountLabel: integration.accountLabel || 'WhatsApp Account',
                connectionType: integration.connectionType,
                provider: integration.provider || 'META'
            };
        }

        // 2. Try default active WhatsAppIntegration (e.g. if configured as default)
        try {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            const defaultIntegration = await WhatsAppIntegration.findOne({ isDefault: true, provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }).lean();
            if (defaultIntegration && defaultIntegration.credentials?.systemUserToken && !isPlaceholder(defaultIntegration.credentials.systemUserToken)) {
                return {
                    integrationId: defaultIntegration._id,
                    token: defaultIntegration.credentials?.systemUserToken,
                    phoneId: defaultIntegration.phoneNumberId,
                    businessId: defaultIntegration.wabaId,
                    appId: process.env.FB_GRAPH_APP_ID || process.env.META_WA_APP_ID,
                    displayPhoneNumber: defaultIntegration.displayPhoneNumber,
                    accountLabel: defaultIntegration.accountLabel || 'Main WhatsApp API',
                    connectionType: defaultIntegration.connectionType,
                    provider: defaultIntegration.provider || 'META'
                };
            }
        } catch (e) {
            // ignore if model not compiled yet
        }

        // 3. Fallback: Legacy meta_wa_config in SystemSetting (100% Backward Compatible)
        try {
            const SystemSetting = mongoose.model ? mongoose.model('SystemSetting') : (mongoose.models.SystemSetting || (await import('../models/SystemSetting.js')).default);
            const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();

            if (setting && setting.value?.token && !isPlaceholder(setting.value.token)) {
                return {
                    token: setting.value.token,
                    phoneId: setting.value.phoneId,
                    businessId: setting.value.businessId,
                    appId: setting.value.appId || process.env.META_WA_APP_ID,
                    displayPhoneNumber: setting.value.displayPhoneNumber || '+91 99960 00570',
                    accountLabel: 'Main Official WhatsApp API'
                };
            }
        } catch (e) {
            if (e instanceof TypeError) throw e;
            console.warn('[WhatsAppService] Error reading SystemSetting meta_wa_config:', e.message);
        }

        // 4. Fallback to Env if DB is empty
        if (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID && !isPlaceholder(process.env.META_WA_TOKEN)) {
            return {
                token: process.env.META_WA_TOKEN,
                phoneId: process.env.META_WA_PHONE_ID,
                businessId: process.env.YOUR_WABA_ID,
                appId: process.env.META_WA_APP_ID,
                displayPhoneNumber: process.env.META_WA_DISPLAY_NUMBER || '+91 99960 00570',
                accountLabel: 'Env WhatsApp API'
            };
        }

        return null;
    }

    async _getBaileysConfig(integrationIdOrPhoneId = null) {
        const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
        let integration = null;
        if (integrationIdOrPhoneId) {
            const query = mongoose.Types.ObjectId.isValid(integrationIdOrPhoneId)
                ? { _id: integrationIdOrPhoneId }
                : { phoneNumberId: String(integrationIdOrPhoneId) };
            integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                throw new Error(`Requested WhatsApp Web line (${integrationIdOrPhoneId}) was not found.`);
            }
            if (integration.status !== 'ACTIVE') {
                throw new Error(`Requested WhatsApp Web line '${integration.accountLabel || integration.displayPhoneNumber || integrationIdOrPhoneId}' is not active (${integration.status}).`);
            }
            if (integration.provider !== 'BAILEYS') {
                throw new Error(`Requested account '${integration.accountLabel || integrationIdOrPhoneId}' is a Meta Cloud API account, not a WhatsApp Web (Baileys) line.`);
            }
        } else {
            integration = await WhatsAppIntegration.findOne({ provider: 'BAILEYS', status: 'ACTIVE' }).lean();
        }
        if (!integration) {
            throw new Error("Active WhatsApp Web account not found. Please connect your WhatsApp Web in Profile settings.");
        }
        return {
            integrationId: integration._id,
            displayPhoneNumber: integration.displayPhoneNumber,
            accountLabel: integration.accountLabel || 'Bharat Properties WhatsApp Web',
            connectionType: integration.connectionType,
            provider: 'BAILEYS'
        };
    }

    /**
     * 🛡️ Strict Enterprise Channel Resolver (Zero Cross-Provider Fallback)
     * If WhatsApp Web (Baileys) is requested or targeted, it routes ONLY to Baileys.
     * If Meta Cloud API is requested or targeted, it routes ONLY to Meta.
     * Never silently fails over from Baileys to Meta or vice-versa.
     */
    async _resolveAccountConfig(mobile, options = {}) {
        const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
        const targetAccount = typeof options === 'string' ? options : (options?.integrationId || options?.phoneId || null);
        const isGroupTarget = String(mobile || '').includes('@g.us');
        const opt = typeof options === 'object' ? (options || {}) : {};
        const isBaileysRequested = opt.provider === 'BAILEYS' || 
            opt.channel === 'whatsapp_web' || 
            opt.useBaileys === true ||
            opt.platform === 'WhatsApp Web';
        const isMetaRequested = opt.provider === 'META' || 
            opt.channel === 'whatsapp_api' || 
            opt.useMeta === true ||
            opt.platform === 'Direct' ||
            opt.platform === 'WhatsApp Cloud API';

        // 1. WhatsApp Groups (@g.us) MUST ALWAYS use WhatsApp Web (Meta Cloud API has no group chat capability)
        if (isGroupTarget) {
            return await this._getBaileysConfig(targetAccount);
        }

        // 2. Explicit target account ID provided: lookup that exact integration to determine provider strictly
        if (targetAccount && targetAccount !== 'legacy_default') {
            const query = mongoose.Types.ObjectId.isValid(targetAccount)
                ? { _id: targetAccount }
                : { phoneNumberId: String(targetAccount) };
            
            const integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                throw new Error(`Requested WhatsApp account (${targetAccount}) was not found.`);
            }
            if (integration.status !== 'ACTIVE') {
                throw new Error(`Requested WhatsApp line '${integration.accountLabel || integration.displayPhoneNumber || targetAccount}' is not active (${integration.status}).`);
            }

            // Route strictly by the integration's own configured provider without cross-provider fallback
            if (integration.provider === 'BAILEYS') {
                return await this._getBaileysConfig(integration._id);
            } else {
                return await this._getMetaConfig(integration._id);
            }
        }

        // 3. Explicit provider requested without specific account ID
        if (isBaileysRequested && !isMetaRequested) {
            // Strictly Baileys — NO FALLBACK TO META
            return await this._getBaileysConfig(null);
        }
        if (isMetaRequested && !isBaileysRequested) {
            // Strictly Meta — NO FALLBACK TO BAILEYS
            return await this._getMetaConfig(null);
        }

        // 4. Neither account nor provider specified: Route to the system's default active integration
        const defaultIntegration = await WhatsAppIntegration.findOne({ isDefault: true, status: 'ACTIVE' }).lean();
        if (defaultIntegration) {
            if (defaultIntegration.provider === 'BAILEYS') {
                return await this._getBaileysConfig(defaultIntegration._id);
            } else {
                return await this._getMetaConfig(defaultIntegration._id);
            }
        }

        // 5. If no default marked: Route to any active integration
        const anyActive = await WhatsAppIntegration.findOne({ status: 'ACTIVE' }).lean();
        if (anyActive) {
            if (anyActive.provider === 'BAILEYS') {
                return await this._getBaileysConfig(anyActive._id);
            } else {
                return await this._getMetaConfig(anyActive._id);
            }
        }

        // 6. Check env var fallback for Meta in development/test
        const envMeta = await this._getMetaConfig(null);
        if (envMeta) return envMeta;

        throw new Error("No active WhatsApp integration found. Please connect your WhatsApp account in Settings.");
    }

    /**
     * Send a standard text message
     * @param {string} mobile - Recipient phone number or group JID
     * @param {string} message - Text body
     * @param {Object} [options] - Optional settings { integrationId, phoneId }
     */
    async sendMessage(mobile, message, options = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendMessage", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Idempotency Check (Durable L2 + L1 cache)
        const idempotencyKey = options?.idempotencyKey;
        let dispatchClaim = null;
        if (idempotencyKey) {
            const normalizedMobile = this._normalizeTarget(mobile) || mobile;
            dispatchClaim = await this._claimOrGetDurableDispatch({
                idempotencyKey,
                mobile,
                messageType: 'text',
                provider: options?.provider || 'META',
                payload: { mobile: normalizedMobile, message },
                options
            });

            if (!dispatchClaim.canDispatch) {
                if (dispatchClaim.isReplay) {
                    console.log(`[WhatsAppService] Idempotent replay for key '${idempotencyKey}'. Returning cached result.`);
                    return dispatchClaim.result;
                }
                if (dispatchClaim.inFlight || dispatchClaim.isAmbiguousBlocked) {
                    return dispatchClaim.result;
                }
                return {
                    success: false,
                    error: dispatchClaim.error,
                    code: dispatchClaim.code
                };
            }
        }

        // 2. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !options?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        const targetAccount = typeof options === 'string' ? options : (options?.integrationId || options?.phoneId || null);
        const isGroupTarget = String(mobile || '').includes('@g.us');
        const opt = typeof options === 'object' ? (options || {}) : {};
        const isBaileysRequested = opt.provider === 'BAILEYS' || 
            opt.channel === 'whatsapp_web' || 
            opt.useBaileys === true ||
            opt.platform === 'WhatsApp Web';

        let config;
        try {
            config = await this._resolveAccountConfig(mobile, options);
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: (isGroupTarget || isBaileysRequested) ? 'baileys' : 'meta' };
        }

        let sendResult;
        if (config) {
            if (config.provider === 'BAILEYS') {
                sendResult = await this._sendViaBaileys(mobile, message, config, { type: 'text', ...(typeof options === 'object' ? options : {}) });
            } else {
                sendResult = await this._sendViaMeta(mobile, message, config, { type: 'text', ...(typeof options === 'object' ? options : {}) });
            }
        } else if (process.env.GUPSHUP_API_KEY) {
            // Gupshup/Other Fallback logic simplified for Bharat Properties
            sendResult = await this._sendViaGupshup(mobile, message, {
                apiKey: process.env.GUPSHUP_API_KEY,
                sourcePhone: process.env.GUPSHUP_SOURCE,
                appName: process.env.GUPSHUP_APP_NAME
            });
        } else if (process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true') {
            console.log(`[WhatsApp] MOCK message to ${mobile}: ${message}`);
            sendResult = { success: true, mock: true, provider: 'mock' };
        } else {
            sendResult = { success: false, error: 'No active WhatsApp channel configured', provider: 'none' };
        }

        if (idempotencyKey) {
            if (sendResult && sendResult.success) {
                await this._recordDurableSuccess({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    result: sendResult,
                    providerMessageId: sendResult.messageId || sendResult.messages?.[0]?.id
                });
            } else {
                const isAmbiguousTimeout = sendResult?.category === 'NETWORK_ERROR' ||
                    sendResult?.isDeliveryUnknown === true ||
                    sendResult?.deliveryStatus === 'DELIVERY_UNKNOWN' ||
                    ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'].includes(sendResult?.code) ||
                    String(sendResult?.error || '').toLowerCase().includes('timeout');

                await this._recordDurableFailure({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    error: sendResult?.error || 'Send failed',
                    rawError: sendResult?.raw || null,
                    isAmbiguous: isAmbiguousTimeout
                });
            }
        }

        return sendResult;
    }

    /**
     * Bulk message dispatch (Broadcast)
     */
    async broadcast(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            await new Promise(r => setTimeout(r, 300));
            const result = await this.sendMessage(mobile, message);
            results.push({ mobile, ...result });
            if (result.success) sent++; else failed++;
        }

        console.log(`[WhatsApp] Broadcast complete — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }

    // ── Internal Providers ─────────────────────────────────────────────────────

    _normalizeTarget(mobile) {
        if (!mobile) return null;
        const digitsOnly = String(mobile).replace(/\D/g, '');
        if (digitsOnly.length < 10) return null;
        return digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;
    }

    async _sendViaBaileys(mobile, message, config, options = {}) {
        const { BaileysConnectionManager } = await import('./baileysQueue/BaileysConnectionManager.js');
        let socketWriteInitiated = false;
        try {
            return await BaileysConnectionManager.serializeSend(config.integrationId, async (lockContext) => {
                return await this._executeSendViaBaileys(mobile, message, config, {
                    ...options,
                    onSocketWriteInitiated: () => { socketWriteInitiated = true; }
                }, lockContext);
            }, options.lockOptions || {});
        } catch (err) {
            if (err?.message?.includes('DISTRIBUTED_LOCK_LOST') || err?.code === 'DISTRIBUTED_LOCK_LOST') {
                return {
                    success: false,
                    deliveryStatus: socketWriteInitiated ? 'DELIVERY_UNKNOWN' : 'FAILED',
                    isDeliveryUnknown: socketWriteInitiated,
                    isAmbiguous: socketWriteInitiated,
                    error: err.message,
                    provider: 'baileys'
                };
            }
            throw err;
        }
    }

    async _executeSendViaBaileys(mobile, message, config, options = {}, lockContext = null) {
        const sendStartTime = Date.now();
        const { type = 'text', mediaUrl } = options;
        let socketWriteInitiated = false;

        if (lockContext?.isLockLost?.()) {
            return {
                success: false,
                deliveryStatus: 'FAILED',
                isDeliveryUnknown: false,
                isAmbiguous: false,
                error: 'DISTRIBUTED_LOCK_LOST: Outbound lock lost before socket dispatch could begin',
                provider: 'baileys',
                latencyMs: Date.now() - sendStartTime
            };
        }
        try {
            const { BaileysConnectionManager } = await import('./baileysQueue/BaileysConnectionManager.js');
            let sock = BaileysConnectionManager.getSocket(config.integrationId.toString());
            
            if (!sock) {
                try {
                    sock = await BaileysConnectionManager.connect(config.integrationId.toString());
                } catch (connErr) {
                    console.error('[WhatsAppService/Baileys] Socket connect error:', connErr.message);
                }
            }

            if (!sock) {
                const isDev = process.env.NODE_ENV !== 'production';
                const errorDetail = isDev
                    ? 'Local Dev Environment: WhatsApp Web socket is hosted on Production (api.bharatproperties.co) to prevent session conflicts. Please send group messages from https://crm.bharatproperties.co'
                    : 'WhatsApp socket not connected or still pairing';
                return { success: false, deliveryStatus: 'FAILED', error: errorDetail, provider: 'baileys', latencyMs: Date.now() - sendStartTime };
            }
            if (!sock.user || !sock.user.id) {
                return { success: false, deliveryStatus: 'FAILED', error: 'WhatsApp Web is not fully connected. Please scan the QR code in Profile page.', provider: 'baileys', latencyMs: Date.now() - sendStartTime };
            }

            if (!sock.ws || !sock.ws.isOpen) {
                if (sock.ws && sock.ws.isConnecting) {
                    try {
                        await Promise.race([
                            sock.waitForSocketOpen(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Wait timeout')), 4000))
                        ]);
                    } catch (waitErr) {}
                }
                if (!sock.ws || !sock.ws.isOpen) {
                    return { 
                        success: false, 
                        deliveryStatus: 'FAILED',
                        error: 'WhatsApp Web socket is currently reconnecting or offline. Please check connection in Profile.', 
                        provider: 'baileys',
                        latencyMs: Date.now() - sendStartTime
                    };
                }
            }

            // Enterprise LID resolution before formatting outbound JID
            let resolvedTarget = mobile;
            try {
                const res = await BaileysConnectionManager.resolveJidToPhone(mobile, config.integrationId);
                if (res && res.cleanPhone && !res.cleanPhone.includes('@')) {
                    resolvedTarget = res.cleanPhone;
                }
            } catch (e) {}

            let jid = String(resolvedTarget || '').trim();
            if (!jid.includes('@s.whatsapp.net') && !jid.includes('@g.us') && !jid.includes('@lid')) {
                const normalized = this._normalizeTarget(jid);
                if (!normalized) {
                    return { success: false, deliveryStatus: 'FAILED', error: 'Invalid phone number format for WhatsApp', provider: 'baileys', latencyMs: Date.now() - sendStartTime };
                }
                jid = `${normalized}@s.whatsapp.net`;
            }
            
            let content = { text: message || '' };
            if (type !== 'text' && mediaUrl) {
                let mimetype = 'image/jpeg';
                if (type === 'video') mimetype = 'video/mp4';
                else if (type === 'document') mimetype = 'application/pdf';
                
                let mediaSource = { url: mediaUrl };
                if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('uploads/')) {
                    const path = await import('path');
                    const fs = await import('fs');
                    const localPath = path.resolve(process.cwd(), mediaUrl.replace(/^\//, ''));
                    if (fs.existsSync(localPath)) {
                        mediaSource = fs.readFileSync(localPath);
                    }
                }

                content = {
                    [type === 'image' ? 'image' : type === 'document' ? 'document' : 'video']: mediaSource,
                    caption: message || ''
                };
                if (type === 'document') {
                    content.mimetype = mimetype;
                    if (options.filename) content.fileName = options.filename;
                }
            }

            // 🛡️ Enterprise Anti-Ban: Human Typing Presence Emulation for 1-on-1 chats
            if (!jid.includes('@g.us')) {
                try {
                    await sock.sendPresenceUpdate('composing', jid);
                    if (process.env.NODE_ENV !== 'test') {
                        await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));
                    }
                    await sock.sendPresenceUpdate('paused', jid);
                } catch (presenceErr) {
                    // Non-fatal
                }
            }

            let sentMsg;
            const isGroupTarget = jid.includes('@g.us');
            // 🚀 Enterprise Dynamic Timeout:
            // Large groups (up to 1,024 members) require Signal protocol sender-key creation & distribution
            // across hundreds of participants. Allow generous headroom (120s for groups, 30s for 1-on-1).
            const sendTimeoutMs = isGroupTarget ? 120000 : 30000;
            const retryTimeoutMs = isGroupTarget ? 80000 : 20000;

            // P0-C: Verify distributed lock ownership immediately prior to socket transmission
            if (lockContext?.isLockLost?.()) {
                return {
                    success: false,
                    deliveryStatus: 'FAILED',
                    isDeliveryUnknown: false,
                    isAmbiguous: false,
                    error: 'DISTRIBUTED_LOCK_LOST: Outbound lock lost immediately prior to socket write',
                    provider: 'baileys',
                    latencyMs: Date.now() - sendStartTime
                };
            }

            if (lockContext?.validateOwnership) {
                const isOwner = await lockContext.validateOwnership();
                if (!isOwner) {
                    return {
                        success: false,
                        deliveryStatus: 'FAILED',
                        isDeliveryUnknown: false,
                        isAmbiguous: false,
                        error: 'DISTRIBUTED_LOCK_LOST: Outbound lock ownership expired immediately prior to socket write',
                        provider: 'baileys',
                        latencyMs: Date.now() - sendStartTime
                    };
                }
            }

            const lockAbortPromise = new Promise((_, reject) => {
                if (lockContext?.signal) {
                    lockContext.signal.addEventListener('abort', () => {
                        const err = new Error('DISTRIBUTED_LOCK_LOST: Outbound lock lost while waiting for socket write acknowledgement');
                        err.code = 'DISTRIBUTED_LOCK_LOST';
                        reject(err);
                    }, { once: true });
                }
            });

            try {
                // P0-C: In Node.js / Baileys, Promise.race does NOT cancel or abort the underlying
                // socket transmission once sock.sendMessage has been invoked.
                // We track socketWriteInitiated = true to guarantee that in-flight ambiguous outcomes
                // are preserved as DELIVERY_UNKNOWN and cannot trigger duplicate automated retries.
                if (typeof options.onSocketWriteInitiated === 'function') {
                    options.onSocketWriteInitiated();
                }
                socketWriteInitiated = true;

                if (options.hooks?.beforeSocketSend) {
                    await options.hooks.beforeSocketSend({ sock, jid, content, lockContext });
                }

                const sendPromise = sock.sendMessage(jid, content);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`WhatsApp Web send timed out after ${Math.round(sendTimeoutMs / 1000)} seconds. Please check device connectivity or QR pairing.`)), sendTimeoutMs)
                );
                sentMsg = await Promise.race([sendPromise, timeoutPromise, lockAbortPromise]);
            } catch (firstAttemptErr) {
                if (firstAttemptErr?.message?.includes('DISTRIBUTED_LOCK_LOST') || firstAttemptErr?.code === 'DISTRIBUTED_LOCK_LOST' || lockContext?.isLockLost?.()) {
                    return {
                        success: false,
                        deliveryStatus: 'DELIVERY_UNKNOWN',
                        isDeliveryUnknown: true,
                        isAmbiguous: true,
                        error: `WhatsApp Web send in-flight lock lost: ${firstAttemptErr.message}. Socket write was initiated, but lock ownership was lost or expired. Suppressing retry to prevent duplicate sends.`,
                        provider: 'baileys',
                        latencyMs: Date.now() - sendStartTime
                    };
                }

                const errMsg = String(firstAttemptErr?.message || firstAttemptErr);
                const isTimeout = errMsg.toLowerCase().includes('timed out');
                const isSocketDead = !sock.ws || !sock.ws.isOpen || errMsg.includes('1006') || errMsg.includes('Connection Terminated') || errMsg.includes('closed');
                console.warn('[WhatsAppService/Baileys] First send attempt failed:', errMsg, '| Socket dead:', isSocketDead, '| Timeout:', isTimeout);

                if (isTimeout && !isSocketDead) {
                    // WhatsApp ACK timed out while socket remains alive.
                    // Enterprise rule: Do NOT blindly retry; mark as DELIVERY_UNKNOWN to prevent duplicate messages in groups.
                    return {
                        success: false,
                        deliveryStatus: 'DELIVERY_UNKNOWN',
                        isDeliveryUnknown: true,
                        isAmbiguous: true,
                        error: `WhatsApp Web ACK timed out after ${Math.round(sendTimeoutMs / 1000)}s while connection remained alive. Suppressing duplicate retry to protect recipient from double messages.`,
                        provider: 'baileys',
                        latencyMs: Date.now() - sendStartTime
                    };
                }

                if (isSocketDead) {
                    try {
                        console.log('[WhatsAppService/Baileys] Socket disconnected, attempting instant re-acquisition...');
                        sock = await BaileysConnectionManager.connect(config.integrationId.toString());
                        if (sock && sock.waitForSocketOpen) {
                            await Promise.race([
                                sock.waitForSocketOpen(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Reconnect wait timeout')), 8000))
                            ]);
                        }
                    } catch (recErr) {
                        console.warn('[WhatsAppService/Baileys] Reconnect during retry failed:', recErr.message);
                    }
                }

                if (sock && sock.ws && sock.ws.isOpen && isSocketDead) {
                    if (lockContext?.isLockLost?.()) {
                        return {
                            success: false,
                            deliveryStatus: 'DELIVERY_UNKNOWN',
                            isDeliveryUnknown: true,
                            isAmbiguous: true,
                            error: 'DISTRIBUTED_LOCK_LOST: Outbound lock lost before socket retry transmission',
                            provider: 'baileys',
                            latencyMs: Date.now() - sendStartTime
                        };
                    }
                    if (lockContext?.validateOwnership) {
                        const isOwner = await lockContext.validateOwnership();
                        if (!isOwner) {
                            return {
                                success: false,
                                deliveryStatus: 'DELIVERY_UNKNOWN',
                                isDeliveryUnknown: true,
                                isAmbiguous: true,
                                error: 'DISTRIBUTED_LOCK_LOST: Outbound lock ownership expired before socket retry transmission',
                                provider: 'baileys',
                                latencyMs: Date.now() - sendStartTime
                            };
                        }
                    }
                    console.log('[WhatsAppService/Baileys] Retrying send after socket re-acquisition...');
                    const retryPromise = sock.sendMessage(jid, content);
                    const retryTimeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`WhatsApp Web send timed out on retry after ${Math.round(retryTimeoutMs / 1000)} seconds.`)), retryTimeoutMs)
                    );
                    sentMsg = await Promise.race([retryPromise, retryTimeout, lockAbortPromise]);
                } else {
                    if (!isSocketDead) {
                        console.warn('[WhatsAppService/Baileys] Send ACK timed out, but socket is alive. Suppressing duplicate re-send to protect group from double messages.');
                    }
                    throw firstAttemptErr;
                }
            }

            return { 
                success: true, 
                provider: 'baileys', 
                deliveryStatus: 'ACCEPTED',
                messageId: sentMsg?.key?.id || 'baileys-unknown-id',
                messages: [{ id: sentMsg?.key?.id || 'baileys-unknown-id' }],
                latencyMs: Date.now() - sendStartTime
            };
        } catch (error) {
            if (error?.message?.includes('DISTRIBUTED_LOCK_LOST') || error?.code === 'DISTRIBUTED_LOCK_LOST' || lockContext?.isLockLost?.()) {
                return {
                    success: false,
                    deliveryStatus: socketWriteInitiated ? 'DELIVERY_UNKNOWN' : 'FAILED',
                    isDeliveryUnknown: socketWriteInitiated,
                    isAmbiguous: socketWriteInitiated,
                    error: error?.message || 'DISTRIBUTED_LOCK_LOST: Outbound lock lost during Baileys dispatch',
                    provider: 'baileys',
                    latencyMs: Date.now() - sendStartTime
                };
            }
            let errText = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            if (errText === '1006' || errText.includes('1006')) {
                errText = 'WhatsApp Web socket temporarily disconnected (1006). Connection was auto-reestablished; please click Send again.';
            }
            console.error(`[WhatsAppService/Baileys] Send error:`, errText);
            return { 
                success: false, 
                deliveryStatus: 'FAILED',
                error: errText, 
                provider: 'baileys',
                latencyMs: Date.now() - sendStartTime
            };
        }
    }

    async _sendViaMeta(mobile, message, config, options = {}) {
        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number format' };

        const { type = 'text', mediaUrl, filename, caption } = options;

        if (process.env.NODE_ENV === 'test' && (!config.token || config.token.includes('secret') || config.token.includes('test') || process.env.MOCK_MODE === 'true')) {
            const msgId = `wamid.mock.test.${Date.now()}`;
            return {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                type,
                mock: true
            };
        }

        try {
            const url = `${META_GRAPH_BASE}/${config.phoneId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type:    'individual',
                to:                toNumber,
            };

            if (type === 'text') {
                payload.type = 'text';
                payload.text = { body: message, preview_url: false };
            } else if (type === 'image') {
                payload.type = 'image';
                if (options.mediaId) payload.image = { id: options.mediaId, caption: caption || message };
                else payload.image = { link: mediaUrl, caption: caption || message };
            } else if (type === 'document') {
                payload.type = 'document';
                if (options.mediaId) payload.document = { id: options.mediaId, filename: filename || 'document.pdf', caption: caption || message };
                else payload.document = { link: mediaUrl, filename: filename || 'document.pdf', caption: caption || message };
            } else if (type === 'video') {
                payload.type = 'video';
                if (options.mediaId) payload.video = { id: options.mediaId, caption: caption || message };
                else payload.video = { link: mediaUrl, caption: caption || message };
            } else if (type === 'audio') {
                payload.type = 'audio';
                if (options.mediaId) payload.audio = { id: options.mediaId };
                else payload.audio = { link: mediaUrl };
            } else if (type === 'location') {
                payload.type = 'location';
                payload.location = options.location; // { latitude, longitude, name, address }
            } else if (type === 'contacts') {
                payload.type = 'contacts';
                payload.contacts = options.contacts; // Array of contact objects
            }

            const reqHeaders = {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type':  'application/json',
            };
            if (options && options.idempotencyKey) {
                reqHeaders['Idempotency-Key'] = options.idempotencyKey;
                payload.biz_opaque_callback_data = String(options.idempotencyKey).slice(0, 512);
            }

            const response = await axios.post(url, payload, {
                headers: reqHeaders,
                timeout: 20000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] ✅ SUCCESS: ${type} to ${toNumber}. ID: ${msgId}`);
            return {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                deliveryStatus: 'ACCEPTED',
                type
            };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            const metaError = err.response?.data?.error;
            const code = metaError?.code;
            const httpStatus = err.response?.status;

            let isRetryable = false;
            let category = 'PERMANENT';
            let professionalError = `Meta API Error: ${detail}`;

            if (code === 131030) {
                category = 'WINDOW_CLOSED';
                professionalError = "Customer Service Window Closed: User has not interacted in 24h. You MUST use a template.";
            } else if (code === 131008) {
                category = 'TEMPLATE_PARAM_MISMATCH';
                professionalError = "Template Parameter Mismatch: Please check your variable mapping indices.";
            } else if (code === 100) {
                category = 'INVALID_PARAMETER';
                professionalError = "Invalid Token, Phone ID, or recipient parameter.";
            } else if (code === 190) {
                category = 'AUTH_FAILURE';
                professionalError = "Meta OAuth token expired or revoked.";
                if (config.integrationId) {
                    this._markIntegrationRevoked(config.integrationId, 'Token expired or revoked (Meta code 190)').catch(() => {});
                }
            } else if (code === 429 || code === 130429 || httpStatus === 429) {
                category = 'RATE_LIMIT';
                isRetryable = true;
                professionalError = "Meta rate limit exceeded. Retry with backoff.";
            } else if (code === 1 || code === 2 || (httpStatus && httpStatus >= 500)) {
                category = 'TRANSIENT_SERVER_ERROR';
                isRetryable = true;
                professionalError = "Meta server error or temporary outage. Retryable.";
            } else if (['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(err.code)) {
                category = 'NETWORK_ERROR';
                isRetryable = true;
                professionalError = "Network connection timeout to Meta Graph API.";
            }

            const sanitizedDetail = this.sanitizeSecrets(detail);
            console.error(`[WhatsApp/Meta] ❌ ERROR [${code || httpStatus || '??'} - ${category}]: Failed to send ${type} to ${toNumber}:`, sanitizedDetail);

            return {
                success: false,
                error: professionalError,
                category,
                isRetryable,
                code,
                httpStatus,
                provider: 'meta',
                raw: metaError
            };
        }
    }

    async _sendViaGupshup(mobile, message, config) {
        try {
            const response = await axios.post(
                'https://api.gupshup.io/sm/api/v1/msg',
                new URLSearchParams({
                    channel:     'whatsapp',
                    source:      config.sourcePhone,
                    destination: `91${mobile}`,
                    message:     JSON.stringify({ type: 'text', text: message }),
                    'src.name':  config.appName,
                }),
                {
                    headers: {
                        apikey:          config.apiKey,
                        'Content-Type':  'application/x-www-form-urlencoded',
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;
            console.log(`[WhatsApp/Gupshup] Sent to ${mobile}: ${data?.messageId}`);
            return { success: true, messageId: data?.messageId, provider: 'gupshup' };
        } catch (err) {
            console.error(`[WhatsApp/Gupshup] Error sending to ${mobile}:`, err.message);
            return { success: false, error: err.message, provider: 'gupshup' };
        }
    }

    async sendTemplate(mobile, templateName, languageCode = 'en_US', components = [], options = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendTemplate", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Idempotency Check (Durable L2 + L1 cache)
        const idempotencyKey = options?.idempotencyKey;
        let dispatchClaim = null;
        if (idempotencyKey) {
            const normalizedMobile = this._normalizeTarget(mobile) || mobile;
            dispatchClaim = await this._claimOrGetDurableDispatch({
                idempotencyKey,
                mobile,
                messageType: 'template',
                provider: 'META',
                payload: { mobile: normalizedMobile, templateName, languageCode, components },
                options
            });

            if (!dispatchClaim.canDispatch) {
                if (dispatchClaim.isReplay) {
                    console.log(`[WhatsAppService] Idempotent template replay for key '${idempotencyKey}'. Returning cached result.`);
                    return dispatchClaim.result;
                }
                if (dispatchClaim.inFlight || dispatchClaim.isAmbiguousBlocked) {
                    return dispatchClaim.result;
                }
                return {
                    success: false,
                    error: dispatchClaim.error,
                    code: dispatchClaim.code
                };
            }
        }

        // 2. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !options?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp template to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        const targetAccount = options?.integrationId || options?.phoneId || null;
        let metaConfig;
        try {
            metaConfig = await this._getMetaConfig(targetAccount);
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: 'meta' };
        }
        if (!metaConfig) {
            console.log(`[WhatsApp/Meta] MOCK template to ${mobile}: ${templateName}`);
            const mockResult = { success: true, mock: true, provider: 'mock', template: templateName };
            if (idempotencyKey) {
                await this._recordDurableSuccess({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    result: mockResult
                });
            }
            return mockResult;
        }

        if (metaConfig.provider === 'BAILEYS') {
            console.log(`[WhatsApp/Baileys] Templates are not natively supported by Baileys. Triggering plain-text fallback.`);
            return { success: false, error: 'Templates not supported by Baileys provider' };
        }

        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number' };

        if (process.env.NODE_ENV === 'test' && (!metaConfig.token || metaConfig.token.includes('secret') || metaConfig.token.includes('test') || process.env.MOCK_MODE === 'true')) {
            const msgId = `wamid.mock.template.${Date.now()}`;
            const result = {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                template: templateName,
                mock: true
            };
            if (idempotencyKey) {
                await this._recordDurableSuccess({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    result,
                    providerMessageId: msgId
                });
            }
            return result;
        }

        try {
            const url = `${META_GRAPH_BASE}/${metaConfig.phoneId}/messages`;
            const templatePayload = {
                name:     templateName,
                language: { code: languageCode }
            };

            if (components && components.length > 0) {
                templatePayload.components = components;
            }

            console.log(`[WhatsApp/Meta] SENDING PAYLOAD TO META (From: ${metaConfig.phoneId}):`, JSON.stringify({
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template:          templatePayload,
            }, null, 2));

            const reqHeaders = {
                'Authorization': `Bearer ${metaConfig.token}`,
                'Content-Type':  'application/json',
            };
            const postBody = {
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template:          templatePayload,
            };
            if (options && options.idempotencyKey) {
                reqHeaders['Idempotency-Key'] = options.idempotencyKey;
                postBody.biz_opaque_callback_data = String(options.idempotencyKey).slice(0, 512);
            }

            const response = await axios.post(url, postBody, {
                headers: reqHeaders,
                timeout: 20000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] ✅ TEMPLATE SUCCESS: ${templateName} sent to ${toNumber}. ID: ${msgId}`);
            const result = {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                template: templateName
            };

            if (idempotencyKey) {
                await this._recordDurableSuccess({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    result,
                    providerMessageId: msgId
                });
            }

            return result;
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.response?.data || err.message;
            const metaError = err.response?.data?.error;
            const code = metaError?.code;
            const httpStatus = err.response?.status;

            let isRetryable = false;
            let category = 'PERMANENT';

            if (code === 131008) {
                category = 'TEMPLATE_PARAM_MISMATCH';
            } else if (code === 100) {
                category = 'INVALID_PARAMETER';
            } else if (code === 190) {
                category = 'AUTH_FAILURE';
                if (metaConfig.integrationId) {
                    this._markIntegrationRevoked(metaConfig.integrationId, 'Token expired or revoked (Meta code 190)').catch(() => {});
                }
            } else if (code === 429 || code === 130429 || httpStatus === 429) {
                category = 'RATE_LIMIT';
                isRetryable = true;
            } else if (code === 1 || code === 2 || (httpStatus && httpStatus >= 500)) {
                category = 'TRANSIENT_SERVER_ERROR';
                isRetryable = true;
            } else if (['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(err.code)) {
                category = 'NETWORK_ERROR';
                isRetryable = true;
            }

            const sanitized = this.sanitizeSecrets(detail);
            console.error(`[WhatsApp/Meta] ❌ TEMPLATE ERROR for ${toNumber} [${category}]:`, sanitized);

            const isAmbiguousTimeout = category === 'NETWORK_ERROR' ||
                ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'].includes(err.code) ||
                String(detail || '').toLowerCase().includes('timeout');

            const errResult = {
                success: false,
                error: sanitized,
                category,
                isRetryable,
                code,
                httpStatus,
                provider: 'meta',
                isAmbiguous: isAmbiguousTimeout
            };
            if (idempotencyKey) {
                await this._recordDurableFailure({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    error: sanitized,
                    rawError: metaError || null,
                    isAmbiguous: isAmbiguousTimeout
                });
            }
            return errResult;
        }
    }

    async sendMedia(mobile, type, mediaUrl, caption = '', filename = '', extraOptions = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendMedia", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Idempotency Check (Durable L2 + L1 cache)
        const idempotencyKey = extraOptions?.idempotencyKey;
        let dispatchClaim = null;
        if (idempotencyKey) {
            const normalizedMobile = this._normalizeTarget(mobile) || mobile;
            dispatchClaim = await this._claimOrGetDurableDispatch({
                idempotencyKey,
                mobile,
                messageType: type || 'media',
                provider: extraOptions?.provider || 'META',
                payload: { mobile: normalizedMobile, type, mediaUrl, caption, filename },
                options: extraOptions
            });

            if (!dispatchClaim.canDispatch) {
                if (dispatchClaim.isReplay) {
                    console.log(`[WhatsAppService] Idempotent media replay for key '${idempotencyKey}'. Returning cached result.`);
                    return dispatchClaim.result;
                }
                if (dispatchClaim.inFlight || dispatchClaim.isAmbiguousBlocked) {
                    return dispatchClaim.result;
                }
                return {
                    success: false,
                    error: dispatchClaim.error,
                    code: dispatchClaim.code
                };
            }
        }

        // 2. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !extraOptions?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp media to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        const targetAccount = extraOptions?.integrationId || extraOptions?.phoneId || null;
        const isGroupTarget = String(mobile || '').includes('@g.us');
        const opt = typeof extraOptions === 'object' ? (extraOptions || {}) : {};
        const isBaileysRequested = opt.provider === 'BAILEYS' || 
            opt.channel === 'whatsapp_web' || 
            opt.useBaileys === true ||
            opt.platform === 'WhatsApp Web';

        let metaConfig;
        try {
            metaConfig = await this._resolveAccountConfig(mobile, extraOptions);
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: (isGroupTarget || isBaileysRequested) ? 'baileys' : 'meta' };
        }
        let sendResult;
        if (metaConfig) {
            if (metaConfig.provider === 'BAILEYS') {
                sendResult = await this._sendViaBaileys(mobile, caption, metaConfig, { type, mediaUrl, caption, filename, ...extraOptions });
            } else {
                let mediaId = null;

                // 🚀 SENIOR LOGIC: If mediaUrl is local or from our server, upload to Meta first for reliability
                if (mediaUrl && (mediaUrl.startsWith('/') || mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1'))) {
                    try {
                        const path = await import('path');
                        const fs = await import('fs');

                        // Resolve absolute path
                        let localPath = '';
                        if (mediaUrl.startsWith('/uploads/')) {
                            localPath = path.resolve(mediaUrl.substring(1)); // remove leading slash
                        } else if (mediaUrl.includes('/uploads/')) {
                            const parts = mediaUrl.split('/uploads/');
                            localPath = path.resolve('uploads', parts[1]);
                        }

                        if (localPath && fs.existsSync(localPath)) {
                            console.log(`[WhatsApp/Meta] Local file detected. Uploading to Meta storage...`);
                            const uploadRes = await this.uploadToMeta(localPath, type, targetAccount);
                            if (uploadRes.success) {
                                mediaId = uploadRes.mediaId;
                            } else {
                                // If upload failed and it's a local file, we CANNOT send it via link
                                console.error(`[WhatsApp/Meta] Failed to upload local media to Meta:`, uploadRes.error);
                                sendResult = {
                                    success: false,
                                    error: `Meta Media Upload Failed: ${uploadRes.error}. (Make sure your WhatsApp API Token and Phone ID are correct in settings or .env)`,
                                    provider: 'meta'
                                };
                            }
                        }
                    } catch (e) {
                        console.error(`[WhatsApp/Meta] Local upload bypass failed:`, e.message);
                    }
                }

                if (!sendResult) {
                    sendResult = await this._sendViaMeta(mobile, caption, metaConfig, {
                        type,
                        mediaUrl,
                        mediaId,
                        caption,
                        filename,
                        ...extraOptions
                    });
                }
            }
        } else {
            console.log(`[WhatsApp] MOCK ${type} to ${mobile}: ${mediaUrl}`);
            sendResult = { success: true, mock: true, provider: 'mock' };
        }

        if (idempotencyKey) {
            if (sendResult && sendResult.success) {
                await this._recordDurableSuccess({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    result: sendResult,
                    providerMessageId: sendResult.messageId || sendResult.messages?.[0]?.id
                });
            } else {
                const isAmbiguousTimeout = sendResult?.category === 'NETWORK_ERROR' ||
                    sendResult?.isDeliveryUnknown === true ||
                    sendResult?.deliveryStatus === 'DELIVERY_UNKNOWN' ||
                    ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'].includes(sendResult?.code) ||
                    String(sendResult?.error || '').toLowerCase().includes('timeout');

                await this._recordDurableFailure({
                    idempotencyKey,
                    claimGeneration: dispatchClaim?.claimGeneration,
                    error: sendResult?.error || 'Media send failed',
                    rawError: sendResult?.raw || null,
                    isAmbiguous: isAmbiguousTimeout
                });
            }
        }

        return sendResult;
    }

    /**
     * 🚀 Upload binary media to Meta's servers
     * Required for reliable delivery when the source is not a public URL
     */
    async uploadToMeta(filePath, type, integrationId = null) {
        let config;
        try {
            config = await this._getMetaConfig(integrationId);
        } catch (err) {
            console.error('[WhatsAppService] Error resolving config for uploadToMeta:', err.message);
            return { success: false, error: err.message };
        }
        if (!config || !config.token) return { success: false, error: 'Meta config missing' };

        try {
            const fs = await import('fs');
            const FormData = (await import('form-data')).default;
            
            const fileBuffer = fs.readFileSync(filePath);
            const form = new FormData();
            form.append('file', fileBuffer, { filename: filePath.split('/').pop() });
            form.append('messaging_product', 'whatsapp');
            form.append('type', type);

            const url = `${META_GRAPH_BASE}/${config.phoneId}/media`;
            const response = await axios.post(url, form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${config.token}`,
                },
            });

            return { success: true, mediaId: response.data.id };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            const metaError = err.response?.data?.error;
            console.error(`[WhatsApp/Meta] Media upload FAILED:`, detail);
            if (metaError) console.error(`[WhatsApp/Meta] Meta Upload Detail:`, JSON.stringify(metaError, null, 2));
            return { success: false, error: detail };
        }
    }

    async getTemplates(integrationId = null) {
        let config;
        try {
            config = await this._getMetaConfig(integrationId);
        } catch (err) {
            console.error('[WhatsAppService] Error resolving config for getTemplates:', err.message);
            return [];
        }
        
        if (!config || !config.token || !config.businessId) {
            return [
                {
                    name: 'property_owner_feedback',
                    status: 'APPROVED',
                    language: 'en',
                    components: [
                        {
                            type: 'HEADER',
                            format: 'IMAGE'
                        },
                        { 
                            type: 'BODY', 
                            text: 'Hello {{OwnerName}},\n\nThis is {{EmployeeName}} from Bharat Properties.\n\nRegarding your {{PropertyType}}:\n\n📋 Discussion Summary: {{DiscussionSummary}}\n\nFor any queries, contact us at {{EmployeeMobile}}.\n\nThank you for your time!' 
                        },
                        {
                            type: 'BUTTONS',
                            buttons: [
                                { type: 'QUICK_REPLY', text: 'Update Feedback' },
                                { type: 'QUICK_REPLY', text: 'Status is Correct' }
                            ]
                        }
                    ]
                },
                {
                    name: 'sample_property_launch',
                    status: 'APPROVED',
                    language: 'en_US',
                    components: [
                        { type: 'HEADER', format: 'TEXT', text: 'New Launch in Kurukshetra' },
                        { type: 'BODY', text: 'Hello {{1}}, check out our new project {{2}} starting at {{3}} Lakhs!' }
                    ]
                },
                {
                    name: 'property_match_alert',
                    status: 'APPROVED',
                    language: 'en_US',
                    components: [
                        { 
                            type: 'BODY', 
                            text: 'Hi {{1}}! 🏠\n\nWe found an exclusive property match that aligns perfectly with your requirements:\n\n{{2}}\n\nWould you like to schedule a priority site visit or receive more details?\n\nBest regards,\n{{3}}\nBharat Properties' 
                        }
                    ]
                }
            ];
        }

        try {
            const url = `${META_GRAPH_BASE}/${config.businessId}/message_templates`;
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${config.token}` }
            });
            return response.data.data;
        } catch (err) {
            console.error('[WhatsAppService] Error fetching templates:', err.message);
            return [];
        }
    }

    async downloadMedia(mediaId) {
        const config = await this._getMetaConfig();
        if (!config || !config.token) throw new Error('Meta configuration missing');

        try {
            // 1. Get Media URL from Meta
            const mediaRes = await axios.get(`${META_GRAPH_BASE}/${mediaId}`, {
                headers: { 'Authorization': `Bearer ${config.token}` }
            });

            const mediaUrl = mediaRes.data?.url;
            if (!mediaUrl) throw new Error('Failed to retrieve media URL from Meta');

            // 2. Download Binary Content
            const downloadRes = await axios.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${config.token}` },
                responseType: 'arraybuffer'
            });

            // 3. Save locally to uploads/
            const fs = await import('fs');
            const path = await import('path');
            const crypto = await import('crypto');
            
            const mimeType = downloadRes.headers['content-type'] || 'application/octet-stream';
            const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
            const fileName = `wa_${crypto.randomBytes(8).toString('hex')}.${extension}`;
            const uploadDir = path.resolve('uploads');
            
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(downloadRes.data));

            console.log(`[WhatsApp/Media] Downloaded ${mediaId} to ${fileName}`);
            return {
                success: true,
                localPath: filePath,
                fileName: fileName,
                url: `/uploads/${fileName}`,
                mimeType: mimeType
            };
        } catch (err) {
            console.error(`[WhatsApp/Media] Download failed for ${mediaId}:`, err.message);
            throw err;
        }
    }

    verifyWebhook(query, verifyToken) {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                console.log('[WhatsApp] Webhook Verified Successfully');
                return challenge;
            }
        }
        console.warn('[WhatsApp] Webhook Verification Failed: Invalid Token');
        return null;
    }

    // ── ENTERPRISE UPGRADE: Meta Cloud API Two-Way Sync ──

    /**
     * Fetch approved templates directly from Meta WhatsApp Manager
     */
    async syncTemplatesFromMeta() {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig || !metaConfig.businessId) {
            throw new Error('Meta API credentials (WABA ID) incomplete. Please configure in Integrations.');
        }

        try {
            // URL format: https://graph.facebook.com/v19.0/{waba_id}/message_templates
            const url = `${META_GRAPH_BASE}/${metaConfig.businessId}/message_templates`;
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${metaConfig.token}`
                }
            });

            // Map Meta's structure to our CRM's structure
            const metaTemplates = response.data.data.map(tpl => {
                const headerComp = tpl.components?.find(c => c.type === 'HEADER');
                const footerComp = tpl.components?.find(c => c.type === 'FOOTER');
                const buttonsComp = tpl.components?.find(c => c.type === 'BUTTONS');

                let headerType = 'NONE';
                let headerText = '';
                if (headerComp) {
                    headerType = headerComp.format; // TEXT, IMAGE, VIDEO, DOCUMENT
                    if (headerType === 'TEXT') {
                        headerText = headerComp.text || '';
                    }
                }

                let crmButtons = [];
                if (buttonsComp && buttonsComp.buttons) {
                    crmButtons = buttonsComp.buttons.map(b => {
                        if (b.type === 'URL') {
                            return { type: 'URL', text: b.text, url: b.url, url_type: b.example ? 'DYNAMIC' : 'STATIC' };
                        }
                        if (b.type === 'PHONE_NUMBER') {
                            return { type: 'PHONE', text: b.text, phone_number: b.phone_number, country_code: '' }; 
                        }
                        if (b.type === 'COPY_CODE') {
                            return { type: 'COPY_CODE', text: b.text, example: b.example };
                        }
                        if (b.type === 'FLOW') {
                            return { type: 'FLOW', text: b.text, flow_id: b.flow_id };
                        }
                        if (b.type === 'voice_call' || b.type === 'VOICE_CALL') {
                            return { type: 'VOICE_CALL', text: b.text, ttl_minutes: b.ttl_minutes || '10080' };
                        }
                        return { type: 'QUICK_REPLY', text: b.text };
                    });
                }

                return {
                    id: tpl.id,
                    name: tpl.name,
                    language: tpl.language,
                    category: tpl.category,
                    status: tpl.status, // e.g. APPROVED, REJECTED, PENDING
                    body: tpl.components?.find(c => c.type === 'BODY')?.text || '',
                    headerType,
                    headerText,
                    footer: footerComp?.text || '',
                    buttons: crmButtons,
                    rawComponents: tpl.components, // Store raw for variable inference
                    variableMapping: {}, // Empty by default
                    systemContext: [] // Empty by default
                };
            });

            return { success: true, data: metaTemplates };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error('[WhatsApp/Meta] ❌ SYNC TEMPLATES ERROR:', detail);
            return { success: false, error: detail };
        }
    }

    async _uploadMediaToMeta(fileObj, metaConfig) {
        if (!metaConfig.appId) throw new Error("Meta App ID is missing. Cannot upload media.");
        
        // Extract base64 and decode
        const base64Data = fileObj.data.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileLength = buffer.length;

        // Step 1: Create session
        const sessionUrl = `${META_GRAPH_BASE}/${metaConfig.appId}/uploads?file_length=${fileLength}&file_type=${fileObj.type}`;
        const sessionResponse = await axios.post(sessionUrl, {}, {
            headers: {
                'Authorization': `Bearer ${metaConfig.token}`
            }
        });
        
        const uploadSessionId = sessionResponse.data.id;
        
        // Step 2: Upload data
        const uploadUrl = `${META_GRAPH_BASE}/${uploadSessionId}`;
        const uploadResponse = await axios.post(uploadUrl, buffer, {
            headers: {
                'Authorization': `OAuth ${metaConfig.token}`,
                'file_offset': '0',
                'Content-Type': 'application/octet-stream'
            }
        });

        return uploadResponse.data.h; // The file handle
    }

    /**
     * Submit a template for review/approval to Meta
     */
    async submitTemplateToMeta(templateData) {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig || !metaConfig.businessId) {
            throw new Error('Meta API credentials (WABA ID) incomplete. Please configure in Integrations.');
        }

        try {
            let url = `${META_GRAPH_BASE}/${metaConfig.businessId}/message_templates`;
            
            const isEdit = !!templateData.id && String(templateData.id).length > 8 && /^\d+$/.test(String(templateData.id)); // Meta IDs are long numbers

            // Build Cloud API payload. Note: We only construct the basic BODY for now.
            // Full enterprise payload requires HEADER, FOOTER, BUTTONS mappings.
            const payload = {
                category: templateData.category || 'MARKETING',
                components: []
            };

            if (isEdit) {
                url = `${META_GRAPH_BASE}/${templateData.id}`;
            } else {
                payload.name = templateData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'); // Meta requires lower_case_snake
                payload.language = templateData.language || 'en_US';
            }
            
            if (templateData.subCategory) payload.allow_category_change = true;
            if (templateData.flowId) payload.flow_id = templateData.flowId;
            if (templateData.catalogueId) payload.catalogue_id = templateData.catalogueId;

            // Add Header
            if (templateData.headerType && templateData.headerType !== 'NONE') {
                const headerComp = {
                    type: 'HEADER',
                    format: templateData.headerType
                };
                if (templateData.headerType === 'TEXT' && templateData.headerText) {
                    let hText = templateData.headerText;
                    const hMatches = hText.match(/\{\{([^}]+)\}\}/g);
                    if (hMatches && hMatches.length > 0) {
                        hText = hText.replace(/\{\{([^}]+)\}\}/g, '{{1}}');
                        headerComp.example = { header_text: ["Example Header"] };
                    }
                    headerComp.text = hText;
                } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && templateData.headerFile) {
                    const fileHandle = await this._uploadMediaToMeta(templateData.headerFile, metaConfig);
                    headerComp.example = { header_handle: [fileHandle] };
                }
                payload.components.push(headerComp);
            }

            // Add Body
            if (templateData.body) {
                let bodyText = templateData.body;
                const bMatches = bodyText.match(/\{\{([^}]+)\}\}/g);
                const bodyComp = { type: 'BODY' };
                
                if (bMatches && bMatches.length > 0) {
                    let varCount = 1;
                    const examples = [];
                    bodyText = bodyText.replace(/\{\{([^}]+)\}\}/g, () => {
                        examples.push("Dummy_Data_" + varCount);
                        return `{{${varCount++}}}`;
                    });
                    bodyComp.example = { body_text: [examples] };
                }
                bodyComp.text = bodyText;
                
                payload.components.push(bodyComp);
            }

            // Add Footer
            if (templateData.footer) {
                payload.components.push({
                    type: 'FOOTER',
                    text: templateData.footer
                });
            }

            // Add Buttons
            if (templateData.buttons && templateData.buttons.length > 0) {
                const buttons = templateData.buttons.map(btn => {
                    const mappedBtn = { text: btn.text || 'Button' };
                    if (btn.type === 'URL') {
                        mappedBtn.type = 'URL';
                        mappedBtn.url = btn.url || 'https://www.example.com';
                        if (btn.url_type === 'DYNAMIC') {
                            mappedBtn.example = ["custom_path"]; // Meta requires an example for the {{1}} variable
                        }
                    } else if (btn.type === 'VOICE_CALL') {
                        mappedBtn.type = 'voice_call';
                        if (btn.ttl_minutes) {
                            mappedBtn.ttl_minutes = parseInt(btn.ttl_minutes, 10);
                        }
                    } else if (btn.type === 'PHONE') {
                        mappedBtn.type = 'PHONE_NUMBER';
                        mappedBtn.phone_number = (btn.country_code || '+91') + (btn.phone_number || '9999999999');
                    } else if (btn.type === 'FLOW') {
                        mappedBtn.type = 'FLOW';
                        mappedBtn.flow_id = btn.flow_id || '123456789';
                        mappedBtn.flow_action = 'NAVIGATE';
                        mappedBtn.navigate_screen = 'Default_Screen';
                    } else if (btn.type === 'COPY_CODE') {
                        mappedBtn.type = 'COPY_CODE';
                        mappedBtn.example = btn.example || 'OFFER20'; 
                    } else {
                        mappedBtn.type = 'QUICK_REPLY';
                    }
                    return mappedBtn;
                });
                
                payload.components.push({
                    type: 'BUTTONS',
                    buttons: buttons
                });
            }

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${metaConfig.token}`,
                    'Content-Type': 'application/json'
                }
            });

            return { success: true, data: response.data };
        } catch (err) {
            console.error('[WhatsApp/Meta] ❌ FULL METADATA ERROR:', JSON.stringify(err.response?.data, null, 2));
            const metaError = err.response?.data?.error;
            const detail = metaError?.error_user_msg || metaError?.message || err.message;
            console.error('[WhatsApp/Meta] ❌ SUBMIT TEMPLATE ERROR:', detail);
            return { success: false, error: detail };
        }
    }
}

export default new WhatsAppService();
