import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Booking from '../models/Booking.js';
import Lookup from '../models/Lookup.js';
import Contact from '../models/Contact.js';
import { createBooking } from '../controllers/booking.controller.js';
import { updateInventory } from '../controllers/inventory.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' });
    const bookedLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Booked' });

    const inv = await Inventory.create({
        projectName: 'Concurrency Test Project',
        unitNo: 'CONC-UPDATE-1',
        status: availableLookup._id,
        price: { value: 1000000, currency: 'INR' }
    });
    
    const deal = await Deal.create({
        projectName: inv.projectName,
        unitNo: inv.unitNo,
        inventoryId: inv._id,
        stage: 'Open'
    });

    const createMockRes = () => ({
        statusCode: 200, data: null,
        status: function(c) { this.statusCode = c; return this; },
        json: function(d) { this.data = d; return this; }
    });

    let resA = createMockRes();
    let reqA = {
        body: { property: inv._id.toString(), dealId: deal._id.toString(), lead: new mongoose.Types.ObjectId().toString(), seller: new mongoose.Types.ObjectId().toString(), tokenAmount: 1000, totalDealAmount: 1000000, applicationNo: 'APP-TEST' },
        user: { id: new mongoose.Types.ObjectId().toString(), role: 'admin' }
    };

    let resB = createMockRes();
    let reqB = {
        params: { id: inv._id.toString() },
        body: { status: availableLookup._id.toString(), title: 'Edited Title' },
        user: { _id: new mongoose.Types.ObjectId().toString(), role: 'admin' }
    };

    // Make updateInventory yield execution exactly when it has fetched currentInv
    // This simulates the race condition where the admin form loads, then a booking happens, then the form submits
    // In our test, they happen concurrently. But we want to simulate the gap.
    // However, our patch prevents the race because it uses filter.status = currentInv.status
    // Let's just run them with a delay inside updateInventory? 
    // We can simulate it by hacking the Inventory.findById call in updateInventory to sleep for 500ms
    const origFindById = Inventory.findById;
    Inventory.findById = function() {
        const query = origFindById.apply(this, arguments);
        const origExec = query.exec;
        query.exec = async function() {
            const doc = await origExec.apply(this, arguments);
            // sleep 1s to ensure Booking finishes
            await new Promise(r => setTimeout(r, 1000));
            return doc;
        };
        return query;
    };

    try {
        console.log("Starting concurrent Booking and Inventory Update...");
        await Promise.all([
            createBooking(reqA, resA), // Booking takes < 500ms
            updateInventory(reqB, resB) // Inventory takes > 1000ms
        ]);
        
        console.log(`Booking Status: ${resA.statusCode}, Update Status: ${resB.statusCode}`);
        if (resA.statusCode !== 201) throw new Error("Booking failed");
        if (resB.statusCode !== 409) throw new Error("Update did not fail with 409 Conflict!");

        const finalInv = await Inventory.findById(inv._id).lean();
        if (finalInv.status.toString() !== bookedLookup._id.toString()) {
            throw new Error("Final inventory status is not Booked!");
        }

        console.log("✅ TEST A: Admin inventory update correctly blocked by 409 Conflict when status changed underneath it!");

    } finally {
        Inventory.findById = origFindById;
        await Booking.deleteMany({ property: inv._id });
        await Deal.deleteOne({ _id: deal._id });
        await Inventory.deleteOne({ _id: inv._id });
        await mongoose.disconnect();
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});
