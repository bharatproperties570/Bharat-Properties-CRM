import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { generateBotResponse } from './services/aiBot.service.js';
import Lead from './models/Lead.js';

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB\n");

    const mockLead = await Lead.findOne({ mobile: '9991000570' }) || { firstName: 'Test', mobile: '9991000570' };

    const aiContext = {
        chatHistory: "user: Hi\nassistant: Hello! I'm Suraj from Bharat Properties. How can I help you today?",
        lead: mockLead,
        entityType: 'Lead'
    };

    console.log("--- TEST 1: Seller Intent ---");
    const res1 = await generateBotResponse("I want to sell my plot in Sector 7", aiContext);
    console.log("User: I want to sell my plot in Sector 7");
    console.log("AI:", res1.reply);
    console.log("\n----------------------------\n");

    const aiContext2 = {
        chatHistory: aiContext.chatHistory + "\nuser: I want to sell my plot in Sector 7\nassistant: " + res1.reply,
        lead: mockLead,
        entityType: 'Lead'
    };

    console.log("--- TEST 2: Providing Unit Number (Should skip Size/Location) ---");
    const res2 = await generateBotResponse("It is plot number 123", aiContext2);
    console.log("User: It is plot number 123");
    console.log("AI:", res2.reply);

    process.exit(0);
}

test();
