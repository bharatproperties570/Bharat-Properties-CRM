import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, {strict: false}), 'lookups');
    
    const sample = await Lookup.findOne({ lookup_type: 'Locality' }).lean();
    console.log('Sample Keys:', Object.keys(sample));
    console.log('Sample Size:', JSON.stringify(sample).length, 'bytes');
    process.exit(0);
}
run();
