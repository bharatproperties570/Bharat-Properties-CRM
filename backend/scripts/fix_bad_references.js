import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("Failed to connect to DB", err);
        process.exit(1);
    }
};

const fixCollection = async (collectionName, fieldsToCheck, valueToFix) => {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    console.log(`Checking ${collectionName}...`);

    for (const field of fieldsToCheck) {
        // Find documents where field is the bad string
        // We use query { [field]: valueToFix } directly.
        // Or if valueToFix is null, we check type string.

        let query;
        if (valueToFix) {
            query = { [field]: valueToFix };
        } else {
            // Check for string type (BSON type 2)
            query = { [field]: { $type: 2 } };
        }

        const badDocs = await collection.find(query).toArray();
        if (badDocs.length > 0) {
            console.log(`Found ${badDocs.length} docs in ${collectionName} with ${field} = ${valueToFix || 'String Type'}`);

            const ids = badDocs.map(d => d._id);
            // Set to null or unset? Mongoose handles null better for ObjectId refs.
            await collection.updateMany(
                { _id: { $in: ids } },
                { $set: { [field]: null } }
            );
            console.log(`Fixed ${ids.length} docs.`);
        }
    }
};

const run = async () => {
    await connectDB();

    // Fix Contacts
    await fixCollection('contacts', ['owner'], 'Self');
    // Also fix generic string owners if any
    await fixCollection('contacts', ['owner'], null);

    // Fix "Buy" in Lookup refs in Contacts
    // "Buy" might be in 'requirement' or 'budget'?
    await fixCollection('contacts', ['requirement', 'budget', 'source', 'campaign'], 'Buy');

    // Fix Leads
    await fixCollection('leads', ['owner'], 'Self');
    await fixCollection('leads', ['owner'], null);

    // Fix "Buy" in Leads
    // Check 'requirement', 'type', 'status', 'source'
    await fixCollection('leads', ['requirement', 'leadType', 'status', 'source', 'priority'], 'Buy');

    // Also check for "Self" in 'createdBy' or 'updatedBy' if they exist as refs
    await fixCollection('contacts', ['createdBy', 'updatedBy'], 'Self');
    await fixCollection('leads', ['createdBy', 'updatedBy'], 'Self');

    // Fix Deals
    await fixCollection('deals', ['assignedTo', 'partyStructure.internalRM'], 'Self');
    await fixCollection('deals', ['assignedTo', 'partyStructure.internalRM'], null); // Fix generic strings

    // Fix "Buy" or other lookups in Deals if any
    await fixCollection('deals', ['stage', 'status'], 'Buy');

    console.log("Cleanup complete.");
    process.exit(0);
};

run();
