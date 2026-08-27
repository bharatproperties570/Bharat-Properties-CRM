const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');
async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const { matchDeals } = await import('./controllers/deal.controller.js');
    const req = { query: { leadId: '6a8832060465afe731e7db3b', budgetFlexibility: 20, sizeFlexibility: 20 } };
    const res = {
        status: () => res,
        json: (data) => {
            const matches = data.data || [];
            console.log('Matches:', matches.length);
            process.exit(0);
        }
    };
    await matchDeals(req, res);
}
test();
