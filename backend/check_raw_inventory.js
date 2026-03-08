
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkInventory = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');

        // Check for items created on March 6th
        const items = await Inventory.find({
            createdAt: {
                $gte: new Date('2026-03-06T00:00:00.000Z'),
                $lt: new Date('2026-03-07T00:00:00.000Z')
            }
        }).limit(5).lean();

        console.log(`Found ${items.length} items`);

        items.forEach(item => {
            console.log('---');
            console.log('Unit:', item.unitNo);
            console.log('Facing:', item.facing);
            console.log('Direction:', item.direction);
            console.log('Orientation:', item.orientation);
            console.log('Road Width:', item.roadWidth);
            console.log('Raw Facing Type:', typeof item.facing);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkInventory();
