import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const total = await Lookup.countDocuments();
        console.log('Total lookups:', total);

        const samples = await Lookup.find().limit(5).lean();
        console.log('Samples:', JSON.stringify(samples, null, 2));

        const types = await Lookup.distinct('lookup_type');
        console.log('Distinct lookup_type:', types);

        const oldTypes = await Lookup.distinct('type');
        console.log('Distinct type (old field):', oldTypes);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

test();
