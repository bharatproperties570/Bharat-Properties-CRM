import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { evaluateAndTransition } from './src/services/StageTransitionEngine.js';
import Lead from './models/Lead.js';
import Activity from './models/Activity.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        console.log('Connected to DB');

        // Setup stability config in DB just to be sure it matches our recent frontend changes
        await SystemSetting.findOneAndUpdate(
            { key: 'stabilityLockConfig' },
            { $set: { 
                value: {
                    'Opportunity': { minActivities: 3, minDays: 7, label: '3 Activities & 7 Days required to downgrade' },
                    'Negotiation': { minActivities: 5, minDays: 14, label: '5 Activities & 14 Days required to downgrade' },
                    'Closed (Won)': { minActivities: 999, minDays: 999, label: 'Permanent terminal state' }
                }
            }},
            { upsert: true }
        );

        // Setup test data - grab a random lead
        const testLead = await Lead.findOne({}).sort({ createdAt: -1 });
        if (!testLead) {
            console.log('No lead found to test with.');
            process.exit(0);
        }

        console.log('Testing with Lead:', testLead._id);
        const originalStage = testLead.stage;
        const originalChangedAt = testLead.stageChangedAt;

        console.log('\n--- Test 1: Soft Lock (Negotiation -> Opportunity) ---');
        // Force lead into Negotiation stage, with 0 activities in this stage and changed today
        await Lead.updateOne({ _id: testLead._id }, { 
            $set: { 
                stage: 'Negotiation', 
                stageChangedAt: new Date() // Changed today (0 days)
            } 
        });

        // Delete any activities that might throw off the count for this test
        await Activity.deleteMany({ entityType: 'Lead', entityId: testLead._id, createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60) }});

        // Trigger a transition that normally drops to 'Prospect' (e.g., 'Not Interested' on a basic call)
        // Let's use evaluateAndTransition directly:
        // activityType = 'Call', outcome = 'Visit Cancelled' -> usually goes to Prospect
        const res1 = await evaluateAndTransition(testLead._id, 'Site Visit', 'Visit Cancelled', 'Test reason', {}, { activityId: new mongoose.Types.ObjectId() });
        console.log("Result for Soft Lock (Should block downgrade):");
        console.log(JSON.stringify(res1, null, 2));

        console.log('\n--- Test 2: Hard Lock (Closed (Won) -> Prospect) ---');
        // Force lead into Closed (Won)
        await Lead.updateOne({ _id: testLead._id }, { 
            $set: { stage: 'Closed (Won)' } 
        });

        const res2 = await evaluateAndTransition(testLead._id, 'Site Visit', 'Visit Cancelled', 'Test reason', {}, { activityId: new mongoose.Types.ObjectId() });
        console.log("Result for Hard Lock (Should completely block):");
        console.log(JSON.stringify(res2, null, 2));

        // Restore
        await Lead.updateOne({ _id: testLead._id }, { $set: { stage: originalStage, stageChangedAt: originalChangedAt } });

        console.log('\nDone.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
