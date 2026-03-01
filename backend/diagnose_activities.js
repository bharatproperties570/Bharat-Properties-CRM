import mongoose from 'mongoose';
import Activity from './models/Activity.js';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        console.log("Today:", today);
        console.log("Tomorrow:", tomorrow);

        const total = await Activity.countDocuments({});
        const pending = await Activity.countDocuments({ status: /pending/i });
        const inProgress = await Activity.countDocuments({ status: /in progress/i });
        
        console.log("Total Activities:", total);
        console.log("Pending:", pending);
        console.log("In Progress:", inProgress);

        const overdue = await Activity.countDocuments({ 
            dueDate: { $lt: today }, 
            status: { $regex: /pending|in progress/i } 
        });
        const todayCount = await Activity.countDocuments({ 
            dueDate: { $gte: today, $lt: tomorrow } 
        });
        const upcoming = await Activity.countDocuments({ 
            dueDate: { $gte: tomorrow } 
        });

        console.log("Overdue Filter Match:", overdue);
        console.log("Today Filter Match:", todayCount);
        console.log("Upcoming Filter Match:", upcoming);

        const sample = await Activity.findOne({ status: /pending/i }).lean();
        if (sample) {
            console.log("Sample Activity:", JSON.stringify({
                subject: sample.subject,
                status: sample.status,
                dueDate: sample.dueDate,
                type: typeof sample.dueDate
            }, null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

diagnose();
