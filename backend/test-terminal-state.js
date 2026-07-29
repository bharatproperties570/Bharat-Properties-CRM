import mongoose from 'mongoose';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/bharat-properties');
    console.log("Connected to MongoDB.");

    // 1. Fetch lookups for terminal states
    const lookups = await Lookup.find({ lookup_type: { $regex: /^stage$/i } }).lean();
    console.log("Stage Lookups:");
    lookups.forEach(l => console.log(` - ${l.lookup_value} (${l._id})`));

    // 2. Fetch a few leads and their current stages
    const leads = await Lead.find({}).populate('stage').limit(5).lean();
    console.log("\nSample Leads:");
    leads.forEach(lead => {
        console.log(` - Lead: ${lead.firstName} ${lead.lastName || ''} | Stage: ${lead.stage?.lookup_value} (${lead.stage?._id})`);
    });

    await mongoose.disconnect();
}
run();
