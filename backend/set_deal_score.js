import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/crm_db";

mongoose.connect(MONGODB_URI).then(async () => {
    const Deal = mongoose.connection.collection('deals');
    const result = await Deal.updateOne(
        { "builtupDetails.imageUrl": { $exists: true, $ne: "" } },
        { $set: { dealScore: 100 } }
    );
    console.log("Update result:", result);
    process.exit(0);
});
