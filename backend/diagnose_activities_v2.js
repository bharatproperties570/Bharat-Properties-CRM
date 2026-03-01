import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from current directory
dotenv.config();

const MONGODB_URI = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function diagnose() {
    try {
        console.log("Connecting to:", MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Define a minimal schema if models are not easily importable in this context
        const Activity = mongoose.model('Activity', new mongoose.Schema({
            dueDate: Date,
            status: String,
            subject: String
        }, { collection: 'activities' }));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        console.log("Internal Today:", today);
        
        const total = await Activity.countDocuments({});
        console.log("Total Activities in DB:", total);

        const allStatuses = await Activity.distinct('status');
        console.log("Available Statuses:", allStatuses);

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

        console.log("Calculated Stats:");
        console.log("  Overdue:", overdue);
        console.log("  Today:", todayCount);
        console.log("  Upcoming:", upcoming);

        const sample = await Activity.findOne({}).sort({createdAt: -1}).lean();
        if (sample) {
            console.log("Latest Activity Sample:", JSON.stringify({
                subject: sample.subject,
                status: sample.status,
                dueDate: sample.dueDate
            }, null, 2));
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

diagnose();
