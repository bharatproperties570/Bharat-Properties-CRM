
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookupMetadata = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        const docs = await Lookup.find({ 'metadata.orientation': { $exists: true } }).lean();

        console.log(`Found ${docs.length} lookups with orientation metadata:`);
        docs.forEach(doc => {
            console.log(`ID: ${doc._id}, Value: ${doc.lookup_value}, Orientation: ${doc.metadata.orientation}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookupMetadata();
