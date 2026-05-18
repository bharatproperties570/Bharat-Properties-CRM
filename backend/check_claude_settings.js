import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    try {
        if (!MONGODB_URI) {
            throw new Error("MONGODB_URI is not set in backend .env file!");
        }
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB!");

        const db = mongoose.connection.db;
        const systemsettings = db.collection('systemsettings');
        const aiagents = db.collection('aiagents');

        // Check active AI Agents
        console.log("\n--- Active AI Agents ---");
        const agents = await aiagents.find({ isActive: true }).toArray();
        for (const agent of agents) {
            console.log(`Agent Name: ${agent.name}`);
            console.log(`Role: ${agent.role}`);
            console.log(`Provider: ${agent.provider}`);
            console.log(`Model: ${agent.modelName}`);
            console.log(`UseCases: ${JSON.stringify(agent.useCases)}`);
            console.log("------------------------");
        }

        // Check preferred provider
        console.log("\n--- Preferred AI Provider Setting ---");
        const preferredSetting = await systemsettings.findOne({ key: 'ai_preferred_provider' });
        console.log("Setting:", JSON.stringify(preferredSetting, null, 2));

        // Check Claude settings
        console.log("\n--- Claude Configuration Setting ---");
        const claudeSetting = await systemsettings.findOne({ key: 'ai_claude_config' });
        if (claudeSetting) {
            const masked = { ...claudeSetting };
            if (masked.value && masked.value.apiKey) {
                masked.value = { 
                    ...masked.value, 
                    apiKey: masked.value.apiKey.substring(0, 7) + '...' + masked.value.apiKey.substring(masked.value.apiKey.length - 4) 
                };
            }
            console.log(JSON.stringify(masked, null, 2));
        } else {
            console.log("No Claude configuration found in systemsettings.");
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
