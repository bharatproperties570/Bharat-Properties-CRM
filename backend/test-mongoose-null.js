import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Trigger from './models/Trigger.js';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const triggers = await Trigger.find({
            module: 'leads',
            event: 'lead_created',
            isActive: true,
            companyId: null
        }).sort({ priority: 1 });
        
        console.log('Found triggers with companyId: null ->', triggers.length);
        if (triggers.length > 0) {
            console.log(triggers.map(t => t.name));
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
