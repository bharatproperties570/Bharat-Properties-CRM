
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

dotenv.config();

async function castToObjectId() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const leads = await Lead.find({});
        console.log(`Analyzing ${leads.length} leads...`);

        const fields = [
            { name: 'requirement', type: 'Requirement' },
            { name: 'subRequirement', type: 'Sub Requirement' },
            { name: 'budget', type: 'Budget' },
            { name: 'location', type: 'Location' },
            { name: 'source', type: 'Source' },
            { name: 'status', type: 'Lead Status' }
        ];

        for (const lead of leads) {
            let updated = false;
            for (const field of fields) {
                const value = lead[field.name];
                if (!value) continue;

                if (typeof value === 'string') {
                    if (mongoose.Types.ObjectId.isValid(value)) {
                        console.log(`Lead ${lead._id}: Casting ${field.name} string ID "${value}" to ObjectId`);
                        lead[field.name] = new mongoose.Types.ObjectId(value);
                        updated = true;
                    } else {
                        // It's a raw string like "Buy", try to resolve it
                        console.log(`Lead ${lead._id}: Resolving raw string "${value}" for ${field.name}`);
                        let lookup = await Lookup.findOne({
                            lookup_type: field.type,
                            $or: [{ lookup_value: value }, { lookup_name: value }]
                        });
                        if (lookup) {
                            lead[field.name] = lookup._id;
                            updated = true;
                            console.log(`  -> Resolved to ID ${lookup._id}`);
                        } else {
                            console.log(`  -> Could not resolve "${value}" for type "${field.type}"`);
                        }
                    }
                }
            }
            if (updated) {
                await lead.save();
                console.log(`Lead ${lead._id} updated.`);
            }
        }

        console.log("Migration complete.");
        process.exit();
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

castToObjectId();
