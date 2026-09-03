import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WorkflowEngine } from './src/utils/WorkflowEngine.js';
import Lead from './models/Lead.js';
import Trigger from './models/Trigger.js';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const lead = await Lead.findById('6a885bc8ad29dcd4c63e5c62').populate([
            { path: 'status', select: 'lookup_value' }
        ]);
        const trigger = await Trigger.findOne({ name: 'Welcome msg & Matched Deal' });
        
        console.log('Lead Status:', lead.status);
        console.log('Trigger conditions:', JSON.stringify(trigger.conditions, null, 2));
        
        const shouldFire = WorkflowEngine.evaluateRules(trigger.conditions, lead);
        console.log('Should Fire?', shouldFire);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
