
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookup = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        const doc = await Lookup.findById('699bc99fee5159cfdb8f2e29');
        if (doc) {
            console.log(`ID: 699bc99fee5159cfdb8f2e29 FOUND. Type: ${doc.lookup_type}, Value: ${doc.lookup_value}`);
        } else {
            console.log(`ID: 699bc99fee5159cfdb8f2e29 NOT FOUND.`);
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookup();
