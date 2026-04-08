
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties';

async function checkLookups() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));

        console.log('--- PropertyType Lookups ---');
        const propertyTypes = await Lookup.find({ lookup_type: 'PropertyType', lookup_value: '1 Kanal' });
        console.log(JSON.stringify(propertyTypes, null, 2));

        if (propertyTypes.length === 0) {
            console.log('PropertyType "1 Kanal" not found.');
        } else {
            const parentId = propertyTypes[0]._id;
            console.log(`\n--- BuiltupType Lookups for Parent ${parentId} ("1 Kanal") ---`);
            const builtups = await Lookup.find({ lookup_type: 'BuiltupType', parent_lookup_id: parentId });
            console.log(JSON.stringify(builtups, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkLookups();
