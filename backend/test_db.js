import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect('mongodb://127.0.0.1:27017/bharatproperties1').then(async () => {
    const Deal = mongoose.connection.collection('deals');
    const Inventory = mongoose.connection.collection('inventories');
    
    const deals = await Deal.find({}).limit(3).toArray();
    for (const d of deals) {
        console.log("DEAL:", d._id);
        console.log("  size:", d.size);
        console.log("  sizeUnit:", d.sizeUnit);
        console.log("  sizeLabel:", d.sizeLabel);
        if (d.inventoryId) {
            const inv = await Inventory.findOne({ _id: d.inventoryId });
            console.log("  INV size:", inv?.size);
            console.log("  INV sizeUnit:", inv?.sizeUnit);
            console.log("  INV sizeLabel:", inv?.sizeLabel);
        }
    }
    process.exit(0);
}).catch(e => console.error(e));
