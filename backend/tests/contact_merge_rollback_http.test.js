import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

import contactRoutes from '../routes/contact.routes.js';
import { errorHandler } from '../src/middlewares/error.middleware.js';
import config from '../src/config/env.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Contact from '../models/Contact.js';
import MergeAudit from '../models/MergeAudit.js';
import Lookup from '../models/Lookup.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Conversation from '../models/Conversation.js';
import Company from '../models/Company.js';
import {
    previewMerge,
    executeMerge,
    rollbackMerge,
    verifyMergeRollbackAuthorization
} from '../services/contactMerge.service.js';

describe('Phase 4 — Contact Merge Rollback HTTP Router Integration Suite', () => {
    let replset;
    let conn;
    let server;
    let baseUrl;

    let adminRole;
    let managerRole;
    let agentRole;

    let adminUser;
    let managerUser;
    let creatorUser;
    let unrelatedUser;

    let adminToken;
    let managerToken;
    let creatorToken;
    let unrelatedToken;

    let phoneCounter = 1000;

    function getNextPhone() {
        phoneCounter++;
        return `981100${phoneCounter}`;
    }

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: { count: 1 }
        });
        await replset.waitUntilRunning();
        const uri = replset.getUri();
        conn = await mongoose.connect(uri, { autoIndex: false });

        // Initialize collections
        await Promise.all([
            User.createCollection(),
            Role.createCollection(),
            Contact.createCollection(),
            MergeAudit.createCollection(),
            Lookup.createCollection(),
            Lead.createCollection(),
            Deal.createCollection(),
            Booking.createCollection(),
            Inventory.createCollection(),
            Activity.createCollection(),
            Conversation.createCollection(),
            Company.createCollection()
        ]);

        // Create Roles
        adminRole = await Role.create({
            name: 'admin',
            department: 'sales',
            isSystemRole: true
        });
        managerRole = await Role.create({
            name: 'manager',
            department: 'sales',
            isSystemRole: false
        });
        agentRole = await Role.create({
            name: 'agent',
            department: 'sales',
            isSystemRole: false
        });

        // Create Users
        adminUser = await User.create({
            fullName: 'Admin User',
            email: 'admin.rollback.test@bharatproperties.com',
            password: 'Password@123',
            department: 'sales',
            role: adminRole._id,
            isActive: true
        });

        managerUser = await User.create({
            fullName: 'Manager User',
            email: 'manager.rollback.test@bharatproperties.com',
            password: 'Password@123',
            department: 'sales',
            role: managerRole._id,
            isActive: true
        });

        creatorUser = await User.create({
            fullName: 'Creator Agent',
            email: 'creator.agent@bharatproperties.com',
            password: 'Password@123',
            department: 'sales',
            role: agentRole._id,
            isActive: true
        });

        unrelatedUser = await User.create({
            fullName: 'Unrelated Agent',
            email: 'unrelated.agent@bharatproperties.com',
            password: 'Password@123',
            department: 'sales',
            role: agentRole._id,
            isActive: true
        });

        // Generate Auth Tokens
        adminToken = jwt.sign({ id: adminUser._id.toString() }, config.jwtSecret);
        managerToken = jwt.sign({ id: managerUser._id.toString() }, config.jwtSecret);
        creatorToken = jwt.sign({ id: creatorUser._id.toString() }, config.jwtSecret);
        unrelatedToken = jwt.sign({ id: unrelatedUser._id.toString() }, config.jwtSecret);

        // Mount Express App on ephemeral port
        const app = express();
        app.use(express.json());
        app.use('/api/contacts', contactRoutes);
        app.use(errorHandler);

        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.disconnect();
        await replset.stop();
    });

    async function makeRollbackRequest(mergeOperationId, token = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${baseUrl}/api/contacts/merge/${mergeOperationId}/rollback`, {
            method: 'POST',
            headers
        });
        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    }

    async function setupTestMerge(creator, ownerForContacts = null) {
        const ownerId = ownerForContacts ? (ownerForContacts._id || ownerForContacts) : creator._id;
        const p1 = getNextPhone();
        const p2 = getNextPhone();

        const master = await Contact.create({
            name: `Master Contact ${p1}`,
            phones: [{ number: p1, type: 'Personal' }],
            owner: ownerId,
            assignedTo: ownerId,
            assignment: { assignedTo: ownerId, visibleTo: 'Everyone' },
            visibleTo: 'Everyone',
            isDeleted: false,
            isMerged: false
        });

        const duplicate = await Contact.create({
            name: `Duplicate Contact ${p2}`,
            phones: [{ number: p2, type: 'Work' }],
            owner: ownerId,
            assignedTo: ownerId,
            assignment: { assignedTo: ownerId, visibleTo: 'Everyone' },
            visibleTo: 'Everyone',
            isDeleted: false,
            isMerged: false
        });

        const preview = await previewMerge(master, duplicate);
        const audit = await executeMerge(master._id, duplicate._id, preview, { userId: creator._id });

        return { master, duplicate, audit };
    }

    it('1. Unauthenticated request: Rejects with 401 when no Bearer token is provided', async () => {
        const { audit } = await setupTestMerge(creatorUser);
        const res = await makeRollbackRequest(audit.mergeOperationId, null);

        assert.equal(res.status, 401);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('token') || res.data.message.includes('authenticated'));
    });

    it('2. Standard unrelated agent: Rejects with 403 when user is neither Admin, Manager, nor Creator', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser);

        const res = await makeRollbackRequest(audit.mergeOperationId, unrelatedToken);

        assert.equal(res.status, 403);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('Insufficient privileges') || res.data.message.includes('Forbidden'));

        // ZERO MUTATION VERIFICATION: Ensure contacts and audit remain unmodified on denied request
        const checkMaster = await Contact.findById(master._id);
        const checkDuplicate = await Contact.findOne({ _id: duplicate._id }, null, { includeDeleted: true });
        const checkAudit = await MergeAudit.findOne({ mergeOperationId: audit.mergeOperationId });

        assert.equal(checkDuplicate.isMerged, true, 'Duplicate must remain merged');
        assert.equal(checkDuplicate.isDeleted, true, 'Duplicate must remain deleted');
        assert.equal(checkAudit.status, 'COMPLETED', 'Audit status must remain COMPLETED');
        assert.equal(checkAudit.rollbackAvailable, true, 'Rollback must remain available');
        assert.equal(checkMaster.phones.length, 2, 'Master consolidated phones must remain intact');
    });

    it('3. Original creator without visibility: Rejects with 403 if creator lost visibility to the merged contacts', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser);

        // Strip visibility: reassign contacts to unrelatedUser and lock to Private
        await Contact.updateOne(
            { _id: master._id },
            {
                $set: {
                    owner: unrelatedUser._id,
                    assignedTo: unrelatedUser._id,
                    'assignment.assignedTo': unrelatedUser._id,
                    'assignment.visibleTo': 'Private',
                    visibleTo: 'Private'
                }
            }
        );
        await Contact.updateOne(
            { _id: duplicate._id },
            {
                $set: {
                    owner: unrelatedUser._id,
                    assignedTo: unrelatedUser._id,
                    'assignment.assignedTo': unrelatedUser._id,
                    'assignment.visibleTo': 'Private',
                    visibleTo: 'Private'
                }
            },
            { includeDeleted: true }
        );

        // Creator attempts rollback
        const res = await makeRollbackRequest(audit.mergeOperationId, creatorToken);

        assert.equal(res.status, 403);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('visibility access') || res.data.message.includes('Forbidden'));

        // ZERO MUTATION VERIFICATION
        const checkAudit = await MergeAudit.findOne({ mergeOperationId: audit.mergeOperationId });
        assert.equal(checkAudit.status, 'COMPLETED');
        assert.equal(checkAudit.rollbackAvailable, true);
    });

    it('4. User without visibility to duplicate contact: Rejects with 403 if duplicate contact is private to someone else', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser);

        // Keep master visible to creator, but duplicate private to unrelatedUser
        await Contact.updateOne(
            { _id: duplicate._id },
            {
                $set: {
                    owner: unrelatedUser._id,
                    assignedTo: unrelatedUser._id,
                    'assignment.assignedTo': unrelatedUser._id,
                    'assignment.visibleTo': 'Private',
                    visibleTo: 'Private'
                }
            },
            { includeDeleted: true }
        );

        const res = await makeRollbackRequest(audit.mergeOperationId, creatorToken);

        assert.equal(res.status, 403);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('visibility access') || res.data.message.includes('Forbidden'));
    });

    it('5. Original creator with visibility: Successfully rolls back merge and restores duplicate', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser, creatorUser);

        const res = await makeRollbackRequest(audit.mergeOperationId, creatorToken);

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.audit.status, 'ROLLED_BACK');
        assert.equal(res.data.audit.rollbackAvailable, false);

        // Verify Database State
        const restoredDuplicate = await Contact.findById(duplicate._id);
        assert.ok(restoredDuplicate, 'Duplicate contact must be restored and queryable');
        assert.equal(restoredDuplicate.isMerged, false);
        assert.equal(restoredDuplicate.isDeleted, false);
        assert.equal(restoredDuplicate.mergedInto, undefined);

        const updatedMaster = await Contact.findById(master._id);
        assert.equal(updatedMaster.phones.length, 1, 'Master consolidated phone must be un-consolidated');
    });

    it('6. Manager with visibility: Successfully authorizes and executes rollback', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser, creatorUser);

        const res = await makeRollbackRequest(audit.mergeOperationId, managerToken);

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.audit.status, 'ROLLED_BACK');

        const restoredDuplicate = await Contact.findById(duplicate._id);
        assert.equal(restoredDuplicate.isMerged, false);
        assert.equal(restoredDuplicate.isDeleted, false);
    });

    it('7. Admin with visibility: Successfully authorizes and executes rollback', async () => {
        const { master, duplicate, audit } = await setupTestMerge(creatorUser, creatorUser);

        const res = await makeRollbackRequest(audit.mergeOperationId, adminToken);

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.audit.status, 'ROLLED_BACK');

        const restoredDuplicate = await Contact.findById(duplicate._id);
        assert.equal(restoredDuplicate.isMerged, false);
        assert.equal(restoredDuplicate.isDeleted, false);
    });

    it('8. Missing merge operation: Returns 404 safe response', async () => {
        const nonExistentOpId = 'merge-op-non-existent-99999';
        const res = await makeRollbackRequest(nonExistentOpId, adminToken);

        assert.equal(res.status, 404);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('not found') || res.data.message.includes('Invalid or uncompleted'));
    });

    it('9. Already rolled-back operation: Returns 400 when rollback is not available', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        // First rollback succeeds
        const firstRes = await makeRollbackRequest(audit.mergeOperationId, adminToken);
        assert.equal(firstRes.status, 200);

        // Second rollback attempt must fail with 400
        const secondRes = await makeRollbackRequest(audit.mergeOperationId, adminToken);
        assert.equal(secondRes.status, 400);
        assert.equal(secondRes.data.success, false);
        assert.ok(secondRes.data.message.includes('not available'));
    });

    it('10. In-Session Transaction Authorization: rollbackMerge rejects unauthorized user inside session', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, { user: unrelatedUser });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Insufficient privileges') || err.message.includes('Forbidden'));
            return true;
        });

        // Verify audit is still COMPLETED and rollbackAvailable is true
        const checkAudit = await MergeAudit.findOne({ mergeOperationId: audit.mergeOperationId });
        assert.equal(checkAudit.status, 'COMPLETED');
        assert.equal(checkAudit.rollbackAvailable, true);
    });

    it('11. Direct verifyMergeRollbackAuthorization unit contract verification', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        // Unauthenticated -> throws 401
        await assert.rejects(async () => {
            await verifyMergeRollbackAuthorization(audit, null);
        }, (err) => {
            assert.equal(err.statusCode, 401);
            return true;
        });

        // Unrelated user -> throws 403
        await assert.rejects(async () => {
            await verifyMergeRollbackAuthorization(audit, unrelatedUser);
        }, (err) => {
            assert.equal(err.statusCode, 403);
            return true;
        });

        // Creator -> passes
        const creatorAuth = await verifyMergeRollbackAuthorization(audit, creatorUser);
        assert.ok(creatorAuth.masterContact);
        assert.ok(creatorAuth.duplicateContact);

        // Manager -> passes
        const managerAuth = await verifyMergeRollbackAuthorization(audit, managerUser);
        assert.ok(managerAuth.masterContact);
        assert.ok(managerAuth.duplicateContact);

        // Admin -> passes
        const adminAuth = await verifyMergeRollbackAuthorization(audit, adminUser);
        assert.ok(adminAuth.masterContact);
        assert.ok(adminAuth.duplicateContact);
    });

    it('12. Missing Caller Context: rollbackMerge rejects invocations with empty options', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId);
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Missing caller authorization context'));
            return true;
        });

        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {});
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Missing caller authorization context'));
            return true;
        });
    });

    it('13. Forged systemId: rollbackMerge rejects caller-supplied systemId string or unverified object', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        // Caller attempts to supply systemId in options.systemCaller
        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {
                systemCaller: {
                    systemId: 'CRM_SYSTEM_RECOVERY_RUNNER',
                    actorProvenance: 'bot@evil.com',
                    reason: 'bypass'
                }
            });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Caller-supplied systemId or arbitrary capabilities cannot authorize rollback'));
            return true;
        });

        // Caller attempts to supply systemId directly
        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {
                systemId: 'CRM_SYSTEM_RECOVERY_RUNNER'
            });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Caller-supplied systemId or arbitrary capabilities cannot authorize rollback'));
            return true;
        });
    });

    it('14. Forged actorProvenance: rollbackMerge rejects forged actorProvenance without user context', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {
                systemCaller: {
                    actorProvenance: 'lead-recovery-worker-inst-01',
                    reason: 'reconciliation'
                }
            });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Caller-supplied systemId or arbitrary capabilities cannot authorize rollback'));
            return true;
        });
    });

    it('15. Arbitrary object pretending to be a trusted capability: rollbackMerge rejects fake capabilities', async () => {
        const { audit } = await setupTestMerge(creatorUser, creatorUser);

        // Plain object pretending to be a capability
        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {
                trustedCapability: {
                    isTrusted: true,
                    systemId: 'TEST_RECOVERY_RUNNER',
                    actorProvenance: 'forge-inst-01',
                    reason: 'test'
                }
            });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Caller-supplied systemId or arbitrary capabilities cannot authorize rollback'));
            return true;
        });

        // Class instance pretending to be a capability
        class FakeCapability {
            constructor() {
                this.systemId = 'CRM_SYSTEM_RECOVERY_RUNNER';
                this.actorProvenance = 'hacker-script';
                this.reason = 'exploit';
            }
        }

        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId, {
                trustedCapability: new FakeCapability()
            });
        }, (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Caller-supplied systemId or arbitrary capabilities cannot authorize rollback'));
            return true;
        });
    });

    it('16. Audit Provenance: Verified rollback audit records identify the actual authorized actor', async () => {
        const { duplicate, audit } = await setupTestMerge(creatorUser, creatorUser);

        const rolledBack = await rollbackMerge(audit.mergeOperationId, {
            user: adminUser
        });

        assert.equal(rolledBack.status, 'ROLLED_BACK');
        assert.equal(rolledBack.rollbackAvailable, false);
        assert.ok(rolledBack.rolledBackBy);
        assert.equal(rolledBack.rolledBackBy.toString(), adminUser._id.toString());
        assert.ok(rolledBack.rolledBackAt instanceof Date);

        const restoredDup = await Contact.findById(duplicate._id);
        assert.equal(restoredDup.isMerged, false);
        assert.equal(restoredDup.isDeleted, false);

        // Verify persisted audit in database
        const persistedAudit = await MergeAudit.findById(audit._id);
        assert.equal(persistedAudit.status, 'ROLLED_BACK');
        assert.equal(persistedAudit.rolledBackBy.toString(), adminUser._id.toString());
        assert.ok(persistedAudit.rolledBackAt instanceof Date);
    });
});
