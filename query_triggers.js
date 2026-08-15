import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Trigger from './backend/models/Trigger.js';

dotenv.config({path: './backend/.env'});

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const triggers = await Trigger.find({ event: { $in: ['lead_inactivity', 'activity_overdue', 'deal_inactivity'] } }).lean();
    console.log(JSON.stringify(triggers, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
