import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const fs = await import('fs');
    const path = await import('path');
    const modelsDir = '/home/ubuntu/bharat-properties-crm/backend/models';
    const files = fs.readdirSync(modelsDir);
    for (const file of files) {
        if (file.endsWith('.js')) {
            await import('file://' + path.join(modelsDir, file));
        }
    }
    
    const { matchDeals } = await import('file:///home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js');
    const Lead = mongoose.model('Lead');
    const lead = await Lead.findOne({ firstName: /Lalit/i }).lean();
    
    // We will monkey patch Deal.aggregate to log its time!
    const Deal = mongoose.model('Deal');
    const origAgg = Deal.aggregate.bind(Deal);
    Deal.aggregate = async function(pipeline) {
        console.time('Deal.aggregate');
        const res = await origAgg(pipeline);
        console.timeEnd('Deal.aggregate');
        console.log('Agg returned', res.length, 'deals');
        return res;
    };
    
    const req = {
        query: { leadId: lead._id.toString() },
        user: { email: 'test@example.com', role: 'admin', dataScope: 'all', _id: '64d1f2115db01b1b28d689b0' }
    };
    
    const resObj = {
        status: (c) => ({ json: (d) => console.log('Matches:', d.matchedDeals?.length) }),
        json: (d) => console.log('Matches:', d.matchedDeals?.length)
    };
    
    console.time('matchDeals');
    await matchDeals(req, resObj, (err) => console.log('Err', err));
    console.timeEnd('matchDeals');
    process.exit(0);
}
run();
