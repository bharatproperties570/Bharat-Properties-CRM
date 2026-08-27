import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/bharat-properties-crm/backend/.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const fs = await import('fs');
    const path = await import('path');
    const modelsDir = '/home/ubuntu/bharat-properties-crm/backend/models';
    const files = fs.readdirSync(modelsDir);
    await import('file://' + path.join(modelsDir, 'User.js'));
    await import('file://' + path.join(modelsDir, 'Team.js'));
    for (const file of files) {
        if (file.endsWith('.js')) {
            await import('file://' + path.join(modelsDir, file));
        }
    }
    
    const { matchDeals } = await import('file:///home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js');
    const Lead = mongoose.model('Lead');
    const lead = await Lead.findOne({ }).select('_id').lean();
    
    const req = {
        query: { leadId: lead._id.toString() },
        user: { email: 'test@example.com', role: 'admin', dataScope: 'all', _id: '64d1f2115db01b1b28d689b0' }
    };
    
    const res = {
        status: (code) => ({
            json: (data) => console.log('Response status:', code, 'matched:', data.matchedDeals?.length)
        }),
        json: (data) => console.log('Response status 200 via json()', 'matched:', data.matchedDeals?.length)
    };

    console.time('matchDeals execution');
    await matchDeals(req, res, (err) => console.error(err));
    console.timeEnd('matchDeals execution');
    
    process.exit(0);
}

run();
