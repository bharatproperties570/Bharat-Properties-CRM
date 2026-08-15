import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("Connecting to", process.env.MONGO_URI ? "MongoDB..." : "NO URI!");

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("Connected.");
    try {
        const FeedbackForm = (await import("./models/FeedbackForm.js")).default;
        const forms = await FeedbackForm.find({});
        console.log(`Found ${forms.length} forms:`);
        forms.forEach(f => console.log(` - ID: ${f._id}, Name: ${f.name}, VisibleTo: ${f.visibleTo}`));
    } catch(e) {
        console.error("Error:", e);
    }
    process.exit(0);
}).catch(e => {
    console.error("Connection Error:", e);
    process.exit(1);
});
