import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Inventory from './models/Inventory.js';
import Lookup from './models/Lookup.js';
import Contact from './models/Contact.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

async function resolveLookup(type, value) {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    
    // Check if value is already an object from a failed population attempt in another context
    if (typeof value === 'object' && value._id) return value._id;

    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        console.log(`Creating missing ${type} lookup: "${value}"`);
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
}

async function repair() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        console.log('Connected to MongoDB.');

        // 1. Repair Deals
        const deals = await Deal.find({}).lean();
        console.log(`Analyzing ${deals.length} deals...`);

        for (const deal of deals) {
            let needsUpdate = false;
            const update = {};

            if (deal.category && typeof deal.category === 'string' && !mongoose.Types.ObjectId.isValid(deal.category)) {
                update.category = await resolveLookup('Category', deal.category);
                needsUpdate = true;
            }
            if (deal.subCategory && typeof deal.subCategory === 'string' && !mongoose.Types.ObjectId.isValid(deal.subCategory)) {
                update.subCategory = await resolveLookup('SubCategory', deal.subCategory);
                needsUpdate = true;
            }
            if (deal.intent && typeof deal.intent === 'string' && !mongoose.Types.ObjectId.isValid(deal.intent)) {
                update.intent = await resolveLookup('Intent', deal.intent);
                needsUpdate = true;
            }
            if (deal.status && typeof deal.status === 'string' && !mongoose.Types.ObjectId.isValid(deal.status)) {
                update.status = await resolveLookup('Status', deal.status);
                needsUpdate = true;
            }

            if (needsUpdate) {
                await Deal.findByIdAndUpdate(deal._id, { $set: update });
                console.log(`Repaired Deal ${deal._id} (${deal.unitNo})`);
            }
        }

        // 2. Repair Inventories
        const inventories = await Inventory.find({}).lean();
        console.log(`Analyzing ${inventories.length} inventories...`);

        for (const inv of inventories) {
            let needsUpdate = false;
            const update = {};

            if (inv.category && typeof inv.category === 'string' && !mongoose.Types.ObjectId.isValid(inv.category)) {
                update.category = await resolveLookup('Category', inv.category);
                needsUpdate = true;
            }
            if (inv.owners && Array.isArray(inv.owners)) {
                const newOwners = [];
                let ownersChanged = false;
                for (const owner of inv.owners) {
                    if (typeof owner === 'string' && !mongoose.Types.ObjectId.isValid(owner)) {
                        // This shouldn't happen based on our check but be safe
                        console.log(`Skipping string owner name resolving: ${owner}`);
                    } else {
                        newOwners.push(owner);
                    }
                }
                if (ownersChanged) {
                    update.owners = newOwners;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                await Inventory.findByIdAndUpdate(inv._id, { $set: update });
                console.log(`Repaired Inventory ${inv._id} (${inv.unitNo})`);
            }
        }

        console.log('Repair complete.');
        await mongoose.disconnect();
    } catch (err) {
        console.error('Repair failed:', err);
    }
}

repair();
