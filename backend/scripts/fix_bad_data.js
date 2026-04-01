
import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Lookup from '../models/Lookup.js';
import config from '../src/config/env.js';

const resolveLookup = async (type, value) => {
    if (!value) return null;
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
    if (!lookup) {
        console.log(`Creating Lookup: ${type} - ${value}`);
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

const fixData = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        // 1. Fix Owner "Self"
        const updateOwner = async (Model, name) => {
            const badDocs = await Model.find({ owner: 'Self' });
            console.log(`Found ${badDocs.length} ${name}s with owner "Self"`);
            if (badDocs.length > 0) {
                const result = await Model.updateMany({ owner: 'Self' }, { $unset: { owner: 1 } });
                console.log(`Unset owner for ${name}s: ${result.modifiedCount}`);
            }
        };
        await updateOwner(Contact, 'Contact');
        await updateOwner(Lead, 'Lead');

        // 2. Fix Lead "Buy" in requirement
        const badLeadsReq = await Lead.find({ requirement: 'Buy' });
        console.log(`Found ${badLeadsReq.length} leads with requirement "Buy"`);
        if (badLeadsReq.length > 0) {
            const lookupId = await resolveLookup('Requirement', 'Buy');
            const result = await Lead.updateMany({ requirement: 'Buy' }, { requirement: lookupId });
            console.log(`Fixed requirement "Buy" to ${lookupId}: ${result.modifiedCount}`);
        }

        // 3. Fix generic string values in Ref fields for Lead
        // Fields: source, status, budget, location

        // "Active" status
        const badLeadsStatus = await Lead.find({ status: 'Active' });
        if (badLeadsStatus.length > 0) {
            const lookupId = await resolveLookup('Status', 'Active');
            const result = await Lead.updateMany({ status: 'Active' }, { status: lookupId });
            console.log(`Fixed status "Active" to ${lookupId}: ${result.modifiedCount}`);
        }

        // "Direct" source
        const fixSourceLike = async (val) => {
            const badDocs = await Lead.find({ source: val });
            if (badDocs.length > 0) {
                const lookupId = await resolveLookup('Source', val);
                const result = await Lead.updateMany({ source: val }, { source: lookupId });
                console.log(`Fixed Lead source "${val}" to ${lookupId}: ${result.modifiedCount}`);
            }
            const badContacts = await Contact.find({ source: val });
            if (badContacts.length > 0) {
                const lookupId = await resolveLookup('Source', val);
                const result = await Contact.updateMany({ source: val }, { source: lookupId });
                console.log(`Fixed Contact source "${val}" to ${lookupId}: ${result.modifiedCount}`);
            }
        };

        await fixSourceLike('Direct');
        await fixSourceLike('Google');
        await fixSourceLike('Facebook');
        await fixSourceLike('Instagram');
        await fixSourceLike('Referral');

        // Fix Status "Active" in Contacts too?
        // Contact status is a string "Active" by default in schema line 111.
        // BUT check line 34: visibleTo... wait.
        // Contact schema line 29: source: Mixed ref Lookup.
        // Contact schema line 111: status: String default "Active".
        // So Contact.status is STRING. It does not need fixing.
        // Lead.status is Mixed ref Lookup. It needs fixing.


        console.log('Done fixing data');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixData();
