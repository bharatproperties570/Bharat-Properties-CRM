import mongoose from 'mongoose';
import assert from 'assert';
import Deal from '../models/Deal.js';
import { MongoServerError } from 'mongodb';

describe('Gate 121.17-R2 E11000 Hook Decoupling Tests', function() {
    let originalInsertOne;
    
    before(function() {
        originalInsertOne = Deal.collection.insertOne;
    });

    afterEach(function() {
        Deal.collection.insertOne = originalInsertOne;
    });

    const simulateError = async (message, keyPattern) => {
        Deal.collection.insertOne = async function() {
            const err = new MongoServerError({ message });
            err.code = 11000;
            if (keyPattern) err.keyPattern = keyPattern;
            throw err;
        };
        try {
            await Deal.create({ dealId: 'MOCK', stage: 'Open' });
            return null;
        } catch (err) {
            return err;
        }
    };

    it('TEST 1: Inventory duplicate using deal_active_inventory_unique', async function() {
        const err = await simulateError('E11000 duplicate key error index: deal_active_inventory_unique dup key');
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
        assert.ok(!err.message.includes('dealId'));
    });

    it('TEST 2: Inventory duplicate using deal_active_inventory_uidx', async function() {
        const err = await simulateError('E11000 duplicate key error index: deal_active_inventory_uidx dup key');
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
    });

    it('TEST 3: Coordinate duplicate using deal_active_coordinates_unique', async function() {
        const err = await simulateError('E11000 duplicate key error index: deal_active_coordinates_unique dup key');
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
    });

    it('TEST 4: Coordinate duplicate using deal_active_coordinates_uidx', async function() {
        const err = await simulateError('E11000 duplicate key error index: deal_active_coordinates_uidx dup key');
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
    });

    it('TEST 5: Unrelated unique constraint websiteMetadata.slug_1', async function() {
        const err = await simulateError('E11000 duplicate key error index: websiteMetadata.slug_1 dup key', { 'websiteMetadata.slug': 1 });
        assert.notStrictEqual(err.code, 'DUPLICATE_DEAL');
        assert.strictEqual(err.code, 11000);
    });

    it('TEST 6: Unrelated unique constraint shareableId_1', async function() {
        const err = await simulateError('E11000 duplicate key error index: shareableId_1 dup key', { shareableId: 1 });
        assert.notStrictEqual(err.code, 'DUPLICATE_DEAL');
        assert.strictEqual(err.code, 11000);
    });

    it('TEST 7: Non-E11000 MongoDB error', async function() {
        Deal.collection.insertOne = async function() {
            const err = new MongoServerError({ message: 'Other error' });
            err.code = 12345;
            throw err;
        };
        try {
            await Deal.create({ dealId: 'MOCK', stage: 'Open' });
        } catch (err) {
            assert.notStrictEqual(err.code, 'DUPLICATE_DEAL');
            assert.strictEqual(err.code, 12345);
        }
    });

    it('TEST 8: Malformed E11000 without recognized keyPattern fails closed', async function() {
        const err = await simulateError('E11000 generic error with no known index name', { randomField: 1 });
        assert.notStrictEqual(err.code, 'DUPLICATE_DEAL');
        assert.strictEqual(err.code, 11000);
    });

    it('TEST 9: keyPattern fallback for inventory works', async function() {
        const err = await simulateError('E11000 duplicate key error random_name', { inventoryId: 1 });
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
    });

    it('TEST 10: keyPattern fallback for coordinates works', async function() {
        const err = await simulateError('E11000 duplicate key error random_name', { projectName: 1, block: 1, unitNo: 1 });
        assert.strictEqual(err.code, 'DUPLICATE_DEAL');
    });
});
