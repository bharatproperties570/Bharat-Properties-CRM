import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_OUTREACH_BATCH_LEASE_MS, OWNER_OUTREACH_MAX_CLAIM_SCAN } from '../services/OwnerOutreachScheduler.js';

test('owner outreach scheduler uses bounded leases and bounded campaign scans', () => {
    assert.equal(OWNER_OUTREACH_BATCH_LEASE_MS, 60_000);
    assert.equal(OWNER_OUTREACH_MAX_CLAIM_SCAN, 25);
    assert.ok(OWNER_OUTREACH_BATCH_LEASE_MS >= 5_000);
    assert.ok(OWNER_OUTREACH_BATCH_LEASE_MS <= 10 * 60_000);
});
