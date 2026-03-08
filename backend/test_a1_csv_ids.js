
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookups = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');

        const ids = [
            '69956b4275e0967fae08d182',
            '699bc99fee5159cfdb8f2e2c',
            '699beeb0ee5159cfdb8f3ed2'
        ];

        for (const id of ids) {
            const doc = await Lookup.findById(id);
            if (doc) {
                console.log(`ID: ${id} | Type: ${doc.lookup_type} | Value: ${doc.lookup_value}`);
            } else {
                console.log(`ID: ${id} | NOT FOUND`);
            }
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookups();
