import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';
import User from './models/User.js';
import Team from './models/Team.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        console.log('Connected.');

        const contacts = await Contact.find().limit(5).lean();
        console.log(`Found ${contacts.length} contacts.`);

        contacts.forEach((c, idx) => {
            console.log(`\n--- Contact ${idx + 1}: ${c.name} ---`);
            console.log(`ID: ${c._id}`);
            console.log(`Owner: ${c.owner} (${typeof c.owner})`);
            console.log(`Team: ${JSON.stringify(c.team)} (${typeof c.team})`);
            console.log(`Ownership: ${c.ownership}`);
            console.log(`VisibleTo: ${c.visibleTo}`);
        });

        const userCount = await User.countDocuments();
        const teams = await Team.find().lean();
        console.log(`\nTotal Users: ${userCount}`);
        console.log(`Total Teams: ${teams.length}`);
        teams.forEach(t => console.log(`Team: ${t.name} (ID: ${t._id})`));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkData();
