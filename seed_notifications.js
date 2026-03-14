import mongoose from 'mongoose';
import Notification from './backend/models/Notification.js';
import User from './backend/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        const user = await User.findOne({ isAdmin: true }) || await User.findOne();
        if (!user) return console.log('No user found');

        await Notification.create([
            {
                user: user._id,
                type: 'system',
                title: '🚀 System Update',
                message: 'Your CRM has been updated with new search and goal features.',
                link: '/settings'
            },
            {
                user: user._id,
                type: 'system',
                title: '⚡ Web Alert',
                message: 'New site visit scheduled for today at 2:00 PM.',
                link: '/activities'
            }
        ]);

        console.log('Sample notifications seeded');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seed();
