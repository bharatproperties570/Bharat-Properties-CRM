
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookupTime = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        const doc = await Lookup.findById('69ab2d2d10c591552570a141');
        if (doc) {
            console.log('Lookup ID: 69ab2d2d10c591552570a141');
            console.log('Value:', doc.lookup_value);
            console.log('CreatedAt:', doc.createdAt);
            console.log('UpdatedAt:', doc.updatedAt);
        } else {
            console.log('Lookup not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookupTime();
