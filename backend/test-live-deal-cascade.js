import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Deal from './models/Deal.js';
import Lead from './models/Lead.js';
import Activity from './models/Activity.js';
import { autoTriggerStageChange } from './controllers/activity.controller.js';
import { internalSyncDealStage } from './controllers/stage.controller.js';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        console.log('\n=== LIVE DB: Multi-Lead Deal Cascade Test ===\n');

        const dealId = '6a05799a9839fe10f1966d93';
        
        let leadA = await Lead.findOne({ mobile: '9999999901' });
        if (!leadA) { leadA = await new Lead({ firstName: 'Cascade', lastName: 'Lead A', mobile: '9999999901', email: 'a@test.com' }).save(); }
        
        let leadB = await Lead.findOne({ mobile: '9999999902' });
        if (!leadB) { leadB = await new Lead({ firstName: 'Cascade', lastName: 'Lead B', mobile: '9999999902', email: 'b@test.com' }).save(); }
        
        console.log('1. Created/Found Mock Leads:', leadA._id, leadB._id);

        await Deal.findByIdAndUpdate(dealId, { $set: { leads: [], stage: 'Open' } });
        
        const lookupNego = await mongoose.model('Lookup').findOne({ lookup_value: 'Negotiation' });
        if(lookupNego) { await Lead.findByIdAndUpdate(leadA._id, { stage: lookupNego._id }); }

        const actA = new Activity({
            subject: 'Site Visit A',
            dueDate: new Date(),
            type: 'Site Visit',
            entityType: 'Lead',
            entityId: leadA._id,
            status: 'Completed',
            relatedTo: [{ id: dealId, model: 'Deal', name: 'Test Deal' }],
            details: { visitedProperties: [{ property: 'Unit 101', result: 'Negotiation' }] }
        });
        await actA.save();
        console.log('\n2. Triggering auto stage change for Lead A (Negotiation)...');
        await autoTriggerStageChange(actA);

        let deal = await Deal.findById(dealId).lean();
        console.log(`-> Deal Stage after Lead A: ${deal.stage} (Expected: Negotiation)`);
        console.log(`-> Deal Linked Leads count: ${deal.leads?.length}`);

        const actB = new Activity({
            subject: 'Site Visit B',
            dueDate: new Date(),
            type: 'Site Visit',
            entityType: 'Lead',
            entityId: leadB._id,
            status: 'Completed',
            relatedTo: [{ id: dealId, model: 'Deal', name: 'Test Deal' }],
            details: { visitedProperties: [{ property: 'Unit 101', result: 'Token Given' }] }
        });
        await actB.save();
        console.log('\n3. Triggering auto stage change for Lead B (Token Given)...');
        await autoTriggerStageChange(actB);

        deal = await Deal.findById(dealId).lean();
        console.log(`-> Deal Stage after Lead B: ${deal.stage} (Expected: Booked or Token Given)`);
        console.log(`-> Deal Linked Leads count: ${deal.leads?.length}`);

        console.log('\n4. Simulating Lead B drops out (becomes Closed Lost)...');
        const lookupLost = await mongoose.model('Lookup').findOne({ lookup_value: 'Closed Lost' });
        if(lookupLost) { await Lead.findByIdAndUpdate(leadB._id, { stage: lookupLost._id }); }
        await internalSyncDealStage(dealId, ['Negotiation', 'Closed Lost'], { reason: 'Lead B Dropped' });
        
        deal = await Deal.findById(dealId).lean();
        console.log(`-> Deal Stage after Lead B drops out: ${deal.stage} (Expected: Negotiation)`);

        console.log('\n✅ Enterprise Cascade Test Completed!');
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
};
run();
