import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkData() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri);
        console.log('Connected to Atlas');

        const db = mongoose.connection.db;
        const collection = db.collection('inventories');

        const records = await collection.find({ 
            projectName: /Sector 4 Kurukshetra/i 
        }).sort({ createdAt: -1 }).limit(3).toArray();

        if (records.length === 0) {
            console.log('No records found.');
        } else {
            console.log(`Found ${records.length} records. Deep inspecting address object for UI fields:`);
            records.forEach((r, i) => {
                console.log(`\nRecord #${i + 1} (${r._id}):`);
                console.log(`- Project: ${r.projectName}`);
                console.log(`- locArea (Top Level): ${r.locArea || 'EMPTY'}`);
                console.log(`- locZip (Top Level):  ${r.locZip || 'EMPTY'}`);
                console.log(`- Address Object:`, JSON.stringify(r.address, null, 2));
            });
        }
        process.exit();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkData();
