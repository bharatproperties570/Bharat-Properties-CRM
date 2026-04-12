import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function checkInventory() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        const inv = await Inventory.findById('69ad6c41686747eaeaa09d4b').lean();
        console.log(`Inventory C-120:`, JSON.stringify(inv, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkInventory();
