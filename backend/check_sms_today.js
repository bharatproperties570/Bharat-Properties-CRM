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
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const count = await SmsLog.countDocuments({ createdAt: { $gte: today } });
        console.log(`Successful/Recent SMS logs today: ${count}`);
        
        const recent = await SmsLog.find({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).limit(5);
        recent.forEach(l => {
            console.log(`[${l.createdAt.toISOString()}] To: ${l.to} | Status: ${l.status}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
