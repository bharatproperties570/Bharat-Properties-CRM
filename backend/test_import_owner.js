import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import { bulkUpdatePropertyOwners } from './controllers/inventory.controller.js';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function runTest() {
    await mongoose.connect(MONGODB_URI);

    const mockUserId = new mongoose.Types.ObjectId();

    // 1. Create a dummy contact (old owner)
    const oldOwner = await Contact.create({
        name: "Old Owner Test",
        phones: [{ number: "9999999999", type: "Personal" }]
    });

    // 2. Create a dummy inventory assigned to this old owner
    const inv = await Inventory.create({
        projectName: "Test Project",
        block: "A",
        unitNo: "101",
        owners: [oldOwner._id]
    });
    console.log(`Created Inventory ${inv._id} with old owner ${oldOwner._id}`);

    // 3. First, call bulkUpdatePropertyOwners to simulate the preview step
    const req1 = {
        body: {
            data: [
                {
                    projectName: "Test Project",
                    project: "Test Project",
                    block: "A",
                    sector: "A",
                    unitNo: "101",
                    ownerName: "New Owner Test",
                    mobile: "8888888888"
                }
            ],
            dryRun: true,
            resolutions: {}
        },
        user: { _id: mockUserId }
    };
    let conflicts = [];
    let rowKey = "row_0";
    const res1 = {
        status: (code) => ({
            json: (data) => {
                if (data.results && data.results.conflicts) {
                    conflicts = data.results.conflicts;
                    if (conflicts.length > 0) rowKey = conflicts[0].rowKey;
                }
            }
        })
    };
    await bulkUpdatePropertyOwners(req1, res1);
    console.log("Conflicts found:", conflicts.length, conflicts);

    // 4. Now, call bulkUpdatePropertyOwners with dryRun: false and resolution: REPLACE_OWNER
    const req2 = {
        body: {
            data: [
                {
                    projectName: "Test Project",
                    project: "Test Project",
                    block: "A",
                    sector: "A",
                    unitNo: "101",
                    ownerName: "New Owner Test",
                    mobile: "8888888888"
                }
            ],
            dryRun: false,
            resolutions: {
                [rowKey]: { ownership: "REPLACE_OWNER" }
            }
        },
        user: { _id: mockUserId }
    };
    const res2 = {
        status: (code) => ({
            json: (data) => console.log(`Sync Response [${code}]:`, data.success ? "Success" : data.error)
        })
    };
    await bulkUpdatePropertyOwners(req2, res2);

    // 5. Verify the inventory after import
    const updatedInv = await Inventory.findById(inv._id).populate('owners');
    console.log("Updated Owners array:", updatedInv.owners.map(o => o.name));
    console.log("Owner History length:", updatedInv.ownerHistory.length);
    if (updatedInv.ownerHistory.length > 0) {
        console.log("Owner History entry type:", updatedInv.ownerHistory[0].type);
        console.log("Owner History contactId:", updatedInv.ownerHistory[0].contactId);
    }

    // 6. Verify tags on old contact
    const updatedOldOwner = await Contact.findById(oldOwner._id);
    console.log("Old Owner Tags:", updatedOldOwner.tags);

    // Cleanup
    await Inventory.findByIdAndDelete(inv._id);
    await Contact.findByIdAndDelete(oldOwner._id);
    await Contact.findOneAndDelete({ name: "New Owner Test" });
    
    mongoose.connection.close();
}

runTest();
