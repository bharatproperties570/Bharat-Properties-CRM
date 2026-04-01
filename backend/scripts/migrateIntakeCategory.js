import mongoose from 'mongoose';
import Intake from '../models/Intake.js';
import dotenv from 'dotenv';
dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-crm');
        console.log("Connected to MongoDB for Migration");

        const result = await Intake.updateMany(
            { category: { $exists: false } },
            { $set: { category: 'new' } }
        );

        console.log(`Migration Complete: Updated ${result.modifiedCount} records with default category 'new'`);
        process.exit(0);
    } catch (error) {
        console.error("Migration Failed:", error);
        process.exit(1);
    }
};

migrate();
