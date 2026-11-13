import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_OUTREACH_BATCH_LEASE_MS, OWNER_OUTREACH_MAX_CLAIM_SCAN, isWithinDispatchWindow } from '../services/OwnerOutreachScheduler.js';

test('owner outreach scheduler uses bounded leases and bounded campaign scans', () => {
    assert.equal(OWNER_OUTREACH_BATCH_LEASE_MS, 60_000);
    assert.equal(OWNER_OUTREACH_MAX_CLAIM_SCAN, 25);
    assert.ok(OWNER_OUTREACH_BATCH_LEASE_MS >= 5_000);
    assert.ok(OWNER_OUTREACH_BATCH_LEASE_MS <= 10 * 60_000);
});

test('scheduler scan bound remains finite for stale lease recovery scans', () => {
    assert.ok(Number.isInteger(OWNER_OUTREACH_MAX_CLAIM_SCAN));
    assert.ok(OWNER_OUTREACH_MAX_CLAIM_SCAN > 0);
    assert.ok(OWNER_OUTREACH_MAX_CLAIM_SCAN <= 100);
});


test('dispatch window is evaluated in the campaign timezone with an exclusive end', () => {
    const window = { start: '10:00', end: '18:00' };
    assert.equal(isWithinDispatchWindow(new Date('2026-11-13T04:30:00.000Z'), window, 'Asia/Kolkata'), true); // 10:00 IST
    assert.equal(isWithinDispatchWindow(new Date('2026-11-13T12:29:00.000Z'), window, 'Asia/Kolkata'), true); // 17:59 IST
    assert.equal(isWithinDispatchWindow(new Date('2026-11-13T12:30:00.000Z'), window, 'Asia/Kolkata'), false); // 18:00 IST
    assert.equal(isWithinDispatchWindow(new Date('2026-11-13T04:29:00.000Z'), window, 'Asia/Kolkata'), false); // 09:59 IST
});

test('dispatch window rejects invalid timezone and malformed or reversed clocks', () => {
    const now = new Date('2026-11-13T06:30:00.000Z');
    assert.equal(isWithinDispatchWindow(now, { start: '9am', end: '18:00' }, 'Asia/Kolkata'), false);
    assert.equal(isWithinDispatchWindow(now, { start: '18:00', end: '10:00' }, 'Asia/Kolkata'), false);
    assert.equal(isWithinDispatchWindow(now, { start: '10:00', end: '18:00' }, 'Invalid/Zone'), false);
});
