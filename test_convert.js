import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { convertLeadToContact } from './backend/controllers/lead.controller.js';
import Lead from './backend/models/Lead.js';

dotenv.config({ path: './backend/.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find a lead
    const lead = await Lead.findOne({ isConverted: { $ne: true } }).lean();
    if (!lead) {
        console.log("No unconverted lead found");
        process.exit(0);
    }
    
    console.log("Found lead to convert:", lead._id);
    
    const req = { params: { id: lead._id.toString() } };
    const res = {
        status: (code) => ({
            json: (data) => {
                console.log("Status:", code);
                console.log("Response:", data);
            }
        })
    };
    const next = (err) => console.error("Next error:", err);
    
    await convertLeadToContact(req, res, next);
    process.exit(0);
}
run();
