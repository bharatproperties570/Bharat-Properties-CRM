process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import BroadcastCampaign from '../models/BroadcastCampaign.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import Deal from '../models/Deal.js';
import BroadcastLiveTracker from '../services/BroadcastLiveTracker.js';
import {
    getLiveBroadcastState,
    getLiveBroadcasts,
    pauseBroadcastCampaign,
    resumeBroadcastCampaign,
    cancelBroadcastCampaign
} from '../controllers/marketing.controller.js';

describe('Phase 4: WhatsApp Live Dispatch Board & Operator Recovery Controls Test Suite', () => {
    let mongod;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri(), { autoIndex: false });
        await BroadcastCampaign.createCollection();
        await MarketingDelivery.createCollection();
        await Deal.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        await BroadcastCampaign.deleteMany({});
        await MarketingDelivery.deleteMany({});
        await Deal.deleteMany({});
    });

    it('1. Campaign Registration & Initialization: Creates durable record in ACTIVE state with zero processed', async () => {
        const campaignId = 'bna_camp_test_001';
        const dealId = new mongoose.Types.ObjectId();

        const campaign = await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'BNA Broadcast: Kurukshetra Premium Villa',
            dealId,
            dealTitle: 'Kurukshetra Premium Villa',
            totalRecipients: 20,
            channels: ['whatsapp'],
            isBaileys: false,
            provider: 'META',
            campaignParams: { test: true },
            performedBy: 'Lead Broker'
        });

        assert.ok(campaign);
        assert.strictEqual(campaign.campaignId, campaignId);
        assert.strictEqual(campaign.status, 'ACTIVE');
        assert.strictEqual(campaign.totalRecipients, 20);
        assert.strictEqual(campaign.processedRecipients, 0);
        assert.strictEqual(campaign.currentIndex, 0);
        assert.strictEqual(campaign.isCooldown, false);
        assert.strictEqual(campaign.auditLog.length, 1);
        assert.strictEqual(campaign.auditLog[0].action, 'CREATED');
    });

    it('2. Live Progress & Completion Tracking: Increments processed count and marks COMPLETED at boundary', async () => {
        const campaignId = 'bna_camp_test_002';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Progress Test',
            totalRecipients: 3
        });

        // Recipient 0 processed
        const step1 = await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 0,
            totalRecipients: 3,
            stats: { sent: 1, failed: 0 }
        });
        assert.strictEqual(step1.processedRecipients, 1);
        assert.strictEqual(step1.status, 'ACTIVE');

        // Recipient 1 processed
        const step2 = await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 1,
            totalRecipients: 3,
            stats: { sent: 2, failed: 0 }
        });
        assert.strictEqual(step2.processedRecipients, 2);
        assert.strictEqual(step2.status, 'ACTIVE');

        // Recipient 2 processed (last one)
        const step3 = await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 2,
            totalRecipients: 3,
            stats: { sent: 3, failed: 0 }
        });
        assert.strictEqual(step3.processedRecipients, 3);
        assert.strictEqual(step3.status, 'COMPLETED');
        assert.ok(step3.completedAt);
    });

    it('3. Anti-Ban Batch Cooldown & Safe Pacing Tracking: Flags COOLDOWN and computes target resume timestamp', async () => {
        const campaignId = 'bna_camp_test_003';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Cooldown Test',
            totalRecipients: 10
        });

        // Batch boundary reached (e.g. index 5, delay 240,000ms = 4 mins)
        const delayMs = 240000;
        const updated = await BroadcastLiveTracker.recordCooldownOrPacing({
            campaignId,
            nextIndex: 5,
            delayMs,
            isBatchBoundary: true
        });

        assert.strictEqual(updated.status, 'COOLDOWN');
        assert.strictEqual(updated.isCooldown, true);
        assert.strictEqual(updated.delayMs, delayMs);
        assert.ok(updated.nextDispatchAt);
        assert.ok(updated.cooldownUntil);

        const state = await BroadcastLiveTracker.getCampaignState(campaignId);
        assert.strictEqual(state.isCooldown, true);
        assert.ok(state.remainingCooldownSeconds > 230);
    });

    it('4. Real-Time Delivery Metrics Aggregation: Authoritatively aggregates live delivery ground truth', async () => {
        const campaignId = 'bna_camp_test_004';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Analytics Test',
            totalRecipients: 7
        });

        // Seed deliveries with diverse real-world outcomes
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811100001', channel: 'whatsapp', status: 'ACCEPTED' },
            { jobId: campaignId, recipientId: '919811100002', channel: 'whatsapp', status: 'SENT' },
            { jobId: campaignId, recipientId: '919811100003', channel: 'whatsapp', status: 'DELIVERED' },
            { jobId: campaignId, recipientId: '919811100004', channel: 'whatsapp', status: 'READ' },
            { jobId: campaignId, recipientId: '919811100005', channel: 'whatsapp', status: 'FAILED_FINAL', error: 'Invalid JID' },
            { jobId: campaignId, recipientId: '919811100006', channel: 'whatsapp', status: 'DELIVERY_UNKNOWN' },
            { jobId: campaignId, recipientId: '919811100007', channel: 'whatsapp', status: 'SUPPRESSED_OPTOUT' }
        ]);

        await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 6,
            totalRecipients: 7
        });

        const state = await BroadcastLiveTracker.getCampaignState(campaignId);
        assert.strictEqual(state.totalRecipients, 7);
        assert.strictEqual(state.processedRecipients, 7);
        assert.strictEqual(state.progressPercent, 100);
        assert.strictEqual(state.stats.accepted, 1);
        assert.strictEqual(state.stats.sent, 1);
        assert.strictEqual(state.stats.delivered, 1);
        assert.strictEqual(state.stats.read, 1);
        assert.strictEqual(state.stats.failed, 1);
        assert.strictEqual(state.stats.unknown, 1);
        assert.strictEqual(state.stats.suppressed, 1);
    });

    it('5. Operator Action — PAUSE Campaign: Atomically switches status to PAUSED and records audit log', async () => {
        const campaignId = 'bna_camp_test_005';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Pause Test',
            totalRecipients: 10
        });

        const res = await BroadcastLiveTracker.pauseCampaign(campaignId, 'Senior Operator', 'Emergency network check');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'PAUSED');

        const haltCheck = await BroadcastLiveTracker.isCampaignHalted(campaignId);
        assert.strictEqual(haltCheck.halted, true);
        assert.strictEqual(haltCheck.status, 'PAUSED');

        const doc = await BroadcastCampaign.findOne({ campaignId });
        assert.strictEqual(doc.status, 'PAUSED');
        assert.strictEqual(doc.auditLog[doc.auditLog.length - 1].action, 'PAUSED');
        assert.strictEqual(doc.auditLog[doc.auditLog.length - 1].performedBy, 'Senior Operator');

        // Idempotent pause call
        const idempotentRes = await BroadcastLiveTracker.pauseCampaign(campaignId);
        assert.strictEqual(idempotentRes.success, true);
        assert.strictEqual(idempotentRes.status, 'PAUSED');
    });

    it('6. Operator Action — RESUME Campaign: Atomically resumes PAUSED campaign and dispatches next micro-job', async () => {
        const campaignId = 'bna_camp_test_006';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Resume Test',
            totalRecipients: 10,
            campaignParams: { campaignId, mockParam: true }
        });

        // Set processed to 3, currentIndex to 3
        await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 2,
            totalRecipients: 10
        });

        // Pause campaign
        await BroadcastLiveTracker.pauseCampaign(campaignId, 'Operator 1');

        // Mock queue to capture resume micro-job dispatch
        const enqueuedJobs = [];
        const mockQueue = {
            add: async (jobName, jobData, jobOptions) => {
                enqueuedJobs.push({ jobName, jobData, jobOptions });
                return { id: 'mock_resumed_job_1' };
            }
        };

        const res = await BroadcastLiveTracker.resumeCampaign(campaignId, 'Operator 1', 'Network check complete', mockQueue);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'ACTIVE');

        const haltCheck = await BroadcastLiveTracker.isCampaignHalted(campaignId);
        assert.strictEqual(haltCheck.halted, false);

        assert.strictEqual(enqueuedJobs.length, 1);
        assert.strictEqual(enqueuedJobs[0].jobName, 'bna-recipient-dispatch');
        assert.strictEqual(enqueuedJobs[0].jobData.recipientIndex, 3); // Resumes from current index 3
        assert.strictEqual(enqueuedJobs[0].jobOptions.delay, 2000); // 2-sec warm-up jitter
    });

    it('7. Operator Action — CANCEL Campaign: Terminates campaign and records terminal status', async () => {
        const campaignId = 'bna_camp_test_007';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Cancel Test',
            totalRecipients: 10
        });

        const res = await BroadcastLiveTracker.cancelCampaign(campaignId, 'Admin', 'Deal sold out');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'CANCELLED');

        const haltCheck = await BroadcastLiveTracker.isCampaignHalted(campaignId);
        assert.strictEqual(haltCheck.halted, true);
        assert.strictEqual(haltCheck.status, 'CANCELLED');

        // Cannot resume a cancelled campaign
        await assert.rejects(
            async () => await BroadcastLiveTracker.resumeCampaign(campaignId),
            /INVALID_STATE_TRANSITION/
        );
    });

    it('8. Operator Recovery — RETRY FAILED ONLY: Extracts failed/unknown targets and excludes all confirmed recipients', async () => {
        const campaignId = 'bna_camp_test_008';
        const recipients = [
            { id: 'recip_1', name: 'Delivered User', mobile: '919811100001' },
            { id: 'recip_2', name: 'Read User', mobile: '919811100002' },
            { id: 'recip_3', name: 'Failed User', mobile: '919811100003' },
            { id: 'recip_4', name: 'Timed Out User', mobile: '919811100004' },
            { id: 'recip_5', name: 'Opted Out User', mobile: '919811100005' }
        ];

        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Original Broadcast',
            totalRecipients: recipients.length,
            campaignParams: { recipients }
        });

        // Seed delivery outcomes in ledger
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811100001', channel: 'whatsapp', status: 'DELIVERED' },
            { jobId: campaignId, recipientId: '919811100002', channel: 'whatsapp', status: 'READ' },
            { jobId: campaignId, recipientId: '919811100003', channel: 'whatsapp', status: 'FAILED_FINAL', error: 'Network timeout' },
            { jobId: campaignId, recipientId: '919811100004', channel: 'whatsapp', status: 'DELIVERY_UNKNOWN' },
            { jobId: campaignId, recipientId: '919811100005', channel: 'whatsapp', status: 'SUPPRESSED_OPTOUT' }
        ]);

        const enqueuedJobs = [];
        const mockQueue = {
            add: async (jobName, jobData) => {
                enqueuedJobs.push({ jobName, jobData });
                return { id: 'retry_job_001' };
            }
        };

        const retryRes = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Lead Operator', mockQueue);
        assert.strictEqual(retryRes.success, true);
        assert.strictEqual(retryRes.retryRecipientCount, 2); // ONLY recip_3 and recip_4

        assert.strictEqual(enqueuedJobs.length, 1);
        const retryJob = enqueuedJobs[0];
        assert.strictEqual(retryJob.jobName, 'bna-broadcast');
        assert.strictEqual(retryJob.jobData.recipients.length, 2);
        assert.strictEqual(retryJob.jobData.recipients[0].mobile, '919811100003');
        assert.strictEqual(retryJob.jobData.recipients[1].mobile, '919811100004');

        // Confirm parent campaign recorded audit log
        const parentDoc = await BroadcastCampaign.findOne({ campaignId });
        const lastAudit = parentDoc.auditLog[parentDoc.auditLog.length - 1];
        assert.strictEqual(lastAudit.action, 'RETRY_INITIATED');
    });

    it('9. Concurrency Protection: Rejects concurrent invalid state transitions', async () => {
        const campaignId = 'bna_camp_test_009';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Concurrency Test',
            totalRecipients: 5
        });

        // Cannot resume an already active campaign
        const res = await BroadcastLiveTracker.resumeCampaign(campaignId);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.message, 'Campaign is already running');

        // Complete the campaign
        await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 4,
            totalRecipients: 5
        });

        // Cannot pause a completed campaign
        await assert.rejects(
            async () => await BroadcastLiveTracker.pauseCampaign(campaignId),
            /INVALID_STATE_TRANSITION/
        );
    });

    it('10. Controller API: getLiveBroadcastState returns 200 with campaign state or 404', async () => {
        const campaignId = 'bna_camp_ctrl_010';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Controller Test',
            totalRecipients: 4
        });

        const createMockRes = () => {
            const res = {
                statusCode: 200,
                jsonData: null,
                status(code) { this.statusCode = code; return this; },
                json(data) { this.jsonData = data; return this; }
            };
            return res;
        };

        // Existing campaign
        const req1 = { params: { campaignId } };
        const res1 = createMockRes();
        await getLiveBroadcastState(req1, res1);
        assert.strictEqual(res1.statusCode, 200);
        assert.strictEqual(res1.jsonData.success, true);
        assert.strictEqual(res1.jsonData.data.campaignId, campaignId);
        assert.strictEqual(res1.jsonData.data.totalRecipients, 4);

        // Missing campaign
        const req2 = { params: { campaignId: 'non_existent_camp' } };
        const res2 = createMockRes();
        await getLiveBroadcastState(req2, res2);
        assert.strictEqual(res2.statusCode, 404);
        assert.strictEqual(res2.jsonData.success, false);
    });

    it('11. Controller API: getLiveBroadcasts returns array of active/recent campaigns', async () => {
        await BroadcastLiveTracker.initCampaign({ campaignId: 'camp_list_1', name: 'Camp 1', totalRecipients: 2 });
        await BroadcastLiveTracker.initCampaign({ campaignId: 'camp_list_2', name: 'Camp 2', totalRecipients: 3 });

        const req = { query: { limit: '5' } };
        const res = {
            statusCode: 200,
            jsonData: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.jsonData = data; return this; }
        };

        await getLiveBroadcasts(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.jsonData.success, true);
        assert.ok(Array.isArray(res.jsonData.data));
        assert.ok(res.jsonData.data.length >= 2);
    });

    it('12. Controller API: pause, resume, and cancel handlers execute atomic mutations', async () => {
        const campaignId = 'bna_camp_ctrl_012';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Control Handler Test',
            totalRecipients: 6,
            campaignParams: { recipients: [] }
        });

        const createMockRes = () => ({
            statusCode: 200,
            jsonData: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.jsonData = data; return this; }
        });

        // 1. Pause
        const pauseReq = { params: { campaignId }, body: { reason: 'Test Pause' }, user: { fullName: 'Operator 9' } };
        const pauseRes = createMockRes();
        await pauseBroadcastCampaign(pauseReq, pauseRes);
        assert.strictEqual(pauseRes.statusCode, 200);
        assert.strictEqual(pauseRes.jsonData.success, true);
        assert.strictEqual(pauseRes.jsonData.status, 'PAUSED');

        // 2. Resume
        const resumeReq = { params: { campaignId }, body: { reason: 'Test Resume' }, user: { fullName: 'Operator 9' } };
        const resumeRes = createMockRes();
        await resumeBroadcastCampaign(resumeReq, resumeRes);
        assert.strictEqual(resumeRes.statusCode, 200);
        assert.strictEqual(resumeRes.jsonData.success, true);
        assert.strictEqual(resumeRes.jsonData.status, 'ACTIVE');

        // 3. Cancel
        const cancelReq = { params: { campaignId }, body: { reason: 'Test Cancel' }, user: { fullName: 'Operator 9' } };
        const cancelRes = createMockRes();
        await cancelBroadcastCampaign(cancelReq, cancelRes);
        assert.strictEqual(cancelRes.statusCode, 200);
        assert.strictEqual(cancelRes.jsonData.success, true);
        assert.strictEqual(cancelRes.jsonData.status, 'CANCELLED');
    });
});
