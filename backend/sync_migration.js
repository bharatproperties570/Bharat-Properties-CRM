import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrateData() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri);
        console.log('Connected to Database for UI-Compatibility Sync...');

        const db = mongoose.connection.db;
        const collection = db.collection('inventories');

        const cursor = collection.find({ projectName: /Sector 4 Kurukshetra/i });
        const records = await cursor.toArray();

        console.log(`Syncing ${records.length} records for UI display...`);

        let updatedCount = 0;
        for (const r of records) {
            const update = {};
            const addr = r.address || {};
            
            // 1. Pincode UI Compatibility (Lowercase 'c')
            const pinValue = addr.pinCode || addr.pincode || r.locZip;
            if (pinValue && !addr.pincode) {
                update['address.pincode'] = pinValue;
            }

            // 2. Locality/Location/Area Parity
            const locValue = addr.locality || addr.location || addr.area || r.locArea;
            if (locValue) {
                if (!addr.location) update['address.location'] = locValue;
                if (!addr.area) update['address.area'] = locValue;
                if (!addr.locality) update['address.locality'] = locValue;
            }

            // 3. Ensure top-level fields are also set
            if (locValue && !r.locArea) update.locArea = locValue;
            if (pinValue && !r.locZip) update.locZip = pinValue;

            if (Object.keys(update).length > 0) {
                await collection.updateOne({ _id: r._id }, { $set: update });
                updatedCount++;
            }
        }

        console.log(`SUCCESS: ${updatedCount} records synchronized for full UI compatibility.`);
        process.exit();
    } catch (err) {
        console.error('Migration Error:', err);
        process.exit(1);
    }
}

migrateData();
