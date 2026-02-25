import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String
}, { collection: 'lookups' });

const Lookup = mongoose.model('Lookup', LookupSchema);

async function listTypes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const types = await Lookup.distinct('lookup_type');
        console.log('\nUnique Lookup Types:');
        types.forEach(t => console.log(`- ${t}`));

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

listTypes();
