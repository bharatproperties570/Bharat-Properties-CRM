import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log("Connected to MongoDB!");
    try {
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
        const records = await Inventory.find().limit(1).lean();
        console.log("Found:", records.length);
        console.log(records[0]?._id);
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
});
