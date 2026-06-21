import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

mongoose.connect(process.env.MONGODB_URI);

const test = async () => {
    try {
        const Deal = (await import('./models/Deal.js')).default;
        const User = (await import('./models/User.js')).default;
        const { matchLeads } = await import('./controllers/lead.controller.js');
        
        const deal = await Deal.findById('6a13dd1c66df300dae7a0663').populate('inventoryId').lean();
        
        const user = await User.findOne({}).lean();
        user.role = 'Super Admin';

        // Mock req object
        const req = { body: deal, query: { dealId: deal._id }, user };
        const res = {
            status: () => ({ json: (data) => console.log("MatchLeads Output counts:", data.data.prefCount) })
        };
        
        await matchLeads(req, res);
        
    } catch (e) {
        console.error("Error:", e.stack);
    }
    process.exit(0);
};
test();
