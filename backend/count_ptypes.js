import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.countDocuments({ lookup_type: 'PropertyType' });
    console.log('Total PropertyType lookups:', lookups);
    process.exit(0);
}
run();
