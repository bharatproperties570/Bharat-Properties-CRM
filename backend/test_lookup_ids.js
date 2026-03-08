
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkLookups = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');

        const idsToCheck = [
            '69956b4275e0967fae08d181', // Direction
            '699bc9cdee5159cfdb8f322e', // Facing
            '69a587c5b63c87c513f81a85'  // Road Width
        ];

        for (const id of idsToCheck) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                console.log(`ID: ${id} is INVALID.`);
                continue;
            }
            try {
                const doc = await Lookup.findById(new mongoose.Types.ObjectId(id));
                if (doc) {
                    console.log(`ID: ${id} FOUND. Type: ${doc.lookup_type}, Value: ${doc.lookup_value}`);
                } else {
                    console.log(`ID: ${id} NOT FOUND.`);
                }
            } catch (e) {
                console.log(`ID: ${id} Error: ${e.message}`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkLookups();
