
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String,
    is_active: Boolean
}, { timestamps: true });

const Lookup = mongoose.model('Lookup', LookupSchema);

async function checkLookups() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const lookups = await Lookup.find({ lookup_type: 'Category' });
        console.log(`Found ${lookups.length} Category lookups.`);

        lookups.forEach(l => {
            console.log(`Value: ${l.lookup_value}, Created At: ${l.createdAt}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkLookups();
