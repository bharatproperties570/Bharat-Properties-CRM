import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkBuiltupLookups() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_realestate');
        
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            isActive: Boolean
        }));

        const buildupLookups = await Lookup.find({ lookup_type: 'BuiltupType' }).lean();
        
        console.log('--- BUILTUP LOOKUPS IN DATABASE ---');
        buildupLookups.forEach(l => {
            console.log(`ID: ${l._id} | Value: "${l.lookup_value}" | Type: ${l.lookup_type}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkBuiltupLookups();
