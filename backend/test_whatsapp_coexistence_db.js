import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { processMessageEchoes, processAppStateSync, processHistory } from './services/WhatsAppCoexistenceService.js';
import WhatsAppIntegration from './models/WhatsAppIntegration.js';
import Contact from './models/Contact.js';
import Conversation from './models/Conversation.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.vercel' });

async function runTest() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test_crm');
    
    // Clear test data
    await WhatsAppIntegration.deleteMany({ wabaId: 'TEST_WABA_1' });
    await Contact.deleteMany({ 'phones.number': '919999999999' });
    await Conversation.deleteMany({ userId: '919999999999' });

    // Insert dummy integration
    const integration = await WhatsAppIntegration.create({
        wabaId: 'TEST_WABA_1',
        phoneNumberId: 'TEST_PHONE_1',
        connectionType: 'COEXISTENCE',
        onboardingStatus: 'CONNECTED',
        status: 'ACTIVE'
    });

    // Test Echoes
    const echoes = [{
        id: "wamid.echo.123",
        from: "TEST_PHONE_1",
        to: "919999999999",
        timestamp: "1725510000",
        type: "text",
        text: { body: "Hello Customer" }
    }];

    await processMessageEchoes(echoes, "TEST_PHONE_1", "TEST_WABA_1");

    let contact = await Contact.findOne({ 'phones.number': '919999999999' });
    assert.ok(contact, 'Contact should be created by echo');
    
    let conv = await Conversation.findOne({ userId: '919999999999' });
    assert.ok(conv, 'Conversation should be created by echo');
    assert.equal(conv.messages.length, 1);
    assert.equal(conv.messages[0].role, 'assistant', 'Echoes must be assistant role');
    assert.equal(conv.messages[0].content, 'Hello Customer');
    assert.equal(conv.messages[0].metadata.waId, 'wamid.echo.123');
    
    // Test Idempotency (Duplicate Echo)
    await processMessageEchoes(echoes, "TEST_PHONE_1", "TEST_WABA_1");
    conv = await Conversation.findOne({ userId: '919999999999' });
    assert.equal(conv.messages.length, 1, 'Duplicate echo should be ignored');

    // Test App State Sync (add/edit)
    const stateSync = [{
        action: "edit",
        contact: { phone_number: "919999999999", full_name: "John Doe Updated" }
    }];
    await processAppStateSync(stateSync);
    contact = await Contact.findOne({ 'phones.number': '919999999999' });
    assert.equal(contact.name, 'John Doe Updated', 'Contact name should update on state sync');

    // Test History
    const historyBatches = [{
        messages: [{
            id: "wamid.hist.123",
            from: "TEST_PHONE_1",
            to: "919999999999",
            timestamp: "1725510000",
            type: "text",
            text: { body: "Hello from History Outbound" }
        }, {
            id: "wamid.hist.124",
            from: "919999999999",
            to: "TEST_PHONE_1",
            timestamp: "1725510010",
            type: "text",
            text: { body: "Hello from History Inbound" }
        }]
    }];
    
    await processHistory(historyBatches, "TEST_PHONE_1", "TEST_WABA_1");
    conv = await Conversation.findOne({ userId: '919999999999' });
    assert.equal(conv.messages.length, 3, 'History messages should be appended');
    const histMsg1 = conv.messages.find(m => m.metadata.waId === 'wamid.hist.123');
    assert.equal(histMsg1.role, 'assistant');
    const histMsg2 = conv.messages.find(m => m.metadata.waId === 'wamid.hist.124');
    assert.equal(histMsg2.role, 'user');

    // Test Unknown Integration Resolution
    await processMessageEchoes([{ id: 'fail', to: '919999999999' }], "UNKNOWN_PHONE", "UNKNOWN_WABA");
    conv = await Conversation.findOne({ userId: '919999999999' });
    assert.ok(!conv.messages.find(m => m.metadata.waId === 'fail'), 'Unknown integration should safely ignore processing');

    await mongoose.disconnect();
    console.log("ALL DB TESTS PASSED");
}

runTest().catch(console.error);
