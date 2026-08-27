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
    const lead = await Lead.findOne({ firstName: /Anukant/i }).lean();
    
    if (!lead) {
        console.log('Lead not found');
        process.exit();
    }
    
    console.log('--- LEAD REQ ---');
    console.log('Name:', lead.firstName, lead.lastName);
    console.log('Req:', lead.requirement);
    console.log('Cats:', lead.category);
    console.log('Budget:', lead.budgetMin, '-', lead.budgetMax);
    console.log('City:', lead.locCity);
    
    // Monkey patch Deal.aggregate to print DB drops
    const Deal = mongoose.model('Deal');
    const origAgg = Deal.aggregate.bind(Deal);
    Deal.aggregate = async function(pipeline) {
        let currentPipeline = [];
        for (const stage of pipeline) {
            currentPipeline.push(stage);
            const res = await origAgg(currentPipeline);
            const stageName = Object.keys(stage)[0];
            if (stageName === '\$match' || stageName === '\$addFields') {
                console.log('DB Stage ' + stageName + ' -> Remaining: ' + res.length);
            }
        }
        return origAgg(pipeline);
    };
    
    const req = {
        query: { leadId: lead._id.toString(), showOtherCities: 'true' }, // we will pass showOtherCities to see what survives
        user: { email: 'test@example.com', role: 'admin', dataScope: 'all', _id: '64d1f2115db01b1b28d689b0' }
    };
    
    const resObj = {
        status: (c) => ({ json: (d) => {
            console.log('--- JS EXCLUSIONS ---');
            d.excluded.forEach(e => console.log(e.excludeReason));
            console.log('--- FINAL MATCHES ---');
            console.log('Total Final:', d.count);
        } }),
        json: (d) => {}
    };
    
    await matchDeals(req, resObj, (err) => console.log('Err', err));
    process.exit(0);
}
run();
