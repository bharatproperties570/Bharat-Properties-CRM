import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function listLookupTypes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String
        }));

        const types = await Lookup.distinct('lookup_type');
        console.log('Available Lookup Types:', types);

        const samples = await Lookup.find({ lookup_type: { $in: ['Category', 'SubCategory', 'PropertyType', 'SubType', 'Location'] } }).limit(5);
        console.log('\nSample Lookups:');
        samples.forEach(l => console.log(`- ${l.lookup_type}: ${l.lookup_value} (${l._id})`));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

listLookupTypes();
