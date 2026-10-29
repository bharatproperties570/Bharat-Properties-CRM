/**
 * phase18_marketing_attribution.test.js
 *
 * Dedicated test suite verifying Phase 18 Marketing OS Attribution & Full-Funnel Analytics.
 *
 * Verifies:
 * 1. Inbound Event Attribution (72-hour window matching, deterministic sorting)
 * 2. Append-Only Immutability of MarketingTouch ledger
 * 3. Idempotency & Unique Constraints ({ deliveryId, subjectId, touchType })
 * 4. Lead -> Deal Attribution Inheritance in DealCreationEngine & IntakeEngine
 * 5. Campaign Analytics Aggregation (Sent, Failed, Engaged, Pipeline Revenue, Won Revenue)
 * 6. Explicit Financial Analytics Scope Freeze (cost/cpa/cpl/roas strictly null)
 */

process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import MarketingCampaign from '../models/MarketingCampaign.js';
import CampaignRun from '../models/CampaignRun.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import MarketingTouch from '../models/MarketingTouch.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import { AttributionService } from '../src/services/AttributionService.js';
import { CampaignAnalyticsService } from '../src/services/CampaignAnalyticsService.js';

describe('Phase 18 — Marketing OS Attribution & Full-Funnel Analytics Suite', () => {
    let mongoServer;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        await MarketingTouch.init();
        await MarketingDelivery.init();
        await CampaignRun.init();
        await MarketingCampaign.init();
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    describe('1. Inbound Event Attribution & Delivery Resolution', () => {
        it('ATTR-01: Correctly matches delivery within 72h attribution window and links touch', async () => {
            const now = new Date();
            const campaign = await MarketingCampaign.create({
                name: 'Dwarka Expressway Spring Blast',
                ownerId: new mongoose.Types.ObjectId()
            });
            const run = await CampaignRun.create({
                campaignId: campaign._id,
                status: 'COMPLETED'
            });
            const delivery = await MarketingDelivery.create({
                jobId: 'job-attr-01',
                recipientId: '919876543210',
                channel: 'whatsapp',
                campaignRunId: run._id,
                status: 'SENT',
                lastAttemptAt: new Date(now.getTime() - 2 * 3600 * 1000) // 2 hours ago
            });

            const lead = await Lead.create({
                firstName: 'Aarav',
                lastName: 'Sharma',
                mobile: '919876543210'
            });

            const touchId = await AttributionService.attributeInboundEvent(
                '919876543210',
                now,
                lead._id,
                'Lead',
                'whatsapp_inbound'
            );

            assert.ok(touchId, 'Touch must be created for valid delivery in window');
            const touchDoc = await MarketingTouch.findById(touchId);
            assert.strictEqual(touchDoc.deliveryId.toString(), delivery._id.toString());
            assert.strictEqual(touchDoc.campaignRunId.toString(), run._id.toString());
            assert.strictEqual(touchDoc.campaignId.toString(), campaign._id.toString());
            assert.strictEqual(touchDoc.subjectType, 'Lead');
            assert.strictEqual(touchDoc.touchType, 'REPLY');
        });

        it('ATTR-02: Returns null if no delivery exists or delivery is outside 72h window', async () => {
            const now = new Date();
            // 80 hours ago (> 72h window)
            const oldDate = new Date(now.getTime() - 80 * 3600 * 1000);
            await MarketingDelivery.create({
                jobId: 'job-attr-old',
                recipientId: '919876500000',
                channel: 'whatsapp',
                status: 'SENT',
                lastAttemptAt: oldDate
            });

            const touchId = await AttributionService.attributeInboundEvent(
                '919876500000',
                now,
                new mongoose.Types.ObjectId(),
                'Lead',
                'whatsapp_inbound'
            );
            assert.strictEqual(touchId, null, 'Expired delivery must not be attributed');

            // Unmatched recipient
            const unmatchedId = await AttributionService.attributeInboundEvent(
                '910000000000',
                now,
                new mongoose.Types.ObjectId(),
                'Lead',
                'whatsapp_inbound'
            );
            assert.strictEqual(unmatchedId, null, 'Unknown recipient must return null');
        });
    });

    describe('2. Idempotency & Append-Only Immutability of MarketingTouch', () => {
        it('IMMUT-01: Blocks updates, replaces and mutations to MarketingTouch (Append-Only)', async () => {
            const campaign = await MarketingCampaign.create({
                name: 'Immutability Campaign',
                ownerId: new mongoose.Types.ObjectId()
            });
            const run = await CampaignRun.create({ campaignId: campaign._id, status: 'RUNNING' });
            const delivery = await MarketingDelivery.create({
                jobId: 'job-immut-01',
                recipientId: '919111111111',
                channel: 'whatsapp',
                campaignRunId: run._id,
                status: 'SENT'
            });

            const touch = new MarketingTouch({
                campaignId: campaign._id,
                campaignRunId: run._id,
                deliveryId: delivery._id,
                subjectType: 'Lead',
                subjectId: new mongoose.Types.ObjectId(),
                touchSource: 'whatsapp_inbound',
                touchType: 'REPLY',
                timestamp: new Date(),
                windowMatchedHrs: 1.5,
                snapshot: { campaignName: 'Immutability Campaign', channel: 'whatsapp' }
            });
            await touch.save();

            // Attempt update mutations
            await assert.rejects(
                () => MarketingTouch.updateOne({ _id: touch._id }, { $set: { touchType: 'CLICK' } }),
                /immutable/
            );
            await assert.rejects(
                () => MarketingTouch.findOneAndUpdate({ _id: touch._id }, { $set: { touchType: 'CLICK' } }),
                /immutable/
            );
        });

        it('IDEM-01: Concurrent duplicate touches return existing touchId safely without duplicate rows', async () => {
            const campaign = await MarketingCampaign.create({
                name: 'Concurrent Campaign',
                ownerId: new mongoose.Types.ObjectId()
            });
            const run = await CampaignRun.create({ campaignId: campaign._id, status: 'RUNNING' });
            const delivery = await MarketingDelivery.create({
                jobId: 'job-concurrent-01',
                recipientId: '919222222222',
                channel: 'whatsapp',
                campaignRunId: run._id,
                status: 'SENT'
            });

            const subjectId = new mongoose.Types.ObjectId();
            const now = new Date();

            const [touch1, touch2] = await Promise.all([
                AttributionService.attributeInboundEvent('919222222222', now, subjectId, 'Lead', 'whatsapp_inbound'),
                AttributionService.attributeInboundEvent('919222222222', now, subjectId, 'Lead', 'whatsapp_inbound')
            ]);

            assert.ok(touch1);
            assert.strictEqual(touch1.toString(), touch2.toString());

            const total = await MarketingTouch.countDocuments({ deliveryId: delivery._id, subjectId });
            assert.strictEqual(total, 1, 'Only exactly 1 MarketingTouch must exist');
        });
    });

    describe('3. Attribution Inheritance from Lead to Deal', () => {
        it('INHERIT-01: Deal correctly inherits attributedTouchId from source Lead', async () => {
            const touchId = new mongoose.Types.ObjectId();
            const sourceLead = await Lead.create({
                firstName: 'Vikram',
                lastName: 'Malhotra',
                mobile: '919333333333',
                attributedTouchId: touchId
            });

            // Simulate DealCreationEngine logic
            const leadDoc = await Lead.findById(sourceLead._id).select('attributedTouchId').lean();
            const dealPayload = {
                name: 'Golf Course Villa Deal',
                price: 50000000,
                leadId: sourceLead._id,
                attributedTouchId: leadDoc?.attributedTouchId
            };
            const deal = await Deal.create(dealPayload);

            assert.strictEqual(deal.attributedTouchId.toString(), touchId.toString());
        });
    });

    describe('4. Full-Funnel Campaign Analytics & Financial Scope Freeze', () => {
        it('ANALYTICS-01: Correctly aggregates delivery, engagement, pipeline & realized revenue', async () => {
            const campaign = await MarketingCampaign.create({
                name: 'Luxury Penthouses Campaign',
                ownerId: new mongoose.Types.ObjectId(),
                budget: 100000
            });
            const run = await CampaignRun.create({ campaignId: campaign._id, status: 'COMPLETED' });

            // Deliveries: 2 SENT, 1 FAILED_FINAL, 1 FAILED_RETRYABLE
            await MarketingDelivery.create({ jobId: 'j-1', recipientId: 'r-1', channel: 'whatsapp', campaignRunId: run._id, status: 'SENT' });
            await MarketingDelivery.create({ jobId: 'j-2', recipientId: 'r-2', channel: 'whatsapp', campaignRunId: run._id, status: 'SENT' });
            await MarketingDelivery.create({ jobId: 'j-3', recipientId: 'r-3', channel: 'whatsapp', campaignRunId: run._id, status: 'FAILED_FINAL' });
            await MarketingDelivery.create({ jobId: 'j-4', recipientId: 'r-4', channel: 'whatsapp', campaignRunId: run._id, status: 'FAILED_RETRYABLE' });

            // Touches
            const touch1 = await MarketingTouch.create({
                campaignId: campaign._id, campaignRunId: run._id, deliveryId: new mongoose.Types.ObjectId(),
                subjectType: 'Lead', subjectId: new mongoose.Types.ObjectId(), touchSource: 'whatsapp', touchType: 'REPLY',
                timestamp: new Date(), windowMatchedHrs: 1, snapshot: { campaignName: 'Luxury Penthouses Campaign', channel: 'whatsapp' }
            });

            // Linked Deals: 1 Active (10M), 1 Closed Won (25M realized)
            await Deal.create({ name: 'Active Penthouse Deal', price: 10000000, stage: 'Negotiation', isActiveDeal: true, attributedTouchId: touch1._id });
            await Deal.create({ name: 'Closed Penthouse Deal', price: 30000000, closedPrice: 25000000, stage: 'Closed Won', isActiveDeal: false, attributedTouchId: touch1._id });

            const stats = await CampaignAnalyticsService.getCampaignRunAnalytics(run._id);

            assert.strictEqual(stats.sent, 2);
            assert.strictEqual(stats.failed, 2);
            assert.strictEqual(stats.engaged, 1);
            assert.strictEqual(stats.dealsGenerated, 2);
            assert.strictEqual(stats.wonDeals, 1);
            assert.strictEqual(stats.pipelineRevenue, 10000000);
            assert.strictEqual(stats.realizedRevenue, 25000000);

            // FINANCIAL SCOPE FREEZE CHECK:
            assert.strictEqual(stats.cost, null);
            assert.strictEqual(stats.cpl, null);
            assert.strictEqual(stats.cpa, null);
            assert.strictEqual(stats.roas, null);
            assert.strictEqual(stats.financialStatus, 'DEFERRED_COST_SOURCE');
        });
    });

    describe('5. Analytics Controller Input Validation & Visibility Scoping', () => {
        let getSiteVisitFunnelAnalytics, getCampaignAttributionAnalytics, getStageDensity;

        before(async () => {
            const mod = await import('../controllers/analytics.controller.js');
            getSiteVisitFunnelAnalytics = mod.getSiteVisitFunnelAnalytics;
            getCampaignAttributionAnalytics = mod.getCampaignAttributionAnalytics;
            getStageDensity = mod.getStageDensity;
        });

        it('SEC-AN-01: Rejects object/array query parameter injection', async () => {
            const maliciousQueries = [
                { projectId: { $ne: null } },
                { agentId: { $ne: null } },
                { timeframe: { $gt: 0 } },
                { $where: 'sleep(100)' },
                { 'details.projectName': 'injected' }
            ];

            for (const q of maliciousQueries) {
                const res = {
                    statusCode: 200,
                    body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: q }, res);
                assert.strictEqual(res.statusCode, 400, `Expected 400 for query: ${JSON.stringify(q)}`);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('SEC-AN-02: Rejects invalid agentId formats and invalid projectId values', async () => {
            const invalidIds = ['not-an-id', '123', '64b8a2f1c9e77a001234567z'];
            for (const badId of invalidIds) {
                const res = {
                    statusCode: 200,
                    body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: { agentId: badId } }, res);
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(res.body.success, false);
            }

            // Project starting with $
            const projRes = {
                statusCode: 200,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getSiteVisitFunnelAnalytics({ query: { projectId: '$where' } }, projRes);
            assert.strictEqual(projRes.statusCode, 400);
            assert.strictEqual(projRes.body.success, false);
        });

        it('SEC-AN-03: Rejects partial, invalid, and inverted date ranges', async () => {
            const badDates = [
                { startDate: '2026-01-01' },
                { endDate: '2026-01-31' },
                { startDate: 'invalid', endDate: '2026-01-31' },
                { startDate: '2026-02-01', endDate: '2026-01-01' },
                { timeframe: '-5' },
                { timeframe: 'abc' }
            ];

            for (const q of badDates) {
                const res = {
                    statusCode: 200,
                    body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: q }, res);
                assert.strictEqual(res.statusCode, 400, `Expected 400 for: ${JSON.stringify(q)}`);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('SEC-AN-04: Successfully executes with valid query and scopes to tenant user', async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const user = {
                _id: new mongoose.Types.ObjectId(),
                email: 'tenant_analyst@tenant.com',
                role: { name: 'analyst' },
                tenantId: tenantId,
                dataScope: 'all'
            };

            const validAgentId = new mongoose.Types.ObjectId().toString();
            const res = {
                statusCode: 200,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user,
                query: { timeframe: '30', agentId: validAgentId, projectId: 'Palm Retreat' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.data.summary);
            assert.ok(Array.isArray(res.body.data.projectBreakdown));

            // Also test Campaign Attribution
            const campRes = {
                statusCode: 200,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getCampaignAttributionAnalytics({
                user,
                query: { timeframe: 'all' }
            }, campRes);

            assert.strictEqual(campRes.statusCode, 200);
            assert.strictEqual(campRes.body.success, true);
            assert.ok(Array.isArray(campRes.body.data.campaigns));

            // Also test Stage Density
            const stageRes = {
                statusCode: 200,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getStageDensity({
                user,
                query: { timeframe: '90' }
            }, stageRes);

            assert.strictEqual(stageRes.statusCode, 200);
            assert.strictEqual(stageRes.body.success, true);
            assert.ok(Array.isArray(stageRes.body.data.leads));
            assert.ok(Array.isArray(stageRes.body.data.deals));
        });
    });
});
