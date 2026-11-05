import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
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
import MergeAudit from '../models/MergeAudit.js';
import ReconciliationGroup from '../models/ReconciliationGroup.js';
import ReconciliationBatch from '../models/ReconciliationBatch.js';
import ReconciliationAudit from '../models/ReconciliationAudit.js';
import { classifyReconciliationGroup, CLASSIFICATION_TYPES, maskPhoneNumber, maskName } from './contactClassification.service.js';
import { previewMerge, executeMerge, rollbackMerge, verifyMergeRollbackAuthorization } from './contactMerge.service.js';
import { ContactLockService } from './contactLock.service.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

export class ContactReconciliationService {
    /**
     * Fetch cross-collection reference counts for an array of contact ObjectIds.
     */
    static async fetchReferenceMap(contactIds) {
        const ids = contactIds.map(id => new mongoose.Types.ObjectId(id.toString()));
        const refMap = {};

        for (const id of ids) {
            refMap[id.toString()] = {
                leads: 0, deals: 0, bookings: 0, inventory: 0,
                activities: 0, conversations: 0, companies: 0,
                documents: 0, callIntelligence: 0
            };
        }

        const [
            leads, deals, bookings, inventories,
            activities, conversations, companies,
            documents, callIntels
        ] = await Promise.all([
            Lead.find({ contactDetails: { $in: ids } }, { contactDetails: 1 }).lean(),
            Deal.find({
                $or: [
                    { owner: { $in: ids } },
                    { buyer: { $in: ids } },
                    { channelPartner: { $in: ids } },
                    { associatedContact: { $in: ids } },
                    { 'partyStructure.owner': { $in: ids } }
                ]
            }, { owner: 1, buyer: 1, channelPartner: 1, associatedContact: 1, partyStructure: 1 }).lean(),
            Booking.find({
                $or: [
                    { lead: { $in: ids } },
                    { seller: { $in: ids } },
                    { channelPartner: { $in: ids } }
                ]
            }, { lead: 1, seller: 1, channelPartner: 1 }).lean(),
            Inventory.find({
                $or: [
                    { owners: { $in: ids } },
                    { 'associates.contact': { $in: ids } },
                    { 'ownerHistory.contactId': { $in: ids } }
                ]
            }, { owners: 1, associates: 1, ownerHistory: 1 }).lean(),
            Activity.find({
                $or: [
                    { entityId: { $in: ids }, entityType: 'Contact' },
                    { 'relatedTo.id': { $in: ids }, 'relatedTo.model': 'Contact' }
                ]
            }, { entityId: 1, relatedTo: 1 }).lean(),
            Conversation.find({ contact: { $in: ids } }, { contact: 1 }).lean(),
            Company.find({ employees: { $in: ids } }, { employees: 1 }).lean(),
            Document.find({ entityType: 'Contact', entityId: { $in: ids } }, { entityId: 1 }).lean(),
            CallIntelligence.find({ linkedContactId: { $in: ids } }, { linkedContactId: 1 }).lean()
        ]);

        for (const l of leads) {
            const k = l.contactDetails?.toString();
            if (refMap[k]) refMap[k].leads++;
        }
        for (const d of deals) {
            const check = [d.owner, d.buyer, d.channelPartner, d.associatedContact, d.partyStructure?.owner];
            for (const c of check) {
                const k = c?.toString();
                if (refMap[k]) refMap[k].deals++;
            }
        }
        for (const b of bookings) {
            const check = [b.lead, b.seller, b.channelPartner];
            for (const c of check) {
                const k = c?.toString();
                if (refMap[k]) refMap[k].bookings++;
            }
        }
        for (const inv of inventories) {
            for (const o of (inv.owners || [])) {
                const k = o?.toString();
                if (refMap[k]) refMap[k].inventory++;
            }
            for (const a of (inv.associates || [])) {
                const k = a.contact?.toString();
                if (refMap[k]) refMap[k].inventory++;
            }
            for (const h of (inv.ownerHistory || [])) {
                const k = h.contactId?.toString();
                if (refMap[k]) refMap[k].inventory++;
            }
        }
        for (const act of activities) {
            const k = act.entityId?.toString();
            if (refMap[k]) refMap[k].activities++;
            for (const r of (act.relatedTo || [])) {
                const rk = r.id?.toString();
                if (r.model === 'Contact' && refMap[rk]) refMap[rk].activities++;
            }
        }
        for (const conv of conversations) {
            const k = conv.contact?.toString();
            if (refMap[k]) refMap[k].conversations++;
        }
        for (const comp of companies) {
            for (const emp of (comp.employees || [])) {
                const k = emp?.toString();
                if (refMap[k]) refMap[k].companies++;
            }
        }
        for (const doc of documents) {
            const k = doc.entityId?.toString();
            if (refMap[k]) refMap[k].documents++;
        }
        for (const ci of callIntels) {
            const k = ci.linkedContactId?.toString();
            if (refMap[k]) refMap[k].callIntelligence++;
        }

        return refMap;
    }

    /**
     * Scan active contacts for duplicate phone groups and sync into ReconciliationGroup models.
     * Guaranteed: Read-only scan of Contact collection. Zero writes to Contacts.
     * Prevents silently overwriting existing approved decisions without invalidating altered ones.
     */
    static async scanAndSyncGroups() {
        const pipeline = [
            {
                $match: {
                    isDeleted: false,
                    isMerged: false,
                    'phones.number': { $type: 'string', $nin: ['', null] }
                }
            },
            { $unwind: '$phones' },
            {
                $match: {
                    'phones.number': { $type: 'string', $nin: ['', null] }
                }
            },
            {
                $group: {
                    _id: '$phones.number',
                    contactIds: { $addToSet: '$_id' }
                }
            },
            {
                $addFields: { contactCount: { $size: '$contactIds' } }
            },
            {
                $match: { contactCount: { $gt: 1 } }
            }
        ];

        const rawGroups = await Contact.aggregate(pipeline);
        const allContactIds = [...new Set(rawGroups.flatMap(g => g.contactIds))];
        const contactDocs = await Contact.find({ _id: { $in: allContactIds } }).lean();
        const contactMap = new Map(contactDocs.map(c => [c._id.toString(), c]));

        const referenceMap = await this.fetchReferenceMap(allContactIds);

        const syncedGroups = [];
        let safeCount = 0;
        let reviewCount = 0;
        let doNotMergeCount = 0;

        for (const g of rawGroups) {
            const members = g.contactIds.map(id => contactMap.get(id.toString())).filter(Boolean);
            if (members.length < 2) continue;

            const contract = classifyReconciliationGroup({
                phoneNumber: g._id,
                contacts: members,
                referenceMap
            });

            if (contract.primaryClassification === CLASSIFICATION_TYPES.SAFE_AUTO_MERGE) safeCount++;
            else if (contract.primaryClassification === CLASSIFICATION_TYPES.REVIEW_REQUIRED) reviewCount++;
            else doNotMergeCount++;

            // Check if group exists by phone or fingerprint
            const existingByPhone = await ReconciliationGroup.findOne({ phoneNumber: contract.phoneNumber });
            const existingByFingerprint = await ReconciliationGroup.findOne({ fingerprint: contract.fingerprint });
            const existing = existingByFingerprint || existingByPhone;

            const updatePayload = {
                fingerprint: contract.fingerprint,
                phoneNumber: contract.phoneNumber,
                phoneMasked: contract.phoneMasked,
                primaryClassification: contract.primaryClassification,
                confidence: contract.confidence,
                reasonCodes: contract.reasonCodes,
                evidence: contract.evidence,
                contactIds: members.map(m => m._id),
                suggestedCanonicalMasterId: contract.suggestedCanonicalMasterId,
                suggestedDuplicateIds: contract.suggestedDuplicateIds,
                phoneDisassociationPlan: contract.phoneDisassociationPlan
            };

            if (!existing) {
                // New group
                updatePayload.status = 'PENDING_REVIEW';
                updatePayload.selectedCanonicalMasterId = contract.suggestedCanonicalMasterId;
                updatePayload.approvedFingerprint = null;
            } else if (existing.fingerprint !== contract.fingerprint) {
                // FINGERPRINT CHANGED: Group membership, phones, or evidence altered since previous sync
                // Invalidate prior approval to prevent stale replay attack
                updatePayload.status = 'PENDING_REVIEW';
                updatePayload.approvedFingerprint = null;
                updatePayload.selectedCanonicalMasterId = contract.suggestedCanonicalMasterId;
                updatePayload.reviewNotes = existing.status === 'APPROVED'
                    ? 'Prior approval invalidated: group membership or evidence changed during sync'
                    : existing.reviewNotes;
            } else {
                // Identical fingerprint: preserve operator decision state
                if (existing.status === 'APPROVED' || existing.status === 'EXECUTED' || existing.status === 'DISASSOCIATED') {
                    updatePayload.status = existing.status;
                    updatePayload.approvedFingerprint = existing.approvedFingerprint;
                    updatePayload.selectedCanonicalMasterId = existing.selectedCanonicalMasterId;
                    updatePayload.reviewedBy = existing.reviewedBy;
                    updatePayload.reviewedAt = existing.reviewedAt;
                    updatePayload.reviewNotes = existing.reviewNotes;
                } else {
                    updatePayload.selectedCanonicalMasterId = existing.selectedCanonicalMasterId || contract.suggestedCanonicalMasterId;
                }
            }

            const doc = await ReconciliationGroup.findOneAndUpdate(
                { phoneNumber: contract.phoneNumber },
                { $set: updatePayload },
                { upsert: true, new: true }
            );

            syncedGroups.push(doc);
        }

        return {
            totalGroups: syncedGroups.length,
            safeAutoMergeCount: safeCount,
            reviewRequiredCount: reviewCount,
            doNotMergeCount,
            totalAffectedContacts: allContactIds.length
        };
    }

    /**
     * Generate or preview a dry-run execution plan for a specific group.
     * Guaranteed: Read-only simulation. Zero writes to Contact or references.
     */
    static async generateDryRunPlan(groupId) {
        const group = await ReconciliationGroup.findById(groupId).populate('contactIds');
        if (!group) throw new Error('ReconciliationGroup not found');

        const canonicalId = group.selectedCanonicalMasterId || group.suggestedCanonicalMasterId;
        const canonical = group.contactIds.find(c => c._id.toString() === canonicalId.toString());
        if (!canonical) throw new Error('Canonical master contact not found in group');

        const duplicates = group.contactIds.filter(c => c._id.toString() !== canonicalId.toString());

        const dryRun = {
            groupId: group._id,
            fingerprint: group.fingerprint,
            phoneMasked: group.phoneMasked,
            primaryClassification: group.primaryClassification,
            canonicalMaster: {
                id: canonical._id,
                maskedName: maskName(canonical.name),
                phones: (canonical.phones || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type }))
            },
            duplicates: duplicates.map(d => ({
                id: d._id,
                maskedName: maskName(d.name),
                phones: (d.phones || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type }))
            })),
            plannedRewires: [],
            plannedFieldConsolidations: [],
            isBlocked: group.primaryClassification === CLASSIFICATION_TYPES.DO_NOT_MERGE,
            blockReason: group.primaryClassification === CLASSIFICATION_TYPES.DO_NOT_MERGE ? 'DO_NOT_MERGE: Identity conflict prohibits automated merge.' : null,
            generatedAt: new Date().toISOString()
        };

        for (const dup of duplicates) {
            const preview = await previewMerge(canonical, dup);
            dryRun.plannedRewires.push({
                duplicateId: dup._id,
                rewireCount: preview.referenceRewires.length,
                rewiresByCollection: preview.referenceRewires.reduce((acc, rw) => {
                    acc[rw.collectionName] = (acc[rw.collectionName] || 0) + 1;
                    return acc;
                }, {})
            });
            if (preview.fieldChanges?.length > 0) {
                dryRun.plannedFieldConsolidations.push(...preview.fieldChanges);
            }
        }

        group.dryRunPlan = dryRun;
        await group.save();
        return dryRun;
    }

    /**
     * Operator approves a reconciliation group decision.
     * Binds approval to the exact group fingerprint to prevent stale replay.
     */
    static async approveGroup(groupId, { user, selectedMasterId, reviewNotes, expectedFingerprint }) {
        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        // Verify fingerprint matches expectation
        if (expectedFingerprint && expectedFingerprint !== group.fingerprint) {
            const err = new Error('Group composition has changed since last loaded. Please refresh and review again.');
            err.statusCode = 409;
            err.code = 'FINGERPRINT_ALTERED';
            throw err;
        }

        if (selectedMasterId) {
            const valid = group.contactIds.some(c => c.toString() === selectedMasterId.toString());
            if (!valid) throw new Error('Selected canonical master is not a member of this group');
            group.selectedCanonicalMasterId = selectedMasterId;
        }

        group.status = 'APPROVED';
        group.approvedFingerprint = group.fingerprint; // Cryptographically bind approval to exact fingerprint
        group.reviewedBy = user?._id || user?.id || null;
        group.reviewedAt = new Date();
        group.reviewNotes = reviewNotes || 'Approved by operator';

        await group.save();
        return group;
    }

    /**
     * Operator rejects a reconciliation group decision.
     */
    static async rejectGroup(groupId, { user, reviewNotes }) {
        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        group.status = 'REJECTED';
        group.approvedFingerprint = null;
        group.reviewedBy = user?._id || user?.id || null;
        group.reviewedAt = new Date();
        group.reviewNotes = reviewNotes || 'Rejected by operator';

        await group.save();
        return group;
    }

    /**
     * Execute approved reconciliation merge with distributed locking and audit.
     * Enforces strict safety gates:
     * 1. DO_NOT_MERGE is strictly barred from merge.
     * 2. Approval must match exact current group fingerprint.
     * 3. REVIEW_REQUIRED requires explicit operator adjudication.
     */
    static async executeReconciliation(groupId, { user, idempotencyKey } = {}) {
        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        // Safety Gate 1: DO_NOT_MERGE groups are strictly barred from merge
        if (group.primaryClassification === CLASSIFICATION_TYPES.DO_NOT_MERGE) {
            const err = new Error('Execution Rejected: Automated merge of DO_NOT_MERGE group is strictly prohibited. Use phone disassociation instead.');
            err.statusCode = 400;
            err.code = 'DO_NOT_MERGE_VIOLATION';
            throw err;
        }

        // Safety Gate 2: Explicit Approval Requirement & Fingerprint Binding
        if (group.status !== 'APPROVED' && group.primaryClassification !== CLASSIFICATION_TYPES.SAFE_AUTO_MERGE) {
            const err = new Error(`Execution Rejected: Group is in status ${group.status}. Explicit operator approval required.`);
            err.statusCode = 400;
            err.code = 'UNAPPROVED_RECONCILIATION_ATTEMPT';
            throw err;
        }

        if (group.status === 'APPROVED' && group.approvedFingerprint && group.approvedFingerprint !== group.fingerprint) {
            const err = new Error(`Execution Rejected: Group fingerprint has changed from ${group.approvedFingerprint} to ${group.fingerprint}. Approval is stale and invalidated.`);
            err.statusCode = 409;
            err.code = 'STALE_APPROVAL_REPLAY';
            throw err;
        }

        // Safety Gate 3: REVIEW_REQUIRED Adjudication Completeness
        if (group.primaryClassification === CLASSIFICATION_TYPES.REVIEW_REQUIRED) {
            if (!group.reviewedBy || !group.reviewedAt || !group.reviewNotes || group.reviewNotes.trim() === '') {
                const err = new Error('Execution Rejected: REVIEW_REQUIRED group requires explicit operator review notes and recorded reviewer before merge execution.');
                err.statusCode = 400;
                err.code = 'REVIEW_ADJUDICATION_INCOMPLETE';
                throw err;
            }
        }

        // Idempotency check
        if (idempotencyKey) {
            const idemp = await ContactLockService.checkIdempotency(idempotencyKey);
            if (idemp.isDuplicate) return idemp.cachedResult;
        }

        const canonicalId = group.selectedCanonicalMasterId || group.suggestedCanonicalMasterId;
        const allIds = group.contactIds.map(c => c.toString());
        const duplicateIds = allIds.filter(id => id !== canonicalId.toString());

        // Dynamic re-validation of contacts in group: ensure no DO_NOT_MERGE condition exists
        const contactDocs = await Contact.find({ _id: { $in: allIds } }).lean();
        if (contactDocs.length < 2) {
            const err = new Error('Execution Rejected: Fewer than 2 contacts remain in this group.');
            err.statusCode = 400;
            throw err;
        }

        // Acquire distributed lock across all participating contacts
        const lock = await ContactLockService.acquireMergeLocks(allIds, { ttlMs: 45000 });

        try {
            const result = await withMongoTransaction(async (session) => {
                let currentMaster = await Contact.findById(canonicalId).session(session).lean();
                const duplicates = await Contact.find({ _id: { $in: duplicateIds } }).session(session).lean();

                const beforeSnapshots = [
                    { contactId: currentMaster._id, snapshot: currentMaster },
                    ...duplicates.map(d => ({ contactId: d._id, snapshot: d }))
                ];

                const completedAudits = [];
                const allFieldChanges = [];
                const allReferenceRewires = [];

                for (const dup of duplicates) {
                    const p = await previewMerge(currentMaster, dup);
                    const audit = await executeMerge(currentMaster._id, dup._id, p, { userId: user?._id });
                    completedAudits.push(audit);
                    allFieldChanges.push(...(audit.fieldChanges || []));
                    allReferenceRewires.push(...(audit.referenceRewires || []));
                    currentMaster = await Contact.findById(canonicalId).session(session).lean();
                }

                const afterSnapshots = [
                    { contactId: currentMaster._id, snapshot: currentMaster },
                    ...duplicates.map(d => ({ contactId: d._id, snapshot: { ...d, isDeleted: true, isMerged: true, mergedInto: canonicalId } }))
                ];

                const reconAudit = await ReconciliationAudit.create([{
                    operationId: uuidv4(),
                    groupFingerprint: group.fingerprint,
                    operationType: 'AUTO_MERGE',
                    canonicalMasterId: canonicalId,
                    duplicateContactIds: duplicateIds,
                    phoneMasked: group.phoneMasked,
                    beforeSnapshots,
                    afterSnapshots,
                    fieldChanges: allFieldChanges,
                    referenceRewires: allReferenceRewires,
                    operator: user?._id || null,
                    status: 'SUCCESS',
                    rollbackAvailable: true
                }], { session });

                group.status = 'EXECUTED';
                group.executedBy = user?._id || null;
                group.executedAt = new Date();
                group.mergeOperationId = completedAudits[0]?.mergeOperationId || null;
                group.migrationReadinessStatus = 'RESOLVED';
                await group.save({ session });

                return {
                    success: true,
                    operationId: reconAudit[0].operationId,
                    groupFingerprint: group.fingerprint,
                    canonicalMasterId: canonicalId,
                    mergedDuplicateCount: duplicateIds.length,
                    rewireCount: allReferenceRewires.length
                };
            });

            if (idempotencyKey) {
                await ContactLockService.recordIdempotency(idempotencyKey, result);
            }

            return result;
        } finally {
            await ContactLockService.releaseMergeLocks(lock.acquiredKeys, lock.token, true);
        }
    }

    /**
     * Operator disassociates duplicate secondary phone from Contact B in DO_NOT_MERGE groups.
     * Enforces target verification, preserves other phones, and supports idempotency.
     */
    static async disassociatePhone(groupId, { user, targetContactId, action = 'REMOVE_SECONDARY', reason, idempotencyKey }) {
        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        const targetId = targetContactId || group.phoneDisassociationPlan?.targetContactId;
        if (!targetId) throw new Error('targetContactId is required for phone disassociation');

        // Verify target contact belongs to this duplicate group
        const isMember = group.contactIds.some(c => c.toString() === targetId.toString());
        if (!isMember) {
            const err = new Error('Target contact is not a member of this reconciliation group');
            err.statusCode = 400;
            throw err;
        }

        // Idempotency check
        if (idempotencyKey) {
            const idemp = await ContactLockService.checkIdempotency(idempotencyKey);
            if (idemp.isDuplicate) return idemp.cachedResult;
        }

        const result = await withMongoTransaction(async (session) => {
            const contact = await Contact.findById(targetId).session(session);
            if (!contact) throw new Error('Target contact not found');

            const phoneToDisassociate = group.phoneNumber;
            const beforeSnapshot = contact.toObject();

            if (action === 'REMOVE_SECONDARY') {
                const updatedPhones = (contact.phones || []).filter(p => p.number !== phoneToDisassociate);
                if (updatedPhones.length === contact.phones.length) {
                    throw new Error(`Phone number ${group.phoneMasked} was not found on target contact`);
                }
                contact.phones = updatedPhones;
            } else if (action === 'MARK_SHARED') {
                const phoneEntry = (contact.phones || []).find(p => p.number === phoneToDisassociate);
                if (phoneEntry) {
                    phoneEntry.type = 'Shared';
                    contact.markModified('phones');
                }
            }

            await contact.save({ session });

            const audit = await ReconciliationAudit.create([{
                operationId: uuidv4(),
                groupFingerprint: group.fingerprint,
                operationType: 'PHONE_DISASSOCIATION',
                canonicalMasterId: group.suggestedCanonicalMasterId,
                duplicateContactIds: [targetId],
                phoneMasked: group.phoneMasked,
                beforeSnapshots: [{ contactId: contact._id, snapshot: beforeSnapshot }],
                afterSnapshots: [{ contactId: contact._id, snapshot: contact.toObject() }],
                fieldChanges: [{ field: 'phones', oldValue: beforeSnapshot.phones, newValue: contact.phones }],
                referenceRewires: [],
                operator: user?._id || null,
                status: 'SUCCESS',
                rollbackAvailable: true
            }], { session });

            group.status = 'DISASSOCIATED';
            group.executedBy = user?._id || null;
            group.executedAt = new Date();
            group.phoneDisassociationResult = {
                action,
                targetContactId: targetId,
                reason: reason || 'Disassociated secondary duplicate phone',
                operationId: audit[0].operationId
            };
            group.migrationReadinessStatus = 'RESOLVED';
            await group.save({ session });

            return {
                success: true,
                operationId: audit[0].operationId,
                action,
                targetContactId: targetId
            };
        });

        if (idempotencyKey) {
            await ContactLockService.recordIdempotency(idempotencyKey, result);
        }

        return result;
    }

    /**
     * Rollback a completed reconciliation operation.
     * Enforces caller verification and exact restoration of state.
     */
    static async rollbackReconciliation(groupId, { user }) {
        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        if (group.status !== 'EXECUTED' && group.status !== 'DISASSOCIATED') {
            throw new Error(`Group in status ${group.status} cannot be rolled back.`);
        }

        if (group.status === 'EXECUTED' && group.mergeOperationId) {
            await rollbackMerge(group.mergeOperationId, { user });
            group.status = 'ROLLED_BACK';
            group.migrationReadinessStatus = 'BLOCKED';
            await group.save();
            return { success: true, message: `Reconciliation ${group.mergeOperationId} rolled back cleanly.` };
        }

        if (group.status === 'DISASSOCIATED') {
            const audit = await ReconciliationAudit.findOne({
                groupFingerprint: group.fingerprint,
                operationType: 'PHONE_DISASSOCIATION'
            }).sort({ createdAt: -1 });

            if (audit && audit.beforeSnapshots?.[0]?.snapshot) {
                const targetId = audit.duplicateContactIds[0];
                const originalPhones = audit.beforeSnapshots[0].snapshot.phones;
                await Contact.updateOne({ _id: targetId }, { $set: { phones: originalPhones } });
                group.status = 'ROLLED_BACK';
                group.migrationReadinessStatus = 'BLOCKED';
                await group.save();
                return { success: true, message: 'Phone disassociation rolled back cleanly.' };
            }
        }

        throw new Error('Rollback data not found for this operation');
    }
}

export default ContactReconciliationService;
