import connectDB from "./src/config/db.js";
import mongoose from "mongoose";
import Intake from "./models/Intake.js";

async function run() {
    await connectDB();
    console.log("Connected to MongoDB");

    const processed = await Intake.findOne({ status: "Processed" });
    console.log("Sample PROCESSED intake document:", JSON.stringify(processed, null, 2));

    const failed = await Intake.findOne({ status: "Failed" });
    if (failed) {
        console.log("Sample FAILED intake document:", JSON.stringify(failed, null, 2));
    }

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
