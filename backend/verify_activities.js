
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const ActivitySchema = new mongoose.Schema({
    type: String,
    subject: String,
    entityId: mongoose.Schema.Types.ObjectId,
    status: String,
});

const Activity = mongoose.model('Activity', ActivitySchema);

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");
        const count = await Activity.countDocuments();
        const latest = await Activity.find().sort({ createdAt: -1 }).limit(1);
        console.log(`Total Activities: ${count}`);
        console.log("Latest Activity:", JSON.stringify(latest, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

verify();
