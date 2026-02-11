import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import User from './models/User.js';

dotenv.config();

function isValidObjectId(str) {
    if (typeof str !== 'string') return true; // Null/undefined is "valid" (won't crash cast)
    if (str === '') return true; // Empty string might be valid or safe? Mongoose sometimes casts "" to null or fails.
    // Check 24 hex chars
    return /^[0-9a-fA-F]{24}$/.test(str);
}

const fieldsToCheck = [
    'title',
    'countryCode',
    'professionCategory',
    'professionSubCategory',
    'designation',
    'source',
    'subSource',
    'owner',
    'personalAddress.country',
    'correspondenceAddress.country',
    // arrays are harder to check in this simple loop but simpler fields first
];

const debugData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB. Scanning for invalid ObjectIds...");

        const contacts = await Contact.find({}).lean();
        console.log(`Scanning ${contacts.length} contacts...`);

        const crashRisks = {};

        for (const contact of contacts) {
            for (const field of fieldsToCheck) {
                // Handle nested
                const parts = field.split('.');
                let val = contact;
                for (const part of parts) {
                    val = val ? val[part] : null;
                }

                if (val && typeof val === 'string' && !isValidObjectId(val)) {
                    if (!crashRisks[field]) crashRisks[field] = new Set();
                    crashRisks[field].add(val);
                }
            }
        }

        console.log("--- Fields causing CastError (Crash Risk) ---");
        let hasRisks = false;
        for (const [field, values] of Object.entries(crashRisks)) {
            hasRisks = true;
            console.log(`Field: ${field}`);
            console.log(`  Invalid Examples (${values.size}):`, [...values].slice(0, 5));
        }

        if (!hasRisks) {
            console.log("No obvious invalid ObjectId strings found in scanned fields.");
        }

        process.exit();
    } catch (error) {
        console.error("Script Error:", error);
        process.exit(1);
    }
};

debugData();
