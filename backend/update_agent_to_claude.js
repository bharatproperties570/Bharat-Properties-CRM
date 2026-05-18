import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
    try {
        if (!MONGODB_URI) {
            throw new Error("MONGODB_URI is not set!");
        }
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB!");

        const db = mongoose.connection.db;
        const aiagents = db.collection('aiagents');

        // Update Bharat Properties AI Assistant
        const updateResult = await aiagents.updateOne(
            { name: "Bharat Properties AI Assistant" },
            { 
                $set: { 
                    provider: "anthropic",
                    modelName: "claude-haiku-4-5-20251001"
                } 
            }
        );

        console.log(`Updated Bharat Properties AI Assistant:`, updateResult);

        // Verify changes
        const agent = await aiagents.findOne({ name: "Bharat Properties AI Assistant" });
        console.log("\nUpdated Agent State:");
        console.log(`Name: ${agent.name}`);
        console.log(`Provider: ${agent.provider}`);
        console.log(`ModelName: ${agent.modelName}`);

        await mongoose.disconnect();
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
