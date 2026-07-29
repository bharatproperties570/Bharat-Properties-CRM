import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties').then(async () => {
    const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
    const deal121 = await Inventory.findOne({ unitNo: '121 P' }).lean();
    console.log("Deal 121 P:", JSON.stringify(deal121, null, 2));
    mongoose.connection.close();
});
