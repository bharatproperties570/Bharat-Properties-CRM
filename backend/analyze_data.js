import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';

dotenv.config();

async function analyze() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const records = await Inventory.find({}).lean();

        const fields = ['category', 'subCategory', 'unitType', 'status'];
        const stats = {};

        fields.forEach(f => stats[f] = { total: 0, objectId: 0, stringId: 0, label: 0, empty: 0 });

        records.forEach(r => {
            fields.forEach(f => {
                const val = r[f];
                stats[f].total++;
                if (!val) {
                    stats[f].empty++;
                } else if (val instanceof mongoose.Types.ObjectId) {
                    stats[f].objectId++;
                } else if (typeof val === 'string') {
                    if (mongoose.Types.ObjectId.isValid(val)) {
                        stats[f].stringId++;
                    } else {
                        stats[f].label++;
                    }
                }
            });
        });

        console.log("--- Data Consistency Stats ---");
        console.table(stats);

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

analyze();
