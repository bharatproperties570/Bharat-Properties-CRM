import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function deepInspect() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const coll = db.collection('inventories');

        const all = await coll.find({}).toArray();
        console.log(`Total documents: ${all.length}`);

        for (const doc of all) {
            let hasIssue = false;

            if (doc.owners && Array.isArray(doc.owners)) {
                for (const o of doc.owners) {
                    if (typeof o === 'object' && o !== null && !mongoose.Types.ObjectId.isValid(o)) {
                        console.log(`Inventory ${doc._id} has Object in owners:`, JSON.stringify(o));
                        hasIssue = true;
                    } else if (typeof o === 'string' && !mongoose.Types.ObjectId.isValid(o)) {
                        console.log(`Inventory ${doc._id} has invalid String in owners:`, o);
                        hasIssue = true;
                    }
                }
            }

            if (doc.associates && Array.isArray(doc.associates)) {
                for (const a of doc.associates) {
                    if (typeof a === 'object' && a !== null && !mongoose.Types.ObjectId.isValid(a)) {
                        console.log(`Inventory ${doc._id} has Object in associates:`, JSON.stringify(a));
                        hasIssue = true;
                    } else if (typeof a === 'string' && !mongoose.Types.ObjectId.isValid(a)) {
                        console.log(`Inventory ${doc._id} has invalid String in associates:`, a);
                        hasIssue = true;
                    }
                }
            }
        }

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

deepInspect();
