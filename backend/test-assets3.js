import mongoose from 'mongoose';
import Company from './models/Company.js';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Use an actual company ID for testing
    const company = await Company.findOne({ name: 'Singla Property' }).select('employees name');
    console.log("Testing with Company:", company?.name);

    if (!company) return await mongoose.disconnect();

    const selfEmployedLookup = await Lookup.findOne({ lookup_type: 'ProfessionCategory', lookup_value: { $regex: /^SELF EMPLOYED$/i } });
    const realEstateAgentLookup = await Lookup.findOne({ lookup_type: 'ProfessionSubCategory', lookup_value: { $regex: /^Real Estate Agent$/i } });
    
    const conditions = [
        { professionCategory: { $regex: /^SELF EMPLOYED$/i } },
        { professionSubCategory: { $regex: /^Real Estate Agent$/i } }
    ];
    
    if (selfEmployedLookup) conditions.push({ professionCategory: selfEmployedLookup._id });
    if (realEstateAgentLookup) conditions.push({ professionSubCategory: realEstateAgentLookup._id });

    console.log("Company Employees:", company.employees);

    const eligibleEmployees = await Contact.find({
        $and: [
            {
                $or: [
                    { _id: { $in: company.employees || [] } },
                    { company: company.name }
                ]
            },
            { $or: conditions }
        ]
    }).select('_id name');

    console.log(`Found ${eligibleEmployees.length} eligible contacts in DB:`, eligibleEmployees);

    const eligibleIds = eligibleEmployees.map(e => e._id);

    if (eligibleIds.length > 0) {
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
    }

    await mongoose.disconnect();
}
test();
