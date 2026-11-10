import assert from 'assert';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/.env' });
}

async function runTest() {
    console.log('--- TESTING MARKETING ANALYTICS OVERVIEW ---');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties');

    const { getMarketingAnalyticsOverview } = await import('../controllers/marketing.controller.js');

    let responseData = null;
    let statusCode = 200;

    const req = { query: { days: 30 } };
    const res = {
        json(data) {
            responseData = data;
            return this;
        },
        status(code) {
            statusCode = code;
            return this;
        }
    };

    await getMarketingAnalyticsOverview(req, res);

    assert.strictEqual(statusCode, 200, 'Status must be 200');
    assert.ok(responseData, 'Response data must exist');
    assert.strictEqual(responseData.success, true, 'success must be true');
    assert.ok(responseData.overview, 'overview must exist');

    const { funnel, sourceAttribution, weeklyVelocity, topProspects } = responseData.overview;

    // 1. Funnel
    assert.ok(funnel, 'funnel must exist');
    assert.ok(typeof funnel.totalLeads === 'number', 'totalLeads must be a number');
    assert.ok(typeof funnel.nurturedLeads === 'number', 'nurturedLeads must be a number');
    assert.ok(typeof funnel.totalOpportunities === 'number', 'totalOpportunities must be a number');
    assert.ok(typeof funnel.leadVelocityDays === 'number', 'leadVelocityDays must be a number');

    // 2. Source Attribution
    assert.ok(sourceAttribution, 'sourceAttribution must exist');
    assert.ok(sourceAttribution.categories, 'categories must exist');
    assert.ok(sourceAttribution.categories.google, 'google category must exist');
    assert.ok(sourceAttribution.categories.whatsapp, 'whatsapp category must exist');
    assert.ok(sourceAttribution.categories.meta, 'meta category must exist');
    assert.ok(sourceAttribution.categories.direct, 'direct category must exist');

    // 3. Weekly Velocity
    assert.ok(weeklyVelocity, 'weeklyVelocity must exist');
    assert.strictEqual(weeklyVelocity.days.length, 7, 'weeklyVelocity must have 7 days');

    // 4. Intelligence Hub Top Prospects
    assert.ok(Array.isArray(topProspects), 'topProspects must be an array');
    if (topProspects.length > 0) {
        assert.ok(topProspects[0].name, 'prospect must have a name');
        assert.ok(topProspects[0].leadScore !== undefined, 'prospect must have leadScore');
    }

    console.log('✅ ALL 5 ANALYTICS COMPONENTS VERIFIED AGAINST LIVE DATABASE!');
    await mongoose.disconnect();
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
