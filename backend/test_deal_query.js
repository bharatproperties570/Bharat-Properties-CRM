import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties').then(async () => {
    const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
    
    // Find deal 1599
    const deal1599 = await Inventory.findOne({ unitNo: '1599' }).lean();
    console.log("Deal 1599:", JSON.stringify({
        sizeLabel: deal1599?.sizeLabel,
        sizeConfig: deal1599?.sizeConfig,
        size: deal1599?.size,
        subCategory: deal1599?.subCategory
    }, null, 2));

    // Find deal 1441
    const deal1441 = await Inventory.findOne({ unitNo: '1441' }).lean();
    console.log("Deal 1441:", JSON.stringify({
        sizeLabel: deal1441?.sizeLabel,
        sizeConfig: deal1441?.sizeConfig,
        size: deal1441?.size,
        subCategory: deal1441?.subCategory
    }, null, 2));

    mongoose.connection.close();
});
