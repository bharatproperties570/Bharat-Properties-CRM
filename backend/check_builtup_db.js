import mongoose from 'mongoose';
import './models/Inventory.js'; // Ensure model is registered
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';
        await mongoose.connect(uri);
        const Inventory = mongoose.model('Inventory');
        const items = await Inventory.find().sort({ createdAt: -1 }).limit(5);
        items.forEach(item => {
            const raw = item.toObject();
            console.log(`ID: ${item._id}, Project: ${item.projectName}, Unit: ${item.unitNo}`);
            console.log(`BuiltupDetails (Schema):`, item.builtupDetails);
            console.log(`BuiltupDetails (Raw):`, raw.builtupDetails);
            console.log('---');
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
