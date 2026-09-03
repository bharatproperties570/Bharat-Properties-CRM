import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
    const dealId = '6a3322abd9dc119278626f61'; // From the output of test_match2.js
    const inv = await Inventory.findById(dealId).lean();
    console.log(inv.price);
    process.exit(0);
}
run();
