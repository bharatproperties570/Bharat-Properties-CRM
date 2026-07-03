import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import ParsingRule from "./src/modules/parsing/parsingRule.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharat-properties")
    .then(async () => {
        try {
            console.log("Trying to insert Parsing Rule...");
            const res = await ParsingRule.findOneAndUpdate(
                { type: "LOCATION", value: "SECTOIR-3" },
                { type: "LOCATION", value: "SECTOIR-3" },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log("Success:", res);
        } catch (err) {
            console.error("Error creating rule:", err.message);
            console.error(err);
        }
        mongoose.disconnect();
    })
    .catch(console.error);
