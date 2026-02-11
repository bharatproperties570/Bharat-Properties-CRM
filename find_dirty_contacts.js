
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend
dotenv.config({ path: './backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("MONGODB_URI not found");
    process.exit(1);
}

// Minimal Schema to check fields
const ContactSchema = new mongoose.Schema({}, { strict: false, collection: 'contacts' });
const Contact = mongoose.model('Contact', ContactSchema);

async function checkData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to DB");

        const contacts = await Contact.find({}).lean();
        console.log(`Checking ${contacts.length} contacts...`);

        const refFields = [
            'title', 'countryCode', 'professionCategory', 'professionSubCategory',
            'designation', 'source', 'subSource', 'owner'
        ];

        const invalidContacts = [];

        contacts.forEach(c => {
            let isInvalid = false;
            let reasons = [];

            refFields.forEach(f => {
                const val = c[f];
                if (val && typeof val === 'string' && val.trim() !== "" && !mongoose.Types.ObjectId.isValid(val)) {
                    isInvalid = true;
                    reasons.push(`${f}: "${val}" is not a valid ObjectId`);
                }
            });

            // Check arrays
            if (Array.isArray(c.educations)) {
                c.educations.forEach((edu, i) => {
                    if (edu.education && typeof edu.education === 'string' && !mongoose.Types.ObjectId.isValid(edu.education)) {
                        isInvalid = true;
                        reasons.push(`educations[${i}].education: "${edu.education}"`);
                    }
                });
            }

            if (isInvalid) {
                invalidContacts.push({ id: c._id, name: c.name, reasons });
            }
        });

        if (invalidContacts.length > 0) {
            console.log("Found invalid contacts:");
            console.log(JSON.stringify(invalidContacts, null, 2));
        } else {
            console.log("No invalid contacts found (at least in top-level fields).");
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
