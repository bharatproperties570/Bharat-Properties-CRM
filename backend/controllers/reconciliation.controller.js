import ReconciliationGroup from '../models/ReconciliationGroup.js';
import ReconciliationAudit from '../models/ReconciliationAudit.js';
import ContactReconciliationService from '../services/contactReconciliation.service.js';
import MigrationReadinessService from '../services/migrationReadiness.service.js';
import { maskPhoneNumber, maskName } from '../services/contactClassification.service.js';

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
                .populate('contactIds', 'name phones isDeleted isMerged createdAt owner tags')
                .lean(),
            ReconciliationGroup.countDocuments(query)
        ]);

        // Mask contact identifiers and names
        const sanitized = groups.map(g => ({
            ...g,
            phoneNumber: undefined, // Strip raw phone from API response
            contacts: (g.contactIds || []).map(c => ({
                _id: c._id,
                maskedName: maskName(c.name),
                phones: (c.phones || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type })),
                isDeleted: c.isDeleted,
                isMerged: c.isMerged,
                hasTags: (c.tags || []).length > 0,
                createdAt: c.createdAt
            })),
            contactIds: undefined
        }));

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
            .populate('contactIds', 'name surname emails phones personalAddress company designation source createdAt owner tags')
            .lean();

        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        const sanitized = {
            ...group,
            phoneNumber: undefined,
            contacts: (group.contactIds || []).map(c => ({
                _id: c._id,
                maskedName: maskName(c.name),
                surname: c.surname ? maskName(c.surname) : null,
                phones: (c.phones || []).map(p => ({ number: maskPhoneNumber(p.number), type: p.type })),
                company: c.company || null,
                designation: c.designation || null,
                createdAt: c.createdAt,
                hasAddress: Boolean(c.personalAddress?.city),
                tagCount: (c.tags || []).length
            })),
            contactIds: undefined
        };

        res.status(200).json({ success: true, data: sanitized });
    } catch (error) {
        next(error);
    }
};

export const generatePlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const plan = await ContactReconciliationService.generateDryRunPlan(id);
        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        next(error);
    }
};

export const approveGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { selectedMasterId, reviewNotes } = req.body;
        const group = await ContactReconciliationService.approveGroup(id, {
            user: req.user,
            selectedMasterId,
            reviewNotes
        });
        res.status(200).json({ success: true, message: 'Group approved for reconciliation', data: group });
    } catch (error) {
        next(error);
    }
};

export const rejectGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reviewNotes } = req.body;
        const group = await ContactReconciliationService.rejectGroup(id, {
            user: req.user,
            reviewNotes
        });
        res.status(200).json({ success: true, message: 'Group rejected from reconciliation', data: group });
    } catch (error) {
        next(error);
    }
};

export const executeGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const idempotencyKey = req.headers['idempotency-key'];
        const result = await ContactReconciliationService.executeReconciliation(id, {
            user: req.user,
            idempotencyKey
        });
        res.status(200).json({ success: true, message: 'Reconciliation executed successfully', data: result });
    } catch (error) {
        next(error);
    }
};

export const disassociatePhone = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { targetContactId, action, reason } = req.body;
        const result = await ContactReconciliationService.disassociatePhone(id, {
            user: req.user,
            targetContactId,
            action,
            reason
        });
        res.status(200).json({ success: true, message: 'Phone disassociation completed successfully', data: result });
    } catch (error) {
        next(error);
    }
};

export const rollbackGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await ContactReconciliationService.rollbackReconciliation(id, {
            user: req.user
        });
        res.status(200).json({ success: true, message: 'Reconciliation rolled back successfully', data: result });
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
