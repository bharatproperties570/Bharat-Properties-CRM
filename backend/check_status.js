import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String
});
mongoose.model('Lookup', LookupSchema);

const InventorySchema = new mongoose.Schema({
    projectName: String,
    unitNo: String,
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    history: [{
        date: Date,
        actor: String,
        type: String,
        note: String
    }]
}, { timestamps: true });

const Inventory = mongoose.model('Inventory', InventorySchema);

async function checkRecentFeedback() {
    try {
        await mongoose.connect(MONGODB_URI);

        const item = await Inventory.findOne()
            .sort({ updatedAt: -1 })
            .populate('status')
            .lean();

        if (item) {
            console.log(`\nInventory: ${item.projectName} - ${item.unitNo}`);
            console.log(`Status: ${item.status ? item.status.lookup_value : 'NULL'}`);
            console.log(`Updated At: ${item.updatedAt}`);
            console.log(`History count: ${item.history ? item.history.length : 0}`);
            if (item.history && item.history.length > 0) {
                const last = item.history[item.history.length - 1];
                console.log(`Last Note: ${last.note}`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

checkRecentFeedback();
