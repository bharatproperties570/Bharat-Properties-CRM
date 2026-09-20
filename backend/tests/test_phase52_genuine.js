import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';

let replSet;

async function run() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();
    await mongoose.connect(uri, { autoIndex: false }); // Disable autoIndex to prevent lock timeout!
    
    const Lead = (await import('../models/Lead.js')).default;
    const Contact = (await import('../models/Contact.js')).default;
    const Lookup = (await import('../models/Lookup.js')).default;

    await Lead.createCollection();
    await Contact.createCollection();
    await Lookup.createCollection();

    console.log("Connected to MongoMemoryReplSet (autoIndex disabled)");

    const { createStandardizedLead } = await import('../services/LeadCreationEngine.js');

    const source = await Lookup.create({ lookup_type: 'Source', lookup_value: 'Website', isActive: true });
    
    const result = await createStandardizedLead({
        firstName: 'Integration',
        lastName: 'Test',
        mobile: '1234567890',
        email: 'integration@test.com',
        source: source._id
    }, { triggerEvent: 'onWebCapture' });

    assert.ok(result.success, "Result must be success");
    assert.ok(result.lead._id, "Lead must be created");
    assert.ok(result.contact._id, "Contact must be created");
    
    const savedLead = await Lead.findById(result.lead._id);
    console.log("Entire savedLead:", savedLead);
    assert.strictEqual(savedLead.mobile, '1234567890');
    assert.strictEqual(String(savedLead.contactDetails), String(result.contact._id));

    const result2 = await createStandardizedLead({
        firstName: 'Integration2',
        lastName: 'Test2',
        mobile: '1234567890'
    }, { triggerEvent: 'onWebCapture' });

    assert.ok(result2.success);
    assert.strictEqual(String(result2.contact._id), String(result.contact._id), "Must link to same Contact ID");

    const count = await Lead.countDocuments();
    assert.strictEqual(count, 2, "Should have 2 leads");
    const contactCount = await Contact.countDocuments();
    assert.strictEqual(contactCount, 1, "Should only have 1 deduplicated Contact");

    let rollbackThrew = false;
    try {
        await createStandardizedLead({
            mobile: null,
            email: null // This makes Identity Service explicitly throw (no mobile/email)
        }, { triggerEvent: 'onWebCapture' });
    } catch(err) {
        rollbackThrew = true;
    }
    assert.ok(rollbackThrew, "Transaction should throw error on invalid data");
    
    const countAfterRollback = await Lead.countDocuments();
    assert.strictEqual(countAfterRollback, 2, "Lead should NOT be created if transaction fails");

    console.log("✅ All Phase 5.2 Genuine Integration Tests Passed!");
    
    await mongoose.disconnect();
    await replSet.stop();
}

run().catch(async (err) => {
    console.error(err);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    process.exit(1);
});
