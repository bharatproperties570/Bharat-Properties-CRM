
import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkLookups() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const typesToCheck = ['Document-Category', 'Document-Type', 'DocumentCategory', 'DocumentType'];
        const results = {};

        for (const type of typesToCheck) {
            results[type] = await Lookup.countDocuments({ lookup_type: type });
        }

        console.log('Lookup Counts:', JSON.stringify(results, null, 2));

        const categories = await Lookup.find({ lookup_type: { $in: ['Document-Category', 'DocumentCategory'] } });
        console.log('All Categories:', JSON.stringify(categories.map(c => ({ _id: c._id, value: c.lookup_value, type: c.lookup_type })), null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkLookups();
