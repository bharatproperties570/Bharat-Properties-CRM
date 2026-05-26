import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
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

    const properties = await Inventory.find({
        $or: [
            { owners: { $in: agentIds } },
            { 'associates.contact': { $in: agentIds } }
        ]
    }).select('_id owners associates');

    const agentsWithProps = new Set();
    properties.forEach(p => {
        if (p.owners) p.owners.forEach(o => {
            if (agentIds.some(id => id.equals(o))) agentsWithProps.add(o.toString());
        });
        if (p.associates) p.associates.forEach(a => {
            if (a.contact && agentIds.some(id => id.equals(a.contact))) agentsWithProps.add(a.contact.toString());
        });
    });

    const relevantAgents = allAgents.filter(a => agentsWithProps.has(a._id.toString()));
    
    console.log("Companies to check in UI:");
    relevantAgents.forEach(a => {
        console.log(`- Company: "${a.company}" (Agent: ${a.name})`);
    });

    await mongoose.disconnect();
}
test();
