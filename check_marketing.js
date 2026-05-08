import mongoose from 'mongoose';

async function checkActivities() {
    try {
        await mongoose.connect('mongodb://localhost:27017/bharat-properties');
        // Check if model already exists
        const Activity = mongoose.models.Activity || mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
        const activities = await Activity.find({ type: 'Marketing' }).sort({ createdAt: -1 }).limit(10);
        console.log(JSON.stringify(activities, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkActivities();
