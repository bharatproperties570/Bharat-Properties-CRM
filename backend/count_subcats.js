import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.find({ lookup_type: 'SubCategory' }).lean();
    console.log('Total SubCategory lookups:', lookups.length);
    console.log(lookups.slice(0, 3));
    process.exit(0);
}
run();
