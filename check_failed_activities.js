import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ActivitySchema = new mongoose.Schema({
    type: String,
    subject: String,
    status: String,
    description: String,
    details: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
}, { collection: 'activities' });

const Activity = mongoose.model('Activity', ActivitySchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const recentActivities = await Activity.find({ type: 'Marketing', status: 'Failed' }).sort({ createdAt: -1 }).limit(5);
        console.log('--- RECENT FAILED MARKETING ACTIVITIES ---');
        recentActivities.forEach(a => {
            console.log(`[${a.createdAt.toISOString()}] Subject: ${a.subject}`);
            console.log(`    Error: ${a.details?.error || 'No error detail'}`);
            console.log(`    Description: ${a.description}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
