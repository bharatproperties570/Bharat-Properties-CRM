import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const counts = await Lookup.aggregate([
            { $group: { _id: "$lookup_type", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('Counts per lookup_type:', JSON.stringify(counts, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

test();
