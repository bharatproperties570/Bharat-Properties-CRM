import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const item = await mongoose.connection.db.collection('inventories').findOne({});
        console.log("Sample Inventory Fields:", {
            project: item.project,
            projectName: item.projectName,
            block: item.block,
            unitNumber: item.unitNumber,
            _id: item._id
        });

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
