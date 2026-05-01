import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const SmsLogSchema = new mongoose.Schema({
    to: String,
    status: String,
    createdAt: { type: Date, default: Date.now }
}, { collection: 'smslogs' });

const SmsLog = mongoose.model('SmsLog', SmsLogSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
        
        const count = await SmsLog.countDocuments({ createdAt: { $gte: tenMinutesAgo } });
        console.log(`\n--- RECENT SMS DISPATCHES (Last 10m) ---`);
        console.log(`Sent: ${count}`);
        
        const lastFew = await SmsLog.find({ createdAt: { $gte: tenMinutesAgo } }).sort({ createdAt: -1 }).limit(5);
        lastFew.forEach(l => {
            console.log(`[${l.createdAt.toISOString()}] To: ${l.to} | Status: ${l.status}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
