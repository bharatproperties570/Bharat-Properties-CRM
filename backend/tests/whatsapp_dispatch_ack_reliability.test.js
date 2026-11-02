process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import WhatsAppService from '../services/WhatsAppService.js';
import WhatsAppCircuitBreaker, { TRIP_THRESHOLDS, LUA_SCRIPTS } from '../services/WhatsAppCircuitBreaker.js';
import BaileysConnectionManager, {
    handleMessagesUpdate,
    handleMessageReceiptUpdate,
    DELIVERY_TRANSITION_MATRIX,
    PROTECTED_TERMINAL_STATES
} from '../services/baileysQueue/BaileysConnectionManager.js';
import redisProxy, { redisOptions } from '../src/config/redis.js';
import Redis from 'ioredis';

describe('Phase C & 3 — Outbound Dispatch, Monotonic State & Durable Circuit Breaker Suite', () => {
    let mongoServer;
    const testIntegrationId = new mongoose.Types.ObjectId();
    const testIntegrationId2 = new mongoose.Types.ObjectId();

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);
    });

    after(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    beforeEach(async () => {
        await WhatsAppDispatch.deleteMany({});
        await MarketingDelivery.deleteMany({});
        await WhatsAppIntegration.deleteMany({});
        await WhatsAppCircuitBreaker.reset(testIntegrationId.toString(), 'TEST_RUNNER', 'Reset before test');
        await WhatsAppCircuitBreaker.reset(testIntegrationId2.toString(), 'TEST_RUNNER', 'Reset before test');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 1: ACTUAL SOCKET EVENT HANDLERS & DELIVERY TRANSITION MATRIX (P0-B & P1-A)
    // ─────────────────────────────────────────────────────────────────────────

    it('1. Actual socket EventEmitter listener path: messages.update with SERVER_ACK (status 2)', async () => {
        const msgId = '3EB0_EMIT_SERVER_ACK';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_ack_1',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_ack_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        assert.equal(mockSock.ev.listenerCount('messages.update'), 1);
        assert.equal(mockSock.ev.listenerCount('message-receipt.update'), 1);

        // Exercise the actual socket EventEmitter listener path
        mockSock.ev.emit('messages.update', [
            { key: { id: msgId }, update: { status: 2 } }
        ]);
        // Await the asynchronous handler promise populated on the socket
        await mockSock._lastMessagesUpdatePromise;

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'SERVER_ACKNOWLEDGED');
        assert.ok(md.serverAckAt);
        assert.equal(wd.status, 'SERVER_ACKNOWLEDGED');
        assert.equal(wd.deliveryStatus, 'SERVER_ACKNOWLEDGED');
        assert.ok(wd.deliveryStatusAt);
    });

    it('2. Actual socket EventEmitter listener path: messages.update with DELIVERY_ACK (status 3)', async () => {
        const msgId = '3EB0_EMIT_DELIVERY_ACK';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_ack_2',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'SERVER_ACKNOWLEDGED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_ack_2',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'SERVER_ACKNOWLEDGED',
            deliveryStatus: 'SERVER_ACKNOWLEDGED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
        await mockSock._lastMessagesUpdatePromise;

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'DELIVERY_CONFIRMED');
        assert.ok(md.deliveryReceiptAt);
        assert.equal(wd.status, 'DELIVERY_CONFIRMED');
        assert.equal(wd.deliveryStatus, 'DELIVERY_CONFIRMED');
    });

    it('3. Actual socket EventEmitter listener path: messages.update with READ (status 4)', async () => {
        const msgId = '3EB0_EMIT_READ';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_ack_3',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'DELIVERY_CONFIRMED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_ack_3',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DELIVERY_CONFIRMED',
            deliveryStatus: 'DELIVERY_CONFIRMED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 4 } }]);
        await mockSock._lastMessagesUpdatePromise;

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'READ');
        assert.ok(md.readAt);
        assert.equal(wd.status, 'READ');
        assert.equal(wd.deliveryStatus, 'READ');
    });

    it('4. Actual socket EventEmitter listener path: message-receipt.update with receiptTimestamp establishes DELIVERY_CONFIRMED and NOT READ', async () => {
        const msgId = '3EB0_EMIT_RECEIPT_TS';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_rcpt_1',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_rcpt_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        mockSock.ev.emit('message-receipt.update', [
            { key: { id: msgId }, receipt: { receiptTimestamp: Math.floor(Date.now() / 1000) } }
        ]);
        await mockSock._lastMessageReceiptPromise;

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'DELIVERY_CONFIRMED', 'receiptTimestamp must establish DELIVERY_CONFIRMED');
        assert.equal(md.readAt, undefined, 'readAt must remain unset');
        assert.equal(wd.status, 'DELIVERY_CONFIRMED');
        assert.equal(wd.deliveryStatus, 'DELIVERY_CONFIRMED');
    });

    it('5. Actual socket EventEmitter listener path: message-receipt.update with readTimestamp establishes READ', async () => {
        const msgId = '3EB0_EMIT_READ_TS';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_rcpt_2',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'DELIVERY_CONFIRMED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_rcpt_2',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DELIVERY_CONFIRMED',
            deliveryStatus: 'DELIVERY_CONFIRMED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        mockSock.ev.emit('message-receipt.update', [
            { key: { id: msgId }, receipt: { readTimestamp: Math.floor(Date.now() / 1000) } }
        ]);
        await mockSock._lastMessageReceiptPromise;

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'READ');
        assert.ok(md.readAt);
        assert.equal(wd.status, 'READ');
        assert.equal(wd.deliveryStatus, 'READ');
    });

    it('6. Monotonic Non-Regression: Delayed SERVER_ACK and DELIVERY_ACK arriving after READ do NOT regress state', async () => {
        const msgId = '3EB0_TEST_MONOTONIC_REGRESSION';
        const intId = testIntegrationId.toString();
        const initialReadAt = new Date(Date.now() - 5000);

        await MarketingDelivery.create({
            jobId: 'camp_mon_1',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'READ',
            provider: 'BAILEYS',
            providerMessageId: msgId,
            readAt: initialReadAt
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_mon_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'READ',
            deliveryStatus: 'READ',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        // 1. Delayed SERVER_ACK (status 2) arrives
        mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 2 } }]);
        await mockSock._lastMessagesUpdatePromise;

        let md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        let wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery must NOT regress to SERVER_ACKNOWLEDGED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch must NOT regress to SERVER_ACKNOWLEDGED');

        // 2. Delayed DELIVERY_ACK (status 3) arrives
        mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
        await mockSock._lastMessagesUpdatePromise;

        md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery must NOT regress to DELIVERY_CONFIRMED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch must NOT regress to DELIVERY_CONFIRMED');
    });

    it('7. Protected Terminal State Preservation (P0-B & P1-A): Delayed ACKs NEVER overwrite terminal states', async () => {
        const intId = testIntegrationId.toString();

        const terminalStatusesMD = ['FAILED_CONFIRMED', 'FAILED_FINAL', 'MANUAL_REVIEW', 'SUPPRESSED_OPTOUT'];
        const terminalStatusesWD = ['FAILED_CONFIRMED', 'MANUAL_REVIEW'];

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        // Seed documents with each protected terminal state
        for (let i = 0; i < terminalStatusesMD.length; i++) {
            const status = terminalStatusesMD[i];
            const msgId = `3EB0_TERM_MD_${status}`;
            await MarketingDelivery.create({
                jobId: `camp_term_${i}`,
                recipientId: `91987654321${i}`,
                channel: 'whatsapp',
                status,
                provider: 'BAILEYS',
                providerMessageId: msgId
            });

            // Fire SERVER_ACK, DELIVERY_ACK, READ, receiptTimestamp, readTimestamp
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 2 } }]);
            await mockSock._lastMessagesUpdatePromise;
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
            await mockSock._lastMessagesUpdatePromise;
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 4 } }]);
            await mockSock._lastMessagesUpdatePromise;
            mockSock.ev.emit('message-receipt.update', [{ key: { id: msgId }, receipt: { receiptTimestamp: 100 } }]);
            await mockSock._lastMessageReceiptPromise;
            mockSock.ev.emit('message-receipt.update', [{ key: { id: msgId }, receipt: { readTimestamp: 200 } }]);
            await mockSock._lastMessageReceiptPromise;

            const doc = await MarketingDelivery.findOne({ providerMessageId: msgId });
            assert.equal(doc.status, status, `MarketingDelivery in protected terminal state ${status} must NEVER be mutated`);
        }

        for (let i = 0; i < terminalStatusesWD.length; i++) {
            const status = terminalStatusesWD[i];
            const msgId = `3EB0_TERM_WD_${status}`;
            await WhatsAppDispatch.create({
                idempotencyKey: `idemp_term_${i}`,
                recipient: `91987654322${i}`,
                channel: 'WHATSAPP',
                provider: 'BAILEYS',
                status,
                deliveryStatus: status,
                providerMessageId: msgId
            });

            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 2 } }]);
            await mockSock._lastMessagesUpdatePromise;
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
            await mockSock._lastMessagesUpdatePromise;
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 4 } }]);
            await mockSock._lastMessagesUpdatePromise;

            const doc = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
            assert.equal(doc.status, status, `WhatsAppDispatch in protected terminal state ${status} must NEVER be mutated`);
        }
    });

    it('8. Positive Reconciliation (P0-B): Ambiguous and retryable statuses reconcile on real provider events', async () => {
        const intId = testIntegrationId.toString();
        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        const ambigMD = ['DELIVERY_UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED_RETRYABLE'];
        for (let i = 0; i < ambigMD.length; i++) {
            const status = ambigMD[i];
            const msgId = `3EB0_AMBIG_MD_${status}`;
            await MarketingDelivery.create({
                jobId: `camp_ambig_${i}`,
                recipientId: `91987654333${i}`,
                channel: 'whatsapp',
                status,
                provider: 'BAILEYS',
                providerMessageId: msgId
            });

            // Delivery ACK arrives from provider
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
            await mockSock._lastMessagesUpdatePromise;

            const doc = await MarketingDelivery.findOne({ providerMessageId: msgId });
            assert.equal(doc.status, 'DELIVERY_CONFIRMED', `Ambiguous status ${status} must positively reconcile to DELIVERY_CONFIRMED on real provider ACK`);
            assert.ok(doc.deliveryReceiptAt);
        }

        const ambigWD = ['AMBIGUOUS_TIMEOUT', 'DELIVERY_UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED'];
        for (let i = 0; i < ambigWD.length; i++) {
            const status = ambigWD[i];
            const msgId = `3EB0_AMBIG_WD_${status}`;
            await WhatsAppDispatch.create({
                idempotencyKey: `idemp_ambig_${i}`,
                recipient: `91987654334${i}`,
                channel: 'WHATSAPP',
                provider: 'BAILEYS',
                status,
                deliveryStatus: status,
                providerMessageId: msgId
            });

            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 3 } }]);
            await mockSock._lastMessagesUpdatePromise;

            const doc = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
            assert.equal(doc.status, 'DELIVERY_CONFIRMED', `Ambiguous dispatch status ${status} must positively reconcile to DELIVERY_CONFIRMED`);
        }
    });

    it('9. Failure Injection Resilience (P1-A): Injected write failure in MarketingDelivery leaves WhatsAppDispatch intact', async () => {
        const msgId = '3EB0_INJECT_FAIL_MD';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_inj_1',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_inj_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        // Inject genuine failure into MarketingDelivery.updateMany
        const originalUpdateMany = MarketingDelivery.updateMany;
        MarketingDelivery.updateMany = () => {
            throw new Error('SIMULATED_MONGO_DISK_FULL_EXCEPTION');
        };

        try {
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 2 } }]);
            await mockSock._lastMessagesUpdatePromise;

            // WhatsAppDispatch must still be updated successfully despite MarketingDelivery failure
            const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
            assert.equal(wd.status, 'SERVER_ACKNOWLEDGED', 'WhatsAppDispatch must update successfully despite MarketingDelivery failure');
        } finally {
            MarketingDelivery.updateMany = originalUpdateMany;
        }
    });

    it('10. Failure Injection Resilience (P1-A): Injected write failure in WhatsAppDispatch leaves MarketingDelivery intact', async () => {
        const msgId = '3EB0_INJECT_FAIL_WD';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_inj_2',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_inj_2',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        const originalUpdateMany = WhatsAppDispatch.updateMany;
        WhatsAppDispatch.updateMany = () => {
            throw new Error('SIMULATED_MONGO_CLUSTER_UNAVAILABLE');
        };

        try {
            mockSock.ev.emit('messages.update', [{ key: { id: msgId }, update: { status: 2 } }]);
            await mockSock._lastMessagesUpdatePromise;

            const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
            assert.equal(md.status, 'SERVER_ACKNOWLEDGED', 'MarketingDelivery must update successfully despite WhatsAppDispatch failure');
        } finally {
            WhatsAppDispatch.updateMany = originalUpdateMany;
        }
    });

    it('11. Concurrent receipt events and duplicate events: Monotonicity and idempotency are preserved', async () => {
        const msgId = '3EB0_CONCURRENT_TEST';
        const intId = testIntegrationId.toString();

        await MarketingDelivery.create({
            jobId: 'camp_conc_1',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_conc_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);

        // Fire concurrent duplicate events in arbitrary order
        await Promise.all([
            handleMessagesUpdate([{ key: { id: msgId }, update: { status: 2 } }], intId),
            handleMessagesUpdate([{ key: { id: msgId }, update: { status: 3 } }], intId),
            handleMessageReceiptUpdate([{ key: { id: msgId }, receipt: { receiptTimestamp: 100 } }], intId),
            handleMessagesUpdate([{ key: { id: msgId }, update: { status: 4 } }], intId),
            handleMessagesUpdate([{ key: { id: msgId }, update: { status: 2 } }], intId) // duplicate delayed ack
        ]);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'READ', 'Final status must be READ');
        assert.equal(wd.status, 'READ', 'Final status must be READ');
    });

    it('12. Unknown message ID: Events for non-existent messages execute gracefully without throwing', async () => {
        const intId = testIntegrationId.toString();
        await handleMessagesUpdate([{ key: { id: 'NON_EXISTENT_MSG_123' }, update: { status: 2 } }], intId);
        await handleMessageReceiptUpdate([{ key: { id: 'NON_EXISTENT_MSG_456' }, receipt: { readTimestamp: 100 } }], intId);
        assert.ok(true, 'Unknown message ID handled without error');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 2: TRULY ATOMIC CIRCUIT BREAKER & CONCURRENCY INVARIANTS (P0-A, P1-A, P1-C)
    // ─────────────────────────────────────────────────────────────────────────

    it('13. HALF_OPEN probe reservation: Atomic script acquires lock and sets state', async () => {
        const intId = testIntegrationId.toString();

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-1' });
        assert.equal(probeRes.state, 'HALF_OPEN');
        assert.equal(probeRes.isProbe, true);
        assert.equal(probeRes.probeToken, 'probe-worker-1');

        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        const activeLock = await redisProxy.get(`cb:wa:${intId}:probe_lock`);
        assert.equal(storedState, 'HALF_OPEN');
        assert.equal(activeLock, 'probe-worker-1');
    });

    it('14. HALF_OPEN probe success: Transitions breaker from HALF_OPEN to CLOSED and clears counters', async () => {
        const intId = testIntegrationId.toString();

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-1' });
        assert.equal(probeRes.state, 'HALF_OPEN');

        const successRes = await WhatsAppCircuitBreaker.recordSuccess(intId, 'probe-worker-1');
        assert.equal(successRes.success, true);
        assert.equal(successRes.state, 'CLOSED');

        const stateNow = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(stateNow.tripped, false);
        assert.equal(stateNow.state, 'CLOSED');
    });

    it('15. HALF_OPEN probe failure: Transitions back to OPEN with fresh cool-off period', async () => {
        const intId = testIntegrationId.toString();

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-2' });
        assert.equal(probeRes.state, 'HALF_OPEN');

        const failRes = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'probe-worker-2', 'Socket connection reset');
        assert.equal(failRes.tripped, true);
        assert.equal(failRes.state, 'OPEN');

        const check = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(check.tripped, true);
        assert.equal(check.state, 'OPEN');
        assert.ok(check.remainingCooloffSec > 0);
    });

    it('16. Probe lock expiry & worker crash recovery (P0-A): Recovers safely and avoids permanent deadlock', async () => {
        const intId = testIntegrationId.toString();

        // Breaker in HALF_OPEN, but worker crashed and probe_lock expired in Redis
        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.del(`cb:wa:${intId}:probe_lock`); // Expired lease

        const res = await WhatsAppCircuitBreaker.isTripped(intId);

        // MUST NOT be stuck in HALF_OPEN! Must detect expired lease and recover to OPEN with fresh cooloff
        assert.equal(res.tripped, true);
        assert.equal(res.state, 'OPEN');
        assert.ok(res.reason.includes('expired') || res.reason.includes('cooloff'));

        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(storedState, 'OPEN', 'Breaker must have been reset to OPEN from expired HALF_OPEN');
    });

    it('17. Strict Token Ownership (P0-A & P1-A): Missing probe token cannot mutate HALF_OPEN state', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-active');

        // Missing/empty probe token
        const resNull = await WhatsAppCircuitBreaker.recordProbeSuccess(intId, null);
        assert.equal(resNull.success, false);
        assert.equal(resNull.error, 'MISSING_PROBE_TOKEN');

        const resEmpty = await WhatsAppCircuitBreaker.recordProbeSuccess(intId, '');
        assert.equal(resEmpty.success, false);
        assert.equal(resEmpty.error, 'MISSING_PROBE_TOKEN');

        // State must remain HALF_OPEN
        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(storedState, 'HALF_OPEN');
    });

    it('18. Strict Token Ownership (P0-A & P1-A): Stale probe owner cannot overwrite active probe', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-active-2');

        const staleRes = await WhatsAppCircuitBreaker.recordProbeSuccess(intId, 'worker-stale-1');
        assert.equal(staleRes.success, false);
        assert.equal(staleRes.error, 'STALE_PROBE_OWNER');

        const activeLock = await redisProxy.get(`cb:wa:${intId}:probe_lock`);
        assert.equal(activeLock, 'worker-active-2');

        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(storedState, 'HALF_OPEN');
    });

    it('19. Strict Token Ownership (P0-A & P1-A): Expired lease cannot mutate state to CLOSED', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.del(`cb:wa:${intId}:probe_lock`); // Lease expired

        const res = await WhatsAppCircuitBreaker.recordProbeSuccess(intId, 'worker-previous');
        assert.equal(res.success, false);
        assert.equal(res.error, 'EXPIRED_PROBE_LEASE');

        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.notEqual(storedState, 'CLOSED', 'State must NEVER become CLOSED when lease is expired');
    });

    it('19b. Strict Token Ownership (P0-B): Missing probe token cannot mutate HALF_OPEN on recordProbeFailure', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-active-probe');
        await redisProxy.set(`cb:wa:${intId}:reason`, 'Prior trip reason');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, '123456');

        // Missing/null probe token
        const resNull = await WhatsAppCircuitBreaker.recordProbeFailure(intId, null, 'Some failure');
        assert.equal(resNull.success, false);
        assert.equal(resNull.error, 'MISSING_PROBE_TOKEN');

        // Empty probe token
        const resEmpty = await WhatsAppCircuitBreaker.recordProbeFailure(intId, '', 'Some failure');
        assert.equal(resEmpty.success, false);
        assert.equal(resEmpty.error, 'MISSING_PROBE_TOKEN');

        // State, reason, tripped_at, probe_lock must remain untouched
        assert.equal(await redisProxy.get(`cb:wa:${intId}:state`), 'HALF_OPEN');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:probe_lock`), 'worker-active-probe');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:reason`), 'Prior trip reason');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:tripped_at`), '123456');
    });

    it('19c. Strict Token Ownership (P0-B): Stale probe owner cannot trigger failure reset on active probe', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-active-probe-2');
        await redisProxy.set(`cb:wa:${intId}:reason`, 'Prior trip reason');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, '123456');

        const staleRes = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'worker-stale-token', 'Stale failure');
        assert.equal(staleRes.success, false);
        assert.equal(staleRes.error, 'STALE_PROBE_OWNER');

        // State, reason, tripped_at, probe_lock must remain untouched
        assert.equal(await redisProxy.get(`cb:wa:${intId}:state`), 'HALF_OPEN');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:probe_lock`), 'worker-active-probe-2');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:reason`), 'Prior trip reason');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:tripped_at`), '123456');
    });

    it('19d. Strict Token Ownership (P0-B): Expired lease cannot trigger failure reset on recordProbeFailure', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.del(`cb:wa:${intId}:probe_lock`); // Expired lease
        await redisProxy.set(`cb:wa:${intId}:reason`, 'Prior trip reason');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, '123456');

        const res = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'worker-previous-token', 'Failure after lease expired');
        assert.equal(res.success, false);
        assert.equal(res.error, 'EXPIRED_PROBE_LEASE');

        // State, reason, tripped_at must remain untouched
        assert.equal(await redisProxy.get(`cb:wa:${intId}:state`), 'HALF_OPEN');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:reason`), 'Prior trip reason');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:tripped_at`), '123456');
    });

    it('19e. Real Redis PX TTL lease expiration (Item 3): Expired probe lease via Redis TTL rejects stale token and preserves breaker state', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:reason`, 'Initial trip reason');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, '123456');

        // Set probe lock with real short TTL (200ms)
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-token-px-expire', 'PX', 200);

        // Confirm key exists initially
        const initialLock = await redisProxy.get(`cb:wa:${intId}:probe_lock`);
        assert.equal(initialLock, 'worker-token-px-expire');

        // Wait for Redis to expire key naturally (350ms > 200ms)
        await new Promise(resolve => setTimeout(resolve, 350));

        // Confirm key is absent without calling DEL
        const expiredLock = await redisProxy.get(`cb:wa:${intId}:probe_lock`);
        assert.equal(expiredLock, null, 'Probe lock key must expire naturally via PX TTL without DEL');

        // Attempt to record failure with old/expired token
        const res = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'worker-token-px-expire', 'Failure after TTL expiration');
        assert.equal(res.success, false);
        assert.equal(res.error, 'EXPIRED_PROBE_LEASE');

        // Verify state, reason, and tripped_at remain untouched
        assert.equal(await redisProxy.get(`cb:wa:${intId}:state`), 'HALF_OPEN');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:reason`), 'Initial trip reason');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:tripped_at`), '123456');

        // Verify that a newer owner lock cannot be mutated by the stale expired worker
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'newer-active-worker-token', 'PX', 5000);
        const staleRes = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'worker-token-px-expire', 'Stale failure against new owner');
        assert.equal(staleRes.success, false);
        assert.equal(staleRes.error, 'STALE_PROBE_OWNER');

        assert.equal(await redisProxy.get(`cb:wa:${intId}:probe_lock`), 'newer-active-worker-token');
        assert.equal(await redisProxy.get(`cb:wa:${intId}:state`), 'HALF_OPEN');
    });

    it('20. Concurrent probe reservation race (Deterministic Invariant): Exactly ONE worker reserves probe', async () => {
        const intId = testIntegrationId.toString();

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        // Concurrently invoke isTripped for worker A and worker B
        const [resA, resB] = await Promise.all([
            WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'token-A' }),
            WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'token-B' })
        ]);

        const probeCount = (resA.isProbe ? 1 : 0) + (resB.isProbe ? 1 : 0);
        assert.equal(probeCount, 1, 'Deterministic invariant: Exactly ONE worker must be granted probe reservation');

        if (resA.isProbe) {
            assert.equal(resA.state, 'HALF_OPEN');
            assert.equal(resA.probeToken, 'token-A');
            assert.equal(resB.tripped, true);
            assert.equal(resB.probeInFlight, true);
        } else {
            assert.equal(resB.state, 'HALF_OPEN');
            assert.equal(resB.probeToken, 'token-B');
            assert.equal(resA.tripped, true);
            assert.equal(resA.probeInFlight, true);
        }
    });

    it('20b. Independent Redis-client Concurrency (Item 4): Two distinct network clients race to reserve probe', async () => {
        const intId = testIntegrationId.toString();
        const stateKey = `cb:wa:${intId}:state`;
        const reasonKey = `cb:wa:${intId}:reason`;
        const trippedAtKey = `cb:wa:${intId}:tripped_at`;
        const probeLockKey = `cb:wa:${intId}:probe_lock`;
        const timeoutsKey = `cb:wa:${intId}:timeouts`;
        const authFailuresKey = `cb:wa:${intId}:auth_failures`;
        const disconnectsKey = `cb:wa:${intId}:disconnects`;

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        const cooloffMs = 300000;
        const probeTtlSec = 120;
        const now = Date.now();

        if (!redisProxy.isMock) {
            // Real Redis is available: test with two distinct ioredis network clients
            const client1 = new Redis({ ...redisOptions, maxRetriesPerRequest: 1, retryStrategy: () => null });
            const client2 = new Redis({ ...redisOptions, maxRetriesPerRequest: 1, retryStrategy: () => null });

            try {
                await client1.set(stateKey, 'OPEN');
                await client1.set(trippedAtKey, String(pastTrippedAt));
                await client1.del(probeLockKey);

                // Concurrently execute atomic Lua reservation across both independent network connections
                const [rawA, rawB] = await Promise.all([
                    client1.eval(LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, 'token-client-1', cooloffMs, probeTtlSec, now, ''),
                    client2.eval(LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, 'token-client-2', cooloffMs, probeTtlSec, now, '')
                ]);

                const resA = JSON.parse(rawA);
                const resB = JSON.parse(rawB);

                const probeCount = (resA.isProbe ? 1 : 0) + (resB.isProbe ? 1 : 0);
                assert.equal(probeCount, 1, 'Deterministic invariant: Exactly ONE worker must be granted probe reservation across distinct network clients');

                const loserClient = resA.isProbe ? client2 : client1;
                const winnerClient = resA.isProbe ? client1 : client2;
                const winnerToken = resA.isProbe ? 'token-client-1' : 'token-client-2';
                const loserToken = resA.isProbe ? 'token-client-2' : 'token-client-1';

                // Assert active owner token in Redis matches winner token and was not mutated by losing client
                const activeOwner = await client1.get(probeLockKey);
                assert.equal(activeOwner, winnerToken);

                // Subsequent probe failure attempt from second client with losing token is rejected as STALE_PROBE_OWNER
                const loserFailRaw = await loserClient.eval(LUA_SCRIPTS.RECORD_PROBE_FAILURE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, loserToken, 'Losing client failure', Date.now());
                const loserFailRes = JSON.parse(loserFailRaw);
                assert.equal(loserFailRes.success, false);
                assert.equal(loserFailRes.error, 'STALE_PROBE_OWNER');

                // Subsequent probe success attempt from second client with losing token is rejected as STALE_PROBE_OWNER
                const loserSuccessRaw = await loserClient.eval(LUA_SCRIPTS.RECORD_PROBE_SUCCESS, 7, stateKey, reasonKey, trippedAtKey, probeLockKey, timeoutsKey, authFailuresKey, disconnectsKey, loserToken);
                const loserSuccessRes = JSON.parse(loserSuccessRaw);
                assert.equal(loserSuccessRes.success, false);
                assert.equal(loserSuccessRes.error, 'STALE_PROBE_OWNER');

                // Active owner and HALF_OPEN state still untouched
                assert.equal(await client1.get(probeLockKey), winnerToken);
                assert.equal(await client1.get(stateKey), 'HALF_OPEN');

                // Winner client completes probe successfully -> CLOSED
                const winnerSuccessRaw = await winnerClient.eval(LUA_SCRIPTS.RECORD_PROBE_SUCCESS, 7, stateKey, reasonKey, trippedAtKey, probeLockKey, timeoutsKey, authFailuresKey, disconnectsKey, winnerToken);
                const winnerSuccessRes = JSON.parse(winnerSuccessRaw);
                assert.equal(winnerSuccessRes.success, true);
                assert.equal(winnerSuccessRes.state, 'CLOSED');
                assert.equal(await client1.get(stateKey), 'CLOSED');
            } finally {
                await Promise.allSettled([
                    client1.quit().catch(() => client1.disconnect()),
                    client2.quit().catch(() => client2.disconnect())
                ]);
            }
        } else {
            // Local dev fallback when Redis service is not provisioned on port 6379
            if (process.env.CI) {
                assert.fail('In CI environment, real Redis service must be provisioned and isMock must be false');
            }
            await redisProxy.set(stateKey, 'OPEN');
            await redisProxy.set(trippedAtKey, String(pastTrippedAt));
            await redisProxy.del(probeLockKey);

            const [rawA, rawB] = await Promise.all([
                redisProxy.eval(LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, 'token-client-1', cooloffMs, probeTtlSec, now, ''),
                redisProxy.eval(LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, 'token-client-2', cooloffMs, probeTtlSec, now, '')
            ]);

            const resA = JSON.parse(rawA);
            const resB = JSON.parse(rawB);
            const probeCount = (resA.isProbe ? 1 : 0) + (resB.isProbe ? 1 : 0);
            assert.equal(probeCount, 1, 'Exactly ONE worker must be granted probe reservation');

            const winnerToken = resA.isProbe ? 'token-client-1' : 'token-client-2';
            const loserToken = resA.isProbe ? 'token-client-2' : 'token-client-1';

            assert.equal(await redisProxy.get(probeLockKey), winnerToken);

            const loserFailRaw = await redisProxy.eval(LUA_SCRIPTS.RECORD_PROBE_FAILURE, 4, stateKey, reasonKey, trippedAtKey, probeLockKey, loserToken, 'Losing client failure', Date.now());
            const loserFailRes = JSON.parse(loserFailRaw);
            assert.equal(loserFailRes.success, false);
            assert.equal(loserFailRes.error, 'STALE_PROBE_OWNER');

            const loserSuccessRaw = await redisProxy.eval(LUA_SCRIPTS.RECORD_PROBE_SUCCESS, 7, stateKey, reasonKey, trippedAtKey, probeLockKey, timeoutsKey, authFailuresKey, disconnectsKey, loserToken);
            const loserSuccessRes = JSON.parse(loserSuccessRaw);
            assert.equal(loserSuccessRes.success, false);
            assert.equal(loserSuccessRes.error, 'STALE_PROBE_OWNER');

            assert.equal(await redisProxy.get(probeLockKey), winnerToken);
            assert.equal(await redisProxy.get(stateKey), 'HALF_OPEN');

            const winnerSuccessRaw = await redisProxy.eval(LUA_SCRIPTS.RECORD_PROBE_SUCCESS, 7, stateKey, reasonKey, trippedAtKey, probeLockKey, timeoutsKey, authFailuresKey, disconnectsKey, winnerToken);
            const winnerSuccessRes = JSON.parse(winnerSuccessRaw);
            assert.equal(winnerSuccessRes.success, true);
            assert.equal(winnerSuccessRes.state, 'CLOSED');
        }
    });

    it('21. Failure Counter Rolling TTL & Threshold Atomicity (P1-C): 3 timeouts trip breaker atomically', async () => {
        const intId = testIntegrationId.toString();

        const res1 = await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        assert.equal(res1.count, 1);
        assert.equal(res1.tripped, false);

        const res2 = await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        assert.equal(res2.count, 2);
        assert.equal(res2.tripped, false);

        const res3 = await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        assert.equal(res3.count, 3);
        assert.equal(res3.tripped, true);

        const health = await WhatsAppCircuitBreaker.getHealth(intId);
        assert.equal(health.state, 'OPEN');
        assert.equal(health.consecutiveTimeouts, 3);
        assert.ok(health.trippedAt);
    });

    it('22. Dispatch success clears consecutive failure counters (P1-C)', async () => {
        const intId = testIntegrationId.toString();

        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);

        let health = await WhatsAppCircuitBreaker.getHealth(intId);
        assert.equal(health.consecutiveTimeouts, 2);

        // Success resets failure counters
        await WhatsAppCircuitBreaker.recordSuccess(intId);

        health = await WhatsAppCircuitBreaker.getHealth(intId);
        assert.equal(health.consecutiveTimeouts, 0);
        assert.equal(health.state, 'CLOSED');
    });

    it('23. Redis outage during recordSuccess: Error is observable and NOT silently swallowed', async () => {
        const intId = testIntegrationId.toString();

        const origEval = redisProxy.eval;
        const origDel = redisProxy.del;

        redisProxy.eval = () => {
            throw new Error('REDIS_CONNECTION_REFUSED');
        };
        redisProxy.del = () => {
            throw new Error('REDIS_CONNECTION_REFUSED');
        };

        try {
            await assert.rejects(
                async () => {
                    await WhatsAppCircuitBreaker.recordSuccess(intId);
                },
                (err) => {
                    assert.ok(err.message.includes('REDIS_CONNECTION_REFUSED'));
                    return true;
                }
            );
        } finally {
            redisProxy.eval = origEval;
            redisProxy.del = origDel;
        }
    });

    it('24. Integration Isolation: Circuit breaker trip on Integration A does NOT affect Integration B', async () => {
        const intA = testIntegrationId.toString();
        const intB = testIntegrationId2.toString();

        await WhatsAppCircuitBreaker.recordAckTimeout(intA);
        await WhatsAppCircuitBreaker.recordAckTimeout(intA);
        await WhatsAppCircuitBreaker.recordAckTimeout(intA);

        const stateA = await WhatsAppCircuitBreaker.isTripped(intA);
        const stateB = await WhatsAppCircuitBreaker.isTripped(intB);

        assert.equal(stateA.tripped, true, 'Integration A must be TRIPPED');
        assert.equal(stateA.state, 'OPEN');
        assert.equal(stateB.tripped, false, 'Integration B must remain CLOSED');
        assert.equal(stateB.state, 'CLOSED');
    });

    it('25. Service instance recreation: Independent breaker instance reads state reliably from Redis', async () => {
        const intId = testIntegrationId.toString();

        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);

        const stored = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(stored, 'OPEN', 'State must persist in Redis across process instances');

        const state = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state.tripped, true);
    });

    it('26. CI / Provisioned Redis Verification (P0-C & Item 5): Comprehensive real Redis validation', async () => {
        if (process.env.CI || !redisProxy.isMock) {
            // 1. Assert real Redis client (not MockRedis)
            assert.strictEqual(redisProxy.isMock, false, 'In CI environment, real Redis service must be provisioned and isMock must be false');

            // 2. Assert responds to PING with PONG
            const pingRes = await redisProxy.ping();
            assert.strictEqual(pingRes, 'PONG', 'Real Redis must respond to PING with PONG');

            // 3. Assert atomic Lua script execution produces valid JSON on real Redis
            const intId = new mongoose.Types.ObjectId().toString();
            const rawJson = await redisProxy.eval(
                LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE,
                4,
                `cb:wa:${intId}:state`,
                `cb:wa:${intId}:reason`,
                `cb:wa:${intId}:tripped_at`,
                `cb:wa:${intId}:probe_lock`,
                'ci-worker-token',
                300000,
                120,
                Date.now(),
                ''
            );
            assert.ok(typeof rawJson === 'string', 'Lua script must return JSON string on real Redis');
            const parsed = JSON.parse(rawJson);
            assert.strictEqual(parsed.state, 'CLOSED', 'Default uninitialized state in real Redis must return CLOSED');

            // 4. Assert real Redis key expiration behaves as expected under TTL
            const ttlTestKey = `test:ttl:${Date.now()}`;
            await redisProxy.set(ttlTestKey, 'ttl-val', 'PX', 150);
            assert.strictEqual(await redisProxy.get(ttlTestKey), 'ttl-val');
            await new Promise(resolve => setTimeout(resolve, 250));
            assert.strictEqual(await redisProxy.get(ttlTestKey), null, 'Real Redis key must expire naturally under TTL');

            // 5. Assert multi-client shared state across independent connections
            const c1 = new Redis({ ...redisOptions, maxRetriesPerRequest: 1, retryStrategy: () => null });
            const c2 = new Redis({ ...redisOptions, maxRetriesPerRequest: 1, retryStrategy: () => null });
            try {
                const sharedKey = `test:shared:${Date.now()}`;
                await c1.set(sharedKey, 'hello-from-client-1');
                const readByC2 = await c2.get(sharedKey);
                assert.strictEqual(readByC2, 'hello-from-client-1', 'Independent connection c2 must read write from c1');
                await c1.del(sharedKey);
            } finally {
                await Promise.allSettled([
                    c1.quit().catch(() => c1.disconnect()),
                    c2.quit().catch(() => c2.disconnect())
                ]);
            }
        } else {
            console.log('ℹ️ Local environment without real Redis: Real Redis CI assertions deferred to CI runner.');
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 6: P1 DUPLICATE-SEND PREVENTION: SOCKET DISCONNECT AFTER WRITE (SCENARIOS A - F)
    // ─────────────────────────────────────────────────────────────────────────

    it('27. Scenario A: Socket closes after first send invocation — suppresses retry and returns DELIVERY_UNKNOWN', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;
        let reconnectCallCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100001:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async (jid, content) => {
                sendInvocationCount++;
                // Simulate remote server acceptance followed immediately by socket termination before ACK frame
                mockWs.isOpen = false;
                const err = new Error('Connection Terminated (1006)');
                err.code = 1006;
                throw err;
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        const origConnect = BaileysConnectionManager.connect;

        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);
        BaileysConnectionManager.connect = async (id) => {
            reconnectCallCount++;
            return mockSocket;
        };

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100001',
                'Scenario A: socket drop after send',
                { integrationId: testIntegrationId }
            );

            // Assert exactly one sendMessage invocation (zero duplicate retries)
            assert.strictEqual(sendInvocationCount, 1, 'Exactly one sendMessage invocation; zero duplicate retries');
            assert.strictEqual(reconnectCallCount, 0, 'No automatic reconnect triggered after write initiated');
            assert.strictEqual(result.success, false, 'Dispatch result success must be false');
            assert.strictEqual(result.deliveryStatus, 'DELIVERY_UNKNOWN', 'deliveryStatus must be DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, true, 'isDeliveryUnknown must be true');
            assert.strictEqual(result.isAmbiguous, true, 'isAmbiguous must be true');
            assert.ok(result.error.includes('ambiguous'), 'Error must note ambiguous delivery');
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
            BaileysConnectionManager.connect = origConnect;
        }
    });

    it('28. Scenario B: ECONNRESET after first send invocation — suppresses retry and persists ambiguous state', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100002:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async (jid, content) => {
                sendInvocationCount++;
                mockWs.isOpen = false;
                const err = new Error('read ECONNRESET');
                err.code = 'ECONNRESET';
                throw err;
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);

        await WhatsAppIntegration.create({
            _id: testIntegrationId,
            phoneNumberId: 'phone_test_scenario_b',
            connectionType: 'QR_SCANNER',
            name: 'Baileys Scenario B Line',
            provider: 'BAILEYS',
            status: 'ACTIVE',
            isDefault: true,
            phoneNumber: '+919876543210'
        });

        const idKey = 'idemp_econnreset_scenario_b';

        try {
            const result = await WhatsAppService.sendMessage(
                '919811100002',
                'Scenario B: ECONNRESET test',
                { provider: 'BAILEYS', integrationId: testIntegrationId, idempotencyKey: idKey }
            );

            assert.strictEqual(sendInvocationCount, 1, 'Exactly one sendMessage invocation; zero retries on ECONNRESET');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, true);
            assert.strictEqual(result.isAmbiguous, true);

            // Assert ambiguous state is authoritatively persisted in the durable ledger
            const savedRecord = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
            assert.ok(savedRecord, 'Durable dispatch record must exist in MongoDB');
            assert.strictEqual(savedRecord.status, 'AMBIGUOUS_TIMEOUT', 'Durable status must be AMBIGUOUS_TIMEOUT');
            assert.strictEqual(savedRecord.isAmbiguous, true, 'Durable isAmbiguous flag must be true');
            assert.ok(savedRecord.errorDetails?.message?.includes('ECONNRESET') || savedRecord.errorDetails?.message?.includes('ambiguous'));
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
        }
    });

    it('29. Scenario C: Timeout after first send invocation — suppresses retry and returns DELIVERY_UNKNOWN', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100003:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async (jid, content) => {
                sendInvocationCount++;
                // Hang without resolving to trigger sendTimeout
                return new Promise((resolve) => setTimeout(resolve, 5000));
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100003',
                'Scenario C: ACK timeout',
                { integrationId: testIntegrationId },
                { sendTimeoutMs: 50 }
            );

            assert.strictEqual(sendInvocationCount, 1, 'Exactly one sendMessage invocation; zero retries on timeout');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, true);
            assert.strictEqual(result.isAmbiguous, true);
            assert.ok(result.error.includes('timed out'));
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
        }
    });

    it('30. Scenario D: Failure before first send invocation — verifies failure is not misclassified as ambiguous', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100004:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async (jid, content) => {
                sendInvocationCount++;
                return { key: { id: 'msg_should_not_happen' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);

        try {
            // Pre-send hook throws before socket write is initiated
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100004',
                'Scenario D: pre-write failure',
                { integrationId: testIntegrationId },
                {
                    hooks: {
                        beforeSocketSend: async () => {
                            throw new Error('PRE_FLIGHT_VALIDATION_ERROR: Token signature invalid');
                        }
                    }
                }
            );

            // Assert socket write was NEVER invoked
            assert.strictEqual(sendInvocationCount, 0, 'Socket write was never invoked');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'FAILED', 'Must be classified as FAILED, not DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, false, 'isDeliveryUnknown must be false');
            assert.strictEqual(result.isAmbiguous, false, 'isAmbiguous must be false');
            assert.ok(result.error.includes('PRE_FLIGHT_VALIDATION_ERROR'));
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
        }
    });

    it('31. Scenario E: Lock loss after first write — treats as ambiguous and prevents duplicate send', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;

        const abortController = new AbortController();
        const lockContext = {
            signal: abortController.signal,
            isLockLost: () => false,
            validateOwnership: async () => true
        };

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100005:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async (jid, content) => {
                sendInvocationCount++;
                // Lock ownership lost after write was initiated
                lockContext.isLockLost = () => true;
                abortController.abort();
                return new Promise(() => {}); // Wait so lockAbortPromise triggers
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100005',
                'Scenario E: lock loss after write',
                { integrationId: testIntegrationId },
                {},
                lockContext
            );

            assert.strictEqual(sendInvocationCount, 1, 'Exactly one sendMessage invocation; no duplicate send');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, true);
            assert.strictEqual(result.isAmbiguous, true);
            assert.ok(result.error.includes('DISTRIBUTED_LOCK_LOST'));
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
        }
    });

    it('32. Scenario F: Durable idempotency — ambiguous dispatch cannot be automatically reclaimed without explicit authorized override', async () => {
        const intId = testIntegrationId.toString();
        const idKey = 'idemp_f_durable_ambiguity_gate';

        // 1. Seed existing dispatch record in AMBIGUOUS_TIMEOUT
        await WhatsAppDispatch.create({
            idempotencyKey: idKey,
            recipient: '919811100006',
            messageType: 'text',
            provider: 'BAILEYS',
            status: 'AMBIGUOUS_TIMEOUT',
            claimGeneration: 1,
            isAmbiguous: true,
            errorDetails: {
                message: 'Socket disconnected after write',
                isAmbiguous: true,
                failedAt: new Date()
            }
        });

        await WhatsAppIntegration.create({
            _id: testIntegrationId,
            phoneNumberId: 'phone_test_scenario_f',
            connectionType: 'QR_SCANNER',
            name: 'Baileys Scenario F Line',
            provider: 'BAILEYS',
            status: 'ACTIVE',
            isDefault: true,
            phoneNumber: '+919876543210'
        });

        // 2. Normal / automatic re-dispatch attempt MUST be blocked
        const autoRetryResult = await WhatsAppService.sendMessage(
            '919811100006',
            'Automatic retry message',
            { provider: 'BAILEYS', integrationId: testIntegrationId, idempotencyKey: idKey }
        );

        assert.strictEqual(autoRetryResult.success, false, 'Automatic retry must be blocked');
        assert.strictEqual(autoRetryResult.code, 'AMBIGUOUS_TIMEOUT_BLOCKED', 'Error code must be AMBIGUOUS_TIMEOUT_BLOCKED');
        assert.strictEqual(autoRetryResult.isAmbiguous, true, 'isAmbiguous must remain true');
        assert.ok(autoRetryResult.error.includes('Automatic retry blocked'), 'Error message must explain automatic retry suppression');

        // Verify database record remains in AMBIGUOUS_TIMEOUT
        const unmutated = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
        assert.strictEqual(unmutated.status, 'AMBIGUOUS_TIMEOUT');
        assert.strictEqual(unmutated.claimGeneration, 1);

        // 3. Explicit authorized override (forceRetryAmbiguous: true) permits administrative reclaim
        const overrideClaim = await WhatsAppService._claimOrGetDurableDispatch({
            idempotencyKey: idKey,
            mobile: '919811100006',
            options: { forceRetryAmbiguous: true }
        });

        assert.strictEqual(overrideClaim.canDispatch, true, 'Authorized override must permit dispatch');
        assert.strictEqual(overrideClaim.claimGeneration, 2, 'claimGeneration must increment to fence stale workers');

        const reclaimed = await WhatsAppDispatch.findOne({ idempotencyKey: idKey }).lean();
        assert.strictEqual(reclaimed.status, 'CLAIMED', 'Status must transition to CLAIMED upon authorized override');
        assert.strictEqual(reclaimed.claimGeneration, 2);
    });

    it('33. Pre-Send Hook Isolation: Hook throws ECONNRESET — zero socket writes, zero reconnect retries, returns FAILED', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;
        let connectInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100007:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async () => {
                sendInvocationCount++;
                return { key: { id: 'msg_should_never_send' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        const origConnect = BaileysConnectionManager.connect;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);
        BaileysConnectionManager.connect = async (id) => {
            connectInvocationCount++;
            return mockSocket;
        };

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100007',
                'Hook throws ECONNRESET test',
                { integrationId: testIntegrationId },
                {
                    hooks: {
                        beforeSocketSend: async () => {
                            throw new Error('read ECONNRESET');
                        }
                    }
                }
            );

            assert.strictEqual(sendInvocationCount, 0, 'Socket write must never be invoked when hook throws ECONNRESET');
            assert.strictEqual(connectInvocationCount, 0, 'Reconnect retry must never be attempted when hook throws ECONNRESET');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'FAILED', 'Must be classified as FAILED, not DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, false, 'isDeliveryUnknown must be false');
            assert.strictEqual(result.isAmbiguous, false, 'isAmbiguous must be false');
            assert.ok(result.error.includes('ECONNRESET'), `Error must contain ECONNRESET, got: ${result.error}`);
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
            BaileysConnectionManager.connect = origConnect;
        }
    });

    it('34. Pre-Send Hook Isolation: Hook throws Connection Terminated — zero socket writes, zero reconnect retries, returns FAILED', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;
        let connectInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100008:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async () => {
                sendInvocationCount++;
                return { key: { id: 'msg_should_never_send' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        const origConnect = BaileysConnectionManager.connect;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);
        BaileysConnectionManager.connect = async (id) => {
            connectInvocationCount++;
            return mockSocket;
        };

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100008',
                'Hook throws Connection Terminated test',
                { integrationId: testIntegrationId },
                {
                    hooks: {
                        beforeSocketSend: async () => {
                            throw new Error('Connection Terminated (1006)');
                        }
                    }
                }
            );

            assert.strictEqual(sendInvocationCount, 0, 'Socket write must never be invoked when hook throws Connection Terminated');
            assert.strictEqual(connectInvocationCount, 0, 'Reconnect retry must never be attempted when hook throws Connection Terminated');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'FAILED', 'Must be classified as FAILED, not DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, false, 'isDeliveryUnknown must be false');
            assert.strictEqual(result.isAmbiguous, false, 'isAmbiguous must be false');
            assert.ok(result.error.includes('Connection Terminated'), `Error must contain Connection Terminated, got: ${result.error}`);
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
            BaileysConnectionManager.connect = origConnect;
        }
    });

    it('35. Pre-Write Reconnect & Revalidation: Dead initial socket reconnects and revalidates pre-send hook before transmission', async () => {
        const intId = testIntegrationId.toString();
        let hookCallCount = 0;
        let sendInvocationCount = 0;
        let connectInvocationCount = 0;

        // Initial socket has dead/closed websocket
        const initialMockSocket = {
            user: { id: '919811100009:1@s.whatsapp.net' },
            ws: { isOpen: false, isConnecting: false },
            sendMessage: async () => {
                sendInvocationCount++;
                return { key: { id: 'msg_initial_socket' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        // Reconnected socket has open websocket
        const reconnectedMockSocket = {
            user: { id: '919811100009:1@s.whatsapp.net' },
            ws: { isOpen: true, isConnecting: false },
            sendMessage: async () => {
                sendInvocationCount++;
                return { key: { id: 'msg_reconnect_success' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        const origConnect = BaileysConnectionManager.connect;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? initialMockSocket : null);
        BaileysConnectionManager.connect = async (id) => {
            connectInvocationCount++;
            return reconnectedMockSocket;
        };

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100009',
                'Dead socket reconnect and revalidation test',
                { integrationId: testIntegrationId },
                {
                    hooks: {
                        beforeSocketSend: async ({ sock }) => {
                            hookCallCount++;
                        }
                    }
                }
            );

            assert.strictEqual(connectInvocationCount, 1, 'Pre-write reconnect must be attempted exactly once for dead socket');
            assert.strictEqual(hookCallCount, 2, 'Pre-send hook must be executed twice: initially and revalidated after reconnect before write');
            assert.strictEqual(sendInvocationCount, 1, 'Socket write must be invoked exactly once on the reconnected socket');
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.deliveryStatus, 'ACCEPTED');
            assert.strictEqual(result.messageId, 'msg_reconnect_success');
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
            BaileysConnectionManager.connect = origConnect;
        }
    });

    it('36. Write Boundary Isolation: Callback throws before socket write — returns FAILED without ambiguous delivery state', async () => {
        const intId = testIntegrationId.toString();
        let sendInvocationCount = 0;

        const mockWs = { isOpen: true, isConnecting: false };
        const mockSocket = {
            user: { id: '919811100010:1@s.whatsapp.net' },
            ws: mockWs,
            sendMessage: async () => {
                sendInvocationCount++;
                return { key: { id: 'msg_should_not_send' } };
            },
            sendPresenceUpdate: async () => {},
            waitForSocketOpen: async () => {}
        };

        const origGetSocket = BaileysConnectionManager.getSocket;
        BaileysConnectionManager.getSocket = (id) => (String(id) === intId ? mockSocket : null);

        try {
            const result = await WhatsAppService._executeSendViaBaileys(
                '919811100010',
                'Callback explosion before write test',
                { integrationId: testIntegrationId },
                {
                    onSocketWriteInitiated: () => {
                        throw new Error('CALLBACK_EXPLODED: failed before actual socket write');
                    }
                }
            );

            assert.strictEqual(sendInvocationCount, 0, 'Socket write must never be invoked if callback throws');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.deliveryStatus, 'FAILED', 'Must be classified as FAILED, not DELIVERY_UNKNOWN');
            assert.strictEqual(result.isDeliveryUnknown, false, 'isDeliveryUnknown must be false');
            assert.strictEqual(result.isAmbiguous, false, 'isAmbiguous must be false');
            assert.ok(result.error.includes('CALLBACK_EXPLODED'), `Error must contain callback message, got: ${result.error}`);
        } finally {
            BaileysConnectionManager.getSocket = origGetSocket;
        }
    });
});
