
import mongoose from 'mongoose';
import { generateBotResponse } from './services/aiBot.service.js';
import Lead from './models/Lead.js';
import Conversation from './models/Conversation.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';
import AiAgent from './models/AiAgent.js';
import dbConnect from './src/config/db.js';

async function test() {
    await dbConnect();
    console.log("Connected to DB");

    const messageText = "Hi, I want to sell my plot in Sector 3";
    const fromNumber = "919416035570";

    // 1. Check if agent exists
    const agent = await AiAgent.findOne({ useCases: 'whatsapp_live', isActive: true });
    console.log("Agent found:", agent ? agent.name : "NONE");
    if (!agent) return;

    // 2. Try to generate response
    console.log("Generating response...");
    try {
        const aiResult = await generateBotResponse(messageText, { history: "user: " + messageText });
        console.log("AI Result:", JSON.stringify(aiResult, null, 2));

        if (aiResult.success) {
            // 3. Check credentials
            const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
            const config = setting?.value;
            const token = config?.token || config?.accessToken || config?.waToken || config?.apiKey;
            const phoneId = config?.phoneId || config?.waPhoneId;
            
            console.log("Credentials:", { 
                hasToken: !!token, 
                hasPhoneId: !!phoneId,
                phoneId: phoneId
            });
        }
    } catch (e) {
        console.error("GENERATE ERROR:", e.message);
    }

    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
