import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

mongoose.connect(process.env.MONGODB_URI);

const test = async () => {
    try {
        const Deal = (await import('./models/Deal.js')).default;
        const User = (await import('./models/User.js')).default;
        const { getBulkDealExactMatchCounts } = await import('./controllers/lead.controller.js');
        
        const deals = await Deal.find({}).populate('inventoryId').lean();
        const deal603 = deals.find(d => JSON.stringify(d).includes('603'));
        
        const user = await User.findOne({}).lean();
        user.role = 'Super Admin';
        
        if (!deal603) {
            console.log("Could not find deal with 603");
        } else {
            console.log("Testing with Deal ID:", deal603._id);
            const counts = await getBulkDealExactMatchCounts([deal603], user);
            console.log("Bulk Match Count (with admin user):", counts);
        }
    } catch (e) {
        console.error("Error:", e.stack);
    }
    process.exit(0);
};
test();
