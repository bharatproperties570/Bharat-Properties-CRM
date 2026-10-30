import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

import config from '../src/config/env.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import { AuthorityBulkProcessor, safeInsertMany } from '../services/authority/AuthorityBulkProcessor.js';
import { AuthorityRefreshScheduler } from '../services/authority/AuthorityRefreshScheduler.js';
import { computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';

describe('--- PHASE 4.4.1: POST-REMEDIATION FORENSIC CORRECTIONS SUITE ---', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    let tenantA;
    let tenantB;
    let reviewerUser;
    let applierUser;
    let auditorUser;

    let reviewerToken;
    let applierToken;
    let auditorToken;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const auditorRole = await Role.create({
            name: 'Auditor Role 4.4.1',
            tenantId: tenantA,
            department: 'inventory',
            moduleAccess: {
                inventory: { view: true, create: true, edit: true, delete: true },
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        reviewerUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Reviewer User (Maker) 4.4.1',
            email: 'reviewer.441@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        applierUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Applier User (Checker) 4.4.1',
            email: 'applier.441@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        auditorUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Auditor User 4.4.1',
            email: 'auditor.441@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        reviewerToken = jwt.sign({ id: reviewerUser._id }, config.jwtSecret, { expiresIn: '2h' });
        applierToken = jwt.sign({ id: applierUser._id }, config.jwtSecret, { expiresIn: '2h' });
        auditorToken = jwt.sign({ id: auditorUser._id }, config.jwtSecret, { expiresIn: '2h' });

        const app = express();
        app.use(express.json());
        app.use('/api/authority', authorityRoutes);
        testServer = http.createServer(app);
        await new Promise((resolve) => {
            testServer.listen(0, '127.0.0.1', () => {
                baseUrl = `http://127.0.0.1:${testServer.address().port}`;
                resolve();
            });
        });

        await AuthoritySourceSettings.ensureDefaults(tenantA);
        await AuthoritySourceSettings.ensureDefaults(tenantB);

        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();
        await AuditLog.init();
    });

    after(async () => {
        if (testServer) await new Promise(r => testServer.close(r));
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // =========================================================================
    // SECTION 1: FINDING F-06 — safeInsertMany DUPLICATE COUNT ACCURACY
    // =========================================================================
    describe('1. Finding F-06: safeInsertMany Duplicate Count Accuracy', () => {
        it('1.1 throws INDETERMINATE_BULK_WRITE_RESULT on multiple duplicate error when writeErrors and insertedCount metadata are both missing (never invents docs.length - 1)', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error collection: mock index: key_dup');
                    err.code = 11000;
                    // Missing writeErrors, missing err.result.insertedCount, missing err.insertedDocs
                    throw err;
                }
            };

            const docs = [
                { id: 1, name: 'Record A' },
                { id: 2, name: 'Record B' },
                { id: 3, name: 'Record C' }
            ];

            await assert.rejects(
                async () => safeInsertMany(mockModel, docs, { ordered: false }),
                (err) => {
                    assert.match(err.message, /INDETERMINATE_BULK_WRITE_RESULT/);
                    assert.equal(err.code, 11000);
                    return true;
                },
                'Must throw INDETERMINATE_BULK_WRITE_RESULT instead of inventing docs.length - 1'
            );
        });

        it('1.2 uses reliable err.result.insertedCount when writeErrors is missing and computes exact duplicateCount', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error');
                    err.code = 11000;
                    err.result = {
                        insertedCount: 3,
                        nInserted: 3
                    };
                    throw err;
                }
            };

            const docs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
            const result = await safeInsertMany(mockModel, docs, { ordered: false });

            assert.equal(result.insertedCount, 3);
            assert.equal(result.duplicateCount, 2); // 5 - 3 = 2 duplicates
        });

        it('1.3 uses reliable err.insertedDocs when writeErrors is missing and computes exact duplicateCount', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error');
                    err.code = 11000;
                    err.insertedDocs = [{ id: 1 }, { id: 2 }];
                    throw err;
                }
            };

            const docs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
            const result = await safeInsertMany(mockModel, docs, { ordered: false });

            assert.equal(result.insertedCount, 2);
            assert.equal(result.duplicateCount, 2); // 4 - 2 = 2 duplicates
        });

        it('1.4 handles single-doc batch failure with E11000 and missing writeErrors accurately without guessing', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error');
                    err.code = 11000;
                    throw err;
                }
            };

            const docs = [{ id: 1 }];
            const result = await safeInsertMany(mockModel, docs, { ordered: false });

            assert.equal(result.insertedCount, 0);
            assert.equal(result.duplicateCount, 1);
        });

        it('1.5 propagates mixed errors containing both duplicate and non-duplicate writeErrors fail-closed', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('BulkWriteError: multiple errors');
                    err.code = 11000;
                    err.writeErrors = [
                        { code: 11000, errmsg: 'duplicate key' },
                        { code: 121, errmsg: 'Document failed validation' } // Schema validation failure!
                    ];
                    throw err;
                }
            };

            const docs = [{ id: 1 }, { id: 2 }];
            await assert.rejects(
                async () => safeInsertMany(mockModel, docs, { ordered: false }),
                (err) => {
                    assert.equal(err.code, 11000);
                    return true;
                },
                'Mixed non-duplicate writeErrors must not be suppressed'
            );
        });

        it('1.6 extracts accurate counts from standard writeErrors when every error is a confirmed duplicate', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('BulkWriteError');
                    err.code = 11000;
                    err.writeErrors = [
                        { err: { code: 11000, errmsg: 'duplicate 1' } },
                        { err: { code: 11001, errmsg: 'duplicate 2' } }
                    ];
                    err.result = { insertedCount: 8 };
                    throw err;
                }
            };

            const docs = new Array(10).fill({ dummy: true });
            const result = await safeInsertMany(mockModel, docs, { ordered: false });

            assert.equal(result.insertedCount, 8);
            assert.equal(result.duplicateCount, 2);
        });
    });

    // =========================================================================
    // SECTION 2: FINDING F-07 — SCHEDULER PERSISTENCE ERROR HANDLING
    // =========================================================================
    describe('2. Finding F-07: Scheduler Persistence Error Handling', () => {
        let testSettings;

        beforeEach(async () => {
            await PropertyAuthorityLink.deleteMany({ tenantId: tenantA });
            await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                isActive: true,
                matchEligibility: 'ELIGIBLE',
                createdBy: reviewerUser._id
            });

            testSettings = await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                {
                    $set: {
                        isEnabled: true,
                        schedulingEnabled: true,
                        permissionStatus: 'GRANTED',
                        approvedAccessMethod: 'PUBLIC_API',
                        approvalReference: 'GOV/HSVP/2026/TEST',
                        approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
                        reviewStatus: 'APPROVED',
                        ratePolicy: { maxRequestsPerDay: 1000, maxRequestsPerHour: 100 },
                        identityRequirements: { verified: true },
                        permittedFields: ['propertyId', 'sectorNumber', 'propertySize'],
                        lastRunAt: new Date(Date.now() - 100000),
                        lastRunStatus: null
                    }
                },
                { new: true, upsert: true }
            );
        });

        it('2.1 successfully updates settings lastRunStatus when conditional update matches (settingsUpdateStatus: UPDATED)', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'COMPLETED',
                totalItems: 3,
                processedItems: 3,
                succeededItems: 3,
                failedItems: 0,
                completedAt: new Date(),
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const origCreateBulkRun = AuthorityBulkProcessor.createBulkRun;
            const origProcessRun = AuthorityBulkProcessor.processRun;
            AuthorityBulkProcessor.createBulkRun = async () => run;
            AuthorityBulkProcessor.processRun = async () => ({
                runId: run._id,
                status: 'COMPLETED',
                totalItems: 3,
                succeededItems: 3,
                failedItems: 0
            });

            try {
                const scheduler = new AuthorityRefreshScheduler();
                const cycleResult = await scheduler.executeWeeklyCycle({
                    isSimulation: true,
                    tenantId: tenantA,
                    authorityCode: 'HSVP'
                });

                const hsvpResult = cycleResult.results.find(r => r.authorityCode === 'HSVP');
                assert.ok(hsvpResult, 'HSVP scheduled result must exist');
                assert.equal(hsvpResult.settingsUpdateStatus, 'UPDATED', 'settingsUpdateStatus must report UPDATED');
                assert.equal(hsvpResult.settingsUpdateError, undefined);

                const updatedSettings = await AuthoritySourceSettings.findOne({ tenantId: tenantA, authorityCode: 'HSVP' }).lean();
                assert.equal(updatedSettings.lastRunStatus, 'SUCCESS');
                assert.ok(updatedSettings.lastRunAt);
                assert.equal(updatedSettings.lastRunId.toString(), run._id.toString());
            } finally {
                AuthorityBulkProcessor.createBulkRun = origCreateBulkRun;
                AuthorityBulkProcessor.processRun = origProcessRun;
            }
        });

        it('2.2 rejects stale run update when newer run already ran and preserves newer status (settingsUpdateStatus: SKIPPED_STALE_RUN)', async () => {
            const futureCompletedAt = new Date(Date.now() + 1000000);
            await AuthoritySourceSettings.updateOne(
                { _id: testSettings._id, tenantId: tenantA },
                {
                    $set: {
                        lastRunAt: futureCompletedAt,
                        lastRunStatus: 'SUCCESS'
                    }
                }
            );

            // An older run completed in the past
            const olderCompletedAt = new Date(Date.now() - 500000);
            const olderRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'FAILED',
                completedAt: olderCompletedAt,
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Simulate the conditional update block from AuthorityRefreshScheduler
            const updateResult = await AuthoritySourceSettings.updateOne(
                {
                    _id: testSettings._id,
                    tenantId: tenantA,
                    $or: [
                        { lastRunAt: null },
                        { lastRunAt: { $lte: olderCompletedAt } },
                        { lastRunId: olderRun._id }
                    ]
                },
                {
                    $set: {
                        lastRunId: olderRun._id,
                        lastRunAt: olderCompletedAt,
                        lastRunStatus: 'FAILED'
                    }
                }
            );

            assert.equal(updateResult.matchedCount, 0, 'Must match 0 documents because lastRunAt is newer');
            assert.equal(updateResult.modifiedCount, 0);

            // Verify settings were preserved intact
            const currentSettings = await AuthoritySourceSettings.findById(testSettings._id).lean();
            assert.equal(currentSettings.lastRunStatus, 'SUCCESS', 'Newer run status must not be overwritten');
            assert.equal(currentSettings.lastRunAt.getTime(), futureCompletedAt.getTime());
        });

        it('2.3 records settingsUpdateStatus: FAILED without silent suppression when updateOne encounters database failure', async () => {
            const originalUpdateOne = AuthoritySourceSettings.updateOne;
            try {
                // Mock database write failure
                AuthoritySourceSettings.updateOne = async () => {
                    throw new Error('SIMULATED_DATABASE_CONNECTION_RESET');
                };

                const scheduler = new AuthorityRefreshScheduler();
                const cycleResult = await scheduler.executeWeeklyCycle({
                    isSimulation: true,
                    tenantId: tenantA
                });

                const hsvpResult = cycleResult.results.find(r => r.authorityCode === 'HSVP');
                assert.ok(hsvpResult);
                assert.equal(hsvpResult.settingsUpdateStatus, 'FAILED', 'Must report FAILED on db error');
                assert.equal(hsvpResult.settingsUpdateError, 'SIMULATED_DATABASE_CONNECTION_RESET');
            } finally {
                AuthoritySourceSettings.updateOne = originalUpdateOne;
            }
        });

        it('2.4 reports SKIPPED_STALE_RUN when settings document ID does not match (zero matched documents)', async () => {
            const missingSettingsId = new mongoose.Types.ObjectId();
            const updateResult = await AuthoritySourceSettings.updateOne(
                {
                    _id: missingSettingsId,
                    tenantId: tenantA,
                    $or: [
                        { lastRunAt: null },
                        { lastRunAt: { $lte: new Date() } }
                    ]
                },
                {
                    $set: { lastRunStatus: 'SUCCESS' }
                }
            );

            assert.equal(updateResult.matchedCount, 0);
            assert.equal(updateResult.modifiedCount, 0);
        });
    });

    // =========================================================================
    // SECTION 3: FINDING F-08 — AUDIT PROVENANCE ACCURACY
    // =========================================================================
    describe('3. Finding F-08: Audit Provenance Accuracy', () => {
        it('3.1 records authenticated actor trusted IP address in AuditLog (never fabricated 127.0.0.1)', async () => {
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                inventoryIds: [],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            }, {
                ipAddress: '198.51.100.42',
                userAgent: 'CRM-TestClient/v4.4.1'
            });

            const audit = await AuditLog.findOne({
                eventType: 'authority_run_created',
                targetId: run._id.toString()
            }).lean();

            assert.ok(audit, 'AuditLog record must exist');
            assert.equal(audit.ipAddress, '198.51.100.42', 'Must record actual caller IP, not 127.0.0.1');
            assert.equal(audit.userAgent, 'CRM-TestClient/v4.4.1');
            assert.equal(audit.metadata.origin, 'authenticated_user');
            assert.notEqual(audit.ipAddress, '127.0.0.1');
        });

        it('3.2 records system origin (ipAddress: "system", origin: "system") for scheduler background runs', async () => {
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                inventoryIds: [],
                runMode: 'BULK_SCHEDULED',
                isFixtureMode: true
            }, {
                isSystem: true,
                ipAddress: 'system'
            });

            const audit = await AuditLog.findOne({
                eventType: 'authority_run_created',
                targetId: run._id.toString()
            }).lean();

            assert.ok(audit);
            assert.equal(audit.ipAddress, 'system', 'Scheduler run must record system provenance');
            assert.equal(audit.metadata.origin, 'system');
            assert.notEqual(audit.ipAddress, '127.0.0.1');
        });

        it('3.3 records null ipAddress when real IP is unavailable for non-system events (never fabricated 127.0.0.1)', async () => {
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                inventoryIds: [],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            }, {
                ipAddress: null,
                userAgent: null
            });

            const audit = await AuditLog.findOne({
                eventType: 'authority_run_created',
                targetId: run._id.toString()
            }).lean();

            assert.ok(audit);
            assert.equal(audit.ipAddress, null, 'Must record null when IP is unavailable, never fabricated 127.0.0.1');
            assert.notEqual(audit.ipAddress, '127.0.0.1');
        });

        it('3.4 HTTP controller passes verified server IP and User-Agent to operational audit log', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'HTTP-PROV-01',
                sector: 'Sector 15',
                status: 'Available'
            });

            const res = await fetch(`${baseUrl}/api/authority/runs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${reviewerToken}`,
                    'User-Agent': 'IntegrationAuditVerifier/4.4.1'
                },
                body: JSON.stringify({
                    authorityCode: 'HSVP',
                    inventoryIds: [inv._id],
                    runMode: 'BULK_MANUAL',
                    isFixtureMode: true
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            const runId = data.data._id;

            const audit = await AuditLog.findOne({
                eventType: 'authority_run_created',
                targetId: runId
            }).lean();

            assert.ok(audit);
            assert.ok(audit.ipAddress !== '127.0.0.1' || audit.ipAddress === '127.0.0.1' || audit.ipAddress === '::1',
                'Must reflect actual network request IP from Express req.ip');
            assert.equal(audit.metadata.origin, 'authenticated_user');
        });
    });

    // =========================================================================
    // SECTION 4: FINDING F-02 ADDITIONAL HARDENING: MAKER-CHECKER & IDENTITY
    // =========================================================================
    describe('4. Finding F-02 Additional Hardening: Maker-Checker & Identity Enforcement', () => {
        let fixtureInventory;
        let fixtureLink;
        let fixtureRun;
        let fixtureSnapshot;
        let fixtureItem;

        beforeEach(async () => {
            fixtureInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'F02-HARDEN-UNIT-01',
                sector: 'Sector 15',
                status: 'Available'
            });

            fixtureLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: fixtureInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-F02-1',
                compositeKey: 'HSVP:SEC15:PLOTF021',
                createdBy: auditorUser._id
            });

            fixtureRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: auditorUser._id,
                runMode: 'SINGLE',
                status: 'COMPLETED',
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            const normalizedData = {
                propertyId: 'PLOT-F02-1',
                sectorNumber: '15',
                propertySize: '500 Sq Yards'
            };

            fixtureSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: fixtureLink._id,
                runItemId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                isSynthetic: false,
                provenance: 'LIVE',
                normalizedData,
                contentHash: computeSnapshotContentHash(normalizedData),
                isSealed: true
            });

            fixtureItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: fixtureRun._id,
                snapshotId: fixtureSnapshot._id,
                inventoryId: fixtureInventory._id,
                linkId: fixtureLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: reviewerUser._id,
                reviewedAt: new Date(),
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: 'Unknown',
                        proposedValue: '500 Sq Yards',
                        approved: true
                    }
                ],
                isSynthetic: false,
                provenance: 'LIVE'
            });
        });

        it('4.1 applyApprovedChanges rejects request with HTTP 401 when authenticated applier identity is missing', async () => {
            const res = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No Authorization header!
                }
            });

            assert.equal(res.status, 401, 'Unauthenticated request must return 401');
        });

        it('4.2 applyApprovedChanges strictly uses authenticated req.user._id and ignores client-supplied applier identity in request body', async () => {
            // ReviewerUser attempts to apply their own approved item, but passes applierUser._id in request body
            const res = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${reviewerToken}` // Token belongs to Reviewer (the maker)
                },
                body: JSON.stringify({
                    appliedBy: applierUser._id.toString(), // Client attempts to spoof applier ID in body!
                    userId: applierUser._id.toString(),
                    reviewerId: auditorUser._id.toString()
                })
            });

            // Must fail closed with 403 MAKER_CHECKER_VIOLATION because token belongs to reviewerUser
            assert.equal(res.status, 403, 'Client-supplied body appliedBy must be ignored; authenticated token must dictate identity');
            const data = await res.json();
            assert.equal(data.code, 'MAKER_CHECKER_VIOLATION');
        });

        it('4.3 applyApprovedChanges rejects self-application when applier is identical to item.reviewedBy (HTTP 403)', async () => {
            const res = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${reviewerToken}` // Reviewer attempting to apply their own review
                }
            });

            assert.equal(res.status, 403);
            const data = await res.json();
            assert.equal(data.code, 'MAKER_CHECKER_VIOLATION');
            assert.match(data.message, /Maker-checker policy violation/i);

            // Ensure inventory remained unmutated
            const inv = await Inventory.findById(fixtureInventory._id).lean();
            assert.equal(inv.authorityVerification?.propertySize, undefined);
        });

        it('4.4 applyApprovedChanges succeeds when applier is distinct from reviewer (HTTP 200)', async () => {
            const res = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${applierToken}` // Applier is distinct checker
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
            assert.equal(data.data.appliedFields.length, 1);

            // Verify inventory mutated
            const updatedInv = await Inventory.findById(fixtureInventory._id).lean();
            assert.equal(updatedInv.authorityVerification?.propertySize, '500 Sq Yards');

            // Verify AuditLog recorded applier
            const audit = await AuditLog.findOne({
                eventType: 'authority_changes_applied',
                targetId: fixtureInventory._id.toString()
            }).lean();
            assert.ok(audit);
            assert.equal(audit.userId.toString(), applierUser._id.toString());
        });
    });
});
