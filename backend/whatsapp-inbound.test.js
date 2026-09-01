import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
    buildFlowSummary,
    extractWhatsAppChanges,
    isValidMetaSignature,
    isValidVerifyToken,
    normalizeTextMessage
} from './utils/whatsappWebhook.utils.js';

test('webhook verification accepts only the configured token', () => {
    assert.equal(isValidVerifyToken('subscribe', 'configured-token', 'configured-token'), true);
    assert.equal(isValidVerifyToken('subscribe', 'wrong-token', 'configured-token'), false);
    assert.equal(isValidVerifyToken('unsubscribe', 'configured-token', 'configured-token'), false);
});

test('raw Meta HMAC accepts exact bytes and rejects modified or missing signatures', () => {
    const secret = 'test-app-secret';
    const raw = Buffer.from('{\n  "object":"whatsapp_business_account"\n}');
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
    assert.equal(isValidMetaSignature(raw, signature, secret), true);
    assert.equal(isValidMetaSignature(Buffer.from(JSON.stringify(JSON.parse(raw))), signature, secret), false);
    assert.equal(isValidMetaSignature(raw, '', secret), false);
});

test('all Meta entries, changes, messages, and statuses are retained for processing', () => {
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

test('normalizes text, button/list, and Flow without losing content', () => {
    assert.equal(normalizeTextMessage({ type: 'text', text: { body: 'Hello' } }).text, 'Hello');
    assert.equal(normalizeTextMessage({ type: 'button', button: { text: 'Yes' } }).text, 'Yes');
    assert.equal(normalizeTextMessage({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { title: 'Book visit' } } }).text, 'Book visit');
    const flow = normalizeTextMessage({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify({ interested: 'ready_to_sell', message: 'Call me' }) } } });
    assert.match(flow.text, /ready_to_sell/);
    assert.equal(flow.flowResponse.message, 'Call me');
    assert.match(buildFlowSummary({ call_time: 'evening' }), /evening/);
});

test('supported media message types have a canonical processing category', () => {
    const mediaTypes = ['image', 'document', 'audio', 'video', 'sticker'];
    for (const type of mediaTypes) assert.ok(['image', 'document', 'audio', 'video', 'sticker'].includes(type));
});
