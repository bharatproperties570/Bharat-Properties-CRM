import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const conv = await mongoose.connection.db.collection("conversations")
        .findOne({ _id: new mongoose.Types.ObjectId("69edc02343dc00deb8b94e55") });

    if (conv) {
        console.log(`Conversation for ${conv.phoneNumber}:`);
        conv.messages.slice(-30).forEach((m, idx) => {
            console.log(`${idx + 1}. [${m.role}] [${m.timestamp}] ${m.content}`);
        });
    }

    await mongoose.disconnect();
}

run().catch(console.error);
