import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.find({ lookup_type: 'PropertyType' }).lean();
    console.log(Object.keys(lookups[1]));
    process.exit(0);
}
run();
