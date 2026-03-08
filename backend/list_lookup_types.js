import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function listTypes() {
    try {
        await mongoose.connect(mongoUri);
        const types = await Lookup.distinct('lookup_type');
        console.log("Lookup Types:", types);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
listTypes();
