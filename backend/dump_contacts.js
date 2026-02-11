import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties";

async function dumpData() {
    try {
        await mongoose.connect(MONGODB_URI);
        const Contact = mongoose.model('Contact', new mongoose.Schema({}, { strict: false }));
        const contacts = await Contact.find({});
        fs.writeFileSync('contacts_dump.json', JSON.stringify(contacts, null, 2));
        console.log(`Dumped ${contacts.length} contacts to contacts_dump.json`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

dumpData();
