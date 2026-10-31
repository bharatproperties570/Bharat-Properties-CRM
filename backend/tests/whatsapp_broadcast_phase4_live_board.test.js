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

    it('25. retryLock lease safety: heartbeat database failure marks ownership lost and halts subsequent mutations', async () => {
        const campaignId = 'bna_camp_lease_db_fail';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Heartbeat DB Fail Test',
            totalRecipients: 1,
            channels: ['whatsapp'],
            campaignParams: {
                recipients: [
                    { mobile: '919811199951', name: 'User 51' }
                ]
            }
        });

        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199951',
            channel: 'whatsapp',
            status: 'FAILED_RETRYABLE'
        });

        const lockToken = 'token_test_heartbeat_db_fail';
        const now = new Date();
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': now,
                    'retryLock.expiresAt': new Date(now.getTime() + 60000),
                    'retryLock.lockedBy': 'Worker A',
                    'retryLock.token': lockToken
                }
            }
        );

        // 1. Verify that before failure, ownership verification succeeds
        const initialValid = await BroadcastLiveTracker._verifyRetryLockOwnership(campaignId, lockToken);
        assert.strictEqual(initialValid, true, 'Initial lock ownership must be valid');

        // 2. Simulate heartbeat execution encountering a database failure
        const originalFindOneAndUpdate = BroadcastCampaign.findOneAndUpdate;
        const originalFindOne = BroadcastCampaign.findOne;
        try {
            BroadcastCampaign.findOneAndUpdate = () => {
                throw new Error('MongoNetworkError: connection timed out on findOneAndUpdate');
            };

            const heartbeatState = { isRenewing: true, renewalLost: false };
            const renewed = await BroadcastLiveTracker._handleHeartbeatTick(campaignId, lockToken, 60000, heartbeatState);

            assert.strictEqual(renewed, false, 'Heartbeat renewal must return false when DB throws');
            assert.strictEqual(heartbeatState.renewalLost, true, 'Heartbeat failure must mark renewalLost = true');
            assert.strictEqual(heartbeatState.isRenewing, false, 'Heartbeat failure must stop renewing');

            // 3. Verify that _verifyRetryLockOwnership also fails safely when DB query throws
            BroadcastCampaign.findOne = () => {
                throw new Error('MongoNetworkError: connection timed out on findOne');
            };
            const verifyWhenDbThrows = await BroadcastLiveTracker._verifyRetryLockOwnership(campaignId, lockToken);
            assert.strictEqual(verifyWhenDbThrows, false, 'Ownership check must fail-closed if DB query throws');
        } finally {
            BroadcastCampaign.findOneAndUpdate = originalFindOneAndUpdate;
            BroadcastCampaign.findOne = originalFindOne;
        }
    });

    it('26. retryLock lease safety: expired lease with unchanged token is detected as expired and rejected by verifyLockOwnership', async () => {
        const campaignId = 'bna_camp_lease_unchanged_token';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Expired Lease Unchanged Token Test',
            totalRecipients: 1,
            channels: ['whatsapp'],
            campaignParams: {
                recipients: [
                    { mobile: '919811199961', name: 'User 61' }
                ]
            }
        });

        const tokenUnchanged = 'token_unchanged_exact_match';
        const pastDate = new Date(Date.now() - 5000); // Expired 5 seconds ago
        const lockedAtDate = new Date(Date.now() - 65000); // Locked 65s ago

        // Lock in database has exact matching token, but expired expiresAt
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': lockedAtDate,
                    'retryLock.expiresAt': pastDate,
                    'retryLock.lockedBy': 'Worker Stale',
                    'retryLock.token': tokenUnchanged
                }
            }
        );

        // 1. verifyLockOwnership must reject even though token matches!
        const isValid = await BroadcastLiveTracker._verifyRetryLockOwnership(campaignId, tokenUnchanged);
        assert.strictEqual(isValid, false, 'Expired lease with identical token must return false');

        // 2. Heartbeat renewal must refuse to revive an expired lease
        const renewalResult = await BroadcastLiveTracker._renewRetryLock(campaignId, tokenUnchanged);
        assert.strictEqual(renewalResult, null, 'Heartbeat renewal must not revive an expired lease');

        // 3. Heartbeat tick must mark renewalLost = true
        const heartbeatState = { isRenewing: true, renewalLost: false };
        const tickResult = await BroadcastLiveTracker._handleHeartbeatTick(campaignId, tokenUnchanged, 60000, heartbeatState);
        assert.strictEqual(tickResult, false);
        assert.strictEqual(heartbeatState.renewalLost, true);
        assert.strictEqual(heartbeatState.isRenewing, false);
    });

    it('27. retryLock lease safety: newer owner acquisition succeeds after lease expiry with explicit expiresAt', async () => {
        const campaignId = 'bna_camp_newer_owner_acq';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Newer Owner Acquisition Test',
            totalRecipients: 1,
            channels: ['whatsapp'],
            campaignParams: {
                recipients: [
                    { mobile: '919811199971', name: 'User 71' }
                ]
            }
        });

        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: '919811199971',
            channel: 'whatsapp',
            status: 'FAILED_RETRYABLE'
        });

        // Set expired lock with Worker A
        const tokenA = 'token_worker_a_expired';
        const expiredTime = new Date(Date.now() - 10000); // 10s expired
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': new Date(Date.now() - 70000),
                    'retryLock.expiresAt': expiredTime,
                    'retryLock.lockedBy': 'Worker A',
                    'retryLock.token': tokenA
                }
            }
        );

        // Worker B attempts acquisition through retryFailedRecipients
        const mockQueue = { add: async () => ({ id: 'mock_job_newer_owner' }) };
        const resB = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Worker B', mockQueue);

        assert.strictEqual(resB.success, true, 'Worker B must acquire lock after Worker A lease expiry');

        // Check DB state: lock was released after Worker B completed
        const camp = await BroadcastCampaign.findOne({ campaignId }).lean();
        assert.strictEqual(camp.retryLock?.active, false, 'Lock was safely released after Worker B completed');
        const retryAudit = camp.auditLog?.find(a => a.action === 'RETRY_INITIATED' && a.performedBy === 'Worker B');
        assert.ok(retryAudit, 'Audit log must record retry initiation by Worker B');

        // Verify that if Worker B acquires lock and is still holding it:
        const tokenB = 'token_worker_b_active';
        const now = new Date();
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': now,
                    'retryLock.expiresAt': new Date(now.getTime() + 60000),
                    'retryLock.lockedBy': 'Worker B',
                    'retryLock.token': tokenB
                }
            }
        );

        // A third worker (Worker C) cannot acquire while Worker B has an active, unexpired lease
        const resC = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Worker C', mockQueue);
        assert.strictEqual(resC.success, false);
        assert.match(resC.error, /CONCURRENT_RETRY_IN_PROGRESS/);
    });

    it('28. retryLock lease safety: stale owner cannot enqueue work or clear newer owner active lock', async () => {
        const campaignId = 'bna_camp_stale_owner_guard';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Stale Owner Enqueue & Release Guard Test',
            totalRecipients: 2,
            channels: ['whatsapp'],
            campaignParams: {
                recipients: [
                    { mobile: '919811199981', name: 'User 81' },
                    { mobile: '919811199982', name: 'User 82' }
                ]
            }
        });

        await MarketingDelivery.create([
            { jobId: campaignId, recipientId: '919811199981', channel: 'whatsapp', status: 'FAILED_RETRYABLE' },
            { jobId: campaignId, recipientId: '919811199982', channel: 'whatsapp', status: 'FAILED_RETRYABLE' }
        ]);

        let queueAddCalled = false;
        const mockQueue = {
            add: async () => {
                queueAddCalled = true;
                return { id: 'mock_retry_job_should_never_enqueue' };
            }
        };

        const originalUpdateOne = BroadcastCampaign.updateOne;
        const tokenB = 'token_worker_b_steals_lock_99999';
        let synchronizationPointHit = false;

        try {
            // Hook BroadcastCampaign.updateOne to deterministically simulate lock theft
            // right after child campaign creation and before the pre-enqueue ownership check.
            BroadcastCampaign.updateOne = async function (filter, update, options) {
                // Execute the intended update first
                const res = await originalUpdateOne.call(this, filter, update, options);

                // Deterministic synchronization point: right after child creation,
                // when the parent campaign auditLog is updated for RETRY_INITIATED,
                // simulate Worker B acquiring the lock with token B!
                if (filter && filter.campaignId === campaignId && update && update.$push?.auditLog?.action === 'RETRY_INITIATED') {
                    synchronizationPointHit = true;
                    await originalUpdateOne.call(
                        BroadcastCampaign,
                        { campaignId },
                        {
                            $set: {
                                'retryLock.active': true,
                                'retryLock.lockedAt': new Date(),
                                'retryLock.expiresAt': new Date(Date.now() + 60000),
                                'retryLock.lockedBy': 'Worker B',
                                'retryLock.token': tokenB
                            }
                        }
                    );
                }

                return res;
            };

            // Execute the full real retryFailedRecipients path
            const res = await BroadcastLiveTracker.retryFailedRecipients(campaignId, 'Worker A', mockQueue);

            // 1. Verify synchronization point was reached
            assert.strictEqual(synchronizationPointHit, true, 'Synchronization point must be reached after child creation');

            // 2. Original worker detects RETRY_LOCK_LOST
            assert.strictEqual(res.success, false, 'Operation must fail when lock is lost before enqueue');
            assert.match(res.error, /RETRY_LOCK_LOST.*queue enqueue/, 'Error must explicitly state RETRY_LOCK_LOST before queue enqueue');

            // 3. marketingQueue.add() is NEVER called
            assert.strictEqual(queueAddCalled, false, 'marketingQueue.add() must never be called');

            // 4. Recipient claims belonging to the aborted retry are rolled back
            const deliveries = await MarketingDelivery.find({ jobId: campaignId }).lean();
            assert.strictEqual(deliveries.length, 2, 'Must still have 2 deliveries');
            for (const d of deliveries) {
                assert.strictEqual(d.retryClaimed, false, `Recipient ${d.recipientId} claim must be rolled back to false`);
                assert.strictEqual(d.retryCampaignId, undefined, `Recipient ${d.recipientId} retryCampaignId must be unset`);
            }

            // 5. Child retry campaign is marked FAILED
            const childCampaign = await BroadcastCampaign.findOne({
                campaignId: new RegExp(`^${campaignId}_retry_`)
            }).lean();
            assert.ok(childCampaign, 'Child retry campaign must exist in database');
            assert.strictEqual(childCampaign.status, 'FAILED', 'Child retry campaign must be marked FAILED');

            // 6. Token B remains active and unchanged in MongoDB
            const parentCamp = await BroadcastCampaign.findOne({ campaignId }).lean();
            assert.strictEqual(parentCamp.retryLock?.active, true, 'Retry lock must remain active');
            assert.strictEqual(parentCamp.retryLock?.token, tokenB, 'Token B must remain active and unchanged');
            assert.strictEqual(parentCamp.retryLock?.lockedBy, 'Worker B', 'LockedBy must still be Worker B');
            assert.ok(new Date(parentCamp.retryLock?.expiresAt) > new Date(), 'Lease for Token B must remain unexpired');

            // 7. Original worker\'s finally cleanup cannot release or modify Token B\'s lock
            // (parentCamp was fetched after retryFailedRecipients fully returned, confirming finally block did not unset token B)
            // Additionally test an explicit release attempt with stale token to prove token conditional safety:
            const staleReleaseResult = await BroadcastCampaign.updateOne(
                { campaignId, 'retryLock.token': 'token_stale_worker_a' },
                { $set: { 'retryLock.active': false, 'retryLock.token': null } }
            );
            assert.strictEqual(staleReleaseResult.modifiedCount, 0, 'Stale owner release query must match and modify zero documents');

            const postReleaseCamp = await BroadcastCampaign.findOne({ campaignId }).lean();
            assert.strictEqual(postReleaseCamp.retryLock?.token, tokenB, 'Token B must remain untouched after any stale release attempt');
            assert.strictEqual(postReleaseCamp.retryLock?.active, true, 'Lock must remain active for Worker B');

        } finally {
            BroadcastCampaign.updateOne = originalUpdateOne;
        }
    });

    it('29. Fail-Closed Halt Guard: Halt check returns PAUSED → zero provider calls, zero next-job enqueue', async () => {
        const campaignId = 'bna_camp_halt_paused';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Halt PAUSED Test',
            totalRecipients: 2
        });

        const originalHalt = BroadcastLiveTracker.isCampaignHalted;
        let providerCalls = 0;
        let queueAddCalls = 0;

        const mockWaService = {
            isRecipientOptedOut: async () => false,
            sendTemplate: async () => { providerCalls++; return { success: true, messageId: 'meta_p1' }; },
            sendMessage: async () => { providerCalls++; return { success: true, messageId: 'wa_p1' }; }
        };
        const mockQueue = {
            add: async () => { queueAddCalls++; return { id: 'mock_queued_job' }; }
        };
        const mockJob = { id: 'job_halt_paused', log: async () => {} };

        try {
            BroadcastLiveTracker.isCampaignHalted = async () => ({ halted: true, status: 'PAUSED' });

            // 1. Pre-Dispatch Guard test
            const dispatchRes = await dispatchSingleRecipientCore({
                recipient: { mobile: '919811199991', name: 'User Paused' },
                campaignId,
                channels: ['whatsapp'],
                meta: { title: 'Paused Deal' },
                job: mockJob,
                whatsAppService: mockWaService
            });

            assert.strictEqual(dispatchRes.halted, true);
            assert.strictEqual(dispatchRes.status, 'PAUSED');
            assert.strictEqual(dispatchRes.success, false);
            assert.strictEqual(providerCalls, 0, 'Zero provider calls must be made when campaign is PAUSED');

            // 2. Pre-Chaining Guard test
            const chainRes = await chainNextRecipient(
                mockJob,
                { campaignId, recipients: [{ mobile: '919811199991' }, { mobile: '919811199992' }] },
                0,
                { sent: 0, failed: 0, unknown: 0, skipped: 0 },
                2,
                { marketingQueue: mockQueue }
            );

            assert.strictEqual(chainRes.status, 'PAUSED');
            assert.strictEqual(queueAddCalls, 0, 'Zero next-job enqueue must occur when campaign is PAUSED');
        } finally {
            BroadcastLiveTracker.isCampaignHalted = originalHalt;
        }
    });

    it('30. Fail-Closed Halt Guard: Halt check returns CANCELLED → zero provider calls, zero next-job enqueue', async () => {
        const campaignId = 'bna_camp_halt_cancelled';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Halt CANCELLED Test',
            totalRecipients: 2
        });

        const originalHalt = BroadcastLiveTracker.isCampaignHalted;
        let providerCalls = 0;
        let queueAddCalls = 0;

        const mockWaService = {
            isRecipientOptedOut: async () => false,
            sendTemplate: async () => { providerCalls++; return { success: true, messageId: 'meta_c1' }; },
            sendMessage: async () => { providerCalls++; return { success: true, messageId: 'wa_c1' }; }
        };
        const mockQueue = {
            add: async () => { queueAddCalls++; return { id: 'mock_queued_job' }; }
        };
        const mockJob = { id: 'job_halt_cancelled', log: async () => {} };

        try {
            BroadcastLiveTracker.isCampaignHalted = async () => ({ halted: true, status: 'CANCELLED' });

            // 1. Pre-Dispatch Guard test
            const dispatchRes = await dispatchSingleRecipientCore({
                recipient: { mobile: '919811199992', name: 'User Cancelled' },
                campaignId,
                channels: ['whatsapp'],
                meta: { title: 'Cancelled Deal' },
                job: mockJob,
                whatsAppService: mockWaService
            });

            assert.strictEqual(dispatchRes.halted, true);
            assert.strictEqual(dispatchRes.status, 'CANCELLED');
            assert.strictEqual(dispatchRes.success, false);
            assert.strictEqual(providerCalls, 0, 'Zero provider calls must be made when campaign is CANCELLED');

            // 2. Pre-Chaining Guard test
            const chainRes = await chainNextRecipient(
                mockJob,
                { campaignId, recipients: [{ mobile: '919811199991' }, { mobile: '919811199992' }] },
                0,
                { sent: 0, failed: 0, unknown: 0, skipped: 0 },
                2,
                { marketingQueue: mockQueue }
            );

            assert.strictEqual(chainRes.status, 'CANCELLED');
            assert.strictEqual(queueAddCalls, 0, 'Zero next-job enqueue must occur when campaign is CANCELLED');
        } finally {
            BroadcastLiveTracker.isCampaignHalted = originalHalt;
        }
    });

    it('31. Fail-Closed Halt Guard: Halt check throws database error → zero provider calls, zero next-job enqueue', async () => {
        const campaignId = 'bna_camp_halt_dberr';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Halt DB Error Test',
            totalRecipients: 2
        });

        const originalHalt = BroadcastLiveTracker.isCampaignHalted;
        let providerCalls = 0;
        let queueAddCalls = 0;

        const mockWaService = {
            isRecipientOptedOut: async () => false,
            sendTemplate: async () => { providerCalls++; return { success: true, messageId: 'meta_e1' }; },
            sendMessage: async () => { providerCalls++; return { success: true, messageId: 'wa_e1' }; }
        };
        const mockQueue = {
            add: async () => { queueAddCalls++; return { id: 'mock_queued_job' }; }
        };
        const mockJob = { id: 'job_halt_dberr', log: async () => {} };

        try {
            BroadcastLiveTracker.isCampaignHalted = async () => {
                throw new Error('MongoNetworkTimeoutException: connection closed');
            };

            // 1. Pre-Dispatch Guard test: verification failure MUST abort provider write (Fail-Closed)
            const dispatchRes = await dispatchSingleRecipientCore({
                recipient: { mobile: '919811199993', name: 'User DB Err' },
                campaignId,
                channels: ['whatsapp'],
                meta: { title: 'DB Error Deal' },
                job: mockJob,
                whatsAppService: mockWaService
            });

            assert.strictEqual(dispatchRes.halted, true);
            assert.strictEqual(dispatchRes.status, 'HALT_CHECK_FAILED');
            assert.strictEqual(dispatchRes.success, false);
            assert.strictEqual(dispatchRes.primaryWaResult.status, 'halt_check_failed');
            assert.strictEqual(dispatchRes.primaryWaResult.deliveryStatus, 'HALT_CHECK_FAILED');
            assert.strictEqual(providerCalls, 0, 'Zero provider calls must occur when halt check throws database error');

            // 2. Pre-Chaining Guard test: error must NOT be swallowed, zero next-job enqueue
            const chainRes = await chainNextRecipient(
                mockJob,
                { campaignId, recipients: [{ mobile: '919811199991' }, { mobile: '919811199992' }] },
                0,
                { sent: 0, failed: 0, unknown: 0, skipped: 0 },
                2,
                { marketingQueue: mockQueue }
            );

            assert.strictEqual(chainRes.status, 'HALT_CHECK_FAILED');
            assert.match(chainRes.error, /MongoNetworkTimeoutException/);
            assert.strictEqual(queueAddCalls, 0, 'Zero next-job enqueue must occur when halt check throws error');
        } finally {
            BroadcastLiveTracker.isCampaignHalted = originalHalt;
        }
    });

    it('32. Fail-Closed Halt Guard: Halt check times out → zero provider calls, zero next-job enqueue', async () => {
        const campaignId = 'bna_camp_halt_timeout';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Halt Timeout Test',
            totalRecipients: 2
        });

        const originalHalt = BroadcastLiveTracker.isCampaignHalted;
        let providerCalls = 0;
        let queueAddCalls = 0;

        const mockWaService = {
            isRecipientOptedOut: async () => false,
            sendTemplate: async () => { providerCalls++; return { success: true, messageId: 'meta_t1' }; },
            sendMessage: async () => { providerCalls++; return { success: true, messageId: 'wa_t1' }; }
        };
        const mockQueue = {
            add: async () => { queueAddCalls++; return { id: 'mock_queued_job' }; }
        };
        const mockJob = { id: 'job_halt_timeout', log: async () => {} };

        try {
            // Simulate hung query that never resolves in time
            BroadcastLiveTracker.isCampaignHalted = () => new Promise(() => {});

            // 1. Pre-Dispatch Guard test with short deterministic timeout (20ms)
            const dispatchRes = await dispatchSingleRecipientCore({
                recipient: { mobile: '919811199994', name: 'User Timeout' },
                campaignId,
                channels: ['whatsapp'],
                meta: { title: 'Timeout Deal' },
                job: mockJob,
                haltTimeoutMs: 20,
                whatsAppService: mockWaService
            });

            assert.strictEqual(dispatchRes.halted, true);
            assert.strictEqual(dispatchRes.status, 'HALT_CHECK_FAILED');
            assert.strictEqual(dispatchRes.success, false);
            assert.match(dispatchRes.error, /HALT_CHECK_TIMEOUT/);
            assert.strictEqual(providerCalls, 0, 'Zero provider calls must occur when halt check times out');

            // 2. Pre-Chaining Guard test with short deterministic timeout (20ms)
            const chainRes = await chainNextRecipient(
                mockJob,
                { campaignId, recipients: [{ mobile: '919811199991' }, { mobile: '919811199992' }] },
                0,
                { sent: 0, failed: 0, unknown: 0, skipped: 0 },
                2,
                { marketingQueue: mockQueue, haltTimeoutMs: 20 }
            );

            assert.strictEqual(chainRes.status, 'HALT_CHECK_FAILED');
            assert.match(chainRes.error, /HALT_CHECK_TIMEOUT/);
            assert.strictEqual(queueAddCalls, 0, 'Zero next-job enqueue must occur when halt check times out');
        } finally {
            BroadcastLiveTracker.isCampaignHalted = originalHalt;
        }
    });

    it('33. Fail-Closed Halt Guard: Normal successful halt check → existing dispatch and chaining behavior unchanged', async () => {
        const campaignId = 'bna_camp_halt_normal';
        await BroadcastLiveTracker.initCampaign({
            campaignId,
            name: 'Halt Normal Active Test',
            totalRecipients: 2
        });

        const originalHalt = BroadcastLiveTracker.isCampaignHalted;
        let providerCalls = 0;
        let queueAddCalls = 0;

        const mockWaService = {
            isRecipientOptedOut: async () => false,
            sendTemplate: async () => { providerCalls++; return { success: true, messageId: 'meta_n1' }; },
            sendMessage: async () => { providerCalls++; return { success: true, messageId: 'wa_n1' }; }
        };
        const mockQueue = {
            add: async () => { queueAddCalls++; return { id: 'mock_queued_job' }; }
        };
        const mockJob = { id: 'job_halt_normal', log: async () => {} };

        try {
            BroadcastLiveTracker.isCampaignHalted = async () => ({ halted: false, status: 'ACTIVE' });

            // 1. Pre-Dispatch Guard test: normal ACTIVE status allows dispatch to proceed
            const dispatchRes = await dispatchSingleRecipientCore({
                recipient: { mobile: '919811199995', name: 'User Normal' },
                campaignId,
                channels: ['whatsapp'],
                meta: { title: 'Normal Active Deal' },
                job: mockJob,
                whatsAppService: mockWaService
            });

            assert.strictEqual(dispatchRes.success, true);
            assert.strictEqual(dispatchRes.halted, undefined);
            assert.strictEqual(providerCalls, 1, 'Provider call must succeed under normal active campaign state');

            // 2. Pre-Chaining Guard test: normal ACTIVE status proceeds to enqueue next recipient
            const chainRes = await chainNextRecipient(
                mockJob,
                { campaignId, recipients: [{ mobile: '919811199991' }, { mobile: '919811199992' }] },
                0,
                { sent: 1, failed: 0, unknown: 0, skipped: 0 },
                2,
                { marketingQueue: mockQueue }
            );

            assert.strictEqual(chainRes.status, 'CHAINED_NEXT');
            assert.strictEqual(chainRes.nextIndex, 1);
            assert.strictEqual(queueAddCalls, 1, 'Next micro-job must be enqueued under normal active campaign state');
        } finally {
            BroadcastLiveTracker.isCampaignHalted = originalHalt;
        }
    });
});
