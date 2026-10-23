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

    const origActFind = Activity.find;
    const origDealFind = Deal.find;
    const origBookingFind = Booking.find;
    const origLeadFind = Lead.find;

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

    // Restore
    Activity.find = origActFind;
    Deal.find = origDealFind;
    Booking.find = origBookingFind;
    Lead.find = origLeadFind;

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
