process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import OutboxEvent from '../models/OutboxEvent.js';
import EffectExecution from '../models/EffectExecution.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import Company from '../models/Company.js';

import DealService from '../services/DealService.js';
import { sendCampaign, activateDrip, broadcastToBrokerGroup } from '../controllers/marketing.controller.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { executeEffect } from '../src/workers/effectOrchestrator.js';
import { marketingQueue } from '../src/queues/queueManager.js';
import withMongoTransaction from '../utils/withMongoTransaction.js';

describe('Phase 6 — Reliability Remediation & Idempotency Suite', () => {
    let replset;
    let testAdminUser;
    let availableLookup;
    let blockedLookup;
    let activeLookup;

    const createMockReq = (body = {}, params = {}, query = {}) => ({
        body,
        params,
        query,
        user: testAdminUser
    });

    const createMockRes = () => {
        const res = {
            statusCode: 200,
            data: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.data = payload;
                return this;
            }
        };
        return res;
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replset.waitUntilRunning();
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        await Deal.createCollection();
        await Inventory.createCollection();
        await Activity.createCollection();
        await Lookup.createCollection();
        await OutboxEvent.createCollection();
        await EffectExecution.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Team.createCollection();
        await Company.createCollection();

        await EffectExecution.syncIndexes();
        await OutboxEvent.syncIndexes();

        availableLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
        blockedLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Blocked' });
        activeLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Active' });

        testAdminUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'bharatproperties570@gmail.com',
            fullName: 'Bharat Admin',
            role: { name: 'super admin', isSystemRole: true },
            dataScope: 'all'
        };
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await Deal.deleteMany({});
        await Inventory.deleteMany({});
        await Activity.deleteMany({});
        await OutboxEvent.deleteMany({});
        await EffectExecution.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: Marketing Dispatch — Eliminate Duplicate Execution
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Marketing Dispatch Single Authoritative Path & Idempotency', () => {
        it('1.1 One campaign request creates one effective queue job', async () => {
            const queueInvocations = [];
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                queueInvocations.push({ name, data, opts });
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const req = createMockReq({
                    channel: 'whatsapp',
                    name: 'Diwali Festive Blast',
                    content: 'Exclusive 3BHK Deals Available',
                    audienceConfig: {
                        source: 'Import',
                        tempRecipients: [
                            { name: 'Buyer One', mobile: '9876543210' },
                            { name: 'Buyer Two', mobile: '9123456780' }
                        ]
                    }
                });
                const res = createMockRes();

                await sendCampaign(req, res);

                assert.equal(res.statusCode, 200);
                assert.equal(res.data.success, true);
                assert.equal(res.data.leadCount, 2);
                assert.ok(res.data.jobId, 'Response must return deterministic jobId');
                assert.match(res.data.jobId, /^mkt_/);

                // Controller did NOT add job directly to queue
                assert.equal(queueInvocations.length, 0, 'Controller must not directly enqueue to BullMQ');

                // OutboxEvent was created with matching deterministic jobId
                const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
                assert.ok(outbox, 'OutboxEvent must be persisted');
                assert.equal(outbox.payload.jobType, 'blast');
                assert.equal(outbox.payload.opts.jobId, res.data.jobId);

                // Authoritative worker processes OutboxEvent and adds exactly ONE job
                await processDomainEventJob({ data: outbox });

                assert.equal(queueInvocations.length, 1, 'Exactly one queue job must be created');
                assert.equal(queueInvocations[0].name, 'blast');
                assert.equal(queueInvocations[0].opts.jobId, res.data.jobId);
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('1.2 One drip activation creates one effective queue job', async () => {
            const queueInvocations = [];
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                queueInvocations.push({ name, data, opts });
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const leadId = new mongoose.Types.ObjectId();
                const req = createMockReq({
                    leadId: leadId.toString(),
                    sequenceId: 'seq-welcome-nurture',
                    delayMs: 5000
                });
                const res = createMockRes();

                await activateDrip(req, res);

                assert.equal(res.statusCode, 200);
                assert.equal(res.data.success, true);
                assert.ok(res.data.jobId, 'Drip activation must return deterministic jobId');
                assert.match(res.data.jobId, /^mkt_/);

                // Controller did NOT add job directly to queue
                assert.equal(queueInvocations.length, 0, 'Controller must not directly enqueue drip job');

                const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
                assert.ok(outbox);
                assert.equal(outbox.payload.jobType, 'drip');
                assert.equal(outbox.payload.opts.jobId, res.data.jobId);
                assert.equal(outbox.payload.opts.delay, 5000);

                // Worker processes OutboxEvent
                await processDomainEventJob({ data: outbox });

                assert.equal(queueInvocations.length, 1, 'Exactly one drip job must be added by worker');
                assert.equal(queueInvocations[0].name, 'drip');
                assert.equal(queueInvocations[0].opts.delay, 5000);
                assert.equal(queueInvocations[0].opts.jobId, res.data.jobId);
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('1.3 One BNA broadcast creates one effective queue job and preserves live tracker metadata', async () => {
            const queueInvocations = [];
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                queueInvocations.push({ name, data, opts });
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const deal = await Deal.create({
                    title: 'Exclusive Penthouse Suite',
                    price: 9500000,
                    location: 'Sector 32, Kurukshetra',
                    stage: 'Open'
                });

                const req = createMockReq({
                    dealIds: [deal._id.toString()],
                    whatsappGroupJids: ['120363024891234567@g.us'],
                    channel: 'whatsapp',
                    meta: { title: 'Exclusive Penthouse Suite' }
                });
                const res = createMockRes();

                await broadcastToBrokerGroup(req, res);

                assert.equal(res.statusCode, 200);
                assert.equal(res.data.success, true);
                assert.ok(res.data.campaignId);
                assert.ok(res.data.jobId);
                assert.match(res.data.jobId, /^mkt_/);

                // Controller did NOT directly enqueue
                assert.equal(queueInvocations.length, 0);

                const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
                assert.ok(outbox);
                assert.equal(outbox.payload.jobType, 'bna-broadcast');
                assert.equal(outbox.payload.opts.jobId, res.data.jobId);

                // Worker processes OutboxEvent
                await processDomainEventJob({ data: outbox });

                assert.equal(queueInvocations.length, 1, 'Exactly one BNA broadcast job added');
                assert.equal(queueInvocations[0].name, 'bna-broadcast');
                assert.equal(queueInvocations[0].opts.jobId, res.data.jobId);
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('1.4 Scheduled dispatch executes once with deterministic delay', async () => {
            const queueInvocations = [];
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                queueInvocations.push({ name, data, opts });
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const futureTime = new Date(Date.now() + 7200000).toISOString(); // 2 hours in future
                const req = createMockReq({
                    channel: 'whatsapp',
                    name: 'Scheduled Weekend Blast',
                    content: 'Special Open House Weekend',
                    isScheduled: true,
                    scheduledAt: futureTime,
                    audienceConfig: {
                        source: 'Import',
                        tempRecipients: [{ name: 'Buyer A', mobile: '9876543210' }]
                    }
                });
                const res = createMockRes();

                await sendCampaign(req, res);

                assert.equal(res.statusCode, 200);
                assert.equal(res.data.status, 'Scheduled');
                assert.ok(res.data.jobId);

                const outbox = await OutboxEvent.findOne({ eventType: 'MarketingDispatchRequested' });
                assert.ok(outbox);
                assert.ok(outbox.payload.opts.delay > 0, 'Delay must be configured for future schedule');

                await processDomainEventJob({ data: outbox });

                assert.equal(queueInvocations.length, 1);
                assert.ok(queueInvocations[0].opts.delay > 0);
                assert.equal(queueInvocations[0].opts.jobId, res.data.jobId);
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('1.5 Retrying the same Outbox event does not enqueue a second job', async () => {
            let addCount = 0;
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                addCount++;
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const eventId = new mongoose.Types.ObjectId().toString();
                const outbox = await OutboxEvent.create({
                    eventId,
                    eventType: 'MarketingDispatchRequested',
                    aggregateType: 'Marketing',
                    aggregateId: new mongoose.Types.ObjectId(),
                    payload: {
                        jobType: 'blast',
                        jobData: { channel: 'sms', name: 'Retry Campaign' },
                        opts: { jobId: `mkt_${eventId}_blast` }
                    }
                });

                // First execution: enqueues job
                const res1 = await processDomainEventJob({ data: outbox });
                assert.equal(res1.success, true);
                assert.equal(addCount, 1);

                // Verify EffectExecution is COMPLETED
                const effect = await EffectExecution.findOne({ eventId, effectKey: 'marketing_blast_dispatch' });
                assert.ok(effect);
                assert.equal(effect.status, 'COMPLETED');

                // Second execution (replay / worker retry): must be idempotent and skip enqueue
                const res2 = await processDomainEventJob({ data: outbox });
                assert.equal(res2.success, true);
                assert.equal(addCount, 1, 'Queue invocation count must remain 1 on retry');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('1.6 Redis unavailable / recovery does not produce duplicate dispatch', async () => {
            let failMode = true;
            let addCount = 0;
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                if (failMode) {
                    throw new Error('ECONNREFUSED: Redis offline');
                }
                addCount++;
                return { id: opts?.jobId || 'mock-job-id' };
            };

            try {
                const eventId = new mongoose.Types.ObjectId().toString();
                const outbox = await OutboxEvent.create({
                    eventId,
                    eventType: 'MarketingDispatchRequested',
                    aggregateType: 'Marketing',
                    aggregateId: new mongoose.Types.ObjectId(),
                    payload: {
                        jobType: 'blast',
                        jobData: { channel: 'sms', name: 'Recovery Campaign' },
                        opts: { jobId: `mkt_${eventId}_blast` }
                    }
                });

                // Attempt 1: Redis is offline, queue throws
                await assert.rejects(
                    processDomainEventJob({ data: outbox }),
                    /ECONNREFUSED/
                );
                assert.equal(addCount, 0);

                const effectAfterFail = await EffectExecution.findOne({ eventId, effectKey: 'marketing_blast_dispatch' });
                assert.ok(effectAfterFail);
                assert.equal(effectAfterFail.status, 'FAILED');
                assert.match(effectAfterFail.lastError, /ECONNREFUSED/);

                // Attempt 2: Redis recovers, worker retries
                failMode = false;
                await processDomainEventJob({ data: outbox });

                assert.equal(addCount, 1, 'Queue must be called exactly once upon recovery');
                const effectAfterRecovery = await EffectExecution.findOne({ eventId, effectKey: 'marketing_blast_dispatch' });
                assert.equal(effectAfterRecovery.status, 'COMPLETED');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: Deal Deletion — Restore Soft-Delete Contract
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Deal Deletion Soft-Delete Contract & Physical Document Preservation', () => {
        it('2.1 Deal remains physically present in MongoDB after normal deletion (raw collection proof)', async () => {
            const deal = await Deal.create({
                title: 'Penthouse Suite 1201',
                stage: 'Open'
            });

            const result = await DealService.deleteDeal(deal._id, { user: testAdminUser });
            assert.equal(result.success, true);

            // Raw collection check — proves physical document preservation
            const rawDoc = await mongoose.connection.collection('deals').findOne({ _id: deal._id });
            assert.ok(rawDoc, 'Raw document MUST remain physically present in MongoDB');
            assert.equal(rawDoc.isDeleted, true, 'isDeleted must be true');
            assert.ok(rawDoc.deletedAt instanceof Date, 'deletedAt must be recorded as Date');
            assert.equal(String(rawDoc.deletedBy), String(testAdminUser._id), 'deletedBy must match operator ID');

            // Verify Audit record was written to activities collection
            const auditActivity = await mongoose.connection.collection('activities').findOne({
                entityId: deal._id,
                action: 'SOFT_DELETE'
            });
            assert.ok(auditActivity, 'Audit activity must be created during soft delete');
            assert.equal(String(auditActivity.userId), String(testAdminUser._id));
        });

        it('2.2 Normal queries exclude deleted Deals while explicit includeDeleted retrieves them', async () => {
            const deal = await Deal.create({
                title: 'Commercial Retail Shop 4B',
                stage: 'Quote'
            });

            await DealService.deleteDeal(deal._id, { user: testAdminUser });

            // Normal findById returns null due to softDelete query filter
            const normalFindById = await Deal.findById(deal._id);
            assert.equal(normalFindById, null, 'Normal findById must exclude soft-deleted deal');

            // Normal find returns empty
            const normalFind = await Deal.find({ _id: deal._id });
            assert.equal(normalFind.length, 0, 'Normal find must exclude soft-deleted deal');

            // Normal countDocuments returns 0
            const count = await Deal.countDocuments({ _id: deal._id });
            assert.equal(count, 0, 'countDocuments must exclude soft-deleted deal');

            // Explicit includeDeleted: true retrieves the soft-deleted deal
            const withDeleted = await Deal.findOne({ _id: deal._id }, null, { includeDeleted: true });
            assert.ok(withDeleted, 'includeDeleted: true must retrieve the deal');
            assert.equal(withDeleted.isDeleted, true);
            assert.equal(withDeleted.title, 'Commercial Retail Shop 4B');
        });

        it('2.3 Soft delete and audit record roll back together on transaction failure', async () => {
            const deal = await Deal.create({
                title: 'Rollback Test Villa',
                stage: 'Open'
            });

            // Simulate transaction failure during deleteDeal by throwing inside a wrapping transaction
            await assert.rejects(
                withMongoTransaction(async (session) => {
                    await Deal.softDeleteOne({ _id: deal._id }, { userId: testAdminUser._id, session });
                    throw new Error('Simulated post-softDelete transaction abort');
                }),
                /Simulated post-softDelete transaction abort/
            );

            // Raw collection check: deal must NOT be soft-deleted because transaction rolled back
            const rawDoc = await mongoose.connection.collection('deals').findOne({ _id: deal._id });
            assert.ok(rawDoc);
            assert.equal(rawDoc.isDeleted, false, 'Deal must remain active if transaction aborts');
            assert.equal(rawDoc.deletedAt, null);

            // Audit record must not exist
            const auditActivity = await mongoose.connection.collection('activities').findOne({
                entityId: deal._id,
                action: 'SOFT_DELETE'
            });
            assert.equal(auditActivity, null, 'Audit record must roll back with transaction');
        });

        it('2.4 Inventory status is recalculated to Available when sole active deal is deleted', async () => {
            const inv = await Inventory.create({
                projectName: 'Grand Residency',
                unitNo: 'GR-101',
                status: blockedLookup._id
            });

            const deal = await Deal.create({
                projectName: inv.projectName,
                unitNo: inv.unitNo,
                inventoryId: inv._id,
                stage: 'Booked'
            });

            await DealService.deleteDeal(deal._id, { user: testAdminUser });

            // Inventory status must be reset to Available
            const checkInv = await Inventory.findById(inv._id).lean();
            assert.equal(String(checkInv.status), String(availableLookup._id));
        });

        it('2.5 Another active Deal prevents inventory from being marked Available', async () => {
            const inv = await Inventory.create({
                projectName: 'Palm Towers',
                unitNo: 'PT-303',
                status: activeLookup._id
            });

            const deal1 = await Deal.create({
                projectName: inv.projectName,
                unitNo: inv.unitNo,
                inventoryId: inv._id,
                stage: 'Negotiation'
            });

            const deal2 = await Deal.create({
                projectName: inv.projectName,
                unitNo: inv.unitNo,
                inventoryId: inv._id,
                stage: 'Open'
            });

            // Delete deal1 — deal2 is still active
            await DealService.deleteDeal(deal1._id, { user: testAdminUser });

            // Inventory status must remain Active, not reverted to Available
            const checkInv = await Inventory.findById(inv._id).lean();
            assert.equal(String(checkInv.status), String(activeLookup._id));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: Outbox Reliability and Queue Idempotency
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Outbox Reliability & Failure Injections', () => {
        it('3.1 Queue add succeeds but EffectExecution completion checkpoint fails', async () => {
            let queueAddedJobId = null;
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                queueAddedJobId = opts?.jobId;
                return { id: opts?.jobId };
            };

            try {
                const eventId = new mongoose.Types.ObjectId().toString();
                const effectKey = 'marketing_blast_dispatch';
                const aggregateType = 'Marketing';
                const aggregateId = new mongoose.Types.ObjectId();

                // Inject failure during completion checkpoint using option
                await assert.rejects(
                    executeEffect(
                        eventId,
                        effectKey,
                        aggregateType,
                        aggregateId,
                        async () => {
                            await marketingQueue.add('blast', { name: 'Checkpoint Fail Test' }, { jobId: `mkt_${eventId}_blast` });
                        },
                        { _simulateCompletionCheckpointFailure: true }
                    ),
                    /Simulated DB failure during completion checkpoint/
                );

                // Queue was invoked with deterministic jobId
                assert.equal(queueAddedJobId, `mkt_${eventId}_blast`);

                // EffectExecution transitioned to FAILED
                const record = await EffectExecution.findOne({ eventId, effectKey });
                assert.ok(record);
                assert.equal(record.status, 'FAILED');
                assert.match(record.lastError, /Simulated DB failure/);

                // On retry, executeEffect re-claims and runs with the SAME deterministic jobId
                await executeEffect(
                    eventId,
                    effectKey,
                    aggregateType,
                    aggregateId,
                    async () => {
                        await marketingQueue.add('blast', { name: 'Checkpoint Fail Test' }, { jobId: `mkt_${eventId}_blast` });
                    }
                );

                const finalRecord = await EffectExecution.findOne({ eventId, effectKey });
                assert.equal(finalRecord.status, 'COMPLETED');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('3.2 Same Outbox event processed concurrently enforces atomic claim and executes queue add once', async () => {
            let executionCount = 0;
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                executionCount++;
                await new Promise(r => setTimeout(r, 60));
                return { id: opts?.jobId };
            };

            try {
                const eventId = new mongoose.Types.ObjectId().toString();
                const outbox = await OutboxEvent.create({
                    eventId,
                    eventType: 'MarketingDispatchRequested',
                    aggregateType: 'Marketing',
                    aggregateId: new mongoose.Types.ObjectId(),
                    payload: {
                        jobType: 'blast',
                        jobData: { channel: 'whatsapp', name: 'Concurrent Test' },
                        opts: { jobId: `mkt_${eventId}_blast` }
                    }
                });

                // Launch two simultaneous processing promises with Promise.allSettled
                const results = await Promise.allSettled([
                    processDomainEventJob({ data: outbox }),
                    processDomainEventJob({ data: outbox })
                ]);

                // At least one succeeded
                const fulfilled = results.filter(r => r.status === 'fulfilled' && r.value.success);
                assert.ok(fulfilled.length >= 1, 'At least one worker must fulfill');

                // If one was rejected, it was due to distributed lock acquisition
                const rejected = results.filter(r => r.status === 'rejected');
                for (const rej of rejected) {
                    assert.match(rej.reason.message, /currently locked by another worker/);
                }

                assert.equal(executionCount, 1, 'Only one concurrent worker must execute queue.add');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('3.3 Outbox database write failure is not silently swallowed', async () => {
            const originalCreate = OutboxEvent.create;
            OutboxEvent.create = async () => {
                throw new Error('CRITICAL_OUTBOX_MONGO_WRITE_FAILED');
            };

            try {
                const req = createMockReq({
                    channel: 'whatsapp',
                    name: 'Outbox Fail Test',
                    content: 'Test content',
                    audienceConfig: {
                        source: 'Import',
                        tempRecipients: [{ name: 'Buyer', mobile: '9876543210' }]
                    }
                });
                const res = createMockRes();

                await sendCampaign(req, res);

                // Must return 500 status and NOT swallow the write failure
                assert.equal(res.statusCode, 500);
                assert.equal(res.data.success, false);
                assert.match(res.data.error, /CRITICAL_OUTBOX_MONGO_WRITE_FAILED/);
            } finally {
                OutboxEvent.create = originalCreate;
            }
        });

        it('3.4 Unsupported event action is rejected with explicit error and never marked completed', async () => {
            const eventId = new mongoose.Types.ObjectId().toString();
            const outbox = await OutboxEvent.create({
                eventId,
                eventType: 'MarketingDispatchRequested',
                aggregateType: 'Marketing',
                aggregateId: new mongoose.Types.ObjectId(),
                payload: {
                    jobType: 'malicious_unsupported_action',
                    jobData: { channel: 'whatsapp' }
                }
            });

            await assert.rejects(
                processDomainEventJob({ data: outbox }),
                /Unsupported marketing dispatch action: malicious_unsupported_action/
            );

            // EffectExecution must NOT be COMPLETED
            const effect = await EffectExecution.findOne({ eventId });
            assert.notEqual(effect?.status, 'COMPLETED', 'Unsupported action must never be marked COMPLETED');
        });

        it('3.5 Reprocessing a completed event does not duplicate the external job', async () => {
            let addCalls = 0;
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                addCalls++;
                return { id: opts?.jobId };
            };

            try {
                const eventId = new mongoose.Types.ObjectId().toString();
                const outbox = await OutboxEvent.create({
                    eventId,
                    eventType: 'MarketingDispatchRequested',
                    aggregateType: 'Marketing',
                    aggregateId: new mongoose.Types.ObjectId(),
                    payload: {
                        jobType: 'drip',
                        jobData: { leadId: new mongoose.Types.ObjectId() },
                        opts: { jobId: `mkt_${eventId}_drip` }
                    }
                });

                // Run once
                await processDomainEventJob({ data: outbox });
                assert.equal(addCalls, 1);

                // Run twice
                await processDomainEventJob({ data: outbox });
                assert.equal(addCalls, 1, 'Second run must be a no-op');

                // Run thrice
                await processDomainEventJob({ data: outbox });
                assert.equal(addCalls, 1, 'Third run must be a no-op');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });
    });
});
