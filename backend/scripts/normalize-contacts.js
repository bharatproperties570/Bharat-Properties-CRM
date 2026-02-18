import mongoose from "mongoose";
import dotenv from "dotenv";
import Contact from "../models/Contact.js";
import Lookup from "../models/Lookup.js";

dotenv.config();

const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;

    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: value });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
        console.log(`[CREATED] Lookup: ${type} -> ${value}`);
    }
    return lookup._id;
};

const normalizeContacts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const contacts = await Contact.find({});
        console.log(`Found ${contacts.length} contacts to check`);

        for (const contact of contacts) {
            let updated = false;

            // Resolve Standard Lookups
            const lookupFields = [
                { name: 'title', type: 'Title' },
                { name: 'professionCategory', type: 'ProfessionalCategory' },
                { name: 'professionSubCategory', type: 'ProfessionalSubCategory' },
                { name: 'designation', type: 'ProfessionalDesignation' },
                { name: 'source', type: 'Source' },
                { name: 'subSource', type: 'Sub-Source' },
                { name: 'campaign', type: 'Campaign' }
            ];

            for (const field of lookupFields) {
                if (contact[field.name] && !mongoose.Types.ObjectId.isValid(contact[field.name])) {
                    contact[field.name] = await resolveLookup(field.type, contact[field.name]);
                    updated = true;
                }
            }

            // Resolve Address Lookups (Internal)
            const addressLookups = [
                { name: 'country', type: 'Country' },
                { name: 'state', type: 'State' },
                { name: 'city', type: 'City' },
                { name: 'tehsil', type: 'Tehsil' },
                { name: 'postOffice', type: 'PostOffice' },
                { name: 'location', type: 'Location' }
            ];

            if (contact.personalAddress) {
                for (const field of addressLookups) {
                    if (contact.personalAddress[field.name] && !mongoose.Types.ObjectId.isValid(contact.personalAddress[field.name])) {
                        contact.personalAddress[field.name] = await resolveLookup(field.type, contact.personalAddress[field.name]);
                        updated = true;
                    }
                }
            }

            if (contact.correspondenceAddress) {
                for (const field of addressLookups) {
                    if (contact.correspondenceAddress[field.name] && !mongoose.Types.ObjectId.isValid(contact.correspondenceAddress[field.name])) {
                        contact.correspondenceAddress[field.name] = await resolveLookup(field.type, contact.correspondenceAddress[field.name]);
                        updated = true;
                    }
                }
            }

            if (updated) {
                await contact.save();
                console.log(`[UPDATED] Contact: ${contact.name} (${contact._id})`);
            }
        }

        console.log("Normalization complete");
    } catch (error) {
        console.error("Error normalizing contacts:", error);
    } finally {
        await mongoose.disconnect();
    }
};

normalizeContacts();
