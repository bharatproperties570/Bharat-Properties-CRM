import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/crm_db";

mongoose.connect(MONGODB_URI).then(async () => {
    // We can just query by finding the most recently modified deal or one with the builtup details image
    const Deal = mongoose.connection.collection('deals');
    const deal = await Deal.findOne({ "builtupDetails.imageUrl": { $exists: true, $ne: "" } });
    if(deal) {
        console.log("Deal ID:", deal._id);
        console.log("Is Published:", deal.isPublished);
        console.log("Deal Score:", deal.dealScore);
        console.log("Status:", deal.status);
    } else {
        console.log("No deal with builtup details image found");
    }
    process.exit(0);
});
