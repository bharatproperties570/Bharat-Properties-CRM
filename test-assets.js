import mongoose from 'mongoose';
import Company from './backend/models/Company.js';
import Contact from './backend/models/Contact.js';
import Lookup from './backend/models/Lookup.js';
import Inventory from './backend/models/Inventory.js';
import Deal from './backend/models/Deal.js';

async function test() {
    await mongoose.connect('mongodb://localhost:27017/bharat-properties-crm');
    console.log("Connected to DB");

    const selfEmployedLookup = await Lookup.findOne({ lookup_type: 'ProfessionCategory', lookup_value: { $regex: /^SELF EMPLOYED$/i } });
    const realEstateAgentLookup = await Lookup.findOne({ lookup_type: 'ProfessionSubCategory', lookup_value: { $regex: /^Real Estate Agent$/i } });
    
    console.log("Self Employed Lookup ID:", selfEmployedLookup?._id);
    console.log("Real Estate Agent Lookup ID:", realEstateAgentLookup?._id);

    const conditions = [];
    if (selfEmployedLookup) conditions.push({ professionCategory: selfEmployedLookup._id });
    if (realEstateAgentLookup) conditions.push({ professionSubCategory: realEstateAgentLookup._id });
    
    console.log("Conditions:", JSON.stringify(conditions));

    const eligibleContacts = await Contact.find({ $or: conditions }).select('_id name professionCategory professionSubCategory company');
    console.log("Found eligible contacts:", eligibleContacts);

    const eligibleIds = eligibleContacts.map(c => c._id);

    const properties = await Inventory.find({
        $or: [
            { owners: { $in: eligibleIds } },
            { 'associates.contact': { $in: eligibleIds } }
        ]
    }).select('_id owners associates');

    console.log(`Found ${properties.length} properties for these contacts.`);

    const deals = await Deal.find({
        stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] },
        $or: [
            { owner: { $in: eligibleIds } },
            { associatedContact: { $in: eligibleIds } },
            { 'partyStructure.owner': { $in: eligibleIds } },
            { 'partyStructure.buyer': { $in: eligibleIds } },
            { 'partyStructure.channelPartner': { $in: eligibleIds } }
        ]
    }).select('_id owner associatedContact partyStructure');

    console.log(`Found ${deals.length} deals for these contacts.`);

    await mongoose.disconnect();
}
test();
