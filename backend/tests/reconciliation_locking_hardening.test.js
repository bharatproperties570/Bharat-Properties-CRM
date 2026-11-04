process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import WhatsAppService from '../services/WhatsAppService.js';
import { BaileysConnectionManager } from '../services/baileysQueue/BaileysConnectionManager.js';
import redisProxy from '../src/config/redis.js';

describe('WhatsApp Engine Distributed Locking & Reconciliation Hardening Suite (P0-A, P0-B, P0-C, P0-D)', () => {
    let mongod;
    let testUser;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        await WhatsAppDispatch.createCollection();
        await WhatsAppDispatch.ensureIndexes();
        await WhatsAppIntegration.createCollection();
        await User.createCollection();
        await Role.createCollection();

        process.env.INTERNAL_SERVICE_SECRET = 'test_secret_reconcile_hardening';

        const role = await Role.create({
            name: 'Dispatch Auditor Role',
            department: 'sales',
            isSystemRole: true,
            permissions: ['whatsapp.dispatch.reconcile']
        });

        testUser = await User.create({
            fullName: 'Audit Lead',
            email: 'auditlead@bharatproperties.co',
            password: 'secure_password',
            role: role._id,
            department: 'sales',
            isActive: true,
            status: 'active'
        });
    });

    after(async () => {
        if (mongoose.connection) {
            await mongoose.disconnect();
        }
        if (mongod) {
            await mongod.stop();
        }
    });

    // ── P0-A: Fail-Closed Reconciliation Lock ──────────────────────────────────
    describe('P0-A: Reconciliation Redis Lock Must Fail Closed', () => {
        it('1. Rejects reconciliation immediately when lock key is missing or blank', async () => {
            const res = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: '   ',
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.missing_key.001',
                actorContext: testUser
            });
            assert.equal(res.success, false);
            assert.equal(res.error, 'IDEMPOTENCY_KEY_REQUIRED');
        });

        it('2. Fails closed with DISTRIBUTED_LOCK_TIMEOUT when lock cannot be acquired within wait window', async () => {
            const idKey = 'durable_reconcile_lock_timeout_test';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            // Seed dispatch document in AMBIGUOUS_TIMEOUT
            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100102',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true
            });

            // Pre-seed Redis lock held by an external process
            await redisProxy.set(lockKey, 'external_holder_token', 'NX', 'EX', 30);

            try {
                // Pass bounded maxWaitMs (150ms) to verify real timeout and fail-closed abortion
                const res = await WhatsAppService.manualReconcileDispatch({
                    idempotencyKey: idKey,
                    targetStatus: 'DISPATCHED',
                    providerMessageId: 'wamid.timeout.002',
                    actorContext: testUser,
                    lockOptions: { maxWaitMs: 150 }
                });

                assert.equal(res.success, false);
                assert.equal(res.error, 'DISTRIBUTED_LOCK_TIMEOUT');
                assert.equal(res.idempotencyKey, idKey);

                // Verify the database mutation NEVER executed
                const record = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
                assert.equal(record.status, 'AMBIGUOUS_TIMEOUT');
                assert.equal(record.providerMessageId, undefined);
                assert.equal(record.reconciledAt, undefined);
            } finally {
                await redisProxy.del(lockKey);
                await redisProxy.del(`lock:dispatch_reconcile_gen:${idKey}`);
            }
        });
    });

    // ── P0-B: Canonical Lock Key Alignment ─────────────────────────────────────
    describe('P0-B: Webhook Must Use Canonical Reconciliation Lock Key', () => {
        it('3. Webhook with biz_opaque_callback_data uses callback token as canonical lock key', async () => {
            const canonicalKey = 'canonical_dispatch_opaque_003';
            const providerMsgId = 'wamid.canonical.test.003';
            const recipient = '919811100103';

            await WhatsAppDispatch.create({
                idempotencyKey: canonicalKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'CLAIMED'
            });

            const webhookPayload = {
                id: providerMsgId,
                status: 'delivered',
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: recipient,
                biz_opaque_callback_data: canonicalKey
            };

            const res = await WhatsAppService.reconcileWebhookStatus(webhookPayload);
            assert.equal(res.reconciled, true);
            assert.equal(res.idempotencyKey, canonicalKey);
            assert.equal(res.deliveryStatus, 'delivered');

            const updated = await WhatsAppDispatch.findOne({ idempotencyKey: canonicalKey }).lean();
            assert.equal(updated.deliveryStatus, 'delivered');
            assert.equal(updated.providerMessageId, providerMsgId);
            assert.equal(updated.reconciliationReason, 'DETERMINISTIC_OPAQUE_CALLBACK_DATA');
        });

        it('4. Webhook without biz_opaque_callback_data resolves canonical idempotencyKey from durable dispatch', async () => {
            const canonicalKey = 'canonical_dispatch_from_db_004';
            const providerMsgId = 'wamid.canonical.db.004';
            const recipient = '919811100104';

            await WhatsAppDispatch.create({
                idempotencyKey: canonicalKey,
                providerMessageId: providerMsgId,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'CLAIMED'
            });

            // Webhook arriving without biz_opaque_callback_data (e.g. standard Meta webhook)
            const webhookPayload = {
                id: providerMsgId,
                status: 'delivered',
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: recipient
            };

            const res = await WhatsAppService.reconcileWebhookStatus(webhookPayload);
            assert.equal(res.reconciled, true);
            assert.equal(res.idempotencyKey, canonicalKey);
            assert.equal(res.deliveryStatus, 'delivered');
        });

        it('5. Webhook without biz_opaque_callback_data and missing dispatch record returns DISPATCH_NOT_FOUND without fallback key', async () => {
            const unknownMsgId = 'wamid.completely_unknown_msg_005';
            const webhookPayload = {
                id: unknownMsgId,
                status: 'delivered',
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: '919811100105'
            };

            const res = await WhatsAppService.reconcileWebhookStatus(webhookPayload);
            assert.equal(res.reconciled, false);
            assert.equal(res.reason, 'DISPATCH_NOT_FOUND');
            assert.equal(res.providerMessageId, unknownMsgId);

            // Verify no distributed lock was acquired for the raw message ID
            const lockCheck = await redisProxy.get(`lock:dispatch_reconcile:${unknownMsgId}`);
            assert.equal(lockCheck, null);
        });

        it('6. Webhook fails safely with DATABASE_UNAVAILABLE when database is disconnected during canonical key lookup', async () => {
            const webhookPayload = {
                id: 'wamid.db_down_lookup_006',
                status: 'delivered',
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: '919811100106'
            };

            const origState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, writable: true, configurable: true });

            try {
                const res = await WhatsAppService.reconcileWebhookStatus(webhookPayload);
                assert.equal(res.reconciled, false);
                assert.equal(res.reason, 'DATABASE_UNAVAILABLE');
            } finally {
                Object.defineProperty(mongoose.connection, 'readyState', { value: origState, writable: true, configurable: true });
            }
        });
    });

    // ── P0-C: Baileys Outbound Lock Renewal Failure Abort ──────────────────────
    describe('P0-C: Baileys Outbound Lock Renewal Failure Must Abort Dispatch', () => {
        it('7. serializeSend provides signal and cancellation checker in lockContext', async () => {
            let capturedContext = null;
            await BaileysConnectionManager.serializeSend('test_session_007', async (lockContext) => {
                capturedContext = lockContext;
                assert.ok(lockContext, 'lockContext must be passed to sendTask');
                assert.ok(lockContext.signal instanceof AbortSignal, 'lockContext.signal must be an AbortSignal');
                assert.equal(typeof lockContext.isLockLost, 'function', 'lockContext.isLockLost must be a function');
                assert.equal(lockContext.isLockLost(), false, 'isLockLost() must be false while lock is active');
                return { success: true };
            });
            assert.ok(capturedContext);
        });

        it('8. serializeSend aborts send and throws DISTRIBUTED_LOCK_LOST if renewal returns 0 (lock stolen or expired)', async () => {
            const sessionId = 'test_session_stolen_008';
            const lockKey = `lock:baileys_outbound:${sessionId}`;

            let taskStarted = false;
            let caughtError = null;

            try {
                await assert.rejects(async () => {
                    await BaileysConnectionManager.serializeSend(sessionId, async (lockContext) => {
                        taskStarted = true;
                        // Replace token in Redis so renewal fails
                        await redisProxy.set(lockKey, 'stolen_by_another_worker_token');

                        // Wait longer than heartbeat interval (40ms) to allow production heartbeat callback to execute
                        return new Promise((resolve) => setTimeout(resolve, 5000));
                    }, { heartbeatIntervalMs: 40, skipCooloff: true });
                }, (err) => {
                    caughtError = err;
                    return err.message.includes('DISTRIBUTED_LOCK_LOST');
                });
            } finally {
                await redisProxy.del(lockKey);
            }

            assert.ok(taskStarted, 'Send task must have started');
            assert.ok(caughtError, 'Must catch error from rejected serializeSend');
            assert.ok(caughtError.message.includes('DISTRIBUTED_LOCK_LOST'));
        });

        it('9. _sendViaBaileys marks deliveryStatus as DELIVERY_UNKNOWN when outbound lock is lost during in-flight send', async () => {
            const config = { integrationId: 'test_session_lost_009', provider: 'BAILEYS' };

            const mockSocket = {
                user: { id: '919811100109:1@s.whatsapp.net' },
                ws: { isOpen: true },
                sendMessage: async () => new Promise(() => {}),
                sendPresenceUpdate: async () => {}
            };
            const origGetSocket = BaileysConnectionManager.getSocket;
            BaileysConnectionManager.getSocket = (id) => (String(id) === 'test_session_lost_009' ? mockSocket : null);

            // Mock serializeSend to simulate DISTRIBUTED_LOCK_LOST thrown after socket write initiated
            const origSerialize = BaileysConnectionManager.serializeSend;
            BaileysConnectionManager.serializeSend = async (intId, fn) => {
                const abortController = new AbortController();
                fn({ isLockLost: () => false, signal: abortController.signal });
                // Let task initiate socket write
                await new Promise(r => setTimeout(r, 20));
                abortController.abort();
                const err = new Error('DISTRIBUTED_LOCK_LOST: Outbound lock for Baileys session test_session_lost_009 expired or was acquired by another process.');
                err.code = 'DISTRIBUTED_LOCK_LOST';
                throw err;
            };

            try {
                const sendResult = await WhatsAppService._sendViaBaileys('919811100109', 'Test message', config);
                assert.equal(sendResult.success, false);
                assert.equal(sendResult.deliveryStatus, 'DELIVERY_UNKNOWN');
                assert.equal(sendResult.isDeliveryUnknown, true);
                assert.ok(sendResult.error.includes('DISTRIBUTED_LOCK_LOST'));
            } finally {
                BaileysConnectionManager.getSocket = origGetSocket;
                BaileysConnectionManager.serializeSend = origSerialize;
            }
        });
    });

    // ── P0-D: Reconciliation Lock Lease Renewal ────────────────────────────────
    describe('P0-D: Reconciliation Lock Must Have Active Lease Renewal', () => {
        it('10. Blocks MongoDB CAS mutation if lockContext reports lock was lost before update', async () => {
            const idKey = 'durable_cas_lock_lost_010';
            const recipient = '919811100110';

            const dispatch = await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true
            });

            // Simulate lock lost context
            const simulatedLockContext = {
                isLockLost: () => true, // Lock expired or token replaced!
                signal: { aborted: true },
                getLockToken: () => 'token_lost_010'
            };

            const manualRes = await WhatsAppService._manualReconcileDispatchInternal({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.cas_blocked.010',
                actorContext: testUser,
                actorId: testUser._id.toString()
            }, simulatedLockContext);

            assert.equal(manualRes.success, false);
            assert.ok(manualRes.error.includes('DISTRIBUTED_LOCK_LOST'), 'Must reject mutation when reconciliation lock is lost');

            // Verify document was NOT modified in MongoDB
            const record = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(record.status, 'AMBIGUOUS_TIMEOUT');
            assert.equal(record.providerMessageId, undefined);
        });

        it('11. Webhook reconciliation blocks CAS mutation if lockContext reports lock was lost', async () => {
            const idKey = 'durable_webhook_lock_lost_011';
            const providerMsgId = 'wamid.webhook.lock_lost.011';
            const recipient = '919811100111';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                providerMessageId: providerMsgId,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'CLAIMED'
            });

            const simulatedLockContext = {
                isLockLost: () => true,
                signal: { aborted: true },
                getLockToken: () => 'token_lost_011'
            };

            const statusObj = {
                id: providerMsgId,
                status: 'delivered',
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: recipient
            };

            const res = await WhatsAppService._reconcileWebhookStatusInternal(statusObj, simulatedLockContext);
            assert.equal(res.reconciled, false);
            assert.equal(res.reason, 'DISTRIBUTED_LOCK_LOST');

            // Verify status was NOT changed
            const record = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(record.status, 'CLAIMED');
            assert.equal(record.deliveryStatus, undefined);
        });

        it('12. In-flight Baileys send safety: Unresolved socket send during lock renewal failure reports DELIVERY_UNKNOWN, zero retries, and blocks duplicate send', async () => {
            const idempotencyKey = 'inflight_idemp_key_012';
            const recipient = '919811100112';

            const integration = await WhatsAppIntegration.create({
                provider: 'BAILEYS',
                phoneNumberId: 'phone_012',
                displayPhoneNumber: '+91 98111 00112',
                accountLabel: 'Inflight Test Line',
                connectionType: 'QR_SCANNER',
                status: 'ACTIVE',
                isDefault: false
            });

            const lockKey = `lock:baileys_outbound:${integration._id}`;

            let socketSendInvocations = 0;
            const mockSocket = {
                user: { id: '919811100112:1@s.whatsapp.net' },
                ws: { isOpen: true },
                sendMessage: async (jid, content) => {
                    socketSendInvocations++;
                    // Socket send remains unresolved while renewal fails in the background
                    return new Promise(() => {});
                },
                sendPresenceUpdate: async () => {}
            };

            const origGetSocket = BaileysConnectionManager.getSocket;
            BaileysConnectionManager.getSocket = (id) => {
                if (String(id) === String(integration._id)) return mockSocket;
                return origGetSocket ? origGetSocket(id) : null;
            };

            try {
                const sendPromise = WhatsAppService.sendMessage(recipient, 'In flight message test', {
                    idempotencyKey,
                    integrationId: integration._id,
                    provider: 'BAILEYS',
                    channel: 'whatsapp_web',
                    useBaileys: true,
                    lockOptions: { heartbeatIntervalMs: 40, skipCooloff: true },
                    hooks: {
                        beforeSocketSend: async () => {
                            // Steal lock in Redis immediately so renewal fails
                            await redisProxy.set(lockKey, 'stolen_token_012');
                        }
                    }
                });

                const result = await sendPromise;

                // 1. Caller receives ambiguous DELIVERY_UNKNOWN outcome
                assert.equal(result.success, false);
                assert.equal(result.deliveryStatus, 'DELIVERY_UNKNOWN');
                assert.equal(result.isDeliveryUnknown, true);
                assert.equal(result.isAmbiguous, true);

                // 2. Exactly one socket write was initiated; no retry occurred
                assert.equal(socketSendInvocations, 1, 'Exactly one socket write must be initiated; retry is forbidden');

                // 3. Durable ledger records AMBIGUOUS_TIMEOUT
                const dispatchRecord = await WhatsAppDispatch.findOne({ idempotencyKey }).lean();
                assert.ok(dispatchRecord);
                assert.equal(dispatchRecord.status, 'AMBIGUOUS_TIMEOUT');
                assert.equal(dispatchRecord.isAmbiguous, true);

                // 4. Duplicate send attempt with same idempotencyKey is blocked
                const duplicateAttempt = await WhatsAppService.sendMessage(recipient, 'In flight message test', {
                    idempotencyKey,
                    integrationId: integration._id,
                    provider: 'BAILEYS',
                    useBaileys: true
                });
                assert.equal(duplicateAttempt.success, false);
                assert.equal(duplicateAttempt.code, 'AMBIGUOUS_TIMEOUT_BLOCKED');
                assert.equal(socketSendInvocations, 1, 'No additional socket writes must occur on blocked duplicate');
            } finally {
                BaileysConnectionManager.getSocket = origGetSocket;
                await redisProxy.del(lockKey);
            }
        });

        it('13. Reconciliation CAS race: Stale lock holder mutation rejected by monotonic fencing generation in MongoDB', async () => {
            const idKey = 'durable_cas_race_013';
            const recipient = '919811100113';

            // Seed dispatch record
            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 0
            });

            let workerAAttempted = false;

            // Worker A attempts reconciliation
            const workerARes = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'FAILED',
                reason: 'Worker A stale failure marking',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                hooks: {
                    beforeMongoCas: async ({ lockContext }) => {
                        workerAAttempted = true;
                        // Worker A is paused right between ownership validation and MongoDB CAS!
                        // In the meantime, simulating Worker B running concurrently in another Node.js process:
                        // Worker B acquires distributed lock and atomically claims generation in MongoDB:
                        const claimedB = await WhatsAppDispatch.findOneAndUpdate(
                            { idempotencyKey: idKey },
                            {
                                $inc: { reconcileGeneration: 1 },
                                $set: { reconcileLockWorkerId: 'token_worker_b_013', reconcileClaimedAt: new Date() }
                            },
                            { new: true }
                        );
                        assert.equal(claimedB.reconcileGeneration, 2, 'Worker B must claim generation 2');

                        const workerBLockContext = {
                            fencingToken: claimedB.reconcileGeneration,
                            lockToken: 'token_worker_b_013',
                            isLockLost: () => false,
                            validateOwnership: async () => true
                        };

                        const workerBRes = await WhatsAppService._manualReconcileDispatchInternal({
                            idempotencyKey: idKey,
                            targetStatus: 'DISPATCHED',
                            providerMessageId: 'wamid.worker_b.013',
                            actorContext: testUser,
                            actorId: testUser._id.toString(),
                            reason: 'Worker B confirmed delivery'
                        }, workerBLockContext);

                        assert.equal(workerBRes.success, true, 'Worker B must succeed');
                        assert.equal(workerBRes.status, 'DISPATCHED');
                    }
                }
            });

            assert.ok(workerAAttempted, 'Worker A hook must have executed');

            // Worker A's stale mutation must be rejected with STALE_FENCING_GENERATION
            assert.equal(workerARes.success, false);
            assert.ok(workerARes.error.includes('STALE_FENCING_GENERATION'), `Expected STALE_FENCING_GENERATION, got: ${workerARes.error}`);

            // Verify the database contains Worker B's ground truth, NOT Worker A's stale mutation
            const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(finalDoc.status, 'DISPATCHED');
            assert.equal(finalDoc.providerMessageId, 'wamid.worker_b.013');
            assert.equal(finalDoc.reconcileGeneration, 2);
            assert.equal(finalDoc.reconciliationReason, 'Worker B confirmed delivery');
        });

        it('14. Redis connection error fails closed with DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE and zero database mutation', async () => {
            const idKey = 'durable_redis_err_014';
            const recipient = '919811100114';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true
            });

            // Mock eval on redisProxy to simulate Redis connection failure
            redisProxy.eval = async () => {
                throw new Error('Connection lost to Redis server');
            };

            try {
                const res = await WhatsAppService.manualReconcileDispatch({
                    idempotencyKey: idKey,
                    targetStatus: 'DISPATCHED',
                    providerMessageId: 'wamid.redis_err.014',
                    actorContext: testUser
                });

                assert.equal(res.success, false);
                assert.equal(res.error, 'DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE');
                assert.ok(res.detail.includes('Connection lost'));

                // Verify zero database mutation
                const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
                assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
                assert.equal(doc.providerMessageId, undefined);
            } finally {
                delete redisProxy.eval;
            }
        });

        it('15. Baileys send lock lost BEFORE socket transmission reports FAILED (not DELIVERY_UNKNOWN), with zero socket writes', async () => {
            let socketCalls = 0;
            const mockSocket = {
                user: { id: '919811100115:1@s.whatsapp.net' },
                ws: { isOpen: true },
                sendMessage: async () => {
                    socketCalls++;
                    return { key: { id: 'wamid.015' } };
                },
                sendPresenceUpdate: async () => {}
            };

            const origGetSocket = BaileysConnectionManager.getSocket;
            BaileysConnectionManager.getSocket = () => mockSocket;

            const config = { integrationId: 'session_lost_before_send_015', provider: 'BAILEYS' };

            try {
                // Simulate lock lost context before socket write
                const sendResult = await WhatsAppService._executeSendViaBaileys(
                    '919811100115',
                    'Test message',
                    config,
                    {},
                    { isLockLost: () => true, signal: { aborted: true } }
                );

                assert.equal(sendResult.success, false);
                assert.equal(sendResult.deliveryStatus, 'FAILED');
                assert.equal(sendResult.isDeliveryUnknown, false);
                assert.equal(sendResult.isAmbiguous, false);
                assert.ok(sendResult.error.includes('DISTRIBUTED_LOCK_LOST'));
                assert.equal(socketCalls, 0, 'Zero socket writes must occur if lock was lost before transmission');
            } finally {
                BaileysConnectionManager.getSocket = origGetSocket;
            }
        });

        it('16. Deterministic Section 3 Race: Issuance of fencing token 2 immediately fences Worker A even before Worker B executes its business write', async () => {
            const idKey = 'durable_cas_race_section3_016';
            const recipient = '919811100116';

            // Seed dispatch record with reconcileGeneration = 0 and status AMBIGUOUS_TIMEOUT
            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 0
            });

            let workerAPausedResolve;
            const workerAPausedPromise = new Promise(r => { workerAPausedResolve = r; });
            let workerAResumeResolve;
            const workerAResumePromise = new Promise(r => { workerAResumeResolve = r; });

            // Worker A attempts reconciliation in the background
            const workerAPromise = WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'FAILED',
                reason: 'Worker A stale timeout mark',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                hooks: {
                    beforeMongoCas: async ({ lockContext }) => {
                        // Signal that Worker A has acquired lock and entered hook
                        workerAPausedResolve(lockContext);
                        // Pause Worker A
                        await workerAResumePromise;
                    }
                }
            });

            // Wait until Worker A has acquired the lock and paused before its MongoDB CAS
            const workerALockContext = await workerAPausedPromise;
            assert.equal(workerALockContext.fencingToken, 1, 'Worker A must have acquired fencing generation 1');

            // Now, simulate Worker B arriving after Worker A's lease expires / steals lock.
            // Worker B acquires the distributed lock and performs acquisition-time claiming in MongoDB!
            const claimedDoc = await WhatsAppDispatch.findOneAndUpdate(
                { idempotencyKey: idKey },
                {
                    $inc: { reconcileGeneration: 1 },
                    $set: {
                        reconcileLockWorkerId: 'worker_b_distributed_token_016',
                        reconcileClaimedAt: new Date()
                    }
                },
                { new: true }
            );

            assert.equal(claimedDoc.reconcileGeneration, 2, 'Issuance of lock to Worker B must advance reconcileGeneration to 2');

            // CRITICAL SECTION 3 ASSERTION:
            // Verify that Worker B has NOT yet executed its business write!
            // Status in MongoDB must still be 'AMBIGUOUS_TIMEOUT', NOT 'DISPATCHED' or 'FAILED'
            const docBeforeBWrites = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(docBeforeBWrites.status, 'AMBIGUOUS_TIMEOUT', 'MongoDB must still be AMBIGUOUS_TIMEOUT before Worker B writes');
            assert.equal(docBeforeBWrites.reconcileGeneration, 2, 'MongoDB must have recorded generation 2 at acquisition time');

            // Now resume Worker A! Worker A attempts its CAS with token 1.
            workerAResumeResolve();
            const workerARes = await workerAPromise;

            // Worker A MUST fail closed and be rejected because generation 2 was issued, even though B has not written!
            assert.equal(workerARes.success, false, 'Worker A must be rejected');
            assert.ok(
                workerARes.error.includes('STALE_FENCING_GENERATION'),
                `Expected STALE_FENCING_GENERATION for Worker A, got: ${workerARes.error}`
            );

            // Verify that MongoDB state was NOT modified by Worker A
            const docAfterAFails = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(docAfterAFails.status, 'AMBIGUOUS_TIMEOUT', 'Worker A must not have committed its status mutation');
            assert.equal(docAfterAFails.reconcileGeneration, 2);

            // Now Worker B executes its business write with generation 2
            const workerBLockContext = {
                fencingToken: 2,
                lockToken: 'worker_b_distributed_token_016',
                isLockLost: () => false,
                validateOwnership: async () => true
            };

            const workerBRes = await WhatsAppService._manualReconcileDispatchInternal({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.worker_b.section3.016',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Worker B confirmed delivery after Worker A fenced'
            }, workerBLockContext);

            assert.equal(workerBRes.success, true, 'Worker B business mutation must succeed');

            // Verify final state in MongoDB
            const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(finalDoc.status, 'DISPATCHED');
            assert.equal(finalDoc.providerMessageId, 'wamid.worker_b.section3.016');
            assert.equal(finalDoc.reconcileGeneration, 2);
            assert.equal(finalDoc.reconciliationReason, 'Worker B confirmed delivery after Worker A fenced');
        });

        it('17. Database failure during acquisition-time fencing fails closed with DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE', async () => {
            const idKey = 'durable_db_fail_fencing_017';
            const recipient = '919811100117';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 0
            });

            // Mock findOneAndUpdate to throw an error during the fencing claim
            const origFindOneAndUpdate = WhatsAppDispatch.findOneAndUpdate;
            let callCount = 0;
            WhatsAppDispatch.findOneAndUpdate = async function(filter, update, opts) {
                if (filter?.idempotencyKey === idKey && update?.$inc?.reconcileGeneration) {
                    callCount++;
                    throw new Error('MongoNetworkTimeoutError: Simulated cluster timeout during fencing claim');
                }
                return origFindOneAndUpdate.call(this, filter, update, opts);
            };

            try {
                const res = await WhatsAppService.manualReconcileDispatch({
                    idempotencyKey: idKey,
                    targetStatus: 'DISPATCHED',
                    providerMessageId: 'wamid.017',
                    actorContext: testUser,
                    actorId: testUser._id.toString(),
                    reason: 'Should fail closed on DB fencing error'
                });

                assert.equal(res.success, false);
                assert.ok(
                    res.error.includes('DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE'),
                    `Expected DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE, got: ${res.error}`
                );
                assert.equal(callCount, 1, 'Fencing claim must have been attempted');

                // Verify document remains untouched
                const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
                assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
                assert.equal(doc.reconcileGeneration, 0);
            } finally {
                WhatsAppDispatch.findOneAndUpdate = origFindOneAndUpdate;
            }
        });

        it('18. Fails closed with DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE when MongoDB is disconnected before acquisition', async () => {
            const idKey = 'durable_db_down_before_acq_018';

            const origReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

            try {
                const res = await WhatsAppService.manualReconcileDispatch({
                    idempotencyKey: idKey,
                    targetStatus: 'DISPATCHED',
                    providerMessageId: 'wamid.018',
                    actorContext: testUser,
                    actorId: testUser._id.toString(),
                    reason: 'Should abort when DB disconnected'
                });

                assert.equal(res.success, false);
                assert.ok(
                    res.error.includes('DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE'),
                    `Expected DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE, got: ${res.error}`
                );
            } finally {
                Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
            }
        });

        it('19. Fails closed with DISPATCH_LEDGER_NOT_FOUND when dispatch record does not exist during acquisition', async () => {
            const nonExistentKey = 'non_existent_dispatch_key_019';

            const res = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: nonExistentKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.019',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Should fail closed on missing ledger record'
            });

            assert.equal(res.success, false);
            assert.ok(
                res.error.includes('DISPATCH_LEDGER_NOT_FOUND'),
                `Expected DISPATCH_LEDGER_NOT_FOUND, got: ${res.error}`
            );
        });

        it('20. Safely releases Redis lock if MongoDB acquisition claim fails or throws', async () => {
            const idKey = 'durable_redis_release_on_mongo_err_020';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100120',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 0
            });

            // Mock findOneAndUpdate to throw an error during the claim
            const origFindOneAndUpdate = WhatsAppDispatch.findOneAndUpdate;
            WhatsAppDispatch.findOneAndUpdate = async function(filter, update, opts) {
                if (filter?.idempotencyKey === idKey && update?.$inc?.reconcileGeneration) {
                    throw new Error('MongoWriteException: Simulated claim failure');
                }
                return origFindOneAndUpdate.call(this, filter, update, opts);
            };

            try {
                const res = await WhatsAppService.manualReconcileDispatch({
                    idempotencyKey: idKey,
                    targetStatus: 'DISPATCHED',
                    providerMessageId: 'wamid.020',
                    actorContext: testUser,
                    actorId: testUser._id.toString(),
                    reason: 'Lock cleanup verification'
                });

                assert.equal(res.success, false);
                assert.ok(res.error.includes('DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE'));

                // Verify Redis lock was released cleanly in finally block!
                const lockVal = await redisProxy.get(lockKey);
                assert.equal(lockVal, null, 'Redis lock must be released when MongoDB claim fails');
            } finally {
                WhatsAppDispatch.findOneAndUpdate = origFindOneAndUpdate;
                await redisProxy.del(lockKey);
            }
        });

        it('21. Protected entry points reject absent or zero fencing token (FENCING_CONTEXT_REQUIRED)', async () => {
            const idKey = 'durable_no_fencing_context_021';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100121',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            // 1. _manualReconcileDispatchInternal without lockContext
            const manualResNoLock = await WhatsAppService._manualReconcileDispatchInternal({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.no_lock.021',
                actorContext: testUser,
                actorId: testUser._id.toString()
            }, null);
            assert.equal(manualResNoLock.success, false);
            assert.ok(manualResNoLock.error.includes('FENCING_CONTEXT_REQUIRED'));

            // 2. _manualReconcileDispatchInternal with zero fencing token
            const manualResZero = await WhatsAppService._manualReconcileDispatchInternal({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.zero.021',
                actorContext: testUser,
                actorId: testUser._id.toString()
            }, { fencingToken: 0, isLockLost: () => false, validateOwnership: async () => true });
            assert.equal(manualResZero.success, false);
            assert.ok(manualResZero.error.includes('FENCING_CONTEXT_REQUIRED'));

            // 3. _reconcileWebhookStatusInternal without lockContext
            const webhookResNoLock = await WhatsAppService._reconcileWebhookStatusInternal({
                id: 'wamid.no_lock_wh.021',
                status: 'delivered',
                recipient_id: '919811100121',
                biz_opaque_callback_data: idKey
            }, null);
            assert.equal(webhookResNoLock.reconciled, false);
            assert.equal(webhookResNoLock.reason, 'FENCING_CONTEXT_REQUIRED');

            // 4. reconcileAmbiguousDispatch with non-existent dispatch fails closed
            await assert.rejects(
                async () => {
                    await WhatsAppService.reconcileAmbiguousDispatch('completely_non_existent_key_021', {
                        providerMessageId: 'wamid.ambig.021'
                    });
                },
                /DISPATCH_LEDGER_NOT_FOUND|DISTRIBUTED_RECONCILE_LOCK_UNAVAILABLE/
            );
        });

        it('22. Redis lease expires during MongoDB claim fails closed with DISTRIBUTED_LOCK_LOST and zero callback execution', async () => {
            const idKey = 'durable_timing_claim_expiry_022';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100122',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            let callbackExecuted = false;

            const res = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.claim_expiry.022',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Claim expiry test'
            }, {
                hooks: {
                    duringMongoClaim: async ({ lockKey: key, redisProxy: rProxy }) => {
                        // Simulate lease expiry or deletion in Redis while MongoDB claim is processing
                        await rProxy.del(key);
                        callbackExecuted = true;
                    }
                }
            });

            assert.equal(res.success, false);
            assert.ok(res.error.includes('DISTRIBUTED_LOCK_LOST'), `Expected DISTRIBUTED_LOCK_LOST, got: ${res.error}`);

            // Verify document was not mutated into DISPATCHED
            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
            assert.equal(doc.providerMessageId, undefined);
        });

        it('23. Worker A paused before CAS loses Redis lock; Worker B acquires lock and claims newer generation; Worker A resumes and is rejected', async () => {
            const idKey = 'durable_cross_worker_race_023';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100123',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 0
            });

            let workerBExecuted = false;

            // Worker A attempts reconciliation but pauses before MongoDB CAS
            const workerARes = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.workerA.023',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Worker A update'
            }, {
                hooks: {
                    beforeMongoCas: async ({ lockContext, dispatch }) => {
                        // While Worker A is paused, simulate lease expiry and Worker B in another process taking the lock:
                        // 1. Worker B takes the Redis lock with Worker B's token
                        await redisProxy.set(lockKey, 'token_worker_b_023');

                        // 2. Worker B claims generation in MongoDB:
                        const claimedB = await WhatsAppDispatch.findOneAndUpdate(
                            { idempotencyKey: idKey },
                            {
                                $inc: { reconcileGeneration: 1 },
                                $set: { reconcileLockWorkerId: 'token_worker_b_023', reconcileClaimedAt: new Date() }
                            },
                            { new: true }
                        );
                        assert.equal(claimedB.reconcileGeneration, 2, 'Worker B must claim generation 2');

                        // 3. Worker B executes business CAS write
                        const workerBLockContext = {
                            fencingToken: claimedB.reconcileGeneration,
                            lockToken: 'token_worker_b_023',
                            isLockLost: () => false,
                            validateOwnership: async () => true
                        };

                        const bRes = await WhatsAppService._manualReconcileDispatchInternal({
                            idempotencyKey: idKey,
                            targetStatus: 'DISPATCHED',
                            providerMessageId: 'wamid.workerB.023',
                            actorContext: testUser,
                            actorId: testUser._id.toString(),
                            reason: 'Worker B authoritative update'
                        }, workerBLockContext);

                        assert.equal(bRes.success, true, 'Worker B must succeed');
                        workerBExecuted = true;
                    }
                }
            });

            assert.equal(workerBExecuted, true);
            // Worker A must be rejected due to either Redis ownership loss or stale fencing generation
            assert.equal(workerARes.success, false);
            assert.ok(
                workerARes.error.includes('DISTRIBUTED_LOCK_LOST') || workerARes.error.includes('STALE_FENCING_GENERATION'),
                `Worker A must fail with DISTRIBUTED_LOCK_LOST or STALE_FENCING_GENERATION, got: ${workerARes.error}`
            );

            // Document must reflect Worker B's data, never Worker A's data
            const finalDoc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(finalDoc.status, 'DISPATCHED');
            assert.equal(finalDoc.providerMessageId, 'wamid.workerB.023');
            assert.equal(finalDoc.reconcileGeneration, 2);
            assert.equal(finalDoc.reconciliationReason, 'Worker B authoritative update');
        });

        it('24. Heartbeat failure during reconciliation marks lock lost and prevents subsequent protected writes', async () => {
            const idKey = 'durable_heartbeat_failure_024';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100124',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            const res = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.heartbeat.024',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Heartbeat test'
            }, {
                lockTtlSec: 15,
                heartbeatIntervalMs: 30, // rapid heartbeat for testing
                hooks: {
                    beforeMongoCas: async ({ lockContext }) => {
                        // Delete key so heartbeat renewal eval returns 0
                        await redisProxy.del(lockKey);
                        // Wait for heartbeat to run and detect failure
                        await new Promise(r => setTimeout(r, 60));
                    }
                }
            });

            assert.equal(res.success, false);
            assert.ok(res.error.includes('DISTRIBUTED_LOCK_LOST'), `Expected DISTRIBUTED_LOCK_LOST, got: ${res.error}`);

            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
            assert.equal(doc.providerMessageId, undefined);
        });

        it('25. Delayed asynchronous hook cannot bypass post-hook ownership revalidation', async () => {
            const idKey = 'durable_async_hook_bypass_025';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100125',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            const res = await WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.async_hook.025',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Async hook bypass test'
            }, {
                hooks: {
                    beforeMongoCas: async ({ lockContext }) => {
                        // Simulate an async operation during which lock is stolen or expired
                        await new Promise(r => setTimeout(r, 40));
                        await redisProxy.del(lockKey);
                    }
                }
            });

            assert.equal(res.success, false);
            assert.ok(res.error.includes('DISTRIBUTED_LOCK_LOST'), `Expected DISTRIBUTED_LOCK_LOST, got: ${res.error}`);

            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
            assert.equal(doc.providerMessageId, undefined);
        });

        it('26. Aborted task cannot perform protected write after lock wrapper has returned', async () => {
            const idKey = 'durable_aborted_wrapper_026';
            const lockKey = `lock:dispatch_reconcile:${idKey}`;

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient: '919811100126',
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            let savedLockContext = null;
            let resumeHook = null;
            const pausePromise = new Promise(resolve => { resumeHook = resolve; });

            // Start an operation that pauses inside beforeMongoCas
            const promiseA = WhatsAppService.manualReconcileDispatch({
                idempotencyKey: idKey,
                targetStatus: 'DISPATCHED',
                providerMessageId: 'wamid.aborted_wrapper.026',
                actorContext: testUser,
                actorId: testUser._id.toString(),
                reason: 'Aborted wrapper test'
            }, {
                heartbeatIntervalMs: 30,
                hooks: {
                    beforeMongoCas: async ({ lockContext }) => {
                        savedLockContext = lockContext;
                        // Delete key so heartbeat aborts the wrapper
                        await redisProxy.del(lockKey);
                        await pausePromise;
                    }
                }
            });

            // Wait for wrapper to abort and return
            const resA = await promiseA;
            assert.equal(resA.success, false);
            assert.ok(resA.error.includes('DISTRIBUTED_LOCK_LOST'));

            // Now resume the paused hook
            resumeHook();

            // Verify that after wrapper returned, lockContext reports wrapper not active
            assert.equal(savedLockContext.isWrapperActive(), false);
            assert.equal(savedLockContext.isLockLost(), true);
            const isOwner = await savedLockContext.validateOwnership();
            assert.equal(isOwner, false);

            await assert.rejects(
                async () => {
                    await savedLockContext.assertOwnership();
                },
                /DISTRIBUTED_LOCK_LOST/
            );

            // Document must remain un-mutated
            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'AMBIGUOUS_TIMEOUT');
            assert.equal(doc.providerMessageId, undefined);
        });

        it('27. Uncorrelated webhook (updateMany Call 1) does not overwrite already reconciled dispatch', async () => {
            const idKey = 'durable_ambiguous_updatemany1_027';
            const recipient = '919876543027';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            let operatorReconciled = false;

            // An uncorrelated webhook arrives (no opaque token, unmapped providerMessageId)
            const webhookRes = await WhatsAppService.reconcileWebhookStatus({
                id: 'wamid.uncorrelated_updatemany1_027',
                recipient_id: recipient,
                status: 'delivered',
                hooks: {
                    beforeAmbiguousUpdateMany: async () => {
                        // Concurrently, an operator reconciles the dispatch!
                        const opRes = await WhatsAppService.manualReconcileDispatch({
                            idempotencyKey: idKey,
                            targetStatus: 'DISPATCHED',
                            providerMessageId: 'wamid.operator_confirmed.027',
                            actorContext: testUser,
                            actorId: testUser._id.toString(),
                            reason: 'Operator verified delivery via portal'
                        });
                        assert.equal(opRes.success, true);
                        operatorReconciled = true;
                    }
                }
            });

            assert.equal(operatorReconciled, true);
            assert.equal(webhookRes.reconciled, false);
            assert.equal(webhookRes.reason, 'MANUAL_RECONCILIATION_REQUIRED');

            // Assert dispatch record in database preserves operator RECONCILED state
            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'DISPATCHED');
            assert.equal(doc.reconciliationStatus, 'RECONCILED');
            assert.equal(doc.reconciliationReason, 'Operator verified delivery via portal');
            assert.equal(doc.providerMessageId, 'wamid.operator_confirmed.027');
        });

        it('28. Unmapped opaque webhook (updateMany Call 2) does not overwrite already reconciled dispatch', async () => {
            const idKey = 'durable_ambiguous_updatemany2_028';
            const recipient = '919876543028';

            await WhatsAppDispatch.create({
                idempotencyKey: idKey,
                recipient,
                messageType: 'text',
                provider: 'META',
                status: 'AMBIGUOUS_TIMEOUT',
                isAmbiguous: true,
                reconcileGeneration: 1
            });

            let operatorReconciled = false;

            // Webhook arrives with unmapped opaque token and unmapped providerMessageId
            const lockContext = {
                fencingToken: 1,
                lockToken: 'token_028',
                isLockLost: () => false,
                validateOwnership: async () => true
            };
            const webhookRes = await WhatsAppService._reconcileWebhookStatusInternal({
                id: 'wamid.fallback_updatemany2_028',
                recipient_id: recipient,
                biz_opaque_callback_data: 'unmapped_opaque_token_028',
                status: 'delivered',
                hooks: {
                    beforeAmbiguousFallbackUpdateMany: async () => {
                        // Concurrently, an operator reconciles the dispatch as FAILED
                        const opRes = await WhatsAppService.manualReconcileDispatch({
                            idempotencyKey: idKey,
                            targetStatus: 'FAILED',
                            actorContext: testUser,
                            actorId: testUser._id.toString(),
                            reason: 'Operator confirmed permanent failure'
                        });
                        assert.equal(opRes.success, true);
                        operatorReconciled = true;
                    }
                }
            }, lockContext);

            assert.equal(operatorReconciled, true);
            assert.equal(webhookRes.reconciled, false);
            assert.equal(webhookRes.reason, 'MANUAL_RECONCILIATION_REQUIRED');

            // Assert dispatch record preserves operator RECONCILED state
            const doc = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.equal(doc.status, 'FAILED');
            assert.equal(doc.reconciliationStatus, 'RECONCILED');
            assert.equal(doc.reconciliationReason, 'Operator confirmed permanent failure');
        });
    });
});
