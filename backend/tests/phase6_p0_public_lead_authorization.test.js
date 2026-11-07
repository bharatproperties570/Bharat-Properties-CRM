process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase6_p0_auth_test_secret_key_987654321';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Lead from '../models/Lead.js';
import LeadForm from '../models/LeadForm.js';
import Activity from '../models/Activity.js';
import OutboxEvent from '../models/OutboxEvent.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { submitForm } from '../controllers/leadForm.controller.js';

describe('Phase 6 — P0 Public Lead Authorization & IDOR Remediation Suite', () => {
    let replset;
    let testAdminUser;
    let targetLead;
    let otherLead;
    let testForm;
    let otherForm;

    const createMockReq = (body = {}, params = {}, query = {}) => ({
        body,
        params,
        query,
        user: testAdminUser,
        ip: '127.0.0.1',
        headers: {},
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
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        await mongoose.connect(replset.getUri());

        testAdminUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'P0 Security Tester',
            email: 'p0-security@bharatproperties.co',
            role: 'admin'
        };

        testForm = await LeadForm.create({
            name: 'P0 Security Test Form',
            slug: 'p0-security-form',
            isActive: true,
            sections: [{
                title: 'Contact Information',
                fields: [
                    { id: 'f_name', mappingField: 'firstName', type: 'text', label: 'First Name', required: true },
                    { id: 'f_mobile', mappingField: 'mobile', type: 'text', label: 'Mobile', required: true },
                    { id: 'f_notes', mappingField: 'notes', type: 'text', label: 'Notes', required: false }
                ]
            }],
            settings: {
                successMessage: 'Security Form Submitted Successfully'
            }
        });

        otherForm = await LeadForm.create({
            name: 'Other Unrelated Form',
            slug: 'other-unrelated-form',
            isActive: true,
            sections: [{
                title: 'General',
                fields: [
                    { id: 'f_name', mappingField: 'firstName', type: 'text', label: 'First Name' },
                    { id: 'f_mobile', mappingField: 'mobile', type: 'text', label: 'Mobile' }
                ]
            }]
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

        targetLead = await Lead.create({
            name: 'Target Victim Lead',
            firstName: 'VictimFirstName',
            lastName: 'VictimLastName',
            mobile: '9876500001',
            notes: 'Pristine confidential notes',
            source: 'Website',
            owner: testAdminUser._id
        });

        otherLead = await Lead.create({
            name: 'Other Innocent Lead',
            firstName: 'OtherFirstName',
            mobile: '9876500002',
            notes: 'Other notes',
            source: 'Direct'
        });
    });

    it('P0.1 Public request with arbitrary body leadId CANNOT update an existing Lead', async () => {
        const req = createMockReq(
            {
                leadId: targetLead._id.toString(),
                formData: {
                    f_name: 'HackedFirstName',
                    f_mobile: '9999999999',
                    f_notes: 'Malicious overwrite attempt'
                }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.notEqual(res.data?.leadId?.toString(), targetLead._id.toString(), 'Must NOT update the targeted lead ID');

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName', 'Target lead firstName must remain pristine');
        assert.equal(freshTarget.notes, 'Pristine confidential notes', 'Target lead notes must remain pristine');
        assert.equal(freshTarget.mobile, '9876500001', 'Target lead mobile must remain pristine');
    });

    it('P0.2 Public request with arbitrary query leadId CANNOT update an existing Lead', async () => {
        const req = createMockReq(
            {
                formData: {
                    f_name: 'HackedQueryName',
                    f_mobile: '8888888888',
                    f_notes: 'Query overwrite attempt'
                }
            },
            { slug: 'p0-security-form' },
            { leadId: targetLead._id.toString() }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.notEqual(res.data?.leadId?.toString(), targetLead._id.toString(), 'Must NOT update targeted lead');

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
        assert.equal(freshTarget.notes, 'Pristine confidential notes');
    });

    it('P0.3 Invalid signed token cannot update a Lead (rejected with HTTP 400)', async () => {
        const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
        const req = createMockReq(
            {
                formData: { f_name: 'AttackerName', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${invalidToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 400, 'Invalid token must be rejected with HTTP 400');
        assert.equal(res.data?.success, false);
        assert.match(res.data?.message, /Invalid, expired, or tampered/);

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
    });

    it('P0.4 Expired token cannot update a Lead (rejected with HTTP 400)', async () => {
        const expiredToken = jwt.sign(
            { leadId: targetLead._id.toString(), iat: Math.floor(Date.now() / 1000) - 100 },
            process.env.JWT_SECRET,
            { expiresIn: '1s' }
        );

        await new Promise(r => setTimeout(r, 1200));

        const req = createMockReq(
            {
                formData: { f_name: 'ExpiredAttacker', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${expiredToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 400, 'Expired token must return HTTP 400');
        assert.equal(res.data?.success, false);

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
    });

    it('P0.5 Token without exp claim is rejected (rejected with HTTP 400)', async () => {
        // Sign token without expiresIn or exp claim
        const tokenWithoutExp = jwt.sign(
            { leadId: targetLead._id.toString(), purpose: 'lead_reference' },
            process.env.JWT_SECRET
        );

        const req = createMockReq(
            {
                formData: { f_name: 'NoExpAttacker', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${tokenWithoutExp}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 400, 'Token without exp claim must return HTTP 400');
        assert.equal(res.data?.success, false);
        assert.match(res.data?.message, /Missing mandatory expiration claim/);

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName', 'Target lead must remain unmodified');
    });

    it('P0.6 Tampered token signature cannot update a Lead (rejected with HTTP 400)', async () => {
        const validToken = jwt.sign({ leadId: otherLead._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const tamperedToken = validToken.substring(0, validToken.length - 6) + 'XXXXXX';

        const req = createMockReq(
            {
                formData: { f_name: 'TamperAttacker', f_mobile: '9876500002' },
                sourceMeta: { search: `?ref=${tamperedToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 400, 'Tampered token must return HTTP 400');
        assert.equal(res.data?.success, false);

        const freshOther = await Lead.findById(otherLead._id);
        assert.equal(freshOther.firstName, 'OtherFirstName');
    });

    it('P0.7 Wrong-purpose token cannot update a Lead (rejected with HTTP 403 Forbidden)', async () => {
        const wrongPurposeToken = jwt.sign(
            {
                leadId: targetLead._id.toString(),
                purpose: 'unauthorized_admin_token'
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const req = createMockReq(
            {
                formData: { f_name: 'WrongPurposeName', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${wrongPurposeToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 403, 'Wrong-purpose token must be rejected with HTTP 403');
        assert.equal(res.data?.success, false);
        assert.match(res.data?.message, /not authorized for lead form submission/);

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
    });

    it('P0.8 Wrong-form token cannot update a Lead (rejected with HTTP 403 Forbidden)', async () => {
        const wrongFormToken = jwt.sign(
            {
                leadId: targetLead._id.toString(),
                formSlug: 'different-form-slug-restricted',
                purpose: 'public_form'
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const req = createMockReq(
            {
                formData: { f_name: 'WrongFormName', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${wrongFormToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 403, 'Wrong-form token must be rejected with HTTP 403');
        assert.equal(res.data?.success, false);
        assert.match(res.data?.message, /not authorized for this form/);

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
    });

    it('P0.9 Missing or insecure signing secret fails closed (HTTP 500)', async () => {
        const savedSecret = process.env.JWT_SECRET;
        try {
            delete process.env.JWT_SECRET;

            const token = jwt.sign({ leadId: targetLead._id.toString() }, savedSecret, { expiresIn: '1h' });
            const req = createMockReq(
                {
                    formData: { f_name: 'InsecureSecretTest', f_mobile: '9876500001' },
                    sourceMeta: { search: `?ref=${token}` }
                },
                { slug: 'p0-security-form' }
            );
            const res = createMockRes();

            await submitForm(req, res);

            assert.equal(res.statusCode, 500, 'Missing secret must fail closed with HTTP 500');
            assert.equal(res.data?.success, false);
            assert.match(res.data?.message, /Security configuration error/);

            // Test predictable secret fallback rejected
            process.env.JWT_SECRET = 'crm_secret_key';
            const res2 = createMockRes();
            await submitForm(req, res2);
            assert.equal(res2.statusCode, 500, 'Predictable crm_secret_key must fail closed');
        } finally {
            process.env.JWT_SECRET = savedSecret;
        }
    });

    it('P0.10 Valid signed token with future expiration updates ONLY its bound Lead', async () => {
        const validToken = jwt.sign(
            {
                leadId: targetLead._id.toString(),
                purpose: 'lead_reference',
                formSlug: 'p0-security-form'
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const metaSafeToken = validToken.replace(/\./g, '~');

        const req = createMockReq(
            {
                formData: {
                    f_name: 'LegitimatelyUpdatedName',
                    f_mobile: '9876500001',
                    f_notes: 'Authorized update via signed reference token'
                },
                sourceMeta: { search: `?ref=${metaSafeToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201, 'Must return HTTP 201 on authorized update');
        assert.equal(res.data?.success, true);
        assert.equal(res.data?.leadId?.toString(), targetLead._id.toString(), 'Must update target lead');

        const updatedTarget = await Lead.findById(targetLead._id);
        assert.equal(updatedTarget.firstName, 'LegitimatelyUpdatedName');
        assert.equal(updatedTarget.notes, 'Authorized update via signed reference token');

        const untouchedOther = await Lead.findById(otherLead._id);
        assert.equal(untouchedOther.firstName, 'OtherFirstName');
    });

    it('P0.11 Existing legitimate WhatsApp reference token flow (LeadTokenGenerator format) continues to work seamlessly', async () => {
        // Standard LeadTokenGenerator output: has leadId, iat, exp (365d), tildes instead of dots
        const payload = {
            leadId: targetLead._id.toString(),
            iat: Math.floor(Date.now() / 1000)
        };
        const rawToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });
        const whatsAppToken = rawToken.replace(/\./g, '~');

        const req = createMockReq(
            {
                formData: {
                    f_name: 'WhatsAppCustomerUpdate',
                    f_mobile: '9876500001',
                    f_notes: 'Updated from WhatsApp CTA button click'
                },
                sourceMeta: { search: `?ref=${whatsAppToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data?.success, true);
        assert.equal(res.data?.leadId?.toString(), targetLead._id.toString());

        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'WhatsAppCustomerUpdate');
        assert.equal(freshTarget.notes, 'Updated from WhatsApp CTA button click');
    });

    it('P0.12 Request with mismatched explicit leadId and signed token is forbidden (HTTP 403)', async () => {
        const tokenForTarget = jwt.sign(
            { leadId: targetLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const req = createMockReq(
            {
                leadId: otherLead._id.toString(),
                formData: { f_name: 'MismatchTest', f_mobile: '9876500001' },
                sourceMeta: { search: `?ref=${tokenForTarget}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 403, 'Mismatched token binding and explicit leadId must return HTTP 403');
        assert.equal(res.data?.success, false);
        assert.match(res.data?.message, /does not match signed reference token binding/);

        const freshTarget = await Lead.findById(targetLead._id);
        const freshOther = await Lead.findById(otherLead._id);
        assert.equal(freshTarget.firstName, 'VictimFirstName');
        assert.equal(freshOther.firstName, 'OtherFirstName');
    });

    it('P0.13 Existing public new-lead creation remains fully functional without token', async () => {
        const req = createMockReq(
            {
                formData: {
                    f_name: 'CompletelyNewPublicVisitor',
                    f_mobile: '9123456780',
                    f_notes: 'New walk-in requirement'
                }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data?.success, true);
        assert.ok(res.data?.leadId);

        const newLead = await Lead.findById(res.data.leadId);
        assert.ok(newLead, 'New lead must be created in MongoDB');
        assert.equal(newLead.firstName, 'CompletelyNewPublicVisitor');
        assert.equal(newLead.mobile, '9123456780');
    });

    it('P0.14 Protected fields (owner, tenantId, permissions) cannot be mutated via form submit', async () => {
        const validToken = jwt.sign(
            { leadId: targetLead._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const originalOwner = targetLead.owner.toString();
        const fakeOwner = new mongoose.Types.ObjectId().toString();

        const req = createMockReq(
            {
                formData: {
                    f_name: 'FieldTamperTest',
                    f_mobile: '9876500001',
                    owner: fakeOwner,
                    tenantId: 'MALICIOUS_TENANT',
                    role: 'SUPERADMIN',
                    isDeleted: true
                },
                sourceMeta: { search: `?ref=${validToken}` }
            },
            { slug: 'p0-security-form' }
        );
        const res = createMockRes();

        await submitForm(req, res);

        assert.equal(res.statusCode, 201);
        const freshTarget = await Lead.findById(targetLead._id);
        assert.equal(freshTarget.firstName, 'FieldTamperTest');
        assert.equal(freshTarget.owner.toString(), originalOwner, 'Owner must NOT be overwritten by form field payload');
        assert.equal(freshTarget.isDeleted, false, 'isDeleted must not be overwritten');
    });
});
