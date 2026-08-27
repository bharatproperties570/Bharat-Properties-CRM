import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const dealController = await import('./controllers/deal.controller.js');
    const leadId = '6a870e983a327c63243a94b1';
    let matchedDeals = [];
    const req = { 
        query: { leadId, budgetFlexibility: 20, sizeFlexibility: 20 },
        user: { _id: 'system', companyId: '698b3303861a01e0b0816896', role: 'admin', dataScope: 'all', email: 'system@marketing' }
    };
    const res = {
        status: () => res,
        json: (response) => {
            if (response.success && response.data) {
                matchedDeals = response.data;
            }
            return res;
        }
    };
    try {
        await dealController.matchDeals(req, res, (err) => { console.error('NEXT CALLED WITH ERR:', err); });
        
        console.log('TOTAL MATCHES:', matchedDeals.length);
        if (matchedDeals.length > 0) {
            console.log('TOP SCORE:', matchedDeals[0].score);
            console.log('TOP DEAL:', matchedDeals[0]._id, matchedDeals[0].isPreferredMatch);
            const preferred = matchedDeals.filter(d => d.isPreferredMatch);
            const topDeals = preferred.length > 0 ? preferred.slice(0, 5) : matchedDeals.filter(d => d.score >= 50).slice(0, 3);
            console.log('TOP DEALS FOR DISPATCH:', topDeals.length);
        }
    } catch (e) {
        console.error('CRASH:', e);
    }
    process.exit(0);
}
run();
