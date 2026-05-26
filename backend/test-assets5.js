import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';
import Contact from './models/Contact.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);

    const conditions = [
        { professionCategory: { $regex: /^SELF EMPLOYED$/i } },
        { professionSubCategory: { $regex: /^Real Estate Agent$/i } }
    ];

    const allAgents = await Contact.find({ $or: conditions }).select('_id name company');
    console.log(`Found ${allAgents.length} agents across the system.`);

    const agentIds = allAgents.map(a => a._id);

    const properties = await Inventory.find({
        $or: [
            { owners: { $in: agentIds } },
            { 'associates.contact': { $in: agentIds } }
        ]
    }).select('_id owners associates');

    console.log(`Found ${properties.length} total properties linked to ANY agent.`);

    const deals = await Deal.find({
        stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] },
        $or: [
            { owner: { $in: agentIds } },
            { associatedContact: { $in: agentIds } },
            { 'partyStructure.owner': { $in: agentIds } },
            { 'partyStructure.buyer': { $in: agentIds } },
            { 'partyStructure.channelPartner': { $in: agentIds } }
        ]
    }).select('_id owner associatedContact partyStructure');

    console.log(`Found ${deals.length} total deals linked to ANY agent.`);

    await mongoose.disconnect();
}
test();
