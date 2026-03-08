import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
const ID_TO_CHECK = '699bc99fee5159cfdb8f2e29';

async function findInInventory() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const inventory = mongoose.connection.db.collection('inventories');
        const items = await inventory.find({
            $or: [
                { status: ID_TO_CHECK },
                { status: new mongoose.Types.ObjectId(ID_TO_CHECK) },
                { category: ID_TO_CHECK },
                { type: ID_TO_CHECK },
                { facing: ID_TO_CHECK },
                { unitType: ID_TO_CHECK },
                { projectId: ID_TO_CHECK }
            ]
        }).toArray();

        console.log(`\nFound ${items.length} items in inventory referencing ${ID_TO_CHECK}`);
        if (items.length > 0) {
            console.log('Fields used by first item:');
            const item = items[0];
            for (const key in item) {
                if (item[key] == ID_TO_CHECK || (item[key] && item[key].toString() == ID_TO_CHECK)) {
                    console.log(`- ${key}: ${item[key]}`);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

findInInventory();
