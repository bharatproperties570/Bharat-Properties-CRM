import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { paginate } from './utils/pagination.js';
import Deal from './models/Deal.js';
import { dealListPopulateFields, dealListProjection } from './controllers/deal.controller.js';
import './models/Contact.js';
import './models/Inventory.js';
import './models/User.js';
import './models/Team.js';
import './models/Company.js';
import './models/Lookup.js';
import './models/Project.js';

dotenv.config({ path: './.env' });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/bharatproperties");
        console.log("Connected to MongoDB.");

        const query = {};

        console.time("1. Total Paginate");
        const results = await paginate(Deal, query, 1, 25, { createdAt: -1 }, dealListPopulateFields, null, dealListProjection);
        console.timeEnd("1. Total Paginate");

        console.time("2. Category Aggregation");
        const categoryStats = await Deal.aggregate([
            { $match: query },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        console.timeEnd("2. Category Aggregation");

        console.time("3. Find without Populate");
        await Deal.find(query).limit(25).lean();
        console.timeEnd("3. Find without Populate");
        
        console.log(`Total Records in DB: ${results.totalCount}`);

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
};

run();
