import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI);

const test = async () => {
    try {
        const Deal = (await import('./models/Deal.js')).default;
        const { getBulkDealExactMatchCounts, getExactMatchLeadsForDeal } = await import('./controllers/lead.controller.js');
        
        const deal = await Deal.findById('6a13dd1c66df300dae7a0663').populate('inventoryId').lean();
        
        const counts = await getBulkDealExactMatchCounts([deal]);
        console.log("Counts:", counts);

        const matches = await getExactMatchLeadsForDeal(deal);
        console.log("Matches length:", matches.length);

    } catch (e) {
        console.error("Error:", e.stack);
    }
    process.exit(0);
};
test();
