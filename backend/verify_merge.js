import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharat-properties")
    .then(async () => {
        const lookups = await mongoose.connection.collection("lookups").find({ $or: [{ lookup_type: 'Location' }, { lookup_type: 'Tehsil' }] }).sort({ updatedAt: -1 }).limit(3).toArray();
        console.log("--- RECENT LOOKUPS (Location/Tehsil) ---");
        console.log(JSON.stringify(lookups, null, 2));

        const parsingRules = await mongoose.connection.collection("parsingrules").find().sort({ updatedAt: -1 }).limit(3).toArray();
        console.log("--- RECENT PARSING RULES ---");
        console.log(JSON.stringify(parsingRules, null, 2));

        mongoose.disconnect();
    })
    .catch(console.error);
