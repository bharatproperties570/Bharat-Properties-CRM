import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { loadTransitionRules, resolveTransition } from './src/services/StageTransitionEngine.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        
        // 1. Add a custom rule that overrides the default 'Visit Cancelled' behavior
        // Default rule for Visit Cancelled goes to 'Prospect'. We will override it to 'Closed (Lost)'
        await SystemSetting.findOneAndUpdate(
            { key: 'stageMappingRules' },
            { $set: { 
                value: [{
                    id: 'custom_override_visit_cancelled',
                    activityType: 'Site Visit',
                    purpose: '*',
                    outcome: 'Visit Cancelled',
                    reason: '*',
                    stage: 'Closed (Lost)',
                    priority: 1, // High priority (Default rules are 10)
                    isActive: true
                }]
            }},
            { upsert: true }
        );

        // Load rules to ensure it picks up the override
        const rules = await loadTransitionRules();
        console.log(`Loaded ${rules.length} rules.`);

        // Test the transition resolution
        const { matched, rule } = await resolveTransition('Site Visit', 'Visit Cancelled', '', '');
        
        if (matched) {
            console.log(`Matched Rule ID: ${rule.id}`);
            console.log(`Resolved Stage: ${rule.newStage}`);
            if (rule.id === 'custom_override_visit_cancelled' && rule.newStage === 'Closed (Lost)') {
                console.log('SUCCESS: Custom rule successfully overrode the default rule!');
            } else {
                console.log('FAIL: Default rule was not overridden or wrong rule matched.');
            }
        } else {
            console.log('FAIL: No rule matched.');
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
