
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String
        }, { strict: false }));

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({
            builtupType: mongoose.Schema.Types.Mixed
        }, { strict: false }));

        const items = await Inventory.find({ builtupType: { $exists: true, $ne: null } });
        console.log(`Found ${items.length} records to process.`);

        let updatedCount = 0;
        let alreadyCorrect = 0;
        let resolvedCount = 0;
        let newlyCreatedCount = 0;

        for (const item of items) {
            const val = item.builtupType;

            // 1. If it's already an ObjectID, skip
            if (mongoose.Types.ObjectId.isValid(val) && typeof val !== 'string') {
                alreadyCorrect++;
                continue;
            }

            // 2. If it's a string that IS a valid ObjectID hex
            if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
                item.builtupType = new mongoose.Types.ObjectId(val);
                await item.save();
                updatedCount++;
                continue;
            }

            // 3. If it's a string name (e.g. "Flat" or "Vacant")
            if (typeof val === 'string') {
                let lookup = await Lookup.findOne({ 
                    lookup_type: 'BuiltupType', 
                    lookup_value: { $regex: new RegExp(`^${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
                });

                if (lookup) {
                    item.builtupType = lookup._id;
                    resolvedCount++;
                } else {
                    // Create it if it doesn't exist
                    lookup = await Lookup.create({ lookup_type: 'BuiltupType', lookup_value: val, is_active: true });
                    item.builtupType = lookup._id;
                    newlyCreatedCount++;
                }
                await item.save();
                updatedCount++;
                continue;
            }
        }

        console.log(`\nMigration Summary:`);
        console.log(`- Total processed: ${items.length}`);
        console.log(`- Already correct (ObjectIDs): ${alreadyCorrect}`);
        console.log(`- Updated (String IDs -> ObjectIDs): ${updatedCount - resolvedCount - newlyCreatedCount}`);
        console.log(`- Resolved from Name: ${resolvedCount}`);
        console.log(`- Newly Created Lookups: ${newlyCreatedCount}`);
        console.log(`- Total records modified: ${updatedCount}`);

        process.exit(0);
    } catch (error) {
        console.error('Error during migration:', error);
        process.exit(1);
    }
}

run();
