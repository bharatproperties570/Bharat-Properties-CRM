import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import { resolveHierarchicalAddress } from './utils/lookupResolver.js';

async function runMigration() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("MongoDB Connected.");

    // 1. First, correct the tehsils in the Lookup collection that have None/Null parents
    // Thanesar Tehsil -> Kurukshetra City parent
    const kurukshetraCity = await Lookup.findOne({ lookup_type: 'City', lookup_value: /kurukshetra/i });
    if (kurukshetraCity) {
        const result = await Lookup.updateMany(
            { lookup_type: 'Tehsil', lookup_value: /thanesar/i, parent_lookup_id: null },
            { $set: { parent_lookup_id: kurukshetraCity._id, parent_lookup_value: kurukshetraCity.lookup_value } }
        );
        console.log(`[LOOKUP CLEANUP] Linked ${result.modifiedCount} Thanesar tehsils to Kurukshetra City.`);
    }

    // Panchkula/Pachkula Tehsil -> Panchkula City parent
    const panchkulaCity = await Lookup.findOne({ lookup_type: 'City', lookup_value: /panchkula/i });
    if (panchkulaCity) {
        const result = await Lookup.updateMany(
            { lookup_type: 'Tehsil', lookup_value: /pa[n]?chkula/i, parent_lookup_id: null },
            { $set: { parent_lookup_id: panchkulaCity._id, parent_lookup_value: panchkulaCity.lookup_value } }
        );
        console.log(`[LOOKUP CLEANUP] Linked ${result.modifiedCount} Panchkula tehsils to Panchkula City.`);
    }

    // 2. Fetch all contacts
    const contacts = await Contact.find({
        $or: [
            { "personalAddress": { $ne: null } },
            { "correspondenceAddress": { $ne: null } }
        ]
    });

    console.log(`Found ${contacts.length} contacts with address fields to verify/repair.`);

    let repairedCount = 0;

    for (const contact of contacts) {
        let modified = false;

        const addrFields = ['personalAddress', 'correspondenceAddress'];
        for (const field of addrFields) {
            const addr = contact[field];
            if (addr) {
                // Handle camelCase pinCode mapping to pincode
                if (addr.pinCode && !addr.pincode) {
                    addr.pincode = addr.pinCode;
                    modified = true;
                }

                // If any address field is a plain string, re-resolve using the hierarchical resolver
                const needsResolve = 
                    (addr.country && typeof addr.country === 'string' && !mongoose.Types.ObjectId.isValid(addr.country)) ||
                    (addr.state && typeof addr.state === 'string' && !mongoose.Types.ObjectId.isValid(addr.state)) ||
                    (addr.city && typeof addr.city === 'string' && !mongoose.Types.ObjectId.isValid(addr.city)) ||
                    (addr.tehsil && typeof addr.tehsil === 'string' && !mongoose.Types.ObjectId.isValid(addr.tehsil)) ||
                    (addr.pincode && typeof addr.pincode === 'string' && !mongoose.Types.ObjectId.isValid(addr.pincode)) ||
                    (addr.postOffice && typeof addr.postOffice === 'string' && !mongoose.Types.ObjectId.isValid(addr.postOffice));

                if (needsResolve) {
                    console.log(`[RESOLVING STRING ADDRESS] Contact: ${contact.name}`);
                    console.log(`  Before:`, JSON.stringify(addr));

                    try {
                        const resolvedAddr = await resolveHierarchicalAddress({
                            hNo: addr.hNo,
                            street: addr.street,
                            area: addr.area,
                            city: addr.city,
                            state: addr.state,
                            country: addr.country,
                            tehsil: addr.tehsil,
                            postOffice: addr.postOffice,
                            pincode: addr.pincode
                        });

                        // Keep camelCase pinCode in sync for backward compatibility if needed, or remove it
                        contact[field] = resolvedAddr;
                        modified = true;
                        console.log(`  ✅ Resolved Address:`, JSON.stringify(resolvedAddr));
                    } catch (err) {
                        console.error(`  ❌ Error resolving address for ${contact.name}:`, err.message);
                    }
                }
            }
        }

        if (modified) {
            contact.markModified('personalAddress');
            contact.markModified('correspondenceAddress');
            await contact.save();
            repairedCount++;
            console.log("-".repeat(50));
        }
    }

    console.log(`\nGeographical Contact Address Resolution Completed.`);
    console.log(`Total Contacts Repaired: ${repairedCount}`);

    mongoose.connection.close();
    console.log("Database Connection Closed.");
}

runMigration().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
