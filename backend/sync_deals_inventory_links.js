import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({
        $or: [
            { inventoryId: null },
            { inventoryId: { $exists: false } }
        ]
    }).toArray();

    console.log(`Found ${deals.length} deals with null inventoryId:`);
    for (const d of deals) {
        if (!d.projectName || !d.unitNo) {
            console.log(`  Deal ID ${d._id} lacks projectName or unitNo, skipping.`);
            continue;
        }

        // Try exact match in inventories
        const inv = await db.collection('inventories').findOne({
            projectName: d.projectName,
            unitNo: d.unitNo
        });

        if (inv) {
            console.log(`  Deal ID ${d._id} matches Inventory ID ${inv._id} ("${d.projectName}", Unit "${d.unitNo}")!`);
            const updateResult = await db.collection('deals').updateOne(
                { _id: d._id },
                { $set: { inventoryId: inv._id } }
            );
            console.log(`    -> Linked! Result:`, updateResult);
        } else {
            console.log(`  No matching inventory found for "${d.projectName}", Unit "${d.unitNo}".`);
        }
    }
    process.exit(0);
}
inspect();
