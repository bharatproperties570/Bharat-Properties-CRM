import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const intakes = await db.collection('intakes').find({}).toArray();
    console.log(`Intakes count: ${intakes.length}`);
    for (const intake of intakes) {
        const str = JSON.stringify(intake);
        if (str.includes("drive.google.com") || str.includes("google.com")) {
            console.log(`Intake ID: ${intake._id}, subject: "${intake.subject || intake.title}"`);
            console.log(`  -> HAS GOOGLE DRIVE LINK!`);
            console.log(`  data:`, JSON.stringify(intake, null, 2));
        }
    }
    process.exit(0);
}
inspect();
