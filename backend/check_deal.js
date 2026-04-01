import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-properties-crm").then(async () => {
    const deal = await mongoose.connection.db.collection('deals').findOne({ projectName: /Kohinoor/i });
    console.log("Owners:", deal.owners);
    console.log("Associates:", deal.associates);
    console.log("Owner Name/Phone:", deal.ownerName, deal.ownerPhone);
    process.exit(0);
});
