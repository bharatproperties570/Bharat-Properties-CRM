import connectDB from "./src/config/db.js";
import mongoose from "mongoose";
import Intake from "./models/Intake.js";

async function run() {
    await connectDB();
    const statusCounts = await Intake.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    console.log("Status distribution:", statusCounts);
    process.exit(0);
}

run();
