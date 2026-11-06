import assert from 'assert';
import mongoose from 'mongoose';

let passed = 0;
let failed = 0;

function record(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failed++;
    }
}

async function recordAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failed++;
    }
}

console.log('=== Phase 7: Analytics & Reporting Aggregation Suite ===');

async function runTests() {
    const { getSiteVisitFunnelAnalytics, getCampaignAttributionAnalytics } = await import('../controllers/analytics.controller.js');

    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Deal = mongoose.models.Deal || mongoose.model('Deal');
    const Booking = mongoose.models.Booking || mongoose.model('Booking');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const Lookup = mongoose.models.Lookup || mongoose.model('Lookup');

    const origActFind = Activity.find;
    const origDealFind = Deal.find;
    const origBookingFind = Booking.find;
    const origLeadFind = Lead.find;
    const origLookupFind = Lookup.find;

    Lookup.find = () => ({ lean: () => Promise.resolve([]) });

    console.log('\n--- 1. Site Visit Funnel Analytics ---');
    await recordAsync('getSiteVisitFunnelAnalytics computes full closed-loop funnel and satisfaction ratings', async () => {
        const visit1Id = new mongoose.Types.ObjectId();
        const visit2Id = new mongoose.Types.ObjectId();
        const visit3Id = new mongoose.Types.ObjectId();
        const deal1Id = new mongoose.Types.ObjectId();

        const mockVisits = [
            {
                _id: visit1Id,
                type: 'Site Visit',
                status: 'Completed',
                details: {
                    projectName: 'Godrej Woods',
                    customerFeedback: { rating: 5, comments: 'Superb project' },
                    linkedDealId: deal1Id
                },
                tags: ['Site-Visit', 'High-Satisfaction'],
                createdAt: new Date()
            },
            {
                _id: visit2Id,
                type: 'Site Visit',
                status: 'Completed',
                details: {
                    projectName: 'Godrej Woods',
                    customerFeedback: { rating: 2, comments: 'Far from highway' }
                },
                tags: ['Site-Visit', 'Escalation-Negative-Feedback'],
                createdAt: new Date()
            },
            {
                _id: visit3Id,
                type: 'Site Visit',
                status: 'Scheduled',
                details: {
                    projectName: 'DLF Magnolias'
                },
                tags: ['Site-Visit'],
                createdAt: new Date()
            }
        ];

        const mockDeals = [
            {
                _id: deal1Id,
                siteVisitId: visit1Id,
                projectName: 'Godrej Woods',
                stage: 'Booked',
                price: 25000000
            }
        ];

        const mockBookings = [
            {
                _id: new mongoose.Types.ObjectId(),
                siteVisitId: visit1Id,
                dealId: deal1Id,
                totalDealAmount: 25000000,
                commissionReceived: 500000
            }
        ];

        Activity.find = () => ({
            lean: () => Promise.resolve(mockVisits)
        });

        Deal.find = () => ({
            lean: () => Promise.resolve(mockDeals)
        });

        Booking.find = () => ({
            lean: () => Promise.resolve(mockBookings)
        });

        const req = {
            query: { timeframe: '30' }
        };

        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getSiteVisitFunnelAnalytics(req, res);

        assert.strictEqual(res.body.success, true);
        const { summary, projectBreakdown } = res.body.data;

        assert.strictEqual(summary.totalScheduled, 3);
        assert.strictEqual(summary.totalCompleted, 2);
        assert.strictEqual(summary.pendingVisits, 1);
        assert.strictEqual(summary.completionRate, 66.7);
        assert.strictEqual(summary.feedbackReceived, 2);
        assert.strictEqual(summary.feedbackRate, 100);
        assert.strictEqual(summary.averageRating, 3.5);
        assert.strictEqual(summary.highSatisfactionCount, 1);
        assert.strictEqual(summary.escalationCount, 1);
        assert.strictEqual(summary.dealsCreated, 1);
        assert.strictEqual(summary.dealsWon, 1);
        assert.strictEqual(summary.conversionRate, 50.0);
        assert.strictEqual(summary.totalBookings, 1);
        assert.strictEqual(summary.totalRevenue, 25000000);
        assert.strictEqual(summary.totalCommission, 500000);

        assert(projectBreakdown.length > 0);
        const godrej = projectBreakdown.find(p => p.projectName === 'Godrej Woods');
        assert(godrej);
        assert.strictEqual(godrej.visits, 2);
        assert.strictEqual(godrej.dealsWon, 1);
    });

    console.log('\n--- 2. Campaign ROI Attribution Analytics ---');
    await recordAsync('getCampaignAttributionAnalytics aggregates leads, visits, deals, and revenue per campaign', async () => {
        const lead1Id = new mongoose.Types.ObjectId();
        const lead2Id = new mongoose.Types.ObjectId();
        const visit1Id = new mongoose.Types.ObjectId();
        const deal1Id = new mongoose.Types.ObjectId();

        const mockLeads = [
            {
                _id: lead1Id,
                source: 'Meta Ads',
                campaign: 'diwali_villa_2026',
                source_meta: { utm_source: 'meta', utm_campaign: 'diwali_villa_2026' }
            },
            {
                _id: lead2Id,
                source: 'Google Ads',
                campaign: 'search_luxury_gurgaon',
                source_meta: { utm_source: 'google', utm_campaign: 'search_luxury_gurgaon' }
            }
        ];

        const mockVisits = [
            {
                _id: visit1Id,
                entityId: lead1Id,
                entityType: 'Lead',
                type: 'Site Visit',
                status: 'Completed'
            }
        ];

        const mockDeals = [
            {
                _id: deal1Id,
                leadId: lead1Id,
                siteVisitId: visit1Id,
                stage: 'Closed Won',
                price: 18000000,
                marketingAttribution: { campaign: 'diwali_villa_2026', source: 'meta' }
            }
        ];

        const mockBookings = [
            {
                _id: new mongoose.Types.ObjectId(),
                lead: lead1Id,
                dealId: deal1Id,
                totalDealAmount: 18000000,
                marketingAttribution: { campaign: 'diwali_villa_2026', source: 'meta' }
            }
        ];

        Lead.find = () => ({
            select: () => ({
                lean: () => Promise.resolve(mockLeads)
            })
        });

        Activity.find = () => ({
            select: () => ({
                lean: () => Promise.resolve(mockVisits)
            })
        });

        Deal.find = () => ({
            select: () => ({
                lean: () => Promise.resolve(mockDeals)
            })
        });

        Booking.find = () => ({
            select: () => ({
                lean: () => Promise.resolve(mockBookings)
            })
        });

        const req = {
            query: { timeframe: '90' }
        };

        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getCampaignAttributionAnalytics(req, res);

        assert.strictEqual(res.body.success, true);
        const { totalCampaigns, campaigns } = res.body.data;
        assert(totalCampaigns >= 2);

        const diwali = campaigns.find(c => c.campaign === 'diwali_villa_2026');
        assert(diwali, 'diwali_villa_2026 campaign must be aggregated');
        assert.strictEqual(diwali.leadsCount, 1);
        assert.strictEqual(diwali.siteVisitsScheduled, 1);
        assert.strictEqual(diwali.siteVisitsCompleted, 1);
        assert.strictEqual(diwali.dealsCreated, 1);
        assert.strictEqual(diwali.dealsWon, 1);
        assert.strictEqual(diwali.totalDealValue, 18000000);
        assert.strictEqual(diwali.bookingsCount, 1);
        assert.strictEqual(diwali.totalRevenue, 18000000);
        assert.strictEqual(diwali.conversionRate, 100);

        const googleCamp = campaigns.find(c => c.campaign === 'search_luxury_gurgaon');
        assert(googleCamp);
        assert.strictEqual(googleCamp.leadsCount, 1);
        assert.strictEqual(googleCamp.dealsWon, 0);
        assert.strictEqual(googleCamp.conversionRate, 0);
    });

    const { getStageDensity } = await import('../controllers/analytics.controller.js');

    console.log('\n--- 3. Analytics Input Validation & Injection Guard Tests ---');

    await recordAsync('getSiteVisitFunnelAnalytics rejects object/array injection in query parameters', async () => {
        const testCases = [
            { query: { projectId: { $ne: null } } },
            { query: { agentId: { $ne: null } } },
            { query: { timeframe: { $gt: 0 } } },
            { query: { 'details.projectName': 'injection' } },
            { query: { $where: 'sleep(1000)' } }
        ];

        for (const tc of testCases) {
            const res = {
                statusCode: null,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getSiteVisitFunnelAnalytics(tc, res);
            assert.strictEqual(res.statusCode, 400, `Expected 400 for query: ${JSON.stringify(tc.query)}`);
            assert.strictEqual(res.body.success, false);
        }
    });

    await recordAsync('getSiteVisitFunnelAnalytics rejects invalid agentId formats', async () => {
        const invalidAgentIds = [
            'not-a-valid-id',
            '12345',
            '64b8a2f1c9e77a001234567z', // non-hex
            '64b8a2f1c9e77a00123456'    // 22 chars
        ];

        for (const badId of invalidAgentIds) {
            const res = {
                statusCode: null,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getSiteVisitFunnelAnalytics({ query: { agentId: badId } }, res);
            assert.strictEqual(res.statusCode, 400, `Expected 400 for bad agentId: ${badId}`);
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('agentId'));
        }
    });

    await recordAsync('getSiteVisitFunnelAnalytics accepts valid agentId and projectId filters', async () => {
        const validAgentId = new mongoose.Types.ObjectId().toString();
        let capturedQuery = null;

        Activity.find = (q) => {
            capturedQuery = q;
            return { lean: () => Promise.resolve([]) };
        };

        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getSiteVisitFunnelAnalytics({
            query: { agentId: validAgentId, projectId: 'Godrej Palm Retreat' }
        }, res);

        assert.strictEqual(res.body.success, true);
        assert(capturedQuery, 'Activity.find must receive the query');
        assert.strictEqual(String(capturedQuery.assignedTo), validAgentId);
        assert.strictEqual(capturedQuery['details.projectName'], 'Godrej Palm Retreat');
    });

    await recordAsync('getSiteVisitFunnelAnalytics rejects invalid projectId (e.g. starts with $)', async () => {
        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };
        await getSiteVisitFunnelAnalytics({ query: { projectId: '$where' } }, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
    });

    await recordAsync('Analytics date range validation rejects partial, malformed, and inverted ranges', async () => {
        const badDateCases = [
            { query: { startDate: '2026-01-01' } }, // missing endDate
            { query: { endDate: '2026-01-31' } },   // missing startDate
            { query: { startDate: 'invalid-date', endDate: '2026-01-31' } }, // invalid start
            { query: { startDate: '2026-01-01', endDate: 'invalid-date' } }, // invalid end
            { query: { startDate: '2026-02-01', endDate: '2026-01-01' } }, // inverted: start > end
            { query: { timeframe: '-10' } }, // negative timeframe
            { query: { timeframe: 'abc' } }, // non-numeric timeframe
            { query: { timeframe: '0' } }    // 0 days
        ];

        for (const tc of badDateCases) {
            const res1 = {
                statusCode: null, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getSiteVisitFunnelAnalytics(tc, res1);
            assert.strictEqual(res1.statusCode, 400, `Expected 400 for Funnel with: ${JSON.stringify(tc.query)}`);

            const res2 = {
                statusCode: null, body: null,
                status(c) { this.statusCode = c; return this; },
                json(b) { this.body = b; return this; }
            };
            await getCampaignAttributionAnalytics(tc, res2);
            assert.strictEqual(res2.statusCode, 400, `Expected 400 for Attribution with: ${JSON.stringify(tc.query)}`);
        }
    });

    await recordAsync('Analytics date range accepts valid ISO range and timeframe=all', async () => {
        let funnelQuery = null;
        Activity.find = (q) => {
            funnelQuery = q;
            return { lean: () => Promise.resolve([]) };
        };

        const res1 = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getSiteVisitFunnelAnalytics({
            query: { startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.999Z' }
        }, res1);

        assert.strictEqual(res1.body.success, true);
        assert(funnelQuery.createdAt);
        assert.deepStrictEqual(funnelQuery.createdAt.$gte, new Date('2026-01-01T00:00:00.000Z'));
        assert.deepStrictEqual(funnelQuery.createdAt.$lte, new Date('2026-01-31T23:59:59.999Z'));

        // timeframe=all should have no createdAt filter
        let allQuery = null;
        Activity.find = (q) => {
            allQuery = q;
            return { lean: () => Promise.resolve([]) };
        };

        const res2 = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };
        await getSiteVisitFunnelAnalytics({ query: { timeframe: 'all' } }, res2);
        assert.strictEqual(res2.body.success, true);
        assert.strictEqual(allQuery.createdAt, undefined);
    });

    console.log('\n--- 4. Multi-Tenant Scoping & Visibility Engine Enforcement ---');

    await recordAsync('getSiteVisitFunnelAnalytics enforces tenant boundary for tenant-scoped user', async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const testUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'agent@tenantcorp.com',
            role: { name: 'agent' },
            tenantId: tenantId,
            dataScope: 'all'
        };

        let capturedActivityQuery = null;
        let capturedDealQuery = null;
        let capturedBookingQuery = null;

        const visitId = new mongoose.Types.ObjectId();
        Activity.find = (q) => {
            capturedActivityQuery = q;
            return {
                lean: () => Promise.resolve([
                    {
                        _id: visitId,
                        type: 'Site Visit',
                        status: 'Completed',
                        details: { projectName: 'Tenant Tower' }
                    }
                ])
            };
        };

        Deal.find = (q) => {
            capturedDealQuery = q;
            return { lean: () => Promise.resolve([]) };
        };

        Booking.find = (q) => {
            capturedBookingQuery = q;
            return { lean: () => Promise.resolve([]) };
        };

        const res = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getSiteVisitFunnelAnalytics({
            user: testUser,
            query: { timeframe: '30' }
        }, res);

        assert.strictEqual(res.body.success, true);
        assert(capturedActivityQuery, 'Activity query must be executed');
        assert(capturedActivityQuery.$and, 'Activity query must contain $and visibility clause');
        const tenantClause = capturedActivityQuery.$and[0];
        assert.strictEqual(String(tenantClause.tenantId), String(tenantId), 'Activity query must be constrained to user tenantId');

        assert(capturedDealQuery, 'Deal query must be executed');
        assert(capturedDealQuery.$and, 'Deal query must contain $and visibility clause');
        assert.strictEqual(String(capturedDealQuery.$and[0].tenantId), String(tenantId), 'Deal query must be constrained to user tenantId');
    });

    await recordAsync('getCampaignAttributionAnalytics enforces visibility scoping across Lead, Activity, Deal, Booking', async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const testUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'tenant_manager@tenantcorp.com',
            role: { name: 'manager' },
            tenantId: tenantId,
            dataScope: 'all'
        };

        let capturedLeadQuery = null;
        let capturedVisitQuery = null;
        let capturedDealQuery = null;
        let capturedBookingQuery = null;

        Lead.find = (q) => {
            capturedLeadQuery = q;
            return { select: () => ({ lean: () => Promise.resolve([]) }) };
        };

        Activity.find = (q) => {
            capturedVisitQuery = q;
            return { select: () => ({ lean: () => Promise.resolve([]) }) };
        };

        Deal.find = (q) => {
            capturedDealQuery = q;
            return { select: () => ({ lean: () => Promise.resolve([]) }) };
        };

        Booking.find = (q) => {
            capturedBookingQuery = q;
            return { select: () => ({ lean: () => Promise.resolve([]) }) };
        };

        const res = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getCampaignAttributionAnalytics({
            user: testUser,
            query: { timeframe: '90' }
        }, res);

        assert.strictEqual(res.body.success, true);
        assert(capturedLeadQuery.$and, 'Lead query must include tenant visibility clause');
        assert.strictEqual(String(capturedLeadQuery.$and[0].tenantId), String(tenantId));

        assert(capturedVisitQuery.$and, 'Activity query must include tenant visibility clause');
        assert.strictEqual(String(capturedVisitQuery.$and[0].tenantId), String(tenantId));

        assert(capturedDealQuery.$and, 'Deal query must include tenant visibility clause');
        assert.strictEqual(String(capturedDealQuery.$and[0].tenantId), String(tenantId));

        assert(capturedBookingQuery.$and, 'Booking query must include tenant visibility clause');
        assert.strictEqual(String(capturedBookingQuery.$and[0].tenantId), String(tenantId));
    });

    await recordAsync('getStageDensity enforces date range validation and visibility scoping', async () => {
        // Bad timeframe
        const badRes = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };
        await getStageDensity({ query: { timeframe: 'invalid-time' } }, badRes);
        assert.strictEqual(badRes.statusCode, 400);

        // Valid with tenant user
        const tenantId = new mongoose.Types.ObjectId();
        const testUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'admin@tenantcorp.com',
            role: { name: 'admin' },
            tenantId: tenantId,
            dataScope: 'all'
        };

        let capturedLeadQuery = null;
        let capturedDealQuery = null;

        Lead.find = (q) => {
            capturedLeadQuery = q;
            return {
                select: () => ({
                    populate: () => ({
                        lean: () => Promise.resolve([])
                    })
                })
            };
        };

        Deal.find = (q) => {
            capturedDealQuery = q;
            return {
                select: () => ({
                    populate: () => ({
                        lean: () => Promise.resolve([])
                    })
                })
            };
        };

        const validRes = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getStageDensity({
            user: testUser,
            query: { timeframe: '30' }
        }, validRes);

        assert.strictEqual(validRes.body.success, true);
        assert(capturedLeadQuery.$and, 'Lead query must include visibility clause');
        assert.strictEqual(String(capturedLeadQuery.$and[0].tenantId), String(tenantId));

        assert(capturedDealQuery.$and, 'Deal query must include visibility clause');
        assert.strictEqual(String(capturedDealQuery.$and[0].tenantId), String(tenantId));
    });

    // Restore
    Activity.find = origActFind;
    Deal.find = origDealFind;
    Booking.find = origBookingFind;
    Lead.find = origLeadFind;
    Lookup.find = origLookupFind;

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
