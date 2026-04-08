
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;

async function cleanupData() {
    try {
        await mongoose.connect(mongoUri);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
        
        const pt = await Lookup.findOne({ lookup_type: 'PropertyType', lookup_value: '1 Kanal' });
        if (pt) {
            console.log(`Cleaning up old lookups for parent ${pt._id}...`);
            const result = await Lookup.deleteMany({
                lookup_type: 'BuiltupType',
                parent_lookup_id: pt._id,
                lookup_value: { $in: ['25% Built Up', '40% Built Up', '50% Built Up'] }
            });
            console.log(`Deleted ${result.deletedCount} old lookups.`);
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
cleanupData();
