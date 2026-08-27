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
    
    const req = { query: { leadId: lead._id.toString(), showOtherCities: 'true' }, user: { email: 'a', role: 'admin', dataScope: 'all', _id: '64d' } };
    const resObj = {
        status: () => ({ json: (d) => {
            console.log('Final Excluded:', d.excluded.length);
            console.log('Final Match Count:', d.count);
        } }),
        json: (d) => {
            console.log('Final Excluded:', d.excluded.length);
            console.log('Final Match Count:', d.count);
        }
    };
    await matchDeals(req, resObj, () => {});
    process.exit(0);
}
run();
