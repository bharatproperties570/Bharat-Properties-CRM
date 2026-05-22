import mongoose from "mongoose";
import config from "./env.js";
import dns from "node:dns";

// Force IPv4 first for DNS resolution to avoid Atlas connection issues in certain environments
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const connectDB = async (retryCount = 5) => {
    // 🛡️ Enterprise Guard: MOCK_MODE is ONLY allowed in automated test environments.
    // In development or production, it is ALWAYS ignored to prevent accidental data outages.
    const isMockAllowed = process.env.NODE_ENV === 'test';
    if (isMockAllowed && config.mockMode) {
        console.log("🛠️  Mock Mode Enabled (test env only): Skipping MongoDB connection.");
        mongoose.set('bufferCommands', false);
        return;
    }

    if (config.mockMode && !isMockAllowed) {
        console.warn("⚠️  MOCK_MODE=true detected but NODE_ENV is not 'test'. IGNORING mock mode — connecting to real MongoDB.");
    }

    if (!config.mongoUri) {
        console.error("❌ CRITICAL: MONGODB_URI is not set in environment. Cannot connect to database.");
        return;
    }

    for (let i = 0; i < retryCount; i++) {
        try {
            const conn = await mongoose.connect(config.mongoUri, {
                autoIndex: false,
                connectTimeoutMS: 15000,        // 15s to establish connection
                socketTimeoutMS: 45000,          // 45s for slow queries
                serverSelectionTimeoutMS: 15000, // 15s to find cluster members
                family: 4,                       // Force IPv4
                maxPoolSize: 30,                 // Optimized for MongoDB Atlas M0 (100 conn limit)
                minPoolSize: 5,                  // Keep warm pool
                maxIdleTimeMS: 30000,            // Close idle connections after 30s
                heartbeatFrequencyMS: 10000      // Regularly check node health
            });
            console.log(`✅ MongoDB Connected: ${conn.connection.host} | Database: ${conn.connection.name}`);
            return; // Success
        } catch (error) {
            console.error(`❌ MongoDB Connection Attempt ${i + 1}/${retryCount} Failed: ${error.message}`);
            if (i === retryCount - 1) {
                console.error("❌ All MongoDB connection attempts failed. Server alive but all data APIs will return errors.");
                console.error("💡 FIX: Check MONGODB_URI in backend/.env and ensure your IP is whitelisted in MongoDB Atlas → Network Access.");
            } else {
                const delay = Math.min(2000 * (i + 1), 10000); // Exponential backoff, max 10s
                console.log(`⏳ Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
};

export default connectDB;

