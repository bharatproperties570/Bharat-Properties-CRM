
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkInventory() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
        const inv = await Inventory.findOne();
        console.log('Inventory Structure:');
        console.log(JSON.stringify(inv.toObject(), null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkInventory();
