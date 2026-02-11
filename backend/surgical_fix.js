import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function surgicalFix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const coll = db.collection('inventories');

        const docs = await coll.find({
            $or: [
                { "owners": { $elemMatch: { $type: "object" } } },
                { "associates": { $elemMatch: { $type: "object" } } }
            ]
        }).toArray();

        console.log(`Found ${docs.length} documents to fix.`);

        for (const doc of docs) {
            let updated = false;
            let newOwners = [];
            let newAssociates = [];

            if (doc.owners && Array.isArray(doc.owners)) {
                for (const o of doc.owners) {
                    if (typeof o === 'object' && o !== null && o.id && mongoose.Types.ObjectId.isValid(o.id)) {
                        newOwners.push(new mongoose.Types.ObjectId(o.id));
                        updated = true;
                    } else if (mongoose.Types.ObjectId.isValid(o)) {
                        newOwners.push(new mongoose.Types.ObjectId(o));
                    }
                    // else it's a dead end or string that isn't an ID
                }
            }

            if (doc.associates && Array.isArray(doc.associates)) {
                for (const a of doc.associates) {
                    if (typeof a === 'object' && a !== null && a.id && mongoose.Types.ObjectId.isValid(a.id)) {
                        newAssociates.push(new mongoose.Types.ObjectId(a.id));
                        updated = true;
                    } else if (mongoose.Types.ObjectId.isValid(a)) {
                        newAssociates.push(new mongoose.Types.ObjectId(a));
                    }
                }
            }

            if (updated) {
                await coll.updateOne(
                    { _id: doc._id },
                    { $set: { owners: newOwners, associates: newAssociates } }
                );
                console.log(`FIXED DOC: ${doc._id}`);
            }
        }

        console.log("Surgical fix complete!");
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

surgicalFix();
