
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkRecentInventory = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');
        const items = await Inventory.find().sort({ createdAt: -1 }).limit(10).lean();

        console.log(`Found ${items.length} items:`);
        items.forEach(item => {
            console.log(`Unit: ${item.unitNo}, CreatedAt: ${item.createdAt}, Facing: ${item.facing}, Direction: ${item.direction}, Orientation: ${item.orientation}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkRecentInventory();
