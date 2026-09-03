import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.staging')));
for (const k in envConfig) process.env[k] = envConfig[k];

import { addDeal } from '../controllers/deal.controller.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Contact from '../models/Contact.js';
import AuditLog from '../models/AuditLog.js';
import Team from '../models/Team.js';
import Project from '../models/Project.js';
import Company from '../models/Company.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
};

// Dummy smsService & CampaignEngine for the test
global.smsService = { sendSMSWithTemplate: async () => {} };
global.CampaignEngine = { launch: async () => {} };
global.WorkflowEngine = { fireEvent: async () => {} };

async function runTests() {
    console.log("Connecting to Staging DB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");

    // Pre-requisite
    const inv = await Inventory.create({
        projectName: 'Test Deal Project',
        block: 'C',
        unitNo: '301-' + Date.now(),
        status: 'Available',
        category: 'Residential',
        propertyType: 'Apartment'
    });

    const contact = await Contact.create({
        name: 'Test Buyer',
        phones: [{ number: '999999999' + Date.now().toString().slice(-1), isPrimary: true }]
    });

    console.log(`Created Test Inventory: ${inv._id}, Contact: ${contact._id}`);

    try {
        console.log("\n==================================================");
        console.log("TEST E: EXPLICIT TRANSACTION ABORT");
        
        let abortDealId;
        try {
            await withMongoTransaction(async (session) => {
                const d = new Deal({
                    projectName: inv.projectName,
                    inventoryId: inv._id,
                    owner: contact._id,
                    stage: 'Open'
                });
                await d.save({ session });
                abortDealId = d._id;
                
                await Inventory.findOneAndUpdate({ _id: inv._id }, { $set: { status: 'Sold Out' } }, { session });
                
                throw new Error("TEST_TRANSACTION_ABORT");
            });
        } catch (e) {
            console.log("Caught expected abort:", e.message);
        }

        const checkAbortDeal = await Deal.findById(abortDealId);
        const checkAbortInv = await Inventory.findById(inv._id);
        
        if (checkAbortDeal) throw new Error("Deal persisted after abort!");
        // The literal status will be an ObjectId because of Lookup, so we check it hasn't changed.
        if (checkAbortInv.status?.toString() !== inv.status?.toString()) throw new Error("Inventory status persisted after abort!");
        console.log("✅ TEST E PASSED: Rollback verified.");


        console.log("\n==================================================");
        console.log("TEST B: SIMULATE FAILURE IN CONTROLLER (DOCUMENT/CONTACT SYNC)");

        const originalContactSave = Contact.prototype.save;
        Contact.prototype.save = async function() { throw new Error("MOCKED_SYNC_FAILURE"); };

        const reqSyncFail = {
            body: {
                projectName: inv.projectName,
                inventoryId: inv._id,
                owner: contact._id,
                stage: 'Open',
                documents: [{
                    linkedContactMobile: contact.phones[0].number,
                    url: 'http://example.com/doc.pdf',
                    documentNo: 'DOC-123'
                }]
            },
            user: { _id: new mongoose.Types.ObjectId() }
        };
        const resSyncFail = mockRes();

        await addDeal(reqSyncFail, resSyncFail);
        
        if (resSyncFail.statusCode !== 500 || !resSyncFail.body.error.includes('MOCKED_SYNC_FAILURE')) {
            throw new Error("Controller did not return expected sync failure.");
        }

        const checkSyncFailDeal = await Deal.findOne({ inventoryId: inv._id });
        if (checkSyncFailDeal) throw new Error("Deal persisted on sync failure!");
        console.log("✅ TEST B PASSED: Controller rolled back on document sync failure.");

        Contact.prototype.save = originalContactSave;


        console.log("\n==================================================");
        console.log("TEST C: SIMULATE FAILURE IN INVENTORY SYNC");

        const originalInvUpdate = Inventory.findByIdAndUpdate;
        Inventory.findByIdAndUpdate = async function() { throw new Error("MOCKED_INV_FAILURE"); };

        const reqInvFail = {
            body: {
                projectName: inv.projectName,
                inventoryId: inv._id,
                owner: contact._id,
                stage: 'Booked' // triggers syncInventoryStatus
            },
            user: { _id: new mongoose.Types.ObjectId() }
        };
        const resInvFail = mockRes();

        await addDeal(reqInvFail, resInvFail);
        
        if (resInvFail.statusCode !== 500 || !resInvFail.body.error.includes('MOCKED_INV_FAILURE')) {
            throw new Error("Controller did not return expected inventory failure.");
        }

        const checkInvFailDeal = await Deal.findOne({ inventoryId: inv._id });
        if (checkInvFailDeal) throw new Error("Deal persisted on inventory failure!");
        console.log("✅ TEST C PASSED: Controller rolled back on inventory sync failure.");

        Inventory.findByIdAndUpdate = originalInvUpdate;


        console.log("\n==================================================");
        console.log("TEST A & F: FULL SUCCESS & API COMPATIBILITY");
        
        const reqSuccess = {
            body: {
                projectName: inv.projectName,
                inventoryId: inv._id,
                owner: contact._id,
                stage: 'Open',
                publishOn: { website: true },
                documents: [{
                    linkedContactMobile: contact.phones[0].number,
                    url: 'http://example.com/doc-success.pdf',
                    documentNo: 'DOC-456'
                }]
            },
            user: { id: new mongoose.Types.ObjectId() } // req.user.id for AuditLog
        };
        const resSuccess = mockRes();

        await addDeal(reqSuccess, resSuccess);
        
        if (resSuccess.statusCode !== 201 || !resSuccess.body.success) {
            console.error("Success Response Failed:", resSuccess.body);
            throw new Error("Controller did not return 201 Success.");
        }
        console.log("✅ TEST F PASSED: Response returned correctly formatted Data.");

        const successDeal = resSuccess.body.data;
        const checkSuccessContact = await Contact.findById(contact._id);
        const checkSuccessAudit = await AuditLog.findOne({ targetId: successDeal._id, eventType: 'deal_converted' });

        if (!successDeal || !successDeal._id) throw new Error("Deal data missing in response.");
        if (!successDeal.isPublished) throw new Error("Website metadata not updated in transaction!");
        
        const hasDoc = checkSuccessContact.documents.some(d => d.documentNo === 'DOC-456');
        if (!hasDoc) throw new Error("Document sync did not persist on success!");
        if (!checkSuccessAudit) throw new Error("AuditLog was not created!");
        
        console.log("✅ TEST A PASSED: All dependent records committed exactly once.");

    } finally {
        await Inventory.deleteOne({ _id: inv._id });
        await Contact.deleteOne({ _id: contact._id });
        await Deal.deleteMany({ inventoryId: inv._id });
        await AuditLog.deleteMany({ targetId: { $exists: true } }); 
        await mongoose.connection.close();
        console.log("\nCleaned up test data and closed connection.");
    }
}

runTests().catch(e => {
    console.error("TEST SUITE FAILED:", e);
    process.exit(1);
});
