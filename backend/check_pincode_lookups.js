import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String
}, { strict: false });

const Lookup = mongoose.model('Lookup', LookupSchema);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const pincodes = await Lookup.find({ lookup_type: 'Pincode' }).lean();
    console.log(`Found ${pincodes.length} Pincodes:`, pincodes.map(p => p.lookup_value));
    mongoose.disconnect();
}
run();
