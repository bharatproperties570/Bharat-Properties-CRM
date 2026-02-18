
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

dotenv.config();

const resolveLookup = async (type, value) => {
    if (!value) return null;

    // If it's already a valid ObjectId, return it as one
    if (mongoose.Types.ObjectId.isValid(value)) {
        return new mongoose.Types.ObjectId(value);
    }

    // Try to find lookup by value
    let lookup = await Lookup.findOne({
        lookup_type: type,
        $or: [
            { lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } },
            { lookup_name: { $regex: new RegExp(`^${value}$`, 'i') } }
        ]
    });

    if (!lookup) {
        // If not found, create it
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
        console.log(`Created new lookup: [${type}] ${value}`);
    }

    return lookup._id;
};

async function fixAllLeads() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const leads = await Lead.find({});
        console.log(`Checking ${leads.length} leads...`);

        const fieldsToFix = [
            { name: 'requirement', type: 'Requirement' },
            { name: 'subRequirement', type: 'Sub Requirement' },
            { name: 'budget', type: 'Budget' },
            { name: 'location', type: 'Location' },
            { name: 'source', type: 'Source' },
            { name: 'status', type: 'Lead Status' }
        ];

        for (const lead of leads) {
            let updated = false;

            for (const field of fieldsToFix) {
                const value = lead[field.name];

                // If it's a string, we MUST convert it to ObjectId (or null)
                if (value && typeof value === 'string') {
                    console.log(`Lead ${lead._id}: Fixing field ${field.name} value "${value}"`);
                    const fixedId = await resolveLookup(field.type, value);
                    if (fixedId) {
                        lead[field.name] = fixedId;
                        updated = true;
                    }
                }
            }

            if (updated) {
                await lead.save();
                console.log(`Lead ${lead._id} saved.`);
            }
        }

        console.log("Cleanup finished.");
        process.exit();
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

fixAllLeads();
