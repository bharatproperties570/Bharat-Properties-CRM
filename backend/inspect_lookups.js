import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharat-properties")
    .then(async () => {
        const doc = await mongoose.connection.collection("lookups").findOne({});
        console.log("Lookup Doc:", doc);
        mongoose.disconnect();
    })
    .catch(console.error);
