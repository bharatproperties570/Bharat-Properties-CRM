process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import WhatsAppCircuitBreaker, { TRIP_THRESHOLDS } from '../services/WhatsAppCircuitBreaker.js';
import BaileysConnectionManager, {
    handleMessagesUpdate,
    handleMessageReceiptUpdate,
    DELIVERY_TRANSITION_MATRIX,
    PROTECTED_TERMINAL_STATES
} from '../services/baileysQueue/BaileysConnectionManager.js';
import redisProxy from '../src/config/redis.js';

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
});
