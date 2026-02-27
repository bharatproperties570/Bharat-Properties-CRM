import mongoose from "mongoose";
import config from "./env.js";

const connectDB = async () => {
    if (config.mockMode) {
        console.log("🛠️  Mock Mode Enabled: Skipping MongoDB connection.");
        mongoose.set('bufferCommands', false);
        return;
    }

    try {
        if (config.mockMode) {
            mongoose.set('bufferCommands', false);
        }
        const conn = await mongoose.connect(config.mongoUri);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
