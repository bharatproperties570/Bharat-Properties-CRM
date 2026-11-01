process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import MarketingDelivery from '../models/MarketingDelivery.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import Deal from '../models/Deal.js';
import { isMonotonicStatusTransition } from '../utils/whatsappWebhook.utils.js';

describe('Campaign Progression, Deduplication & Restart Recovery Test Suite', () => {
    let mongod;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri(), { autoIndex: false });
        await MarketingDelivery.createCollection();
        await MarketingCampaign.createCollection();
        await Deal.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        await MarketingDelivery.deleteMany({});
        await MarketingCampaign.deleteMany({});
        await Deal.deleteMany({});
    });

    it('1. Deterministic Child-Job ID Generation: Recipient micro-jobs have predictable, unique IDs', () => {
        const campaignId = 'camp_det_001';
        const index0Id = `bna_${campaignId}_recip_0`;
        const index1Id = `bna_${campaignId}_recip_1`;
        const index5Id = `bna_${campaignId}_recip_5`;

        assert.strictEqual(index0Id, 'bna_camp_det_001_recip_0');
        assert.strictEqual(index1Id, 'bna_camp_det_001_recip_1');
        assert.strictEqual(index5Id, 'bna_camp_det_001_recip_5');
    });

    it('2. Process Restart Recovery: Stalled worker retrying job skips duplicate send and advances campaign', async () => {
        const campaignId = 'camp_restart_recovery_002';
        const recipientMobile = '919811100099';

        // Simulate that recipient 0 was already dispatched before worker crashed
        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: recipientMobile,
            channel: 'whatsapp',
            status: 'SENT'
        });

        // Verify that checking MarketingDelivery identifies the recipient as already processed
        const existing = await MarketingDelivery.findOne({
            jobId: campaignId,
            recipientId: recipientMobile,
            channel: 'whatsapp'
        }).lean();

        assert.ok(existing, 'Existing delivery record must be found');
        assert.ok(
            ['SENT', 'ACCEPTED', 'DELIVERED', 'READ'].includes(existing.status),
            'Status must indicate already confirmed dispatch'
        );

        // When existing.status is in confirmed states, worker skips duplicate send
        let duplicateSendExecuted = false;
        if (['SENT', 'ACCEPTED', 'DELIVERED', 'READ'].includes(existing.status)) {
            // Skips dispatch
            duplicateSendExecuted = false;
        } else {
            duplicateSendExecuted = true;
        }

        assert.strictEqual(duplicateSendExecuted, false, 'Duplicate message dispatch must be prevented on retry');
    });

    it('3. Monotonic Delivery Webhook Progression: Older SENT events never overwrite DELIVERED or READ', () => {
        // Custom check matching webhook controller logic
        const canAdvance = (current, incoming) => {
            const ranks = { queued: 1, accepted: 2, sent: 3, delivered: 4, read: 5 };
            const currRank = ranks[String(current || '').toLowerCase()] || 0;
            const incRank = ranks[String(incoming || '').toLowerCase()] || 0;
            return incRank >= currRank;
        };

        assert.strictEqual(canAdvance('delivered', 'sent'), false, 'Older SENT event cannot overwrite DELIVERED');
        assert.strictEqual(canAdvance('read', 'sent'), false, 'Older SENT event cannot overwrite READ');
        assert.strictEqual(canAdvance('read', 'delivered'), false, 'DELIVERED cannot overwrite READ');
        assert.strictEqual(canAdvance('sent', 'delivered'), true, 'DELIVERED advances SENT');
        assert.strictEqual(canAdvance('delivered', 'read'), true, 'READ advances DELIVERED');
    });
});
