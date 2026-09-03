import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Inventory from '../models/Inventory.js';
import Conversation from '../models/Conversation.js';
import Activity from '../models/Activity.js';
import Contact from '../models/Contact.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const ids = [
        ['6a695ecd89cee3c8a41431c0', '6a6dfd209d3de196224a6884', '6a6ec53e9d3de196224be08e'],
        ['6a6e033b9d3de196224a8790', '6a6f2aff9d3de196224d323f'],
        ['6a58ae325c2132f2a33e0fac', '6a6abe55006432defa7deeff'],
        ['6a22cfde4bfd799ae3f6d73d', '6a58a6c15c2132f2a33dc8e3'],
        ['6a22d0594bfd799ae3f6dad2', '6a58b9b65c2132f2a33e50c7']
    ];
    
    for (let i = 0; i < ids.length; i++) {
        const groupIds = ids[i];
        let deals = await Deal.countDocuments({ $or: [{ owner: { $in: groupIds } }, { associatedContact: { $in: groupIds } }] });
        let bookings = await Booking.countDocuments({ $or: [{ lead: { $in: groupIds } }, { seller: { $in: groupIds } }, { channelPartner: { $in: groupIds } }] });
        let invs = await Inventory.countDocuments({ $or: [{ owners: { $in: groupIds } }, { 'associates.contact': { $in: groupIds } }] });
        let convs = await Conversation.countDocuments({ contact: { $in: groupIds } });
        let acts = await Activity.countDocuments({ relatedTo: { $elemMatch: { id: { $in: groupIds }, model: 'Contact' } } });
        
        console.log(`Group ${i+1} References: Deals=${deals}, Bookings=${bookings}, Inventory=${invs}, Convs=${convs}, Acts=${acts}`);
    }
    
    process.exit(0);
}

run().catch(console.error);
