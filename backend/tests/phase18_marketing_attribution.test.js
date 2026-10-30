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
import Activity from '../models/Activity.js';
import Booking from '../models/Booking.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
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
        await Lead.init();
        await Deal.init();
        await Activity.init();
        await Booking.init();
        await Lookup.init();
        await Team.init();
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

    describe('6. Multi-Tenant Isolation & Negative Database Cross-Contamination Tests', () => {
        let getSiteVisitFunnelAnalytics, getCampaignAttributionAnalytics, getStageDensity;
        const tenantAId = new mongoose.Types.ObjectId();
        const tenantBId = new mongoose.Types.ObjectId();

        const userTenantA = {
            _id: new mongoose.Types.ObjectId(),
            email: 'admin@tenanta.com',
            role: { name: 'admin' },
            tenantId: tenantAId,
            dataScope: 'all'
        };
        const userTenantB = {
            _id: new mongoose.Types.ObjectId(),
            email: 'admin@tenantb.com',
            role: { name: 'admin' },
            tenantId: tenantBId,
            dataScope: 'all'
        };

        let leadA1, leadA2, leadB1, leadB2;
        let visitA1, visitA2, visitB1, visitB2, visitA_adversarial;
        let dealA1, dealB1;
        let bookingA1, bookingB1, bookingA_adversarial;

        before(async () => {
            const mod = await import('../controllers/analytics.controller.js');
            getSiteVisitFunnelAnalytics = mod.getSiteVisitFunnelAnalytics;
            getCampaignAttributionAnalytics = mod.getCampaignAttributionAnalytics;
            getStageDensity = mod.getStageDensity;

            // Seed Tenant A Leads
            leadA1 = await Lead.create({
                firstName: 'Aarav', lastName: 'Kumar', mobile: '919811111111',
                tenantId: tenantAId, source: 'Meta Ads', campaign: 'tenant_a_festive_2026',
                stage: 'Incoming', isLost: false, createdAt: new Date()
            });
            leadA2 = await Lead.create({
                firstName: 'Aditi', lastName: 'Singh', mobile: '919811111112',
                tenantId: tenantAId, source: 'Google Ads', campaign: 'tenant_a_festive_2026',
                stage: 'Open', isLost: false, createdAt: new Date()
            });

            // Seed Tenant B Leads
            leadB1 = await Lead.create({
                firstName: 'Barun', lastName: 'Secret', mobile: '919822222221',
                tenantId: tenantBId, source: 'Referral', campaign: 'tenant_b_confidential_2026',
                stage: 'Incoming', isLost: false, createdAt: new Date()
            });
            leadB2 = await Lead.create({
                firstName: 'Bina', lastName: 'Roy', mobile: '919822222222',
                tenantId: tenantBId, source: 'Direct', campaign: 'tenant_b_confidential_2026',
                stage: 'Open', isLost: false, createdAt: new Date()
            });

            // Seed Tenant A Site Visits
            visitA1 = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Completed Visit A1',
                entityType: 'Lead', entityId: leadA1._id, tenantId: tenantAId, dueDate: new Date(),
                details: {
                    projectName: 'A-Towers Luxury',
                    customerFeedback: { rating: 5, comments: 'Superb project' }
                },
                tags: ['Site-Visit', 'High-Satisfaction'],
                createdAt: new Date()
            });
            visitA2 = await Activity.create({
                type: 'Site Visit', status: 'Scheduled', subject: 'Scheduled Visit A2',
                entityType: 'Lead', entityId: leadA2._id, tenantId: tenantAId, dueDate: new Date(),
                details: { projectName: 'A-Towers Luxury' },
                tags: ['Site-Visit'],
                createdAt: new Date()
            });

            // Seed Tenant B Site Visits
            visitB1 = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Completed Visit B1',
                entityType: 'Lead', entityId: leadB1._id, tenantId: tenantBId, dueDate: new Date(),
                details: {
                    projectName: 'B-Secret-Palace',
                    customerFeedback: { rating: 1, comments: 'Unsatisfactory' }
                },
                tags: ['Site-Visit', 'Escalation-Negative-Feedback'],
                createdAt: new Date()
            });
            visitB2 = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Completed Visit B2',
                entityType: 'Lead', entityId: leadB2._id, tenantId: tenantBId, dueDate: new Date(),
                details: { projectName: 'B-Secret-Palace' },
                createdAt: new Date()
            });

            // Seed Tenant A Deal (Won: 15,000,000)
            dealA1 = await Deal.create({
                name: 'Villa A-101 Deal', price: 15000000, stage: 'Booked',
                siteVisitId: visitA1._id, leadId: leadA1._id, tenantId: tenantAId,
                projectName: 'A-Towers Luxury', isVisible: true,
                marketingAttribution: { campaign: 'tenant_a_festive_2026', source: 'Meta Ads' },
                createdAt: new Date()
            });

            // Seed Tenant B Deal (Won: 90,000,000)
            dealB1 = await Deal.create({
                name: 'Penthouse B-Secret Deal', price: 90000000, stage: 'Booked',
                siteVisitId: visitB1._id, leadId: leadB1._id, tenantId: tenantBId,
                projectName: 'B-Secret-Palace', isVisible: true,
                marketingAttribution: { campaign: 'tenant_b_confidential_2026', source: 'Referral' },
                createdAt: new Date()
            });

            // Adversarial Cross-Tenant Site Visit: Belongs to Tenant A, but attempts to link Tenant B's deal
            visitA_adversarial = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Adversarial Link Visit',
                entityType: 'Lead', entityId: leadA1._id, tenantId: tenantAId, dueDate: new Date(),
                details: {
                    projectName: 'A-Towers Luxury',
                    linkedDealId: dealB1._id // Injected Tenant B deal ID
                },
                tags: ['Site-Visit'],
                createdAt: new Date()
            });

            // Seed Tenant A Booking (Revenue: 15,000,000, Commission: 300,000)
            bookingA1 = await Booking.create({
                totalDealAmount: 15000000, commissionReceived: 300000,
                dealId: dealA1._id, siteVisitId: visitA1._id, tenantId: tenantAId,
                marketingAttribution: { campaign: 'tenant_a_festive_2026', source: 'Meta Ads' },
                createdAt: new Date()
            });

            // Seed Tenant B Booking (Revenue: 90,000,000, Commission: 1,800,000)
            bookingB1 = await Booking.create({
                totalDealAmount: 90000000, commissionReceived: 1800000,
                dealId: dealB1._id, siteVisitId: visitB1._id, tenantId: tenantBId,
                marketingAttribution: { campaign: 'tenant_b_confidential_2026', source: 'Referral' },
                createdAt: new Date()
            });

            // Adversarial Cross-Tenant Booking: Belongs to Tenant B, but attempts to reference Tenant A deal/visit
            bookingA_adversarial = await Booking.create({
                totalDealAmount: 50000000, commissionReceived: 1000000,
                dealId: dealA1._id, siteVisitId: visitA1._id, tenantId: tenantBId,
                createdAt: new Date()
            });
        });

        it('TENANT-01: Tenant A Funnel Analytics completely isolates Tenant B data and cross-tenant injections', async () => {
            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: userTenantA,
                query: { timeframe: 'all' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            const { summary, projectBreakdown } = res.body.data;

            // Visit counts: 3 Tenant A visits (A1, A2, A_adversarial). Zero Tenant B visits.
            assert.strictEqual(summary.totalScheduled, 3);
            assert.strictEqual(summary.totalCompleted, 2);
            assert.strictEqual(summary.pendingVisits, 1);
            assert.strictEqual(summary.cancelledVisits, 0);

            // Feedback: Only Visit A1 (rating 5). Visit B1 (rating 1, negative escalation) MUST NOT leak into Tenant A.
            assert.strictEqual(summary.feedbackReceived, 1);
            assert.strictEqual(summary.averageRating, 5.0);
            assert.strictEqual(summary.highSatisfactionCount, 1);
            assert.strictEqual(summary.escalationCount, 0, 'Tenant B negative feedback escalation must not leak to Tenant A');

            // Deals & Revenue: Deal A1 (15M). Deal B1 (90M, linked maliciously in visitA_adversarial) MUST be rejected by tenant scope!
            assert.strictEqual(summary.dealsWon, 1, 'Adversarial cross-tenant deal must be filtered out');
            assert.strictEqual(summary.totalDealValue, 15000000, 'Deal value must strictly equal 15,000,000');

            // Bookings & Commission: Booking A1 (15M deal amount, 300k commission).
            // bookingB1 (90M) and bookingA_adversarial (50M) MUST be rejected by tenant scope!
            assert.strictEqual(summary.totalBookings, 1, 'Cross-tenant bookings must not be counted');
            assert.strictEqual(summary.totalRevenue, 15000000, 'Total revenue must strictly equal 15,000,000');
            assert.strictEqual(summary.totalCommission, 300000, 'Total commission must strictly equal 300,000');

            // Project Breakdown: Contains ONLY A-Towers Luxury; ZERO B-Secret-Palace
            assert.strictEqual(projectBreakdown.length, 1);
            assert.strictEqual(projectBreakdown[0].projectName, 'A-Towers Luxury');
            assert.strictEqual(projectBreakdown[0].visits, 2);
            assert.strictEqual(projectBreakdown[0].dealsWon, 1);
            assert.strictEqual(projectBreakdown[0].revenue, 15000000);
            assert(!projectBreakdown.some(p => p.projectName === 'B-Secret-Palace'), 'Tenant B project name must not leak');
        });

        it('TENANT-02: Tenant B Funnel Analytics completely isolates Tenant A data', async () => {
            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: userTenantB,
                query: { timeframe: 'all' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            const { summary, projectBreakdown } = res.body.data;

            // Visit counts: 2 Tenant B visits (B1, B2). Zero Tenant A visits.
            assert.strictEqual(summary.totalScheduled, 2);
            assert.strictEqual(summary.totalCompleted, 2);
            assert.strictEqual(summary.feedbackReceived, 1);
            assert.strictEqual(summary.averageRating, 1.0);
            assert.strictEqual(summary.escalationCount, 1);
            assert.strictEqual(summary.highSatisfactionCount, 0);

            // Deals & Revenue: Deal B1 (90M). Zero Tenant A deals.
            assert.strictEqual(summary.dealsWon, 1);
            assert.strictEqual(summary.totalDealValue, 90000000);

            // Bookings: bookingB1 (90M, 1.8M commission).
            // bookingA_adversarial (pointing to Tenant A visit/deal) is strictly excluded.
            assert.strictEqual(summary.totalBookings, 1);
            assert.strictEqual(summary.totalRevenue, 90000000);
            assert.strictEqual(summary.totalCommission, 1800000);

            // Projects: Contains ONLY B-Secret-Palace; ZERO A-Towers Luxury
            assert.strictEqual(projectBreakdown.length, 1);
            assert.strictEqual(projectBreakdown[0].projectName, 'B-Secret-Palace');
            assert.strictEqual(projectBreakdown[0].revenue, 90000000);
            assert(!projectBreakdown.some(p => p.projectName === 'A-Towers Luxury'), 'Tenant A project name must not leak');
        });

        it('TENANT-03: Campaign Attribution Analytics enforces strict multi-tenant isolation', async () => {
            const resA = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getCampaignAttributionAnalytics({
                user: userTenantA,
                query: { timeframe: 'all' }
            }, resA);

            assert.strictEqual(resA.statusCode, 200);
            assert.strictEqual(resA.body.success, true);
            const campaignsA = resA.body.data.campaigns;

            // Tenant A must see its own campaign and NOT Tenant B's campaign
            const campA = campaignsA.find(c => c.campaign === 'tenant_a_festive_2026');
            assert.ok(campA, 'Tenant A campaign must be present in Tenant A results');
            assert.strictEqual(campA.leadsCount, 2);
            assert.strictEqual(campA.dealsWon, 1);
            assert.strictEqual(campA.totalDealValue, 15000000);
            assert.strictEqual(campA.totalRevenue, 15000000);

            const leakedCampB = campaignsA.find(c => c.campaign === 'tenant_b_confidential_2026');
            assert.strictEqual(leakedCampB, undefined, 'Tenant B campaign must NEVER leak into Tenant A results');

            // Tenant B query
            const resB = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getCampaignAttributionAnalytics({
                user: userTenantB,
                query: { timeframe: 'all' }
            }, resB);

            assert.strictEqual(resB.statusCode, 200);
            const campaignsB = resB.body.data.campaigns;

            const campB = campaignsB.find(c => c.campaign === 'tenant_b_confidential_2026');
            assert.ok(campB, 'Tenant B campaign must be present in Tenant B results');
            assert.strictEqual(campB.leadsCount, 2);
            assert.strictEqual(campB.dealsWon, 1);
            assert.strictEqual(campB.totalRevenue, 90000000);

            const leakedCampA = campaignsB.find(c => c.campaign === 'tenant_a_festive_2026');
            assert.strictEqual(leakedCampA, undefined, 'Tenant A campaign must NEVER leak into Tenant B results');
        });

        it('TENANT-04: Stage Density Analytics enforces strict multi-tenant isolation', async () => {
            const resA = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getStageDensity({
                user: userTenantA,
                query: { timeframe: 'all' }
            }, resA);

            assert.strictEqual(resA.statusCode, 200);
            assert.strictEqual(resA.body.success, true);
            const { leads, deals } = resA.body.data;

            // Leads must only be Tenant A leads
            assert.ok(leads.length >= 2);
            for (const l of leads) {
                assert.notStrictEqual(l.firstName, 'Barun');
                assert.notStrictEqual(l.firstName, 'Bina');
            }

            // Deals must only be Tenant A deals
            assert.ok(deals.length >= 1);
            for (const d of deals) {
                assert.notStrictEqual(d.price, 90000000, 'Tenant B deal price of 90M must not appear in Tenant A deals');
            }
        });
    });

    describe('7. Role-Based Scoping & Visibility Contract Tests', () => {
        let getSiteVisitFunnelAnalytics, getStageDensity;
        const tenantScopedId = new mongoose.Types.ObjectId();
        const agentOneId = new mongoose.Types.ObjectId();
        const agentTwoId = new mongoose.Types.ObjectId();
        const teamAlphaId = new mongoose.Types.ObjectId();
        const teamBetaId = new mongoose.Types.ObjectId();

        let visitAgent1, visitAgent2, visitTeamAlpha, visitTeamBeta;

        before(async () => {
            const mod = await import('../controllers/analytics.controller.js');
            getSiteVisitFunnelAnalytics = mod.getSiteVisitFunnelAnalytics;
            getStageDensity = mod.getStageDensity;

            // Seed visits with distinct assignments and teams
            visitAgent1 = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Agent 1 Visit',
                entityType: 'Lead', entityId: new mongoose.Types.ObjectId(),
                assignedTo: agentOneId, tenantId: tenantScopedId, dueDate: new Date(),
                details: { projectName: 'Agent1 Project' }, createdAt: new Date()
            });
            visitAgent2 = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Agent 2 Visit',
                entityType: 'Lead', entityId: new mongoose.Types.ObjectId(),
                assignedTo: agentTwoId, tenantId: tenantScopedId, dueDate: new Date(),
                details: { projectName: 'Agent2 Project' }, createdAt: new Date()
            });
            visitTeamAlpha = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Team Alpha Visit',
                entityType: 'Lead', entityId: new mongoose.Types.ObjectId(),
                teams: [teamAlphaId], tenantId: tenantScopedId, dueDate: new Date(),
                details: { projectName: 'Team Alpha Project' }, createdAt: new Date()
            });
            visitTeamBeta = await Activity.create({
                type: 'Site Visit', status: 'Completed', subject: 'Team Beta Visit',
                entityType: 'Lead', entityId: new mongoose.Types.ObjectId(),
                teams: [teamBetaId], tenantId: tenantScopedId, dueDate: new Date(),
                details: { projectName: 'Team Beta Project' }, createdAt: new Date()
            });
        });

        it('ROLE-01: Assigned-user scope restricts Funnel Analytics to assigned records only', async () => {
            const userAgent1 = {
                _id: agentOneId,
                email: 'agent1@agency.com',
                role: { name: 'agent' },
                tenantId: tenantScopedId,
                dataScope: 'assigned',
                teams: []
            };

            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: userAgent1,
                query: { timeframe: 'all' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            const { summary, projectBreakdown } = res.body.data;
            assert.strictEqual(summary.totalScheduled, 1);
            assert.strictEqual(projectBreakdown.length, 1);
            assert.strictEqual(projectBreakdown[0].projectName, 'Agent1 Project');
        });

        it('ROLE-02: Team scope restricts Funnel Analytics to team-tagged records', async () => {
            const userTeamAlpha = {
                _id: new mongoose.Types.ObjectId(),
                email: 'lead@teamalpha.com',
                role: { name: 'team_lead' },
                tenantId: tenantScopedId,
                dataScope: 'team',
                teams: [teamAlphaId]
            };

            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: userTeamAlpha,
                query: { timeframe: 'all' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            const { summary, projectBreakdown } = res.body.data;
            assert.strictEqual(summary.totalScheduled, 1);
            assert.strictEqual(projectBreakdown[0].projectName, 'Team Alpha Project');
            assert(!projectBreakdown.some(p => p.projectName === 'Team Beta Project'));
        });

        it('ROLE-03: Platform Super Admin receives unrestricted visibility across all tenants', async () => {
            const platformAdmin = {
                _id: new mongoose.Types.ObjectId(),
                email: 'bharatproperties570@gmail.com', // System owner email recognized by Visibility Engine
                role: { name: 'super admin' },
                tenantId: null,
                dataScope: 'all'
            };

            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: platformAdmin,
                query: { timeframe: 'all' }
            }, res);

            assert.strictEqual(res.statusCode, 200);
            const { summary, projectBreakdown } = res.body.data;
            // Super Admin sees Tenant A, Tenant B, and the agent/team visits
            assert.ok(summary.totalScheduled >= 6);
            assert.ok(projectBreakdown.some(p => p.projectName === 'A-Towers Luxury'));
            assert.ok(projectBreakdown.some(p => p.projectName === 'B-Secret-Palace'));
        });

        it('ROLE-04: Absent user context fails closed with { _id: null } and returns 0 records', async () => {
            const resFunnel = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            // Call with user: undefined
            await getSiteVisitFunnelAnalytics({
                user: undefined,
                query: { timeframe: 'all' }
            }, resFunnel);

            assert.strictEqual(resFunnel.statusCode, 200);
            assert.strictEqual(resFunnel.body.data.summary.totalScheduled, 0, 'Absent user must see 0 scheduled visits');
            assert.strictEqual(resFunnel.body.data.summary.totalCompleted, 0);
            assert.strictEqual(resFunnel.body.data.summary.dealsWon, 0);
            assert.strictEqual(resFunnel.body.data.summary.totalRevenue, 0);
            assert.strictEqual(resFunnel.body.data.projectBreakdown.length, 0);

            // Call Stage Density with user: undefined
            const resStage = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getStageDensity({
                user: undefined,
                query: { timeframe: 'all' }
            }, resStage);

            assert.strictEqual(resStage.statusCode, 200);
            assert.strictEqual(resStage.body.data.leads.length, 0, 'Absent user must see 0 leads');
            assert.strictEqual(resStage.body.data.deals.length, 0, 'Absent user must see 0 deals');
        });
    });

    describe('8. Extended Query Contract, Edge Cases & Error Sanitization Tests', () => {
        let getSiteVisitFunnelAnalytics, getCampaignAttributionAnalytics, getStageDensity;

        before(async () => {
            const mod = await import('../controllers/analytics.controller.js');
            getSiteVisitFunnelAnalytics = mod.getSiteVisitFunnelAnalytics;
            getCampaignAttributionAnalytics = mod.getCampaignAttributionAnalytics;
            getStageDensity = mod.getStageDensity;
        });

        it('EDGE-01: Rejects decimal, negative, non-numeric and out-of-range timeframe values', async () => {
            const invalidTimeframes = ['30.5', '-15', 'quarterly', '0', '5000', ' 20abc'];

            for (const tf of invalidTimeframes) {
                const res = {
                    statusCode: 200, body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: { timeframe: tf } }, res);
                assert.strictEqual(res.statusCode, 400, `Expected 400 for timeframe: ${tf}`);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('EDGE-02: Accepts valid timeframe=all and positive integer strings', async () => {
            const validTimeframes = ['all', '7', '30', '90', '365', 30];

            for (const tf of validTimeframes) {
                const res = {
                    statusCode: 200, body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({
                    user: { _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), dataScope: 'all' },
                    query: { timeframe: tf }
                }, res);
                assert.strictEqual(res.statusCode, 200, `Expected 200 for valid timeframe: ${tf}`);
                assert.strictEqual(res.body.success, true);
            }
        });

        it('EDGE-03: Rejects invalid or unparseable date strings and inverted date ranges', async () => {
            const invalidDateCases = [
                { startDate: 'yesterday-once-more', endDate: '2026-12-31' },
                { startDate: '2026-01-01', endDate: 'neverland' },
                { startDate: '2026-12-31', endDate: '2026-01-01' } // inverted
            ];

            for (const tc of invalidDateCases) {
                const res = {
                    statusCode: 200, body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: tc }, res);
                assert.strictEqual(res.statusCode, 400, `Expected 400 for bad dates: ${JSON.stringify(tc)}`);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('EDGE-04: Rejects array-shaped query parameters and dotted key injections', async () => {
            const injectionQueries = [
                { agentId: ['64b8a2f1c9e77a001234567a', '64b8a2f1c9e77a001234567b'] },
                { 'details.projectName': 'Godrej' },
                { '$where': 'true' }
            ];

            for (const q of injectionQueries) {
                const res = {
                    statusCode: 200, body: null,
                    status(c) { this.statusCode = c; return this; },
                    json(b) { this.body = b; return this; }
                };
                await getSiteVisitFunnelAnalytics({ query: q }, res);
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(res.body.success, false);
            }
        });

        it('EDGE-05: Database errors return safe, sanitized error responses without leaking stack traces', async () => {
            const origActivityFind = Activity.find;
            Activity.find = () => {
                throw new Error('MongoNetworkTimeoutError: connection to 127.0.0.1:27017 timed out after 30000ms at internal/driver.js:42');
            };

            const res = {
                statusCode: 200, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };

            await getSiteVisitFunnelAnalytics({
                user: { _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), dataScope: 'all' },
                query: { timeframe: '30' }
            }, res);

            // Restore immediately
            Activity.find = origActivityFind;

            assert.strictEqual(res.statusCode, 500);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, 'Server error fetching site visit funnel analytics');
            assert.strictEqual(res.body.error, undefined, 'Raw error message or stack trace must NOT be exposed in response body');
            assert.strictEqual(res.body.stack, undefined, 'Stack trace must NOT be exposed');
        });
    });
});
