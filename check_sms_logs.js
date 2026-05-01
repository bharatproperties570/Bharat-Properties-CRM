import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const SmsLogSchema = new mongoose.Schema({
    to: String,
    message: String,
    status: String,
    provider: String,
    error: String,
    createdAt: { type: Date, default: Date.now }
}, { collection: 'smslogs' });

const SmsLog = mongoose.model('SmsLog', SmsLogSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const recentLogs = await SmsLog.find().sort({ createdAt: -1 }).limit(10);
        console.log('--- RECENT SMS LOGS ---');
        recentLogs.forEach(l => {
            console.log(`[${l.createdAt.toISOString()}] To: ${l.to} | Status: ${l.status} | Provider: ${l.provider} | Error: ${l.error || 'None'}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
