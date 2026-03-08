
import mongoose from 'mongoose';

const mongoUri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function check() {
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to bharatproperties1");
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const projectIdString = '699b4f17f4ce10801aad8a47';
        const projectId = new mongoose.Types.ObjectId(projectIdString);

        console.log(`Searching for Project references: ${projectIdString}`);

        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments({
                $or: [
                    { projectId: projectId },
                    { project: projectId },
                    { projectId: projectIdString },
                    { project: projectIdString },
                    { projectName: /Sector 32/i }
                ]
            });
            if (count > 0) {
                console.log(`- Found ${count} matches in ${coll.name}`);
                const sample = await db.collection(coll.name).findOne({
                    $or: [
                        { projectId: projectId },
                        { project: projectId },
                        { projectId: projectIdString },
                        { project: projectIdString },
                        { projectName: /Sector 32/i }
                    ]
                });
                console.log(`  Example from ${coll.name}:`, JSON.stringify(sample, null, 2).substring(0, 500));
            }
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}
check();
