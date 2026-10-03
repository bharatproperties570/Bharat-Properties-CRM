import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });

mongoose.connect(process.env.MONGODB_URI || (() => { throw new Error('CRITICAL: MONGODB_URI environment variable is required. Hardcoded fallbacks removed.') })())
    .then(async () => {
        const doc = await mongoose.connection.collection("lookups").findOne({});
        console.log("Lookup Doc:", doc);
        mongoose.disconnect();
    })
    .catch(console.error);
