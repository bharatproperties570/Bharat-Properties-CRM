
import mongoose from 'mongoose';
import Lookup from './backend/models/Lookup.js';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

async function checkLookups() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const docCategories = await Lookup.find({ lookup_type: 'Document-Category' });
        console.log('Document Categories:', JSON.stringify(docCategories, null, 2));

        const docTypes = await Lookup.find({ lookup_type: 'Document-Type' });
        console.log('Document Types:', JSON.stringify(docTypes, null, 2));

        const allTypes = await Lookup.distinct('lookup_type');
        console.log('All Lookup Types:', allTypes);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkLookups();
