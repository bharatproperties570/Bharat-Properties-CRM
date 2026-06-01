import mongoose from "mongoose";
import Lead from "./models/Lead.js";
import connectDB from "./config/db.js";
async function run() {
    await connectDB();
    const l = await Lead.findOne({}).lean();
    console.log(l.stageHistory);
    process.exit(0);
}
run();
