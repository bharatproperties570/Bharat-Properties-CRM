import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const ActivitySchema = new mongoose.Schema({
    type: String,
    subject: String,
    details: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const Activity = mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const counts = await Activity.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        console.log('Activity Counts by Type:', counts);

        const emailActivities = await Activity.find({ type: 'Email' }).limit(5).lean();
        console.log('Sample Email Activities:', JSON.stringify(emailActivities, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error verifying activities:', error);
        process.exit(1);
    }
}

verify();
