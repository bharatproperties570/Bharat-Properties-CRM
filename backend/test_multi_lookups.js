import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookup_type = 'UnitType,Category,SubCategory,PropertyType,BuiltupType,Facing,RoadWidth';
    const types = String(lookup_type).split(',').map(t => t.trim()).filter(Boolean);
    const regexes = types.flatMap(t => [
        new RegExp('^' + t.replace(/\s+/g, '') + '$', 'i'),
        new RegExp('^' + t + '$', 'i')
    ]);
    const query = { lookup_type: { $in: regexes } };
    const lookups = await Lookup.find(query).lean();
    console.log('Types found:', [...new Set(lookups.map(l => l.lookup_type))]);
    process.exit(0);
}
run();
