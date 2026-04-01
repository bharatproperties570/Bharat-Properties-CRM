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



export default connectDB;
