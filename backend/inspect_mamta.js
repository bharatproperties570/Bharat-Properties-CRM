import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Contact from './models/Contact.js';
import Inventory from './models/Inventory.js';

async function check() {
    await connectDB();
    
    // Find Mamta
    const contact = await Contact.findOne({ name: /Mamta/i }).populate('personalAddress.location').lean();
    console.log("Contact Mamta:", JSON.stringify(contact, null, 2));

    // Find the inventory
    const inventory = await Inventory.findOne({ unitNo: "197 P" }).populate('owners').lean();
    console.log("Inventory:", JSON.stringify(inventory, null, 2));

    mongoose.connection.close();
}

check();
