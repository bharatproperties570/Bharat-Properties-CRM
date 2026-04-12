import mongoose from 'mongoose';
import Contact from './models/Contact.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function checkContact() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        const contact = await Contact.findById('69955d3e94c8fe05f86d1bb0').lean();
        console.log(`Contact 69955d3e94c8fe05f86d1bb0:`, contact ? contact.name : 'NOT FOUND');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkContact();
