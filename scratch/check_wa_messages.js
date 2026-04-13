import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
        const Conversation = mongoose.model('Conversation', new mongoose.Schema({}, { strict: false }));

        const lastLeads = await Lead.find({ source: /AI Bot/i }).sort({ createdAt: -1 }).limit(5);
        console.log('\nLast AI Bot Leads:', JSON.stringify(lastLeads, null, 2));

        const lastConvs = await Conversation.find({}).sort({ updatedAt: -1 }).limit(5);
        console.log('\nLast WhatsApp Conversations:', JSON.stringify(lastConvs, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkData();
