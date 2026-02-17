import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat_properties');
        console.log("Connected to DB");

        const rules = await mongoose.connection.db.collection('duplicationrules').find({ entityType: 'Inventory' }).toArray();
        console.log("Inventory Rules:", JSON.stringify(rules, null, 2));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
