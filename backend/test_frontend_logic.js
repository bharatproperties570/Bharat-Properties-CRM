import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lookups = await Lookup.find({ lookup_type: 'PropertyType' }).lean();
    
    const formData = { subType: ['Plot'] };
    
    const matchedTypes = lookups
        .filter(l => formData.subType.includes(l.parent_lookup_value) || formData.subType.includes(l.parentValue))
        .map(l => l.lookup_value);
        
    console.log('Matched for Plot:', Array.from(new Set(matchedTypes)).sort());
    
    const formDataHouse = { subType: ['House'] };
    const matchedTypesHouse = lookups
        .filter(l => formDataHouse.subType.includes(l.parent_lookup_value) || formDataHouse.subType.includes(l.parentValue))
        .map(l => l.lookup_value);
        
    console.log('Matched for House:', Array.from(new Set(matchedTypesHouse)).sort());
    
    process.exit(0);
}
run();
