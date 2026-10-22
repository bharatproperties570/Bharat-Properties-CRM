import mongoose from 'mongoose';
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

        const activity = await Activity.findById(activityId);
        if (!activity) {
            throw new Error('Activity not found');
        }
        if (activity.type !== 'Site Visit') {
            throw new Error('Activity is not a Site Visit');
        }
        if (activity.status === 'Completed') {
            throw new Error('Completed site visits cannot be rescheduled');
        }
        if (activity.status === 'Cancelled') {
            throw new Error('Cancelled site visits cannot be rescheduled');
        }

        if (!activity.details) activity.details = {};
        if (!Array.isArray(activity.details.rescheduleHistory)) {
            activity.details.rescheduleHistory = [];
        }

        activity.details.rescheduleHistory.push({
            previousDate: activity.dueDate,
            previousTime: activity.dueTime,
            newDate: new Date(newDate),
            newTime,
            reason: reason.trim(),
            rescheduledBy: user?._id || user?.id || null,
            rescheduledByName: user?.fullName || user?.name || 'CRM User',
            rescheduledAt: new Date()
        });

        activity.dueDate = new Date(newDate);
        activity.dueTime = newTime;
        activity.status = 'Pending';
        activity.details.lastRescheduledReason = reason.trim();
        activity.details.lastRescheduledAt = new Date();

        await activity.save();

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

        const activity = await Activity.findById(activityId);
        if (!activity) {
            throw new Error('Activity not found');
        }
        if (activity.type !== 'Site Visit') {
            throw new Error('Activity is not a Site Visit');
        }
        if (activity.status === 'Completed') {
            throw new Error('Completed site visits cannot be cancelled');
        }

        if (!activity.details) activity.details = {};
        activity.status = 'Cancelled';
        activity.details.cancelReason = reason.trim();
        activity.details.cancelledAt = new Date();
        activity.details.cancelledBy = user?._id || user?.id || null;
        activity.details.cancelledByName = user?.fullName || user?.name || 'CRM User';

        await activity.save();

        return {
            activity,
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

        const activity = await Activity.findById(activityId);
        if (!activity) {
            throw new Error('Activity not found');
        }
        if (activity.type !== 'Site Visit') {
            throw new Error('Activity is not a Site Visit');
        }
        if (activity.status === 'Completed') {
            throw new Error('Site visit is already completed');
        }

        const performerName = user?.fullName || user?.name || 'CRM Consultant';
        activity.status = 'Completed';
        activity.completedAt = new Date();
        activity.completionResult = outcome.trim();
        activity.performedBy = performerName;

        if (completionNotes) {
            activity.description = activity.description
                ? `${activity.description}\n[Completion Notes]: ${completionNotes}`
                : completionNotes;
        }

        if (!activity.details) activity.details = {};
        activity.details.outcome = outcome.trim();
        if (clientRating) {
            activity.details.clientRating = Number(clientRating);
        }

        if (Array.isArray(visitedProperties) && visitedProperties.length > 0) {
            activity.details.visitedProperties = visitedProperties;
        }

        // Deal linkage
        if (dealId && mongoose.Types.ObjectId.isValid(dealId)) {
            if (!Array.isArray(activity.relatedTo)) activity.relatedTo = [];
            const exists = activity.relatedTo.some(r => String(r.id) === String(dealId));
            if (!exists) {
                activity.relatedTo.push({ id: dealId, model: 'Deal', name: 'Linked Deal' });
            }

            // Sync property details to deal
            const firstVisited = activity.details.visitedProperties?.[0];
            if (firstVisited && mongoose.connection && mongoose.connection.readyState === 1) {
                const dealUpdate = {};
                if (firstVisited.property) dealUpdate.unitNo = firstVisited.property;
                if (firstVisited.project) dealUpdate.projectName = firstVisited.project;
                if (firstVisited.block) dealUpdate.block = firstVisited.block;
                if (['interested', 'token given', 'negotiation'].includes(outcome.toLowerCase())) {
                    dealUpdate.$inc = { dealScore: 15 };
                }
                if (Object.keys(dealUpdate).length > 0) {
                    await Deal.findByIdAndUpdate(dealId, dealUpdate).catch(() => {});
                }
            }
        }

        // Generate Customer Feedback Token & Link
        let feedbackToken = null;
        let feedbackLink = null;
        if (process.env.JWT_SECRET && activity.entityId) {
            feedbackToken = jwt.sign(
                {
                    leadId: String(activity.entityId),
                    activityId: String(activity._id),
                    purpose: 'customer_feedback',
                    source: 'site_visit_completion'
                },
                process.env.JWT_SECRET,
                { expiresIn: '60d' }
            );

            const baseUrl = process.env.FRONTEND_URL || 'https://bharatproperties.co';
            const formSlug = 'customer-experience-feedback-qx9z2';
            feedbackLink = `${baseUrl}/public/feedback/${formSlug}?ref=${feedbackToken}`;

            activity.details.feedbackToken = feedbackToken;
            activity.details.feedbackLink = feedbackLink;
        }

        await activity.save();

        // Automatically dispatch feedback request
        try {
            await SiteVisitAutomationService.dispatchPostVisitFeedback(activity);
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
