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
import { dispatchSingleRecipientCore, chainNextRecipient } from '../src/workers/marketingWorker.js';

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

    it('13. Concurrency P1-1A: Recipient progress racing with PAUSE is rejected and preserves PAUSED state', async () => {
        const campaignId = 'bna_camp_p1_1a';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Progress vs Pause Race Test',
            totalRecipients: 5
        });

        // Operator pauses the campaign
        await BroadcastLiveTracker.pauseCampaign(campaignId, 'Operator 1', 'Test Pause');
        const pausedCamp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(pausedCamp.status, 'PAUSED');

        // A racing micro-job finishes recipient 0 and attempts to record progress
        const result = await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 0,
            totalRecipients: 5,
            stats: { sent: 1, failed: 0 }
        });

        // Update must be rejected with explicit terminal/paused state reason
        assert.strictEqual(result.updated, false);
        assert.strictEqual(result.reason, 'REJECTED_TERMINAL_OR_PAUSED_STATE');
        assert.strictEqual(result.status, 'PAUSED');

        // Re-verify MongoDB record was NOT modified back to ACTIVE
        const verified = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(verified.status, 'PAUSED');
        assert.strictEqual(verified.processedRecipients, 0);
    });

    it('14. Concurrency P1-1B: Final recipient completion racing with CANCEL does not overwrite CANCELLED state', async () => {
        const campaignId = 'bna_camp_p1_1b';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Completion vs Cancel Race Test',
            totalRecipients: 2
        });

        // Step 1: Recipient 0 completes normally
        await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 0,
            totalRecipients: 2,
            stats: { sent: 1, failed: 0 }
        });

        // Operator cancels campaign before recipient 1 records completion
        await BroadcastLiveTracker.cancelCampaign(campaignId, 'Operator 1', 'Emergency Stop');
        const cancelledCamp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(cancelledCamp.status, 'CANCELLED');

        // Recipient 1 finishes and attempts boundary completion
        const result = await BroadcastLiveTracker.recordRecipientProgress({
            campaignId,
            recipientIndex: 1,
            totalRecipients: 2,
            stats: { sent: 2, failed: 0 }
        });

        // Update rejected by CAS guard
        assert.strictEqual(result.updated, false);
        assert.strictEqual(result.reason, 'REJECTED_TERMINAL_OR_PAUSED_STATE');
        assert.strictEqual(result.status, 'CANCELLED');

        // Verify status remains CANCELLED in DB, not overwritten to COMPLETED
        const verified = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(verified.status, 'CANCELLED');
    });

    it('15. Concurrency P1-2A: Two simultaneous retry requests for the same campaign atomically reject the second', async () => {
        const campaignId = 'bna_camp_p1_2a';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Dual Retry Race Test',
            totalRecipients: 2,
            campaignParams: {
                recipients: [
                    { mobile: '919811199901', name: 'Recipient 1' },
                    { mobile: '919811199902', name: 'Recipient 2' }
                ]
            }
        });

        // Seed 2 failed deliveries
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811199901', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199902', channel: 'whatsapp', status: 'FAILED_FINAL' }
        ]);

        const mockQueue = {
            add: async () => ({ id: 'mock_retry_job' })
        };

        // Fire two concurrent retry requests simultaneously
        const [res1, res2] = await Promise.all([
            BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator A', mockQueue),
            BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator B', mockQueue)
        ]);

        // Exactly one must succeed and one must be rejected with CONCURRENT_RETRY_IN_PROGRESS
        const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
        const conflictCount = (res1.error?.includes('CONCURRENT_RETRY_IN_PROGRESS') ? 1 : 0) +
                              (res2.error?.includes('CONCURRENT_RETRY_IN_PROGRESS') ? 1 : 0);

        assert.strictEqual(successCount, 1, 'Exactly one concurrent retry should succeed');
        assert.strictEqual(conflictCount, 1, 'Exactly one concurrent retry should be rejected with CONCURRENT_RETRY_IN_PROGRESS');

        // Verify only 1 child retry campaign was created in MongoDB
        const childCampaigns = await BroadcastCampaign.find({
            campaignId: { $regex: `^${campaignId}_retry_` }
        }).lean();
        assert.strictEqual(childCampaigns.length, 1);
    });

    it('16. Concurrency P1-2B: Recipient becoming ACCEPTED/DELIVERED before retry claim is strictly excluded', async () => {
        const campaignId = 'bna_camp_p1_2b';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Status Revalidation Race Test',
            totalRecipients: 2,
            campaignParams: {
                recipients: [
                    { mobile: '919811199903', name: 'Recipient 3' },
                    { mobile: '919811199904', name: 'Recipient 4' }
                ]
            }
        });

        // Seed initial failed deliveries
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811199903', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199904', channel: 'whatsapp', status: 'FAILED_RETRYABLE' }
        ]);

        // Webhook arrives asynchronously right before retry execution, confirming Recipient 3
        await MarketingDelivery.updateOne(
            { jobId: campaignId, recipientId: '919811199903' },
            { $set: { status: 'DELIVERED' } }
        );

        const mockQueue = {
            add: async () => ({ id: 'mock_retry_job' })
        };

        const retryRes = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', mockQueue);
        assert.strictEqual(retryRes.success, true);
        assert.strictEqual(retryRes.retryRecipientCount, 1, 'Only the still-failed recipient should be retried');

        // Verify the delivered recipient was NOT claimed for retry
        const recip3Delivery = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199903' }).lean();
        assert.strictEqual(recip3Delivery.status, 'DELIVERED');
        assert.strictEqual(recip3Delivery.retryClaimed, false);

        // Verify the failed recipient WAS claimed
        const recip4Delivery = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199904' }).lean();
        assert.strictEqual(recip4Delivery.retryClaimed, true);
        assert.strictEqual(recip4Delivery.retryCampaignId, retryRes.retryCampaignId);
    });

    it('17. Concurrency P1-2C: Queue enqueue failure rolls back recipient claims and allows subsequent retry', async () => {
        const campaignId = 'bna_camp_p1_2c';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Queue Rollback Test',
            totalRecipients: 1,
            campaignParams: {
                recipients: [
                    { mobile: '919811199905', name: 'Recipient 5' }
                ]
            }
        });

        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199905',
            channel: 'whatsapp',
            status: 'FAILED_FINAL'
        });

        // Mock queue that crashes on enqueue
        const failingQueue = {
            add: async () => {
                throw new Error('Redis connection lost during queue.add');
            }
        };

        // Execution must reject with QUEUE_ENQUEUE_FAILED
        await assert.rejects(
            async () => {
                await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', failingQueue);
            },
            /QUEUE_ENQUEUE_FAILED/
        );

        // Verify claims on MarketingDelivery were rolled back
        const delivery = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199905' }).lean();
        assert.strictEqual(delivery.retryClaimed, false);
        assert.strictEqual(delivery.retryCampaignId, undefined);

        // Verify parent campaign's retryLock was released
        const parentCamp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(parentCamp.retryLock?.active, false);

        // Verify subsequent retry with healthy queue now succeeds cleanly
        const healthyQueue = {
            add: async () => ({ id: 'mock_healthy_job' })
        };
        const recoveryRes = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', healthyQueue);
        assert.strictEqual(recoveryRes.success, true);
        assert.strictEqual(recoveryRes.retryRecipientCount, 1);
    });

    it('18. Concurrency P1-3A: Pause before provider dispatch aborts send and prevents external network call', async () => {
        const campaignId = 'bna_camp_p1_3a';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Pre-Dispatch Pause Guard Test',
            totalRecipients: 1
        });

        // Operator pauses the campaign
        await BroadcastLiveTracker.pauseCampaign(campaignId, 'Operator', 'Pause immediately');

        // Mock job
        const mockJob = {
            id: 'job_p1_3a',
            log: async () => {}
        };

        const res = await dispatchSingleRecipientCore({
            recipient: { mobile: '919811199906', name: 'Test User' },
            campaignId,
            channels: ['whatsapp'],
            meta: { title: 'Test Deal' },
            job: mockJob
        });

        assert.strictEqual(res.halted, true);
        assert.strictEqual(res.status, 'PAUSED');
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.primaryWaResult.status, 'halted');
        assert.strictEqual(res.primaryWaResult.deliveryStatus, 'PAUSED');
    });

    it('19. Concurrency P1-3B: Cancel while provider request is in flight records delivery but halts chaining', async () => {
        const campaignId = 'bna_camp_p1_3b';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'In-Flight Cancel Test',
            totalRecipients: 2,
            campaignParams: {
                recipients: [
                    { mobile: '919811199907', name: 'User 7' },
                    { mobile: '919811199908', name: 'User 8' }
                ]
            }
        });

        // Simulate provider request in-flight: while dispatching recipient 0, operator cancels campaign
        await BroadcastLiveTracker.cancelCampaign(campaignId, 'Operator', 'Mid-flight cancellation');

        // Simulate in-flight external write completing and recording into ledger
        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199907',
            channel: 'whatsapp',
            status: 'ACCEPTED',
            provider: 'META',
            providerMessageId: 'meta_wamid_9907'
        });

        const inFlightDelivery = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199907' }).lean();
        assert.strictEqual(inFlightDelivery.status, 'ACCEPTED');

        // Now chained scheduler attempts to process next recipient
        const mockJob = {
            id: 'job_p1_3b',
            log: async () => {}
        };

        const chainRes = await chainNextRecipient(
            mockJob,
            { campaignId, recipients: [{ mobile: '919811199907' }, { mobile: '919811199908' }] },
            0, // index 0 just finished
            { sent: 1, accepted: 1, failed: 0, unknown: 0, skipped: 0 },
            2  // total count 2
        );

        // Chaining must be strictly halted due to CANCELLED state
        assert.strictEqual(chainRes.status, 'CANCELLED');
        assert.strictEqual(chainRes.haltedAtIndex, 0);

        // No child micro-job for recipient 1 should ever be scheduled in active/cooldown state
        const camp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(camp.status, 'CANCELLED');
    });

    it('20. Concurrency P1-3C: Stale chained micro-job attempting to enqueue after cancellation is rejected', async () => {
        const campaignId = 'bna_camp_p1_3c';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Stale Chained Job Test',
            totalRecipients: 3
        });

        // Campaign is cancelled
        await BroadcastLiveTracker.cancelCampaign(campaignId, 'Operator', 'Cancelled earlier');

        const mockJob = {
            id: 'job_p1_3c',
            log: async () => {}
        };

        // Out-of-order stale micro-job attempts to chain to index 2
        const chainRes = await chainNextRecipient(
            mockJob,
            { campaignId, recipients: [{}, {}, {}] },
            1, // current index 1
            { sent: 1, accepted: 1, failed: 0, unknown: 0, skipped: 0 },
            3  // total count 3
        );

        assert.strictEqual(chainRes.status, 'CANCELLED');
        assert.strictEqual(chainRes.haltedAtIndex, 1);

        // Verify campaign remains CANCELLED
        const camp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(camp.status, 'CANCELLED');
    });

    it('21. Concurrency P1-Review-1: Recipient transitioning to non-failure, non-confirmed status (IN_PROGRESS) immediately before claim is not claimed', async () => {
        const campaignId = 'bna_camp_p1_rev1';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Non-Failure Status Claim Rejection Test',
            totalRecipients: 2,
            campaignParams: {
                recipients: [
                    { mobile: '919811199911', name: 'Recipient 11' },
                    { mobile: '919811199912', name: 'Recipient 12' }
                ]
            }
        });

        // Seed 2 initial failed deliveries
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811199911', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199912', channel: 'whatsapp', status: 'FAILED_RETRYABLE' }
        ]);

        // Right before atomic claim, Recipient 11 transitions to IN_PROGRESS (e.g. concurrent active attempt)
        await MarketingDelivery.updateOne(
            { jobId: campaignId, recipientId: '919811199911' },
            { $set: { status: 'IN_PROGRESS' } }
        );

        const mockQueue = {
            add: async () => ({ id: 'mock_retry_job' })
        };

        const res = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', mockQueue);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.retryRecipientCount, 1, 'Only the eligible failed recipient (Recipient 12) should be retried');

        // Verify Recipient 11 was NOT claimed (retryClaimed is false, retryCampaignId is undefined)
        const d11 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199911' }).lean();
        assert.strictEqual(d11.status, 'IN_PROGRESS');
        assert.strictEqual(d11.retryClaimed, false);
        assert.strictEqual(d11.retryCampaignId, undefined);

        // Verify Recipient 12 WAS claimed
        const d12 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199912' }).lean();
        assert.strictEqual(d12.retryClaimed, true);
        assert.strictEqual(d12.retryCampaignId, res.retryCampaignId);
    });

    it('22. Concurrency P1-Review-2: retryLock ownership safety — expired former owner cannot clear newer owner lock or enqueue work', async () => {
        const campaignId = 'bna_camp_p1_rev2';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Lock Ownership Safety Test',
            totalRecipients: 1,
            campaignParams: {
                recipients: [
                    { mobile: '919811199921', name: 'Recipient 21' }
                ]
            }
        });

        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199921',
            channel: 'whatsapp',
            status: 'FAILED_FINAL'
        });

        // 1. Simulate Operation A acquiring the lock with an expired lease (>60s ago)
        const tokenA = 'token_owner_a_12345';
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': new Date(Date.now() - 70000), // Expired 70s ago
                    'retryLock.lockedBy': 'Worker A',
                    'retryLock.token': tokenA
                }
            }
        );

        // 2. Operation B attempts acquisition after legitimate expiry
        const mockQueue = {
            add: async () => ({ id: 'mock_job_b' })
        };
        const resB = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Worker B', mockQueue);
        assert.strictEqual(resB.success, true, 'Worker B must successfully acquire after legitimate expiry');

        // Now let's test that if Worker B currently holds the lock:
        const tokenB = 'token_owner_b_67890';
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': new Date(),
                    'retryLock.lockedBy': 'Worker B',
                    'retryLock.token': tokenB
                }
            }
        );

        // 3. Worker A (stale former owner) attempts to release the lock in its finally block with tokenA
        await BroadcastCampaign.updateOne(
            {
                campaignId,
                'retryLock.token': tokenA
            },
            {
                $set: {
                    'retryLock.active': false,
                    'retryLock.lockedAt': null,
                    'retryLock.lockedBy': null,
                    'retryLock.token': null
                }
            }
        );

        // Verify Worker B's lock was NOT cleared and remains active!
        const campAfterStaleRelease = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(campAfterStaleRelease.retryLock?.active, true);
        assert.strictEqual(campAfterStaleRelease.retryLock?.token, tokenB);
        assert.strictEqual(campAfterStaleRelease.retryLock?.lockedBy, 'Worker B');

        // 4. Verify that an operation with tokenA that lost ownership detects ownership loss and rejects enqueue
        const currentCheck = await BroadcastCampaign.findOne({
            campaignId,
            'retryLock.active': true,
            'retryLock.token': tokenA
        }).lean();
        assert.strictEqual(Boolean(currentCheck), false, 'Worker A must detect that ownership was lost');
    });

    it('23. Concurrency P1-Review-3: Fail-closed opt-out verification across service failure, exceptions, and timeouts', async () => {
        const campaignId = 'bna_camp_p1_rev3';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Opt-Out Fail-Closed Test',
            totalRecipients: 4,
            campaignParams: {
                recipients: [
                    { mobile: '919811199931', name: 'User 31 - Timeout' },
                    { mobile: '919811199932', name: 'User 32 - Exception' },
                    { mobile: '919811199933', name: 'User 33 - Confirmed Optout' },
                    { mobile: '919811199934', name: 'User 34 - Consented' }
                ]
            }
        });

        // Seed failed deliveries for all 4
        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811199931', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199932', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199933', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199934', channel: 'whatsapp', status: 'FAILED_RETRYABLE' }
        ]);

        const whatsAppService = (await import('../services/WhatsAppService.js')).default;
        const originalIsOptedOut = whatsAppService.isRecipientOptedOut;

        try {
            // Mock behavior:
            // 919811199931: times out (> 3000ms)
            // 919811199932: throws an exception
            // 919811199933: returns true (confirmed opt-out)
            // 919811199934: returns false (consented)
            whatsAppService.isRecipientOptedOut = async (mobile) => {
                if (mobile === '919811199931') {
                    return new Promise(resolve => setTimeout(() => resolve(false), 3500));
                }
                if (mobile === '919811199932') {
                    throw new Error('Database connection failed during opt-out check');
                }
                if (mobile === '919811199933') {
                    return true;
                }
                if (mobile === '919811199934') {
                    return false;
                }
                return false;
            };

            const mockQueue = {
                add: async () => ({ id: 'mock_job_optout' })
            };

            const res = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', mockQueue);
            assert.strictEqual(res.success, true);
            // ONLY User 34 should be retried!
            assert.strictEqual(res.retryRecipientCount, 1, 'Only the consented recipient should be retried');

            // 1. Timeout recipient must be excluded (not claimed)
            const d31 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199931' }).lean();
            assert.strictEqual(d31.retryClaimed, false);

            // 2. Exception recipient must be excluded (not claimed)
            const d32 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199932' }).lean();
            assert.strictEqual(d32.retryClaimed, false);

            // 3. Confirmed opted-out recipient must be marked SUPPRESSED_OPTOUT and excluded
            const d33 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199933' }).lean();
            assert.strictEqual(d33.status, 'SUPPRESSED_OPTOUT');
            assert.strictEqual(d33.retryClaimed, false);

            // 4. Consented recipient was successfully claimed
            const d34 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199934' }).lean();
            assert.strictEqual(d34.retryClaimed, true);
            assert.strictEqual(d34.retryCampaignId, res.retryCampaignId);

        } finally {
            whatsAppService.isRecipientOptedOut = originalIsOptedOut;
        }
    });

    it('24. Concurrency P1-Review-4: WhatsApp service unavailable immediately aborts retry with OPT_OUT_SERVICE_UNAVAILABLE', async () => {
        const campaignId = 'bna_camp_p1_rev4';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Service Down Abort Test',
            totalRecipients: 1,
            channels: ['whatsapp'],
            campaignParams: {
                recipients: [
                    { mobile: '919811199941', name: 'User 41' }
                ]
            }
        });

        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199941',
            channel: 'whatsapp',
            status: 'FAILED_RETRYABLE'
        });

        const whatsAppService = (await import('../services/WhatsAppService.js')).default;
        const originalMethod = whatsAppService.isRecipientOptedOut;

        try {
            // Temporarily set method to null to simulate broken service
            whatsAppService.isRecipientOptedOut = null;

            const mockQueue = { add: async () => ({ id: 'mock' }) };
            const res = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Operator', mockQueue);

            assert.strictEqual(res.success, false);
            assert.match(res.error, /OPT_OUT_SERVICE_UNAVAILABLE/);

            // Delivery must remain unclaimed
            const d41 = await MarketingDelivery.findOne({ jobId: campaignId, recipientId: '919811199941' }).lean();
            assert.strictEqual(d41.retryClaimed, false);

        } finally {
            whatsAppService.isRecipientOptedOut = originalMethod;
        }
    });
});
