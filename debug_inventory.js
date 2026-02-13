import mongoose from 'mongoose';
import Inventory from './backend/models/Inventory.js';
import dotenv from 'dotenv';

dotenv.config();

const queryData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const unit101 = await Inventory.findOne({ unitNo: '101' });
        if (!unit101) {
            console.log('Unit 101 not found');
            process.exit(0);
        }

        console.log('Unit 101 Project Info:', {
            projectName: unit101.projectName,
            projectId: unit101.projectId
        });

        const similar = await Inventory.find({
            $or: [
                { projectId: unit101.projectId },
                { projectName: unit101.projectName }
            ],
            _id: { $ne: unit101._id }
        }).limit(10);

        console.log('Similar Units Count:', similar.length);
        similar.forEach(u => console.log(`- ${u.unitNo} (${u.projectName})`));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

queryData();
