import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.find({ lookup_type: 'PropertyType', parent_lookup_value: 'House' }).lean();
    console.log(lookups);
    process.exit(0);
}
run();
