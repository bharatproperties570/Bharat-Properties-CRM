
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkInventory = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');

        const item = await Inventory.findOne({ unitNo: 'C-120' }).lean();

        if (item) {
            console.log('Unit:', item.unitNo);
            console.log('Facing:', item.facing);
            console.log('Direction:', item.direction);
            console.log('Orientation:', item.orientation);
            console.log('Road Width:', item.roadWidth);
        } else {
            console.log('Unit C-120 not found');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkInventory();
