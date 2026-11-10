/**
 * PHASE 4.5-D (PR #69) FINAL NON-FORGEABLE DATABASE IDENTITY, TRUSTED PRINCIPAL,
 * EXACT AUDIT CLAIM & PRIVACY CLOSURE TEST SUITE
 *
 * Covers 6 Comprehensive Security Matrices:
 * Matrix 1: Factory-Only Ephemeral Database Identity and Prototype-Spoof Rejection
 * Matrix 2: Trusted Authenticated Principal & Genuine Owner Evidence
 * Matrix 3: Mandatory AuditLog Claim Association & Exact Target-Type Binding
 * Matrix 4: Exact Partial and Obfuscated Email Minimization
 * Matrix 5: Finite Nested Metadata and No Free-Text Contract
 * Matrix 6: Saga Compensation Failure Paths, Snapshot Integrity & Fence Enforcement
 */

process.env.NODE_ENV = 'test';

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import child_process from 'child_process';
import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';

import AuditLog, {
    maskScalarPII,
    validateControlledScalarValue,
    validateAuthorityMetadataValue,
    checkAuditImmutability,
    EMAIL_PII_PATTERN,
    EMAIL_STANDALONE_PATTERN,
    CONTROLLED_ROLE_CODES,
    CONTROLLED_AUDIT_REASONS,
    ALLOWED_CONTROLLED_PHRASES
} from '../models/AuditLog.js';

import AuthoritySourceSettings, {
    registerVerifiedEphemeralTestDatabase,
    unregisterVerifiedEphemeralTestDatabase,
    clearVerifiedEphemeralTestDatabases,
    isVerifiedEphemeralTestDatabase,
    createVerifiedEphemeralTestDatabase,
    createVerifiedEphemeralReplSet,
    _testOnlyResetAuthoritySettings,
    ALLOWED_CONTROLLED_NOTES
} from '../models/AuthoritySourceSettings.js';

import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Document from '../models/Document.js';
import '../models/Lookup.js';
import '../models/Team.js';
import { compensateApplySaga } from '../controllers/authorityVerification.controller.js';

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING
} from '../config/canonicalOrganization.js';

let mongoServer;
const CANONICAL_ORG_ID = new mongoose.Types.ObjectId(CANONICAL_ORGANIZATION_ID);
const CANONICAL_ORG_ID_STRING = CANONICAL_ORGANIZATION_ID_STRING;
const NON_CANONICAL_ORG_ID = new mongoose.Types.ObjectId('ffffffffffffffffffffffff');
const NON_CANONICAL_ORG_ID_STRING = 'ffffffffffffffffffffffff';

describe('PHASE 4.5-D (PR #69) FINAL SECURITY CLOSURE TEST SUITE', () => {
    let testAdminUser;
    let testReviewerUser;
    let testViewUser;
    let testBrokerUser;
    let testTargetInventory;
    let testDocument;

    before(async () => {
        mongoServer = await createVerifiedEphemeralTestDatabase();
        await mongoose.connect(mongoServer.getUri());

        const adminRole = await Role.create({
            name: 'Authority Admin Role 69',
            department: 'inventory',
            permissions: ['authorityVerification.admin', 'authorityVerification.manage'],
            isSystem: false
        });

        const reviewerRole = await Role.create({
            name: 'Authority Reviewer Role 69',
            department: 'inventory',
            permissions: ['authorityVerification.admin'],
            isSystem: false
        });

        const viewRole = await Role.create({
            name: 'Authority View Only Role 69',
            department: 'inventory',
            permissions: ['authorityVerification.view'],
            isSystem: false
        });

        const brokerRole = await Role.create({
            name: 'Authorized Broker Role 69',
            department: 'sales',
            permissions: [],
            isSystem: false
        });

        testAdminUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'Admin User 69',
            email: 'admin69@bharatproperties.test',
            password: 'Password123!',
            department: 'inventory',
            role: adminRole._id,
            isActive: true,
            status: 'active'
        });

        testReviewerUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'Reviewer User 69',
            email: 'reviewer69@bharatproperties.test',
            password: 'Password123!',
            department: 'inventory',
            role: reviewerRole._id,
            isActive: true,
            status: 'active'
        });

        testViewUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'View User 69',
            email: 'view69@bharatproperties.test',
            password: 'Password123!',
            department: 'inventory',
            role: viewRole._id,
            isActive: true,
            status: 'active'
        });

        testBrokerUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'Broker User 69',
            email: 'broker69@bharatproperties.test',
            password: 'Password123!',
            department: 'sales',
            role: brokerRole._id,
            isActive: true,
            status: 'active'
        });

        testTargetInventory = await Inventory.create({
            tenantId: CANONICAL_ORG_ID,
            title: 'Test Plot Sector 14 Panchkula PR69',
            propertyType: 'plot',
            status: 'Available',
            price: 7500000,
            sector: 'Sector 14',
            city: 'Panchkula'
        });

        testDocument = await Document.create({
            documentId: 'DOC-AUTH-PROOF-69',
            entityType: 'Inventory',
            entityId: testTargetInventory._id,
            tenantId: CANONICAL_ORG_ID,
            state: 'ACTIVE',
            metadata: {
                documentType: 'OWNER_WRITTEN_CONFIRMATION',
                name: 'Genuine Owner Proof PR69'
            }
        });
    });

    after(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            unregisterVerifiedEphemeralTestDatabase(mongoServer);
            await mongoServer.stop();
        }
        clearVerifiedEphemeralTestDatabases();
    });

    beforeEach(async () => {
        await _testOnlyResetAuthoritySettings({});
        await AuthoritySourceSettings.create([
            {
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                permissionStatus: 'NOT_OBTAINED',
                isEnabled: false,
                schedulingEnabled: false,
                contractVerificationStatus: 'NOT_VERIFIED',
                termsReviewed: false,
                commercialUseAuthorized: false
            },
            {
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'GMADA',
                permissionStatus: 'NOT_OBTAINED',
                isEnabled: false,
                schedulingEnabled: false,
                contractVerificationStatus: 'NOT_VERIFIED',
                termsReviewed: false,
                commercialUseAuthorized: false
            },
            {
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'CHD',
                permissionStatus: 'NOT_OBTAINED',
                isEnabled: false,
                schedulingEnabled: false,
                contractVerificationStatus: 'NOT_VERIFIED',
                termsReviewed: false,
                commercialUseAuthorized: false
            }
        ]);
    });

    // =========================================================================
    // MATRIX 1: Factory-Only Ephemeral Database Identity & Prototype-Spoof Rejection
    // =========================================================================
    describe('Matrix 1: Factory-Only Ephemeral Database Identity & Prototype-Spoof Rejection', () => {
        test('1.1: Active database created via trusted factory is verified', () => {
            const verified = isVerifiedEphemeralTestDatabase();
            assert.strictEqual(verified, true);
        });

        test('1.2: Object.create(child_process.ChildProcess.prototype) spoof throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const fakeChild = Object.create(child_process.ChildProcess.prototype);
            Object.assign(fakeChild, {
                pid: process.pid,
                killed: false,
                exitCode: null,
                signalCode: null,
                spawnfile: 'mongod',
                spawnargs: ['mongod', '--port', '27018']
            });

            const fakeServer = {
                state: 'running',
                _state: 'running',
                instanceInfo: {
                    port: 27018,
                    instance: { mongodProcess: fakeChild }
                },
                getUri: () => 'mongodb://127.0.0.1:27018/test'
            };

            assert.throws(
                () => { registerVerifiedEphemeralTestDatabase(fakeServer); },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
        });

        test('1.3: Combined prototype spoof (MongoMemoryServer + ChildProcess) with fake PID throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const fakeChild = Object.create(child_process.ChildProcess.prototype);
            Object.assign(fakeChild, {
                pid: process.pid,
                killed: false,
                exitCode: null,
                signalCode: null,
                spawnfile: 'mongod',
                spawnargs: ['mongod', '--port', '27019']
            });

            const protoSpoof = Object.create(MongoMemoryServer.prototype);
            Object.defineProperty(protoSpoof, 'state', { value: 'running', configurable: true });
            Object.defineProperty(protoSpoof, '_state', { value: 'running', configurable: true });
            Object.defineProperty(protoSpoof, 'instanceInfo', {
                value: {
                    port: 27019,
                    instance: { mongodProcess: fakeChild }
                },
                configurable: true
            });
            protoSpoof.getUri = () => 'mongodb://127.0.0.1:27019/test';

            assert.throws(
                () => { registerVerifiedEphemeralTestDatabase(protoSpoof); },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
        });

        test('1.4: Plain server object throws EPHEMERAL_DATABASE_REQUIRED', () => {
            assert.throws(
                () => { registerVerifiedEphemeralTestDatabase({ getUri: () => 'mongodb://127.0.0.1:27018/test' }); },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
        });

        test('1.5: Genuine server instance modified after factory creation (replaced mongodProcess) fails registration/verification', async () => {
            const fresh = await createVerifiedEphemeralTestDatabase();
            const originalProc = fresh.instanceInfo.instance.mongodProcess;
            try {
                // Tamper with genuine instance's child process reference
                const fakeProc = Object.create(child_process.ChildProcess.prototype);
                fresh.instanceInfo.instance.mongodProcess = fakeProc;

                assert.throws(
                    () => { registerVerifiedEphemeralTestDatabase(fresh); },
                    err => {
                        assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                        return true;
                    }
                );
            } finally {
                fresh.instanceInfo.instance.mongodProcess = originalProc;
                unregisterVerifiedEphemeralTestDatabase(fresh);
                await fresh.stop();
            }
        });

        test('1.6: Stopped server throws EPHEMERAL_DATABASE_REQUIRED on registration', async () => {
            const temp = await createVerifiedEphemeralTestDatabase();
            await temp.stop();
            try {
                assert.throws(
                    () => { registerVerifiedEphemeralTestDatabase(temp); },
                    err => {
                        assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                        return true;
                    }
                );
            } finally {
                unregisterVerifiedEphemeralTestDatabase(temp);
            }
        });

        test('1.7: Unregistered genuine server cannot pass isVerifiedEphemeralTestDatabase()', async () => {
            // Unregister current active server
            unregisterVerifiedEphemeralTestDatabase(mongoServer);
            try {
                assert.strictEqual(isVerifiedEphemeralTestDatabase(), false);
            } finally {
                // Re-register active server
                registerVerifiedEphemeralTestDatabase(mongoServer);
                assert.strictEqual(isVerifiedEphemeralTestDatabase(), true);
            }
        });

        test('1.8: createVerifiedEphemeralReplSet creates and registers genuine replica set', async () => {
            const repl = await createVerifiedEphemeralReplSet({ replSet: { count: 1 } });
            try {
                assert.ok(repl instanceof MongoMemoryReplSet);
                assert.strictEqual(repl.state, 'running');
            } finally {
                unregisterVerifiedEphemeralTestDatabase(repl);
                await repl.stop();
            }
        });

        test('1.9: createVerifiedEphemeralTestDatabase throws TEST_ONLY_CAPABILITY_PROHIBITED outside NODE_ENV=test', async () => {
            const origEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                await assert.rejects(
                    async () => { await createVerifiedEphemeralTestDatabase(); },
                    err => {
                        assert.strictEqual(err.code, 'TEST_ONLY_CAPABILITY_PROHIBITED');
                        return true;
                    }
                );
            } finally {
                process.env.NODE_ENV = origEnv;
            }
        });
    });

    // =========================================================================
    // MATRIX 2: Trusted Authenticated Principal & Genuine Owner Evidence
    // =========================================================================
    describe('Matrix 2: Trusted Authenticated Principal & Genuine Owner Evidence', () => {
        test('2.1: Missing trusted principal throws AUTHENTICATED_PRINCIPAL_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        actorId: testAdminUser._id.toString(),
                        claimedAuthorityRole: 'AUTHORIZED_BROKER',
                        evidenceReference: 'DOC-PROOF-001',
                        evidenceType: 'BROKER_ATTESTATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                        // No trustedPrincipal supplied
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHENTICATED_PRINCIPAL_REQUIRED');
                    return true;
                }
            );
        });

        test('2.2: Body-supplied authenticatedUser does NOT substitute for trustedPrincipal', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        authenticatedUser: { _id: testAdminUser._id.toString() }, // Body only!
                        claimedAuthorityRole: 'AUTHORIZED_BROKER',
                        evidenceReference: 'DOC-PROOF-001',
                        evidenceType: 'BROKER_ATTESTATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'AUTHENTICATED_PRINCIPAL_REQUIRED');
                    return true;
                }
            );
        });

        test('2.3: Claimed actorId mismatching trusted principal throws ACTOR_IMPERSONATION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testAdminUser,
                        actorId: new mongoose.Types.ObjectId().toString(), // Mismatched actor!
                        claimedAuthorityRole: 'AUTHORIZED_BROKER',
                        evidenceReference: 'DOC-PROOF-001',
                        evidenceType: 'BROKER_ATTESTATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_IMPERSONATION_PROHIBITED');
                    return true;
                }
            );
        });

        test('2.4: View-only authority role claiming OWNER_REPRESENTATIVE throws ACTOR_UNAUTHORIZED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testViewUser,
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: testDocument._id.toString(),
                        evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'ACTOR_UNAUTHORIZED');
                    return true;
                }
            );
        });

        test('2.5: Admin user claiming OWNER_REPRESENTATIVE without authentic Document artifact persists as UNVERIFIED_SELF_REPORT with status UNVERIFIED', async () => {
            const res = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                trustedPrincipal: testAdminUser,
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: 'REF-SYNTHETIC-STRING-001', // Arbitrary string, not in Document collection
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            assert.strictEqual(res.userReportedEvidence.statementType, 'UNVERIFIED_SELF_REPORT');
            assert.strictEqual(res.userReportedEvidence.verificationStatus, 'UNVERIFIED');
            assert.strictEqual(res.userReportedEvidence.reportedBy.toString(), testAdminUser._id.toString());
        });

        test('2.6: Representative with genuine Document artifact sets REPRESENTATIVE_STATEMENT and PENDING_WRITTEN_REFERENCE', async () => {
            const res = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                trustedPrincipal: testAdminUser,
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: testDocument._id.toString(),
                targetInventoryId: testTargetInventory._id.toString(),
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            assert.strictEqual(res.userReportedEvidence.statementType, 'REPRESENTATIVE_STATEMENT');
            assert.strictEqual(res.userReportedEvidence.verificationStatus, 'PENDING_WRITTEN_REFERENCE');
        });

        test('2.7: Genuine Document artifact linked to a different Inventory throws INVENTORY_ID_MISMATCH', async () => {
            const otherInventoryId = new mongoose.Types.ObjectId();
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testAdminUser,
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: testDocument._id.toString(),
                        targetInventoryId: otherInventoryId.toString(), // Mismatched!
                        evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVENTORY_ID_MISMATCH');
                    return true;
                }
            );
        });

        test('2.8: Invalid evidenceVersion (float, boolean, zero) throws EVIDENCE_VERSION_REQUIRED', async () => {
            for (const badVer of [1.5, true, false, 0, -1, '2.5']) {
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.recordOwnerConfirmation({
                            tenantId: CANONICAL_ORG_ID,
                            authorityCode: 'HSVP',
                            trustedPrincipal: testBrokerUser,
                            claimedAuthorityRole: 'AUTHORIZED_BROKER',
                            evidenceReference: 'DOC-001',
                            evidenceType: 'BROKER_ATTESTATION',
                            evidenceVersion: badVer,
                            notes: 'EVIDENCE_REVIEWED'
                        });
                    },
                    err => {
                        assert.strictEqual(err.code, 'EVIDENCE_VERSION_REQUIRED');
                        return true;
                    }
                );
            }
        });

        test('2.9: Submitting verificationStatus: VALIDATED throws UNAUTHORIZED_STATUS_OVERRIDE', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testAdminUser,
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: testDocument._id.toString(),
                        evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED',
                        verificationStatus: 'VALIDATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_STATUS_OVERRIDE');
                    return true;
                }
            );
        });

        test('2.10: Submitter cannot approve their own evidence in validateOwnerConfirmationEvidence (Maker-Checker)', async () => {
            // First submit pending evidence
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                trustedPrincipal: testAdminUser,
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: testDocument._id.toString(),
                targetInventoryId: testTargetInventory._id.toString(),
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            // Same admin user tries to validate
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.validateOwnerConfirmationEvidence({
                        authorityCode: 'HSVP',
                        trustedPrincipal: testAdminUser,
                        evidenceArtifactId: testDocument._id
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'MAKER_CHECKER_VIOLATION');
                    return true;
                }
            );
        });

        test('2.11: Separate reviewer validates owner confirmation evidence to VALIDATED', async () => {
            // First record pending evidence by submitter testAdminUser
            await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                trustedPrincipal: testAdminUser,
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: testDocument._id.toString(),
                targetInventoryId: testTargetInventory._id.toString(),
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            const validated = await AuthoritySourceSettings.validateOwnerConfirmationEvidence({
                authorityCode: 'HSVP',
                trustedPrincipal: testReviewerUser,
                evidenceArtifactId: testDocument._id
            });

            assert.strictEqual(validated.userReportedEvidence.verificationStatus, 'VALIDATED');
            assert.strictEqual(validated.userReportedEvidence.validatedBy.toString(), testReviewerUser._id.toString());
            assert.ok(validated.userReportedEvidence.validatedAt instanceof Date);
        });
    });

    // =========================================================================
    // MATRIX 3: Mandatory AuditLog Claim Association & Exact Target-Type Binding
    // =========================================================================
    describe('Matrix 3: Mandatory AuditLog Claim Association & Exact Target-Type Binding', () => {
        let testClaimId;
        let testRunItem;
        let testRunId;

        beforeEach(async () => {
            testClaimId = new mongoose.Types.ObjectId();
            testRunId = new mongoose.Types.ObjectId();

            testRunItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: testRunId,
                inventoryId: testTargetInventory._id,
                authorityCode: 'HSVP',
                status: 'PENDING',
                applyState: 'APPLYING',
                applyClaim: {
                    claimId: testClaimId,
                    stage: 'INVENTORY_MUTATING',
                    workerId: 'worker-69-a',
                    claimedAt: new Date(),
                    leaseExpiresAt: new Date(Date.now() + 60000),
                    fenceToken: 1
                }
            });
        });

        test('3.1: Missing metadata.claimId throws AUDIT_LOG_IMMUTABLE', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'PropertyVerificationRunItem',
                targetId: testRunItem._id,
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString()
                    // Missing claimId
                }
            });

            await assert.rejects(
                async () => {
                    await checkAuditImmutability(
                        { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                        AuditLog,
                        {
                            update: {
                                $set: {
                                    status: 'compensated',
                                    'metadata.compensated': true,
                                    'metadata.compensationClaimId': testClaimId.toString(),
                                    'metadata.compensatedAt': new Date()
                                }
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );

            // Assert persisted document remains unchanged
            const unchanged = await AuditLog.findById(auditDoc._id).lean();
            assert.strictEqual(unchanged.status, 'success');
        });

        test('3.2: Target type authority_settings during saga compensation throws AUDIT_LOG_IMMUTABLE', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'authority_settings',
                targetId: testRunItem._id,
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString(),
                    claimId: testClaimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await checkAuditImmutability(
                        { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                        AuditLog,
                        {
                            update: {
                                $set: {
                                    status: 'compensated',
                                    'metadata.compensated': true,
                                    'metadata.compensationClaimId': testClaimId.toString(),
                                    'metadata.compensatedAt': new Date()
                                }
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('3.3: Target type Inventory with RunItem ID throws AUDIT_LOG_IMMUTABLE', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'inventory',
                targetId: testRunItem._id, // RunItem ID instead of inventoryId!
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString(),
                    claimId: testClaimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await checkAuditImmutability(
                        { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                        AuditLog,
                        {
                            update: {
                                $set: {
                                    status: 'compensated',
                                    'metadata.compensated': true,
                                    'metadata.compensationClaimId': testClaimId.toString(),
                                    'metadata.compensatedAt': new Date()
                                }
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('3.4: Target type PropertyVerificationRunItem with Inventory ID throws AUDIT_LOG_IMMUTABLE', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'PropertyVerificationRunItem',
                targetId: testTargetInventory._id, // Inventory ID instead of RunItem ID!
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString(),
                    claimId: testClaimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await checkAuditImmutability(
                        { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                        AuditLog,
                        {
                            update: {
                                $set: {
                                    status: 'compensated',
                                    'metadata.compensated': true,
                                    'metadata.compensationClaimId': testClaimId.toString(),
                                    'metadata.compensatedAt': new Date()
                                }
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    return true;
                }
            );
        });

        test('3.5: Exact matching target and claim on PropertyVerificationRunItem succeeds', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'PropertyVerificationRunItem',
                targetId: testRunItem._id,
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString(),
                    claimId: testClaimId.toString()
                }
            });

            // Must not throw
            await checkAuditImmutability(
                { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                AuditLog,
                {
                    update: {
                        $set: {
                            status: 'compensated',
                            'metadata.compensated': true,
                            'metadata.compensationClaimId': testClaimId.toString(),
                            'metadata.compensatedAt': new Date()
                        }
                    }
                }
            );
        });

        test('3.6: Exact matching target and claim on Inventory target succeeds', async () => {
            const auditDoc = await AuditLog.create({
                tenantId: CANONICAL_ORG_ID,
                eventType: 'authority_changes_applied',
                description: 'Authority verification changes applied from HSVP',
                status: 'success',
                targetType: 'inventory',
                targetId: testTargetInventory._id,
                metadata: {
                    tenantId: CANONICAL_ORG_ID_STRING,
                    authorityCode: 'HSVP',
                    itemId: testRunItem._id.toString(),
                    claimId: testClaimId.toString()
                }
            });

            // Must not throw
            await checkAuditImmutability(
                { _id: auditDoc._id, eventType: 'authority_changes_applied' },
                AuditLog,
                {
                    update: {
                        $set: {
                            status: 'compensated',
                            'metadata.compensated': true,
                            'metadata.compensationClaimId': testClaimId.toString(),
                            'metadata.compensatedAt': new Date()
                        }
                    }
                }
            );
        });
    });

    // =========================================================================
    // MATRIX 4: Exact Partial and Obfuscated Email Minimization
    // =========================================================================
    describe('Matrix 4: Exact Partial and Obfuscated Email Minimization', () => {
        const emailTestCases = [
            { input: 'citizen@example.com', expected: '[EMAIL_MINIMIZED]' },
            { input: 'c***@example.com', expected: '[EMAIL_MINIMIZED]' },
            { input: 'o***@g***.com', expected: '[EMAIL_MINIMIZED]' },
            { input: 'u***@gmail.com', expected: '[EMAIL_MINIMIZED]' },
            { input: '***@***.com', expected: '[EMAIL_MINIMIZED]' },
            { input: 'user@domain.c*m', expected: '[EMAIL_MINIMIZED]' },
            { input: 'CITIZEN.OFFICIAL@EXAMPLE.COM', expected: '[EMAIL_MINIMIZED]' },
            { input: '  o***@g***.com  ', expected: '[EMAIL_MINIMIZED]' },
            { input: 'Inquiry from citizen@example.com and o***@g***.com received', expected: 'Inquiry from [EMAIL_MINIMIZED] and [EMAIL_MINIMIZED] received' }
        ];

        for (const tc of emailTestCases) {
            test(`4.1: maskScalarPII minimizes '${tc.input}'`, () => {
                const res = maskScalarPII(tc.input);
                assert.strictEqual(res, tc.expected);
            });
        }

        test('4.2: Repeated sanitization is idempotent', () => {
            const first = maskScalarPII('o***@g***.com');
            assert.strictEqual(first, '[EMAIL_MINIMIZED]');
            const second = maskScalarPII(first);
            assert.strictEqual(second, '[EMAIL_MINIMIZED]');
        });

        test('4.3: validateControlledScalarValue rejects raw and obfuscated domain emails', () => {
            assert.throws(
                () => { validateControlledScalarValue('citizen@example.com', 'test.field'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
            assert.throws(
                () => { validateControlledScalarValue('o***@g***.com', 'test.field'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('4.4: Valid ObjectIds, UUIDs and hashes are never altered by maskScalarPII', () => {
            const validObjectId = new mongoose.Types.ObjectId().toString();
            const validUuid = '123e4567-e89b-12d3-a456-426614174000';
            const validHash = 'a1bbaec0664e745c3f12ab6261d3ec754c211f61';

            assert.strictEqual(maskScalarPII(validObjectId), validObjectId);
            assert.strictEqual(maskScalarPII(validUuid), validUuid);
            assert.strictEqual(maskScalarPII(validHash), validHash);
        });
    });

    // =========================================================================
    // MATRIX 5: Finite Nested Metadata and No Free-Text Contract
    // =========================================================================
    describe('Matrix 5: Finite Nested Metadata and No Free-Text Contract', () => {
        test('5.1: Lowercase arbitrary narrative throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(
                () => { validateControlledScalarValue('supporting documents received', 'metadata.notes'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.2: Mixed-case narrative throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(
                () => { validateControlledScalarValue('We received all documents yesterday', 'metadata.notes'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.3: Uppercase underscore names (e.g. RAJESH_KUMAR) throw FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(
                () => { validateControlledScalarValue('RAJESH_KUMAR', 'metadata.reporter'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.4: Honorific plus personal name throws FREE_TEXT_AUDIT_PROHIBITED', () => {
            assert.throws(
                () => { validateControlledScalarValue('Shri Rajesh Kumar', 'metadata.contact'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
            assert.throws(
                () => { validateControlledScalarValue('Smt Sunita Devi', 'metadata.contact'); },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.5: Arbitrary free-text notes in recordOwnerConfirmation throw FREE_TEXT_AUDIT_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID,
                        authorityCode: 'HSVP',
                        trustedPrincipal: testBrokerUser,
                        claimedAuthorityRole: 'AUTHORIZED_BROKER',
                        evidenceReference: 'DOC-001',
                        evidenceType: 'BROKER_ATTESTATION',
                        evidenceVersion: 1,
                        notes: 'arbitrary free text note from broker' // Uncontrolled!
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.6: Valid controlled note templates and reasons pass validation', () => {
            for (const note of ALLOWED_CONTROLLED_NOTES) {
                assert.doesNotThrow(() => {
                    validateControlledScalarValue(note, 'metadata.notes');
                });
            }
        });
    });

    // =========================================================================
    // MATRIX 6: Saga Compensation Failure Paths, Snapshot Integrity & Fence Enforcement
    // =========================================================================
    describe('Matrix 6: Saga Compensation Failure Paths, Snapshot Integrity & Fence Enforcement', () => {
        let testClaimId;
        let testRunItem;

        beforeEach(async () => {
            testClaimId = new mongoose.Types.ObjectId();
            testRunItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: testTargetInventory._id,
                authorityCode: 'HSVP',
                status: 'PENDING',
                applyState: 'APPLYING',
                applyClaim: {
                    claimId: testClaimId,
                    stage: 'INVENTORY_MUTATED',
                    workerId: 'worker-69-b',
                    claimedAt: new Date(),
                    leaseExpiresAt: new Date(Date.now() + 60000),
                    fenceToken: 10,
                    compensation: {
                        inventoryBefore: {
                            'authorityVerification.status': 'NOT_VERIFIED',
                            'authorityVerification.verifiedAt': null
                        }
                    }
                }
            });
        });

        test('6.1: Non-existent RunItem throws RUN_ITEM_NOT_FOUND', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: testTargetInventory._id.toString(),
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'RUN_ITEM_NOT_FOUND');
                    return true;
                }
            );
        });

        test('6.2: Missing mandatory IDs throws INVALID_COMPENSATION_PARAMETERS', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: null,
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: testTargetInventory._id.toString(),
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_COMPENSATION_PARAMETERS');
                    return true;
                }
            );
        });

        test('6.3: Non-canonical organization ID throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: testRunItem._id.toString(),
                        tenantId: NON_CANONICAL_ORG_ID_STRING,
                        inventoryId: testTargetInventory._id.toString(),
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('6.4: Mismatched Inventory ID throws INVENTORY_ID_MISMATCH', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: testRunItem._id.toString(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: new mongoose.Types.ObjectId().toString(), // Different Inventory
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVENTORY_ID_MISMATCH');
                    return true;
                }
            );
        });

        test('6.5: Claim preemption by newer reconciler returns preempted: true without side effects', async () => {
            const res = await compensateApplySaga({
                itemId: testRunItem._id.toString(),
                tenantId: CANONICAL_ORG_ID_STRING,
                inventoryId: testTargetInventory._id.toString(),
                claimId: new mongoose.Types.ObjectId().toString(), // Different claim
                stage: 'INVENTORY_MUTATED'
            });

            assert.strictEqual(res.success, false);
            assert.strictEqual(res.preempted, true);

            // Assert persisted RunItem was not altered
            const unchanged = await PropertyVerificationRunItem.findById(testRunItem._id).lean();
            assert.strictEqual(unchanged.applyState, 'APPLYING');
        });

        test('6.6: Older worker fenceToken returns preempted: true without side effects', async () => {
            const res = await compensateApplySaga({
                itemId: testRunItem._id.toString(),
                tenantId: CANONICAL_ORG_ID_STRING,
                inventoryId: testTargetInventory._id.toString(),
                claimId: testClaimId.toString(),
                stage: 'INVENTORY_MUTATED',
                fenceToken: 5 // Stale fenceToken (current is 10)
            });

            assert.strictEqual(res.success, false);
            assert.strictEqual(res.preempted, true);
            assert.strictEqual(res.reason, 'CLAIM_PREEMPTED');
        });

        test('6.7: Rollback snapshot attempting to mutate tenantId or _id throws INVALID_COMPENSATION_SNAPSHOT', async () => {
            // Update RunItem compensation snapshot to include illegal tenantId mutation
            await PropertyVerificationRunItem.updateOne(
                { _id: testRunItem._id },
                {
                    $set: {
                        'applyClaim.compensation.inventoryBefore': {
                            tenantId: NON_CANONICAL_ORG_ID,
                            'authorityVerification.status': 'NOT_VERIFIED'
                        }
                    }
                }
            );

            // Attempting compensation must fail closed
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: testRunItem._id.toString(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: testTargetInventory._id.toString(),
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.ok(err.message.includes('INVALID_COMPENSATION_SNAPSHOT') || err.message.includes('Compensation failed'));
                    return true;
                }
            );

            // Verify target inventory tenantId was not mutated
            const safeInv = await Inventory.findById(testTargetInventory._id).lean();
            assert.strictEqual(safeInv.tenantId.toString(), CANONICAL_ORG_ID_STRING);
        });

        test('6.8: Rollback snapshot with non-authority field throws INVALID_COMPENSATION_SNAPSHOT', async () => {
            await PropertyVerificationRunItem.updateOne(
                { _id: testRunItem._id },
                {
                    $set: {
                        'applyClaim.compensation.inventoryBefore': {
                            price: 1000, // Unauthorized field!
                            'authorityVerification.status': 'NOT_VERIFIED'
                        }
                    }
                }
            );

            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: testRunItem._id.toString(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: testTargetInventory._id.toString(),
                        claimId: testClaimId.toString(),
                        stage: 'INVENTORY_MUTATED'
                    });
                },
                err => {
                    assert.ok(err.message.includes('INVALID_COMPENSATION_SNAPSHOT') || err.message.includes('Compensation failed'));
                    return true;
                }
            );
        });
    });
});
