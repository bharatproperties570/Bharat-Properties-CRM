import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { getBulkExactMatchCounts } from './controllers/deal.controller.js';
import Lead from './models/Lead.js';

async function test() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bharatproperties");
    const lead = await Lead.findById("6a3010e3a0d835cb0e36aae9").lean();
    if (!lead) return console.log("Lead not found");
    
    console.log("Testing bulk exact match count...");
    const counts = await getBulkExactMatchCounts([lead]);
    console.log("Counts:", counts);
    process.exit(0);
}
test();
