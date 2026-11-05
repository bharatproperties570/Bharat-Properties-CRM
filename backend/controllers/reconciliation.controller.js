import ReconciliationGroup from '../models/ReconciliationGroup.js';
import ReconciliationAudit from '../models/ReconciliationAudit.js';
import Contact from '../models/Contact.js';
import ContactReconciliationService from '../services/contactReconciliation.service.js';
import MigrationReadinessService from '../services/migrationReadiness.service.js';
import { maskPhoneNumber, maskName } from '../services/contactClassification.service.js';
import { getVisibilityFilter } from '../utils/visibility.js';

/**
 * Helper to sanitize contact object and strip raw PII.
 */
const sanitizeContact = (c) => {
    if (!c) return null;
    return {
        _id: c._id,
        maskedName: maskName(c.name),
        surname: c.surname ? maskName(c.surname) : null,
        phones: (c.phones || []).map(p => ({
            number: maskPhoneNumber(p.number),
            type: p.type
        })),
        company: c.company || null,
        designation: c.designation || null,
        isDeleted: Boolean(c.isDeleted),
        isMerged: Boolean(c.isMerged),
        hasTags: (c.tags || []).length > 0,
        createdAt: c.createdAt
    };
};

/**
 * Helper to sanitize group document removing raw phone and raw PII.
 */
const sanitizeGroup = (g) => {
    if (!g) return null;
    const doc = typeof g.toObject === 'function' ? g.toObject() : { ...g };
    delete doc.phoneNumber; // Strip unmasked phone
    if (doc.contactIds && Array.isArray(doc.contactIds)) {
        doc.contacts = doc.contactIds.map(c => (c && typeof c === 'object' && c._id ? sanitizeContact(c) : { _id: c }));
        delete doc.contactIds;
    }
    return doc;
};

/**
 * Verify whether caller has visibility to the contacts in a group.
 */
const verifyGroupVisibility = async (user, contactIds) => {
    const visibilityFilter = await getVisibilityFilter(user);
    if (!visibilityFilter || Object.keys(visibilityFilter).length === 0) {
        return true; // Global bypass
    }
    const matchingCount = await Contact.countDocuments({
        _id: { $in: contactIds },
        ...visibilityFilter
    });
    return matchingCount > 0;
};

export const getSummary = async (req, res, next) => {
    try {
        const [
            totalGroups,
            safeCount,
            reviewCount,
            doNotMergeCount,
            pendingReviewCount,
            approvedCount,
            executedCount,
            disassociatedCount,
            rolledBackCount,
            readiness
        ] = await Promise.all([
            ReconciliationGroup.countDocuments({}),
            ReconciliationGroup.countDocuments({ primaryClassification: 'SAFE_AUTO_MERGE' }),
            ReconciliationGroup.countDocuments({ primaryClassification: 'REVIEW_REQUIRED' }),
            ReconciliationGroup.countDocuments({ primaryClassification: 'DO_NOT_MERGE' }),
            ReconciliationGroup.countDocuments({ status: 'PENDING_REVIEW' }),
            ReconciliationGroup.countDocuments({ status: 'APPROVED' }),
            ReconciliationGroup.countDocuments({ status: 'EXECUTED' }),
            ReconciliationGroup.countDocuments({ status: 'DISASSOCIATED' }),
            ReconciliationGroup.countDocuments({ status: 'ROLLED_BACK' }),
            MigrationReadinessService.evaluateReadiness()
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalGroups,
                byClassification: {
                    SAFE_AUTO_MERGE: safeCount,
                    REVIEW_REQUIRED: reviewCount,
                    DO_NOT_MERGE: doNotMergeCount
                },
                byStatus: {
                    PENDING_REVIEW: pendingReviewCount,
                    APPROVED: approvedCount,
                    EXECUTED: executedCount,
                    DISASSOCIATED: disassociatedCount,
                    ROLLED_BACK: rolledBackCount
                },
                migration004Readiness: readiness
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getGroups = async (req, res, next) => {
    try {
        const { classification, status, page = 1, limit = 20, search } = req.query;
        const query = {};

        // Multi-Tenant / Ownership Visibility Filter
        const visibilityFilter = await getVisibilityFilter(req.user);
        if (visibilityFilter && Object.keys(visibilityFilter).length > 0) {
            const visibleContactIds = await Contact.find(visibilityFilter).distinct('_id');
            query.contactIds = { $in: visibleContactIds };
        }

        if (classification && classification !== 'ALL') {
            query.primaryClassification = classification;
        }
        if (status && status !== 'ALL') {
            query.status = status;
        }
        if (search) {
            query.$or = [
                { phoneMasked: { $regex: search, $options: 'i' } },
                { fingerprint: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [groups, total] = await Promise.all([
            ReconciliationGroup.find(query)
                .sort({ 'evidence.totalReferences': -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .populate('contactIds', 'name surname phones isDeleted isMerged createdAt owner tags company designation')
                .lean(),
            ReconciliationGroup.countDocuments(query)
        ]);

        const sanitized = groups.map(sanitizeGroup);

        res.status(200).json({
            success: true,
            data: sanitized,
            pagination: {
                total,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                pages: Math.ceil(total / parseInt(limit, 10))
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getGroupById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const group = await ReconciliationGroup.findById(id)
            .populate('contactIds', 'name surname emails phones personalAddress company designation source createdAt owner tags isDeleted isMerged')
            .lean();

        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        // Verify visibility
        const isVisible = await verifyGroupVisibility(req.user, group.contactIds.map(c => c._id));
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const sanitized = sanitizeGroup(group);

        res.status(200).json({ success: true, data: sanitized });
    } catch (error) {
        next(error);
    }
};

export const generatePlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const group = await ReconciliationGroup.findById(id).lean();
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const plan = await ContactReconciliationService.generateDryRunPlan(id);
        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        next(error);
    }
};

export const approveGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { selectedMasterId, reviewNotes, expectedFingerprint } = req.body;

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        // Caller Visibility Check
        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        // Fingerprint check: prevent approving altered group
        if (expectedFingerprint && expectedFingerprint !== group.fingerprint) {
            return res.status(409).json({
                success: false,
                code: 'FINGERPRINT_ALTERED',
                message: 'Group composition or evidence has changed since last loaded. Please refresh and review again.'
            });
        }

        const updated = await ContactReconciliationService.approveGroup(id, {
            user: req.user,
            selectedMasterId,
            reviewNotes,
            expectedFingerprint
        });

        res.status(200).json({
            success: true,
            message: 'Group approved for reconciliation',
            data: sanitizeGroup(updated)
        });
    } catch (error) {
        next(error);
    }
};

export const rejectGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reviewNotes } = req.body;

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const updated = await ContactReconciliationService.rejectGroup(id, {
            user: req.user,
            reviewNotes
        });

        res.status(200).json({
            success: true,
            message: 'Group rejected from reconciliation',
            data: sanitizeGroup(updated)
        });
    } catch (error) {
        next(error);
    }
};

export const executeGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const result = await ContactReconciliationService.executeReconciliation(id, {
            user: req.user,
            idempotencyKey
        });

        res.status(200).json({
            success: true,
            message: 'Reconciliation executed successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const disassociatePhone = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { targetContactId, action, reason } = req.body;
        const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const result = await ContactReconciliationService.disassociatePhone(id, {
            user: req.user,
            targetContactId,
            action,
            reason,
            idempotencyKey
        });

        res.status(200).json({
            success: true,
            message: 'Phone disassociation completed successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const rollbackGroup = async (req, res, next) => {
    try {
        const { id } = req.params;

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have visibility access to the contacts in this group'
            });
        }

        const result = await ContactReconciliationService.rollbackReconciliation(id, {
            user: req.user
        });

        res.status(200).json({
            success: true,
            message: 'Reconciliation rolled back successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getMigrationReadiness = async (req, res, next) => {
    try {
        const readiness = await MigrationReadinessService.evaluateReadiness();
        res.status(200).json({ success: true, data: readiness });
    } catch (error) {
        next(error);
    }
};

export const syncGroups = async (req, res, next) => {
    try {
        const stats = await ContactReconciliationService.scanAndSyncGroups();
        res.status(200).json({ success: true, message: 'Groups scanned and synced successfully', data: stats });
    } catch (error) {
        next(error);
    }
};
