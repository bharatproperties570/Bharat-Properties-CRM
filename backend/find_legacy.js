import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function findLegacy() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        console.log("--- Inventory with legacy data ---");
        const invLegacy = await db.collection('inventories').find({
            $or: [
                { owners: { $exists: true, $not: { $size: 0 }, $elemMatch: { $not: { $type: "objectId" } } } },
                { owner: { $exists: true, $not: { $type: "objectId" } } }
            ]
        }).toArray();
        console.log(`Found ${invLegacy.length} problematic inventory items.`);
        invLegacy.forEach(i => console.log(`ID: ${i._id}, Unit: ${i.unitNo}`));

        console.log("\n--- Deals with legacy data ---");
        const dealsLegacy = await db.collection('deals').find({
            $or: [
                { owner: { $exists: true, $not: { $type: "objectId" } } },
                { associatedContact: { $exists: true, $not: { $type: "objectId" } } }
            ]
        }).toArray();
        console.log(`Found ${dealsLegacy.length} problematic deals.`);
        dealsLegacy.forEach(d => {
            console.log(`ID: ${d._id}, Unit: ${d.unitNo}`);
            console.log(`Owner type: ${typeof d.owner}, Value: ${JSON.stringify(d.owner)}`);
        });

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

findLegacy();
