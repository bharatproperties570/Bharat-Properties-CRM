import test from 'node:test';
import assert from 'node:assert/strict';
import { addCadence, validateCampaignConfig } from '../services/OwnerOutreachService.js';

test('daily and weekly cadence preserve dispatch clock time', () => {
    const start = new Date('2026-11-13T04:30:00.000Z');
    assert.equal(addCadence(start, 'DAILY', 1).toISOString(), '2026-11-14T04:30:00.000Z');
    assert.equal(addCadence(start, 'WEEKLY', 2).toISOString(), '2026-11-27T04:30:00.000Z');
});

test('monthly cadence clamps end-of-month dates without rolling into next month', () => {
    const start = new Date('2026-01-31T04:30:00.000Z');
    assert.equal(addCadence(start, 'MONTHLY', 1).toISOString(), '2026-02-28T04:30:00.000Z');
    assert.equal(addCadence(start, 'MONTHLY', 2).toISOString(), '2026-03-31T04:30:00.000Z');
});

test('yearly cadence clamps leap day safely', () => {
    const start = new Date('2024-02-29T04:30:00.000Z');
    assert.equal(addCadence(start, 'YEARLY', 1).toISOString(), '2025-02-28T04:30:00.000Z');
});

test('end-date scheduling is inclusive and does not create later cadence batches', () => {
    const start = new Date('2026-11-13T04:30:00.000Z');
    const end = new Date('2026-11-14T04:29:59.999Z');
    const planned = [0, 1, 2].map((offset) => addCadence(start, 'DAILY', offset)).filter((date) => date <= end);
    assert.deepEqual(planned.map((date) => date.toISOString()), ['2026-11-13T04:30:00.000Z']);
});


test('Phase 1 rejects fallback and sequence until delivery orchestration is implemented', () => {
    const base = {
        name: 'Owner update',
        messageBody: 'Namaste, property ke baare mein baat karni thi.',
        providerAccountId: '507f1f77bcf86cd799439011',
        frequency: 'DAILY',
        batchSize: 100,
        channels: ['whatsapp'],
        channelStrategy: 'PRIMARY_WITH_FALLBACK',
        startAt: '2026-11-13T04:30:00.000Z'
    };
    assert.throws(() => validateCampaignConfig(base), /Only PRIMARY_ONLY is available in Phase 1/);
    assert.throws(() => validateCampaignConfig({ ...base, channelStrategy: 'SEQUENCE' }), /Only PRIMARY_ONLY is available in Phase 1/);
});

test('Phase 1 validates the server-side dispatch window contract', () => {
    const base = {
        name: 'Owner update',
        messageBody: 'Namaste, property ke baare mein baat karni thi.',
        providerAccountId: '507f1f77bcf86cd799439011',
        frequency: 'DAILY',
        batchSize: 100,
        channels: ['whatsapp'],
        channelStrategy: 'PRIMARY_ONLY',
        startAt: '2026-11-13T04:30:00.000Z'
    };
    assert.doesNotThrow(() => validateCampaignConfig({ ...base, dispatchWindow: { start: '10:00', end: '18:00' } }));
    assert.throws(() => validateCampaignConfig({ ...base, dispatchWindow: { start: '18:00', end: '10:00' } }), /Dispatch window must be valid/);
    assert.throws(() => validateCampaignConfig({ ...base, dispatchWindow: { start: '9am', end: '18:00' } }), /Dispatch window must be valid/);
});


test('Phase 1 rejects SMS, RCS and Email until consent evidence and provider adapters exist', () => {
    const base = {
        name: 'Owner update',
        messageBody: 'Namaste, property ke baare mein baat karni thi.',
        providerAccountId: '507f1f77bcf86cd799439011',
        frequency: 'DAILY',
        batchSize: 100,
        channelStrategy: 'PRIMARY_ONLY',
        startAt: '2026-11-13T04:30:00.000Z'
    };
    for (const channel of ['sms', 'rcs', 'email']) {
        assert.throws(
            () => validateCampaignConfig({ ...base, channels: [channel] }),
            /unavailable in Phase 1/
        );
    }
    assert.doesNotThrow(() => validateCampaignConfig({ ...base, channels: ['whatsapp'] }));
});


test('Phase 1 requires explicit message content and a connected account selection', () => {
    const base = {
        name: 'Owner update',
        messageBody: 'Namaste, property ke baare mein baat karni thi.',
        providerAccountId: '507f1f77bcf86cd799439011',
        frequency: 'DAILY',
        batchSize: 100,
        channels: ['whatsapp'],
        channelStrategy: 'PRIMARY_ONLY',
        startAt: '2026-11-13T04:30:00.000Z'
    };
    assert.doesNotThrow(() => validateCampaignConfig(base));
    assert.throws(() => validateCampaignConfig({ ...base, messageBody: '' }), /WhatsApp message text is required/);
    assert.throws(() => validateCampaignConfig({ ...base, providerAccountId: '' }), /connected WhatsApp account must be selected/);
    assert.throws(() => validateCampaignConfig({ ...base, messageBody: 'x'.repeat(4097) }), /1–4096 characters/);
});
