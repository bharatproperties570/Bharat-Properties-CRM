import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';

let mongoServer;

async function setup() {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());
    
    const MarketingCampaign = (await import('./models/MarketingCampaign.js')).default;
    const CampaignRun = (await import('./models/CampaignRun.js')).default;
    const MarketingDelivery = (await import('./models/MarketingDelivery.js')).default;
    const MarketingTouch = (await import('./models/MarketingTouch.js')).default;
    const Lead = (await import('./models/Lead.js')).default;
    const Deal = (await import('./models/Deal.js')).default;
    
    const { CampaignAnalyticsService } = await import('./src/services/CampaignAnalyticsService.js');
    
    return { MarketingCampaign, CampaignRun, MarketingDelivery, MarketingTouch, Lead, Deal, CampaignAnalyticsService };
}

async function runTests() {
    const { MarketingCampaign, CampaignRun, MarketingDelivery, MarketingTouch, Lead, Deal, CampaignAnalyticsService } = await setup();
    
    // Create baseline
    const campaign = await MarketingCampaign.create({ name: 'Test Campaign', ownerId: new mongoose.Types.ObjectId(), budget: 5000 });
    const run = await CampaignRun.create({ campaignId: campaign._id, status: 'COMPLETED' });
    
    // Test A, B - Sent and Failed Deliveries
    await MarketingDelivery.create({ jobId: 'j1', recipientId: 'r1', channel: 'wa', campaignRunId: run._id, status: 'SENT' });
    await MarketingDelivery.create({ jobId: 'j2', recipientId: 'r2', channel: 'wa', campaignRunId: run._id, status: 'FAILED_FINAL' });
    await MarketingDelivery.create({ jobId: 'j3', recipientId: 'r3', channel: 'wa', campaignRunId: run._id, status: 'FAILED_RETRYABLE' });
    await MarketingDelivery.create({ jobId: 'j4', recipientId: 'r4', channel: 'wa', campaignRunId: run._id, status: 'IN_PROGRESS' }); // Ignored
    
    // Test C - Engagement
    // Create an orphan touch (Test K)
    await MarketingTouch.create({
        campaignId: campaign._id, campaignRunId: run._id, deliveryId: new mongoose.Types.ObjectId(),
        subjectType: 'Lead', subjectId: new mongoose.Types.ObjectId(), touchSource: 'wa', touchType: 'REPLY',
        timestamp: new Date('2024-01-01T00:00:00Z'), windowMatchedHrs: 2, snapshot: { campaignName: 'Old Name', channel: 'wa' }
    });
    
    // Test D, E, F, G, H, I, J - Attribution and Cardinality
    const touch2Id = new mongoose.Types.ObjectId();
    await MarketingTouch.create({
        _id: touch2Id,
        campaignId: campaign._id, campaignRunId: run._id, deliveryId: new mongoose.Types.ObjectId(),
        subjectType: 'Lead', subjectId: new mongoose.Types.ObjectId(), touchSource: 'wa', touchType: 'REPLY',
        timestamp: new Date('2024-01-01T00:00:00Z'), windowMatchedHrs: 2, snapshot: { campaignName: 'Old Name', channel: 'wa' }
    });
    
    await Lead.create({ firstName: 'User', lastName: '1', mobile: '919999999991', attributedTouchId: touch2Id });
    // 1 Lead, but let's add 2 Deals to ensure no double counting
    await Deal.create({ name: 'Deal 1 Active', price: 100000, stage: 'Open', isActiveDeal: true, attributedTouchId: touch2Id });
    await Deal.create({ name: 'Deal 2 Won', price: 50000, closedPrice: 45000, stage: 'Closed Won', isActiveDeal: false, attributedTouchId: touch2Id });
    await Deal.create({ name: 'Deal 3 Won No Closed Price', price: 20000, stage: 'Closed', isActiveDeal: false, attributedTouchId: touch2Id });
    await Deal.create({ name: 'Deal 4 Lost', price: 30000, stage: 'Cancelled', isActiveDeal: false, attributedTouchId: touch2Id }); // Not active, not won

    // EXECUTE
    const start = Date.now();
    const stats = await CampaignAnalyticsService.getCampaignRunAnalytics(run._id);
    const ms = Date.now() - start;
    
    console.log('--- TEST A & B: SENT AND FAILED ---');
    assert.strictEqual(stats.sent, 1);
    assert.strictEqual(stats.failed, 2);
    console.log('✅ TEST A & B PASS');

    console.log('--- TEST C & K: ENGAGEMENT AND ORPHAN HANDLING ---');
    assert.strictEqual(stats.engaged, 2); // 2 replies
    console.log('✅ TEST C & K PASS');

    console.log('--- TEST D & E & J: LEAD/DEAL GENERATION AND NO DOUBLE COUNTING ---');
    assert.strictEqual(stats.leadsGenerated, 1);
    assert.strictEqual(stats.dealsGenerated, 4);
    console.log('✅ TEST D & E & J PASS');

    console.log('--- TEST F: WON DEALS ---');
    assert.strictEqual(stats.wonDeals, 2); // Deal 2 and Deal 3
    console.log('✅ TEST F PASS');

    console.log('--- TEST G: PIPELINE REVENUE ---');
    assert.strictEqual(stats.pipelineRevenue, 100000); // Deal 1 only
    console.log('✅ TEST G PASS');

    console.log('--- TEST H & I: REALIZED REVENUE WITH FALLBACK ---');
    assert.strictEqual(stats.realizedRevenue, 65000); // Deal 2 (45000) + Deal 3 (20000)
    console.log('✅ TEST H & I PASS');

    console.log('--- TEST L & M: HISTORICAL COHORT AND SNAPSHOT ---');
    const t = await MarketingTouch.findById(touch2Id);
    assert.strictEqual(t.timestamp.toISOString(), '2024-01-01T00:00:00.000Z');
    assert.strictEqual(t.snapshot.campaignName, 'Old Name');
    console.log('✅ TEST L & M PASS');

    console.log('--- TEST N: NO COST FABRICATION ---');
    assert.strictEqual(stats.cost, null);
    assert.strictEqual(stats.cpl, null);
    assert.strictEqual(stats.cpa, null);
    assert.strictEqual(stats.roas, null);
    assert.strictEqual(stats.financialStatus, "DEFERRED_COST_SOURCE");
    console.log('✅ TEST N PASS');
    
    console.log('--- PERFORMANCE ---');
    console.log(`Aggregation executed in ${ms}ms`);

    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}

runTests().catch(e => { console.error(e); process.exit(1); });
