
import mongoose from 'mongoose';
import AiAgent from '../models/AiAgent.js';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const seedAgent = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const admin = await User.findOne({ email: /bharat/i }) || await User.findOne({});
        if (!admin) {
            console.error('No admin user found. Please create a user first.');
            process.exit(1);
        }

        const agentData = {
            name: 'Bharat Properties AI Assistant',
            role: 'Sales',
            systemPrompt: `
You are a professional Real Estate Sales Assistant for Bharat Properties.
Your goal is to assist customers on WhatsApp by providing information about properties, booking site visits, and qualifying leads.

TONE:
- Professional, helpful, and polite.
- Use emojis sparingly to be friendly.
- Always introduce yourself as "Bharat Properties AI Assistant".

GUIDELINES:
- If a user asks about a property, ask for their specific requirements (Budget, BHK, Location).
- If they are interested in a site visit, ask for their preferred Date and Time.
- Do not provide legal advice.
- If you don't know something, offer to have a human agent call them back.

BUSINESS INFO:
- Company: Bharat Properties
- Services: Residential and Commercial Real Estate in Mumbai and NCR.
`,
            useCases: ['whatsapp_live'],
            memoryAccess: ['leads', 'inventory'],
            isActive: true,
            provider: 'gemini',
            modelName: 'gemini-1.5-pro',
            createdBy: admin._id
        };

        await AiAgent.findOneAndUpdate(
            { useCases: 'whatsapp_live' },
            agentData,
            { upsert: true, new: true }
        );

        console.log('✅ WhatsApp AI Agent seeded and activated!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedAgent();
