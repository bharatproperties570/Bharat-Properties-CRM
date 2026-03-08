
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookups = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        const orientations = await Lookup.find({ lookup_type: 'Orientation' }).lean();
        console.log('Orientation Lookups:');
        orientations.forEach(o => {
            console.log(`ID: ${o._id}, Value: ${o.lookup_value}`);
        });
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookups();
