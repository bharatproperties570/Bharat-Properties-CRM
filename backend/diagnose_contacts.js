import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

dotenv.config();

const diagnose = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const contacts = await Contact.find().limit(100).lean();
        console.log(`Checking ${contacts.length} contacts...`);

        const refFields = ['title', 'designation', 'professionSubCategory', 'source', 'subSource'];
        const addressRefFields = ['country', 'state', 'city', 'tehsil', 'postOffice', 'location'];

        contacts.forEach(c => {
            refFields.forEach(f => {
                if (c[f] === "") {
                    console.log(`Contact ${c._id} (${c.name}) has empty string in field: ${f}`);
                }
            });

            if (c.personalAddress) {
                addressRefFields.forEach(f => {
                    if (c.personalAddress[f] === "") {
                        console.log(`Contact ${c._id} (${c.name}) has empty string in personalAddress.${f}`);
                    }
                });
            }
        });

        console.log("Diagnostic complete.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

diagnose();
