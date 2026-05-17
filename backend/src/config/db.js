import mongoose from "mongoose";
import config from "./env.js";
import dns from "node:dns";

// Force IPv4 first for DNS resolution to avoid Atlas connection issues in certain environments
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const connectDB = async (retryCount = 5) => {
    if (config.mockMode) {
        console.log("🛠️  Mock Mode Enabled: Skipping MongoDB connection.");
        mongoose.set('bufferCommands', false);
        return;
    }

    for (let i = 0; i < retryCount; i++) {
        try {
            const conn = await mongoose.connect(config.mongoUri, {
                autoIndex: false, 
                connectTimeoutMS: 15000, // 15s to establish connection
                socketTimeoutMS: 45000,  // 45s for slow queries/AI verification
                serverSelectionTimeoutMS: 15000, // 15s to find cluster members
                family: 4, 
                maxPoolSize: 30, // Optimized for MongoDB Atlas M0 (100 connection limit)
                minPoolSize: 5,  // Keep warm pool of 5 connections
                maxIdleTimeMS: 30000, // Close idle connections after 30s
                heartbeatFrequencyMS: 10000 // Regularly check node health
            });
            console.log(`✅ MongoDB Connected: ${conn.connection.host} | Database: ${conn.connection.name}`);
            return; // Success
        } catch (error) {
            console.error(`❌ MongoDB Connection Attempt ${i + 1} Failed: ${error.message}`);
            if (i === retryCount - 1) {
                console.error("❌ All MongoDB connection attempts failed. Server will remain alive but functionality is restricted.");
                // We don't exit here. We let the server stay alive so it can return 500s correctly.
            } else {
                // Wait for 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
};

export default connectDB;

