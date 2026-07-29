import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';

dotenv.config();

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const test = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    console.time('10 regex searches');
    for (let i = 0; i < 10; i++) {
        const regexQuery = {
            $and: [
                { $or: [{ unitNo: new RegExp(`^${escapeRegExp("101")}$`, 'i') }, { unitNumber: new RegExp(`^${escapeRegExp("101")}$`, 'i') }] },
                { projectName: new RegExp(`^${escapeRegExp("Test Project")}$`, 'i') }
            ]
        };
        await Inventory.find(regexQuery).limit(1);
    }
    console.timeEnd('10 regex searches');

    process.exit(0);
};

test();
