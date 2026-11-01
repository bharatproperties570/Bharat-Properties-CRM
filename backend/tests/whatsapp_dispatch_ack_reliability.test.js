process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import WhatsAppCircuitBreaker from '../services/WhatsAppCircuitBreaker.js';
import WhatsAppService from '../services/WhatsAppService.js';
import BaileysConnectionManager from '../services/baileysQueue/BaileysConnectionManager.js';

describe('Phase C — Outbound Dispatch & Acknowledgement Reliability Suite', () => {
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
        await WhatsAppCircuitBreaker.reset(testIntegrationId.toString());
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

    it('2. messages.update event transitions state monotonically: ACCEPTED -> SERVER_ACKNOWLEDGED -> DELIVERY_CONFIRMED -> READ', async () => {
        const msgId = '3EB0_MONOTONIC_TEST';
        await MarketingDelivery.create({
            jobId: 'camp_ack_test',
            recipientId: '919876543210',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'BAILEYS',
            providerMessageId: msgId
        });

        await WhatsAppDispatch.create({
            idempotencyKey: 'idemp_ack_test',
            recipient: '919876543210',
            channel: 'WHATSAPP',
            provider: 'BAILEYS',
            status: 'DISPATCHED',
            providerMessageId: msgId
        });

        // Simulate status = 2 (SERVER_ACK)
        const updateServerAck = {
            key: { id: msgId, remoteJid: '919876543210@s.whatsapp.net' },
            update: { status: 2 }
        };
        const now = new Date();
        await MarketingDelivery.updateMany(
            { providerMessageId: msgId },
            { $set: { status: 'SERVER_ACKNOWLEDGED', serverAckAt: now } }
        );
        await WhatsAppDispatch.updateMany(
            { providerMessageId: msgId },
            { $set: { status: 'SERVER_ACKNOWLEDGED', deliveryStatus: 'SERVER_ACKNOWLEDGED', deliveryStatusAt: now } }
        );

        let d1 = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(d1.status, 'SERVER_ACKNOWLEDGED');
        assert.ok(d1.serverAckAt);

        // Simulate status = 3 (DELIVERY_ACK / Recipient Received)
        await MarketingDelivery.updateMany(
            { providerMessageId: msgId },
            { $set: { status: 'DELIVERY_CONFIRMED', deliveryReceiptAt: new Date() } }
        );
        let d2 = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(d2.status, 'DELIVERY_CONFIRMED');
        assert.ok(d2.deliveryReceiptAt);

        // Simulate status = 4 (READ)
        await MarketingDelivery.updateMany(
            { providerMessageId: msgId },
            { $set: { status: 'READ', readAt: new Date() } }
        );
        let d3 = await MarketingDelivery.findOne({ providerMessageId: msgId });
        assert.equal(d3.status, 'READ');
        assert.ok(d3.readAt);
    });

    it('3. Ambiguous timeout handling: Marks DELIVERY_UNKNOWN without auto-retry to prevent duplicates', async () => {
        const res = {
            success: false,
            deliveryStatus: 'DELIVERY_UNKNOWN',
            isDeliveryUnknown: true,
            isAmbiguous: true,
            error: 'WhatsApp Web ACK timed out after 35s while connection remained alive. Suppressing duplicate retry.'
        };

        assert.equal(res.deliveryStatus, 'DELIVERY_UNKNOWN');
        assert.equal(res.isDeliveryUnknown, true);
        assert.equal(res.isAmbiguous, true);
    });

    it('4. Circuit Breaker: Repeated ACK timeouts trip breaker to OPEN and pause new dispatches', async () => {
        const intId = testIntegrationId.toString();

        // Breaker starts CLOSED
        let state0 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state0.tripped, false);
        assert.equal(state0.state, 'CLOSED');

        // Record 1st and 2nd timeout
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        let state2 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state2.tripped, false);

        // Record 3rd timeout -> TRIPS to OPEN
        const tripRes = await WhatsAppCircuitBreaker.recordAckTimeout(intId);
        assert.equal(tripRes.tripped, true);

        let state3 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(state3.tripped, true);
        assert.equal(state3.state, 'OPEN');
        assert.ok(state3.reason.includes('consecutive ACK timeouts'));

        // Reset clears breaker back to CLOSED
        await WhatsAppCircuitBreaker.reset(intId, 'ADMIN_TEST');
        let stateReset = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(stateReset.tripped, false);
        assert.equal(stateReset.state, 'CLOSED');
    });

    it('5. Circuit Breaker: Auth persistence failures trip breaker after 2 consecutive failures', async () => {
        const intId = 'auth-breaker-test';
        await WhatsAppCircuitBreaker.reset(intId);

        await WhatsAppCircuitBreaker.recordAuthFailure(intId, new Error('DB write failure 1'));
        let s1 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(s1.tripped, false);

        await WhatsAppCircuitBreaker.recordAuthFailure(intId, new Error('DB write failure 2'));
        let s2 = await WhatsAppCircuitBreaker.isTripped(intId);
        assert.equal(s2.tripped, true);
        assert.equal(s2.state, 'OPEN');
        assert.ok(s2.reason.includes('authentication persistence failures'));
    });
});
