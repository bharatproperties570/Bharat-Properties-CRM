import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const conversations = await mongoose.connection.db.collection("conversations")
        .find({})
        .sort({ updatedAt: -1 })
        .limit(5)
        .toArray();

    console.log(`Found ${conversations.length} conversations:`);
    for (const conv of conversations) {
        console.log(`\nConversation ID: ${conv._id}`);
        console.log(`  Phone: ${conv.phoneNumber}`);
        console.log(`  Channel: ${conv.channel}`);
        console.log(`  Status: ${conv.status}`);
        console.log(`  UseCase: ${conv.currentUseCase}`);
        console.log(`  Updated At: ${conv.updatedAt}`);
        console.log(`  Messages Count: ${conv.messages?.length || 0}`);
        if (conv.messages && conv.messages.length > 0) {
            console.log("  Last 5 Messages:");
            conv.messages.slice(-5).forEach(m => {
                console.log(`    [${m.role}] [${m.timestamp}] ${m.content}`);
            });
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
