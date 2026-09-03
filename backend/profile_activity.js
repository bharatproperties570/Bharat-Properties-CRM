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
    
    const Lead = mongoose.model('Lead');
    const lead = await Lead.findOne({ firstName: /Lalit/i }).lean();
    
    const Activity = mongoose.model('Activity');
    
    console.time('Activity.find');
    await Activity.find({
        entityId: lead._id.toString(),
        type: 'Marketing',
        status: 'Completed'
    }).sort({ performedAt: -1 }).lean();
    console.timeEnd('Activity.find');
    
    process.exit(0);
}
run();
