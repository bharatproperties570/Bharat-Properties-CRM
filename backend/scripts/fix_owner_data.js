
import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import config from '../src/config/env.js';

const fixData = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('Connected to DB');

        // Fix Contacts
        const badContacts = await Contact.find({ owner: 'Self' });
        console.log(`Found ${badContacts.length} contacts with owner "Self"`);

        if (badContacts.length > 0) {
            const result = await Contact.updateMany({ owner: 'Self' }, { $unset: { owner: 1 } });
            console.log(`Unset owner for contacts: ${result.modifiedCount}`);
        }

        // Fix Leads
        const badLeads = await Lead.find({ owner: 'Self' });
        console.log(`Found ${badLeads.length} leads with owner "Self"`);

        if (badLeads.length > 0) {
            const result = await Lead.updateMany({ owner: 'Self' }, { $unset: { owner: 1 } });
            console.log(`Unset owner for leads: ${result.modifiedCount}`);
        }

        // Check for other non-ObjectId owners
        // We can't easily query matching "not ObjectId" in Mongo with mixed type unless we use $type, but "Self" is the known culprit.

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixData();
