import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/crm_db";

mongoose.connect(MONGODB_URI).then(async () => {
    const Deal = mongoose.connection.collection('deals');
    const deal = await Deal.findOne({ "builtupDetails.imageUrl": { $exists: true, $ne: "" } });
    if(deal) {
        console.log("Featured Image:", deal.websiteMetadata?.featuredImage);
        console.log("Property Images:", deal.propertyImages);
        console.log("Images:", deal.images);
        console.log("Inventory Images:", deal.inventoryImages);
        console.log("Builtup Details Image:", deal.builtupDetails?.[0]?.imageUrl);
    }
    process.exit(0);
});
