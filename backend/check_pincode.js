import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const InventorySchema = new mongoose.Schema({
    projectName: String,
    address: {
        pincode: mongoose.Schema.Types.ObjectId
    },
    locZip: mongoose.Schema.Types.ObjectId
}, { strict: false });

const Inventory = mongoose.model('Inventory', InventorySchema);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const inventories = await Inventory.find().sort({ createdAt: -1 }).limit(5).lean();
    console.log(JSON.stringify(inventories.map(i => ({
        _id: i._id,
        projectName: i.projectName,
        addressPincode: i.address?.pincode,
        locZip: i.locZip
    })), null, 2));
    mongoose.disconnect();
}
run();
