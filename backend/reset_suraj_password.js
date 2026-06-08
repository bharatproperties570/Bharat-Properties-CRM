import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

dotenv.config();

async function resetPassword() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const user = await User.findOne({ email: 'suraj@bharatproperties.co' });
        if (!user) {
            console.error("User suraj@bharatproperties.co not found!");
            process.exit(1);
        }

        const newPassword = 'BharatProperties@123'; // Standard secure password format
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        user.password = hashedPassword;
        if (user.passwordHistory) {
            user.passwordHistory.push({ hash: hashedPassword, changedAt: new Date() });
        }
        user.lastPasswordChange = new Date();
        
        await user.save();
        console.log(`Successfully updated password for suraj@bharatproperties.co to: ${newPassword}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

resetPassword();
