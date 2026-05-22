import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "backend/.env" });

const mongoUri = process.env.MONGODB_URI;

async function run() {
    console.log("Connecting to:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB!");

    // 1. Check SystemSetting for meta_wa_config
    const SystemSetting = mongoose.connection.db.collection('systemsettings');
    const waConfig = await SystemSetting.findOne({ key: 'meta_wa_config' });
    console.log("\n=== Meta WA DB Config ===");
    if (waConfig) {
        console.log("Found config:", {
            key: waConfig.key,
            phoneId: waConfig.value?.phoneId,
            businessId: waConfig.value?.businessId,
            tokenLength: waConfig.value?.token ? waConfig.value.token.length : 0,
            hasToken: !!waConfig.value?.token
        });
    } else {
        console.log("No meta_wa_config found in DB!");
    }

    // 2. Search activities for "dispatched" or "Sandeep" or "565"
    console.log("\n=== Searching Activities for 'Sandeep' or '565' or '805' ===");
    const ActivityCol = mongoose.connection.db.collection('activities');
    const activities = await ActivityCol.find({
        $or: [
            { subject: { $regex: /Sandeep|565|805/i } },
            { description: { $regex: /Sandeep|565|805/i } },
            { note: { $regex: /Sandeep|565|805/i } }
        ]
    }).sort({ createdAt: -1 }).limit(10).toArray();

    console.log(`Found ${activities.length} matching activities:`);
    activities.forEach((act, index) => {
        console.log(`\n[Activity ${index + 1}]`);
        console.log(`ID: ${act._id}`);
        console.log(`Type: ${act.type}`);
        console.log(`Subject: ${act.subject}`);
        console.log(`Description: ${act.description}`);
        console.log(`Status: ${act.status}`);
        console.log(`Performed By: ${act.performedBy || act.performedAt}`);
        console.log(`CreatedAt: ${act.createdAt}`);
    });

    // 3. Search messages/conversations for "dispatched"
    console.log("\n=== Searching Conversations/Messages for '565' or '805' ===");
    const ConversationCol = mongoose.connection.db.collection('conversations');
    const convs = await ConversationCol.find({
        $or: [
            { "messages.text": { $regex: /565|805/i } }
        ]
    }).limit(5).toArray();
    console.log(`Found ${convs.length} matching conversations.`);

    await mongoose.disconnect();
    console.log("\nDisconnected.");
}

run().catch(console.error);
