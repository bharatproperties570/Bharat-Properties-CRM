import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import AddressParsingService from './services/AddressParsingService.js';
import { resolveHierarchicalAddress } from './utils/lookupResolver.js';

async function repairAddresses() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("MongoDB Connected.");

    // 1. Find all contacts where street contains a full address but houseNo is empty
    const contacts = await Contact.find({
        $or: [
            { "personalAddress.hNo": null },
            { "personalAddress.hNo": "" }
        ],
        "personalAddress.street": { $ne: null, $exists: true }
    });

    console.log(`Found ${contacts.length} candidate contacts for address formatting check.`);

    let repairedCount = 0;

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const currentStreet = contact.personalAddress.street;

        // Verify if the street field is actually a full unstructured address
        if (AddressParsingService.shouldParse(currentStreet)) {
            console.log(`[REPAIRING] Contact: ${contact.name} (${contact.phones?.[0]?.number || 'No Mobile'})`);
            console.log(`  Raw Address String: "${currentStreet}"`);

            try {
                // Parse address using Gemini/OpenAI
                const parsed = await AddressParsingService.parseAddress(currentStreet);
                
                // Resolve hierarchical lookup IDs (City, State, Location, Pincode)
                const resolvedAddr = await resolveHierarchicalAddress({
                    hNo: parsed.houseNo,
                    street: parsed.street,
                    area: parsed.area,
                    city: parsed.tehsil,
                    state: parsed.state,
                    country: parsed.country || 'India',
                    pincode: parsed.pincode
                });

                // Update contact address
                contact.personalAddress = resolvedAddr;
                await contact.save();
                
                console.log(`  ✅ Successfully parsed & updated in DB:`, JSON.stringify(parsed));
                repairedCount++;
            } catch (err) {
                console.error(`  ❌ Error repairing contact ${contact._id}:`, err.message);
            }
            console.log("-".repeat(50));
        }
    }

    console.log(`\nAddress Repair Process Completed.`);
    console.log(`Total Contacts Checked: ${contacts.length}`);
    console.log(`Total Addresses Repaired & Saved: ${repairedCount}`);

    mongoose.connection.close();
    console.log("Database Connection Closed.");
}

repairAddresses().catch(err => {
    console.error("Critical failure during address repair:", err);
    process.exit(1);
});
