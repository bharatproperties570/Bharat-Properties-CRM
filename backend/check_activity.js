import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Activity = mongoose.connection.db.collection('activities');
    const recent = await Activity.find({ type: 'Marketing' }).sort({ createdAt: -1 }).limit(3).toArray();
    
    for (const act of recent) {
        console.log('--- ACTIVITY ---');
        console.log('Date:', act.createdAt);
        console.log('Subject:', act.subject);
        console.log('Details:', JSON.stringify(act.details, null, 2));
    }
    process.exit(0);
}
run();
