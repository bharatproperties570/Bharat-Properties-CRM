import mongoose from "mongoose";
import dotenv from "dotenv";

import dns from 'node:dns';
dotenv.config();
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const connectDB = async () => {
    if (process.env.MOCK_MODE === 'true') {
        console.log("🛠️ Mock Mode Enabled: Skipping MongoDB connection.");
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

const setupMockRoutes = (app) => {
    // Add temporary mock logic if needed, or rely on frontend to handle 500s gracefully
    // But since backend crashes, we need it to NOT crash
};

export default connectDB;
