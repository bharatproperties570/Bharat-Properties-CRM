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
    let otherForm;

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

        otherForm = await LeadForm.create({
            name: 'General Inquiries Form',
            slug: 'general-inquiries-form',
            category: 'lead_capture',
            isActive: true,
            sections: [{
                title: 'General',
                fields: [
                    { id: 'f_name', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                    { id: 'f_mobile', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true }
                ]
            }],
            settings: {
                successMessage: 'Inquiry received'
            }
        });

        // Ensure compound unique indexes are fully built in MongoDB
        await DynamicFormSubmission.init();
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
        try {
            const Contact = mongoose.model('Contact');
            await Contact.deleteMany({});
        } catch {}

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

    it('P1.1 Existing Lead update remains idempotent: client retry returns cached response without duplicating Activity or OutboxEvent', async () => {
        const refToken = jwt.sign(
            { leadId: testLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
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
        const subRecord = await DynamicFormSubmission.findOne({ formId: siteVisitForm._id, idempotencyKey });
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

    it('P1.2 New Lead first submission creates exactly one Lead and one Outbox event', async () => {
        const idempotencyKey = 'new_lead_first_sub_key_001';
        const reqBody = {
            formData: {
                f_name: 'BrandNewLeadVisitor',
                f_mobile: '9123456789',
                f_notes: 'First time visitor looking for luxury villa'
            },
            idempotencyKey
        };

        const req = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const res = createMockRes();
        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data?.success, true);
        assert.ok(res.data?.leadId);

        const createdLead = await Lead.findById(res.data.leadId);
        assert.ok(createdLead);
        assert.equal(createdLead.firstName, 'BrandNewLeadVisitor');

        // Verify exactly one submission, one activity, and one OutboxEvent
        const totalLeads = await Lead.countDocuments({ mobile: '9123456789' });
        assert.equal(totalLeads, 1, 'Exactly one Lead must be created in MongoDB');

        const subCount = await DynamicFormSubmission.countDocuments({ formId: siteVisitForm._id, idempotencyKey });
        assert.equal(subCount, 1, 'Exactly one DynamicFormSubmission must be created');

        const outboxCount = await OutboxEvent.countDocuments({ aggregateId: createdLead._id });
        assert.equal(outboxCount, 1, 'Exactly one OutboxEvent must be created for new lead');

        const actCount = await Activity.countDocuments({ entityId: createdLead._id });
        assert.equal(actCount, 1, 'Exactly one Activity must be created for site visit form');
    });

    it('P1.3 Repeated new Lead submission with same key creates NO duplicate Lead or OutboxEvent', async () => {
        const idempotencyKey = 'new_lead_repeated_sub_key_002';
        const reqBody = {
            formData: {
                f_name: 'RepeatedNewLeadVisitor',
                f_mobile: '9123456799',
                f_notes: 'Duplicate click simulation'
            },
            idempotencyKey
        };

        // Attempt 1
        const req1 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const res1 = createMockRes();
        await submitForm(req1, res1);
        assert.equal(res1.statusCode, 201);
        const originalLeadId = res1.data?.leadId?.toString();
        assert.ok(originalLeadId);

        // Attempt 2 (Client network retry / duplicate click)
        const req2 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const res2 = createMockRes();
        await submitForm(req2, res2);

        assert.equal(res2.statusCode, 200, 'Duplicate submission must return HTTP 200');
        assert.equal(res2.data?.idempotentReplay, true, 'Must indicate idempotentReplay');
        assert.equal(res2.data?.leadId?.toString(), originalLeadId, 'Must return the original Lead ID');

        // Verification: No duplicate leads
        const totalLeads = await Lead.countDocuments({ mobile: '9123456799' });
        assert.equal(totalLeads, 1, 'Lead count must remain exactly 1');

        const outboxCount = await OutboxEvent.countDocuments({ aggregateId: originalLeadId });
        assert.equal(outboxCount, 1, 'OutboxEvent count must remain exactly 1');

        const actCount = await Activity.countDocuments({ entityId: new mongoose.Types.ObjectId(originalLeadId) });
        assert.equal(actCount, 1, 'Activity count must remain exactly 1');
    });

    it('P1.4 Concurrent same-key requests create exactly ONE Lead (database-enforced constraint & recovery)', async () => {
        const idempotencyKey = 'new_lead_concurrent_race_key_003';
        const reqBody = {
            formData: {
                f_name: 'ConcurrentRaceVisitor',
                f_mobile: '9123456700',
                f_notes: 'Concurrent race testing'
            },
            idempotencyKey
        };

        // Fire 2 simultaneous submissions with identical idempotencyKey
        const reqA = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const resA = createMockRes();
        const reqB = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
        const resB = createMockRes();

        await Promise.all([
            submitForm(reqA, resA),
            submitForm(reqB, resB)
        ]);

        // Both requests must complete successfully with valid HTTP status (201 for winner, 200 with idempotentReplay for recovered loser)
        const statuses = [resA.statusCode, resB.statusCode];
        assert.ok(statuses.includes(201), 'One request must win with HTTP 201');
        assert.ok(statuses.includes(200) || (statuses[0] === 201 && statuses[1] === 201), 'Both requests must succeed');

        // Both responses must reference the SAME Lead ID
        const leadIdA = resA.data?.leadId?.toString();
        const leadIdB = resB.data?.leadId?.toString();
        assert.equal(leadIdA, leadIdB, 'Both concurrent requests must resolve to the identical Lead ID');

        // Crucial Proof: Exactly ONE Lead created in database
        const leadCount = await Lead.countDocuments({ mobile: '9123456700' });
        assert.equal(leadCount, 1, 'Concurrent requests must not create duplicate Leads');

        const subCount = await DynamicFormSubmission.countDocuments({ formId: siteVisitForm._id, idempotencyKey });
        assert.equal(subCount, 1, 'Exactly one submission record must exist');
    });

    it('P1.5 Cross-form key reuse cannot return another form\'s Lead ID', async () => {
        const sharedKey = 'cross_form_shared_key_004';

        // Submit to siteVisitForm
        const req1 = createMockReq(
            {
                formData: { f_name: 'SiteVisitClient', f_mobile: '9111100001' },
                idempotencyKey: sharedKey
            },
            { slug: 'site-visit-form' },
            { 'idempotency-key': sharedKey }
        );
        const res1 = createMockRes();
        await submitForm(req1, res1);

        assert.equal(res1.statusCode, 201);
        const siteVisitLeadId = res1.data?.leadId?.toString();
        assert.ok(siteVisitLeadId);

        // Submit to otherForm with the SAME idempotency key string
        const req2 = createMockReq(
            {
                formData: { f_name: 'GeneralInquiryClient', f_mobile: '9111100002' },
                idempotencyKey: sharedKey
            },
            { slug: 'general-inquiries-form' },
            { 'idempotency-key': sharedKey }
        );
        const res2 = createMockRes();
        await submitForm(req2, res2);

        // Must NOT return siteVisitLeadId! Must process independently for otherForm
        assert.equal(res2.statusCode, 201, 'Submission to different form must succeed independently');
        const otherLeadId = res2.data?.leadId?.toString();
        assert.ok(otherLeadId);
        assert.notEqual(otherLeadId, siteVisitLeadId, 'Cross-form key reuse must NOT return another form\'s Lead ID');

        // Submissions must be scoped per form
        const sub1 = await DynamicFormSubmission.findOne({ formId: siteVisitForm._id, idempotencyKey: sharedKey });
        const sub2 = await DynamicFormSubmission.findOne({ formId: otherForm._id, idempotencyKey: sharedKey });
        assert.equal(sub1.lead?.toString(), siteVisitLeadId);
        assert.equal(sub2.lead?.toString(), otherLeadId);
    });

    it('P1.6 Transaction failure leaves NO partial business records in database', async () => {
        const idempotencyKey = 'tx_failure_atomic_rollback_005';
        const reqBody = {
            formData: {
                f_name: 'RollbackTester',
                f_mobile: '9123499999',
                f_notes: 'Simulate transactional failure'
            },
            idempotencyKey
        };

        // Mock DynamicFormSubmission.create to throw inside the transaction
        const originalSubCreate = DynamicFormSubmission.create;
        DynamicFormSubmission.create = async () => {
            throw new Error('SIMULATED_TRANSACTIONAL_SUBMISSION_WRITE_ERROR');
        };

        try {
            const req = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
            const res = createMockRes();

            await submitForm(req, res);

            assert.equal(res.statusCode, 500, 'Must return HTTP 500 on transaction abort');

            // Verification: Zero Leads created (rolled back)
            const leadCount = await Lead.countDocuments({ mobile: '9123499999' });
            assert.equal(leadCount, 0, 'Lead document must be rolled back on transaction error');

            // Verification: Zero OutboxEvents created (rolled back)
            const outboxCount = await OutboxEvent.countDocuments({ 'payload.triggerEvent': 'onWebCapture' });
            assert.equal(outboxCount, 0, 'OutboxEvent must be rolled back');

            // Verification: Zero Activities created (rolled back)
            const actCount = await Activity.countDocuments({ subject: /Site Visit Scheduled/ });
            assert.equal(actCount, 0, 'Activity must be rolled back');
        } finally {
            DynamicFormSubmission.create = originalSubCreate;
        }
    });

    it('P1.7 Client omitting idempotency key processes without claiming retry replay protection', async () => {
        // Request without idempotencyKey
        const reqBody = {
            formData: {
                f_name: 'NoKeyClient',
                f_mobile: '9123400000'
            }
        };

        const req = createMockReq(reqBody, { slug: 'site-visit-form' });
        const res = createMockRes();
        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data?.success, true);
        assert.ok(res.data?.leadId);
        assert.equal(res.data?.idempotentReplay, undefined, 'Must not claim idempotentReplay when key was omitted');
    });

    it('P1.8 Post-commit analytics failure does not fail form submission or cause replay duplication', async () => {
        const refToken = jwt.sign(
            { leadId: testLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const idempotencyKey = 'analytics_fail_retry_key_008';

        const reqBody = {
            formData: {
                f_name: 'AnalyticsFailName',
                f_mobile: '9876543210',
                f_notes: 'Visit attempt with simulated analytics drop'
            },
            sourceMeta: { search: `?ref=${refToken}` },
            idempotencyKey
        };

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

            const freshLead = await Lead.findById(testLead._id);
            assert.equal(freshLead.firstName, 'AnalyticsFailName');

            const actCount = await Activity.countDocuments({ entityId: testLead._id });
            const outboxCount = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            assert.equal(actCount, 1);
            assert.equal(outboxCount, 1);

            const req2 = createMockReq(reqBody, { slug: 'site-visit-form' }, { 'idempotency-key': idempotencyKey });
            const res2 = createMockRes();
            await submitForm(req2, res2);

            assert.equal(res2.statusCode, 200);
            assert.equal(res2.data?.idempotentReplay, true);

            const actCountAfterRetry = await Activity.countDocuments({ entityId: testLead._id });
            const outboxCountAfterRetry = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            assert.equal(actCountAfterRetry, 1, 'Site Visit Activity must not duplicate');
            assert.equal(outboxCountAfterRetry, 1, 'OutboxEvent must not duplicate');
        } finally {
            LeadForm.prototype.save = originalFormSave;
        }
    });

    it('P1.9 resolveLookup pre-transaction failure aborts before modifying any database state', async () => {
        const refToken = jwt.sign(
            { leadId: testLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

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

            const freshLead = await Lead.findById(testLead._id);
            assert.equal(freshLead.firstName, 'IdempFirstName', 'Lead must not be modified if pre-tx lookup fails');

            const outboxCount = await OutboxEvent.countDocuments({ aggregateId: testLead._id });
            const actCount = await Activity.countDocuments({ entityId: testLead._id });
            assert.equal(outboxCount, 0);
            assert.equal(actCount, 0);
        } finally {
            Lookup.findOne = originalLookupFindOne;
        }
    });

    it('P1.10 resolveLookup executes idempotently for repeated reference values', async () => {
        const refToken = jwt.sign(
            { leadId: testLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

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

        const lookupCount = await Lookup.countDocuments({ lookup_type: 'Location', lookup_value: 'Gurgaon Sector 102' });
        assert.equal(lookupCount, 1, 'Lookup must resolve idempotently without creating duplicate dictionary entries');
    });
});
