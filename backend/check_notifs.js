import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Notification = (await import('./models/Notification.js')).default;
        
        // Find recent system/error notifications
        const notifs = await Notification.find({ 
            $or: [{ title: /fail/i }, { message: /fail/i }] 
        }).sort({createdAt: -1}).limit(20).lean();
        
        console.log("NOTIFICATIONS:\n", JSON.stringify(notifs, null, 2));
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
};
run();
