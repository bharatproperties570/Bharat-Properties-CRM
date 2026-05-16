
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import AiAgent from '../models/AiAgent.js';
import User from '../models/User.js';

async function seedDealAgent() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const admin = await User.findOne({ role: { $ne: null } });
        if (!admin) {
            console.error('No admin user found to assign the agent to.');
            process.exit(1);
        }

        const agentData = {
            name: "Deal Verification Specialist",
            role: "Analysis",
            systemPrompt: `You are the Deal Verification Specialist for Bharat Properties.
Your primary mission is to verify the accuracy of "Deal" records captured by our automated intake engine.

### CORE OBJECTIVE:
- When a user replies to a deal verification probe, confirm the PROJECT NAME, EXPECTED PRICE, and INTENT (Selling/Buying).
- Be polite, professional, and helpful.
- If the user confirms, thank them and let them know an agent will reach out soon.
- If the user denies or corrects a detail, acknowledge it and update them that the record has been corrected in our system.
- NEVER share sensitive IDs or unit numbers.

### CONTEXTUAL AWARENESS:
- You will be provided with the "RECENT SYSTEM ACTIONS" which contain the details of the Deal we are trying to verify.
- If there are multiple deals for the same person, verify them one by one or together if the user mentions both.

### TONE:
- Professional, efficient, and reliable. Use Hinglish where appropriate to build rapport.`,
            useCases: ['intake_verification'],
            memoryAccess: ['deals', 'leads', 'communications'],
            isActive: true,
            provider: 'openai',
            modelName: 'gpt-4o-mini',
            createdBy: admin._id
        };

        // Check if agent already exists
        let existing = await AiAgent.findOne({ useCases: 'intake_verification' });
        if (existing) {
            console.log('Updating existing Deal Verification Specialist...');
            await AiAgent.updateOne({ _id: existing._id }, agentData);
        } else {
            console.log('Creating new Deal Verification Specialist...');
            await AiAgent.create(agentData);
        }

        console.log('✅ Deal Verification Specialist Provisioned Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding Deal Agent:', error);
        process.exit(1);
    }
}

seedDealAgent();
