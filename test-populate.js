import mongoose from "mongoose";
import { populateParticipantsAndRelatedData } from "./backend/controllers/activity.controller.js";

mongoose.connect("mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority").then(async () => {
    const db = mongoose.connection.db;
    const sample = await db.collection("activities").find({ type: "Call Back" }).sort({_id: -1}).limit(1).toArray();
    console.log("Raw activity:", JSON.stringify(sample, null, 2));
    
    // Note: populateParticipantsAndRelatedData is not exported. We will just copy the logic to test.
    process.exit(0);
});
