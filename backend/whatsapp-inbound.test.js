import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { mock } from 'node:test';
import {
    buildFlowSummary,
    extractWhatsAppChanges,
    isValidMetaSignature,
    isValidVerifyToken,
    normalizeTextMessage
} from './utils/whatsappWebhook.utils.js';

import { reserveInboundMessage } from './controllers/webhook.controller.js';
import Conversation from './models/Conversation.js';

test('1, 2, 3: raw Meta HMAC accepts exact bytes and rejects modified or missing signatures', () => {
    const secret = 'test-app-secret';
    const raw = Buffer.from('{\n  "object":"whatsapp_business_account"\n}');
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
    assert.equal(isValidMetaSignature(raw, signature, secret), true);
    assert.equal(isValidMetaSignature(Buffer.from(JSON.stringify(JSON.parse(raw))), signature, secret), false);
    assert.equal(isValidMetaSignature(raw, '', secret), false);
});

test('4, 5, 6, 7: all Meta entries, changes, messages, and statuses are retained for processing', () => {
    const payload = {
        object: 'whatsapp_business_account',
        entry: [
            { changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.1' }, { id: 'wamid.2' }], statuses: [{ id: 'wamid.out.1' }] } }] },
            { changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.3' }], statuses: [{ id: 'wamid.out.2' }, { id: 'wamid.out.3' }] } }, { field: 'other', value: {} }] }
        ]
    };
    const changes = extractWhatsAppChanges(payload);
    assert.equal(changes.length, 2);
    assert.deepEqual(changes.flatMap(change => change.messages.map(message => message.id)), ['wamid.1', 'wamid.2', 'wamid.3']);
    assert.deepEqual(changes.flatMap(change => change.statuses.map(status => status.id)), ['wamid.out.1', 'wamid.out.2', 'wamid.out.3']);
});

test('11, 12, 13, 14: normalizes text, media, button/list, and Flow without losing content', () => {
    assert.equal(normalizeTextMessage({ type: 'text', text: { body: 'Hello' } }).text, 'Hello');
    assert.equal(normalizeTextMessage({ type: 'button', button: { text: 'Yes' } }).text, 'Yes');
    assert.equal(normalizeTextMessage({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { title: 'Book visit' } } }).text, 'Book visit');
    const flow = normalizeTextMessage({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify({ interested: 'ready_to_sell', message: 'Call me' }) } } });
    assert.match(flow.text, /ready_to_sell/);
    assert.equal(flow.flowResponse.message, 'Call me');
});

test('15, 16: unsupported or extra media types fallback text logic', () => {
    // Tests for location and contacts fall to the controller's normalizeInboundMessage
    // This just verifies the text extractor safely ignores them
    assert.equal(normalizeTextMessage({ type: 'location', location: {} }).text, '');
    assert.equal(normalizeTextMessage({ type: 'contacts', contacts: [] }).text, '');
});

test('8, 9, 10: reserveInboundMessage handles missing message.id, existing dupes, and new conversations', async () => {
    // Mock 9: missing message.id
    const resMissing = await reserveInboundMessage({ mobile: '123', message: {}, text: 'hi' });
    assert.equal(resMissing.duplicate, false);
    assert.equal(resMissing.conversation, null);

    mock.method(Conversation, 'exists', async (query) => query['messages.metadata.waId'] === 'wamid.exists');

    // Mock 8: duplicate wamid across db
    const resDupe = await reserveInboundMessage({ mobile: '123', message: { id: 'wamid.exists' }, text: 'hi' });
    assert.equal(resDupe.duplicate, true);
    assert.equal(resDupe.conversation, null);

    // Mock 10: concurrent race condition where waId already pushed by another thread in findOneAndUpdate
    mock.method(Conversation, 'findOneAndUpdate', async (query, update, opts) => {
        if (query.phoneNumber === '123') return { _id: 'conv1' }; // Step 1: find active
        if (query._id === 'conv1' && query['messages.metadata.waId']) return null; // Step 2: fails to push because waId exists
    });

    const resRace = await reserveInboundMessage({ mobile: '123', message: { id: 'wamid.race' }, text: 'hi' });
    assert.equal(resRace.duplicate, true);
    assert.equal(resRace.conversation, null);

    // Normal insertion
    mock.method(Conversation, 'findOneAndUpdate', async (query, update, opts) => {
        if (query.phoneNumber === '123') return { _id: 'conv2' };
        if (query._id === 'conv2') return { _id: 'conv2', messages: [] };
    });

    const resOk = await reserveInboundMessage({ mobile: '123', message: { id: 'wamid.new' }, text: 'hi' });
    assert.equal(resOk.duplicate, false);
    assert.equal(resOk.conversation._id, 'conv2');
});
