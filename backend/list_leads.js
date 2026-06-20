import 'dotenv/config';
import mongoose from 'mongoose';
import Lead from './models/Lead.js';

async function listLeads() {
    await mongoose.connect(process.env.MONGODB_URI);
    const lead = await Lead.findOne({ firstName: { $regex: /mehar/i } }).lean();
    console.log(lead);
    process.exit(0);
}
listLeads().catch(console.error);
