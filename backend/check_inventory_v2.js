import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import User from './models/User.js';
import Project from './models/Project.js';
import Team from './models/Team.js';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function checkData() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');
        
        const populateFields = [
            { path: "owners", select: "name phones emails title personalAddress" },
            { path: "associates.contact", select: "name phones emails title personalAddress" },
        ];

        const records = await Inventory.find({ owners: { $exists: true, $not: { $size: 0 } } })
            .populate(populateFields)
            .limit(1)
            .lean();
            
        if (records.length === 0) {
            console.log('No inventory item with owners found.');
        } else {
            const item = records[0];
            console.log('Found inventory item:', item._id);
            console.log('Owner 0:', JSON.stringify(item.owners?.[0], null, 2));
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkData();
