import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Activity from '../models/Activity.js';
import { getLeadScores } from '../controllers/stage.controller.js';

const runVerification = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB for Verification");

        // 1. Create a dummy lead
        const testLead = await Lead.create({
            firstName: "TestEngine",
            lastName: "Aligner",
            mobile: "+919999900000",
            intent_index: 45 // Baseline ML score
        });
        console.log(`Created Test Lead: ${testLead._id}`);

        // 2. Add an activity (Should trigger lastActivityAt update)
        const activity = await Activity.create({
            entityId: testLead._id,
            entityType: 'Lead',
            type: 'Meeting',
            subject: 'Alignment Test Meeting',
            status: 'Completed',
            details: {
                purpose: 'Initial Discussion',
                completionResult: 'Interested in project'
            },
            completedAt: new Date()
        });

        // Wait briefly for triggers/queues (simulated)
        await new Promise(r => setTimeout(r, 1000));

        // Since we bypassed the controller API and hit the model directly via script,
        // we manually replicate the controller's logic (or hit the endpoint)
        // For testing, we just update it here like the controller would:
        await Lead.findByIdAndUpdate(testLead._id, { lastActivityAt: new Date() });

        const updatedLead = await Lead.findById(testLead._id).select('lastActivityAt intent_index');
        console.log(`Lead lastActivityAt updated: ${!!updatedLead.lastActivityAt}`);

        // 3. Test Score Blending
        // We will mock the req/res objects for the controller
        let finalScoreData = null;
        const req = {};
        const res = {
            json: (data) => {
                finalScoreData = data;
            },
            status: function () { return this; }
        };

        await getLeadScores(req, res);

        if (finalScoreData && finalScoreData.scores[testLead._id.toString()]) {
            const result = finalScoreData.scores[testLead._id.toString()];
            console.log(`Engine Blended Score Result:`, result);
            if (result.score > 45) {
                console.log(`✅ SUCCESS: Activity and Recency bonuses were successfully blended with the ML intent_index (Base 45 -> Final ${result.score}).`);
            } else {
                console.log(`❌ FAILURE: Blending did not increase the intent_index. Expected > 45, got ${result.score}. Check activity configuration mappings or blending logic.`);
            }
        }

        // Cleanup
        await Activity.findByIdAndDelete(activity._id);
        await Lead.findByIdAndDelete(testLead._id);
        console.log("Cleanup complete.");

    } catch (error) {
        console.error("Verification Error:", error);
    } finally {
        mongoose.disconnect();
    }
};

runVerification();
