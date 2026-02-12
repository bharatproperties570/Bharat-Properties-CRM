import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';

dotenv.config();

const checkInventory = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const items = await Inventory.find().limit(10).lean();
        console.log(JSON.stringify(items, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkInventory();
