code = """
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const { matchDeals } = await import('file:///home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js');
    
    const Deal = mongoose.model('Deal');
    const origAgg = Deal.aggregate.bind(Deal);
    Deal.aggregate = async function(pipeline) {
        console.log('Pipeline:', JSON.stringify(pipeline, null, 2));
        
        let currentPipeline = [];
        for (const stage of pipeline) {
            currentPipeline.push(stage);
            const res = await origAgg(currentPipeline);
            console.log('After stage ' + Object.keys(stage)[0] + ': ' + res.length + ' docs');
        }
        
        return origAgg(pipeline);
    };
    
    const Lead = mongoose.model('Lead');
    const lead = await Lead.findOne({ firstName: /Lalit/i }).lean();
    
    const req = {
        query: { leadId: lead._id.toString() },
        user: { email: 'test@example.com', role: 'admin', dataScope: 'all', _id: '64d1f2115db01b1b28d689b0' }
    };
    
    const resObj = {
        status: (c) => ({ json: (d) => { console.log('Final Match Count:', d.count); console.log('Excluded Count:', d.excludedCount); } }),
        json: (d) => { console.log('Final Match Count:', d.count); console.log('Excluded Count:', d.excludedCount); }
    };
    
    await matchDeals(req, resObj, (err) => console.log('Err', err));
    process.exit(0);
}
run();
"""
with open('debug_agg_filters.js', 'w') as f:
    f.write(code)
