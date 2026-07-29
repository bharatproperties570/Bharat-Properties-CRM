import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';

dotenv.config();

const test = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const invCount = await Inventory.countDocuments();
    const contactCount = await Contact.countDocuments();
    
    console.log('Inventory count:', invCount);
    console.log('Contact count:', contactCount);

    process.exit(0);
};

test();
