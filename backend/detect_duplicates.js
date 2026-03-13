import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contact from './models/Contact.js';

dotenv.config();

async function detect() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const contacts = await Contact.find({}).lean();
        console.log(`Found ${contacts.length} total contacts.`);

        const phoneMap = new Map();
        const duplicates = [];

        for (const contact of contacts) {
            const phones = contact.phones || [];
            for (const p of phones) {
                if (!p.number) continue;
                const normalized = p.number.replace(/\D/g, '');
                if (!normalized) continue;

                if (!phoneMap.has(normalized)) {
                    phoneMap.set(normalized, []);
                }
                phoneMap.get(normalized).push(contact);
            }
        }

        for (const [phone, group] of phoneMap.entries()) {
            if (group.length > 1) {
                duplicates.push({
                    phone,
                    count: group.length,
                    contacts: group.map(c => ({ id: c._id, name: c.name, surname: c.surname }))
                });
            }
        }

        if (duplicates.length > 0) {
            console.log(`Found ${duplicates.length} phone numbers with duplicate contacts:`);
            duplicates.slice(0, 10).forEach(d => {
                console.log(`- Phone: ${d.phone}, Count: ${d.count}`);
                d.contacts.forEach(c => console.log(`  * ${c.name} ${c.surname} (${c.id})`));
            });
            if (duplicates.length > 10) console.log('... and more.');
        } else {
            console.log('No duplicate contacts found based on phone numbers.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Detection failed:', error);
        process.exit(1);
    }
}

detect();
