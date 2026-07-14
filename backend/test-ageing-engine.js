import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { scanAndEnforce } from './src/services/AgeingDecayService.js';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');

        // Check if SystemSetting has agingRules
        const setting = await SystemSetting.findOne({ key: 'agingRules' }).lean();
        console.log('System Setting Rules:', JSON.stringify(setting?.value, null, 2));

        const negLookup = await Lookup.findOne({ type: 'stage', value: 'Negotiation' }).lean();
        const fortyDaysAgo = new Date(Date.now() - 40 * 86400000);
        const twentyDaysAgo = new Date(Date.now() - 20 * 86400000);

        const testLead = await Lead.create({
            firstName: 'Ageing',
            lastName: 'Test',
            email: `ageing_${Date.now()}@test.com`,
            mobile: `+91999${Math.floor(Math.random()*1000000)}`,
            stage: negLookup ? negLookup._id : 'Negotiation',
            stageChangedAt: fortyDaysAgo,
            lastActivityAt: twentyDaysAgo,
            leadScore: 50
        });

        console.log(`Created test lead: ${testLead._id} in Negotiation`);

        const result = await scanAndEnforce();
        console.log('Engine Result:', result);

        const updatedLead = await Lead.findById(testLead._id).populate('stage', 'lookup_value');
        console.log('Updated Stage:', updatedLead.stage?.lookup_value || updatedLead.stage);
        console.log('Lead Score:', updatedLead.leadScore);

        await Lead.deleteOne({ _id: testLead._id });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
