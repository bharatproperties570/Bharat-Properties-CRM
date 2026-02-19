import mongoose from 'mongoose';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import User from './models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MONGODB_URI = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function debug() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const data = {
            name: "Debug",
            surname: "Test",
            phones: [{ number: "1234567891", type: "Personal" }], // Changed phone and email slightly to avoid duplicates if any unique constraints
            emails: [{ address: "debug2@test.com", type: "Personal" }],
            requirement: "",
            budget: "",
            location: ""
        };

        // Mock resolveLookup behavior
        const resolveLookup = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: value });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
            }
            return lookup._id;
        };

        data.requirement = await resolveLookup('Requirement', data.requirement);
        data.budget = await resolveLookup('Budget', data.budget);
        data.location = await resolveLookup('Location', data.location);

        console.log("Data to create:", JSON.stringify(data, null, 2));

        const contact = await Contact.create(data);
        console.log("Contact created successfully:", contact._id);

    } catch (error) {
        console.error("FAILED TO CREATE CONTACT:");
        console.error(error);
        if (error.errors) {
            console.error("Mongoose Errors:", JSON.stringify(error.errors, null, 2));
        }
    } finally {
        await mongoose.disconnect();
    }
}

debug();
