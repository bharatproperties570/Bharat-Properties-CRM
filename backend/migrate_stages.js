import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const migrateStages = async () => {
    await connectDB();
    
    const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', new mongoose.Schema({ lookup_type: String, lookup_value: String }));
    const Lead = mongoose.models.Lead || mongoose.model('Lead', new mongoose.Schema({ stage: mongoose.Schema.Types.ObjectId, stageHistory: Array }, { timestamps: true }));

    // 1. Ensure "Incoming" exists
    let incomingLeadLookup = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: 'Incoming' });
    if (!incomingLeadLookup) {
        console.log('Creating "Incoming" stage lookup...');
        incomingLeadLookup = await Lookup.create({ lookup_type: 'Stage', lookup_value: 'Incoming' });
    }
    const incomingLeadId = incomingLeadLookup._id;

    // 2. Find legacy lookups to migrate FROM
    const legacyLookups = await Lookup.find({ 
        lookup_type: 'Stage', 
        lookup_value: { $in: ['New', 'Lead Created', 'Open', 'Lead Received'] } 
    });
    const legacyIds = legacyLookups.map(l => l._id);

    console.log(`Found ${legacyIds.length} legacy stage IDs to migrate.`);

    // 3. Update Leads with legacy stages or missing stages
    const query = {
        $or: [
            { stage: { $in: legacyIds } },
            { stage: { $exists: false } },
            { stage: null }
        ]
    };

    const count = await Lead.countDocuments(query);
    console.log(`Leads to migrate: ${count}`);

    const result = await Lead.updateMany(query, { 
        $set: { stage: incomingLeadId } 
    });

    console.log(`Migration Complete: ${result.modifiedCount} leads updated.`);

    // 4. Update History for those who have "Lead Created" string in history
    const historyResult = await Lead.updateMany(
        { "stageHistory.stage": { $in: ["Lead Created", "New", "Open"] } },
        { $set: { "stageHistory.$[elem].stage": "Incoming" } },
        { arrayFilters: [{ "elem.stage": { $in: ["Lead Created", "New", "Open"] } }] }
    );

    console.log(`History Migration Complete: ${historyResult.modifiedCount} leads history updated.`);

    process.exit(0);
};

migrateStages();
