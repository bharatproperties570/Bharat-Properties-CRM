import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Define models identically (or we can just import them if we set up the path right)
// The backend uses ESM, so we can just import from models
import '../models/Lookup.js';
import Lead from '../models/Lead.js';
import Conversation from '../models/Conversation.js';

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/test');
        console.log("Connected to MongoDB for Seeding");

        // Create a dummy lead
        const uniqueMobile = "99" + Math.floor(10000000 + Math.random() * 90000000).toString();
        const lead = await Lead.create({
            firstName: "Rajesh AI",
            lastName: "Demo",
            mobile: uniqueMobile,
            intent_index: 85,
            tags: ["AI Automated"],
            customFields: {
                budget: "45L",
                location: "Panipat City",
                intent: "Buy (Villa)"
            }
        });

        // Create a mock conversation
        await Conversation.create({
            lead: lead._id,
            channel: 'whatsapp',
            phoneNumber: '91' + uniqueMobile,
            status: 'active',
            messages: [
                { role: 'user', content: 'Mujhe Panipat me ek villa dekhna hai, budget 45 Lakhs hai.', timestamp: new Date(Date.now() - 600000) },
                { role: 'assistant', content: 'Namaste Rajesh Ji. Panipat City me 40-50 Lakhs ki range me bohot acche villas available hain. Kya mai is weekend site visit schedule karoon?', timestamp: new Date(Date.now() - 300000) },
            ]
        });

        console.log("Mock Conversation Seeded Successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding failed", err);
        process.exit(1);
    }
}

seedData();
