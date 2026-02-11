import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        console.log("--- RAW INVENTORY ITEM ---");
        const inv = await db.collection('inventories').findOne({});
        console.log(JSON.stringify(inv, null, 2));

        console.log("\n--- RAW DEAL ITEM ---");
        const deal = await db.collection('deals').findOne({});
        console.log(JSON.stringify(deal, null, 2));

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

inspect();
