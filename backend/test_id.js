import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI);

const test = async () => {
    try {
        const Lead = (await import('./models/Lead.js')).default;
        const lead = await Lead.findById('699c30fcbf3e6a3e69493a74').lean();
        console.log("lead.propertyType:", lead.propertyType);
        console.log("typeof lead.propertyType[0]:", typeof lead.propertyType[0]);
        console.log("String(lead.propertyType[0]):", String(lead.propertyType[0]));
        
        const allLookups = await mongoose.model('Lookup').find({}).lean();
        const lookupIdMap = new Map(allLookups.map(l => [String(l._id), l.lookup_value]));
        console.log("lookupIdMap has it?:", lookupIdMap.has(String(lead.propertyType[0])));
    } catch (e) {
        console.error("Error:", e.stack);
    }
    process.exit(0);
};
test();
