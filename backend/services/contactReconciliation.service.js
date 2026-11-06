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

const sanitizeFieldChanges = (changes) => {
    if (!changes || !Array.isArray(changes)) return [];
    return changes.map(change => {
        if (change.field === 'phones') {
            return {
                field: 'phones',
                oldValue: (change.oldValue || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type })),
                newValue: (change.newValue || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type }))
            };
        }
        if (change.field === 'emails') {
            const maskEmail = (addr) => {
                if (!addr || typeof addr !== 'string') return null;
                const parts = addr.split('@');
                if (parts.length !== 2) return '***';
                const name = parts[0];
                const domain = parts[1];
                const visible = name.slice(0, 2);
                return `${visible}***@${domain}`;
            };
            return {
                field: 'emails',
                oldValue: (change.oldValue || []).map(e => ({ address: maskEmail(e.address), type: e.type })),
                newValue: (change.newValue || []).map(e => ({ address: maskEmail(e.address), type: e.type }))
            };
        }
        if (change.field === 'personalAddress') {
            return {
                field: 'personalAddress',
                oldValue: change.oldValue ? { city: change.oldValue.city, state: change.oldValue.state } : null,
                newValue: change.newValue ? { city: change.newValue.city, state: change.newValue.state } : null
            };
        }
        return change;
    });
};

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
                dryRun.plannedFieldConsolidations.push(...sanitizeFieldChanges(preview.fieldChanges));
            }
        }

        group.dryRunPlan = dryRun;
        await group.save();
        return dryRun;
    }

    /**
     * Operator approves a reconciliation group decision.
     * Binds approval to the exact group fingerprint to prevent stale replay.
     * Enforces mandatory expectedFingerprint and atomic conditional update.
     */
    static async approveGroup(groupId, { user, selectedMasterId, reviewNotes, expectedFingerprint }) {
        if (!expectedFingerprint || typeof expectedFingerprint !== 'string' || expectedFingerprint.trim() === '') {
            const err = new Error('expectedFingerprint is mandatory for approval to ensure group integrity');
            err.statusCode = 400;
            err.code = 'MISSING_EXPECTED_FINGERPRINT';
            throw err;
        }

        const trimmedFingerprint = expectedFingerprint.trim();

        const group = await ReconciliationGroup.findById(groupId);
        if (!group) throw new Error('ReconciliationGroup not found');

        if (selectedMasterId) {
            const valid = group.contactIds.some(c => c.toString() === selectedMasterId.toString());
            if (!valid) throw new Error('Selected canonical master is not a member of this group');
        }

        // Atomic conditional update: matches _id AND fingerprint == expectedFingerprint
        const updatedGroup = await ReconciliationGroup.findOneAndUpdate(
            {
                _id: groupId,
                fingerprint: trimmedFingerprint
            },
            {
                $set: {
                    status: 'APPROVED',
                    approvedFingerprint: trimmedFingerprint,
                    reviewedBy: user?._id || user?.id || null,
                    reviewedAt: new Date(),
                    reviewNotes: reviewNotes?.trim() || 'Approved by operator',
                    ...(selectedMasterId ? { selectedCanonicalMasterId: selectedMasterId } : {})
                }
            },
            { new: true }
        );

        if (!updatedGroup) {
            const err = new Error('Atomic approval failed: Group composition changed concurrently or fingerprint mismatch');
            err.statusCode = 409;
            err.code = 'FINGERPRINT_ALTERED';
            throw err;
        }

        return updatedGroup;
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
     * Execute approved reconciliation merge with safety gates and data protection policy.
     * Enforces strict validation gates:
     * 1. DO_NOT_MERGE is strictly barred from merge (DO_NOT_MERGE_VIOLATION).
     * 2. Approval must match exact current group fingerprint (STALE_APPROVAL_REPLAY).
     * 3. REVIEW_REQUIRED requires explicit operator adjudication (REVIEW_ADJUDICATION_INCOMPLETE).
     * 4. Absolute Contact Data Protection Policy: All automated contact modifications are barred (CONTACT_MUTATION_PROHIBITED).
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

        // Absolute Contact Data Protection Policy: Automated contact modifications are strictly prohibited
        const err = new Error('Execution Rejected: Automated contact merge and mutation is strictly disabled by enterprise data protection policy. Contact reconciliation operates in read-only inspection mode.');
        err.statusCode = 403;
        err.code = 'CONTACT_MUTATION_PROHIBITED';
        throw err;
    }

    /**
     * Operator disassociates duplicate secondary phone: Enforces target verification,
     * then blocks automated mutation under the Absolute Contact Data Protection Policy.
     */
    static async disassociatePhone(groupId, { user, targetContactId, action = 'REMOVE_SECONDARY', reason, idempotencyKey } = {}) {
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

        // Absolute Contact Data Protection Policy: automated phone mutations are strictly disabled
        const err = new Error('Disassociation Rejected: Automated phone disassociation and mutation is strictly disabled by enterprise data protection policy. Contact reconciliation operates in read-only inspection mode.');
        err.statusCode = 403;
        err.code = 'PHONE_DISASSOCIATION_PROHIBITED';
        throw err;
    }

    /**
     * Rollback a completed reconciliation operation: STRICTLY DISABLED by Absolute Contact Data Protection Policy.
     * Contact data remains strictly immutable through reconciliation workflows.
     */
    static async rollbackReconciliation(groupId, { user } = {}) {
        const err = new Error('Rollback Rejected: Automated contact rollback is disabled because automated contact modifications are prohibited.');
        err.statusCode = 403;
        err.code = 'RECONCILIATION_ROLLBACK_PROHIBITED';
        throw err;
    }
}

export default ContactReconciliationService;
