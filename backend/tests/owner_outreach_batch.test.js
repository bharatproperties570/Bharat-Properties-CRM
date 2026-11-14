import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';

test('owner outreach batch requires campaign, sequence and scheduled time', () => {
    const batch = new OwnerOutreachBatch({});
    const error = batch.validateSync();
    assert.ok(error);
    assert.ok(error.errors.campaignId);
    assert.ok(error.errors.sequence);
    assert.ok(error.errors.scheduledAt);
});

test('owner outreach batch rejects unsupported states and negative counts', () => {
    const batch = new OwnerOutreachBatch({
        campaignId: new mongoose.Types.ObjectId(),
        sequence: 1,
        scheduledAt: new Date(),
        status: 'SENDING_NOW',
        counts: { selected: -1 }
    });
    const error = batch.validateSync();
    assert.ok(error);
    assert.ok(error.errors.status);
    assert.ok(error.errors['counts.selected']);
});

test('owner outreach batch has a unique campaign sequence idempotency index', () => {
    const indexes = OwnerOutreachBatch.schema.indexes();
    assert.ok(indexes.some(([keys, options]) =>
        keys.campaignId === 1 && keys.sequence === 1 && options.unique === true
    ));
});
