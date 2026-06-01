import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getLeadMatches } from './controllers/lead.controller.js';
dotenv.config({ path: './.env' });

// Create fake req/res to call getLeadMatches
async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Find the lead "Panch Ram Saini"
        const Lead = mongoose.connection.collection('leads');
        const lead = await Lead.findOne({ name: /Panch Ram Saini/i });
        if (!lead) {
            console.log("Lead not found!");
            await mongoose.disconnect();
            return;
        }
        console.log("Lead ID:", lead._id);

        // Let's call getLeadMatches or call the matching query directly
        // Or we can just find deals/inventories. Wait, how does getLeadMatches get matching?
        // Let's check lead.controller.js to see getLeadMatches
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
