import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Import models to register schemas
import './models/Lead.js';
import './models/Lookup.js';
import './models/Activity.js';
import './models/Deal.js';

const Lead = mongoose.model('Lead');
const Lookup = mongoose.model('Lookup');
const Activity = mongoose.model('Activity');
const Deal = mongoose.model('Deal');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const leadCount = await Lead.countDocuments();
        const lookupCount = await Lookup.countDocuments();
        const activityCount = await Activity.countDocuments();
        const dealCount = await Deal.countDocuments();

        console.log({ leadCount, lookupCount, activityCount, dealCount });

        if (leadCount > 0) {
            const rawLeads = await Lead.find().limit(5).lean();
            console.log('\nSample Leads Raw Stages:');
            rawLeads.forEach((l, i) => {
                console.log(`${i + 1}. Name: ${l.firstName} ${l.lastName}, Stage: ${l.stage} (Type: ${typeof l.stage})`);
            });

            const sampleLeads = await Lead.find().limit(5).populate('stage').lean();
            console.log('\nSample Leads Populated Stages:');
            sampleLeads.forEach((l, i) => {
                console.log(`${i + 1}. Name: ${l.firstName} ${l.lastName}, Stage: ${l.stage?.lookup_value || 'N/A'}`);
            });
        }

        const stages = await Lookup.find({ lookup_type: 'Stage' }).lean();
        console.log('\nAvailable Stages in Lookup:');
        stages.forEach(s => console.log(`- ${s.lookup_value} (${s._id})`));

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
