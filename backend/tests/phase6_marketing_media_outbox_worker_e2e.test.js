process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Lead from '../models/Lead.js';
import OutboxEvent from '../models/OutboxEvent.js';
import MarketingDispatchReceipt from '../models/MarketingDispatchReceipt.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import BroadcastCampaign from '../models/BroadcastCampaign.js';
import Activity from '../models/Activity.js';
import SystemSetting from '../models/SystemSetting.js';
import EffectExecution from '../models/EffectExecution.js';
import Company from '../models/Company.js';
import Project from '../models/Project.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import SmsTemplate from '../src/modules/sms/smsTemplate.model.js';

import { broadcastToBrokerGroup } from '../controllers/marketing.controller.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { processMarketingJob } from '../src/workers/marketingWorker.js';
import { marketingQueue } from '../src/queues/queueManager.js';
import whatsAppService from '../services/WhatsAppService.js';

/**
 * ⚠️ INFRASTRUCTURE SCOPE CLARIFICATION:
 * This test suite is an isolated integration test covering the complete
 * 4-tier marketing dispatch flow (Controller -> OutboxEvent -> DomainEventWorker -> MarketingWorker -> Provider).
 * It uses a mocked BullMQ queue harness and in-memory replica set to assert media payload and caption fidelity.
 * It DOES NOT claim real Redis-backed BullMQ crash/stalled-job recovery coverage; real Redis recovery
 * is covered separately in `phase6_p1_marketing_worker_recovery.test.js`.
 */
describe('Phase 6 — Marketing Media Header Outbox-to-Worker E2E Integration Suite', () => {
    let replset;
    let testAdminUser;
    let testDeal;
    let testLead;

    // Track provider invocations
    const providerCalls = {
        sendMedia: [],
        sendMessage: [],
        sendTemplate: []
    };

    // Stored original methods for restoration
    let origSendMedia;
    let origSendMessage;
    let origSendTemplate;
    let origIsOptedOut;

    const createMockReq = (body = {}) => ({
        body,
        params: {},
        query: {},
        user: testAdminUser
    });

    const createMockRes = () => {
        const res = {
            statusCode: 200,
            data: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.data = payload;
                return this;
            }
        };
        return res;
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replset.waitUntilRunning();
        await mongoose.connect(replset.getUri(), { autoIndex: false });

        testAdminUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'bharatproperties570@gmail.com',
            fullName: 'Bharat Admin',
            role: { name: 'super admin', isSystemRole: true },
            dataScope: 'all'
        };

        // Mock WhatsApp Provider Methods
        origSendMedia = whatsAppService.sendMedia;
        origSendMessage = whatsAppService.sendMessage;
        origSendTemplate = whatsAppService.sendTemplate;
        origIsOptedOut = whatsAppService.isRecipientOptedOut;

        whatsAppService.sendMedia = async (mobile, type, mediaUrl, caption, filename, options) => {
            providerCalls.sendMedia.push({ mobile, type, mediaUrl, caption, filename, options });
            return {
                success: true,
                messageId: `mock_media_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                deliveryStatus: 'ACCEPTED'
            };
        };

        whatsAppService.sendMessage = async (mobile, text, options) => {
            providerCalls.sendMessage.push({ mobile, text, options });
            return {
                success: true,
                messageId: `mock_text_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                deliveryStatus: 'ACCEPTED'
            };
        };

        whatsAppService.sendTemplate = async (mobile, templateName, language, components, options) => {
            providerCalls.sendTemplate.push({ mobile, templateName, language, components, options });
            return {
                success: true,
                messageId: `mock_tpl_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                deliveryStatus: 'ACCEPTED'
            };
        };

        whatsAppService.isRecipientOptedOut = async () => false;
    });

    after(async () => {
        whatsAppService.sendMedia = origSendMedia;
        whatsAppService.sendMessage = origSendMessage;
        whatsAppService.sendTemplate = origSendTemplate;
        whatsAppService.isRecipientOptedOut = origIsOptedOut;

        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        providerCalls.sendMedia.length = 0;
        providerCalls.sendMessage.length = 0;
        providerCalls.sendTemplate.length = 0;

        await Deal.deleteMany({});
        await Lead.deleteMany({});
        await OutboxEvent.deleteMany({});
        await EffectExecution.deleteMany({});
        await MarketingDispatchReceipt.deleteMany({});
        await MarketingDelivery.deleteMany({});
        await BroadcastCampaign.deleteMany({});
        await Activity.deleteMany({});
        await SystemSetting.deleteMany({});

        testDeal = await Deal.create({
            title: 'Royal Palms Penthouse Sector 32',
            price: 18500000,
            location: 'Sector 32, Kurukshetra',
            stage: 'Open',
            dealCode: 'BP-SEC32-PENT-001'
        });

        testLead = await Lead.create({
            firstName: 'Rajesh',
            lastName: 'Malhotra',
            fullName: 'Rajesh Malhotra',
            mobile: '9876543210',
            email: 'rajesh.malhotra@example.com',
            stage: 'New'
        });
    });

    it('1. Image media with text header survives complete dispatch pipeline (Controller -> Outbox -> Workers -> Provider)', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                mediaUrl: 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg',
                mediaType: 'image',
                headerFileName: 'villa_front.jpg',
                headerText: 'Exclusive Ultra Luxury Villa Showcase',
                templateText: 'Exclusive Ultra Luxury Villa Showcase',
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            // 1. Controller Dispatch
            await broadcastToBrokerGroup(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.ok(res.data.jobId, 'Controller must generate deterministic jobId');
            assert.ok(res.data.campaignId, 'Controller must generate campaignId');

            // 2. Outbox Verification
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            assert.ok(outbox, 'OutboxEvent must be durably recorded');
            assert.equal(outbox.payload.jobType, 'bna-broadcast');
            assert.equal(outbox.payload.jobData.mediaUrl, 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg');
            assert.equal(outbox.payload.jobData.mediaType, 'image');
            assert.equal(outbox.payload.jobData.headerFileName, 'villa_front.jpg');
            assert.equal(outbox.payload.jobData.headerText, 'Exclusive Ultra Luxury Villa Showcase');
            assert.equal(outbox.payload.jobData.meta.mediaUrl, 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg');

            // 3. DomainEventWorker Consumption
            await processDomainEventJob({ data: outbox });
            assert.equal(queueJobs.length, 1, 'DomainEventWorker must enqueue exactly 1 bna-broadcast job');
            assert.equal(queueJobs[0].name, 'bna-broadcast');
            assert.equal(queueJobs[0].data.mediaUrl, 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg');
            assert.equal(queueJobs[0].data.mediaType, 'image');
            assert.equal(queueJobs[0].data.headerFileName, 'villa_front.jpg');
            assert.equal(queueJobs[0].data.headerText, 'Exclusive Ultra Luxury Villa Showcase');

            // 4. MarketingWorker (Parent bna-broadcast execution)
            const parentJob = queueJobs[0];
            await processMarketingJob({
                id: parentJob.opts.jobId,
                name: parentJob.name,
                data: parentJob.data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // Parent job enqueued child micro-job (bna-recipient-dispatch)
            assert.equal(queueJobs.length, 2, 'bna-broadcast must enqueue child bna-recipient-dispatch');
            assert.equal(queueJobs[1].name, 'bna-recipient-dispatch');
            const childJob = queueJobs[1];
            assert.equal(childJob.data.mediaUrl, 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg');
            assert.equal(childJob.data.mediaType, 'image');
            assert.equal(childJob.data.headerFileName, 'villa_front.jpg');
            assert.equal(childJob.data.headerText, 'Exclusive Ultra Luxury Villa Showcase');

            // 5. MarketingWorker (Child recipient dispatch execution)
            await processMarketingJob({
                id: childJob.opts.jobId,
                name: childJob.name,
                data: childJob.data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // 6. Provider Verification
            assert.equal(providerCalls.sendMedia.length, 1, 'sendMedia must be called exactly once');
            const call = providerCalls.sendMedia[0];
            assert.equal(call.mobile, '9876543210');
            assert.equal(call.type, 'image');
            assert.equal(call.mediaUrl, 'https://cdn.bharatproperties.co/properties/royal-palms/villa_front.jpg');
            assert.equal(call.filename, 'villa_front.jpg');
            assert.equal(call.caption, 'Exclusive Ultra Luxury Villa Showcase', 'Provider caption must contain exact expected headerText');
            assert.equal(call.options.idempotencyKey, `rcpt_${res.data.campaignId}_whatsapp_9876543210`);
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('2. PDF media is normalized to document type across the complete dispatch pipeline', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                mediaUrl: 'https://cdn.bharatproperties.co/docs/Sector32_Brochure_Floorplan.pdf',
                mediaType: 'pdf',
                headerFileName: 'Sector32_Brochure_Floorplan.pdf',
                headerText: 'Approved Masterplan & Floorplans',
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            assert.equal(res.statusCode, 200);

            // Outbox check: normalized to 'document'
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            assert.ok(outbox);
            assert.equal(outbox.payload.jobData.mediaType, 'document');
            assert.equal(outbox.payload.jobData.mediaUrl, 'https://cdn.bharatproperties.co/docs/Sector32_Brochure_Floorplan.pdf');
            assert.equal(outbox.payload.jobData.headerFileName, 'Sector32_Brochure_Floorplan.pdf');

            // DomainEventWorker
            await processDomainEventJob({ data: outbox });

            // MarketingWorker Parent
            await processMarketingJob({
                id: queueJobs[0].opts.jobId,
                name: queueJobs[0].name,
                data: queueJobs[0].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // MarketingWorker Child
            await processMarketingJob({
                id: queueJobs[1].opts.jobId,
                name: queueJobs[1].name,
                data: queueJobs[1].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // Provider verification
            assert.equal(providerCalls.sendMedia.length, 1);
            const call = providerCalls.sendMedia[0];
            assert.equal(call.mobile, '9876543210');
            assert.equal(call.type, 'document', 'PDF must be normalized to document');
            assert.equal(call.mediaUrl, 'https://cdn.bharatproperties.co/docs/Sector32_Brochure_Floorplan.pdf');
            assert.equal(call.filename, 'Sector32_Brochure_Floorplan.pdf');
            assert.ok(call.caption && typeof call.caption === 'string' && call.caption.includes('Royal Palms Penthouse'), 'Provider caption must contain property recommendation details');
            assert.equal(call.options.idempotencyKey, `rcpt_${res.data.campaignId}_whatsapp_9876543210`);
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('3. Template-based media/header resolution correctly resolves from SystemSetting and dispatches via provider', async () => {
        // Register WhatsApp template in SystemSetting with VIDEO header
        await SystemSetting.create({
            key: 'crm_whatsapp_templates',
            value: [
                {
                    id: 'tpl_virtual_video_tour',
                    name: 'tpl_virtual_video_tour',
                    headerType: 'VIDEO',
                    headerMediaUrl: 'https://cdn.bharatproperties.co/videos/penthouse_virtual_tour_4k.mp4',
                    headerFileName: 'penthouse_virtual_tour_4k.mp4',
                    content: 'Experience our ultra luxury penthouse walkthrough today!'
                }
            ]
        });

        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            // Omit explicit mediaUrl & headerText; provide templateId (with isBaileys for media delivery)
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                templateId: 'tpl_virtual_video_tour',
                isBaileys: true,
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            assert.equal(res.statusCode, 200);

            // Outbox check: template values resolved
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            assert.ok(outbox);
            assert.equal(outbox.payload.jobData.mediaUrl, 'https://cdn.bharatproperties.co/videos/penthouse_virtual_tour_4k.mp4');
            assert.equal(outbox.payload.jobData.mediaType, 'video');
            assert.equal(outbox.payload.jobData.headerFileName, 'penthouse_virtual_tour_4k.mp4');

            // DomainEventWorker
            await processDomainEventJob({ data: outbox });

            // MarketingWorker Parent
            await processMarketingJob({
                id: queueJobs[0].opts.jobId,
                name: queueJobs[0].name,
                data: queueJobs[0].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // MarketingWorker Child
            await processMarketingJob({
                id: queueJobs[1].opts.jobId,
                name: queueJobs[1].name,
                data: queueJobs[1].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // Provider verification
            assert.equal(providerCalls.sendMedia.length, 1);
            const call = providerCalls.sendMedia[0];
            assert.equal(call.mobile, '9876543210');
            assert.equal(call.type, 'video');
            assert.equal(call.mediaUrl, 'https://cdn.bharatproperties.co/videos/penthouse_virtual_tour_4k.mp4');
            assert.equal(call.filename, 'penthouse_virtual_tour_4k.mp4');
            assert.equal(call.caption, 'Experience our ultra luxury penthouse walkthrough today!', 'Provider caption must contain expected template content resolved from SystemSetting');
            assert.equal(call.options.idempotencyKey, `rcpt_${res.data.campaignId}_whatsapp_9876543210`);
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('4. Missing optional media/header fields falls back cleanly to plain text WhatsApp dispatch', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            // No mediaUrl, mediaType, headerFileName, or headerText
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            assert.equal(res.statusCode, 200);

            // Outbox check: media fields are null
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            assert.ok(outbox);
            assert.equal(outbox.payload.jobData.mediaUrl, null);
            assert.equal(outbox.payload.jobData.headerFileName, null);
            assert.equal(outbox.payload.jobData.headerText, null);

            // DomainEventWorker
            await processDomainEventJob({ data: outbox });

            // MarketingWorker Parent
            await processMarketingJob({
                id: queueJobs[0].opts.jobId,
                name: queueJobs[0].name,
                data: queueJobs[0].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // MarketingWorker Child
            await processMarketingJob({
                id: queueJobs[1].opts.jobId,
                name: queueJobs[1].name,
                data: queueJobs[1].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // sendMedia must NOT be called; sendMessage MUST be called
            assert.equal(providerCalls.sendMedia.length, 0, 'sendMedia must not be called without media');
            assert.equal(providerCalls.sendMessage.length, 1, 'sendMessage must be called for plain text');
            const call = providerCalls.sendMessage[0];
            assert.equal(call.mobile, '9876543210');
            assert.match(call.text, /Royal Palms Penthouse/);
            assert.equal(call.options.idempotencyKey, `rcpt_${res.data.campaignId}_whatsapp_9876543210`);
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('5. Outbox payload preservation contract validates all 4 media fields in top-level and meta', async () => {
        const req = createMockReq({
            dealIds: [testDeal._id.toString()],
            leadIds: [testLead._id.toString()],
            channels: ['whatsapp'],
            mediaUrl: 'https://cdn.bharatproperties.co/properties/villas/villa_highres.jpg',
            mediaType: 'image',
            headerFileName: 'villa_highres.jpg',
            headerText: 'Exclusive High-Res Villa Preview',
            meta: { title: 'Royal Palms Penthouse Sector 32' }
        });
        const res = createMockRes();

        await broadcastToBrokerGroup(req, res);
        assert.equal(res.statusCode, 200);

        const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
        assert.ok(outbox);

        const jd = outbox.payload.jobData;
        // Verify all 4 required fields survive in jobData
        assert.equal(jd.mediaUrl, 'https://cdn.bharatproperties.co/properties/villas/villa_highres.jpg');
        assert.equal(jd.mediaType, 'image');
        assert.equal(jd.headerFileName, 'villa_highres.jpg');
        assert.equal(jd.headerText, 'Exclusive High-Res Villa Preview');

        // Verify mirrored in meta
        assert.equal(jd.meta.mediaUrl, 'https://cdn.bharatproperties.co/properties/villas/villa_highres.jpg');
        assert.equal(jd.meta.mediaType, 'image');
        assert.equal(jd.meta.headerFileName, 'villa_highres.jpg');
        assert.equal(jd.meta.headerText, 'Exclusive High-Res Villa Preview');
    });

    it('6. Worker receives the exact expected media payload without loss or mutation', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                mediaUrl: 'https://cdn.bharatproperties.co/media/brochure_v2.pdf',
                mediaType: 'pdf',
                headerFileName: 'brochure_v2.pdf',
                headerText: 'Official Investment Dossier',
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            await processDomainEventJob({ data: outbox });

            // Check parent job payload received by worker
            const parentJob = queueJobs[0];
            assert.equal(parentJob.data.mediaUrl, 'https://cdn.bharatproperties.co/media/brochure_v2.pdf');
            assert.equal(parentJob.data.mediaType, 'document');
            assert.equal(parentJob.data.headerFileName, 'brochure_v2.pdf');
            assert.equal(parentJob.data.headerText, 'Official Investment Dossier');

            await processMarketingJob({
                id: parentJob.opts.jobId,
                name: parentJob.name,
                data: parentJob.data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // Check child job payload received by worker
            const childJob = queueJobs[1];
            assert.equal(childJob.data.mediaUrl, 'https://cdn.bharatproperties.co/media/brochure_v2.pdf');
            assert.equal(childJob.data.mediaType, 'document');
            assert.equal(childJob.data.headerFileName, 'brochure_v2.pdf');
            assert.equal(childJob.data.headerText, 'Official Investment Dossier');
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('7. Provider is called with correct recipient-level idempotency key', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                mediaUrl: 'https://cdn.bharatproperties.co/media/site_plan.jpg',
                mediaType: 'image',
                headerFileName: 'site_plan.jpg',
                headerText: 'Master Site Plan',
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            const campaignId = res.data.campaignId;

            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            await processDomainEventJob({ data: outbox });

            await processMarketingJob({
                id: queueJobs[0].opts.jobId,
                name: queueJobs[0].name,
                data: queueJobs[0].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            await processMarketingJob({
                id: queueJobs[1].opts.jobId,
                name: queueJobs[1].name,
                data: queueJobs[1].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            assert.equal(providerCalls.sendMedia.length, 1);
            const call = providerCalls.sendMedia[0];
            assert.equal(call.mobile, '9876543210');
            assert.equal(call.type, 'image');
            assert.equal(call.mediaUrl, 'https://cdn.bharatproperties.co/media/site_plan.jpg');
            assert.equal(call.filename, 'site_plan.jpg');
            assert.ok(call.caption && typeof call.caption === 'string' && call.caption.includes('Royal Palms Penthouse'), 'Provider caption must be valid');
            const expectedIdempotencyKey = `rcpt_${campaignId}_whatsapp_9876543210`;
            assert.equal(call.options.idempotencyKey, expectedIdempotencyKey);
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });

    it('8. Duplicate dispatch does not cause duplicate provider sends (idempotency fence & MarketingDelivery guard)', async () => {
        const queueJobs = [];
        const originalQueueAdd = marketingQueue.add;
        marketingQueue.add = async (name, data, opts) => {
            queueJobs.push({ name, data, opts });
            return { id: opts?.jobId || `mock_job_${Date.now()}` };
        };

        try {
            const req = createMockReq({
                dealIds: [testDeal._id.toString()],
                leadIds: [testLead._id.toString()],
                channels: ['whatsapp'],
                mediaUrl: 'https://cdn.bharatproperties.co/media/brochure.pdf',
                mediaType: 'pdf',
                headerFileName: 'brochure.pdf',
                headerText: 'Brochure PDF',
                meta: { title: 'Royal Palms Penthouse Sector 32' }
            });
            const res = createMockRes();

            await broadcastToBrokerGroup(req, res);
            const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
            await processDomainEventJob({ data: outbox });

            // 1st Run: Parent bna-broadcast
            await processMarketingJob({
                id: queueJobs[0].opts.jobId,
                name: queueJobs[0].name,
                data: queueJobs[0].data,
                log: async () => {},
                updateProgress: async () => {}
            });

            const childJob = queueJobs[1];

            // 1st Run: Child recipient dispatch
            await processMarketingJob({
                id: childJob.opts.jobId,
                name: childJob.name,
                data: childJob.data,
                log: async () => {},
                updateProgress: async () => {}
            });

            assert.equal(providerCalls.sendMedia.length, 1, 'First dispatch must call provider exactly once');
            const call = providerCalls.sendMedia[0];
            assert.equal(call.mobile, '9876543210');
            assert.equal(call.type, 'document');
            assert.equal(call.mediaUrl, 'https://cdn.bharatproperties.co/media/brochure.pdf');
            assert.equal(call.filename, 'brochure.pdf');
            assert.ok(call.caption && typeof call.caption === 'string' && call.caption.includes('Royal Palms Penthouse'), 'Provider caption must be valid');

            // Verify MarketingDelivery record exists and is ACCEPTED/SENT
            const deliveryRecord = await MarketingDelivery.findOne({
                jobId: res.data.campaignId,
                recipientId: '9876543210',
                channel: 'whatsapp'
            });
            assert.ok(deliveryRecord, 'MarketingDelivery record must be persisted');
            assert.equal(deliveryRecord.status, 'ACCEPTED');

            // 2nd Run (Simulated Retry / Duplicate execution of the same micro-job)
            await processMarketingJob({
                id: childJob.opts.jobId,
                name: childJob.name,
                data: childJob.data,
                log: async () => {},
                updateProgress: async () => {}
            });

            // Provider send count must STILL be 1 (duplicate was blocked by MarketingDelivery guard)
            assert.equal(providerCalls.sendMedia.length, 1, 'Second dispatch must NOT call provider again');
        } finally {
            marketingQueue.add = originalQueueAdd;
        }
    });
});
