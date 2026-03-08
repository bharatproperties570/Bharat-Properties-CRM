
import mongoose from 'mongoose';

const mongoUri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties';

async function check() {
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to bharatproperties database");
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('Searching bharatproperties for ANY inventory data...');

        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments();
            if (count > 0) {
                // Check for a few documents to find inventory markers
                const docs = await db.collection(coll.name).find({}).limit(5).toArray();
                let isInventory = false;
                for (const doc of docs) {
                    if (doc.projectName || doc.unitNo || doc.unitNumber || doc.block) {
                        isInventory = true;
                        break;
                    }
                }

                if (isInventory) {
                    console.log(`🎯 POTENTIAL MATCH: ${coll.name} (Count: ${count})`);

                    // Search specifically for Sector 32
                    const match = await db.collection(coll.name).findOne({
                        $or: [
                            { projectName: /Sector 32/i },
                            { project: /Sector 32/i },
                            { block: /Part-1/i },
                            { block: /Part 1/i }
                        ]
                    });
                    if (match) {
                        console.log(`✅ FOUND SECTOR 32 in ${coll.name}!`);
                        console.log(`Match: `, JSON.stringify(match, null, 2));
                    }
                }
            }
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}
check();
