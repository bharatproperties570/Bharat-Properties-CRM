import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function findLookupTypes() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri);
        
        const db = mongoose.connection.db;
        const collection = db.collection('lookups');

        // Find some distinct lookup types
        const types = await collection.distinct('lookup_type');
        console.log('Available Lookup Types:', types);

        // Find a lookup that looks like a pincode
        const samplePincode = await collection.findOne({ 
            lookup_value: /^[0-9]{6}$/ 
        });
        
        if (samplePincode) {
            console.log('Found a 6-digit lookup:', samplePincode);
        } else {
            console.log('No 6-digit numeric lookup found.');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findLookupTypes();
