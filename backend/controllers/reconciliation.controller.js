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
 * Determine if caller has authorized global visibility.
 */
const isCallerGlobalAdmin = (user) => {
    if (!user) return false;
    const userEmail = (user.email || '').toLowerCase().trim();
    const roleName = (user.role?.name || user.role || '').toLowerCase().trim();
    const isSystemOwner = userEmail === 'bharatproperties570@gmail.com' || userEmail === 'shreykeshwar@gmail.com';
    const isSuperAdmin = roleName === 'super admin';
    const hasAllScope = user.dataScope === 'all';
    const hasTenant = Boolean(user.tenantId || user.tenant);

    return (isSystemOwner || isSuperAdmin || hasAllScope) && !hasTenant;
};

/**
 * Verify whether caller has visibility to ALL contacts in a group.
 * Strictly fails closed:
 * - Every contact ID in group must be distinctly matched by user's visibility filter.
 * - Missing, deleted, or hidden contacts reject the entire operation.
 * - Never silently treats a query error as global access.
 */
export const verifyGroupVisibility = async (user, contactIds) => {
    if (!user) return false;
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        return false;
    }

    const uniqueIds = [...new Set(contactIds.map(id => (id?._id || id).toString()))];

    let resolvedUser = user;
    if (user && user._id && (!user.role || typeof user.role !== 'object' || !user.role.name)) {
        try {
            const UserModel = mongoose.models.User || mongoose.model('User');
            const foundUser = await UserModel.findById(user._id).populate('role').lean();
            if (foundUser) resolvedUser = foundUser;
        } catch (_) {}
    }

    let visibilityFilter;
    try {
        visibilityFilter = await getVisibilityFilter(resolvedUser);
    } catch (err) {
        console.error('[RECON_VISIBILITY] getVisibilityFilter threw error, failing closed:', err);
        return false;
    }

    // Global access check: only authorized platform global admin
    if (!visibilityFilter || Object.keys(visibilityFilter).length === 0) {
        if (isCallerGlobalAdmin(resolvedUser)) {
            // Verify that all contacts actually exist in the database
            try {
                const existingCount = await Contact.countDocuments({ _id: { $in: uniqueIds } });
                return existingCount === uniqueIds.length;
            } catch (err) {
                console.error('[RECON_VISIBILITY] DB existence query failed, failing closed:', err);
                return false;
            }
        }
        // If not an authorized global admin, empty filter is NOT permitted
        return false;
    }

    try {
        const visibleContacts = await Contact.find({
            _id: { $in: uniqueIds },
            ...visibilityFilter
        }).select('_id').lean();

        const visibleIdSet = new Set(visibleContacts.map(c => c._id.toString()));
        // EVERY contact ID must be accessible
        const allVisible = uniqueIds.every(id => visibleIdSet.has(id));
        return allVisible && uniqueIds.length === visibleContacts.length;
    } catch (err) {
        console.error('[RECON_VISIBILITY] DB visibility query failed, failing closed:', err);
        return false;
    }
};

export const getSummary = async (req, res, next) => {
    try {
        const isGlobal = isCallerGlobalAdmin(req.user);
        let groupFilter = {};

        if (!isGlobal) {
            let visibilityFilter;
            try {
                visibilityFilter = await getVisibilityFilter(req.user);
            } catch (err) {
                return res.status(500).json({
                    success: false,
                    code: 'VISIBILITY_EVALUATION_FAILED',
                    message: 'Failed to evaluate caller visibility boundaries'
                });
            }

            const visibleContactIds = await Contact.find(visibilityFilter).distinct('_id');
            // Strict visibility: only groups where ALL contactIds belong to visibleContactIds
            groupFilter = {
                contactIds: {
                    $not: { $elemMatch: { $nin: visibleContactIds } },
                    $in: visibleContactIds
                }
            };
        }

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
            ReconciliationGroup.countDocuments(groupFilter),
            ReconciliationGroup.countDocuments({ ...groupFilter, primaryClassification: 'SAFE_AUTO_MERGE' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, primaryClassification: 'REVIEW_REQUIRED' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, primaryClassification: 'DO_NOT_MERGE' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, status: 'PENDING_REVIEW' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, status: 'APPROVED' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, status: 'EXECUTED' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, status: 'DISASSOCIATED' }),
            ReconciliationGroup.countDocuments({ ...groupFilter, status: 'ROLLED_BACK' }),
            // Database-level Migration 004 readiness requires global administrative privileges
            isGlobal
                ? MigrationReadinessService.evaluateReadiness()
                : {
                    ready: false,
                    status: 'BLOCKED',
                    message: 'Restricted: Global administrator privileges required to evaluate migration readiness',
                    checks: [],
                    blockerReasons: ['ACCESS_RESTRICTED: Non-global callers cannot evaluate migration readiness.']
                }
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
        res.status(500).json({
            success: false,
            code: 'SUMMARY_FETCH_FAILED',
            message: 'Failed to retrieve reconciliation summary'
        });
    }
};

export const getGroups = async (req, res, next) => {
    try {
        const { classification, status, page = 1, limit = 20, search } = req.query;
        const query = {};

        const isGlobal = isCallerGlobalAdmin(req.user);
        let visibleContactIds = null;
        let visibleIdSet = null;

        if (!isGlobal) {
            let visibilityFilter;
            try {
                visibilityFilter = await getVisibilityFilter(req.user);
            } catch (err) {
                return res.status(500).json({
                    success: false,
                    code: 'VISIBILITY_EVALUATION_FAILED',
                    message: 'Failed to evaluate caller visibility boundaries'
                });
            }

            visibleContactIds = await Contact.find(visibilityFilter).distinct('_id');
            visibleIdSet = new Set(visibleContactIds.map(id => id.toString()));

            // Only return groups where EVERY contact is visible (no partially visible groups)
            query.contactIds = {
                $not: { $elemMatch: { $nin: visibleContactIds } },
                $in: visibleContactIds
            };
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

        // Secondary in-memory defense: filter out any group with even 1 hidden contact
        const filteredGroups = !isGlobal && visibleIdSet
            ? groups.filter(g => (g.contactIds || []).every(c => c && visibleIdSet.has((c._id || c).toString())))
            : groups;

        const sanitized = filteredGroups.map(sanitizeGroup);

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
        res.status(500).json({
            success: false,
            code: 'GROUPS_FETCH_FAILED',
            message: 'Failed to fetch reconciliation groups'
        });
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

        // Strict: verify EVERY contact in group is visible to caller
        const isVisible = await verifyGroupVisibility(req.user, group.contactIds.map(c => c._id));
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
            });
        }

        const sanitized = sanitizeGroup(group);

        res.status(200).json({ success: true, data: sanitized });
    } catch (error) {
        res.status(500).json({
            success: false,
            code: 'GROUP_FETCH_FAILED',
            message: 'Failed to fetch reconciliation group'
        });
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
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
            });
        }

        const plan = await ContactReconciliationService.generateDryRunPlan(id);
        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        res.status(500).json({
            success: false,
            code: 'PLAN_GENERATION_FAILED',
            message: error.message || 'Failed to generate dry run plan'
        });
    }
};

export const approveGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { selectedMasterId, reviewNotes, expectedFingerprint } = req.body;

        // Mandatory fingerprint validation: prevent stale approvals
        if (!expectedFingerprint || typeof expectedFingerprint !== 'string' || expectedFingerprint.trim() === '') {
            return res.status(400).json({
                success: false,
                code: 'MISSING_EXPECTED_FINGERPRINT',
                message: 'expectedFingerprint is required to approve reconciliation'
            });
        }

        const group = await ReconciliationGroup.findById(id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Reconciliation group not found' });
        }

        // Caller Visibility Check: every member must be visible
        const isVisible = await verifyGroupVisibility(req.user, group.contactIds);
        if (!isVisible) {
            return res.status(403).json({
                success: false,
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
            });
        }

        // Fingerprint check: prevent approving altered group
        if (expectedFingerprint.trim() !== group.fingerprint) {
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
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            code: error.code || 'APPROVAL_FAILED',
            message: error.message || 'Failed to approve reconciliation group'
        });
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
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
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
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            code: error.code || 'REJECTION_FAILED',
            message: error.message || 'Failed to reject reconciliation group'
        });
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
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
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
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            code: error.code || 'EXECUTION_FAILED',
            message: error.message || 'Failed to execute reconciliation'
        });
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
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
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
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            code: error.code || 'DISASSOCIATION_FAILED',
            message: error.message || 'Failed to disassociate phone'
        });
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
                code: 'GROUP_VISIBILITY_DENIED',
                message: 'Forbidden: One or more contacts in this group are outside your visibility scope'
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
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            code: error.code || 'ROLLBACK_FAILED',
            message: error.message || 'Failed to roll back reconciliation'
        });
    }
};

export const getMigrationReadiness = async (req, res, next) => {
    try {
        const isGlobal = isCallerGlobalAdmin(req.user);
        if (!isGlobal) {
            return res.status(403).json({
                success: false,
                code: 'ACCESS_RESTRICTED',
                message: 'Forbidden: Global administrator privileges required to evaluate database migration readiness'
            });
        }

        const readiness = await MigrationReadinessService.evaluateReadiness();
        res.status(200).json({ success: true, data: readiness });
    } catch (error) {
        res.status(500).json({
            success: false,
            code: 'READINESS_EVALUATION_FAILED',
            message: 'Failed to evaluate migration readiness'
        });
    }
};

export const syncGroups = async (req, res, next) => {
    try {
        const stats = await ContactReconciliationService.scanAndSyncGroups();
        res.status(200).json({ success: true, message: 'Groups scanned and synced successfully', data: stats });
    } catch (error) {
        res.status(500).json({
            success: false,
            code: 'SYNC_FAILED',
            message: 'Failed to scan and sync reconciliation groups'
        });
    }
};
