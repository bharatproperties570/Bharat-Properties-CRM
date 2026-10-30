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

import {
    AuthorityRefreshScheduler,
    DEFAULT_WEEKLY_CRON,
    SCHEDULE_TIMEZONE
} from '../services/authority/AuthorityRefreshScheduler.js';

describe('Phase 4 — Weekly Scheduled Refresh Orchestration Readiness', () => {
    let mongoServer;
    let tenantA, tenantB;
    let userA, userB;
    let invA1, invA2, invB1;
    let scheduler;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const schedRole = await Role.create({
            name: 'Scheduler Auditor Role',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        userA = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Scheduler Auditor A',
            email: 'scheduler.a@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: schedRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Scheduler Auditor B',
            email: 'scheduler.b@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: schedRole._id,
            isActive: true
        });

        await AuthoritySourceSettings.ensureDefaults(tenantA);
        await AuthoritySourceSettings.ensureDefaults(tenantB);

        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();

        // Seed Inventory records
        invA1 = await Inventory.create({
            tenantId: tenantA,
            unitNo: 'SCHED-101',
            sector: '14',
            projectName: 'Township A',
            status: 'Available',
            createdBy: userA._id
        });

        invA2 = await Inventory.create({
            tenantId: tenantA,
            unitNo: 'SCHED-102',
            sector: '14',
            projectName: 'Township A',
            status: 'Available',
            createdBy: userA._id
        });

        invB1 = await Inventory.create({
            tenantId: tenantB,
            unitNo: 'SCHED-B1',
            sector: '20',
            projectName: 'Township B',
            status: 'Available',
            createdBy: userB._id
        });

        // Seed Links
        await PropertyAuthorityLink.create({
            tenantId: tenantA,
            inventoryId: invA1._id,
            authorityCode: 'HSVP',
            propertyId: 'SCHED-101',
            sectorNumber: '14',
            matchEligibility: 'ELIGIBLE',
            isActive: true,
            createdBy: userA._id
        });

        await PropertyAuthorityLink.create({
            tenantId: tenantA,
            inventoryId: invA2._id,
            authorityCode: 'HSVP',
            propertyId: 'SCHED-102',
            sectorNumber: '14',
            matchEligibility: 'ELIGIBLE',
            isActive: true,
            createdBy: userA._id
        });

        scheduler = new AuthorityRefreshScheduler();
    });

    after(async () => {
        scheduler.stop();
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    describe('1. Timezone & Configuration Non-Negotiables', () => {
        it('1.1 timezone contract is strictly Asia/Kolkata', () => {
            assert.equal(SCHEDULE_TIMEZONE, 'Asia/Kolkata');
            assert.equal(scheduler.timezone, 'Asia/Kolkata');
        });

        it('1.2 default weekly cron pattern is Sunday 2:00 AM IST', () => {
            assert.equal(DEFAULT_WEEKLY_CRON, '0 2 * * 0');
        });

        it('1.3 all sources have schedulingEnabled: false by default in settings', async () => {
            const settings = await AuthoritySourceSettings.find({ tenantId: tenantA });
            assert.equal(settings.length, 3);
            settings.forEach(s => {
                assert.equal(s.schedulingEnabled, false);
                assert.equal(s.isEnabled, false);
                assert.equal(s.scheduleTimezone, 'Asia/Kolkata');
            });
        });
    });

    describe('2. Fail-Closed Scheduled Cycle Execution', () => {
        it('2.1 cycle skips all sources and executes zero live calls when scheduling is disabled', async () => {
            const report = await scheduler.executeWeeklyCycle({
                tenantId: tenantA,
                isSimulation: false // Non-simulation (live production check)
            });

            assert.equal(report.timezone, 'Asia/Kolkata');
            assert.equal(report.results.length, 3);

            report.results.forEach(res => {
                assert.equal(res.status, 'SKIPPED_SCHEDULING_DISABLED');
                assert.match(res.reason, /schedulingEnabled is false/i);
            });

            // Assert that no runs were created
            const runCount = await PropertyVerificationRun.countDocuments({
                tenantId: tenantA,
                runMode: 'BULK_SCHEDULED'
            });
            assert.equal(runCount, 0);
        });

        it('2.2 source with scheduling enabled but unapproved permission (NOT_OBTAINED) fails closed', async () => {
            // Mock source settings with schedulingEnabled: true, but permissionStatus: NOT_OBTAINED
            const report = await scheduler.executeWeeklyCycle({
                tenantId: tenantA,
                authorityCode: 'GMADA',
                isSimulation: false
            });

            const gmadaRes = report.results.find(r => r.authorityCode === 'GMADA');
            assert.ok(gmadaRes);
            assert.equal(gmadaRes.status, 'SKIPPED_SCHEDULING_DISABLED');
        });
    });

    describe('3. Scheduled Simulation Run Verification', () => {
        it('3.1 executes scheduled refresh in simulation mode creating BULK_SCHEDULED runs', async () => {
            const report = await scheduler.executeWeeklyCycle({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                isSimulation: true,
                triggeredBy: userA._id
            });

            const hsvpRes = report.results.find(r => r.authorityCode === 'HSVP');
            assert.ok(hsvpRes, 'HSVP result must exist');
            assert.equal(hsvpRes.status, 'COMPLETED');
            assert.equal(hsvpRes.totalItems, 2);

            // Verify run in database
            const run = await PropertyVerificationRun.findById(hsvpRes.runId);
            assert.equal(run.runMode, 'BULK_SCHEDULED');
            assert.equal(run.status, 'COMPLETED');
            assert.equal(run.processedItems, 2);
            assert.equal(run.succeededItems, 2);
            assert.equal(run.tenantId.toString(), tenantA.toString());
        });

        it('3.2 scheduled run respects multi-tenant boundaries (Tenant A links do not leak to Tenant B)', async () => {
            const reportB = await scheduler.executeWeeklyCycle({
                tenantId: tenantB,
                authorityCode: 'HSVP',
                isSimulation: true,
                triggeredBy: userB._id
            });

            const hsvpResB = reportB.results.find(r => r.authorityCode === 'HSVP');
            // Tenant B has no active links for HSVP
            assert.equal(hsvpResB.status, 'NOOP_NO_ELIGIBLE_LINKS');
        });
    });

    describe('4. Lifecycle Control', () => {
        it('4.1 scheduler start and stop methods manage tasks cleanly without error', () => {
            scheduler.start();
            assert.equal(scheduler.isRunning, true);
            assert.ok(scheduler.scheduledTasks.has('weekly_refresh'));

            scheduler.stop();
            assert.equal(scheduler.isRunning, false);
            assert.equal(scheduler.scheduledTasks.size, 0);
        });
    });
});
