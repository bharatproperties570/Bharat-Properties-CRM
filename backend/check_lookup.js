
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String
        }, { strict: false }));

        const sampleId = '69999d8331d19e8a9538ee1e';
        const lookup = await Lookup.findById(sampleId);

        if (lookup) {
            console.log(`Found Lookup for ID ${sampleId}:`);
            console.log(JSON.stringify(lookup, null, 2));
        } else {
            console.log(`No Lookup found for ID ${sampleId}`);
            
            // Search by value in case it was a typo
            const byValue = await Lookup.findOne({ _id: sampleId }); // Should be same
            console.log('By ID results:', byValue);
            
            // List some BuiltupType lookups
            const allBuiltup = await Lookup.find({ lookup_type: 'BuiltupType' }).limit(10);
            console.log('\nAvailable BuiltupType Lookups:');
            console.log(allBuiltup.map(l => ({ id: l._id, value: l.lookup_value })));
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
