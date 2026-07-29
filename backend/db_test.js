import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bharat-properties-crm');
const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));

const test = async () => {
    const lead = await Lead.findOne({}).lean();
    const deal = await Deal.findOne({}).lean();
    if (!lead || !deal) {
        console.log("Missing lead or deal");
        process.exit(1);
    }
    console.log("Lead ID:", lead._id);
    console.log("Deal ID:", deal._id);
    
    // Attempt HTTP post to local server
    try {
        const response = await fetch('http://localhost:4000/api/marketing/send-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leadId: lead._id,
                dealIds: [deal._id],
                toggles: { whatsapp: true },
                matchContext: 'perfect'
            })
        });
        const data = await response.json();
        console.log("API Response:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error("Fetch Error:", e);
    }
    process.exit(0);
};
test();
