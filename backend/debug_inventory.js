import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const queryData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const unit101 = await Inventory.findOne({ unitNo: '101' });
        if (!unit101) {
            console.log('Unit 101 not found');
            process.exit(0);
        }

        console.log('Unit 101 ID:', unit101._id);
        console.log('Unit 101 Project Info:', {
            projectName: unit101.projectName,
            projectId: unit101.projectId
        });

        // Search for similar
        const query = {
            $or: [
                { projectId: unit101.projectId },
                { projectName: unit101.projectName }
            ],
            _id: { $ne: unit101._id }
        };

        console.log('Query:', JSON.stringify(query, null, 2));

        const similar = await Inventory.find(query).limit(10);

        console.log('Similar Units Count:', similar.length);
        similar.forEach(u => console.log(`- ${u.unitNo} (ID: ${u._id}, Project: ${u.projectName})`));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

queryData();
