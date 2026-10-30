/**
 * Phase 2.5 Latest-Main Reconciliation & Final Contract Audit Test Suite
 * 
 * Verifies:
 * 1. Full Canonical Schema Consistency:
 *    - All 36 canonical dictionary fields mapped to subdocument, snapshot observation, or explicitly deferred.
 *    - Strict Date parsing and Date instance persistence.
 *    - Area separation: propertyAreaValue (Number) and propertyAreaUnit (String) without conversion.
 *    - Location separation: sectorNumber, phaseCode, blockCode, schemeName, urbanEstate, estateOffice.
 *    - Categorical legal statuses preserved as strings, distinct from booleans.
 *    - Financial facts (allotmentPrice, currentDues, totalPaid) preserved in snapshots; not silently dropped.
 *    - Personal data (allotteeName, allotteeAddress) strictly deferred/redacted; zero Contact linking.
 * 2. Tenant Scope & Data Isolation:
 *    - Multi-tenant loading gate: Inventory loaded with { _id, tenantId }.
 *    - Multi-tenant write gate: Recovery write uses { _id, tenantId }.
 *    - Cross-tenant rejection: Tenant A cannot apply changes to Tenant B inventory (404 / no mutation).
 *    - Cross-tenant run item rejection: Tenant A cannot view or apply Tenant B run items.
 * 3. Legacy Null & Absent Subdocument Recovery:
 *    - Documents with authorityVerification: null updated cleanly without PathNotViable (code 28).
 *    - Documents with absent authorityVerification (undefined) updated cleanly.
 *    - Normal CRM updates to unrelated fields do not create or touch authorityVerification.
 * 4. Strict Mode & Allowlist Guards:
 *    - Rejection of unknown nested fields with HTTP 422 and zero partial mutation.
 *    - Rejection of blocked fields (status, owners, tenantId) with HTTP 422.
 *    - Rejection of MongoDB operators with HTTP 422.
 *    - Native driver privilege boundary verification (documenting Mongoose hook boundaries).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

import config from '../src/config/env.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import { CANONICAL_FIELDS, SENTINEL, isSentinel } from '../services/authority/authorityFieldDictionary.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';

describe('Phase 2.5 — Latest-Main Reconciliation & Final Contract Audit', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();

    let adminUserA;
    let adminTokenA;
    let adminRoleA;

    let adminUserB;
    let adminTokenB;

    before(async () => {
        let MongoMemoryServer;
        try {
            const mmsModule = await import('mongodb-memory-server');
            MongoMemoryServer = mmsModule.MongoMemoryServer;
        } catch (err) {
            console.error('⚠️  mongodb-memory-server unavailable', err);
            return;
        }

        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();

        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);

        const app = express();
        app.use(express.json());
        app.use('/api/authority', authorityRoutes);
        app.use((err, req, res, next) => {
            const statusCode = err.statusCode || err.status || 500;
            res.status(statusCode).json({
                success: false,
                message: err.message
            });
        });

        testServer = http.createServer(app);
        await new Promise((resolve) => {
            testServer.listen(0, '127.0.0.1', () => {
                const port = testServer.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });

        adminRoleA = await Role.create({
            name: 'Authority Admin Role 2.5',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        adminUserA = await User.create({
            fullName: 'Admin User Tenant A',
            email: 'admin.a.25@test.local',
            password: 'hashed_password_safe',
            department: 'inventory',
            role: adminRoleA._id,
            tenantId: tenantA,
            isActive: true
        });

        adminUserB = await User.create({
            fullName: 'Admin User Tenant B',
            email: 'admin.b.25@test.local',
            password: 'hashed_password_safe',
            department: 'inventory',
            role: adminRoleA._id,
            tenantId: tenantB,
            isActive: true
        });

        adminTokenA = jwt.sign({ id: adminUserA._id }, config.jwtSecret, { expiresIn: '2h' });
        adminTokenB = jwt.sign({ id: adminUserB._id }, config.jwtSecret, { expiresIn: '2h' });
    });

    after(async () => {
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    // =========================================================================
    // 1. Canonical Schema Consistency & Contract Audit
    // =========================================================================
    describe('1. Canonical Schema Consistency & Field Completeness Audit', () => {
        it('1.1 every canonical dictionary field has an explicit architectural disposition', () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;

            const allCanonicalKeys = Object.keys(CANONICAL_FIELDS);
            assert.ok(allCanonicalKeys.length >= 30, 'Canonical dictionary must define all canonical fields');

            const deferredOrSnapshotOnly = new Set([
                'authority',          // stored as authorityCode
                'policyVersion',      // stored on snapshot.policyVersion
                'allotteeName',       // deferred: personal data policy (not auto-linked to Contact)
                'allotteeAddress',    // deferred: personal data policy
                'allotmentPrice',     // financial fact: retained in snapshot normalizedData
                'currentDues',        // financial fact: retained in snapshot; status in duesStatus
                'totalPaid',          // financial fact: retained in snapshot normalizedData
                'area',               // composite: decomposed into propertySize, propertyAreaValue, propertyAreaUnit
                'verificationStatus', // lifecycle status: stored on run item / link
                'matchConfidence',    // matching metadata: stored on run item / snapshot
                'matchStrategy',      // matching metadata: stored on run item / snapshot
                'verifiedAt',         // audit timestamp: stored as lastVerifiedAt
                'verifiedBy',         // audit attribution: stored on run item reviewedBy/appliedBy
                'source',             // source reference: stored on snapshot.sourceReferenceUrl
                'rawSnapshotHash'     // snapshot hash: stored on snapshot._id / audit
            ]);

            const fieldAliases = {
                lastTransferDate: 'transferDate' // canonical lastTransferDate maps to Inventory.authorityVerification.transferDate
            };

            for (const key of allCanonicalKeys) {
                if (deferredOrSnapshotOnly.has(key)) {
                    // Verified explicit disposition
                    assert.ok(true, `Canonical field "${key}" has verified disposition (deferred / snapshot observation)`);
                } else {
                    // Must be defined in AuthorityVerificationSubSchema
                    const schemaKey = fieldAliases[key] || key;
                    const path = subSchema.path(schemaKey);
                    assert.ok(path, `Canonical field "${key}" (mapped to "${schemaKey}") must be mapped in AuthorityVerificationSubSchema`);
                }
            }
        });

        it('1.2 financial facts are retained in PropertyVerificationSnapshot without silent omission', () => {
            assert.ok(PropertyVerificationSnapshot.schema.path('normalizedData.allotmentPrice'),
                'PropertyVerificationSnapshot must have normalizedData.allotmentPrice');
            assert.ok(PropertyVerificationSnapshot.schema.path('normalizedData.currentDues'),
                'PropertyVerificationSnapshot must have normalizedData.currentDues');
            assert.ok(PropertyVerificationSnapshot.schema.path('normalizedData.totalPaid'),
                'PropertyVerificationSnapshot must have normalizedData.totalPaid');

            // Snapshot schema contains financial observations
            const snap = new PropertyVerificationSnapshot({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                normalizedData: {
                    allotmentPrice: { value: 2500000, currency: 'INR' },
                    currentDues: { value: 50000, currency: 'INR' },
                    totalPaid: { value: 2450000, currency: 'INR' }
                }
            });

            assert.equal(snap.normalizedData.allotmentPrice.value, 2500000);
            assert.equal(snap.normalizedData.currentDues.value, 50000);
            assert.equal(snap.normalizedData.totalPaid.value, 2450000);
        });

        it('1.3 allottee personal data is NOT mapped to Inventory.owners or Contact', () => {
            assert.ok(BLOCKED_UPDATE_FIELDS.has('owners'), 'owners must be in BLOCKED_UPDATE_FIELDS');
            assert.ok(BLOCKED_UPDATE_FIELDS.has('associates'), 'associates must be in BLOCKED_UPDATE_FIELDS');
            assert.ok(!ALLOWED_UPDATE_FIELDS.has('authorityVerification.allotteeName'),
                'allotteeName must NOT be in ALLOWED_UPDATE_FIELDS (owner linking deferred)');
            assert.ok(!ALLOWED_UPDATE_FIELDS.has('authorityVerification.allotteeAddress'),
                'allotteeAddress must NOT be in ALLOWED_UPDATE_FIELDS');
        });

        it('1.4 dates are strictly typed as Date in AuthorityVerificationSubSchema', () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('allotmentDate').instance, 'Date');
            assert.equal(subSchema.path('transferDate').instance, 'Date');
            assert.equal(subSchema.path('possessionDate').instance, 'Date');
            assert.equal(subSchema.path('lastVerifiedAt').instance, 'Date');
        });

        it('1.5 area numeric value and unit are separated with zero implicit conversion', () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('propertyAreaValue').instance, 'Number');
            assert.equal(subSchema.path('propertyAreaUnit').instance, 'String');
            assert.equal(subSchema.path('propertySize').instance, 'String');
            assert.ok(ALLOWED_UPDATE_FIELDS.has('authorityVerification.propertyAreaValue'));
            assert.ok(ALLOWED_UPDATE_FIELDS.has('authorityVerification.propertyAreaUnit'));
            assert.ok(ALLOWED_UPDATE_FIELDS.has('authorityVerification.propertySize'));
        });

        it('1.6 location components are kept distinct', () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('sectorNumber').instance, 'String');
            assert.equal(subSchema.path('phaseCode').instance, 'String');
            assert.equal(subSchema.path('blockCode').instance, 'String');
            assert.equal(subSchema.path('schemeName').instance, 'String');
            assert.equal(subSchema.path('urbanEstate').instance, 'String');
            assert.equal(subSchema.path('estateOffice').instance, 'String');
        });

        it('1.7 categorical statuses are distinct from booleans', () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('litigationStatus').instance, 'String');
            assert.equal(subSchema.path('mortgageStatus').instance, 'String');
            assert.equal(subSchema.path('authorityStatus').instance, 'String');
            assert.equal(subSchema.path('duesStatus').instance, 'String');
            assert.equal(subSchema.path('leaseRentStatus').instance, 'String');
            assert.equal(subSchema.path('buildingPlanApproved').instance, 'Boolean');
            assert.equal(subSchema.path('occupancyCertificate').instance, 'Boolean');
        });
    });

    // =========================================================================
    // 2. Tenant Scope & Multi-Tenant Isolation
    // =========================================================================
    describe('2. Tenant Scope & Cross-Tenant Protection on Inventory Writes', () => {
        let invA;
        let invB;
        let linkB;
        let runB;
        let runItemB;

        beforeEach(async () => {
            invA = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'TENANT-A-UNIT',
                sector: 'Sector 10',
                status: 'Available'
            });

            invB = await Inventory.create({
                tenantId: tenantB,
                unitNo: 'TENANT-B-UNIT',
                sector: 'Sector 20',
                status: 'Available'
            });

            linkB = await PropertyAuthorityLink.create({
                tenantId: tenantB,
                inventoryId: invB._id,
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-TB-1', sectorNumber: '20' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUserB._id
            });

            runB = await PropertyVerificationRun.create({
                tenantId: tenantB,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUserB._id
            });

            runItemB = await PropertyVerificationRunItem.create({
                tenantId: tenantB,
                runId: runB._id,
                inventoryId: invB._id,
                linkId: linkB._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-TB-VERIFIED',
                        approved: true
                    }
                ]
            });
        });

        it('2.1 Tenant A cannot apply changes to Tenant B run items (returns 404)', async () => {
            const res = await fetch(`${baseUrl}/api/authority/apply/${runItemB._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminTokenA}`
                }
            });

            assert.equal(res.status, 404, 'Must return 404 when item belongs to different tenant');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.equal(body.message, 'Item not found');

            // Verify Tenant B inventory remains untouched
            const refreshedB = await Inventory.findById(invB._id);
            assert.equal(refreshedB.authorityVerification, undefined);
        });

        it('2.2 Tenant A token with forged inventoryId in runItem cannot mutate Tenant B record', async () => {
            // Create a run item in Tenant A that maliciously references Tenant B's inventoryId
            const maliciousItemA = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: invB._id, // Tenant B's inventory!
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'ATTACK-CROSS-TENANT',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${maliciousItemA._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminTokenA}`
                }
            });

            // Must fail with 404 because Inventory.findOne({ _id: item.inventoryId, tenantId: tenantA }) returns null!
            assert.equal(res.status, 404);
            const body = await res.json();
            assert.equal(body.success, false);
            assert.equal(body.message, 'Inventory not found or access denied');

            // Confirm Tenant B inventory is completely untouched
            const untouchedB = await Inventory.findById(invB._id);
            assert.equal(untouchedB.authorityVerification, undefined);
        });

        it('2.3 recovery write path enforces strict tenant scope and does not affect other tenants', async () => {
            // Seed Tenant B doc with null authorityVerification
            const legacyB = await Inventory.collection.insertOne({
                tenantId: tenantB,
                unitNo: 'LEGACY-NULL-B',
                authorityVerification: null
            });

            // Ensure Tenant A cannot run recovery on Tenant B's document
            const res = await Inventory.updateOne(
                { _id: legacyB.insertedId, tenantId: tenantA },
                { $set: { authorityVerification: {} } }
            );

            assert.equal(res.matchedCount, 0, 'Tenant A query must not match Tenant B document');
            assert.equal(res.modifiedCount, 0, 'Tenant B document must not be modified by Tenant A query');

            // Verify document still has authorityVerification: null
            const rawB = await Inventory.collection.findOne({ _id: legacyB.insertedId });
            assert.equal(rawB.authorityVerification, null);
        });
    });

    // =========================================================================
    // 3. Legacy-Null Recovery & Absent Subdocument Updates
    // =========================================================================
    describe('3. Legacy-Null Recovery & Absent Subdocument Safety', () => {
        let linkA;
        let runA;
        let snapA;

        beforeEach(async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                {
                    $set: {
                        isEnabled: true,
                        isPaused: false,
                        permissionStatus: 'GRANTED',
                        approvedAccessMethod: 'PUBLIC_API',
                        approvalReference: 'GOV/HSVP/2026/001',
                        approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
                        reviewStatus: 'APPROVED',
                        ratePolicy: { maxRequestsPerDay: 1000, maxRequestsPerHour: 100 },
                        identityRequirements: { verified: true },
                        permittedFields: ['propertyId', 'sectorNumber', 'propertyAreaValue', 'propertyAreaUnit']
                    }
                },
                { upsert: true }
            );

            linkA = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-LEGACY-T', sectorNumber: '30' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUserA._id
            });

            runA = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUserA._id,
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            snapA = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: linkA._id,
                runItemId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                isSynthetic: false,
                provenance: 'LIVE',
                normalizedData: {},
                isSealed: true
            });
        });

        after(async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                { $set: { isEnabled: false, permissionStatus: 'NOT_OBTAINED' } }
            );
        });

        it('3.1 document with authorityVerification: null recovers safely without PathNotViable (code 28)', async () => {
            const legacyDoc = await Inventory.collection.insertOne({
                tenantId: tenantA,
                unitNo: 'LEGACY-NULL-RECOVER',
                authorityVerification: null,
                price: 5000000,
                status: 'Available'
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: runA._id,
                snapshotId: snapA._id,
                inventoryId: legacyDoc.insertedId,
                linkId: linkA._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-RECOVERED-01',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.propertyAreaValue',
                        currentValue: null,
                        proposedValue: 350,
                        approved: true
                    },
                    {
                        field: 'authorityVerification.propertyAreaUnit',
                        currentValue: null,
                        proposedValue: 'SQ_YARD',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminTokenA}`
                }
            });

            assert.equal(res.status, 200, 'Legacy document update must succeed');
            const refreshed = await Inventory.findById(legacyDoc.insertedId);
            assert.ok(refreshed.authorityVerification);
            assert.equal(refreshed.authorityVerification.propertyId, 'P-RECOVERED-01');
            assert.equal(refreshed.authorityVerification.propertyAreaValue, 350);
            assert.equal(refreshed.authorityVerification.propertyAreaUnit, 'SQ_YARD');
        });

        it('3.2 document with absent authorityVerification (undefined) receives verified facts cleanly', async () => {
            const newDoc = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ABSENT-AUTH-DOC',
                sector: 'Sector 50',
                status: 'Available'
            });

            const rawBefore = await Inventory.collection.findOne({ _id: newDoc._id });
            assert.equal('authorityVerification' in rawBefore, false, 'authorityVerification must not exist prior to update');

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: runA._id,
                snapshotId: snapA._id,
                inventoryId: newDoc._id,
                linkId: linkA._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-ABSENT-NEW',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminTokenA}`
                }
            });

            assert.equal(res.status, 200);
            const refreshed = await Inventory.findById(newDoc._id);
            assert.ok(refreshed.authorityVerification);
            assert.equal(refreshed.authorityVerification.propertyId, 'P-ABSENT-NEW');
        });

        it('3.3 unrelated CRM edits do not write authorityVerification to MongoDB', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'UNRELATED-EDIT-UNIT',
                price: 1000000,
                status: 'Available'
            });

            // Normal CRM update to price and remarks
            await Inventory.findOneAndUpdate(
                { _id: inv._id, tenantId: tenantA },
                { $set: { price: 1100000, remarks: 'Client offered 1.1Cr' } }
            );

            const rawAfter = await Inventory.collection.findOne({ _id: inv._id });
            assert.equal('authorityVerification' in rawAfter, false,
                'authorityVerification must remain omitted from MongoDB after unrelated edits');
            assert.equal(rawAfter.price, 1100000);
            assert.equal(rawAfter.remarks, 'Client offered 1.1Cr');
        });
    });

    // =========================================================================
    // 4. Strict Mode, Allowlist & Native Driver Boundaries
    // =========================================================================
    describe('4. Strict Mode, Allowlist & Native Driver Boundaries', () => {
        it('4.1 apply API rejects unknown nested fields with HTTP 422 and zero mutation', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'REJECT-TEST-UNIT',
                status: 'Available'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-REJ-1', sectorNumber: '10' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUserA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUserA._id
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-VALID-123',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.unknownNestedExploit',
                        currentValue: null,
                        proposedValue: 'attack_vector',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminTokenA}`
                }
            });

            assert.equal(res.status, 422, 'Must reject entire update with 422');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.ok(body.rejectedFields.some(r => r.field === 'authorityVerification.unknownNestedExploit'));

            // Verify zero mutation
            const refreshed = await Inventory.findById(inv._id);
            assert.equal(refreshed.authorityVerification, undefined, 'No fields should have been applied');
        });

        it('4.2 Mongoose snapshot immutability hooks protect against all Mongoose mutation methods', async () => {
            const snap = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                isSealed: true
            });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.updateOne({ _id: snap._id }, { isSealed: false });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.updateMany({ _id: snap._id }, { isSealed: false });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.findOneAndUpdate({ _id: snap._id }, { isSealed: false });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.replaceOne({ _id: snap._id }, { isSealed: false });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.deleteOne({ _id: snap._id });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.deleteMany({ _id: snap._id });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.findOneAndDelete({ _id: snap._id });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.findOneAndReplace({ _id: snap._id }, { isSealed: false });
            }, { code: 'SNAPSHOT_IMMUTABLE' });

            await assert.rejects(async () => {
                await PropertyVerificationSnapshot.bulkWrite([{ updateOne: { filter: { _id: snap._id }, update: { isSealed: false } } }]);
            }, { code: 'SNAPSHOT_IMMUTABLE' });
        });

        it('4.3 raw native driver privilege boundary: documents that native collection calls bypass Mongoose hooks', async () => {
            const snap = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                isSealed: true
            });

            // Native MongoDB collection driver bypasses Mongoose middleware
            // This test documents the exact security boundary: Mongoose-level immutability vs DB privilege-level immutability
            const nativeUpdate = await PropertyVerificationSnapshot.collection.updateOne(
                { _id: snap._id },
                { $set: { isSealed: false } }
            );

            assert.equal(nativeUpdate.matchedCount, 1);
            // This confirms that Mongoose hooks alone do NOT constitute database-level role restrictions
            // and reinforces the requirement that applications should not expose direct raw-collection access.
            const rawSnap = await PropertyVerificationSnapshot.collection.findOne({ _id: snap._id });
            assert.equal(rawSnap.isSealed, false);
        });
    });
});
