
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookupMetadata = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        const doc = await Lookup.findById('69a808d54461aa87753223f5');
        if (doc) {
            console.log('Lookup Metadata:');
            console.log(JSON.stringify(doc.metadata, null, 2));
        } else {
            console.log('Lookup not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookupMetadata();
