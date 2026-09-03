import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find the lead Anukant Sharma
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const lead = await Lead.findOne({ firstName: /Anukant/i }).lean();
    if (!lead) {
        console.log('Lead not found');
        process.exit(1);
    }
    console.log('Found Lead:', lead._id, lead.firstName);

    // Push to Queue
    const { marketingQueue } = await import('./src/queues/marketingQueue.js');
    await marketingQueue.add('auto-match-dispatch', {
        leadId: lead._id,
        toggles: { whatsapp: true },
        matchContext: 'perfect',
        companyId: lead.companyId
    });
    
    console.log('Job pushed to Queue! Check PM2 logs for marketingWorker output.');
    process.exit(0);
}
run();
