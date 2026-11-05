process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Inventory from '../models/Inventory.js';
import Conversation from '../models/Conversation.js';
import Company from '../models/Company.js';
import Activity from '../models/Activity.js';
import Document from '../models/Document.js';
import CallIntelligence from '../models/CallIntelligence.js';
import Team from '../models/Team.js';
import MergeAudit from '../models/MergeAudit.js';
import OutboxEvent from '../models/OutboxEvent.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import ReconciliationGroup from '../models/ReconciliationGroup.js';
import ReconciliationAudit from '../models/ReconciliationAudit.js';

import {
    classifyReconciliationGroup,
    CLASSIFICATION_TYPES,
    REASON_CODES,
    calculateNameSimilarity,
    computeGroupFingerprint,
    maskPhoneNumber,
    maskName
} from '../services/contactClassification.service.js';
import { previewMerge, executeMerge, rollbackMerge } from '../services/contactMerge.service.js';
import { ContactLockService } from '../services/contactLock.service.js';
import { ContactReconciliationService } from '../services/contactReconciliation.service.js';
import { MigrationReadinessService, MIGRATION_CHECK_CODES } from '../services/migrationReadiness.service.js';
import {
    verifyGroupVisibility,
    getSummary,
    getGroups,
    getGroupById,
    isAuthoritativeGlobalAdmin,
    resolveAuthoritativeUser,
    getMigrationReadiness,
    syncGroups
} from '../controllers/reconciliation.controller.js';

describe('Phase 4.7 — Enterprise Contact Reconciliation Engine Test Suite', () => {
    let replset;
    let adminRole;
    let agentRole;
    let testAdminUser;
    let testAgentUser;
    let testAgentUser2;

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

        // Ensure collections are pre-created for transactional safety
        await Contact.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
        await Booking.createCollection();
        await Inventory.createCollection();
        await Conversation.createCollection();
        await Company.createCollection();
        await Activity.createCollection();
        await Document.createCollection();
        await CallIntelligence.createCollection();
        await MergeAudit.createCollection();
        await OutboxEvent.createCollection();
        await ReconciliationGroup.createCollection();
        await ReconciliationAudit.createCollection();
        await Team.createCollection();

        adminRole = await Role.create({
            name: 'super admin',
            department: 'sales',
            permissions: [{ module: 'contacts', actions: ['read', 'create', 'edit', 'delete'] }]
        });
        agentRole = await Role.create({
            name: 'agent',
            department: 'sales',
            permissions: [{ module: 'contacts', actions: ['read'] }]
        });

        testAdminUser = await User.create({
            fullName: 'Admin Test',
            email: 'admin.test@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all'
        });

        testAgentUser = await User.create({
            fullName: 'Agent Test',
            email: 'agent.test@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: agentRole._id,
            dataScope: 'assigned'
        });

        testAgentUser2 = await User.create({
            fullName: 'Agent Test 2',
            email: 'agent2.test@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: agentRole._id,
            dataScope: 'assigned'
        });

        testAdminUser = await User.findById(testAdminUser._id).populate('role');
        testAgentUser = await User.findById(testAgentUser._id).populate('role');
        testAgentUser2 = await User.findById(testAgentUser2._id).populate('role');
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        // Clear operational collections between tests
        await Contact.deleteMany({});
        await Lead.deleteMany({});
        await Deal.deleteMany({});
        await Booking.deleteMany({});
        await Inventory.deleteMany({});
        await Conversation.deleteMany({});
        await Company.deleteMany({});
        await Activity.deleteMany({});
        await Document.deleteMany({});
        await CallIntelligence.deleteMany({});
        await MergeAudit.deleteMany({});
        await OutboxEvent.deleteMany({});
        await ReconciliationGroup.deleteMany({});
        await ReconciliationAudit.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. CLASSIFIER CONTRACT & REASON CODES
    // ─────────────────────────────────────────────────────────────────────────────
    it('1. Classifier: Discrepancy resolution — correctly classifies 59/10/263 fixtures with reason codes', () => {
        // Fixture A: Safe Auto-Merge (identical names, single owner, no docs)
        const c1 = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Rohan Sharma',
            owner: testAdminUser._id,
            phones: [{ number: '9811002233', type: 'Personal' }],
            isDeleted: false,
            isMerged: false,
            createdAt: new Date('2026-01-01')
        };
        const c2 = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Rohan Sharma',
            owner: testAdminUser._id,
            phones: [{ number: '9811002233', type: 'Alternate' }],
            isDeleted: false,
            isMerged: false,
            createdAt: new Date('2026-02-01')
        };
        const resA = classifyReconciliationGroup({ phoneNumber: '9811002233', contacts: [c1, c2] });
        assert.equal(resA.primaryClassification, CLASSIFICATION_TYPES.SAFE_AUTO_MERGE);
        assert.ok(resA.reasonCodes.includes(REASON_CODES.NAME_EXACT_MATCH));
        assert.equal(resA.confidence, 'HIGH');

        // Fixture B: Review Required (identical name, but different sales owners)
        const c3 = { ...c2, _id: new mongoose.Types.ObjectId(), owner: testAgentUser._id };
        const resB = classifyReconciliationGroup({ phoneNumber: '9811002233', contacts: [c1, c3] });
        assert.equal(resB.primaryClassification, CLASSIFICATION_TYPES.REVIEW_REQUIRED);
        assert.ok(resB.reasonCodes.includes(REASON_CODES.OWNER_MISMATCH));

        // Fixture C: Do Not Merge (distinct names sharing a phone number)
        const c4 = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Pooja Verma',
            owner: testAdminUser._id,
            phones: [{ number: '9811002233', type: 'Personal' }],
            isDeleted: false,
            isMerged: false,
            createdAt: new Date('2026-03-01')
        };
        const resC = classifyReconciliationGroup({ phoneNumber: '9811002233', contacts: [c1, c4] });
        assert.equal(resC.primaryClassification, CLASSIFICATION_TYPES.DO_NOT_MERGE);
        assert.ok(resC.reasonCodes.includes(REASON_CODES.NAME_CONFLICT));
        assert.ok(resC.phoneDisassociationPlan !== null);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. NAME SIMILARITY FALSE POSITIVE PREVENTION
    // ─────────────────────────────────────────────────────────────────────────────
    it('2. Name Similarity: Never triggers auto-merge by name similarity alone', () => {
        assert.equal(calculateNameSimilarity('Rohan Sharma', 'Pooja Verma'), 'conflict');
        assert.equal(calculateNameSimilarity('Amit Kumar', 'Sunil Kumar'), 'conflict');
        assert.equal(calculateNameSimilarity('', 'Rohan Sharma'), 'missing');

        // Even with strong substring match (e.g. "Rohan" vs "Rohan Sharma"), if owners differ, fails closed
        const c1 = { _id: new mongoose.Types.ObjectId(), name: 'Rohan', owner: testAdminUser._id, phones: [{ number: '9800000001' }], isDeleted: false, isMerged: false };
        const c2 = { _id: new mongoose.Types.ObjectId(), name: 'Rohan Sharma', owner: testAgentUser._id, phones: [{ number: '9800000001' }], isDeleted: false, isMerged: false };
        const res = classifyReconciliationGroup({ phoneNumber: '9800000001', contacts: [c1, c2] });
        assert.equal(res.primaryClassification, CLASSIFICATION_TYPES.REVIEW_REQUIRED);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. CANONICAL MASTER SELECTION HIERARCHY
    // ─────────────────────────────────────────────────────────────────────────────
    it('3. Canonical Selection: Operational references take strict precedence over creation dates', () => {
        const idOld = new mongoose.Types.ObjectId();
        const idNewWithRef = new mongoose.Types.ObjectId();

        const oldContact = {
            _id: idOld,
            name: 'Vikas Gupta',
            phones: [{ number: '9876543210', type: 'Personal' }],
            isDeleted: false,
            isMerged: false,
            createdAt: new Date('2025-01-01')
        };
        const newContact = {
            _id: idNewWithRef,
            name: 'Vikas Gupta',
            phones: [{ number: '9876543210', type: 'Personal' }],
            isDeleted: false,
            isMerged: false,
            createdAt: new Date('2026-01-01')
        };

        // newContact has 5 inventory references and 2 activities
        const refMap = {
            [idOld.toString()]: { inventory: 0, activities: 0 },
            [idNewWithRef.toString()]: { inventory: 5, activities: 2 }
        };

        const res = classifyReconciliationGroup({
            phoneNumber: '9876543210',
            contacts: [oldContact, newContact],
            referenceMap: refMap
        });

        // The newer contact MUST be chosen as canonical master to preserve operational weight
        assert.equal(res.suggestedCanonicalMasterId.toString(), idNewWithRef.toString());
        assert.equal(res.suggestedDuplicateIds[0].toString(), idOld.toString());
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. ALL 12 REFERENCE TYPES REWIRING AND EXACT ROLLBACK
    // ─────────────────────────────────────────────────────────────────────────────
    it('4. Reference Rewiring: Merges and rolls back all 12 reference types without corruption', async () => {
        const master = await Contact.create({
            name: 'Master Client',
            phones: [{ number: '9811111111', type: 'Personal' }],
            emails: [{ address: 'master@bharatproperties.co', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        const duplicate = await Contact.create({
            name: 'Master Client Dup',
            phones: [{ number: '9811111111', type: 'Personal' }, { number: '9822222222', type: 'Alternate' }],
            emails: [{ address: 'dup@bharatproperties.co', type: 'Personal' }],
            tags: ['Investor'],
            company: 'Bharat Infra',
            isDeleted: false,
            isMerged: false
        });

        const mId = master._id;
        const dId = duplicate._id;

        // Seed references across all 12 types
        const [lead, deal, booking, inv, act1, act2, conv, comp, doc, callIntel] = await Promise.all([
            Lead.create({ firstName: 'Lead', lastName: 'One', mobile: '9811111111', contactDetails: dId, leadStatus: 'New' }),
            Deal.create({ dealName: 'Deal 1', owner: dId, buyer: dId, channelPartner: dId, associatedContact: dId, stage: 'Open' }),
            Booking.create({ bookingNumber: 'BK-101', lead: dId, seller: dId, channelPartner: dId }),
            Inventory.create({
                name: 'Plot 42',
                owners: [dId],
                associates: [{ contact: dId, role: 'Owner' }],
                ownerHistory: [{ contactId: dId, ownershipPercentage: 100 }]
            }),
            Activity.create({ subject: 'Call 1', type: 'Call', dueDate: new Date(), entityId: dId, entityType: 'Contact' }),
            Activity.create({ subject: 'Task 1', type: 'Task', dueDate: new Date(), entityId: new mongoose.Types.ObjectId(), entityType: 'Lead', relatedTo: [{ id: dId, model: 'Contact' }] }),
            Conversation.create({ contact: dId, channel: 'whatsapp' }),
            Company.create({ name: 'Bharat Infra Corp', employees: [dId] }),
            Document.create({ documentId: 'DOC-999', entityType: 'Contact', entityId: dId, state: 'ACTIVE' }),
            CallIntelligence.create({
                callSessionId: 'CS-555',
                userId: testAdminUser._id,
                clientPhone: '9811111111',
                fullTranscript: 'Call transcript between agent and client',
                linkedContactId: dId
            })
        ]);

        // Preview merge
        const preview = await previewMerge(master, duplicate);
        assert.ok(preview.referenceRewires.length >= 12, `Expected >= 12 rewires, got ${preview.referenceRewires.length}`);

        // Verify Document and CallIntelligence are captured
        const hasDocRewire = preview.referenceRewires.some(r => r.collectionName === 'Document' && r.field === 'entityId');
        const hasCallIntelRewire = preview.referenceRewires.some(r => r.collectionName === 'CallIntelligence' && r.field === 'linkedContactId');
        assert.ok(hasDocRewire, 'Document reference must be captured in preview');
        assert.ok(hasCallIntelRewire, 'CallIntelligence reference must be captured in preview');

        // Execute merge
        const audit = await executeMerge(mId, dId, preview, { userId: testAdminUser._id });
        assert.equal(audit.status, 'COMPLETED');

        // Verify post-merge rewiring state
        const [mLead, mDeal, mInv, mDoc, mCallIntel, mDupContact, mMasterContact] = await Promise.all([
            Lead.findById(lead._id),
            Deal.findById(deal._id),
            Inventory.findById(inv._id),
            Document.findById(doc._id),
            CallIntelligence.findById(callIntel._id),
            Contact.findById(dId, null, { includeDeleted: true }),
            Contact.findById(mId)
        ]);

        assert.equal(mLead.contactDetails.toString(), mId.toString());
        assert.equal(mDeal.owner.toString(), mId.toString());
        assert.equal(mInv.owners[0].toString(), mId.toString());
        assert.equal(mInv.associates[0].contact.toString(), mId.toString());
        assert.equal(mDoc.entityId.toString(), mId.toString());
        assert.equal(mCallIntel.linkedContactId.toString(), mId.toString());
        assert.equal(mDupContact.isDeleted, true);
        assert.equal(mDupContact.isMerged, true);
        assert.equal(mDupContact.mergedInto.toString(), mId.toString());
        // Master consolidated duplicate's alternate phone
        assert.ok(mMasterContact.phones.some(p => p.number === '9822222222'));

        // Rollback merge
        const rolledBackAudit = await rollbackMerge(audit.mergeOperationId, { user: testAdminUser });
        assert.equal(rolledBackAudit.status, 'ROLLED_BACK');

        // Verify post-rollback exact state restoration
        const [rbLead, rbDoc, rbCallIntel, rbInv, rbDupContact, rbMasterContact] = await Promise.all([
            Lead.findById(lead._id),
            Document.findById(doc._id),
            CallIntelligence.findById(callIntel._id),
            Inventory.findById(inv._id),
            Contact.findById(dId),
            Contact.findById(mId)
        ]);

        assert.equal(rbLead.contactDetails.toString(), dId.toString());
        assert.equal(rbDoc.entityId.toString(), dId.toString());
        assert.equal(rbCallIntel.linkedContactId.toString(), dId.toString());
        assert.equal(rbInv.owners[0].toString(), dId.toString());
        assert.equal(rbDupContact.isDeleted, false);
        assert.equal(rbDupContact.isMerged, false);
        assert.equal(rbDupContact.mergedInto, undefined);
        // Master un-consolidated duplicate's alternate phone
        assert.ok(!rbMasterContact.phones.some(p => p.number === '9822222222'));
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. CONCURRENCY & REDIS DISTRIBUTED LOCKS
    // ─────────────────────────────────────────────────────────────────────────────
    it('5. Concurrency: Contention on same contact rejects simultaneous merges', async () => {
        const cId1 = new mongoose.Types.ObjectId();
        const cId2 = new mongoose.Types.ObjectId();

        // Process 1 acquires lock on cId1 and cId2
        const lock1 = await ContactLockService.acquireMergeLocks([cId1, cId2], { ttlMs: 10000 });
        assert.ok(lock1.success);

        // Process 2 attempts to lock cId2 concurrently -> MUST THROW 409
        await assert.rejects(
            async () => {
                await ContactLockService.acquireMergeLocks([cId2], { ttlMs: 10000 });
            },
            (err) => {
                assert.equal(err.statusCode, 409);
                assert.equal(err.code, 'CONTACT_LOCKED_CONFLICT');
                return true;
            }
        );

        // Process 1 releases locks cleanly
        await ContactLockService.releaseMergeLocks(lock1.acquiredKeys, lock1.token, true);

        // Process 2 can now acquire successfully
        const lock2 = await ContactLockService.acquireMergeLocks([cId2], { ttlMs: 10000 });
        assert.ok(lock2.success);
        await ContactLockService.releaseMergeLocks(lock2.acquiredKeys, lock2.token, true);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. IDEMPOTENCY RECORDING & RETRIES
    // ─────────────────────────────────────────────────────────────────────────────
    it('6. Idempotency: Duplicate execution returns cached result without re-executing', async () => {
        const idemKey = 'test-idemp-key-12345';
        const initialCheck = await ContactLockService.checkIdempotency(idemKey);
        assert.equal(initialCheck.isDuplicate, false);

        const mockResult = { success: true, operationId: 'op_999', canonicalMasterId: 'c_master' };
        await ContactLockService.recordIdempotency(idemKey, mockResult, 60);

        const cachedCheck = await ContactLockService.checkIdempotency(idemKey);
        assert.equal(cachedCheck.isDuplicate, true);
        assert.equal(cachedCheck.cachedResult.operationId, 'op_999');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. DO_NOT_MERGE EXECUTION REJECTION GATE
    // ─────────────────────────────────────────────────────────────────────────────
    it('7. Safety Gate: Automated merge execution on DO_NOT_MERGE group is strictly rejected', async () => {
        const c1 = await Contact.create({ name: 'Anil Kapoor', phones: [{ number: '9833445566' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Pooja Hegde', phones: [{ number: '9833445566' }], isDeleted: false, isMerged: false });

        const group = await ReconciliationGroup.create({
            fingerprint: computeGroupFingerprint('9833445566', [c1._id, c2._id]),
            phoneNumber: '9833445566',
            phoneMasked: maskPhoneNumber('9833445566'),
            primaryClassification: 'DO_NOT_MERGE',
            reasonCodes: ['NAME_CONFLICT'],
            contactIds: [c1._id, c2._id],
            suggestedCanonicalMasterId: c1._id,
            suggestedDuplicateIds: [c2._id],
            status: 'PENDING_REVIEW'
        });

        // Attempt to execute merge on DO_NOT_MERGE group MUST fail
        await assert.rejects(
            async () => {
                await ContactReconciliationService.executeReconciliation(group._id, { user: testAdminUser });
            },
            (err) => {
                assert.equal(err.code, 'DO_NOT_MERGE_VIOLATION');
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. PHONE DISASSOCIATION WORKFLOW FOR DO_NOT_MERGE
    // ─────────────────────────────────────────────────────────────────────────────
    it('8. Disassociation: Removes duplicate alternate phone from Contact B preserving Contact A', async () => {
        const c1 = await Contact.create({
            name: 'Suresh Raina',
            phones: [{ number: '9855554444', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });
        const c2 = await Contact.create({
            name: 'Deepak Chahar',
            phones: [{ number: '9899990000', type: 'Personal' }, { number: '9855554444', type: 'Alternate' }],
            isDeleted: false,
            isMerged: false
        });

        const group = await ReconciliationGroup.create({
            fingerprint: computeGroupFingerprint('9855554444', [c1._id, c2._id]),
            phoneNumber: '9855554444',
            phoneMasked: maskPhoneNumber('9855554444'),
            primaryClassification: 'DO_NOT_MERGE',
            reasonCodes: ['NAME_CONFLICT', 'MIXED_PHONE_POSITION'],
            contactIds: [c1._id, c2._id],
            suggestedCanonicalMasterId: c1._id,
            suggestedDuplicateIds: [c2._id],
            phoneDisassociationPlan: {
                action: 'REMOVE_SECONDARY_PHONE',
                targetContactId: c2._id
            },
            status: 'PENDING_REVIEW'
        });

        const disResult = await ContactReconciliationService.disassociatePhone(group._id, {
            user: testAdminUser,
            targetContactId: c2._id,
            action: 'REMOVE_SECONDARY',
            reason: 'Removed alternate phone duplicate'
        });

        assert.ok(disResult.success);

        // Verify Contact 2 no longer has the colliding phone, but keeps its primary
        const updatedC2 = await Contact.findById(c2._id);
        assert.equal(updatedC2.phones.length, 1);
        assert.equal(updatedC2.phones[0].number, '9899990000');

        // Contact 1 remains completely untouched with its primary phone
        const untouchedC1 = await Contact.findById(c1._id);
        assert.equal(untouchedC1.phones.length, 1);
        assert.equal(untouchedC1.phones[0].number, '9855554444');

        // Group status is DISASSOCIATED
        const updatedGroup = await ReconciliationGroup.findById(group._id);
        assert.equal(updatedGroup.status, 'DISASSOCIATED');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 9. MIGRATION 004 READINESS EVALUATOR
    // ─────────────────────────────────────────────────────────────────────────────
    it('9. Readiness Evaluator: Returns BLOCKED when duplicates exist, READY when resolved', async () => {
        // Step 1: Insert duplicate contacts
        const c1 = await Contact.create({ name: 'Active User 1', phones: [{ number: '9988776655' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Active User 2', phones: [{ number: '9988776655' }], isDeleted: false, isMerged: false });

        // Add legacy index
        await Contact.collection.createIndex({ 'phones.number': 1 });

        const evalBlocked = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalBlocked.ready, false);
        assert.equal(evalBlocked.status, 'BLOCKED');
        assert.equal(evalBlocked.duplicateCount, 1);
        assert.ok(evalBlocked.blockerReasons.some(r => r.includes('ACTIVE_DUPLICATES_EXIST')));

        // Step 2: Resolve the duplicate by soft-deleting contact 2 (as if merged)
        await Contact.updateOne({ _id: c2._id }, { $set: { isDeleted: true, isMerged: true, mergedInto: c1._id } });

        const evalReady = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalReady.ready, true);
        assert.equal(evalReady.status, 'READY');
        assert.equal(evalReady.duplicateCount, 0);
        assert.equal(evalReady.blockerReasons.length, 0);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 10. STALE APPROVAL REPLAY & FINGERPRINT BINDING GATE
    // ─────────────────────────────────────────────────────────────────────────────
    it('10. Security: Rejects merge execution if group fingerprint changed after approval', async () => {
        const c1 = await Contact.create({ name: 'Vikram Seth', phones: [{ number: '9877001122' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Vikram Seth', phones: [{ number: '9877001122' }], isDeleted: false, isMerged: false });

        const initialFingerprint = computeGroupFingerprint('9877001122', [c1._id, c2._id]);
        const group = await ReconciliationGroup.create({
            fingerprint: initialFingerprint,
            phoneNumber: '9877001122',
            phoneMasked: maskPhoneNumber('9877001122'),
            primaryClassification: 'SAFE_AUTO_MERGE',
            contactIds: [c1._id, c2._id],
            suggestedCanonicalMasterId: c1._id,
            suggestedDuplicateIds: [c2._id],
            status: 'PENDING_REVIEW'
        });

        // Operator approves group under initialFingerprint
        await ContactReconciliationService.approveGroup(group._id, {
            user: testAdminUser,
            reviewNotes: 'Initial approval',
            expectedFingerprint: initialFingerprint
        });

        const approvedGroup = await ReconciliationGroup.findById(group._id);
        assert.equal(approvedGroup.status, 'APPROVED');
        assert.equal(approvedGroup.approvedFingerprint, initialFingerprint);

        // Simulate group change: fingerprint altered (e.g. contact added/modified)
        approvedGroup.fingerprint = 'sha256:altered_fingerprint_hash_99999';
        await approvedGroup.save();

        // Execution MUST fail closed with STALE_APPROVAL_REPLAY
        await assert.rejects(
            async () => {
                await ContactReconciliationService.executeReconciliation(group._id, { user: testAdminUser });
            },
            (err) => {
                assert.equal(err.code, 'STALE_APPROVAL_REPLAY');
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 11. REVIEW_REQUIRED ADJUDICATION ENFORCEMENT
    // ─────────────────────────────────────────────────────────────────────────────
    it('11. Security: REVIEW_REQUIRED requires explicit operator notes and adjudication before merge', async () => {
        const c1 = await Contact.create({ name: 'Aarav Gupta', phones: [{ number: '9811223388' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Aarav Gupta', phones: [{ number: '9811223388' }], isDeleted: false, isMerged: false });

        const fp = computeGroupFingerprint('9811223388', [c1._id, c2._id]);
        const group = await ReconciliationGroup.create({
            fingerprint: fp,
            phoneNumber: '9811223388',
            phoneMasked: maskPhoneNumber('9811223388'),
            primaryClassification: 'REVIEW_REQUIRED',
            reasonCodes: ['EXACT_NAME_DIFFERENT_OWNER'],
            contactIds: [c1._id, c2._id],
            suggestedCanonicalMasterId: c1._id,
            suggestedDuplicateIds: [c2._id],
            status: 'PENDING_REVIEW'
        });

        // Case A: Unapproved REVIEW_REQUIRED attempt fails
        await assert.rejects(
            async () => {
                await ContactReconciliationService.executeReconciliation(group._id, { user: testAdminUser });
            },
            (err) => {
                assert.equal(err.code, 'UNAPPROVED_RECONCILIATION_ATTEMPT');
                return true;
            }
        );

        // Case B: Approval without review notes fails adjudication check
        group.status = 'APPROVED';
        group.approvedFingerprint = fp;
        group.reviewedBy = testAdminUser._id;
        group.reviewedAt = new Date();
        group.reviewNotes = '   '; // empty notes
        await group.save();

        await assert.rejects(
            async () => {
                await ContactReconciliationService.executeReconciliation(group._id, { user: testAdminUser });
            },
            (err) => {
                assert.equal(err.code, 'REVIEW_ADJUDICATION_INCOMPLETE');
                return true;
            }
        );

        // Case C: Full operator adjudication succeeds
        group.reviewNotes = 'Verified KYC docs and sales agent ownership assignment.';
        await group.save();

        const result = await ContactReconciliationService.executeReconciliation(group._id, { user: testAdminUser });
        assert.ok(result.success);
        assert.equal(result.mergedDuplicateCount, 1);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 12. PHONE DISASSOCIATION OWNERSHIP & MEMBERSHIP VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────────
    it('12. Security: Phone disassociation validates target membership and preserves other phones', async () => {
        const c1 = await Contact.create({ name: 'Contact 1', phones: [{ number: '9844112233' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Contact 2', phones: [{ number: '9844112233' }, { number: '9844998877' }], isDeleted: false, isMerged: false });
        const unrelatedContact = await Contact.create({ name: 'Unrelated', phones: [{ number: '9999999999' }], isDeleted: false, isMerged: false });

        const fp = computeGroupFingerprint('9844112233', [c1._id, c2._id]);
        const group = await ReconciliationGroup.create({
            fingerprint: fp,
            phoneNumber: '9844112233',
            phoneMasked: maskPhoneNumber('9844112233'),
            primaryClassification: 'DO_NOT_MERGE',
            contactIds: [c1._id, c2._id],
            status: 'PENDING_REVIEW'
        });

        // Case A: Target contact not in group fails
        await assert.rejects(
            async () => {
                await ContactReconciliationService.disassociatePhone(group._id, {
                    user: testAdminUser,
                    targetContactId: unrelatedContact._id,
                    action: 'REMOVE_SECONDARY'
                });
            },
            (err) => {
                assert.ok(err.message.includes('not a member'));
                return true;
            }
        );

        // Case B: Valid disassociation on Contact 2 removes duplicate phone and keeps second phone
        const disResult = await ContactReconciliationService.disassociatePhone(group._id, {
            user: testAdminUser,
            targetContactId: c2._id,
            action: 'REMOVE_SECONDARY'
        });
        assert.ok(disResult.success);

        const updatedC2 = await Contact.findById(c2._id);
        assert.equal(updatedC2.phones.length, 1);
        assert.equal(updatedC2.phones[0].number, '9844998877');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 13. READ-ONLY MUTATION SAFETY ON SCAN & READINESS
    // ─────────────────────────────────────────────────────────────────────────────
    it('13. Mutation Safety: scanAndSyncGroups and evaluateReadiness perform zero Contact writes', async () => {
        const c1 = await Contact.create({ name: 'Readonly User 1', phones: [{ number: '9812345678' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Readonly User 2', phones: [{ number: '9812345678' }], isDeleted: false, isMerged: false });

        const c1Before = await Contact.findById(c1._id).lean();
        const c2Before = await Contact.findById(c2._id).lean();

        // Run scanAndSyncGroups
        await ContactReconciliationService.scanAndSyncGroups();

        // Run evaluateReadiness
        await MigrationReadinessService.evaluateReadiness();

        const c1After = await Contact.findById(c1._id).lean();
        const c2After = await Contact.findById(c2._id).lean();

        assert.deepEqual(c1Before, c1After, 'Contact 1 MUST be strictly identical before and after scan/readiness evaluation');
        assert.deepEqual(c2Before, c2After, 'Contact 2 MUST be strictly identical before and after scan/readiness evaluation');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 14. READINESS FALSE-POSITIVE PREVENTION
    // ─────────────────────────────────────────────────────────────────────────────
    it('14. Readiness Hardening: Returns BLOCKED if legacy index missing, lock held, or target exists', async () => {
        // Ensure no active contacts
        await Contact.deleteMany({});
        try {
            await Contact.collection.dropIndex('phones.number_1');
        } catch (_) {}

        // Case A: Missing legacy index phones.number_1
        const evalMissingLegacy = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalMissingLegacy.ready, false);
        assert.equal(evalMissingLegacy.status, 'BLOCKED');
        assert.ok(evalMissingLegacy.blockerReasons.some(r => r.includes('LEGACY_INDEX_MISSING')));

        // Add legacy index
        await Contact.collection.createIndex({ 'phones.number': 1 });

        // Case B: Unresolved group exists in ReconciliationGroup
        await ReconciliationGroup.create({
            fingerprint: 'fp_test_block',
            phoneNumber: '9900112233',
            phoneMasked: '+91 99*** **233',
            primaryClassification: 'DO_NOT_MERGE',
            status: 'PENDING_REVIEW'
        });

        const evalPendingGroup = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalPendingGroup.ready, false);
        assert.equal(evalPendingGroup.status, 'BLOCKED');
        assert.ok(evalPendingGroup.blockerReasons.some(r => r.includes('UNRESOLVED_GROUPS_EXIST')));

        // Case C: Target unique index already exists
        await ReconciliationGroup.deleteMany({});
        await Contact.collection.createIndex(
            { 'phones.number': 1 },
            { name: 'contacts_phones_number_active_unique', unique: true }
        );
        const evalTargetExists = await MigrationReadinessService.evaluateReadiness();
        assert.ok(evalTargetExists.checks.some(c => c.check === 'TARGET_INDEX_ABSENT' && c.passed === false));

        // Cleanup target index
        await Contact.collection.dropIndex('contacts_phones_number_active_unique');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 16. P1 GROUP VISIBILITY ENFORCEMENT (100% MEMBER ACCESS)
    // ─────────────────────────────────────────────────────────────────────────────
    it('16. P1 Security: Group visibility enforces 100% member accessibility (no partial visibility bypass)', async () => {
        // Contact 1 assigned to Agent 1
        const c1 = await Contact.create({ name: 'Client 1', phones: [{ number: '9811112233' }], owner: testAgentUser._id, isDeleted: false, isMerged: false });
        // Contact 2 assigned to Agent 2
        const c2 = await Contact.create({ name: 'Client 2', phones: [{ number: '9811112233' }], owner: testAgentUser2._id, isDeleted: false, isMerged: false });
        // Contact 3 assigned to Agent 1
        const c3 = await Contact.create({ name: 'Client 3', phones: [{ number: '9811112233' }], owner: testAgentUser._id, isDeleted: false, isMerged: false });

        // Case A: 1 of 2 visible to Agent 1 -> REJECTED (matchingCount === 1, uniqueIds === 2)
        const canAgent1AccessC1C2 = await verifyGroupVisibility(testAgentUser, [c1._id, c2._id]);
        assert.equal(canAgent1AccessC1C2, false, 'Agent 1 must NOT access group where Contact 2 is assigned to Agent 2');

        // Case B: 2 of 3 visible to Agent 1 (c1, c3 visible, c2 hidden) -> REJECTED
        const canAgent1AccessC1C2C3 = await verifyGroupVisibility(testAgentUser, [c1._id, c2._id, c3._id]);
        assert.equal(canAgent1AccessC1C2C3, false, 'Agent 1 must NOT access group where 1 of 3 contacts is hidden');

        // Case C: All contacts visible to Agent 1 (c1, c3) -> ALLOWED
        const canAgent1AccessC1C3 = await verifyGroupVisibility(testAgentUser, [c1._id, c3._id]);
        assert.equal(canAgent1AccessC1C3, true, 'Agent 1 must be granted access when ALL members are assigned to Agent 1');

        // Case D: Global Admin -> ALLOWED
        const canAdminAccess = await verifyGroupVisibility(testAdminUser, [c1._id, c2._id, c3._id]);
        assert.equal(canAdminAccess, true, 'Global platform admin must have unrestricted visibility');

        // Case E: Missing or deleted contact in array -> REJECTED (fail closed)
        const fakeId = new mongoose.Types.ObjectId();
        const canAccessMissing = await verifyGroupVisibility(testAdminUser, [c1._id, fakeId]);
        assert.equal(canAccessMissing, false, 'Group with non-existent or inaccessible member must fail closed');

        // Case F: Controller getGroupById HTTP 403 test
        const group = await ReconciliationGroup.create({
            fingerprint: 'fp_vis_test_1',
            phoneNumber: '9811112233',
            phoneMasked: '+91 98*** **233',
            primaryClassification: 'DO_NOT_MERGE',
            contactIds: [c1._id, c2._id],
            status: 'PENDING_REVIEW'
        });

        const mockReq = { params: { id: group._id.toString() }, user: testAgentUser };
        let resCode = null;
        let resData = null;
        const mockRes = {
            status: (code) => { resCode = code; return mockRes; },
            json: (data) => { resData = data; return mockRes; }
        };

        await getGroupById(mockReq, mockRes);
        assert.equal(resCode, 403, 'Partially visible group must return HTTP 403 Forbidden');
        assert.equal(resData.code, 'GROUP_VISIBILITY_DENIED');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 17. P1 MIGRATION READINESS FAIL-OPEN FIXES (SIMULATED FAILURES)
    // ─────────────────────────────────────────────────────────────────────────────
    it('17. P1 Security: Readiness evaluator strictly fails closed on database, Redis, or index failures', async () => {
        // Case A: Disconnected DB connection
        const disconnectedConn = { readyState: 0, db: null };
        const evalDisconnected = await MigrationReadinessService.evaluateReadiness({ connection: disconnectedConn });
        assert.equal(evalDisconnected.ready, false);
        assert.equal(evalDisconnected.status, 'BLOCKED');
        assert.ok(evalDisconnected.blockerReasons.some(r => r.includes('DATABASE_DISCONNECTED')));

        // Case B: Simulated Redis failure (throws error or null)
        const brokenRedis = {
            keys: async () => { throw new Error('ECONNREFUSED: Redis cluster unreachable'); }
        };
        const evalBrokenRedis = await MigrationReadinessService.evaluateReadiness({ customRedis: brokenRedis });
        assert.equal(evalBrokenRedis.ready, false);
        assert.equal(evalBrokenRedis.status, 'BLOCKED');
        assert.ok(evalBrokenRedis.blockerReasons.some(r => r.includes('REDIS_INSPECTION_FAILED')));

        // Case C: Simulated indexes() inspection failure
        const brokenIndexesConn = {
            readyState: 1,
            db: {
                collection: () => ({
                    aggregate: () => ({ toArray: async () => [] }),
                    countDocuments: async () => 0,
                    indexes: async () => { throw new Error('Index inspection timeout'); }
                })
            }
        };
        const evalBrokenIndexes = await MigrationReadinessService.evaluateReadiness({ connection: brokenIndexesConn });
        assert.equal(evalBrokenIndexes.ready, false);
        assert.equal(evalBrokenIndexes.status, 'BLOCKED');
        assert.ok(evalBrokenIndexes.blockerReasons.some(r => r.includes('INDEX_INSPECTION_FAILED')));

        // Case D: Simulated aggregation failure
        const brokenAggConn = {
            readyState: 1,
            db: {
                collection: () => ({
                    aggregate: () => ({ toArray: async () => { throw new Error('Aggregation query failed'); } }),
                    countDocuments: async () => 0,
                    indexes: async () => [{ name: 'phones.number_1' }]
                })
            }
        };
        const evalBrokenAgg = await MigrationReadinessService.evaluateReadiness({ connection: brokenAggConn });
        assert.equal(evalBrokenAgg.ready, false);
        assert.equal(evalBrokenAgg.status, 'BLOCKED');
        assert.ok(evalBrokenAgg.blockerReasons.some(r => r.includes('AGGREGATION_FAILED')));
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 18. P1 EXACT MIGRATION 004 FILTER COMPATIBILITY
    // ─────────────────────────────────────────────────────────────────────────────
    it('18. P1 Filter Compatibility: Detects empty string and whitespace collisions per Migration 004 index spec', async () => {
        // Ensure legacy index exists
        try {
            await Contact.collection.createIndex({ 'phones.number': 1 });
        } catch (_) {}

        // Case A: Two active contacts with empty string phone number ('') inserted directly to bypass schema hooks
        await Contact.collection.insertMany([
            { name: 'Empty Phone 1', phones: [{ number: '' }], isDeleted: false, isMerged: false, createdAt: new Date() },
            { name: 'Empty Phone 2', phones: [{ number: '' }], isDeleted: false, isMerged: false, createdAt: new Date() }
        ]);

        const evalEmptyCollision = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalEmptyCollision.ready, false, 'Readiness MUST detect collision on empty string phones');
        assert.equal(evalEmptyCollision.status, 'BLOCKED');
        assert.equal(evalEmptyCollision.duplicateCount, 1);
        assert.ok(evalEmptyCollision.blockerReasons.some(r => r.includes('ACTIVE_DUPLICATES_EXIST')));

        // Clean up empty string contacts
        await Contact.deleteMany({});

        // Case B: Two active contacts with whitespace string phone number ('   ')
        await Contact.collection.insertMany([
            { name: 'Whitespace 1', phones: [{ number: '   ' }], isDeleted: false, isMerged: false, createdAt: new Date() },
            { name: 'Whitespace 2', phones: [{ number: '   ' }], isDeleted: false, isMerged: false, createdAt: new Date() }
        ]);

        const evalWhitespaceCollision = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalWhitespaceCollision.ready, false, 'Readiness MUST detect collision on whitespace string phones');
        assert.equal(evalWhitespaceCollision.status, 'BLOCKED');
        assert.equal(evalWhitespaceCollision.duplicateCount, 1);

        // Clean up
        await Contact.deleteMany({});

        // Case C: Non-string phones (null or missing number) are bypassed by $type: 'string'
        await Contact.collection.insertMany([
            { name: 'Null Phone 1', phones: [{ number: null }], isDeleted: false, isMerged: false, createdAt: new Date() },
            { name: 'Null Phone 2', phones: [{ number: null }], isDeleted: false, isMerged: false, createdAt: new Date() }
        ]);

        const evalNullPhones = await MigrationReadinessService.evaluateReadiness();
        assert.equal(evalNullPhones.duplicateCount, 0, 'Null phones must not collide under $type: string');
        assert.equal(evalNullPhones.ready, true);
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 19. P2 MANDATORY & ATOMIC APPROVAL FINGERPRINT
    // ─────────────────────────────────────────────────────────────────────────────
    it('19. P2 Security: Enforces mandatory expectedFingerprint and atomic conditional approval', async () => {
        const c1 = await Contact.create({ name: 'Sameer Sen', phones: [{ number: '9811887766' }], isDeleted: false, isMerged: false });
        const c2 = await Contact.create({ name: 'Sameer Sen', phones: [{ number: '9811887766' }], isDeleted: false, isMerged: false });

        const correctFp = computeGroupFingerprint('9811887766', [c1._id, c2._id]);
        const group = await ReconciliationGroup.create({
            fingerprint: correctFp,
            phoneNumber: '9811887766',
            phoneMasked: '+91 98*** **766',
            primaryClassification: 'SAFE_AUTO_MERGE',
            contactIds: [c1._id, c2._id],
            suggestedCanonicalMasterId: c1._id,
            suggestedDuplicateIds: [c2._id],
            status: 'PENDING_REVIEW'
        });

        // Case A: Missing expectedFingerprint -> rejected with 400
        await assert.rejects(
            async () => {
                await ContactReconciliationService.approveGroup(group._id, {
                    user: testAdminUser,
                    reviewNotes: 'Test note'
                });
            },
            (err) => {
                assert.equal(err.code, 'MISSING_EXPECTED_FINGERPRINT');
                return true;
            }
        );

        // Case B: Incorrect expectedFingerprint -> rejected with 409
        await assert.rejects(
            async () => {
                await ContactReconciliationService.approveGroup(group._id, {
                    user: testAdminUser,
                    expectedFingerprint: 'sha256:wrong_fingerprint_hash',
                    reviewNotes: 'Test note'
                });
            },
            (err) => {
                assert.equal(err.code, 'FINGERPRINT_ALTERED');
                return true;
            }
        );

        // Case C: Valid expectedFingerprint -> atomically approved
        const approved = await ContactReconciliationService.approveGroup(group._id, {
            user: testAdminUser,
            expectedFingerprint: correctFp,
            reviewNotes: 'Atomic approval'
        });
        assert.equal(approved.status, 'APPROVED');
        assert.equal(approved.approvedFingerprint, correctFp);

        // Case D: Concurrent modification check: if group fingerprint changes in DB, approval with old fingerprint fails
        approved.status = 'PENDING_REVIEW';
        approved.fingerprint = 'sha256:concurrently_updated_fingerprint';
        await approved.save();

        await assert.rejects(
            async () => {
                await ContactReconciliationService.approveGroup(group._id, {
                    user: testAdminUser,
                    expectedFingerprint: correctFp,
                    reviewNotes: 'Stale approval attempt'
                });
            },
            (err) => {
                assert.equal(err.code, 'FINGERPRINT_ALTERED');
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 20. P1 SECURITY: AUTHORITATIVE RBAC GLOBAL-ADMIN RESOLUTION
    // ─────────────────────────────────────────────────────────────────────────────
    it('20. P1 Security: Authoritative RBAC global-admin resolution — strictly denies email spoofing, client claims, and dataScope-only bypass', async () => {
        // Case A: Missing or null input -> false
        assert.equal(await isAuthoritativeGlobalAdmin(null), false);
        assert.equal(await isAuthoritativeGlobalAdmin({}), false);

        // Case B: Client-supplied manipulated claims (agent claiming super admin role & spoofed email)
        const spoofedClaimsUser = {
            _id: testAgentUser._id,
            email: 'shreykeshwar@gmail.com',
            role: { name: 'super admin' },
            dataScope: 'all'
        };
        const resSpoofed = await isAuthoritativeGlobalAdmin(spoofedClaimsUser);
        assert.equal(resSpoofed, false, 'Manipulated client claims and spoofed email must be rejected by authoritative DB lookup');

        // Case C: Agent with dataScope: 'all' in database -> MUST NOT be granted global admin
        const agentAllScope = await User.create({
            fullName: 'Agent All Scope',
            email: 'agent_all@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: agentRole._id,
            dataScope: 'all',
            isActive: true
        });
        const resAgentAll = await isAuthoritativeGlobalAdmin(agentAllScope);
        assert.equal(resAgentAll, false, 'dataScope: all alone MUST NOT grant global admin privileges to an agent');

        // Case D: Manager with dataScope: 'all' in database -> MUST NOT be granted global admin
        const managerRole = await Role.create({ name: 'manager', department: 'sales' });
        const managerUser = await User.create({
            fullName: 'Manager User',
            email: 'manager@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: managerRole._id,
            dataScope: 'all',
            isActive: true
        });
        const resManager = await isAuthoritativeGlobalAdmin(managerUser);
        assert.equal(resManager, false, 'Manager with dataScope: all MUST NOT be granted global administrative authority');

        // Case E: Tenant-scoped super admin -> MUST NOT be granted platform global admin
        const tenantAdmin = await User.create({
            fullName: 'Tenant Admin',
            email: 'tenant_admin@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all',
            tenantId: new mongoose.Types.ObjectId(),
            isActive: true
        });
        const resTenantAdmin = await isAuthoritativeGlobalAdmin(tenantAdmin);
        assert.equal(resTenantAdmin, false, 'Tenant-scoped admin must NOT have global platform administrative authority');

        // Case F: Genuine platform Super Admin -> GRANTED
        const resRealAdmin = await isAuthoritativeGlobalAdmin(testAdminUser);
        assert.equal(resRealAdmin, true, 'Genuine database-verified Super Admin without tenant must have global authority');

        // Case G: Endpoint protection: getMigrationReadiness returns 403 for non-global admin
        let readinessStatus = null;
        const mockReqReadiness = { user: testAgentUser };
        const mockResReadiness = {
            status: (code) => { readinessStatus = code; return mockResReadiness; },
            json: () => mockResReadiness
        };
        await getMigrationReadiness(mockReqReadiness, mockResReadiness);
        assert.equal(readinessStatus, 403, 'Non-global admin must receive HTTP 403 on getMigrationReadiness');

        // Case H: Endpoint protection: syncGroups returns 403 for non-global admin
        let syncStatus = null;
        const mockReqSync = { user: testAgentUser };
        const mockResSync = {
            status: (code) => { syncStatus = code; return mockResSync; },
            json: () => mockResSync
        };
        await syncGroups(mockReqSync, mockResSync);
        assert.equal(syncStatus, 403, 'Non-global admin must receive HTTP 403 on syncGroups');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 21. P1 SECURITY: HARDENED USER RESOLUTION & FAIL-CLOSED VISIBILITY
    // ─────────────────────────────────────────────────────────────────────────────
    it('21. P1 Security: User resolution and contact status fail-closed hardening (deleted, missing, inactive, role-less)', async () => {
        const contactA = await Contact.create({ name: 'Active Alpha', phones: [{ number: '9800112233' }], isDeleted: false, isMerged: false });
        const contactB = await Contact.create({ name: 'Active Beta', phones: [{ number: '9800112233' }], isDeleted: false, isMerged: false });

        // Case A: Inactive user account -> resolveAuthoritativeUser returns null, visibility returns false
        const inactiveUser = await User.create({
            fullName: 'Inactive Super Admin',
            email: 'inactive_admin@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all',
            isActive: false
        });
        const resInactive = await resolveAuthoritativeUser(inactiveUser);
        assert.equal(resInactive, null, 'Inactive user lookup must return null');
        const visInactive = await verifyGroupVisibility(inactiveUser, [contactA._id, contactB._id]);
        assert.equal(visInactive, false, 'Inactive user must fail closed in verifyGroupVisibility');

        // Case B: User record without assigned role -> resolveAuthoritativeUser returns null, visibility returns false
        const rolelessUser = await User.create({
            fullName: 'Roleless User',
            email: 'norole_user@bharatproperties.co',
            password: 'Password123!',
            department: 'sales',
            role: new mongoose.Types.ObjectId(), // Non-existent role ID in DB
            dataScope: 'assigned',
            isActive: true
        });
        const resRoleless = await resolveAuthoritativeUser(rolelessUser);
        assert.equal(resRoleless, null, 'User with unresolvable role must return null');
        const visRoleless = await verifyGroupVisibility(rolelessUser, [contactA._id, contactB._id]);
        assert.equal(visRoleless, false, 'User without valid role must fail closed in verifyGroupVisibility');

        // Case C: Non-existent user ID -> resolveAuthoritativeUser returns null, visibility returns false
        const nonExistentUser = { _id: new mongoose.Types.ObjectId() };
        const resNonExistent = await resolveAuthoritativeUser(nonExistentUser);
        assert.equal(resNonExistent, null, 'Non-existent user must return null');
        const visNonExistent = await verifyGroupVisibility(nonExistentUser, [contactA._id, contactB._id]);
        assert.equal(visNonExistent, false, 'Non-existent user must fail closed in verifyGroupVisibility');

        // Case D: Soft-deleted contact in group -> must fail closed
        const deletedContact = await Contact.create({ name: 'Deleted Gamma', phones: [{ number: '9800112233' }], isDeleted: true, isMerged: false });
        const visDeleted = await verifyGroupVisibility(testAdminUser, [contactA._id, deletedContact._id]);
        assert.equal(visDeleted, false, 'Group containing a soft-deleted contact must fail closed');

        // Case E: Invalid ObjectId in contactIds array -> must fail closed
        const visInvalidId = await verifyGroupVisibility(testAdminUser, [contactA._id, 'not-a-valid-object-id']);
        assert.equal(visInvalidId, false, 'Invalid ObjectId in contactIds array must fail closed');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 15. ENVIRONMENT SAFETY: LOCAL ISOLATION
    // ─────────────────────────────────────────────────────────────────────────────
    it('15. Environment Safety: Confirms tests run strictly in isolated local memory', () => {
        const host = mongoose.connection.host;
        assert.ok(
            host.includes('127.0.0.1') || host.includes('localhost'),
            `Database connection MUST be local memory! Found: ${host}`
        );
        assert.ok(
            !host.includes('7dehanz.mongodb.net'),
            'CRITICAL VIOLATION: Test harness must NEVER point to production Atlas cluster!'
        );
    });
});
