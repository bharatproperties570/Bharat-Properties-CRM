import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ActivitySchema = new mongoose.Schema({
    type: String,
    subject: String,
    status: String,
    createdAt: { type: Date, default: Date.now }
}, { collection: 'activities' });

const Activity = mongoose.model('Activity', ActivitySchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const recentActivities = await Activity.find({ type: 'Marketing' }).sort({ createdAt: -1 }).limit(10);
        console.log('--- RECENT MARKETING ACTIVITIES ---');
        recentActivities.forEach(a => {
            console.log(`[${a.createdAt.toISOString()}] Subject: ${a.subject} | Status: ${a.status}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
