
import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkSizes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const sizes = await Lookup.find({ lookup_type: 'Size' }).lean();
        console.log(`Found ${sizes.length} Size lookups.`);

        sizes.slice(0, 10).forEach(s => {
            console.log(`\nID: ${s._id}`);
            console.log(`Value: ${s.lookup_value}`);
            console.log(`Metadata:`, JSON.stringify(s.metadata, null, 2));
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSizes();
