import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';

async function runMigration() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("MongoDB Connected.");

    // Find all contacts that have personalAddress.hNo or correspondenceAddress.hNo populated
    const contacts = await Contact.find({
        $or: [
            { "personalAddress.hNo": { $ne: null, $ne: "" } },
            { "correspondenceAddress.hNo": { $ne: null, $ne: "" } }
        ]
    });

    console.log(`Found ${contacts.length} contacts to check for house number prefixes.`);

    let adjustedCount = 0;
    const prefixRegex = /^(?:h\s*\.?\s*no\.?\s*(?:no\.?)?|house\s*(?:no\.?)?|flat\s*(?:no\.?)?|plot\s*(?:no\.?)?|qtr\s*\.?\s*(?:no\.?)?|quarter\s*(?:no\.?)?|shop\s*(?:no\.?)?|ward\s*(?:no\.?)?|no\.?)\s*[-:#\/\s]*\s*/i;

    for (const contact of contacts) {
        let modified = false;

        if (contact.personalAddress && contact.personalAddress.hNo) {
            const original = contact.personalAddress.hNo;
            const cleaned = original.replace(prefixRegex, '').trim();
            if (cleaned !== original) {
                console.log(`[CLEANING] Personal H.No: "${original}" -> "${cleaned}" for Contact: ${contact.name}`);
                contact.personalAddress.hNo = cleaned;
                modified = true;
            }
        }

        if (contact.correspondenceAddress && contact.correspondenceAddress.hNo) {
            const original = contact.correspondenceAddress.hNo;
            const cleaned = original.replace(prefixRegex, '').trim();
            if (cleaned !== original) {
                console.log(`[CLEANING] Correspondence H.No: "${original}" -> "${cleaned}" for Contact: ${contact.name}`);
                contact.correspondenceAddress.hNo = cleaned;
                modified = true;
            }
        }

        if (modified) {
            contact.markModified('personalAddress');
            contact.markModified('correspondenceAddress');
            await contact.save();
            adjustedCount++;
        }
    }

    console.log(`\nHouse Number Prefix Cleaning Completed.`);
    console.log(`Total Adjusted Contacts: ${adjustedCount}`);
    
    mongoose.connection.close();
    console.log("Database connection closed.");
}

runMigration().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
