import mongoose from 'mongoose';

async function checkInventory() {
    try {
        await mongoose.connect('mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1');
        const InventorySchema = new mongoose.Schema({}, { strict: false });
        const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', InventorySchema);

        const recentItems = await Inventory.find().sort({ createdAt: -1 }).limit(10).lean();

        console.log(`Found ${recentItems.length} recent items.`);
        recentItems.forEach(item => {
            console.log(`Unit: ${item.unitNo}, Project: ${item.projectName}, CreatedAt: ${item.createdAt}`);
            console.log(`  Facing: ${item.facing}`);
            console.log(`  Direction: ${item.direction}`);
            console.log(`  Orientation: ${item.orientation}`);
            console.log('---');
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkInventory();
