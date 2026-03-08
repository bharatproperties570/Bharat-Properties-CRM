import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function verifyDb() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = (await import('./models/Inventory.js')).default;

        const record = await Inventory.findOne({ unitNumber: 'A-101' });
        console.log('Record found:', record ? 'Yes' : 'No');
        if (record) {
            console.log('Record team:', record.team);
            console.log('Record assignedTo:', record.assignedTo);
            console.log('Record ProjectId:', record.projectId);
            console.log('Record owners:', record.owners);
            if (record.owners && record.owners.length > 0) {
                const Contact = (await import('./models/Contact.js')).default;
                const owner = await Contact.findById(record.owners[0]);
                console.log('Owner contact details:', owner?.name);
            }
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        await mongoose.disconnect();
    }
}
verifyDb();
