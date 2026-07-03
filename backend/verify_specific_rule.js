import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharat-properties")
    .then(async () => {
        const rules = await mongoose.connection.collection("parsingrules").find({ value: "SECTOIR-3" }).toArray();
        console.log("--- PARSING RULES FOR SECTOIR-3 ---");
        console.log(JSON.stringify(rules, null, 2));

        const allRulesCount = await mongoose.connection.collection("parsingrules").countDocuments();
        console.log("Total Parsing Rules:", allRulesCount);
        
        mongoose.disconnect();
    })
    .catch(console.error);
