import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function repair() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        const db = mongoose.connection.db;
        const collections = ['contacts', 'leads', 'deals', 'inventories'];

        for (const colName of collections) {
            console.log(`\n--- Repairing ${colName} ---`);
            const collection = db.collection(colName);
            const cursor = collection.find({});
            
            let processed = 0;
            let repaired = 0;

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                processed++;
                let changed = false;

                // 1. Recursive helper to find and cast potential ID strings
                const castIds = (obj) => {
                    if (!obj || typeof obj !== 'object') return;

                    for (const key in obj) {
                        const val = obj[key];
                        
                        if (typeof val === 'string' && val.length === 24 && mongoose.Types.ObjectId.isValid(val)) {
                            // Candidate for ObjectId casting
                            // Specifically for fields known to be references
                            const refFields = [
                                'assignedTo', 'owner', 'team', 'teams', 'project', 'projectId',
                                'category', 'subCategory', 'status', 'stage', 'unitType',
                                'facing', 'direction', 'orientation', 'roadWidth', 'intent',
                                'title', 'source', 'campaign', 'subSource', 'requirement',
                                'location', 'buyer', 'associatedContact', 'internalRM',
                                'contactDetails', 'inventoryId'
                            ];

                            if (refFields.includes(key)) {
                                obj[key] = new mongoose.Types.ObjectId(val);
                                changed = true;
                            }
                        } else if (Array.isArray(val)) {
                            // Check array elements
                            for (let i = 0; i < val.length; i++) {
                                const item = val[i];
                                if (typeof item === 'string' && item.length === 24 && mongoose.Types.ObjectId.isValid(item)) {
                                    // If the parent key is a ref field that can be an array
                                    const arrayRefFields = ['teams', 'owners', 'associates', 'propertyType', 'subType', 'facing', 'direction'];
                                    if (arrayRefFields.includes(key)) {
                                        val[i] = new mongoose.Types.ObjectId(item);
                                        changed = true;
                                    }
                                } else if (item && typeof item === 'object') {
                                    castIds(item);
                                }
                            }
                        } else if (val && typeof val === 'object' && !(val instanceof mongoose.Types.ObjectId)) {
                            castIds(val);
                        }
                    }
                };

                castIds(doc);

                if (changed) {
                    await collection.updateOne({ _id: doc._id }, { $set: doc });
                    repaired++;
                }

                if (processed % 100 === 0) {
                    console.log(`Processed ${processed} records...`);
                }
            }
            console.log(`${colName}: Processed ${processed}, Repaired ${repaired}`);
        }

        console.log('\nData repair complete.');
        process.exit(0);
    } catch (err) {
        console.error('Repair failed:', err);
        process.exit(1);
    }
}

repair();
