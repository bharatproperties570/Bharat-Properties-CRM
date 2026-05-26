import mongoose from 'mongoose';
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
    const agentIds = allAgents.map(a => a._id);

    const deals = await Deal.find({
        $or: [
            { owner: { $in: agentIds } },
            { associatedContact: { $in: agentIds } },
            { 'partyStructure.owner': { $in: agentIds } },
            { 'partyStructure.buyer': { $in: agentIds } },
            { 'partyStructure.channelPartner': { $in: agentIds } }
        ]
    }).select('_id dealId stage owner associatedContact partyStructure');

    console.log(`Found ${deals.length} total deals linked to ANY agent (ignoring stage).`);

    deals.forEach(d => console.log(JSON.stringify(d, null, 2)));

    // Let's also find which company these deals belong to based on the agent
    if (deals.length > 0) {
        const dealAgentIds = new Set();
        deals.forEach(d => {
            if (d.owner && agentIds.some(id => id.equals(d.owner))) dealAgentIds.add(d.owner.toString());
            if (d.associatedContact && agentIds.some(id => id.equals(d.associatedContact))) dealAgentIds.add(d.associatedContact.toString());
            if (d.partyStructure) {
                const ps = d.partyStructure;
                if (ps.owner && agentIds.some(id => id.equals(ps.owner))) dealAgentIds.add(ps.owner.toString());
                if (ps.buyer && agentIds.some(id => id.equals(ps.buyer))) dealAgentIds.add(ps.buyer.toString());
                if (ps.channelPartner && agentIds.some(id => id.equals(ps.channelPartner))) dealAgentIds.add(ps.channelPartner.toString());
            }
        });
        const relevantAgents = allAgents.filter(a => dealAgentIds.has(a._id.toString()));
        console.log("Companies to check in UI for these deals:");
        relevantAgents.forEach(a => {
            console.log(`- Company: "${a.company}" (Agent: ${a.name})`);
        });
    }

    await mongoose.disconnect();
}
test();
