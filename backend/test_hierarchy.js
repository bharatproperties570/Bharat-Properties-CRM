import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    await mongoose.connect('mongodb://localhost:27017/bharat-properties-crm', { useNewUrlParser: true, useUnifiedTopology: true });
    
    const locations = await Lookup.find({ lookup_type: 'Location', isActive: true }).populate('parent_lookup_id').limit(5).lean();
    console.log("Locations with parents:", JSON.stringify(locations.map(l => ({
        val: l.lookup_value, 
        parent: l.parent_lookup_id ? l.parent_lookup_id.lookup_value : null,
        parentType: l.parent_lookup_id ? l.parent_lookup_id.lookup_type : null
    })), null, 2));

    process.exit(0);
}
test();
