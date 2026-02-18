import mongoose from "mongoose";
import dotenv from "dotenv";
import Contact from "../models/Contact.js";
import Lookup from "../models/Lookup.js"; // Ensure model is compiled

dotenv.config();

const testPopulate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const contact = await Contact.findOne({ name: "Ram" })
            .populate([
                { path: 'source', select: 'lookup_value' },
                { path: 'personalAddress.location', select: 'lookup_value' }
            ])
            .lean();

        console.log("Contact with population:", JSON.stringify(contact, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

testPopulate();
