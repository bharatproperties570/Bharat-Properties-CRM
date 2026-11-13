import test from 'node:test';
import assert from 'node:assert/strict';
import { addCadence } from '../services/OwnerOutreachService.js';

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
