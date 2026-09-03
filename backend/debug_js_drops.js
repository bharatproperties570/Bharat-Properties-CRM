
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const { matchDeals } = await import('file:///home/ubuntu/bharat-properties-crm/backend/controllers/deal.controller.js');
    
    const Lead = mongoose.model('Lead');
    const lead = await Lead.findOne({ firstName: /Lalit/i }).lean();
    
    const req = {
        query: { leadId: lead._id.toString() },
        user: { email: 'test@example.com', role: 'admin', dataScope: 'all', _id: '64d1f2115db01b1b28d689b0' }
    };
    
    const resObj = {
        status: (c) => ({ json: (d) => { console.log('Final Excluded:', d.excluded); } }),
        json: (d) => { console.log('Final Excluded:', d.excluded); }
    };
    
    await matchDeals(req, resObj, (err) => console.log('Err', err));
    process.exit(0);
}
run();
