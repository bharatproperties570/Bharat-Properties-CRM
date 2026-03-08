
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkInventory = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');
        const item = await Inventory.findOne({ unitNo: 'A-1' }).lean();
        if (item) {
            console.log('Unit: A-1');
            console.log('CreatedAt:', item.createdAt);
            console.log('Facing:', item.facing);
            console.log('Direction:', item.direction);
            console.log('Orientation:', item.orientation);
        } else {
            console.log('Unit A-1 not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkInventory();
