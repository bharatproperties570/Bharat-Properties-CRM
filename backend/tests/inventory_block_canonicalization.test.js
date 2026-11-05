import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import '../models/Project.js';
import '../models/Inventory.js';
import { getUniqueBlocks, updateInventory, addInventory, getInventory } from '../controllers/inventory.controller.js';
import connectDB from '../config/db.js';

describe('Inventory Block Canonicalization & Case-Insensitive Lifecycle', () => {
    let Project;
    let Inventory;
    let testProject;
    let testInventory;

    before(async () => {
        await connectDB();
        Project = mongoose.model('Project');
        Inventory = mongoose.model('Inventory');

        // Create or find a mock test project
        testProject = await Project.create({
            name: 'Test Block Canonical Project ' + Date.now(),
            blocks: [
                { name: 'Alpha Block' },
                { name: 'Beta Block' },
                { name: 'Gamma Block' }
            ]
        });

        testInventory = await Inventory.create({
            projectName: testProject.name,
            projectId: testProject._id,
            unitNo: 'Unit-TEST-01',
            block: 'Alpha Block',
            status: 'Active'
        });
    });

    after(async () => {
        if (testInventory?._id) {
            await Inventory.deleteOne({ _id: testInventory._id });
        }
        if (testProject?._id) {
            await Project.deleteOne({ _id: testProject._id });
        }
        await mongoose.disconnect();
    });

    it('1. updateInventory canonicalizes casing variant to canonical Project block name', async () => {
        const req = {
            params: { id: testInventory._id.toString() },
            body: {
                block: 'ALPHA BLOCK' // Uppercase variation sent by client
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'bharatproperties570@gmail.com', role: 'Super Admin' }
        };

        let responseStatusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(data) {
                responseBody = data;
                return this;
            }
        };

        await updateInventory(req, res);

        assert.equal(responseStatusCode, 200, `Expected status 200, got ${responseStatusCode}: ${JSON.stringify(responseBody)}`);
        assert.equal(responseBody.success, true);
        assert.equal(responseBody.data.block, 'Alpha Block', 'Casing must be canonicalized to Project block name');

        // Verify in DB
        const updatedDoc = await Inventory.findById(testInventory._id).lean();
        assert.equal(updatedDoc.block, 'Alpha Block');
    });

    it('2. addInventory canonicalizes casing variant on creation', async () => {
        const req = {
            body: {
                projectName: testProject.name,
                projectId: testProject._id.toString(),
                unitNo: 'Unit-TEST-02',
                block: 'beta block', // Lowercase variation
                category: 'Residential'
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'bharatproperties570@gmail.com', role: 'Super Admin' }
        };

        let responseStatusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(data) {
                responseBody = data;
                return this;
            }
        };

        await addInventory(req, res);

        assert.equal(responseStatusCode, 201);
        assert.equal(responseBody.data.block, 'Beta Block', 'Lowercase must be canonicalized to "Beta Block"');

        // Cleanup created item
        if (responseBody.data?._id) {
            await Inventory.deleteOne({ _id: responseBody.data._id });
        }
    });

    it('3. getUniqueBlocks returns deduplicated canonical blocks even if mixed casing exists', async () => {
        // Temporarily insert a row with divergent casing directly into DB
        const tempDoc = await Inventory.collection.insertOne({
            projectName: testProject.name,
            projectId: testProject._id,
            unitNo: 'Unit-TEST-RAW',
            block: 'BETA BLOCK'
        });

        const req = {
            query: {
                project: testProject.name
            }
        };

        let responseStatusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(data) {
                responseBody = data;
                return this;
            }
        };

        await getUniqueBlocks(req, res);

        assert.equal(responseStatusCode, 200);
        assert.equal(responseBody.success, true);

        // Beta Block should only appear ONCE and in canonical Title Case
        const betaBlocks = responseBody.blocks.filter(b => b.toLowerCase() === 'beta block');
        assert.equal(betaBlocks.length, 1, `Expected exactly 1 Beta Block entry, got: ${JSON.stringify(betaBlocks)}`);
        assert.equal(betaBlocks[0], 'Beta Block');

        // Cleanup
        await Inventory.collection.deleteOne({ _id: tempDoc.insertedId });
    });

    it('4. getInventory filters blocks case-insensitively', async () => {
        const req = {
            query: {
                project: testProject.name,
                block: 'alpha block' // lowercase query for Alpha Block
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'bharatproperties570@gmail.com', role: 'Super Admin' }
        };

        let responseStatusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(data) {
                responseBody = data;
                return this;
            }
        };

        await getInventory(req, res);

        assert.equal(responseStatusCode, 200);
        assert.equal(responseBody.success, true);
        const records = responseBody.records || responseBody.data || [];
        assert.ok(records.length > 0, 'Must match items despite case difference');
        assert.equal(records[0].block, 'Alpha Block');
    });
});
