import "dotenv/config";
import mongoose from 'mongoose';
import connectDB from "./config/db.js";
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';
import { resolveLookup } from './utils/lookupResolver.js';

async function runMigration() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("MongoDB Connected.");

    // Find all contacts that have both personalAddress.location and personalAddress.area
    const contacts = await Contact.find({
        "personalAddress.location": { $ne: null },
        "personalAddress.area": { $ne: null, $ne: "" }
    }).populate('personalAddress.location');

    console.log(`Found ${contacts.length} contacts to check for location adjustment.`);

    let adjustedCount = 0;

    for (const contact of contacts) {
        const addr = contact.personalAddress;
        if (!addr || !addr.location) continue;

        const locName = addr.location.lookup_value || '';
        const areaName = addr.area || '';

        // If areaName contains "Sector" or "Sec", and location is something else, we swap them
        if (/sector|sec\b/i.test(areaName) && !/sector|sec\b/i.test(locName)) {
            console.log(`[SWAPPING] Contact: ${contact.name}`);
            console.log(`  Current Location (Lookup): "${locName}"`);
            console.log(`  Current Area (Text): "${areaName}"`);

            try {
                // Resolve the Sector as the new Location lookup
                const newLocId = await resolveLookup('Location', areaName, addr.city);
                if (newLocId) {
                    addr.location = newLocId;
                    addr.locality = newLocId;
                    addr.area = locName; // Set the old location name as the new area text
                    
                    contact.markModified('personalAddress');
                    await contact.save();
                    
                    console.log(`  ✅ Swapped successfully! Location is now: "${areaName}", Area is now: "${locName}"`);
                    adjustedCount++;
                }
            } catch (err) {
                console.error(`  ❌ Error processing contact ${contact._id}:`, err.message);
            }
            console.log("-".repeat(50));
        }
    }

    console.log(`\nLocation Adjustment Completed.`);
    console.log(`Total Adjusted: ${adjustedCount}`);
    
    mongoose.connection.close();
    console.log("Database connection closed.");
}

runMigration().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
