import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function finalSync() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri);
        console.log('Connected to Database for Final Lookup-Type Sync...');

        const db = mongoose.connection.db;
        const collection = db.collection('inventories');

        const records = await collection.find({ projectName: /Sector 4 Kurukshetra/i });
        const recordsArray = await records.toArray();

        console.log(`Syncing ${recordsArray.length} records for Sector 4...`);

        let updatedCount = 0;
        for (const r of recordsArray) {
            const update = {};
            const addr = r.address || {};
            
            // We know Sector 4 IDs are correct, we just need to ensure 
            // they are in the keys the UI looks for, and filters use locArea/locZip.
            
            // The issue was primarily the Lookup Type Mismatch in the backend code,
            // but ensuring the IDs are in all address variants helps the UI.

            const locId = addr.locality || addr.location || addr.area || r.locArea;
            const pinId = addr.pinCode || addr.pincode || r.locZip;

            if (locId) {
                update['address.location'] = locId;
                update['address.locality'] = locId;
                update['address.area'] = locId;
                update.locArea = locId;
            }

            if (pinId) {
                update['address.pinCode'] = pinId;
                update['address.pincode'] = pinId;
                update.locZip = pinId;
            }

            if (Object.keys(update).length > 0) {
                await collection.updateOne({ _id: r._id }, { $set: update });
                updatedCount++;
            }
        }

        console.log(`SUCCESS: ${updatedCount} records synchronized with correct UI fields.`);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

finalSync();
