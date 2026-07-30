import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Import app to register all models
// We can just manually import some likely models
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';
// If there's a PropertyOwner model
try { await import('./models/PropertyOwner.js'); } catch (e) {}
try { await import('./src/modules/contacts/contact.model.js'); } catch (e) {}

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        console.log("Registered Models:", mongoose.modelNames());
        
        // Let's search Inventory generally
        const count = await Inventory.countDocuments({});
        console.log(`Total Inventories in DB: ${count}`);
        
        // Find any inventory mentioning sector 2
        const inventories = await Inventory.find({}).lean();
        const sector2 = inventories.filter(inv => {
            const str = JSON.stringify(inv).toLowerCase();
            return str.includes('sector 2') || str.includes('sector-2') || str.includes('kurukshetra');
        });
        
        console.log(`Found ${sector2.length} inventories mentioning sector 2 or kurukshetra`);
        if (sector2.length > 0) {
            console.log("Sample ID:", sector2[0]._id);
            console.log("Owner info:", sector2[0].ownerInfo || sector2[0].propertyOwner || sector2[0].owner);
            console.log("Location info:", sector2[0].location || sector2[0].address);
        }
        
        // Check Contacts
        const ContactModel = mongoose.models.Contact || mongoose.models.Contacts;
        if (ContactModel) {
            const contacts = await ContactModel.find({}).lean();
            const sector2Contacts = contacts.filter(c => {
                const str = JSON.stringify(c).toLowerCase();
                return str.includes('sector 2') || str.includes('kurukshetra');
            });
            console.log(`Found ${sector2Contacts.length} contacts mentioning sector 2 or kurukshetra`);
            if (sector2Contacts.length > 0) {
                 console.log("Sample contact owner fields:", Object.keys(sector2Contacts[0]));
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
