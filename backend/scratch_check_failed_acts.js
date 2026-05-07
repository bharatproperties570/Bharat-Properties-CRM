import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkFailedActivities() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Activity = mongoose.model('Activity', new mongoose.Schema({ type: String, status: String, description: String, details: mongoose.Schema.Types.Mixed, createdAt: Date }));
        
        const failed = await Activity.find({ type: 'Marketing', status: { $in: ['Failed', 'failed'] } })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
            
        console.log(`Found ${failed.length} failed marketing activities:`);
        failed.forEach((a, i) => {
            console.log(`--- [${i+1}] ${a.createdAt.toISOString()} ---`);
            console.log(`Description: ${a.description}`);
            console.log(`Details:`, JSON.stringify(a.details, null, 2));
        });
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkFailedActivities();
