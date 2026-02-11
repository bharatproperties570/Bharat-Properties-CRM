import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const locs = await Lookup.find({ lookup_type: 'Location' }).limit(10);
        const tehsils = await Lookup.find({ lookup_type: 'Tehsil' }).limit(10);

        console.log('Location samples (lookup_type, parent_lookup_id):');
        locs.forEach(l => console.log(`  - ${l.lookup_value}: ${l.lookup_type}, parent: ${l.parent_lookup_id}`));

        console.log('Tehsil samples (lookup_type, parent_lookup_id):');
        tehsils.forEach(t => console.log(`  - ${t.lookup_value}: ${t.lookup_type}, parent: ${t.parent_lookup_id}`));

        // Count docs where lookup_type is one thing but might have been meant for another
        const total = await Lookup.countDocuments();
        console.log('Total Lookups:', total);

        const types = await Lookup.distinct('lookup_type');
        console.log('Distinct Types:', types);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

test();
