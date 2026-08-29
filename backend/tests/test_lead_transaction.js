import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.staging')));
for (const k in envConfig) process.env[k] = envConfig[k];

import { convertLeadToContact } from '../controllers/lead.controller.js';
import Lead from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Activity from '../models/Activity.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
};

async function runTests() {
    const testSessionIds = {
        leads: [],
        contacts: [],
        activities: []
    };
    console.log("Connecting to Database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");
    console.log("MongoDB Database Name:", mongoose.connection.db.databaseName);

    // Setup: Create a lead with an activity
    const lead = await Lead.create({
        firstName: 'Transaction',
        lastName: 'Test Lead',
        mobile: '8888888888',
        stage: new mongoose.Types.ObjectId(),
        status: new mongoose.Types.ObjectId()
    });

    const act1 = await Activity.create({
        entityId: lead._id,
        entityType: 'Lead',
        subject: 'Test Activity 1',
        activityType: 'Call',
        dueDate: new Date()
    });

    const act2 = await Activity.create({
        entityId: new mongoose.Types.ObjectId(),
        entityType: 'Deal',
        subject: 'Test Activity 2',
        activityType: 'Meeting',
        dueDate: new Date(),
        relatedTo: [{ id: lead._id.toString(), type: 'Lead', model: 'Lead' }]
    });

    testSessionIds.leads.push(lead._id);
    testSessionIds.activities.push(act1._id, act2._id);
    console.log(`Created Lead: ${lead._id}`);

    try {
        console.log("\n==================================================");
        console.log("TEST B: SIMULATE FAILURE IN CONTACT CREATION");

        const originalContactSave = Contact.prototype.save;
        Contact.prototype.save = async function() { throw new Error("MOCKED_CONTACT_FAILURE"); };

        const reqB = { params: { id: lead._id } };
        const resB = mockRes();
        const nextB = (err) => { resB.error = err; };

        await convertLeadToContact(reqB, resB, nextB);
        
        if (!resB.error || !resB.error.message.includes('MOCKED_CONTACT_FAILURE')) {
            throw new Error("Did not return expected contact failure.");
        }

        const checkLeadB = await Lead.findById(lead._id);
        if (checkLeadB.isConverted) throw new Error("Lead was converted despite Contact failure!");
        console.log("✅ TEST B PASSED: Rolled back on Contact failure.");

        Contact.prototype.save = originalContactSave;

        console.log("\n==================================================");
        console.log("TEST D: SIMULATE FAILURE IN ACTIVITY UPDATE");

        const originalActUpdate = Activity.updateMany;
        Activity.updateMany = async function() { throw new Error("MOCKED_ACTIVITY_FAILURE"); };

        const reqD = { params: { id: lead._id } };
        const resD = mockRes();
        const nextD = (err) => { resD.error = err; };

        await convertLeadToContact(reqD, resD, nextD);

        if (!resD.error || !resD.error.message.includes('MOCKED_ACTIVITY_FAILURE')) {
            throw new Error("Did not return expected activity failure.");
        }

        const checkLeadD = await Lead.findById(lead._id);
        if (checkLeadD.isConverted) throw new Error("Lead was converted despite Activity failure!");
        
        const checkContactD = await Contact.findOne({ name: 'Transaction Test Lead' });
        if (checkContactD) throw new Error("Contact persisted despite Activity failure!");
        console.log("✅ TEST D PASSED: Rolled back on Activity failure.");

        Activity.updateMany = originalActUpdate;

        console.log("\n==================================================");
        console.log("TEST E: EXPLICIT TRANSACTION ABORT");
        
        let abortContactId;
        try {
            await withMongoTransaction(async (session) => {
                const c = new Contact({ name: 'Abort Contact', phones: [{ number: '7777777777', isPrimary: true }] });
                await c.save({ session });
                abortContactId = c._id;
                
                await Lead.findByIdAndUpdate(lead._id, { $set: { isConverted: true } }, { session });
                
                throw new Error("TEST_TRANSACTION_ABORT");
            });
        } catch (e) {
            console.log("Caught expected abort:", e.message);
        }

        const checkAbortLead = await Lead.findById(lead._id);
        const checkAbortContact = await Contact.findById(abortContactId);
        
        if (checkAbortLead.isConverted) throw new Error("Lead persisted after abort!");
        if (checkAbortContact) throw new Error("Contact persisted after abort!");
        console.log("✅ TEST E PASSED: Rollback verified.");

        console.log("\n==================================================");
        console.log("TEST A & F: FULL SUCCESS & API COMPATIBILITY");

        const reqSuccess = { params: { id: lead._id } };
        const resSuccess = mockRes();
        const nextSuccess = (err) => { throw err; };

        await convertLeadToContact(reqSuccess, resSuccess, nextSuccess);

        if (resSuccess.statusCode !== 200 || !resSuccess.body.success) {
            throw new Error("Controller did not return 200 Success.");
        }
        console.log("✅ TEST F PASSED: API Format Maintained.");

        const checkSuccessLead = await Lead.findById(lead._id);
        if (!checkSuccessLead.isConverted) throw new Error("Lead was not marked converted.");
        
        const contactId = checkSuccessLead.contactDetails;
        if (contactId) testSessionIds.contacts.push(contactId);
        if (!contactId) throw new Error("Lead lacks contactDetails ID.");

        const checkSuccessContact = await Contact.findById(contactId);
        if (!checkSuccessContact) throw new Error("Contact was not found in DB.");

        const checkAct1 = await Activity.findById(act1._id);
        if (checkAct1.entityType !== 'Contact' || checkAct1.entityId.toString() !== contactId.toString()) {
            throw new Error("Activity 1 was not successfully transferred.");
        }

        const checkAct2 = await Activity.findById(act2._id);
        const relatedElem = checkAct2.relatedTo.find(r => r.id === contactId.toString());
        if (!relatedElem || relatedElem.model !== 'Contact') {
            throw new Error("Activity 2 relatedTo was not successfully updated.");
        }

        console.log("✅ TEST A PASSED: All records committed atomically and relationships transferred.");

        console.log("\n==================================================");
        console.log("TEST G: CONCURRENCY RACE CONDITION");
        
        // Create a new lead specifically for concurrency testing
        const concurrencyLead = await Lead.create({
            firstName: 'Concurrency',
            lastName: 'Race Lead',
            mobile: '9999999999',
            stage: new mongoose.Types.ObjectId(),
            status: new mongoose.Types.ObjectId()
        });
        
        const reqC1 = { params: { id: concurrencyLead._id } };
        const resC1 = mockRes();
        const nextC1 = (err) => { resC1.error = err; };
        
        const reqC2 = { params: { id: concurrencyLead._id } };
        const resC2 = mockRes();
        const nextC2 = (err) => { resC2.error = err; };

        console.log("Firing two conversion requests simultaneously...");
        await Promise.all([
            convertLeadToContact(reqC1, resC1, nextC1),
            convertLeadToContact(reqC2, resC2, nextC2)
        ]);

        const statuses = [resC1.statusCode, resC2.statusCode];
        if (!statuses.includes(200) || !statuses.includes(409)) {
            throw new Error("Concurrency test failed: Expected one 200 and one 409, got: " + statuses.join(', '));
        }

        const contactCount = await Contact.countDocuments({ name: 'Concurrency Race Lead' });
        if (contactCount !== 1) {
            throw new Error("Concurrency test failed: Expected exactly 1 contact created, got " + contactCount);
        }

        console.log("✅ TEST G PASSED: Race condition prevented securely via MongoDB atomic predicate.");
        
        testSessionIds.leads.push(concurrencyLead._id);
        if (resC1.body && resC1.body.contact) testSessionIds.contacts.push(resC1.body.contact._id);
        if (resC2.body && resC2.body.contact) testSessionIds.contacts.push(resC2.body.contact._id);


    } finally {
        if (testSessionIds.leads.length > 0) await Lead.deleteMany({ _id: { $in: testSessionIds.leads } });
        if (testSessionIds.contacts.length > 0) await Contact.deleteMany({ _id: { $in: testSessionIds.contacts } });
        if (testSessionIds.activities.length > 0) await Activity.deleteMany({ _id: { $in: testSessionIds.activities } });
        await mongoose.connection.close();
        console.log("\nCleaned up test data and closed connection.");
        
    }
}

runTests().catch(e => {
    console.error("TEST SUITE FAILED:", e);
    process.exit(1);
});
