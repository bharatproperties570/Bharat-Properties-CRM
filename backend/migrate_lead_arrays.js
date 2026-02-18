import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';

import Lookup from './models/Lookup.js';

dotenv.config();

// Helper to resolve lookup (Find or Create)
const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value.toString());

    // Cleanup if it looks like a stringified array
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        // This is complex to handle here, better handle it in the main loop
        return value;
    }

    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
        console.log(`Created lookup: ${type} -> ${value}`);
    }
    return lookup._id;
};

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const leads = await Lead.find({});
        console.log(`Found ${leads.length} leads to check.`);

        const arrayLookupMap = {
            propertyType: 'Property Type',
            subType: 'Sub Type',
            unitType: 'Unit Type',
            facing: 'Facing',
            roadWidth: 'Road Width',
            direction: 'Direction'
        };

        let updatedCount = 0;

        for (const lead of leads) {
            let needsUpdate = false;

            for (const [field, lookupType] of Object.entries(arrayLookupMap)) {
                let currentVal = lead[field];

                // Detection for corrupted stringified arrays
                if (typeof currentVal === 'string' && currentVal.startsWith('[') && currentVal.endsWith(']')) {
                    console.log(`Fixing stringified array for Lead ${lead._id} Field ${field}: ${currentVal}`);
                    try {
                        // Replace single quotes with double quotes for JSON.parse if needed, 
                        // but eval-like parsing might be safer for js-style strings
                        const normalized = currentVal.replace(/'/g, '"');
                        currentVal = JSON.parse(normalized);
                        needsUpdate = true;
                    } catch (e) {
                        console.warn(`Failed to parse ${currentVal}: ${e.message}`);
                        // Fallback: simple strip and split
                        currentVal = currentVal.replace(/[\[\]']/g, '').split(',').map(s => s.trim());
                        needsUpdate = true;
                    }
                }

                if (Array.isArray(currentVal)) {
                    const newIds = [];
                    for (const item of currentVal) {
                        const resolvedId = await resolveLookup(lookupType, item);
                        if (resolvedId && mongoose.Types.ObjectId.isValid(resolvedId)) {
                            newIds.push(resolvedId);
                            if (item.toString() !== resolvedId.toString()) needsUpdate = true;
                        } else {
                            console.warn(`Skipping invalid/unresolvable value: ${item} in ${field}`);
                        }
                    }
                    if (needsUpdate) lead[field] = newIds;
                }
            }

            if (needsUpdate) {
                try {
                    await lead.save();
                    updatedCount++;
                } catch (saveErr) {
                    console.error(`Failed to save Lead ${lead._id}:`, saveErr.message);
                }
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} leads.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
