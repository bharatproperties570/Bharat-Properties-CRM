import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';

dotenv.config();

const test = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    console.time('Contact.create');
    try {
        const contact = new Contact({
            name: "Freeze Test",
            phones: [{ number: "9876543210" }]
        });
        await contact.save();
    } catch(err) {
        console.error("Error:", err);
    }
    console.timeEnd('Contact.create');
    
    process.exit(0);
};

test();
