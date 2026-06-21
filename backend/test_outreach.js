import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

mongoose.connect(process.env.MONGODB_URI);

const test = async () => {
    try {
        const Deal = (await import('./models/Deal.js')).default;
        const User = (await import('./models/User.js')).default;
        const { triggerDealMatchEmailOutreach } = await import('./services/outreach.service.js');
        
        // Find an existing deal
        const deal = await Deal.findById('6a13dd1c66df300dae7a0663').populate('inventoryId').lean();
        const user = await User.findOne().lean();

        console.log("Triggering Outreach...");
        await triggerDealMatchEmailOutreach(deal, user);
        console.log("Outreach finished.");
        
        // Check notifications
        const Notification = (await import('./models/Notification.js')).default;
        const notifs = await Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(1).lean();
        console.log("Last Notification:", notifs);

    } catch (e) {
        console.error("Error:", e.stack);
    }
    process.exit(0);
};
test();
