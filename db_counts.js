import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

async function diagnose() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined in backend/.env");
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        const collections = ['leads', 'activities', 'deals', 'lookups', 'inventories', 'projects'];
        const results = {};

        for (const col of collections) {
            results[col] = await mongoose.connection.db.collection(col).countDocuments();
        }

        console.log("📊 Database Counts:");
        console.table(results);

        process.exit(0);
    } catch (error) {
        console.error("❌ Diagnosis failed:", error.message);
        process.exit(1);
    }
}

diagnose();
