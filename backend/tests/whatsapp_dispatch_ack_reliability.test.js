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
    handleMessageReceiptUpdate
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
    // PART 1: ACTUAL EVENT HANDLER & MONOTONIC STATUS TESTING (P0)
    // ─────────────────────────────────────────────────────────────────────────

    it('1. Actual messages.update event with SERVER_ACK: transitions ACCEPTED -> SERVER_ACKNOWLEDGED in both ledgers', async () => {
        const msgId = '3EB0_TEST_MSG_SERVER_ACK';
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

        // Verify listener attachment on socket EventEmitter
        const mockSock = { ev: new EventEmitter() };
        BaileysConnectionManager.attachMessageReconciliationListeners(mockSock, intId);
        assert.equal(mockSock.ev.listenerCount('messages.update'), 1);
        assert.equal(mockSock.ev.listenerCount('message-receipt.update'), 1);

        // Execute actual handler
        await handleMessagesUpdate([
            { key: { id: msgId }, update: { status: 2 } } // 2 = SERVER_ACK
        ], intId);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'SERVER_ACKNOWLEDGED');
        assert.ok(md.serverAckAt);
        assert.equal(wd.status, 'SERVER_ACKNOWLEDGED');
        assert.equal(wd.deliveryStatus, 'SERVER_ACKNOWLEDGED');
        assert.ok(wd.deliveryStatusAt);
    });

    it('2. Actual messages.update event with DELIVERY_ACK: transitions to DELIVERY_CONFIRMED in both ledgers', async () => {
        const msgId = '3EB0_TEST_MSG_DELIVERY_ACK';
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

        await handleMessagesUpdate([{ key: { id: msgId }, update: { status: 3 } }], intId);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'DELIVERY_CONFIRMED');
        assert.ok(md.deliveryReceiptAt);
        assert.equal(wd.status, 'DELIVERY_CONFIRMED');
        assert.equal(wd.deliveryStatus, 'DELIVERY_CONFIRMED');
    });

    it('3. Actual messages.update event with READ: transitions to READ in both ledgers', async () => {
        const msgId = '3EB0_TEST_MSG_READ';
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

        await handleMessagesUpdate([{ key: { id: msgId }, update: { status: 4 } }], intId);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'READ');
        assert.ok(md.readAt);
        assert.equal(wd.status, 'READ');
        assert.equal(wd.deliveryStatus, 'READ');
    });

    it('4. Actual message-receipt.update with receiptTimestamp: establishes DELIVERY_CONFIRMED and NOT READ', async () => {
        const msgId = '3EB0_TEST_RECEIPT_TS';
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

        // Event with ONLY receiptTimestamp
        await handleMessageReceiptUpdate([
            { key: { id: msgId }, receipt: { receiptTimestamp: Math.floor(Date.now() / 1000) } }
        ], intId);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'DELIVERY_CONFIRMED', 'receiptTimestamp must establish DELIVERY_CONFIRMED');
        assert.equal(md.readAt, undefined, 'readAt must remain unset');
        assert.equal(wd.status, 'DELIVERY_CONFIRMED');
    });

    it('5. Actual message-receipt.update with readTimestamp: establishes READ', async () => {
        const msgId = '3EB0_TEST_READ_TS';
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

        // Event with readTimestamp
        await handleMessageReceiptUpdate([
            { key: { id: msgId }, receipt: { readTimestamp: Math.floor(Date.now() / 1000) } }
        ], intId);

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });

        assert.equal(md.status, 'READ');
        assert.ok(md.readAt);
        assert.equal(wd.status, 'READ');
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

        // 1. Delayed SERVER_ACK (status 2) arrives
        await handleMessagesUpdate([{ key: { id: msgId }, update: { status: 2 } }], intId);

        let md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        let wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery must NOT regress to SERVER_ACKNOWLEDGED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch must NOT regress to SERVER_ACKNOWLEDGED');

        // 2. Delayed DELIVERY_ACK (status 3) arrives
        await handleMessagesUpdate([{ key: { id: msgId }, update: { status: 3 } }], intId);

        md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery must NOT regress to DELIVERY_CONFIRMED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch must NOT regress to DELIVERY_CONFIRMED');
    });

    it('7. Concurrent receipt events and duplicate events: Monotonicity and idempotency are preserved', async () => {
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

    it('8. Unknown message ID: Events for non-existent messages execute gracefully without throwing', async () => {
        const intId = testIntegrationId.toString();
        // Should execute cleanly without error
        await handleMessagesUpdate([{ key: { id: 'NON_EXISTENT_MSG_123' }, update: { status: 2 } }], intId);
        await handleMessageReceiptUpdate([{ key: { id: 'NON_EXISTENT_MSG_456' }, receipt: { readTimestamp: 100 } }], intId);
        assert.ok(true, 'Unknown message ID handled without error');
    });

    it('9. Partial ledger update failure resilience: Error in one ledger does not block updates to the other', async () => {
        const msgId = '3EB0_PARTIAL_LEDGER_TEST';
        const intId = testIntegrationId.toString();

        // Seed ONLY WhatsAppDispatch (simulating MarketingDelivery write failure or missing record)
        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_part_1',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            deliveryStatus: 'DISPATCHED',
            providerMessageId: msgId
        });

        // Send event
        await handleMessagesUpdate([{ key: { id: msgId }, update: { status: 2 } }], intId);

        const wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(wd.status, 'SERVER_ACKNOWLEDGED', 'WhatsAppDispatch must update successfully even if MarketingDelivery was absent');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 2: CIRCUIT BREAKER RECOVERY & DURABILITY TESTS (P0)
    // ─────────────────────────────────────────────────────────────────────────

    it('10. HALF_OPEN probe success: Transitions breaker from HALF_OPEN to CLOSED and clears counters', async () => {
        const intId = testIntegrationId.toString();

        // Trip breaker to OPEN with cooloff elapsed (6 minutes ago)
        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        // Reserve probe
        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-1' });
        assert.equal(probeRes.state, 'HALF_OPEN');
        assert.equal(probeRes.isProbe, true);
        assert.equal(probeRes.probeToken, 'probe-worker-1');

        // Record probe success with token
        const successRes = await WhatsAppCircuitBreaker.recordSuccess(intId, 'probe-worker-1');
        assert.equal(successRes.success, true);
        assert.equal(successRes.state, 'CLOSED');

        // Verify breaker is now fully CLOSED
        const stateNow = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(stateNow.tripped, false);
        assert.equal(stateNow.state, 'CLOSED');
    });

    it('11. HALF_OPEN probe failure: Transitions back to OPEN with fresh cool-off period', async () => {
        const intId = testIntegrationId.toString();

        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-2' });
        assert.equal(probeRes.state, 'HALF_OPEN');

        // Probe fails
        const failRes = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'probe-worker-2', 'Socket connection reset');
        assert.equal(failRes.tripped, true);
        assert.equal(failRes.state, 'OPEN');

        // Subsequent check must show OPEN and cool-off active
        const check = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(check.tripped, true);
        assert.equal(check.state, 'OPEN');
        assert.ok(check.remainingCooloffSec > 0);
    });

    it('12. HALF_OPEN timeout: ACK timeout during probe transitions back to OPEN', async () => {
        const intId = testIntegrationId.toString();

        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(Date.now() - (6 * 60 * 1000)));

        const probeRes = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'probe-worker-timeout' });
        assert.equal(probeRes.state, 'HALF_OPEN');

        // Probe times out
        const timeoutRes = await WhatsAppCircuitBreaker.recordProbeFailure(intId, 'probe-worker-timeout', 'ACK timeout after 30s');
        assert.equal(timeoutRes.tripped, true);
        assert.equal(timeoutRes.state, 'OPEN');
    });

    it('13. Probe lock expiry & worker crash: Recovers safely and avoids HALF_OPEN permanent deadlock', async () => {
        const intId = testIntegrationId.toString();

        // 1. Breaker in HALF_OPEN, but worker crashed and probe_lock expired in Redis
        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.del(`cb:wa:${intId}:probe_lock`); // Expired lease

        // 2. Another worker calls isTripped()
        const res = await WhatsAppCircuitBreaker.isTripped(intId);

        // MUST NOT be stuck in HALF_OPEN! Must detect expired lease and recover to OPEN with fresh cooloff
        assert.equal(res.tripped, true);
        assert.equal(res.state, 'OPEN');
        assert.ok(res.reason.includes('expired') || res.reason.includes('cooloff'));

        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(storedState, 'OPEN', 'Breaker must have been reset to OPEN from expired HALF_OPEN');
    });

    it('14. Stale probe owner protection: Stale worker cannot reset another worker breaker state', async () => {
        const intId = testIntegrationId.toString();

        // Breaker is in HALF_OPEN with active token 'worker-2'
        await redisProxy.set(`cb:wa:${intId}:state`, 'HALF_OPEN');
        await redisProxy.set(`cb:wa:${intId}:probe_lock`, 'worker-2');

        // Stale worker-1 belatedly attempts to record probe success
        const staleRes = await WhatsAppCircuitBreaker.recordProbeSuccess(intId, 'worker-1-stale');
        assert.equal(staleRes.success, false);
        assert.equal(staleRes.error, 'STALE_PROBE_OWNER');

        // Breaker state must still be HALF_OPEN with worker-2 owning lease
        const activeLock = await redisProxy.get(`cb:wa:${intId}:probe_lock`);
        assert.equal(activeLock, 'worker-2');
    });

    it('15. Concurrent worker probe reservation: Exactly ONE worker reserves probe, others are held', async () => {
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
        assert.equal(probeCount, 1, 'Exactly ONE worker must be granted probe reservation');

        if (resA.isProbe) {
            assert.equal(resA.state, 'HALF_OPEN');
            assert.equal(resB.tripped, true);
        } else {
            assert.equal(resB.state, 'HALF_OPEN');
            assert.equal(resA.tripped, true);
        }
    });

    it('16. Redis outage during recordSuccess: Error is observable and NOT silently swallowed', async () => {
        const intId = testIntegrationId.toString();

        const origDel = redisProxy.del;
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
            redisProxy.del = origDel;
        }
    });

    it('17. Concurrent recordSuccess and recordAckTimeout: Concurrency safe without state corruption', async () => {
        const intId = testIntegrationId.toString();

        // Concurrently record successes and timeouts
        await Promise.all([
            WhatsAppCircuitBreaker.recordSuccess(intId),
            WhatsAppCircuitBreaker.recordAckTimeout(intId),
            WhatsAppCircuitBreaker.recordSuccess(intId)
        ]);

        const health = await WhatsAppCircuitBreaker.getHealth(intId);
        assert.ok(['CLOSED', 'OPEN'].includes(health.state));
    });

    it('18. Integration Isolation: Circuit breaker trip on Integration A does NOT affect Integration B', async () => {
        const intA = testIntegrationId.toString();
        const intB = testIntegrationId2.toString();

        // Trip Integration A
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

    it('19. Service instance recreation: Independent breaker instance reads state reliably from Redis', async () => {
        const intId = testIntegrationId.toString();

        // Process 1 trips breaker
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);

        // Process 2 (direct read)
        const stored = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(stored, 'OPEN', 'State must persist in Redis across process instances');

        const state = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state.tripped, true);
    });
});
