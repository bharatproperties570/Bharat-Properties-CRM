import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuthorityBulkProcessor, { safeInsertMany } from '../services/authority/AuthorityBulkProcessor.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';
import { computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';
import {
    reconcileInterruptedApplySaga,
    compensateApplySaga
} from '../controllers/authorityVerification.controller.js';
import config from '../src/config/env.js';

describe('--- PHASE 4.4.3: RESIDUAL RELIABILITY REMEDIATION SUITE ---', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    let tenantA;
    let tenantB;
    let auditorRole;
    let reviewerUser;
    let applierUser;
    let reviewerToken;
    let applierToken;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(mongoUri);

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        auditorRole = await Role.create({
            _id: new mongoose.Types.ObjectId(),
            name: 'Auditor_Role_443',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            permissions: [
                'authority.verify',
                'authority.review',
                'authority.apply',
                'inventory.read',
                'inventory.write'
            ],
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        reviewerUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Reviewer Maker 4.4.3',
            email: 'reviewer.443@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        applierUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Applier Checker 4.4.3',
            email: 'applier.443@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        reviewerToken = jwt.sign({ id: reviewerUser._id }, config.jwtSecret, { expiresIn: '2h' });
        applierToken = jwt.sign({ id: applierUser._id }, config.jwtSecret, { expiresIn: '2h' });

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
    // SECTION 1: R-01 WORKER LEASE RENEWAL AND FENCING
    // =========================================================================
    describe('1. R-01: Worker Lease Renewal & Fencing Protection', () => {
        it('1.1 renewItemLease successfully extends lease for matching worker and claimToken', async () => {
            const initialExpiry = new Date(Date.now() + 5000);
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_alpha',
                workerClaimToken: 'token_alpha',
                workerFenceToken: 1,
                leaseExpiresAt: initialExpiry,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const renewed = await AuthorityBulkProcessor.renewItemLease(
                item._id,
                tenantA,
                'worker_alpha',
                'token_alpha'
            );

            assert.ok(renewed, 'Lease must be renewed');
            assert.ok(renewed.leaseExpiresAt.getTime() > initialExpiry.getTime(), 'New lease expiry must be in the future');
        });

        it('1.2 updateItemTerminalState rejects write when worker lease has expired (STALE_WORKER)', async () => {
            const expiredDate = new Date(Date.now() - 5000);
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_slow',
                workerClaimToken: 'token_slow',
                workerFenceToken: 1,
                leaseExpiresAt: expiredDate,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.updateItemTerminalState({
                        itemId: item._id,
                        tenantId: tenantA,
                        workerId: 'worker_slow',
                        claimToken: 'token_slow',
                        fenceToken: 1,
                        status: 'SUCCEEDED',
                        updateData: { matchStatus: 'EXACT_MATCH' }
                    });
                },
                (err) => {
                    assert.equal(err.code, 'STALE_WORKER');
                    return true;
                },
                'Must throw STALE_WORKER when lease is expired'
            );

            const persisted = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(persisted.status, 'PROCESSING', 'Status must not be corrupted by expired worker');
        });

        it('1.3 updateItemTerminalState rejects write when workerFenceToken mismatches (preempted worker)', async () => {
            const activeExpiry = new Date(Date.now() + 30000);
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_preempted',
                workerClaimToken: 'token_preempted',
                workerFenceToken: 2, // Current active fence token in DB is 2
                leaseExpiresAt: activeExpiry,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Worker attempts write with older fence token 1
            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.updateItemTerminalState({
                        itemId: item._id,
                        tenantId: tenantA,
                        workerId: 'worker_preempted',
                        claimToken: 'token_preempted',
                        fenceToken: 1, // Older fence token
                        status: 'SUCCEEDED',
                        updateData: { matchStatus: 'EXACT_MATCH' }
                    });
                },
                (err) => {
                    assert.equal(err.code, 'STALE_WORKER');
                    return true;
                },
                'Must reject write with outdated fence token'
            );
        });

        it('1.4 worker crash & restart: new worker claims with incremented fenceToken, stale worker write rejected', async () => {
            const expiredDate = new Date(Date.now() - 1000);
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed',
                workerClaimToken: 'token_crashed',
                workerFenceToken: 1,
                leaseExpiresAt: expiredDate,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // New worker claims expired item atomically
            const newClaimTime = new Date();
            const newClaimToken = 'token_replacement';
            const reclaimed = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    $or: [
                        { status: 'PENDING' },
                        { status: 'PROCESSING', leaseExpiresAt: { $lt: newClaimTime } }
                    ]
                },
                {
                    $set: {
                        status: 'PROCESSING',
                        claimedBy: 'worker_replacement',
                        workerClaimToken: newClaimToken,
                        claimedAt: newClaimTime,
                        leaseExpiresAt: new Date(newClaimTime.getTime() + 30000)
                    },
                    $inc: { workerFenceToken: 1 }
                },
                { new: true }
            );

            assert.equal(reclaimed.claimedBy, 'worker_replacement');
            assert.equal(reclaimed.workerFenceToken, 2);

            // Stale crashed worker wakes up late and attempts write with old credentials
            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.updateItemTerminalState({
                        itemId: item._id,
                        tenantId: tenantA,
                        workerId: 'worker_crashed',
                        claimToken: 'token_crashed',
                        fenceToken: 1,
                        status: 'FAILED',
                        updateData: { errorMessage: 'Stale error write' }
                    });
                },
                (err) => {
                    assert.equal(err.code, 'STALE_WORKER');
                    return true;
                }
            );

            // Replaced worker completes successfully
            const finalUpdated = await AuthorityBulkProcessor.updateItemTerminalState({
                itemId: item._id,
                tenantId: tenantA,
                workerId: 'worker_replacement',
                claimToken: newClaimToken,
                fenceToken: 2,
                status: 'SUCCEEDED',
                updateData: { matchStatus: 'EXACT_MATCH' }
            });

            assert.equal(finalUpdated.status, 'SUCCEEDED');
            assert.equal(finalUpdated.matchStatus, 'EXACT_MATCH');
        });
    });

    // =========================================================================
    // SECTION 2: R-02 INVENTORY SUBDOCUMENT RESET RACE
    // =========================================================================
    describe('2. R-02: Inventory Subdocument Reset Race Prevention', () => {
        let fixtureInventory;
        let fixtureLink;
        let fixtureRun;
        let fixtureSnapshot;
        let fixtureItem;

        beforeEach(async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
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
                        permittedFields: ['propertyId', 'sectorNumber', 'propertySize']
                    }
                },
                { new: true, upsert: true }
            );

            fixtureInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'R02-UNIT-01',
                sector: 'Sector 15',
                status: 'Available',
                authorityVerification: null // Explicitly null to verify atomic initialization
            });

            fixtureLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: fixtureInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-R02-1',
                urbanEstate: 'Urban Estate 15',
                compositeKey: 'HSVP:SEC15:PLOTR021',
                createdBy: reviewerUser._id
            });

            fixtureRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: reviewerUser._id,
                runMode: 'SINGLE',
                status: 'COMPLETED',
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            const normalizedData = {
                propertyId: 'PLOT-R02-1',
                sectorNumber: '15',
                propertySize: '300 Sq Yards'
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
                        currentValue: null,
                        proposedValue: '300 Sq Yards',
                        approved: true
                    }
                ],
                isSynthetic: false,
                provenance: 'LIVE'
            });
        });

        it('2.1 concurrent duplicate apply calls: exactly one succeeds with 200, concurrent fails closed with 409', async () => {
            const [res1, res2] = await Promise.all([
                fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${applierToken}`
                    }
                }),
                fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${applierToken}`
                    }
                })
            ]);

            const statuses = [res1.status, res2.status].sort();
            assert.deepEqual(statuses, [200, 409], 'Exactly one request must succeed (200) and concurrent must receive 409');

            const inv = await Inventory.findById(fixtureInventory._id).lean();
            assert.equal(inv.authorityVerification.propertySize, '300 Sq Yards');
            assert.ok(inv.authorityVerification.applyClaimId, 'applyClaimId must be set to the winning claim');
        });

        it('2.2 tenant isolation: Tenant B cannot apply or mutate Tenant A inventory', async () => {
            const tenantBUser = await User.create({
                _id: new mongoose.Types.ObjectId(),
                tenantId: tenantB,
                fullName: 'Tenant B Applier',
                email: 'tenantb.applier@crm.test',
                password: 'hashed_password',
                department: 'inventory',
                role: auditorRole._id,
                isActive: true
            });
            const tenantBToken = jwt.sign({ id: tenantBUser._id }, config.jwtSecret, { expiresIn: '2h' });

            const res = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tenantBToken}`
                }
            });

            assert.equal(res.status, 404, 'Cross-tenant apply must return 404');
        });
    });

    // =========================================================================
    // SECTION 3: R-03 RECONCILER CRASH RECOVERY
    // =========================================================================
    describe('3. R-03: Reconciler Crash Recovery & Idempotency', () => {
        let interruptedItem;
        let interruptedInventory;

        beforeEach(async () => {
            interruptedInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'RECON-CRASH-01',
                sector: 'Sector 15',
                status: 'Available',
                authorityVerification: {
                    applyClaimId: new mongoose.Types.ObjectId(),
                    propertySize: 'MUTATED_BEFORE_CRASH'
                }
            });

            const originalClaimId = interruptedInventory.authorityVerification.applyClaimId;
            const expiredTime = new Date(Date.now() - 10000);

            interruptedItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: interruptedInventory._id,
                linkId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                applyState: 'APPLYING',
                applied: false,
                applyClaim: {
                    claimId: originalClaimId,
                    fenceToken: 1,
                    leaseExpiresAt: expiredDateHelper(-5000),
                    stage: 'RECONCILING', // Simulated: previous reconciler crashed mid-reconciliation!
                    stageBeforeReconciliation: 'INVENTORY_MUTATED',
                    compensation: {
                        inventoryBefore: {
                            'authorityVerification.propertySize': 'ORIGINAL_UNMUTATED_VALUE'
                        }
                    }
                }
            });
        });

        function expiredDateHelper(offsetMs) {
            return new Date(Date.now() + offsetMs);
        }

        it('3.1 reconciler resumes after previous reconciler crash when lease has expired', async () => {
            const outcome = await reconcileInterruptedApplySaga(interruptedItem._id, tenantA);
            assert.equal(outcome.reconciled, true);
            assert.equal(outcome.action, 'COMPENSATED');

            const item = await PropertyVerificationRunItem.findById(interruptedItem._id);
            assert.equal(item.applyState, 'FAILED');
            assert.equal(item.applyClaim.stage, 'COMPENSATED');

            const inv = await Inventory.findById(interruptedInventory._id);
            assert.equal(inv.authorityVerification.propertySize, 'ORIGINAL_UNMUTATED_VALUE', 'Inventory must be restored to pre-mutation state');
            assert.equal(inv.authorityVerification.applyClaimId, null);
        });

        it('3.2 reconciler execution is idempotent: second execution returns ALREADY_COMPLETED', async () => {
            await reconcileInterruptedApplySaga(interruptedItem._id, tenantA);
            const secondOutcome = await reconcileInterruptedApplySaga(interruptedItem._id, tenantA);

            assert.equal(secondOutcome.reconciled, false);
            assert.equal(secondOutcome.reason, 'NOT_ELIGIBLE_OR_LEASE_ACTIVE');
        });
    });

    // =========================================================================
    // SECTION 4: R-04 MANDATORY AUDIT ID & PERSISTENCE CRASH WINDOW
    // =========================================================================
    describe('4. R-04: Mandatory Audit ID & Persistence Crash Window', () => {
        it('4.1 compensateApplySaga discovers audit record by claimId even when RunItem crashed before persisting auditId', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const invId = new mongoose.Types.ObjectId();
            const itemId = new mongoose.Types.ObjectId();

            // Simulate: AuditLog was successfully created during apply
            const createdAudit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                userId: applierUser._id,
                targetType: 'inventory',
                targetId: invId.toString(),
                description: 'Pre-crash applied changes',
                metadata: {
                    claimId: claimId.toString(),
                    itemId: itemId.toString()
                },
                status: 'success'
            });

            // Simulate Inventory was mutated with claimId
            const inv = await Inventory.create({
                _id: invId,
                tenantId: tenantA,
                unitNo: 'AUDIT-CRASH-01',
                sector: 'Sector 15',
                status: 'Available',
                authorityVerification: {
                    applyClaimId: claimId,
                    propertySize: 'MUTATED'
                }
            });

            // Process crashed right before persisting compensation.auditId into RunItem
            const outcome = await compensateApplySaga({
                itemId,
                tenantId: tenantA,
                inventoryId: invId,
                claimId,
                stage: 'INVENTORY_MUTATED',
                compensation: {
                    inventoryBefore: { 'authorityVerification.propertySize': null },
                    auditId: null // Missing due to crash!
                },
                errorMsg: 'Simulated post-audit crash compensation'
            });

            // Check compensation audit was recorded with link to original audit
            const compAudit = await AuditLog.findOne({
                eventType: 'authority_changes_apply_compensated',
                targetId: invId.toString()
            }).lean();

            assert.ok(compAudit, 'Compensation audit record must be recorded');
            const before = compAudit.changes?.before || compAudit.metadata?.before;
            assert.ok(before, 'Compensation audit before block must exist');
            assert.equal(before.originalAuditId, createdAudit._id.toString(), 'Must find and link original auditId via claimId');

            // Original audit must be updated to compensated
            const updatedOriginalAudit = await AuditLog.findById(createdAudit._id).lean();
            assert.equal(updatedOriginalAudit.status, 'compensated');
            assert.equal(updatedOriginalAudit.metadata.compensated, true);
        });
    });

    // =========================================================================
    // SECTION 5: R-05 DUPLICATE-LINK RECONCILIATION
    // =========================================================================
    describe('5. R-05: Duplicate-Link Reconciliation', () => {
        beforeEach(async () => {
            try {
                await PropertyAuthorityLink.collection.dropIndex('tenantId_1_inventoryId_1_authorityCode_1');
            } catch (e) {
                // Ignore if index does not exist
            }
        });

        it('5.1 detects duplicate links, selects deterministic canonical link, and updates references', async () => {
            const sharedInventoryId = new mongoose.Types.ObjectId();

            // Canonical link: verified identity + snapshot
            const canonicalSnapshotId = new mongoose.Types.ObjectId();
            const canonicalLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: sharedInventoryId,
                authorityCode: 'HSVP',
                propertyId: 'PLOT-100',
                sectorNumber: '15',
                urbanEstate: 'Urban Estate 15',
                compositeKey: 'HSVP:SEC15:PLOT100',
                identityVerified: true,
                latestSnapshotId: canonicalSnapshotId,
                isActive: true,
                createdBy: reviewerUser._id
            });

            // Duplicate link 1: unverified, no snapshot, older
            const duplicateLink1 = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: sharedInventoryId,
                authorityCode: 'HSVP',
                propertyId: 'PLOT-100',
                sectorNumber: '15',
                urbanEstate: 'Urban Estate 15',
                compositeKey: 'HSVP:SEC15:PLOT100',
                identityVerified: false,
                isActive: true,
                createdBy: reviewerUser._id
            });

            // RunItem referencing duplicate link 1
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: sharedInventoryId,
                linkId: duplicateLink1._id, // Points to duplicate!
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Execute duplicate link reconciliation
            const reconReport = await PropertyAuthorityLink.reconcileDuplicateLinks(tenantA);

            assert.equal(reconReport.duplicateSetsCount, 1);
            assert.equal(reconReport.canonicalLinksCount, 1);
            assert.equal(reconReport.reconciledDuplicatesCount, 1);
            assert.equal(reconReport.updatedReferencesCount, 1);

            // Canonical link must remain active
            const freshCanonical = await PropertyAuthorityLink.findById(canonicalLink._id);
            assert.equal(freshCanonical.isActive, true);

            // Duplicate link must be deactivated and point to canonical
            const freshDuplicate = await PropertyAuthorityLink.findById(duplicateLink1._id);
            assert.equal(freshDuplicate.isActive, false);
            assert.equal(freshDuplicate.matchEligibility, 'INELIGIBLE');
            assert.equal(freshDuplicate.duplicateOfLinkId.toString(), canonicalLink._id.toString());

            // RunItem reference must be updated to canonical link (no dangling references!)
            const updatedRunItem = await PropertyVerificationRunItem.findById(runItem._id);
            assert.equal(updatedRunItem.linkId.toString(), canonicalLink._id.toString(), 'RunItem reference must be migrated to canonical link');
        });

        it('5.2 tenant isolation: Tenant A reconciliation does not touch Tenant B links', async () => {
            const tenantBInventoryId = new mongoose.Types.ObjectId();
            const tenantBLink1 = await PropertyAuthorityLink.create({
                tenantId: tenantB,
                inventoryId: tenantBInventoryId,
                authorityCode: 'HSVP',
                propertyId: 'PLOT-B1',
                sectorNumber: '20',
                urbanEstate: 'Urban Estate 20',
                compositeKey: 'HSVP:SEC20:PLOTB1',
                isActive: true,
                createdBy: reviewerUser._id
            });
            const tenantBLink2 = await PropertyAuthorityLink.create({
                tenantId: tenantB,
                inventoryId: tenantBInventoryId,
                authorityCode: 'HSVP',
                propertyId: 'PLOT-B1',
                sectorNumber: '20',
                urbanEstate: 'Urban Estate 20',
                compositeKey: 'HSVP:SEC20:PLOTB1',
                isActive: true,
                createdBy: reviewerUser._id
            });

            // Reconcile Tenant A only
            await PropertyAuthorityLink.reconcileDuplicateLinks(tenantA);

            // Tenant B links must be completely untouched
            const checkB1 = await PropertyAuthorityLink.findById(tenantBLink1._id);
            const checkB2 = await PropertyAuthorityLink.findById(tenantBLink2._id);
            assert.equal(checkB1.isActive, true);
            assert.equal(checkB2.isActive, true);
        });
    });

    // =========================================================================
    // SECTION 6: R-06 MIXED BULK-WRITE ERROR HANDLING
    // =========================================================================
    describe('6. R-06: Mixed Bulk-Write Error Handling', () => {
        it('6.1 propagates mixed duplicate and non-duplicate writeErrors fail-closed', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('BulkWriteError with mixed errors');
                    err.code = 11000;
                    err.writeErrors = [
                        { code: 11000, errmsg: 'E11000 duplicate key error' },
                        { code: 121, errmsg: 'Document failed validation' } // Non-duplicate validation error!
                    ];
                    throw err;
                }
            };

            await assert.rejects(
                async () => safeInsertMany(mockModel, [{ a: 1 }, { a: 2 }]),
                (err) => {
                    assert.equal(err.code, 11000);
                    return true;
                },
                'Mixed errors must propagate immediately'
            );
        });

        it('6.2 propagates network/database connection errors without treating as duplicate', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('MongoNetworkTimeoutError: connection timed out');
                    err.name = 'MongoNetworkTimeoutError';
                    throw err;
                }
            };

            await assert.rejects(
                async () => safeInsertMany(mockModel, [{ a: 1 }]),
                (err) => err.name === 'MongoNetworkTimeoutError'
            );
        });

        it('6.3 throws INDETERMINATE_BULK_WRITE_RESULT on multi-doc batch with missing driver metadata', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error');
                    err.code = 11000;
                    // No writeErrors, no err.result, no err.insertedDocs
                    throw err;
                }
            };

            await assert.rejects(
                async () => safeInsertMany(mockModel, [{ id: 1 }, { id: 2 }, { id: 3 }]),
                (err) => {
                    assert.ok(err.message.includes('INDETERMINATE_BULK_WRITE_RESULT'));
                    assert.equal(err.code, 11000);
                    return true;
                }
            );
        });

        it('6.4 handles single-doc duplicate error with exact 0 inserted, 1 duplicate count', async () => {
            const mockModel = {
                insertMany: async () => {
                    const err = new Error('E11000 duplicate key error');
                    err.code = 11000;
                    throw err;
                }
            };

            const result = await safeInsertMany(mockModel, [{ single: true }]);
            assert.equal(result.insertedCount, 0);
            assert.equal(result.duplicateCount, 1);
        });
    });
});
