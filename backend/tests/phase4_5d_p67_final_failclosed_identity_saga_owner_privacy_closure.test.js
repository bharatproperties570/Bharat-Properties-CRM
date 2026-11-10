/**
 * PHASE 4.5-D (PR #68) FINAL FAIL-CLOSED SECURITY REMEDIATION & UNIFIED ACCEPTANCE TEST SUITE
 *
 * Covers 6 Comprehensive Security Matrices:
 * Matrix 1: Ephemeral Database Identity Must Be Non-Forgeable (Child process validation, secret tokens, factories)
 * Matrix 2: Saga Compensation Strictly Fail-Closed & Zero Side Effects
 * Matrix 3: AuditLog Immutability — Strict Metadata Tenant, Authority, Target & Claim Binding
 * Matrix 4: Authentic Owner Confirmation — Trusted Principal, Strict Roles & Genuine Evidence
 * Matrix 5: Exact Email Minimization
 * Matrix 6: Removal of Arbitrary Free-Text and Personal Names from Metadata
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
    CONTROLLED_ROLE_CODES,
    CONTROLLED_AUDIT_REASONS
} from '../models/AuditLog.js';

import AuthoritySourceSettings, {
    registerVerifiedEphemeralTestDatabase,
    unregisterVerifiedEphemeralTestDatabase,
    clearVerifiedEphemeralTestDatabases,
    isVerifiedEphemeralTestDatabase,
    createVerifiedEphemeralTestDatabase,
    createVerifiedEphemeralReplSet,
    _testOnlyResetAuthoritySettings
} from '../models/AuthoritySourceSettings.js';

import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
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

describe('PHASE 4.5-D (PR #68) FINAL FAIL-CLOSED SECURITY REMEDIATION', () => {
    let testAdminUser;
    let testViewUser;
    let testActorUser;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        registerVerifiedEphemeralTestDatabase(mongoServer);
        await mongoose.connect(mongoServer.getUri());

        const adminRole = await Role.create({
            name: 'Authority Admin Role 68',
            department: 'inventory',
            permissions: ['authorityVerification.admin', 'authorityVerification.manage'],
            isSystem: false
        });

        const viewRole = await Role.create({
            name: 'Authority View Only Role 68',
            department: 'inventory',
            permissions: ['authorityVerification.view'],
            isSystem: false
        });

        testAdminUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'Admin User 68',
            email: 'admin68@bharatproperties.internal',
            password: 'Password123!',
            department: 'inventory',
            role: adminRole._id,
            status: 'active',
            isActive: true
        });

        testViewUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'View User 68',
            email: 'view68@bharatproperties.internal',
            password: 'Password123!',
            department: 'inventory',
            role: viewRole._id,
            status: 'active',
            isActive: true
        });

        testActorUser = await User.create({
            tenantId: CANONICAL_ORG_ID,
            fullName: 'Standard User 68',
            email: 'user68@bharatproperties.internal',
            password: 'Password123!',
            department: 'sales',
            role: new mongoose.Types.ObjectId(),
            status: 'active',
            isActive: true
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongoServer) {
            unregisterVerifiedEphemeralTestDatabase(mongoServer);
            await mongoServer.stop();
        }
        clearVerifiedEphemeralTestDatabases();
    });

    // =========================================================================
    // MATRIX 1: Ephemeral Database Identity Must Be Non-Forgeable
    // =========================================================================
    describe('Matrix 1: Ephemeral Database Identity Must Be Non-Forgeable', () => {
        test('1.1: Genuine MongoMemoryServer registers successfully with child process verification', () => {
            const verified = isVerifiedEphemeralTestDatabase();
            assert.strictEqual(verified, true);
        });

        test('1.2: Plain object mimicking MongoMemoryServer throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const spoof = {
                state: 'running',
                _state: 'running',
                instanceInfo: {
                    port: 27018,
                    dbPath: '/tmp/db',
                    ip: '127.0.0.1',
                    instance: {
                        mongodProcess: {
                            pid: 99999,
                            killed: false,
                            exitCode: null,
                            spawnfile: '/usr/local/bin/mongod',
                            spawnargs: ['mongod', '--port', '27018']
                        }
                    }
                },
                getUri: () => 'mongodb://127.0.0.1:27018/test'
            };

            assert.throws(
                () => {
                    registerVerifiedEphemeralTestDatabase(spoof);
                },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
        });

        test('1.3: Object.create(MongoMemoryServer.prototype) throws EPHEMERAL_DATABASE_REQUIRED', () => {
            const protoSpoof = Object.create(MongoMemoryServer.prototype);
            Object.defineProperty(protoSpoof, 'state', { value: 'running', configurable: true });
            Object.defineProperty(protoSpoof, '_state', { value: 'running', configurable: true });
            Object.defineProperty(protoSpoof, 'instanceInfo', {
                value: {
                    port: 27019,
                    instance: {
                        mongodProcess: {
                            pid: process.pid,
                            killed: false,
                            exitCode: null,
                            spawnfile: 'mongod',
                            spawnargs: ['mongod', '--port', '27019']
                        }
                    }
                },
                configurable: true
            });
            protoSpoof.getUri = () => 'mongodb://127.0.0.1:27019/test';

            assert.throws(
                () => {
                    registerVerifiedEphemeralTestDatabase(protoSpoof);
                },
                err => {
                    assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                    return true;
                }
            );
        });

        test('1.4: Stopped or non-running instance throws EPHEMERAL_DATABASE_REQUIRED', async () => {
            const temp = await createVerifiedEphemeralTestDatabase();
            await temp.stop();
            try {
                assert.throws(
                    () => {
                        registerVerifiedEphemeralTestDatabase(temp);
                    },
                    err => {
                        assert.strictEqual(err.code, 'EPHEMERAL_DATABASE_REQUIRED');
                        return true;
                    }
                );
            } finally {
                unregisterVerifiedEphemeralTestDatabase(temp);
            }
        });

        test('1.5: createVerifiedEphemeralTestDatabase creates and registers genuine instance', async () => {
            const fresh = await createVerifiedEphemeralTestDatabase();
            try {
                assert.ok(fresh instanceof MongoMemoryServer);
                assert.strictEqual(fresh.state, 'running');
            } finally {
                unregisterVerifiedEphemeralTestDatabase(fresh);
                await fresh.stop();
            }
        });

        test('1.6: createVerifiedEphemeralReplSet creates and registers genuine replica set', async () => {
            const repl = await createVerifiedEphemeralReplSet({ replSet: { count: 1 } });
            try {
                assert.ok(repl instanceof MongoMemoryReplSet);
                assert.strictEqual(repl.state, 'running');
            } finally {
                unregisterVerifiedEphemeralTestDatabase(repl);
                await repl.stop();
            }
        });

        test('1.7: createVerifiedEphemeralTestDatabase throws TEST_ONLY_CAPABILITY_PROHIBITED outside NODE_ENV=test', async () => {
            const origEnv = process.env.NODE_ENV;
            try {
                process.env.NODE_ENV = 'production';
                await assert.rejects(
                    async () => {
                        await createVerifiedEphemeralTestDatabase();
                    },
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
    // MATRIX 2: Saga Compensation Pre-Flight Claim & Inventory Validation
    // =========================================================================
    describe('Matrix 2: Saga Compensation Strictly Fail-Closed & Zero Side Effects', () => {
        test('2.1: Missing itemId throws INVALID_COMPENSATION_PARAMETERS', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: null,
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: new mongoose.Types.ObjectId(),
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_COMPENSATION_PARAMETERS');
                    return true;
                }
            );
        });

        test('2.2: Missing tenantId throws INVALID_COMPENSATION_PARAMETERS', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: null,
                        inventoryId: new mongoose.Types.ObjectId(),
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_COMPENSATION_PARAMETERS');
                    return true;
                }
            );
        });

        test('2.3: Non-canonical tenantId throws CANONICAL_ORGANIZATION_REQUIRED', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: NON_CANONICAL_ORG_ID_STRING,
                        inventoryId: new mongoose.Types.ObjectId(),
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CANONICAL_ORGANIZATION_REQUIRED');
                    return true;
                }
            );
        });

        test('2.4: Missing inventoryId throws INVALID_COMPENSATION_PARAMETERS', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: null,
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_COMPENSATION_PARAMETERS');
                    return true;
                }
            );
        });

        test('2.5: Missing claimId throws INVALID_COMPENSATION_PARAMETERS', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: new mongoose.Types.ObjectId(),
                        claimId: null
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_COMPENSATION_PARAMETERS');
                    return true;
                }
            );
        });

        test('2.6: Non-existent PropertyVerificationRunItem throws RUN_ITEM_NOT_FOUND', async () => {
            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: new mongoose.Types.ObjectId(),
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: new mongoose.Types.ObjectId(),
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'RUN_ITEM_NOT_FOUND');
                    return true;
                }
            );
        });

        test('2.7: RunItem inventoryId mismatch throws INVENTORY_ID_MISMATCH', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const realInventoryId = new mongoose.Types.ObjectId();
            const wrongInventoryId = new mongoose.Types.ObjectId();

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: realInventoryId,
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: runItem._id,
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: wrongInventoryId,
                        claimId
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVENTORY_ID_MISMATCH');
                    return true;
                }
            );
        });

        test('2.8: RunItem without applyClaim throws CLAIM_REQUIRED', async () => {
            const invId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: invId,
                authorityCode: 'HSVP',
                status: 'FAILED'
            });

            await assert.rejects(
                async () => {
                    await compensateApplySaga({
                        itemId: runItem._id,
                        tenantId: CANONICAL_ORG_ID_STRING,
                        inventoryId: invId,
                        claimId: new mongoose.Types.ObjectId()
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'CLAIM_REQUIRED');
                    return true;
                }
            );
        });

        test('2.9: Caller claimId conflicting with RunItem returns CLAIM_CONFLICT with zero side effects', async () => {
            const realClaimId = new mongoose.Types.ObjectId();
            const conflictingClaimId = new mongoose.Types.ObjectId();
            const invId = new mongoose.Types.ObjectId();

            const inventory = await Inventory.create({
                _id: invId,
                tenantId: CANONICAL_ORG_ID,
                unitNo: 'CONF-01',
                sector: 'Sector 21',
                status: 'Available',
                authorityVerification: {
                    applyClaimId: realClaimId,
                    propertySize: 'MUTATED_VALUE'
                }
            });

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: invId,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                applyState: 'APPLYING',
                applyClaim: {
                    claimId: realClaimId,
                    stage: 'INVENTORY_MUTATED'
                }
            });

            const result = await compensateApplySaga({
                itemId: runItem._id,
                tenantId: CANONICAL_ORG_ID_STRING,
                inventoryId: invId,
                claimId: conflictingClaimId,
                stage: 'INVENTORY_MUTATED',
                compensation: {
                    inventoryBefore: { 'authorityVerification.propertySize': null }
                },
                errorMsg: 'Conflicting worker tried compensation'
            });

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.reason, 'CLAIM_CONFLICT');
            assert.strictEqual(result.preempted, true);

            // Zero writes to Inventory: value and claimId remain unchanged
            const freshInv = await Inventory.findById(invId).lean();
            assert.strictEqual(freshInv.authorityVerification.propertySize, 'MUTATED_VALUE');
            assert.strictEqual(String(freshInv.authorityVerification.applyClaimId), String(realClaimId));

            // Zero writes to RunItem: applyState and stage remain intact
            const freshItem = await PropertyVerificationRunItem.findById(runItem._id).lean();
            assert.strictEqual(freshItem.applyState, 'APPLYING');
            assert.strictEqual(freshItem.applyClaim.stage, 'INVENTORY_MUTATED');
        });
    });

    // =========================================================================
    // MATRIX 3: AuditLog Immutability — Strict Metadata Tenant, Authority, Target & Claim Binding
    // =========================================================================
    describe('Matrix 3: AuditLog Immutability — Strict Binding', () => {
        test('3.1: Absent metadata.tenantId throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: runItem._id,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    // metadata.tenantId missing!
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('metadata.tenantId'));
                    return true;
                }
            );
        });

        test('3.2: Non-canonical metadata.tenantId throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: runItem._id,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: NON_CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('metadata.tenantId'));
                    return true;
                }
            );
        });

        test('3.3: Absent metadata.authorityCode throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: runItem._id,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    // authorityCode missing!
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('metadata.authorityCode'));
                    return true;
                }
            );
        });

        test('3.4: Mismatched metadata.authorityCode throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'authority_settings',
                targetId: runItem._id,
                status: 'success',
                description: 'Authority changes applied from GMADA',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'GMADA', // Mismatch!
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('does not match RunItem authorityCode'));
                    return true;
                }
            );
        });

        test('3.5: Invalid targetType throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'deal', // Invalid targetType for saga compensation!
                targetId: runItem._id,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('targetType'));
                    return true;
                }
            );
        });

        test('3.6: Mismatched RunItem association throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'PropertyVerificationRunItem',
                targetId: runItem._id,
                status: 'success',
                description: 'Authority verification changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: new mongoose.Types.ObjectId(), // Wrong itemId!
                    claimId: claimId.toString()
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('RunItem association'));
                    return true;
                }
            );
        });

        test('3.7: Valid full binding succeeds saga compensation', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const invId = new mongoose.Types.ObjectId();

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: invId,
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'inventory',
                targetId: invId,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: claimId.toString()
                }
            });

            await AuditLog.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        status: 'compensated',
                        'metadata.compensated': true,
                        'metadata.compensationClaimId': claimId.toString(),
                        'metadata.compensatedAt': new Date()
                    }
                }
            );

            const refreshed = await AuditLog.findById(audit._id).lean();
            assert.strictEqual(refreshed.status, 'compensated');
            assert.strictEqual(refreshed.metadata?.compensated, true);
            assert.strictEqual(refreshed.metadata?.compensationClaimId, claimId.toString());
        });

        test('3.8: Mismatched claim association on AuditLog throws AUDIT_LOG_IMMUTABLE', async () => {
            const claimId = new mongoose.Types.ObjectId();
            const differentClaimId = new mongoose.Types.ObjectId();
            const invId = new mongoose.Types.ObjectId();

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: CANONICAL_ORG_ID,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: invId,
                authorityCode: 'HSVP',
                status: 'FAILED',
                applyClaim: { claimId }
            });

            const audit = await AuditLog.create({
                eventType: 'authority_changes_applied',
                targetType: 'inventory',
                targetId: invId,
                status: 'success',
                description: 'Authority changes applied from HSVP',
                metadata: {
                    tenantId: CANONICAL_ORG_ID,
                    authorityCode: 'HSVP',
                    itemId: runItem._id,
                    claimId: differentClaimId.toString() // Recorded with a different claimId!
                }
            });

            await assert.rejects(
                async () => {
                    await AuditLog.updateOne(
                        { _id: audit._id },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId.toString(),
                                'metadata.compensatedAt': new Date()
                            }
                        }
                    );
                },
                err => {
                    assert.strictEqual(err.code, 'AUDIT_LOG_IMMUTABLE');
                    assert.ok(err.message.includes('mismatched claim association'));
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // MATRIX 4: Authentic Owner Confirmation — Trusted Principal & Strict Roles
    // =========================================================================
    describe('Matrix 4: Authentic Owner Confirmation — Trusted Principal & Roles', () => {
        let hsvpDoc;

        beforeEach(async () => {
            await _testOnlyResetAuthoritySettings({});
            hsvpDoc = await AuthoritySourceSettings.create({
                tenantId: CANONICAL_ORG_ID,
                authorityCode: 'HSVP',
                isEnabled: false,
                schedulingEnabled: false,
                permissionStatus: 'NOT_OBTAINED',
                contractVerificationStatus: 'NOT_VERIFIED',
                evidenceVersion: 1
            });
        });

        test('4.1: Caller impersonation (authenticatedUser._id !== actorStr) throws ACTOR_IMPERSONATION_PROHIBITED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: testActorUser._id.toString(),
                        trustedPrincipal: testAdminUser, // Caller is admin, trying to submit as actor
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT',
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

        test('4.2: OWNER_REPRESENTATIVE by user with only view permission throws ACTOR_UNAUTHORIZED', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: testViewUser._id.toString(),
                        trustedPrincipal: testViewUser,
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: 'REF-001',
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

        test('4.3: OWNER_REPRESENTATIVE with invalid evidenceType throws INVALID_REPRESENTATIVE_EVIDENCE', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: testAdminUser._id.toString(),
                        trustedPrincipal: testAdminUser,
                        claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                        evidenceReference: 'REF-001',
                        evidenceType: 'CLIENT_STATEMENT', // OWNER_REPRESENTATIVE requires OWNER_WRITTEN_CONFIRMATION or REPRESENTATIVE_AUTHORIZATION
                        evidenceVersion: 1,
                        notes: 'EVIDENCE_REVIEWED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'INVALID_REPRESENTATIVE_EVIDENCE');
                    return true;
                }
            );
        });

        test('4.4: OWNER_REPRESENTATIVE by admin with OWNER_WRITTEN_CONFIRMATION without authentic Document artifact persists as UNVERIFIED_SELF_REPORT', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                reportedBy: testAdminUser._id.toString(),
                trustedPrincipal: testAdminUser,
                claimedAuthorityRole: 'OWNER_REPRESENTATIVE',
                evidenceReference: 'REF-001',
                evidenceType: 'OWNER_WRITTEN_CONFIRMATION',
                evidenceVersion: 1,
                notes: 'EVIDENCE_REVIEWED'
            });

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.statementType, 'UNVERIFIED_SELF_REPORT');
            assert.strictEqual(updated.userReportedEvidence?.claimedAuthorityRole, 'OWNER_REPRESENTATIVE');
            assert.strictEqual(updated.userReportedEvidence?.verificationStatus, 'UNVERIFIED');
        });

        test('4.5: Claimed role PORTAL_OPERATOR produces statementType OPERATOR_SELF_REPORT', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                reportedBy: testActorUser._id.toString(),
                trustedPrincipal: testActorUser,
                claimedAuthorityRole: 'PORTAL_OPERATOR',
                evidenceReference: 'REF-002',
                evidenceType: 'CLIENT_STATEMENT',
                evidenceVersion: 1,
                notes: 'PORTAL_OPERATOR_REPORT_LOGGED'
            });

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.statementType, 'OPERATOR_SELF_REPORT');
        });

        test('4.6: Claimed role AUTHORIZED_BROKER produces statementType BROKER_SELF_REPORT', async () => {
            const updated = await AuthoritySourceSettings.recordOwnerConfirmation({
                tenantId: CANONICAL_ORG_ID_STRING,
                authorityCode: 'HSVP',
                reportedBy: testActorUser._id.toString(),
                trustedPrincipal: testActorUser,
                claimedAuthorityRole: 'Authorized Broker',
                evidenceReference: 'REF-003',
                evidenceType: 'BROKER_ATTESTATION',
                evidenceVersion: 1,
                notes: 'BROKER_ATTESTATION_SUBMITTED'
            });

            assert.ok(updated);
            assert.strictEqual(updated.userReportedEvidence?.statementType, 'BROKER_SELF_REPORT');
        });

        test('4.7: Submission attempting verificationStatus: VALIDATED throws UNAUTHORIZED_STATUS_OVERRIDE', async () => {
            await assert.rejects(
                async () => {
                    await AuthoritySourceSettings.recordOwnerConfirmation({
                        tenantId: CANONICAL_ORG_ID_STRING,
                        authorityCode: 'HSVP',
                        reportedBy: testActorUser._id.toString(),
                        trustedPrincipal: testActorUser,
                        claimedAuthorityRole: 'PORTAL_OPERATOR',
                        evidenceReference: 'REF-004',
                        evidenceType: 'CLIENT_STATEMENT',
                        evidenceVersion: 1,
                        notes: 'PORTAL_OPERATOR_REPORT_LOGGED',
                        verificationStatus: 'VALIDATED'
                    });
                },
                err => {
                    assert.strictEqual(err.code, 'UNAUTHORIZED_STATUS_OVERRIDE');
                    return true;
                }
            );
        });

        test('4.8: Non-integer evidenceVersion (float, string, <=0) throws EVIDENCE_VERSION_REQUIRED', async () => {
            for (const badVer of [1.5, 'version1', 0, -1]) {
                await assert.rejects(
                    async () => {
                        await AuthoritySourceSettings.recordOwnerConfirmation({
                            tenantId: CANONICAL_ORG_ID_STRING,
                            authorityCode: 'HSVP',
                            reportedBy: testActorUser._id.toString(),
                            trustedPrincipal: testActorUser,
                            claimedAuthorityRole: 'PORTAL_OPERATOR',
                            evidenceReference: 'REF-005',
                            evidenceType: 'CLIENT_STATEMENT',
                            evidenceVersion: badVer,
                            notes: 'Invalid version notes'
                        });
                    },
                    err => {
                        assert.strictEqual(err.code, 'EVIDENCE_VERSION_REQUIRED');
                        return true;
                    }
                );
            }
        });
    });

    // =========================================================================
    // MATRIX 5: Exact Email Minimization
    // =========================================================================
    describe('Matrix 5: Exact Email Minimization', () => {
        test('5.1: maskScalarPII replaces standalone raw email with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('citizen@example.com');
            assert.strictEqual(result, '[EMAIL_MINIMIZED]');
        });

        test('5.2: maskScalarPII replaces standalone partially masked email with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('c***@example.com');
            assert.strictEqual(result, '[EMAIL_MINIMIZED]');
        });

        test('5.3: maskScalarPII replaces embedded email in sentence with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('Reported by citizen.test@domain.co.in during review');
            assert.strictEqual(result, 'Reported by [EMAIL_MINIMIZED] during review');
        });

        test('5.4: maskScalarPII replaces embedded partially masked email with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('Reported by c***@domain.com during review');
            assert.strictEqual(result, 'Reported by [EMAIL_MINIMIZED] during review');
        });

        test('5.5: maskScalarPII replaces mixed-case and whitespace-padded email with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('   Citizen.Test@Domain.COM   ');
            assert.strictEqual(result, '[EMAIL_MINIMIZED]');
        });

        test('5.6: maskScalarPII replaces multiple emails in one string with [EMAIL_MINIMIZED]', () => {
            const result = maskScalarPII('Emails: first@test.com and second@test.com');
            assert.strictEqual(result, 'Emails: [EMAIL_MINIMIZED] and [EMAIL_MINIMIZED]');
        });

        test('5.7: maskScalarPII is idempotent upon repeated calls', () => {
            const first = maskScalarPII('citizen@example.com');
            const second = maskScalarPII(first);
            assert.strictEqual(first, '[EMAIL_MINIMIZED]');
            assert.strictEqual(second, '[EMAIL_MINIMIZED]');
        });

        test('5.8: validateControlledScalarValue rejects raw email addresses', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('citizen@example.com', 'metadata.testField');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('5.9: validateControlledScalarValue rejects partially masked email addresses', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('c***@example.com', 'metadata.testField');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });
    });

    // =========================================================================
    // MATRIX 6: Removal of Arbitrary Free-Text and Personal Names from Metadata
    // =========================================================================
    describe('Matrix 6: Removal of Free-Text and Personal Names', () => {
        test('6.1: validateControlledScalarValue rejects uppercase underscore name RAJESH_KUMAR', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('RAJESH_KUMAR', 'metadata.reviewer');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.2: validateControlledScalarValue rejects uppercase underscore name VIKRAM_SINGH', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('VIKRAM_SINGH', 'metadata.approver');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.3: validateControlledScalarValue rejects personal name with honorific Shri Rajesh Kumar', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('Shri Rajesh Kumar', 'metadata.notes');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.4: validateControlledScalarValue rejects personal name with honorific Smt Priya Devi', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('Smt Priya Devi', 'metadata.notes');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.5: validateControlledScalarValue rejects personal name Rajesh Kumar', () => {
            assert.throws(
                () => {
                    validateControlledScalarValue('Rajesh Kumar', 'metadata.notes');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.6: ownerAttestation rejects arbitrary scope string', () => {
            assert.throws(
                () => {
                    validateAuthorityMetadataValue('ownerAttestation', {
                        confirmed: true,
                        scope: 'Arbitrary free text scope from user'
                    }, 'metadata.ownerAttestation');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.7: ownerAttestation accepts valid controlled scope FULL_VERIFICATION', () => {
            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmed: true,
                    scope: 'FULL_VERIFICATION'
                }, 'metadata.ownerAttestation');
            });
        });

        test('6.8: ownerAttestation rejects unknown nested keys', () => {
            assert.throws(
                () => {
                    validateAuthorityMetadataValue('ownerAttestation', {
                        confirmed: true,
                        unauthorizedKey: 'sneaky'
                    }, 'metadata.ownerAttestation');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );
        });

        test('6.9: ownerAttestation confirmedBy rejects free-text and requires ObjectId or controlled role', () => {
            assert.throws(
                () => {
                    validateAuthorityMetadataValue('ownerAttestation', {
                        confirmed: true,
                        confirmedBy: 'Rajesh Kumar'
                    }, 'metadata.ownerAttestation');
                },
                err => {
                    assert.strictEqual(err.code, 'FREE_TEXT_AUDIT_PROHIBITED');
                    return true;
                }
            );

            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmed: true,
                    confirmedBy: new mongoose.Types.ObjectId().toString()
                }, 'metadata.ownerAttestation');
            });

            assert.doesNotThrow(() => {
                validateAuthorityMetadataValue('ownerAttestation', {
                    confirmed: true,
                    confirmedBy: 'PORTAL_OPERATOR'
                }, 'metadata.ownerAttestation');
            });
        });

        test('6.10: Valid controlled codes and technical status codes pass validation cleanly', () => {
            assert.doesNotThrow(() => {
                validateControlledScalarValue('MAKER_CHECKER_APPROVED', 'metadata.reason');
                validateControlledScalarValue('PORTAL_OPERATOR', 'metadata.role');
                validateControlledScalarValue('VALIDATED', 'metadata.status');
                validateControlledScalarValue('EMAIL_MINIMIZED', 'metadata.token');
            });
        });
    });
});
