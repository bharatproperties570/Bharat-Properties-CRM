process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase6_idempotency_test_secret_key_12345';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Lead from '../models/Lead.js';
import LeadForm from '../models/LeadForm.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import OutboxEvent from '../models/OutboxEvent.js';
import DynamicFormSubmission from '../models/DynamicFormSubmission.js';
import User from '../models/User.js';
import { submitForm } from '../controllers/leadForm.controller.js';

describe('Phase 6 — P1 LeadForm Post-Commit Idempotency & Lookup Boundary Suite', () => {
    let replset;
    let testUser;
    let testLead;
    let siteVisitForm;

    const createMockReq = (body = {}, params = {}, headers = {}) => ({
        body,
        params,
        query: {},
        headers,
        user: testUser,
        ip: '127.0.0.1',
        get: (header) => headers[header.toLowerCase()] || 'node-test'
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
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        await mongoose.connect(replset.getUri());

        testUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Idempotency Tester',
            email: 'idempotency-tester@bharatproperties.co',
            role: 'admin'
        };

        siteVisitForm = await LeadForm.create({
            name: 'Site Visit Booking Form',
            slug: 'site-visit-form',
            category: 'site_visit',
            isActive: true,
            sections: [{
                title: 'Schedule Visit',
                fields: [
                    { id: 'f_name', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                    { id: 'f_mobile', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true },
                    { id: 'f_notes', mappingField: 'notes', type: 'text', label: 'Notes', required: false },
                    { id: 'f_location', mappingField: 'location', type: 'text', label: 'Location' }
                ]
            }],
            settings: {
                successMessage: 'Site visit booked successfully'
            }
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        await Lead.deleteMany({});
        await Activity.deleteMany({});
        await OutboxEvent.deleteMany({});
        await DynamicFormSubmission.deleteMany({});
        await Lookup.deleteMany({});

        testLead = await Lead.create({
            name: 'Idempotent Lead',
            firstName: 'IdempFirstName',
            lastName: 'IdempLastName',
            mobile: '9876543210',
            notes: 'Initial notes',
            source: 'Website',
            owner: testUser._id
        });
    });

    it('P1.1 Client retry with same idempotencyKey returns cached response without duplicating Activity or OutboxEvent', async () => {
        const refToken = jwt.sign({ leadId: testLead._id.toString() }, process.env.JWT_SECRET);
        const idempotencyKey = 'client_sub_key_test_001';

        const reqBody = {
            formData: {
                f_name: 'UpdatedViaForm',
                f_mobile: '9876543210',
                f_notes: 'Booked visit for sector 150'
            },
            sourceMeta: { search: `?ref=${refToken}` },
            idempotencyKey
        };

        // First Submission
        const req1 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const res1 = createMockRes();
        await submitForm(req1, res1);

        assert.equal(res1.statusCode, 201);
        assert.equal(res1.data?.success, true);
        assert.equal(res1.data?.leadId?.toString(), testLead._id.toString());

        // Verify exactly 1 Activity and 1 OutboxEvent created
        const actCount1 = await Activity.countDocuments({ entityId: testLead._id });
        const outboxCount1 = await OutboxEvent.countDocuments({ aggregateId: testLead._id, eventType: 'LeadEnrichmentRequested' });
        assert.equal(actCount1, 1, 'Exactly one Activity must be created on first submission');
        assert.equal(outboxCount1, 1, 'Exactly one OutboxEvent must be created on first submission');

        // Verify DynamicFormSubmission record was stored
        const subRecord = await DynamicFormSubmission.findOne({ idempotencyKey });
        assert.ok(subRecord, 'DynamicFormSubmission record must exist');
        assert.equal(subRecord.lead?.toString(), testLead._id.toString());

        // Second Submission (Simulated Client Retry with exact same idempotencyKey)
        const req2 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const res2 = createMockRes();
        await submitForm(req2, res2);

        // Must return HTTP 200 with idempotentReplay flag
        assert.equal(res2.statusCode, 200, 'Duplicate submission replay must return HTTP 200');
        assert.equal(res2.data?.success, true);
        assert.equal(res2.data?.idempotentReplay, true, 'Must indicate idempotentReplay');
        assert.equal(res2.data?.leadId?.toString(), testLead._id.toString());

        // Crucial Proof: Activity and OutboxEvent counts MUST REMAIN 1
        const actCount2 = await Activity.countDocuments({ entityId: testLead._id });
        const outboxCount2 = await OutboxEvent.countDocuments({ aggregateId: testLead._id, eventType: 'LeadEnrichmentRequested' });
        assert.equal(actCount2, 1, 'Activity count must NOT duplicate on retry');
        assert.equal(outboxCount2, 1, 'OutboxEvent count must NOT duplicate on retry');
    });

    it('P1.2 Analytics failure after successful transaction does not duplicate Lead enrichment or Site Visit on retry', async () => {
        const refToken = jwt.sign({ leadId: testLead._id.toString() }, process.env.JWT_SECRET);
        const idempotencyKey = 'analytics_fail_retry_key_002';

        const reqBody = {
            formData: {
                f_name: 'AnalyticsFailName',
                f_mobile: '9876543210',
                f_notes: 'Visit attempt with simulated analytics drop'
            },
            sourceMeta: { search: `?ref=${refToken}` },
            idempotencyKey
        };

        // First attempt: Simulate form.save() error during post-commit analytics update
        const originalFormSave = LeadForm.prototype.save;
        let saveAttempts = 0;
        LeadForm.prototype.save = async function() {
            saveAttempts++;
            if (saveAttempts === 1) {
                throw new Error('SIMULATED_POST_COMMIT_ANALYTICS_DB_ERROR');
            }
            return await originalFormSave.apply(this, arguments);
        };

        try {
            const req1 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
            const res1 = createMockRes();
            await submitForm(req1, res1);

            // The business transaction (Lead + Activity + Outbox + Submission) committed successfully
            const freshLead = await Lead.findById(testLead._id);
            assert.equal(freshLead.firstName, 'AnalyticsFailName');

            const actCount = await Activity.countDocuments({ entityId: testLead._id });
            const outboxCount = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            assert.equal(actCount, 1);
            assert.equal(outboxCount, 1);

            // Client receives response or retries due to perceived network/analytics timeout
            const req2 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
            const res2 = createMockRes();
            await submitForm(req2, res2);

            assert.equal(res2.statusCode, 200);
            assert.equal(res2.data?.idempotentReplay, true);

            // Proves zero duplicate business side-effects created
            const actCountAfterRetry = await Activity.countDocuments({ entityId: testLead._id });
            const outboxCountAfterRetry = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            assert.equal(actCountAfterRetry, 1, 'Site Visit Activity must not duplicate');
            assert.equal(outboxCountAfterRetry, 1, 'OutboxEvent must not duplicate');
        } finally {
            LeadForm.prototype.save = originalFormSave;
        }
    });

    it('P1.3 resolveLookup pre-transaction failure aborts before modifying any database state', async () => {
        const refToken = jwt.sign({ leadId: testLead._id.toString() }, process.env.JWT_SECRET);

        const originalLookupFindOne = Lookup.findOne;
        Lookup.findOne = async () => {
            throw new Error('SIMULATED_PRE_TX_LOOKUP_DATABASE_FAILURE');
        };

        try {
            const req = createMockReq({
                formData: {
                    f_name: 'LookupFailureName',
                    f_mobile: '9876543210',
                    f_location: 'New Destination City'
                },
                sourceMeta: { search: `?ref=${refToken}` }
            }, { slug: 'site-visit-form' });
            const res = createMockRes();

            await submitForm(req, res);

            assert.equal(res.statusCode, 500, 'Must fail closed on lookup resolution failure');
            assert.equal(res.data?.success, false);
            assert.match(res.data?.error || res.data?.message, /SIMULATED_PRE_TX_LOOKUP_DATABASE_FAILURE/);

            // Proof: Lead was NOT modified
            const freshLead = await Lead.findById(testLead._id);
            assert.equal(freshLead.firstName, 'IdempFirstName', 'Lead must not be modified if pre-tx lookup fails');

            // Proof: No OutboxEvent or Activity was created
            const outboxCount = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            const actCount = await Activity.countDocuments({ entityId: testLead._id });
            assert.equal(outboxCount, 0);
            assert.equal(actCount, 0);
        } finally {
            Lookup.findOne = originalLookupFindOne;
        }
    });

    it('P1.4 resolveLookup executes idempotently for repeated reference values', async () => {
        const refToken = jwt.sign({ leadId: testLead._id.toString() }, process.env.JWT_SECRET);

        // Submit form twice with same location string "Gurgaon Sector 102"
        const req1 = createMockReq({
            formData: {
                f_name: 'User One',
                f_mobile: '9876543210',
                f_location: 'Gurgaon Sector 102'
            },
            sourceMeta: { search: `?ref=${refToken}` }
        }, { slug: 'site-visit-form' });
        const res1 = createMockRes();
        await submitForm(req1, res1);
        assert.equal(res1.statusCode, 201);

        const lookup1 = await Lookup.findOne({ lookup_type: 'Location', lookup_value: 'Gurgaon Sector 102' });
        assert.ok(lookup1);

        // Submit new lead with same location
        const req2 = createMockReq({
            formData: {
                f_name: 'User Two',
                f_mobile: '9111111111',
                f_location: 'Gurgaon Sector 102'
            }
        }, { slug: 'site-visit-form' });
        const res2 = createMockRes();
        await submitForm(req2, res2);
        assert.equal(res2.statusCode, 201);

        // Must reuse existing Lookup entry rather than creating a duplicate
        const lookupCount = await Lookup.countDocuments({ lookup_type: 'Location', lookup_value: 'Gurgaon Sector 102' });
        assert.equal(lookupCount, 1, 'Lookup must resolve idempotently without creating duplicate dictionary entries');
    });
});
