import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm');
    const LookupSchema = new mongoose.Schema({
        lookup_type: String,
        lookup_value: String
    }, { collection: 'lookups', strict: false });
    const Lookup = mongoose.model('LookupRaw', LookupSchema);

    const directions = await Lookup.find({ lookup_type: 'Direction' }).exec();
    console.log("Direction lookups:", directions);

    const facings = await Lookup.find({ lookup_type: 'Facing' }).exec();
    console.log("Facing lookups:", facings);

    mongoose.disconnect();
}

check().catch(console.error);
