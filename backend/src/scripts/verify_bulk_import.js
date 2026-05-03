import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from '../../models/Inventory.js';
import Lookup from '../../models/Lookup.js';
import Team from '../../models/Team.js';
import Contact from '../../models/Contact.js';

dotenv.config();

async function verifyBulkImport() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        // 1. Create a test pincode lookup if it doesn't exist
        const testPincode = "122018";
        let lookup = await Lookup.findOne({ lookup_type: 'Pincode', lookup_value: testPincode });
        if (!lookup) {
            lookup = await Lookup.create({ lookup_type: 'Pincode', lookup_value: testPincode });
            console.log("Created test pincode lookup:", lookup._id);
        } else {
            console.log("Found existing pincode lookup:", lookup._id);
        }

        // 2. Simulate a bulk import with a raw pincode string
        const testInventory = {
            projectName: "Bulk Import Test " + Date.now(),
            unitNo: "T1-101",
            address: {
                city: "Gurgaon",
                state: "Haryana",
                pincode: testPincode // String instead of ObjectId
            }
        };

        console.log("Creating inventory with raw pincode string...");
        const doc = await Inventory.create(testInventory);
        
        console.log("Saved Document Pincode (RAW):", doc.address.pincode);
        
        // 3. Fetch from DB to see if it's resolved to ObjectId
        const savedDoc = await Inventory.findById(doc._id).populate('address.pincode');
        console.log("Fetched Document Pincode (Populated):", savedDoc.address.pincode);

        if (savedDoc.address.pincode && savedDoc.address.pincode._id.toString() === lookup._id.toString()) {
            console.log("SUCCESS: Pincode resolved correctly to Lookup ID.");
        } else {
            console.error("FAILURE: Pincode resolution failed.");
            console.log("Expected:", lookup._id);
            console.log("Got:", savedDoc.address.pincode);
        }

        // 4. Cleanup
        await Inventory.deleteOne({ _id: doc._id });
        console.log("Cleanup: Deleted test inventory.");

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyBulkImport();
