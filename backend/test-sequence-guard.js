import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { evaluateSequenceGuard } from './src/services/SequenceGuardService.js';
import Lead from './models/Lead.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        console.log('Connected to DB');

        // Setup test data
        const testLead = await Lead.findOne({}).sort({ createdAt: -1 });
        if (!testLead) {
            console.log('No lead found to test with.');
            process.exit(0);
        }

        console.log('Testing with Lead:', testLead._id, 'Current Stage:', testLead.stage);

        // Turn on block mode
        await SystemSetting.findOneAndUpdate(
            { key: 'sequenceConfig' },
            { $set: { 'value.enforcementMode': 'block' } },
            { upsert: true }
        );

        console.log('\n--- Test 1: Stage Skip (Incoming -> Negotiation) ---');
        // If current stage is Incoming or Prospect, and we jump to Negotiation
        const res1 = await evaluateSequenceGuard(testLead._id, 'Site Visit', 'Negotiation');
        console.log(JSON.stringify(res1, null, 2));

        console.log('\n--- Test 2: Activity Regression (Current: Negotiation, Activity: Intro Call) ---');
        // Let's force lead stage to Negotiation temporarily
        const originalStage = testLead.stage;
        await Lead.updateOne({ _id: testLead._id }, { $set: { stage: 'Negotiation' } });
        const res2 = await evaluateSequenceGuard(testLead._id, 'Introduction Call', 'Negotiation');
        console.log(JSON.stringify(res2, null, 2));

        console.log('\n--- Test 3: Terminal Re-entry (Current: Closed (Lost), Activity: Site Visit) ---');
        await Lead.updateOne({ _id: testLead._id }, { $set: { stage: 'Closed (Lost)' } });
        const res3 = await evaluateSequenceGuard(testLead._id, 'Site Visit', 'Opportunity');
        console.log(JSON.stringify(res3, null, 2));

        // Restore
        await Lead.updateOne({ _id: testLead._id }, { $set: { stage: originalStage } });

        console.log('\nDone.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
