import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/bharat-properties-crm").then(async () => {
    const deals = await mongoose.connection.db.collection('deals').find({ isPublished: true }).limit(5).toArray();
    for (const deal of deals) {
        console.log(`\n\n--- Deal ID: ${deal._id} ---`);
        console.log("projectName:", deal.projectName);
        console.log("category:", deal.category);
        console.log("subCategory:", deal.subCategory);
        console.log("location:", deal.location);
        console.log("propertyType:", deal.propertyType);
        console.log("facing:", deal.propertyDetails?.facing);
        console.log("furnishing:", deal.propertyDetails?.furnishing);
        console.log("sizeLabel:", deal.unitSpecification?.sizeLabel, deal.sizeLabel);
        console.log("address:", deal.address);
    }
    process.exit(0);
});
