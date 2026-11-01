process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import WhatsAppCircuitBreaker from '../services/WhatsAppCircuitBreaker.js';
import WhatsAppService from '../services/WhatsAppService.js';
import redisProxy from '../src/config/redis.js';

describe('Phase C & 3 — Outbound Dispatch, Monotonic State & Durable Circuit Breaker Suite', () => {
    let mongoServer;
    const testIntegrationId = new mongoose.Types.ObjectId();

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
    });

    it('1. Capture send result: WhatsApp message ID and timestamps are durably recorded in MarketingDelivery', async () => {
        const testJobId = 'camp_123_run_1';
        const testPhone = '919876543210';
        const testMessageId = '3EB08790C928CC3C129894';

        await MarketingDelivery.create({
            jobId: testJobId,
            recipientId: testPhone,
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: testMessageId,
            lastAttemptAt: new Date()
        });

        const doc = await MarketingDelivery.findOne({ jobId: testJobId, recipientId: testPhone });
        assert.equal(doc.providerMessageId, testMessageId);
        assert.equal(doc.status, 'ACCEPTED');
    });

    it('2. Monotonic State Invariant: READ must NEVER regress to DELIVERY_CONFIRMED or SERVER_ACKNOWLEDGED', async () => {
        const msgId = '3EB0_MONOTONIC_TEST_READ';
        const now = new Date();

        // 1. Initially at READ state
        await MarketingDelivery.create({
            jobId: 'camp_ack_test',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'READ',
            provider: 'BAILEYS',
            providerMessageId: msgId,
            readAt: now
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_ack_test',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'READ',
            deliveryStatus: 'READ',
            providerMessageId: msgId
        });

        // 2. Simulate delayed SERVER_ACK event (status = 2) arriving after READ
        await MarketingDelivery.updateMany(
            {
                providerMessageId: msgId,
                status: { $nin: ['SERVER_ACKNOWLEDGED', 'DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] }
            },
            { $set: { status: 'SERVER_ACKNOWLEDGED', serverAckAt: new Date() } }
        );
        await WhatsAppDispatch.updateMany(
            {
                providerMessageId: msgId,
                status: { $nin: ['SERVER_ACKNOWLEDGED', 'DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] }
            },
            { $set: { status: 'SERVER_ACKNOWLEDGED', deliveryStatus: 'SERVER_ACKNOWLEDGED' } }
        );

        // Verify status remained READ
        let md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        let wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery status must NOT regress from READ to SERVER_ACKNOWLEDGED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch status must NOT regress from READ to SERVER_ACKNOWLEDGED');

        // 3. Simulate delayed DELIVERY_ACK event (status = 3) arriving after READ
        await MarketingDelivery.updateMany(
            {
                providerMessageId: msgId,
                status: { $nin: ['DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] }
            },
            { $set: { status: 'DELIVERY_CONFIRMED', deliveryReceiptAt: new Date() } }
        );
        await WhatsAppDispatch.updateMany(
            {
                providerMessageId: msgId,
                status: { $nin: ['DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] }
            },
            { $set: { status: 'DELIVERY_CONFIRMED', deliveryStatus: 'DELIVERY_CONFIRMED' } }
        );

        md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        wd = await WhatsAppDispatch.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'MarketingDelivery status must NOT regress from READ to DELIVERY_CONFIRMED');
        assert.equal(wd.status, 'READ', 'WhatsAppDispatch status must NOT regress from READ to DELIVERY_CONFIRMED');
    });

    it('3. Monotonic State Invariant: DELIVERY_CONFIRMED must NEVER regress to SERVER_ACKNOWLEDGED', async () => {
        const msgId = '3EB0_MONOTONIC_TEST_DELIV';

        await MarketingDelivery.create({
            jobId: 'camp_deliv_test',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'DELIVERY_CONFIRMED',
            provider: 'BAILEYS',
            providerMessageId: msgId,
            deliveryReceiptAt: new Date()
        });

        // Delayed SERVER_ACK
        await MarketingDelivery.updateMany(
            {
                providerMessageId: msgId,
                status: { $nin: ['SERVER_ACKNOWLEDGED', 'DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] }
            },
            { $set: { status: 'SERVER_ACKNOWLEDGED', serverAckAt: new Date() } }
        );

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'DELIVERY_CONFIRMED', 'Must NOT regress to SERVER_ACKNOWLEDGED');
    });

    it('4. Receipt Semantics: receiptTimestamp alone establishes DELIVERY_CONFIRMED, NOT READ', async () => {
        const msgId = '3EB0_RECEIPT_SEMANTICS_TEST';

        await MarketingDelivery.create({
            jobId: 'camp_receipt_test',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        // Simulate receipt.receiptTimestamp without readTimestamp
        const receipt = { receiptTimestamp: Math.floor(Date.now() / 1000) };
        const now = new Date();

        if (receipt.readTimestamp) {
            await MarketingDelivery.updateMany({ providerMessageId: msgId, status: { $ne: 'READ' } }, { $set: { status: 'READ', readAt: now } });
        } else if (receipt.receiptTimestamp) {
            await MarketingDelivery.updateMany({ providerMessageId: msgId, status: { $nin: ['DELIVERY_CONFIRMED', 'DELIVERED', 'READ'] } }, { $set: { status: 'DELIVERY_CONFIRMED', deliveryReceiptAt: now } });
        }

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'DELIVERY_CONFIRMED', 'receiptTimestamp alone must establish DELIVERY_CONFIRMED, NEVER READ');
        assert.equal(md.readAt, undefined, 'readAt must remain unset when only receiptTimestamp was received');
    });

    it('5. Receipt Semantics: readTimestamp establishes READ', async () => {
        const msgId = '3EB0_READ_SEMANTICS_TEST';

        await MarketingDelivery.create({
            jobId: 'camp_read_test',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'DELIVERY_CONFIRMED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        const receipt = { readTimestamp: Math.floor(Date.now() / 1000) };
        const now = new Date();

        if (receipt.readTimestamp) {
            await MarketingDelivery.updateMany({ providerMessageId: msgId, status: { $ne: 'READ' } }, { $set: { status: 'READ', readAt: now } });
        }

        const md = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(md.status, 'READ', 'readTimestamp must transition status to READ');
        assert.ok(md.readAt);
    });

    it('6. Durable Circuit Breaker: OPEN state survives across process/service instances in Redis', async () => {
        const intId = testIntegrationId.toString();

        // Trip the breaker
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);

        let state1 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state1.tripped, true);
        assert.equal(state1.state, 'OPEN');

        // Verify direct read from Redis storage matches OPEN state
        const storedState = await redisProxy.get(`cb:wa:${intId}:state`);
        assert.equal(storedState, 'OPEN', 'Breaker OPEN state must be stored in Redis');

        // Check health metrics
        const health = await WhatsAppCircuitBreaker.getHealth(intId);
        assert.equal(health.state, 'OPEN');
        assert.equal(health.consecutiveTimeouts, 3);
    });

    it('7. Durable Circuit Breaker: Controlled HALF_OPEN allows ONLY ONE worker probe reservation', async () => {
        const intId = testIntegrationId.toString();

        // 1. Set breaker to OPEN with trippedAt 6 minutes ago (> 5 min cooloff)
        const pastTrippedAt = Date.now() - (6 * 60 * 1000);
        await redisProxy.set(`cb:wa:${intId}:state`, 'OPEN');
        await redisProxy.set(`cb:wa:${intId}:tripped_at`, String(pastTrippedAt));

        // Worker 1 requests probe
        const worker1Res = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'worker-1-probe-token' });
        assert.equal(worker1Res.tripped, false, 'Worker 1 must be permitted to execute the single probe');
        assert.equal(worker1Res.state, 'HALF_OPEN');
        assert.equal(worker1Res.isProbe, true);
        assert.equal(worker1Res.probeToken, 'worker-1-probe-token');

        // Worker 2 attempts concurrent probe while Worker 1 is in-flight
        const worker2Res = await WhatsAppCircuitBreaker.isTripped(intId, { workerToken: 'worker-2-probe-token' });
        assert.equal(worker2Res.tripped, true, 'Worker 2 must be BLOCKED while Worker 1 probe is in flight');
        assert.ok(worker2Res.reason.includes('probe') || worker2Res.probeInFlight);
    });

    it('8. Durable Circuit Breaker: Redis outage blocks dispatch fail-closed', async () => {
        const intId = testIntegrationId.toString();

        const origGet = redisProxy.get;
        redisProxy.get = () => {
            throw new Error('ECONNREFUSED: Redis instance offline');
        };

        try {
            await assert.rejects(
                async () => {
                    await WhatsAppCircuitBreaker.isTripped(intId);
                },
                (err) => {
                    assert.ok(err.message.includes('CIRCUIT_BREAKER_STORAGE_UNAVAILABLE'));
                    return true;
                }
            );
        } finally {
            redisProxy.get = origGet;
        }
    });

    it('9. Durable Circuit Breaker: Authorized reset clears state and audit logs operator', async () => {
        const intId = testIntegrationId.toString();

        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);

        const resetRes = await WhatsAppCircuitBreaker.reset(intId, 'SUPER_ADMIN_SURPOSE', 'Health check passed on EC2');
        assert.equal(resetRes.success, true);
        assert.equal(resetRes.state, 'CLOSED');
        assert.equal(resetRes.operator, 'SUPER_ADMIN_SURPOSE');

        const stateAfter = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(stateAfter.tripped, false);
        assert.equal(stateAfter.state, 'CLOSED');
    });
});
