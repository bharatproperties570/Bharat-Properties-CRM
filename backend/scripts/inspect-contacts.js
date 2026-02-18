import mongoose from "mongoose";
import dotenv from "dotenv";
import Contact from "../models/Contact.js";

dotenv.config();

const inspectContacts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const contacts = await Contact.find({}).limit(5).lean();
        console.log(JSON.stringify(contacts, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

inspectContacts();
