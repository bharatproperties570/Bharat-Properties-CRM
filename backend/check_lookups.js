import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function checkLookups() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");
        const titles = await Lookup.find({ lookup_type: 'Title' });
        console.log("Titles found:", titles.map(t => t.lookup_value));
        const countryCodes = await Lookup.find({ lookup_type: 'CountryCode' });
        console.log("CountryCodes found:", countryCodes.map(c => c.lookup_value));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkLookups();
