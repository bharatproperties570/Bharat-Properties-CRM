
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties';

async function checkLookups() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            is_active: Boolean
        }, { strict: false }));

        console.log('--- PropertyType Lookups for "1 Kanal" ---');
        const propertyTypes = await Lookup.find({ lookup_type: 'PropertyType', lookup_value: '1 Kanal' });
        console.log(JSON.stringify(propertyTypes, null, 2));

        if (propertyTypes.length === 0) {
            console.log('PropertyType "1 Kanal" not found.');
        } else {
            for (const pt of propertyTypes) {
                console.log(`\n--- BuiltupType Lookups for Parent ${pt._id} ("1 Kanal") ---`);
                const builtups = await Lookup.find({ lookup_type: 'BuiltupType', parent_lookup_id: pt._id });
                console.log(JSON.stringify(builtups, null, 2));
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkLookups();
