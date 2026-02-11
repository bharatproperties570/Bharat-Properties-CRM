import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties";

function recursiveClean(obj) {
    let changed = false;
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (recursiveClean(obj[i])) changed = true;
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const key in obj) {
            if (obj[key] === "") {
                obj[key] = null;
                changed = true;
            } else if (typeof obj[key] === 'object') {
                if (recursiveClean(obj[key])) changed = true;
            }
        }
    }
    return changed;
}

async function nuclearFix() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Contact = mongoose.model('Contact', new mongoose.Schema({}, { strict: false }));

        const contacts = await Contact.find({});
        console.log(`Found ${contacts.length} contacts`);

        let totalFixed = 0;

        for (const contact of contacts) {
            const doc = contact.toObject();
            if (recursiveClean(doc)) {
                // Since it's strict: false and we have the whole object, let's just overwrite
                delete doc._id; // Don't overwrite _id
                await Contact.updateOne({ _id: contact._id }, doc);
                totalFixed++;
                console.log(`Fixed contact: ${contact._id}`);
            }
        }

        console.log(`Cleanup complete. Total contacts fixed: ${totalFixed}`);
        process.exit(0);
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

nuclearFix();
