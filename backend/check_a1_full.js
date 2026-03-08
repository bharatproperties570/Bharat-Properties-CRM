
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkInventory = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');
        const item = await Inventory.findOne({ unitNo: 'A-1' }).lean();
        if (item) {
            console.log('Full Item A-1:');
            console.log(JSON.stringify(item, null, 2));
        } else {
            console.log('Unit A-1 not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkInventory();
