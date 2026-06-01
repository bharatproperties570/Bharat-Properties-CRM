import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

await mongoose.connect(process.env.MONGODB_URI);

const Lookup = mongoose.model('Lookup', new mongoose.Schema({ lookup_type: String, lookup_value: String }, { strict: false }));

// Check specific road width ID
const byId = await Lookup.findById('699beeb0ee5159cfdb8f3ed2').lean();
console.log('ID 699beeb0ee5159cfdb8f3ed2:', JSON.stringify(byId));

// All RoadWidth
const allRW = await Lookup.find({ lookup_type: 'RoadWidth' }).lean();
console.log('All RoadWidth:');
allRW.forEach(l => console.log(' ', l._id, '->', l.lookup_value));

await mongoose.disconnect();
