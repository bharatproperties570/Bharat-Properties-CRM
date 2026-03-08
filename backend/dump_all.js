import mongoose from 'mongoose';

const uri = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function dump() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");
        const db = mongoose.connection.db;

        // 1. Get all system settings
        const settings = await db.collection('systemsettings').find({}).toArray();
        console.log("--- SYSTEM SETTINGS ---");
        settings.forEach(s => {
            if (s.key === 'masterFields') {
                console.log("masterFields:", JSON.stringify(s.value, null, 2));
            } else if (s.key === 'propertyConfig') {
                // Just show keys
                console.log("propertyConfig Categories:", Object.keys(s.value));
            } else {
                console.log(`Setting: ${s.key}`);
            }
        });

        // 2. Get all lookup types and counts
        const lookupStats = await db.collection('lookups').aggregate([
            { $group: { _id: "$lookup_type", count: { $sum: 1 }, examples: { $push: "$lookup_value" } } }
        ]).toArray();

        console.log("\n--- LOOKUP TYPES & EXAMPLES ---");
        lookupStats.forEach(stat => {
            console.log(`${stat._id} (${stat.count}): ${stat.examples.slice(0, 5).join(', ')}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

dump();
