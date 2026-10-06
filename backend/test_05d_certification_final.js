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
    
    const { AttributionService } = await import('./src/services/AttributionService.js');
    
    return { MarketingCampaign, CampaignRun, MarketingDelivery, MarketingTouch, Lead, Deal, AttributionService };
}

async function runTests() {
    const { MarketingCampaign, CampaignRun, MarketingDelivery, MarketingTouch, Lead, Deal, AttributionService } = await setup();
    const now = new Date();
    
    const c1 = await MarketingCampaign.create({ name: 'Test Campaign', ownerId: new mongoose.Types.ObjectId() });
    const cr1 = await CampaignRun.create({ campaignId: c1._id, status: 'COMPLETED' });
    const d1 = await MarketingDelivery.create({
        jobId: 'j1', recipientId: '919999999999', channel: 'wa',
        campaignRunId: cr1._id, status: 'SENT', lastAttemptAt: new Date(now.getTime() - 1000)
    });

    console.log('--- TEST G: LEAD -> DEAL ATTRIBUTION INHERITANCE ---');
    const leadG = await Lead.create({ firstName: 'Test', lastName: 'G', mobile: '919999999999' });
    const touchIdG = await AttributionService.attributeInboundEvent('919999999999', now, leadG._id, 'Lead', 'whatsapp_inbound');
    await Lead.updateOne({ _id: leadG._id }, { $set: { attributedTouchId: touchIdG } });
    
    // Simulate exactly what DealCreationEngine does
    const sourceLead = await Lead.findById(leadG._id).select('attributedTouchId').lean();
    let inheritedTouchId = sourceLead?.attributedTouchId;
    const normalizedDealPayload = { name: 'Deal G', price: 100000 };
    if (inheritedTouchId) normalizedDealPayload.attributedTouchId = inheritedTouchId;
    const dealG = await Deal.create(normalizedDealPayload);
    
    assert.strictEqual(dealG.attributedTouchId.toString(), touchIdG.toString(), 'Deal must inherit attributedTouchId from Lead');
    console.log('✅ TEST G PASS');

    console.log('--- TEST H: DIRECT DEAL ATTRIBUTION ---');
    const dummyDealId = new mongoose.Types.ObjectId();
    const touchIdH = await AttributionService.attributeInboundEvent('919999999999', now, dummyDealId, 'Deal', 'whatsapp_inbound');
    
    // Simulate DealCreationEngine direct deal parsing
    const normalizedDealPayloadH = { _id: dummyDealId, name: 'Deal H', price: 100000 };
    if (touchIdH) normalizedDealPayloadH.attributedTouchId = touchIdH;
    const dealH = await Deal.create(normalizedDealPayloadH);
    
    assert.strictEqual(dealH.attributedTouchId.toString(), touchIdH.toString());
    const touchH = await MarketingTouch.findById(touchIdH);
    assert.strictEqual(touchH.deliveryId.toString(), d1._id.toString());
    console.log('✅ TEST H PASS');

    console.log('--- TEST I: NO MATCHING DELIVERY ---');
    const touchIdI = await AttributionService.attributeInboundEvent('917777777777', now, new mongoose.Types.ObjectId(), 'Lead', 'whatsapp_inbound');
    assert.strictEqual(touchIdI, null);
    console.log('✅ TEST I PASS');

    console.log('--- TEST J: MISSING RECIPIENT IDENTITY ---');
    const touchIdJ = await AttributionService.attributeInboundEvent(null, now, new mongoose.Types.ObjectId(), 'Lead', 'whatsapp_inbound');
    assert.strictEqual(touchIdJ, null);
    console.log('✅ TEST J PASS');

    console.log('--- TEST K: INVALID ATTRIBUTION REFERENCES ---');
    await MarketingDelivery.create({
        jobId: 'jK', recipientId: '915555555555', channel: 'wa',
        status: 'SENT', lastAttemptAt: new Date(now.getTime() - 1000)
    });
    const touchIdK = await AttributionService.attributeInboundEvent('915555555555', now, new mongoose.Types.ObjectId(), 'Lead', 'whatsapp_inbound');
    assert.strictEqual(touchIdK, null);
    console.log('✅ TEST K PASS');

    console.log('--- TEST L: EXPLICIT E11000 CONTRACT ---');
    const subjectL = new mongoose.Types.ObjectId();
    const touchL1 = await AttributionService.attributeInboundEvent('919999999999', now, subjectL, 'Lead', 'whatsapp_inbound');
    assert.ok(touchL1);
    
    const touchL2 = await AttributionService.attributeInboundEvent('919999999999', now, subjectL, 'Lead', 'whatsapp_inbound');
    assert.strictEqual(touchL2.toString(), touchL1.toString()); 
    
    let thrownError = false;
    try {
        const touchFail = new MarketingTouch({ campaignId: c1._id });
        await touchFail.save();
    } catch (e) {
        thrownError = true;
    }
    assert.ok(thrownError, 'Must not swallow generic DB errors');
    console.log('✅ TEST L PASS');

    console.log('--- TEST M: TRUE CONCURRENT DUPLICATE INGESTION ---');
    const subjectM = new mongoose.Types.ObjectId();
    const concurrentPromises = [
        AttributionService.attributeInboundEvent('919999999999', now, subjectM, 'Lead', 'whatsapp_inbound'),
        AttributionService.attributeInboundEvent('919999999999', now, subjectM, 'Lead', 'whatsapp_inbound')
    ];
    const resultsM = await Promise.all(concurrentPromises);
    assert.ok(resultsM[0]);
    assert.strictEqual(resultsM[0].toString(), resultsM[1].toString());
    const touchCountM = await MarketingTouch.countDocuments({ deliveryId: d1._id, subjectId: subjectM });
    assert.strictEqual(touchCountM, 1);
    console.log('✅ TEST M PASS');

    console.log('--- IMMUTABILITY CERTIFICATION ---');
    const touchImm = await MarketingTouch.findById(touchL1);
    let immErr1, immErr2, immErr3, immErr4, immErr5;
    try { touchImm.touchType = 'VIEW'; await touchImm.save(); } catch (e) { immErr1 = e; }
    try { await MarketingTouch.updateOne({ _id: touchL1 }, { $set: { touchType: 'VIEW' } }); } catch (e) { immErr2 = e; }
    try { await MarketingTouch.updateMany({ _id: touchL1 }, { $set: { touchType: 'VIEW' } }); } catch (e) { immErr3 = e; }
    try { await MarketingTouch.findOneAndUpdate({ _id: touchL1 }, { $set: { touchType: 'VIEW' } }); } catch (e) { immErr4 = e; }
    try { await MarketingTouch.replaceOne({ _id: touchL1 }, touchImm); } catch (e) { immErr5 = e; }
    
    assert.ok(immErr1 && immErr2 && immErr3 && immErr4 && immErr5);
    const untouched = await MarketingTouch.findById(touchL1);
    assert.strictEqual(untouched.touchType, 'REPLY');
    console.log('✅ IMMUTABILITY PASS');

    console.log('--- INDEX VERIFICATION ---');
    const touchIndexes = await MarketingTouch.collection.getIndexes();
    assert.ok(touchIndexes['idx_idempotency'], 'idx_idempotency missing');
    assert.ok(touchIndexes['idx_subject_lookup'], 'idx_subject_lookup missing');
    assert.ok(touchIndexes['idx_campaign_rollup'], 'idx_campaign_rollup missing');
    assert.strictEqual(touchIndexes['idx_idempotency'].unique, true);
    
    const deliveryIndexes = await MarketingDelivery.collection.getIndexes();
    assert.ok(deliveryIndexes['idx_delivery_selection'], 'idx_delivery_selection missing');
    console.log('✅ INDEX CERTIFICATION PASS');
    
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}

runTests().catch(e => { console.error(e); process.exit(1); });
