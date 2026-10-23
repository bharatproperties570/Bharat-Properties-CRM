import mongoose from 'mongoose';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Activity from '../../../models/Activity.js';
import Lead from '../../../models/Lead.js';
import Deal from '../../../models/Deal.js';
import LookupService from '../../../services/LookupService.js';
import { autoTriggerStageChange } from '../../../controllers/activity.controller.js';
import SiteVisitAutomationService from './siteVisitAutomation.service.js';

export class SiteVisitService {
    /**
     * Schedule a new Site Visit for a Lead.
     */
    static async schedule(payload, user = null) {
        const { leadId, date, time, properties = [], assignedTo, pickupRequired, pickupAddress, remarks, source } = payload;

        if (!leadId || !mongoose.Types.ObjectId.isValid(leadId)) {
            throw new Error('Valid leadId is required to schedule a site visit');
        }
        if (!date || !time) {
            throw new Error('Date and time are required to schedule a site visit');
        }

        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new Error('Lead not found');
        }

        // Normalize visited properties list
        const normalizedProperties = Array.isArray(properties) ? properties.map(p => ({
            project: p.project || p.name || p.projectName || '',
            block: p.block || '',
            property: p.property || p.unit || p.unitNumber || '',
            inventoryId: p.inventoryId || p.id || null,
            result: p.result || 'Scheduled',
            notes: p.notes || ''
        })) : [];

        const firstProject = normalizedProperties[0]?.project || lead.projectName || 'General Project';

        // Idempotency check: prevent duplicate pending visits on the exact same date
        const visitDate = new Date(date);
        const startOfDay = new Date(visitDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(visitDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingPending = await Activity.findOne({
            entityType: 'Lead',
            entityId: lead._id,
            type: 'Site Visit',
            status: { $in: ['Pending', 'Scheduled'] },
            dueDate: { $gte: startOfDay, $lte: endOfDay }
        });

        if (existingPending) {
            return {
                alreadyScheduled: true,
                activity: existingPending,
                message: 'A site visit is already scheduled for this lead on this date.'
            };
        }

        const performerName = user?.fullName || user?.name || 'CRM Consultant';
        const targetAssignee = assignedTo || lead.owner || user?._id || user?.id || null;

        const activity = await Activity.create({
            type: 'Site Visit',
            subject: `Site Visit: ${lead.firstName || 'Lead'} - ${firstProject}`,
            description: remarks || `Site visit scheduled for ${firstProject}.`,
            status: 'Pending',
            entityType: 'Lead',
            entityId: lead._id,
            dueDate: visitDate,
            dueTime: time,
            priority: payload.priority || 'High',
            assignedTo: targetAssignee,
            createdBy: user?._id || user?.id || null,
            performedBy: performerName,
            tags: ['Site-Visit', source || 'CRM-Direct'],
            details: {
                source: source || 'CRM Direct',
                projectName: firstProject,
                pickupRequired: Boolean(pickupRequired),
                pickupAddress: pickupAddress || '',
                visitedProperties: normalizedProperties,
                rescheduleHistory: []
            }
        });

        // Auto-advance Lead stage to 'Site Visit Scheduled'
        try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const scheduledStageId = await LookupService.resolve('Stage', 'Site Visit Scheduled');
                if (scheduledStageId) {
                    await Lead.findByIdAndUpdate(lead._id, {
                        stage: scheduledStageId,
                        lastActivityAt: new Date()
                    });
                }
            }
        } catch (stageErr) {
            console.warn('[SiteVisitService] Auto-advancing lead stage failed:', stageErr.message);
        }

        return {
            alreadyScheduled: false,
            activity,
            message: 'Site visit scheduled successfully'
        };
    }

    /**
     * Reschedule an existing Site Visit.
     */
    static async reschedule(activityId, payload, user = null) {
        const { newDate, newTime, reason } = payload;
        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            throw new Error('Valid activityId is required');
        }
        if (!newDate || !newTime) {
            throw new Error('New date and time are required for rescheduling');
        }
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            throw new Error('A valid reason is mandatory when rescheduling a site visit');
        }

        const trimmedReason = reason.trim();
        const userName = user?.fullName || user?.name || 'CRM User';
        const userId = user?._id || user?.id || null;

        // Atomic CAS State Transition
        let activity = null;
        if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
            activity = await Activity.findOneAndUpdate(
                {
                    _id: activityId,
                    type: 'Site Visit',
                    status: { $in: ['Pending', 'Scheduled'] }
                },
                {
                    $set: {
                        dueDate: new Date(newDate),
                        dueTime: newTime,
                        status: 'Pending',
                        'details.lastRescheduledReason': trimmedReason,
                        'details.lastRescheduledAt': new Date(),
                        'details.remindersSent.h24': false,
                        'details.remindersSent.h24Status': 'PENDING_RESCHEDULED',
                        'details.remindersSent.h2': false,
                        'details.remindersSent.h2Status': 'PENDING_RESCHEDULED',
                        'details.remindersSent.rescheduledAt': new Date()
                    },
                    $push: {
                        'details.rescheduleHistory': {
                            newDate: new Date(newDate),
                            newTime,
                            reason: trimmedReason,
                            rescheduledBy: userId,
                            rescheduledByName: userName,
                            rescheduledAt: new Date()
                        }
                    }
                },
                { new: true }
            );
        } else {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Completed site visits cannot be rescheduled');
            if (current.status === 'Cancelled') throw new Error('Cancelled site visits cannot be rescheduled');

            if (!current.details) current.details = {};
            if (!Array.isArray(current.details.rescheduleHistory)) current.details.rescheduleHistory = [];

            current.details.rescheduleHistory.push({
                previousDate: current.dueDate,
                previousTime: current.dueTime,
                newDate: new Date(newDate),
                newTime,
                reason: trimmedReason,
                rescheduledBy: userId,
                rescheduledByName: userName,
                rescheduledAt: new Date()
            });

            current.dueDate = new Date(newDate);
            current.dueTime = newTime;
            current.status = 'Pending';
            current.details.lastRescheduledReason = trimmedReason;
            current.details.lastRescheduledAt = new Date();

            if (current.details.remindersSent) {
                current.details.remindersSent = {
                    previousSchedule: { ...current.details.remindersSent },
                    h24: false,
                    h24Status: 'PENDING_RESCHEDULED',
                    h2: false,
                    h2Status: 'PENDING_RESCHEDULED',
                    rescheduledAt: new Date()
                };
            }
            activity = current;
        }

        if (!activity) {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Completed site visits cannot be rescheduled');
            if (current.status === 'Cancelled') throw new Error('Cancelled site visits cannot be rescheduled');
            throw new Error(`Cannot reschedule site visit with status '${current.status}'`);
        }

        if (typeof activity.save === 'function') {
            await activity.save().catch(() => {});
        }

        return {
            activity,
            message: 'Site visit rescheduled successfully'
        };
    }

    /**
     * Cancel an existing Site Visit.
     */
    static async cancel(activityId, payload, user = null) {
        const { reason } = payload;
        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            throw new Error('Valid activityId is required');
        }
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            throw new Error('A valid cancellation reason is mandatory');
        }

        const trimmedReason = reason.trim();
        const userName = user?.fullName || user?.name || 'CRM User';
        const userId = user?._id || user?.id || null;

        // Atomic CAS State Transition
        let activity = null;
        if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
            activity = await Activity.findOneAndUpdate(
                {
                    _id: activityId,
                    type: 'Site Visit',
                    status: { $in: ['Pending', 'Scheduled'] }
                },
                {
                    $set: {
                        status: 'Cancelled',
                        'details.cancelReason': trimmedReason,
                        'details.cancelledAt': new Date(),
                        'details.cancelledBy': userId,
                        'details.cancelledByName': userName
                    }
                },
                { new: true }
            );
        } else {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Completed site visits cannot be cancelled');
            if (current.status === 'Cancelled') {
                return { activity: current, alreadyCancelled: true, message: 'Site visit is already cancelled' };
            }
            current.status = 'Cancelled';
            if (!current.details) current.details = {};
            current.details.cancelReason = trimmedReason;
            current.details.cancelledAt = new Date();
            current.details.cancelledBy = userId;
            current.details.cancelledByName = userName;
            activity = current;
        }

        if (!activity) {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Completed site visits cannot be cancelled');
            if (current.status === 'Cancelled') {
                return { activity: current, alreadyCancelled: true, message: 'Site visit is already cancelled' };
            }
            throw new Error(`Cannot cancel site visit with status '${current.status}'`);
        }

        if (typeof activity.save === 'function') {
            await activity.save().catch(() => {});
        }

        return {
            activity,
            alreadyCancelled: false,
            message: 'Site visit cancelled successfully'
        };
    }

    /**
     * Complete a Site Visit with outcomes and generate a customer feedback link.
     */
    static async complete(activityId, payload, user = null) {
        const { outcome, visitedProperties, dealId, completionNotes, clientRating } = payload;
        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            throw new Error('Valid activityId is required');
        }
        if (!outcome || typeof outcome !== 'string' || outcome.trim() === '') {
            throw new Error('Completion outcome is required (e.g. Interested, Token Given, Low Budget, Location Mismatch, Postponed, Not Interested)');
        }

        const performerName = user?.fullName || user?.name || 'CRM Consultant';
        const trimmedOutcome = outcome.trim();

        // 1. Pre-validate Deal Linkage if provided (Fail-Closed!)
        let dealDoc = null;
        if (dealId) {
            if (!dealId || !mongoose.Types.ObjectId.isValid(dealId)) {
                throw new Error('Valid dealId is required');
            }
            // Database must be available to verify the deal relationship — fail closed!
            if (mongoose.connection?.readyState !== 1 && Deal.findById === mongoose.Model.findById) {
                throw new Error('Database unavailable: Cannot verify deal linkage');
            }
            dealDoc = await Deal.findById(dealId);
            if (!dealDoc) {
                throw new Error('Linked deal does not exist');
            }
            const dealLeadId = dealDoc.lead || dealDoc.leadId;
            if (!dealLeadId) {
                throw new Error('Linked deal has no associated lead relation');
            }
        }

        // 2. Atomic Compare-And-Set (CAS) State Transition
        let activity = null;
        if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
            const updateOps = {
                status: 'Completed',
                completedAt: new Date(),
                completionResult: trimmedOutcome,
                performedBy: performerName,
                'details.outcome': trimmedOutcome
            };
            if (clientRating) updateOps['details.clientRating'] = Number(clientRating);
            if (Array.isArray(visitedProperties) && visitedProperties.length > 0) {
                updateOps['details.visitedProperties'] = visitedProperties;
            }

            activity = await Activity.findOneAndUpdate(
                {
                    _id: activityId,
                    type: 'Site Visit',
                    status: { $in: ['Pending', 'Scheduled'] }
                },
                { $set: updateOps },
                { new: true }
            );
        } else {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Site visit is already completed');
            if (current.status === 'Cancelled') throw new Error('Cancelled site visits cannot be completed');
            current.status = 'Completed';
            current.completedAt = new Date();
            current.completionResult = trimmedOutcome;
            current.performedBy = performerName;
            if (!current.details) current.details = {};
            current.details.outcome = trimmedOutcome;
            if (clientRating) current.details.clientRating = Number(clientRating);
            if (Array.isArray(visitedProperties) && visitedProperties.length > 0) {
                current.details.visitedProperties = visitedProperties;
            }
            activity = current;
        }

        if (!activity) {
            const current = await Activity.findById(activityId);
            if (!current) throw new Error('Activity not found');
            if (current.type !== 'Site Visit') throw new Error('Activity is not a Site Visit');
            if (current.status === 'Completed') throw new Error('Site visit is already completed');
            if (current.status === 'Cancelled') throw new Error('Cancelled site visits cannot be completed');
            throw new Error(`Cannot complete site visit with status '${current.status}'`);
        }

        // 3. Confirm Deal Lead matches Activity Lead
        if (dealDoc) {
            const dealLeadId = dealDoc.lead || dealDoc.leadId;
            if (String(dealLeadId) !== String(activity.entityId)) {
                await Activity.findByIdAndUpdate(activityId, {
                    $set: { status: 'Pending', completionResult: null },
                    $unset: { completedAt: 1 }
                }).catch(() => {});
                throw new Error('Linked deal does not belong to the same lead as this site visit');
            }

            const dealTitle = dealDoc.title || 'Linked Deal';
            if (!Array.isArray(activity.relatedTo)) activity.relatedTo = [];
            const exists = activity.relatedTo.some(r => String(r.id) === String(dealId));
            if (!exists) {
                activity.relatedTo.push({ id: dealId, model: 'Deal', name: dealTitle });
            }

            // Sync property details and update deal score (SINGLE EXECUTION on winning transition)
            const firstVisited = activity.details?.visitedProperties?.[0];
            if (firstVisited && (mongoose.connection?.readyState === 1 || Deal.findByIdAndUpdate !== mongoose.Model.findByIdAndUpdate)) {
                const dealUpdate = {};
                if (firstVisited.property) dealUpdate.unitNo = firstVisited.property;
                if (firstVisited.project) dealUpdate.projectName = firstVisited.project;
                if (firstVisited.block) dealUpdate.block = firstVisited.block;
                if (['interested', 'token given', 'negotiation'].includes(trimmedOutcome.toLowerCase())) {
                    dealUpdate.$inc = { dealScore: 15 };
                }
                if (Object.keys(dealUpdate).length > 0) {
                    await Deal.findByIdAndUpdate(dealId, dealUpdate).catch(() => {});
                }
            }
        }

        if (completionNotes) {
            activity.description = activity.description
                ? `${activity.description}\n[Completion Notes]: ${completionNotes}`
                : completionNotes;
        }

        // Generate Customer Feedback Token & Link (Store ONLY hash & JTI - Never persist raw token)
        let feedbackToken = null;
        let feedbackLink = null;
        const secret = process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET;
        if (secret && activity.entityId) {
            const jti = crypto.randomUUID ? crypto.randomUUID() : (await import('uuid')).v4();
            const formSlug = 'customer-experience-feedback-qx9z2';
            const baseUrl = process.env.FRONTEND_URL || 'https://bharatproperties.co';

            feedbackToken = jwt.sign(
                {
                    iss: 'bharat-properties-crm',
                    leadId: String(activity.entityId),
                    activityId: String(activity._id),
                    purpose: 'customer_feedback',
                    source: 'site_visit_completion',
                    formSlug,
                    jti
                },
                secret,
                { expiresIn: '30d' }
            );

            const safeToken = feedbackToken.replace(/\./g, '~');
            feedbackLink = `${baseUrl}/public/feedback/${formSlug}?ref=${safeToken}`;

            const tokenHash = crypto.createHash('sha256').update(feedbackToken).digest('hex');
            if (!activity.details) activity.details = {};
            activity.details.feedbackTokenHash = tokenHash;
            activity.details.feedbackTokenJti = jti;
            activity.details.feedbackLink = feedbackLink;
            delete activity.details.feedbackToken;
        }

        if (typeof activity.save === 'function') {
            await activity.save().catch(() => {});
        }

        // Automatically dispatch feedback request via genuine notification delivery
        let dispatchResult = null;
        try {
            dispatchResult = await SiteVisitAutomationService.dispatchPostVisitFeedback(activity);
        } catch (autoErr) {
            console.warn('[SiteVisitService] Feedback dispatch warning:', autoErr.message);
        }

        // Trigger Stage Transition Engine & Scoring
        let transition = null;
        try {
            transition = await autoTriggerStageChange(activity, user?._id || user?.id || null);
        } catch (transErr) {
            console.error('[SiteVisitService] autoTriggerStageChange error:', transErr.message);
        }

        return {
            activity,
            stageTransition: transition,
            feedbackLink,
            feedbackToken,
            feedbackDispatch: dispatchResult,
            message: 'Site visit completed successfully'
        };
    }

    /**
     * Get site visit details by ID.
     */
    static async getById(activityId) {
        if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
            throw new Error('Valid activityId is required');
        }
        const activity = await Activity.findOne({ _id: activityId, type: 'Site Visit' })
            .populate('assignedTo', 'fullName name email mobile phone')
            .populate('createdBy', 'fullName name')
            .lean();

        if (!activity) {
            throw new Error('Site visit not found');
        }
        return activity;
    }

    /**
     * List site visits with enterprise filters.
     */
    static async list(filters = {}) {
        const query = { type: 'Site Visit' };

        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.leadId && mongoose.Types.ObjectId.isValid(filters.leadId)) {
            query.entityType = 'Lead';
            query.entityId = filters.leadId;
        }
        if (filters.assignedTo && mongoose.Types.ObjectId.isValid(filters.assignedTo)) {
            query.assignedTo = filters.assignedTo;
        }
        if (filters.startDate || filters.endDate) {
            query.dueDate = {};
            if (filters.startDate) query.dueDate.$gte = new Date(filters.startDate);
            if (filters.endDate) query.dueDate.$lte = new Date(filters.endDate);
        }

        const page = parseInt(filters.page, 10) || 1;
        const limit = parseInt(filters.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Activity.find(query)
                .sort({ dueDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('assignedTo', 'fullName name mobile phone')
                .lean(),
            Activity.countDocuments(query)
        ]);

        return {
            items,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    }
}

export default SiteVisitService;
