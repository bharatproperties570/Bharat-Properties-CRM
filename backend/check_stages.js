import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const leads = await Lead.find({}).populate('stage').lean();
        const stageCounts = {};
        leads.forEach(l => {
            const stageName = l.stage?.lookup_value || 'No Stage';
            stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;
        });
        console.log('Lead Stage Counts:', stageCounts);

        const dormantLookups = await Lookup.find({ 
            lookup_value: { $regex: /^Dormant$/i } 
        }).select('_id lookup_value').lean();
        console.log('Dormant Lookups found:', dormantLookups);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
