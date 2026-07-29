import connectDB from './backend/config/db.js';
import Notification from './backend/models/Notification.js';

const run = async () => {
    await connectDB();
    const notifs = await Notification.find({ $or: [{title: /fail/i}, {message: /fail/i}] }).sort({createdAt: -1}).limit(5).lean();
    console.log(JSON.stringify(notifs, null, 2));
    process.exit(0);
};
run();
