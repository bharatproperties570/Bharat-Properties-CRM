import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';

describe('Phase 4 — 5,000+ Synthetic Inventory Bulk Verification Load Test', () => {
    let mongoServer;
    let tenantId;
    let userId;
    const TARGET_VOLUME = parseInt(process.env.AUTHORITY_LOAD_VOLUME || '5000', 10);
    const BATCH_SIZE = 250;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantId = new mongoose.Types.ObjectId();
        userId = new mongoose.Types.ObjectId();

        const perfRole = await Role.create({
            name: 'Performance Auditor Role',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        await User.create({
            _id: userId,
            tenantId,
            fullName: 'Performance Auditor',
            email: 'perf@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: perfRole._id,
            isActive: true
        });

        await AuthoritySourceSettings.ensureDefaults(tenantId);
        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();
    });

    after(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it(`executes controlled bulk verification across ${TARGET_VOLUME} records with bounded memory and 100% completion`, async () => {
        console.log(`[LoadTest] Seeding ${TARGET_VOLUME} synthetic inventory and link records...`);

        // Bulk insert 5,000 Inventory documents
        const inventoryDocs = [];
        for (let i = 1; i <= TARGET_VOLUME; i++) {
            inventoryDocs.push({
                _id: new mongoose.Types.ObjectId(),
                tenantId,
                unitNo: `PLOT-${i}`,
                sector: `${(i % 50) + 1}`,
                projectName: 'Grand Haryana Township',
                status: 'Available',
                createdBy: userId
            });
        }
        await Inventory.insertMany(inventoryDocs, { ordered: false });

        // Create the Bulk Run
        const invIds = inventoryDocs.map(d => d._id);
        const run = await AuthorityBulkProcessor.createBulkRun({
            tenantId,
            authorityCode: 'HSVP',
            requestedBy: userId,
            inventoryIds: invIds,
            runMode: 'BULK_MANUAL',
            isFixtureMode: true
        });

        assert.equal(run.totalItems, TARGET_VOLUME);
        assert.equal(run.status, 'CREATED');

        // Measure starting memory
        if (global.gc) global.gc();
        const startMem = process.memoryUsage().heapUsed;
        const startTime = Date.now();

        console.log(`[LoadTest] Starting batch execution (Batch size: ${BATCH_SIZE})...`);
        let progressTicks = 0;

        const outcome = await AuthorityBulkProcessor.processRun(run._id, {
            tenantId,
            batchSize: BATCH_SIZE,
            isFixtureMode: true,
            onProgress: (p) => {
                progressTicks++;
                if (p.processed % 1000 === 0) {
                    console.log(`[LoadTest] Progress: ${p.processed}/${TARGET_VOLUME} items (${Math.round((p.processed / TARGET_VOLUME) * 100)}%)`);
                }
            }
        });

        const elapsedSec = (Date.now() - startTime) / 1000;
        if (global.gc) global.gc();
        const endMem = process.memoryUsage().heapUsed;
        const memoryGrowthMB = Math.round((endMem - startMem) / (1024 * 1024));

        console.log(`[LoadTest] Finished ${TARGET_VOLUME} items in ${elapsedSec.toFixed(2)}s. Memory growth: ${memoryGrowthMB} MB.`);

        // Assert completion and performance guarantees
        assert.equal(outcome.status, 'COMPLETED');
        assert.equal(outcome.totalItems, TARGET_VOLUME);
        assert.equal(outcome.processedItems, TARGET_VOLUME);
        assert.equal(outcome.succeededItems, TARGET_VOLUME);
        assert.equal(outcome.failedItems, 0);

        // Verify DB counts
        const dbRun = await PropertyVerificationRun.findById(run._id);
        assert.equal(dbRun.status, 'COMPLETED');
        assert.equal(dbRun.processedItems, TARGET_VOLUME);
        assert.equal(dbRun.succeededItems, TARGET_VOLUME);

        const succeededCount = await PropertyVerificationRunItem.countDocuments({
            runId: run._id,
            status: 'SUCCEEDED'
        });
        assert.equal(succeededCount, TARGET_VOLUME);

        const snapshotCount = await PropertyVerificationSnapshot.countDocuments({
            tenantId,
            authorityCode: 'HSVP'
        });
        assert.equal(snapshotCount, TARGET_VOLUME);

        // Verify bounded memory growth (< 350 MB growth for 5,000 DB documents and snapshots)
        assert.ok(memoryGrowthMB < 350, `Memory growth should remain bounded under high volume, was ${memoryGrowthMB} MB`);
    });
});
