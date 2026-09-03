import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.find({ lookup_type: 'PropertyType' }).lean();
    console.log('Active count:', lookups.filter(l => l.is_active || l.isActive).length);
    console.log('Inactive count:', lookups.filter(l => !(l.is_active || l.isActive)).length);
    process.exit(0);
}
run();
