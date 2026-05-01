import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String
}, { collection: 'lookups' });

const Lookup = mongoose.model('Lookup', LookupSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const stages = await Lookup.find({ lookup_type: 'Stage' });
        console.log('--- LEAD STAGES ---');
        stages.forEach(s => {
            console.log(`- ${s.lookup_value} (${s._id})`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
