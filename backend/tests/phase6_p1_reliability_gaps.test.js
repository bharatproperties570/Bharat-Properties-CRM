process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase6_jwt_secret_test_key_secure_12345';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import OutboxEvent from '../models/OutboxEvent.js';
import EffectExecution from '../models/EffectExecution.js';
import MarketingDispatchReceipt from '../models/MarketingDispatchReceipt.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import LeadForm from '../models/LeadForm.js';
import Booking from '../models/Booking.js';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';

import DealService from '../services/DealService.js';
import { addActivity, updateActivity, syncMobileCalls } from '../controllers/activity.controller.js';
import { syncAllContacts, deleteContact, bulkDeleteContacts, importContacts } from '../controllers/contact.controller.js';
import { submitForm } from '../controllers/leadForm.controller.js';
import { deactivateUser } from '../controllers/user.controller.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { executeEffect } from '../src/workers/effectOrchestrator.js';
import { processMarketingJob } from '../src/workers/marketingWorker.js';
import { marketingQueue } from '../src/queues/queueManager.js';
import whatsAppService from '../services/WhatsAppService.js';
import withMongoTransaction from '../utils/withMongoTransaction.js';

describe('Phase 6 — Final P1 Reliability Gaps & Side-Effects Suite', () => {
    let replset;
    let testAdminUser;
    let testRole;
    let availableLookup;

    const createMockReq = (body = {}, params = {}, query = {}) => ({
        body,
        params,
        query,
        user: testAdminUser,
        ip: '127.0.0.1',
        get: (header) => 'node-test'
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
        await MarketingDispatchReceipt.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Contact.createCollection();
        await Lead.createCollection();
        await LeadForm.createCollection();
        await Booking.createCollection();
        await Session.createCollection();
        await AuditLog.createCollection();

        await EffectExecution.syncIndexes();
        await OutboxEvent.syncIndexes();
        await MarketingDispatchReceipt.syncIndexes();

        testRole = await Role.create({
            name: 'Sales Manager',
            department: 'sales',
            permissions: [{ module: 'ALL', actions: ['ALL'] }]
        });

        availableLookup = await Lookup.create({
            lookup_type: 'Status',
            lookup_value: 'Available',
            label: 'Available',
            is_active: true
        });

        testAdminUser = {
            _id: new mongoose.Types.ObjectId(),
            id: new mongoose.Types.ObjectId().toString(),
            email: 'bharatproperties570@gmail.com',
            fullName: 'P1 Reliability Auditor',
            role: { name: 'super admin', isSystemRole: true },
            dataScope: 'all'
        };
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        await Deal.deleteMany({});
        await Inventory.deleteMany({});
        await Activity.deleteMany({});
        await OutboxEvent.deleteMany({});
        await EffectExecution.deleteMany({});
        await MarketingDispatchReceipt.deleteMany({});
        await Contact.deleteMany({});
        await Lead.deleteMany({});
        await LeadForm.deleteMany({});
        await Booking.deleteMany({});
        await Session.deleteMany({});
        await AuditLog.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 1: P1-A — Outbox Persistence Failure Must Not Be Silently Swallowed
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. P1-A — Outbox Persistence Failure Handling', () => {

        it('1.1 Activity create fails closed and rolls back transaction when Outbox write fails', async () => {
            const initialLastActivity = new Date(Date.now() - 3600000);
            const lead = await Lead.create({
                name: 'Outbox Test Lead',
                firstName: 'Outbox',
                phone: '9876500001',
                mobile: '9876500001',
                lastActivityAt: initialLastActivity
            });

            const originalCreate = OutboxEvent.create;
            OutboxEvent.create = async () => {
                throw new Error('SIMULATED_OUTBOX_WRITE_FAILURE');
            };

            const req = createMockReq({
                subject: 'Follow-up Call',
                dueDate: new Date(),
                type: 'Call',
                entityType: 'Lead',
                entityId: lead._id.toString(),
                details: { outcome: 'Connected' }
            });
            const res = createMockRes();

            try {
                await addActivity(req, res);
                assert.equal(res.statusCode, 400, 'addActivity must return HTTP 400 on error');
                assert.equal(res.data?.success, false);
                assert.match(res.data?.error, /SIMULATED_OUTBOX_WRITE_FAILURE/);
            } finally {
                OutboxEvent.create = originalCreate;
            }

            // Verify Activity was NOT persisted
            const savedActivity = await Activity.findOne({ entityId: lead._id });
            assert.equal(savedActivity, null, 'Activity must not exist when Outbox creation fails');

            // Verify Lead.lastActivityAt was NOT modified
            const reloadedLead = await Lead.findById(lead._id);
            assert.equal(reloadedLead.lastActivityAt.getTime(), initialLastActivity.getTime(), 'Lead lastActivityAt must remain unchanged');
        });

        it('1.2 Mobile call sync fails closed and rolls back transaction when Outbox write fails', async () => {
            const originalCreate = OutboxEvent.create;
            OutboxEvent.create = async () => {
                throw new Error('SIMULATED_GOOGLE_SYNC_OUTBOX_FAILURE');
            };

            const req = createMockReq({
                calls: [{
                    id: 'mob-call-999',
                    number: '9876543210',
                    duration: 120,
                    type: 'incoming',
                    timestamp: Date.now()
                }]
            });
            const res = createMockRes();

            try {
                await syncMobileCalls(req, res);
                assert.equal(res.statusCode, 500, 'syncMobileCalls must return HTTP 500 on Outbox failure');
                assert.equal(res.data?.success, false);
                assert.match(res.data?.error, /SIMULATED_GOOGLE_SYNC_OUTBOX_FAILURE/);
            } finally {
                OutboxEvent.create = originalCreate;
            }

            // Verify Activity was NOT persisted
            const savedCall = await Activity.findOne({ 'details.mobileId': 'mob-call-999' });
            assert.equal(savedCall, null, 'Call Activity must roll back when Outbox write fails');
        });

        it('1.3 Contact syncAllContacts returns explicit HTTP 500 when OutboxEvent.insertMany fails completely', async () => {
            await Contact.create([
                { name: 'Unsynced Contact 1', phone: '9876500011' },
                { name: 'Unsynced Contact 2', phone: '9876500012' }
            ]);

            const originalInsertMany = OutboxEvent.insertMany;
            OutboxEvent.insertMany = async () => {
                const err = new Error('SIMULATED_OUTBOX_INSERT_FAIL');
                err.insertedDocs = [];
                throw err;
            };

            const req = createMockReq();
            const res = createMockRes();

            try {
                await syncAllContacts(req, res);
                assert.equal(res.statusCode, 500, 'Must return HTTP 500 on total Outbox failure');
                assert.equal(res.data?.success, false);
                assert.match(res.data?.error, /Failed to queue Google sync OutboxEvents/);
            } finally {
                OutboxEvent.insertMany = originalInsertMany;
            }
        });

        it('1.4 Contact syncAllContacts returns HTTP 207 Multi-Status on partial Outbox write failure', async () => {
            await Contact.create([
                { name: 'Contact A', phone: '9876500021' },
                { name: 'Contact B', phone: '9876500022' }
            ]);

            const originalInsertMany = OutboxEvent.insertMany;
            OutboxEvent.insertMany = async (events) => {
                const err = new Error('PARTIAL_OUTBOX_BATCH_FAILURE');
                err.insertedDocs = [events[0]]; // 1 succeeded, 1 failed
                throw err;
            };

            const req = createMockReq();
            const res = createMockRes();

            try {
                await syncAllContacts(req, res);
                assert.equal(res.statusCode, 207, 'Must return HTTP 207 Multi-Status on partial failure');
                assert.equal(res.data?.partial, true);
                assert.equal(res.data?.queuedCount, 1);
                assert.equal(res.data?.failedCount, 1);
            } finally {
                OutboxEvent.insertMany = originalInsertMany;
            }
        });

        it('1.5 Contact deleteContact rolls back and preserves Contact when Outbox creation fails', async () => {
            const contact = await Contact.create({
                name: 'Contact With Google Sync',
                phone: '9876500031',
                googleContactId: 'google-contact-12345'
            });

            const originalCreate = OutboxEvent.create;
            OutboxEvent.create = async () => {
                throw new Error('SIMULATED_DELETE_SYNC_OUTBOX_FAIL');
            };

            const req = createMockReq({}, { id: contact._id.toString() });
            const res = createMockRes();
            let nextError = null;
            const next = (err) => { nextError = err; };

            try {
                await deleteContact(req, res, next);
                assert.ok(nextError, 'deleteContact must pass error to next()');
                assert.match(nextError.message, /SIMULATED_DELETE_SYNC_OUTBOX_FAIL/);
            } finally {
                OutboxEvent.create = originalCreate;
            }

            // Raw collection proof that Contact was NOT soft deleted
            const rawContact = await Contact.collection.findOne({ _id: contact._id });
            assert.equal(rawContact.isDeleted, false, 'Contact must not be marked deleted');
            assert.equal(rawContact.deletedAt, null);
        });

        it('1.6 Contact bulkDeleteContacts rolls back all deletions when Outbox write fails', async () => {
            const c1 = await Contact.create({ name: 'Bulk C1', phone: '9876500041', googleContactId: 'gc-1' });
            const c2 = await Contact.create({ name: 'Bulk C2', phone: '9876500042', googleContactId: 'gc-2' });

            const originalInsertMany = OutboxEvent.insertMany;
            OutboxEvent.insertMany = async () => {
                throw new Error('SIMULATED_BULK_OUTBOX_FAIL');
            };

            const req = createMockReq({ ids: [c1._id.toString(), c2._id.toString()] });
            const res = createMockRes();
            let nextError = null;
            const next = (err) => { nextError = err; };

            try {
                await bulkDeleteContacts(req, res, next);
                assert.ok(nextError, 'bulkDeleteContacts must pass error to next()');
                assert.match(nextError.message, /SIMULATED_BULK_OUTBOX_FAIL/);
            } finally {
                OutboxEvent.insertMany = originalInsertMany;
            }

            const raw1 = await Contact.collection.findOne({ _id: c1._id });
            const raw2 = await Contact.collection.findOne({ _id: c2._id });
            assert.equal(raw1.isDeleted, false, 'Contact 1 must remain active');
            assert.equal(raw2.isDeleted, false, 'Contact 2 must remain active');
        });

        it('1.7 Contact importContacts records explicit partial error when Outbox write fails', async () => {
            const originalInsertMany = OutboxEvent.insertMany;
            OutboxEvent.insertMany = async () => {
                const err = new Error('SIMULATED_IMPORT_OUTBOX_FAIL');
                err.insertedDocs = [];
                throw err;
            };

            const req = createMockReq({
                data: [{
                    name: 'Imported Contact',
                    mobile: '9876500055'
                }],
                updateDuplicates: false
            });
            const res = createMockRes();
            let nextError = null;
            const next = (err) => { nextError = err; };

            try {
                await importContacts(req, res, next);
                assert.equal(res.statusCode, 200);
                assert.ok(res.data?.errors?.length > 0, 'Must record partial failure in errors array');
                const outboxError = res.data.errors.find(e => e.row === 'google_sync');
                assert.ok(outboxError, 'Must explicitly report google_sync failure');
                assert.match(outboxError.reason, /Outbox event queueing partially failed/);
            } finally {
                OutboxEvent.insertMany = originalInsertMany;
            }
        });

        it('1.8 Public LeadForm submitForm propagates OutboxEvent creation failure without swallowing', async () => {
            const form = await LeadForm.create({
                name: 'Test Landing Form',
                slug: 'test-landing-form',
                isActive: true,
                sections: [{
                    title: 'Contact Information',
                    fields: [
                        { id: 'f1', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                        { id: 'f2', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true }
                    ]
                }]
            });

            const originalCreate = OutboxEvent.create;
            OutboxEvent.create = async () => {
                throw new Error('SIMULATED_LEAD_FORM_OUTBOX_FAILURE');
            };

            const req = createMockReq(
                { formData: { f1: 'Landing', f2: '9876543210' } },
                { slug: 'test-landing-form' }
            );
            const res = createMockRes();

            try {
                await submitForm(req, res);
                assert.equal(res.statusCode, 500, 'Must return HTTP 500 on unhandled Outbox failure');
                assert.equal(res.data?.success, false);
                assert.match(res.data?.error || res.data?.message, /SIMULATED_LEAD_FORM_OUTBOX_FAILURE/);
            } finally {
                OutboxEvent.create = originalCreate;
            }
        });

        it('1.9 Existing lead submitForm rolls back Lead mutation when OutboxEvent creation fails in transaction', async () => {
            const form = await LeadForm.create({
                name: 'Update Form Rollback',
                slug: 'update-form-tx-fail',
                isActive: true,
                sections: [{
                    title: 'Contact Information',
                    fields: [
                        { id: 'f1', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                        { id: 'f2', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true },
                        { id: 'f3', mappingField: 'notes', type: 'text', label: 'Notes', required: false }
                    ]
                }]
            });

            const existingLead = await Lead.create({
                name: 'Original Lead',
                firstName: 'OriginalName',
                mobile: '9876543211',
                notes: 'Original Notes',
                source: 'Direct'
            });

            const initialSubmissions = form.analytics?.submissions || 0;
            const refToken = jwt.sign(
                { leadId: existingLead._id.toString(), purpose: 'lead_reference' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const originalCreate = OutboxEvent.create;
            try {
                OutboxEvent.create = async () => {
                    throw new Error('SIMULATED_TRANSACTIONAL_OUTBOX_ERROR');
                };

                const req = createMockReq(
                    {
                        formData: { f1: 'MutatedName', f2: '9876543211', f3: 'Mutated Notes' },
                        sourceMeta: { search: `?ref=${refToken}` }
                    },
                    { slug: 'update-form-tx-fail' }
                );
                const res = createMockRes();

                await submitForm(req, res);
                assert.equal(res.statusCode, 500, 'Must return HTTP 500 on transaction abort');
                assert.equal(res.data?.success, false);
                assert.match(res.data?.error || res.data?.message, /SIMULATED_TRANSACTIONAL_OUTBOX_ERROR/);

                // PROOF 1: Lead mutation was ROLLED BACK in MongoDB
                const freshLead = await Lead.findById(existingLead._id);
                assert.equal(freshLead.firstName, 'OriginalName', 'Lead.firstName must remain unmutated after rollback');
                assert.equal(freshLead.notes, 'Original Notes', 'Lead.notes must remain unmutated after rollback');

                // PROOF 2: No OutboxEvent was committed
                const outboxCount = await OutboxEvent.countDocuments({
                    aggregateId: existingLead._id,
                    eventType: 'LeadEnrichmentRequested'
                });
                assert.equal(outboxCount, 0, 'No OutboxEvent must be committed on rolled back transaction');

                // PROOF 3: Form analytics was NOT incremented on failed transaction
                const freshForm = await LeadForm.findById(form._id);
                assert.equal(freshForm.analytics.submissions, initialSubmissions, 'Form submissions must not increment on abort');
            } finally {
                OutboxEvent.create = originalCreate;
            }
        });

        it('1.10 Successful existing lead submitForm commits Lead mutation and OutboxEvent together', async () => {
            const form = await LeadForm.create({
                name: 'Update Form Success',
                slug: 'update-form-tx-success',
                isActive: true,
                sections: [{
                    title: 'Contact Information',
                    fields: [
                        { id: 'f1', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                        { id: 'f2', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true },
                        { id: 'f3', mappingField: 'notes', type: 'text', label: 'Notes', required: false }
                    ]
                }]
            });

            const existingLead = await Lead.create({
                name: 'Initial Lead',
                firstName: 'InitialName',
                mobile: '9876543212',
                notes: 'Initial Notes',
                source: 'Direct'
            });

            const initialSubmissions = form.analytics?.submissions || 0;

            const refToken = jwt.sign(
                { leadId: existingLead._id.toString(), purpose: 'lead_reference' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            const req = createMockReq(
                {
                    formData: { f1: 'CommittedName', f2: '9876543212', f3: 'Committed Notes' },
                    sourceMeta: { search: `?ref=${refToken}` }
                },
                { slug: 'update-form-tx-success' }
            );
            const res = createMockRes();

            await submitForm(req, res);
            if (res.statusCode !== 201) {
                console.error('TEST 1.10 FAILED WITH:', res.statusCode, res.data);
            }
            assert.equal(res.statusCode, 201, 'Must return HTTP 201 on success');
            assert.equal(res.data?.success, true);
            assert.equal(res.data?.leadId.toString(), existingLead._id.toString());

            // PROOF 1: Lead mutation was COMMITTED
            const freshLead = await Lead.findById(existingLead._id);
            assert.equal(freshLead.firstName, 'CommittedName');
            assert.equal(freshLead.notes, 'Committed Notes');

            // PROOF 2: OutboxEvent was COMMITTED
            const outbox = await OutboxEvent.findOne({
                aggregateId: existingLead._id,
                eventType: 'LeadEnrichmentRequested'
            });
            assert.ok(outbox, 'OutboxEvent must be committed alongside Lead');
            assert.equal(outbox.aggregateType, 'Lead');
            assert.equal(outbox.provenance?.source, 'PUBLIC_FORM');

            // PROOF 3: Form analytics was incremented post-commit
            const freshForm = await LeadForm.findById(form._id);
            assert.equal(freshForm.analytics.submissions, initialSubmissions + 1);
        });

        it('1.11 New lead submitForm follows LeadCreationEngine contract and increments form analytics', async () => {
            const form = await LeadForm.create({
                name: 'New Lead Form',
                slug: 'new-lead-form',
                isActive: true,
                sections: [{
                    title: 'Contact Information',
                    fields: [
                        { id: 'f1', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                        { id: 'f2', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true }
                    ]
                }]
            });

            const initialSubmissions = form.analytics?.submissions || 0;

            const req = createMockReq(
                { formData: { f1: 'NewCapturedLead', f2: '9876543219' } },
                { slug: 'new-lead-form' }
            );
            const res = createMockRes();

            await submitForm(req, res);
            assert.equal(res.statusCode, 201, 'Must return HTTP 201 for new lead creation');
            assert.equal(res.data?.success, true);
            assert.ok(res.data?.leadId, 'Must return new lead ID');

            const createdLead = await Lead.findById(res.data.leadId);
            assert.ok(createdLead, 'Lead must be created by LeadCreationEngine');
            assert.equal(createdLead.firstName, 'NewCapturedLead');
            assert.equal(createdLead.mobile, '9876543219');

            const freshForm = await LeadForm.findById(form._id);
            assert.equal(freshForm.analytics.submissions, initialSubmissions + 1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 2: P1-B — Queue Checkpoint Failure & Receipt Idempotency
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. P1-B — Queue Checkpoint Failure & Receipt Idempotency', () => {

        it('2.1 Queue job executes and removes from BullMQ; retry is prevented by MarketingDispatchReceipt', async () => {
            let providerCallCount = 0;
            const eventId = new mongoose.Types.ObjectId().toString();
            const deterministicJobId = `mkt_${eventId}_blast`;

            // Setup OutboxEvent
            const outbox = await OutboxEvent.create({
                eventId,
                eventType: 'MarketingDispatchRequested',
                aggregateType: 'Marketing',
                aggregateId: new mongoose.Types.ObjectId(),
                payload: {
                    jobType: 'blast',
                    jobData: { channel: 'whatsapp', message: 'Reliability Test' },
                    opts: { jobId: deterministicJobId, removeOnComplete: true }
                }
            });

            // Mock marketingQueue.add to simulate execution + removeOnComplete
            const originalAdd = marketingQueue.add;
            marketingQueue.add = async (name, data, opts) => {
                // Simulate job execution by worker
                providerCallCount++;

                // Record receipt as COMPLETED by worker
                await MarketingDispatchReceipt.updateOne(
                    { dispatchKey: opts.jobId },
                    {
                        $set: {
                            dispatchKey: opts.jobId,
                            jobName: name,
                            status: 'COMPLETED',
                            completedAt: new Date()
                        }
                    },
                    { upsert: true }
                );

                // Simulate BullMQ removeOnComplete: true (Redis no longer has job)
                return { id: opts.jobId };
            };

            try {
                // First attempt: runs effect with simulated completion checkpoint failure marked as ambiguous
                await assert.rejects(
                    executeEffect(
                        eventId,
                        'marketing_blast_dispatch',
                        'Marketing',
                        outbox.aggregateId.toString(),
                        async () => {
                            await marketingQueue.add('blast', outbox.payload.jobData, {
                                ...outbox.payload.opts,
                                jobId: deterministicJobId
                            });
                        },
                        { _simulateAmbiguousCheckpointFailure: true }
                    ),
                    /Simulated DB failure during completion checkpoint/
                );

                // Provider was called once during first execution
                assert.equal(providerCallCount, 1, 'Provider must be called on first execution');

                // EffectExecution transitioned to AMBIGUOUS
                const effectRec = await EffectExecution.findOne({ eventId, effectKey: 'marketing_blast_dispatch' });
                assert.ok(effectRec);
                assert.equal(effectRec.status, 'AMBIGUOUS', 'EffectExecution must transition to AMBIGUOUS');

                // Receipt is COMPLETED
                const receipt = await MarketingDispatchReceipt.findOne({ dispatchKey: deterministicJobId });
                assert.ok(receipt);
                assert.equal(receipt.status, 'COMPLETED');

                // RETRY: executeEffect detects AMBIGUOUS and skips
                const retryEffectResult = await executeEffect(
                    eventId,
                    'marketing_blast_dispatch',
                    'Marketing',
                    outbox.aggregateId.toString(),
                    async () => {
                        await marketingQueue.add('blast', outbox.payload.jobData, { jobId: deterministicJobId });
                    }
                );
                assert.equal(retryEffectResult.status, 'SKIPPED');
                assert.equal(retryEffectResult.ambiguous, true);

                // RETRY via DomainEventWorker: checks MarketingDispatchReceipt and skips queuing
                const workerJob = {
                    name: 'domainEventJob',
                    data: { eventId, eventType: 'MarketingDispatchRequested', payload: outbox.payload, aggregateType: 'Marketing', aggregateId: outbox.aggregateId.toString() },
                    log: async () => {}
                };
                const workerResult = await processDomainEventJob(workerJob);
                assert.equal(workerResult.success, true);

                // CRITICAL ASSERTION: Provider was NEVER called again across all retries!
                assert.equal(providerCallCount, 1, 'Downstream provider call count must remain strictly 1');
            } finally {
                marketingQueue.add = originalAdd;
            }
        });

        it('2.2 processMarketingJob skips execution when MarketingDispatchReceipt is already COMPLETED', async () => {
            let providerCalled = false;
            const dispatchKey = 'test-idempotent-job-key-1';

            // Pre-seed receipt as COMPLETED
            await MarketingDispatchReceipt.create({
                dispatchKey,
                jobName: 'blast',
                status: 'COMPLETED',
                completedAt: new Date()
            });

            const mockJob = {
                id: dispatchKey,
                name: 'blast',
                data: {
                    channel: 'whatsapp',
                    leads: [{ mobile: '9876543210', name: 'Test' }],
                    message: 'Duplicate prevention test'
                },
                log: async () => {}
            };

            const result = await processMarketingJob(mockJob);
            assert.equal(result.status, 'SKIPPED_DUPLICATE', 'Must return SKIPPED_DUPLICATE without calling provider');
            assert.equal(providerCalled, false, 'Provider must never be called');
        });

        it('2.3 Receipt database unavailable before dispatch: provider invocation count must remain strictly zero', async () => {
            let providerCalled = 0;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                providerCalled++;
                return { success: true, messageId: 'wa_mock_msg' };
            };

            const originalClaimDispatch = MarketingDispatchReceipt.claimDispatch;
            MarketingDispatchReceipt.claimDispatch = async () => {
                const dbErr = new Error('RECEIPT_DB_UNAVAILABLE: Connection lost to receipt cluster');
                dbErr.code = 'RECEIPT_DB_UNAVAILABLE';
                throw dbErr;
            };

            const mockJob = {
                id: 'test-fail-closed-db-job',
                name: 'blast',
                data: {
                    channel: 'whatsapp',
                    leads: [{ mobile: '9876543210', name: 'FailClosed Customer' }],
                    message: 'Fail-closed verification'
                },
                log: async () => {}
            };

            try {
                await assert.rejects(
                    processMarketingJob(mockJob),
                    /RECEIPT_DB_UNAVAILABLE/
                );
                assert.equal(providerCalled, 0, 'Downstream provider invocation count must remain strictly 0 when receipt DB is unavailable');
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
                MarketingDispatchReceipt.claimDispatch = originalClaimDispatch;
            }
        });

        it('2.4 Two concurrent workers attempting the same recipient/channel dispatch: only one claim succeeds', async () => {
            let providerInvocations = 0;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                providerInvocations++;
                return { success: true, messageId: 'wa_msg_race_test' };
            };

            const sharedKey = `rcpt_camp_concurrent_${Date.now()}_whatsapp_9876543299`;

            try {
                // Two concurrent workers execute claimDispatch in parallel for the exact same recipient dispatch key
                const [worker1Claim, worker2Claim] = await Promise.all([
                    MarketingDispatchReceipt.claimDispatch({
                        dispatchKey: sharedKey,
                        idempotencyKey: sharedKey,
                        jobName: 'blast',
                        channel: 'whatsapp',
                        recipientMobile: '9876543299'
                    }),
                    MarketingDispatchReceipt.claimDispatch({
                        dispatchKey: sharedKey,
                        idempotencyKey: sharedKey,
                        jobName: 'blast',
                        channel: 'whatsapp',
                        recipientMobile: '9876543299'
                    })
                ]);

                // Exactly one worker must obtain canDispatch: true
                const claims = [worker1Claim, worker2Claim];
                const winningClaims = claims.filter(c => c.canDispatch === true);
                const losingClaims = claims.filter(c => c.canDispatch === false);

                assert.equal(winningClaims.length, 1, 'Exactly one concurrent worker must win the dispatch claim');
                assert.equal(losingClaims.length, 1, 'The competing worker must lose the claim');
                assert.match(losingClaims[0].status, /SKIPPED/);

                // The winning worker executes provider call
                if (winningClaims[0].canDispatch) {
                    await whatsAppService.sendMessage('9876543299', 'Hello', { idempotencyKey: sharedKey });
                    await MarketingDispatchReceipt.recordSuccess(sharedKey, { providerRef: 'wa_msg_race_test' });
                }

                assert.equal(providerInvocations, 1, 'Provider must be invoked exactly once');

                // Verify receipt state in DB
                const savedReceipt = await MarketingDispatchReceipt.findOne({ dispatchKey: sharedKey });
                assert.ok(savedReceipt);
                assert.equal(savedReceipt.status, 'COMPLETED');
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
            }
        });

        it('2.5 Worker crash after provider call: retry sees DISPATCHING/AMBIGUOUS and skips provider call', async () => {
            let providerCallCount = 0;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                providerCallCount++;
                return { success: true, messageId: 'msg_worker_crash_test' };
            };

            const crashKey = `rcpt_crash_test_${Date.now()}_whatsapp_9876543288`;

            try {
                // Worker 1 claims dispatch
                const claim1 = await MarketingDispatchReceipt.claimDispatch({
                    dispatchKey: crashKey,
                    idempotencyKey: crashKey,
                    jobName: 'blast',
                    channel: 'whatsapp',
                    recipientMobile: '9876543288'
                });
                assert.equal(claim1.canDispatch, true);

                // Provider accepts message
                await whatsAppService.sendMessage('9876543288', 'Hello Crash Test', { idempotencyKey: crashKey });
                assert.equal(providerCallCount, 1);

                // Simulated worker crash BEFORE writing completion:
                // Receipt remains in status 'DISPATCHING'
                const inFlightReceipt = await MarketingDispatchReceipt.findOne({ dispatchKey: crashKey });
                assert.equal(inFlightReceipt.status, 'DISPATCHING');

                // Worker 2 (or BullMQ retry) attempts to process the exact same dispatch
                const retryClaim = await MarketingDispatchReceipt.claimDispatch({
                    dispatchKey: crashKey,
                    idempotencyKey: crashKey,
                    jobName: 'blast',
                    channel: 'whatsapp',
                    recipientMobile: '9876543288'
                });

                // RETRY MUST NOT DISPATCH: in-flight lease is active
                assert.equal(retryClaim.canDispatch, false, 'Retry must NOT dispatch while active claim is present');
                assert.equal(retryClaim.status, 'SKIPPED_IN_FLIGHT');

                // Downstream provider call count remains strictly 1
                assert.equal(providerCallCount, 1, 'Provider must NOT be called again after crash');
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
            }
        });

        it('2.6 Provider idempotency key is passed to WhatsAppService on template and message dispatch', async () => {
            let capturedOptions = null;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async (mobile, message, options) => {
                capturedOptions = options;
                return { success: true, messageId: 'wa_idemp_key_test' };
            };

            const testJobId = `job_idemp_check_${Date.now()}`;
            const mockJob = {
                id: testJobId,
                name: 'blast',
                data: {
                    campaignId: 'camp_7788',
                    channel: 'whatsapp',
                    leads: [{ id: 'lead_42', mobile: '9876543277', name: 'Idemp Test User' }],
                    message: 'Idempotency key check'
                },
                log: async () => {}
            };

            try {
                const res = await processMarketingJob(mockJob);
                assert.equal(res.sent, 1);
                assert.ok(capturedOptions, 'Options must be passed to whatsAppService.sendMessage');
                assert.ok(capturedOptions.idempotencyKey, 'idempotencyKey must be present in options');
                assert.equal(capturedOptions.idempotencyKey, 'rcpt_camp_7788_whatsapp_lead_42');
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
            }
        });

        it('2.7 Unsupported provider idempotency or network drop leads to AMBIGUOUS and skips auto-resend', async () => {
            let providerCallCount = 0;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                providerCallCount++;
                const err = new Error('connect ETIMEDOUT 157.240.22.53:443');
                err.code = 'ETIMEDOUT';
                throw err;
            };

            const testJobId = `job_timeout_check_${Date.now()}`;
            const mockJob = {
                id: testJobId,
                name: 'blast',
                data: {
                    campaignId: 'camp_timeout_99',
                    channel: 'whatsapp',
                    leads: [{ id: 'lead_timeout_1', mobile: '9876543266', name: 'Timeout User' }],
                    message: 'Timeout test'
                },
                log: async () => {}
            };

            try {
                const res = await processMarketingJob(mockJob);
                assert.equal(res.failed, 1);
                assert.equal(providerCallCount, 1);

                // Receipt transitioned to AMBIGUOUS
                const recipientKey = 'rcpt_camp_timeout_99_whatsapp_lead_timeout_1';
                const receipt = await MarketingDispatchReceipt.findOne({ dispatchKey: recipientKey });
                assert.ok(receipt);
                assert.equal(receipt.status, 'AMBIGUOUS', 'Network timeout must mark recipient status AMBIGUOUS');

                // Retry attempt
                const retryClaim = await MarketingDispatchReceipt.claimDispatch({
                    dispatchKey: recipientKey,
                    idempotencyKey: recipientKey,
                    jobName: 'blast',
                    channel: 'whatsapp',
                    recipientMobile: '9876543266'
                });

                assert.equal(retryClaim.canDispatch, false, 'Ambiguous dispatch must not auto-resend');
                assert.equal(retryClaim.status, 'AMBIGUOUS');
                assert.equal(providerCallCount, 1, 'Provider must NOT be called on ambiguous retry');
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
            }
        });

        it('2.8 Receipt completion database failure throws RECEIPT_COMPLETION_FAILED and allows operator reconciliation', async () => {
            let providerCallCount = 0;
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                providerCallCount++;
                return { success: true, messageId: 'wa_msg_comp_fail' };
            };

            const compKey = `job_comp_fail_${Date.now()}`;
            const originalRecordSuccess = MarketingDispatchReceipt.recordSuccess;
            MarketingDispatchReceipt.recordSuccess = async (key, opts) => {
                if (key === compKey) {
                    const compErr = new Error('RECEIPT_COMPLETION_FAILED: Mongo cluster disk full');
                    compErr.code = 'RECEIPT_COMPLETION_FAILED';
                    throw compErr;
                }
                return originalRecordSuccess.call(MarketingDispatchReceipt, key, opts);
            };

            const mockJob = {
                id: compKey,
                name: 'blast',
                data: {
                    channel: 'whatsapp',
                    leads: [{ mobile: '9876543255', name: 'Comp Fail User' }],
                    message: 'Completion failure test'
                },
                log: async () => {}
            };

            try {
                // Must throw and fail job rather than reporting clean success
                await assert.rejects(
                    processMarketingJob(mockJob),
                    /RECEIPT_COMPLETION_FAILED/
                );
                assert.equal(providerCallCount, 1, 'Provider was invoked');

                // Operator manually reconciles receipt after verifying delivery
                const reconciled = await MarketingDispatchReceipt.reconcileAmbiguous(compKey, {
                    resolution: 'CONFIRM_DELIVERED',
                    operatorNotes: 'Verified delivered via provider webhook'
                });
                assert.equal(reconciled.status, 'COMPLETED');
                assert.equal(reconciled.reconciliationStatus, 'CONFIRMED_DELIVERED');
                assert.match(reconciled.reconciliationNotes, /Verified delivered via provider webhook/);
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
                MarketingDispatchReceipt.recordSuccess = originalRecordSuccess;
            }
        });

        it('2.9 Genuinely failed provider call records FAILED status in receipt', async () => {
            const originalSendMessage = whatsAppService.sendMessage;
            whatsAppService.sendMessage = async () => {
                return { success: false, error: 'Recipient phone number is invalid (not on WhatsApp)' };
            };

            const failJobId = `job_fail_check_${Date.now()}`;
            const mockJob = {
                id: failJobId,
                name: 'blast',
                data: {
                    campaignId: 'camp_fail_11',
                    channel: 'whatsapp',
                    leads: [{ id: 'lead_invalid_1', mobile: '0000000000', name: 'Invalid Lead' }],
                    message: 'Fail test'
                },
                log: async () => {}
            };

            try {
                const res = await processMarketingJob(mockJob);
                assert.equal(res.failed, 1);

                const recipientKey = 'rcpt_camp_fail_11_whatsapp_lead_invalid_1';
                const receipt = await MarketingDispatchReceipt.findOne({ dispatchKey: recipientKey });
                assert.ok(receipt);
                assert.equal(receipt.status, 'FAILED');
                assert.match(receipt.lastError, /Recipient phone number is invalid/);
            } finally {
                whatsAppService.sendMessage = originalSendMessage;
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 3: P1-C — Soft-Delete Audit Must Fail Closed
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. P1-C — Soft-Delete Audit Fail Closed Contract', () => {

        it('3.1 DealService.deleteDeal aborts transaction when Activity audit insert fails', async () => {
            const inventory = await Inventory.create({
                title: 'Audit Test Plot 101',
                status: availableLookup._id
            });

            const deal = await Deal.create({
                title: 'Audit Fail Deal',
                inventoryId: inventory._id,
                stage: 'Negotiation',
                dealValue: 5000000
            });

            // Simulate Activity native driver insert failure
            const originalInsertOne = mongoose.connection.collection('activities').insertOne;
            mongoose.connection.collection('activities').insertOne = async () => {
                throw new Error('SIMULATED_ACTIVITY_AUDIT_WRITE_ERROR');
            };

            try {
                await DealService.deleteDeal(deal._id.toString(), { user: testAdminUser });
                assert.fail('Expected deleteDeal to throw and abort');
            } catch (err) {
                assert.match(err.message, /SOFT_DELETE_AUDIT_FAILED/);
            } finally {
                mongoose.connection.collection('activities').insertOne = originalInsertOne;
            }

            // Raw MongoDB query proves deal is NOT deleted
            const rawDeal = await Deal.collection.findOne({ _id: deal._id });
            assert.equal(rawDeal.isDeleted, false, 'Deal must remain active (isDeleted: false)');
            assert.equal(rawDeal.deletedAt, null, 'deletedAt must remain null');
            assert.equal(rawDeal.deletedBy, null, 'deletedBy must remain null');
        });

        it('3.2 DealService.deleteDeal persists raw isDeleted: true and audit Activity on success', async () => {
            const inventory = await Inventory.create({
                title: 'Successful Audit Unit',
                status: availableLookup._id
            });

            const deal = await Deal.create({
                title: 'Successful Audit Deal',
                inventoryId: inventory._id,
                stage: 'Open',
                dealValue: 7500000
            });

            const res = await DealService.deleteDeal(deal._id.toString(), { user: testAdminUser });
            assert.equal(res.success, true);

            // Raw collection proof
            const rawDeal = await Deal.collection.findOne({ _id: deal._id });
            assert.equal(rawDeal.isDeleted, true);
            assert.ok(rawDeal.deletedAt instanceof Date);
            assert.equal(rawDeal.deletedBy.toString(), testAdminUser._id.toString());

            // Activity audit record exists
            const auditActivity = await Activity.collection.findOne({
                entityId: deal._id,
                action: 'SOFT_DELETE'
            });
            assert.ok(auditActivity, 'Audit Activity record must be committed');
            assert.equal(auditActivity.userId.toString(), testAdminUser._id.toString());
        });

        it('3.3 DealService.deleteDeal rolls back soft delete if subsequent inventory update fails', async () => {
            const inventory = await Inventory.create({
                title: 'Rollback Inventory Unit',
                status: availableLookup._id
            });

            const deal = await Deal.create({
                title: 'Rollback Deal',
                inventoryId: inventory._id,
                stage: 'Negotiation',
                dealValue: 6000000
            });

            const originalFindByIdAndUpdate = Inventory.findByIdAndUpdate;
            Inventory.findByIdAndUpdate = () => {
                throw new Error('SIMULATED_INVENTORY_UPDATE_FAILURE');
            };

            try {
                await DealService.deleteDeal(deal._id.toString(), { user: testAdminUser });
                assert.fail('Expected deleteDeal to fail');
            } catch (err) {
                assert.match(err.message, /SIMULATED_INVENTORY_UPDATE_FAILURE/);
            } finally {
                Inventory.findByIdAndUpdate = originalFindByIdAndUpdate;
            }

            // Raw MongoDB query proves deal is NOT deleted
            const rawDeal = await Deal.collection.findOne({ _id: deal._id });
            assert.equal(rawDeal.isDeleted, false, 'Deal must remain active on inventory failure');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 4: P2 — Post-Commit Session Side Effects
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. P2 — Post-Commit Session Side Effects in User Deactivation', () => {

        it('4.1 Session.forceLogoutUser is NOT called if user deactivation transaction aborts', async () => {
            const transferTarget = await User.create({
                fullName: 'Transfer Target Fail',
                email: 'transfer.target1@bharatproperties.co',
                password: 'HashedPassword123!',
                department: 'sales',
                role: testRole._id,
                isActive: true
            });

            const targetUser = await User.create({
                fullName: 'User To Deactivate Fail',
                email: 'deact.fail@bharatproperties.co',
                password: 'HashedPassword123!',
                department: 'sales',
                role: testRole._id,
                isActive: true
            });

            let forceLogoutCalled = false;
            const originalForceLogout = Session.forceLogoutUser;
            Session.forceLogoutUser = async () => {
                forceLogoutCalled = true;
            };

            // Force AuditLog.create to throw inside the transaction
            const originalAuditCreate = AuditLog.create;
            AuditLog.create = async () => {
                throw new Error('SIMULATED_AUDIT_LOG_CREATION_FAILURE');
            };

            const req = createMockReq({
                transferToUserId: transferTarget._id.toString(),
                reason: 'Security Audit Test'
            }, { id: targetUser._id.toString() });
            const res = createMockRes();

            try {
                await deactivateUser(req, res);
                assert.equal(res.statusCode, 500, 'Must return HTTP 500 on transaction abort');
            } finally {
                Session.forceLogoutUser = originalForceLogout;
                AuditLog.create = originalAuditCreate;
            }

            // Assert Session.forceLogoutUser was NOT called
            assert.equal(forceLogoutCalled, false, 'Session.forceLogoutUser must never be called on aborted transaction');

            // User must remain active in DB
            const reloadedUser = await User.findById(targetUser._id);
            assert.equal(reloadedUser.isActive, true, 'User must remain active in database');
        });

        it('4.2 Session.forceLogoutUser is called post-commit when deactivation transaction succeeds', async () => {
            const transferTarget = await User.create({
                fullName: 'Transfer Target Success',
                email: 'transfer.target2@bharatproperties.co',
                password: 'HashedPassword123!',
                department: 'sales',
                role: testRole._id,
                isActive: true
            });

            const targetUser = await User.create({
                fullName: 'User To Deactivate Success',
                email: 'deact.success@bharatproperties.co',
                password: 'HashedPassword123!',
                department: 'sales',
                role: testRole._id,
                isActive: true
            });

            let forceLogoutCalledWith = null;
            const originalForceLogout = Session.forceLogoutUser;
            Session.forceLogoutUser = async (userId, actorId, reason) => {
                forceLogoutCalledWith = { userId, actorId, reason };
            };

            const req = createMockReq({
                transferToUserId: transferTarget._id.toString(),
                reason: 'Employee Departure'
            }, { id: targetUser._id.toString() });
            const res = createMockRes();

            try {
                await deactivateUser(req, res);
                assert.equal(res.statusCode, 200, 'Must return HTTP 200 on success');
                assert.equal(res.data?.success, true);
            } finally {
                Session.forceLogoutUser = originalForceLogout;
            }

            // Assert Session.forceLogoutUser was called with correct parameters
            assert.ok(forceLogoutCalledWith, 'Session.forceLogoutUser must be called post-commit');
            assert.equal(forceLogoutCalledWith.userId, targetUser._id.toString());
            assert.equal(forceLogoutCalledWith.reason, 'user_deactivated');

            // User is deactivated in DB
            const reloadedUser = await User.findById(targetUser._id);
            assert.equal(reloadedUser.isActive, false, 'User must be marked inactive in database');
        });
    });
});
