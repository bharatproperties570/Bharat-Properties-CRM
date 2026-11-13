import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOwnerOutreachPreflight } from '../services/OwnerOutreachPreflight.js';

const valid = {
    channel: 'whatsapp',
    providerAccount: { connected: true, authorized: true, channel: 'whatsapp' },
    consent: { explicit: true, current: true, optedOut: false },
    priorDeliveryState: 'FAILED_CONFIRMED',
    periodAlreadyReserved: false,
    globalReservedCount: 2,
    globalDailyCap: 100,
    channelReservedCount: 1,
    channelDailyCap: 50
};

test('preflight allows only a currently consented endpoint with a matching authorized account and budget', () => {
    assert.deepEqual(evaluateOwnerOutreachPreflight(valid), { allowed: true, code: 'PREFLIGHT_ALLOWED' });
});

test('preflight fails closed for provider, consent, opt-out and ambiguous delivery', () => {
    for (const patch of [
        { providerAccount: { connected: false, authorized: true, channel: 'whatsapp' } },
        { providerAccount: { connected: true, authorized: false, channel: 'whatsapp' } },
        { consent: { explicit: false, current: true, optedOut: false } },
        { consent: { explicit: true, current: false, optedOut: false } },
        { consent: { explicit: true, current: true, optedOut: true } },
        { priorDeliveryState: 'DELIVERY_UNKNOWN' },
        { periodAlreadyReserved: true }
    ]) assert.equal(evaluateOwnerOutreachPreflight({ ...valid, ...patch }).allowed, false);
});

test('preflight enforces global and per-channel daily caps', () => {
    assert.equal(evaluateOwnerOutreachPreflight({ ...valid, globalReservedCount: 100 }).code, 'GLOBAL_DAILY_CAP_REACHED');
    assert.equal(evaluateOwnerOutreachPreflight({ ...valid, channelReservedCount: 50 }).code, 'CHANNEL_DAILY_CAP_REACHED');
    assert.equal(evaluateOwnerOutreachPreflight({ ...valid, globalDailyCap: 0 }).code, 'GLOBAL_BUDGET_UNAVAILABLE');
});
