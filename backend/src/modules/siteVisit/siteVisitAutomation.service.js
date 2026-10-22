import mongoose from 'mongoose';
import Activity from '../../../models/Activity.js';
import Lead from '../../../models/Lead.js';
import { createNotification } from '../../../controllers/notification.controller.js';

export class SiteVisitAutomationService {
    /**
     * Dispatch 24-hour reminders for upcoming site visits.
     */
    static async dispatch24hReminders(referenceDate = new Date()) {
        const start = new Date(referenceDate.getTime() + 22 * 60 * 60 * 1000);
        const end = new Date(referenceDate.getTime() + 26 * 60 * 60 * 1000);

        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;

        const visits = await ActivityModel.find({
            type: 'Site Visit',
            status: { $in: ['Scheduled', 'Pending'] },
            dueDate: { $gte: start, $lte: end },
            'details.remindersSent.h24': { $ne: true }
        }).populate('assignedTo', 'fullName name mobile email');

        const dispatched = [];

        for (const visit of visits) {
            let lead = null;
            if (visit.entityId && mongoose.Types.ObjectId.isValid(visit.entityId)) {
                lead = await LeadModel.findById(visit.entityId).lean().catch(() => null);
            }

            const projectName = visit.details?.projectName || 'your selected property';
            const visitTime = visit.dueTime || (visit.dueDate ? new Date(visit.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'scheduled time');
            const agentName = visit.assignedTo?.fullName || visit.assignedTo?.name || 'our Senior Property Advisor';

            // 1. Notify Customer (WhatsApp / SMS simulation or mock)
            if (lead?.mobile) {
                console.log(`[SiteVisitAutomation] 24h WhatsApp Reminder sent to customer ${lead.name || lead.mobile} for ${projectName}`);
            }

            // 2. Notify Assigned Agent
            if (visit.assignedTo?._id && mongoose.connection?.readyState === 1) {
                try {
                    await createNotification(
                        visit.assignedTo._id,
                        'site_visit_reminder',
                        '📅 24-Hour Site Visit Reminder',
                        `Upcoming site visit tomorrow at ${visitTime} with ${lead?.name || 'Client'} for ${projectName}.`,
                        `/activities/${visit._id}`,
                        { activityId: visit._id, leadId: lead?._id }
                    );
                } catch (notifErr) {
                    console.warn('[SiteVisitAutomation] Agent notification warning:', notifErr.message);
                }
            }

            // Flag reminder sent
            if (!visit.details) visit.details = {};
            if (!visit.details.remindersSent) visit.details.remindersSent = {};
            visit.details.remindersSent.h24 = true;
            visit.details.remindersSent.h24At = new Date();
            await visit.save();

            dispatched.push({
                activityId: visit._id,
                leadId: lead?._id,
                projectName,
                type: '24h_reminder'
            });
        }

        return { count: dispatched.length, dispatched };
    }

    /**
     * Dispatch 2-hour immediate reminders with arrival instructions.
     */
    static async dispatch2hReminders(referenceDate = new Date()) {
        const start = new Date(referenceDate.getTime() + 1 * 60 * 60 * 1000);
        const end = new Date(referenceDate.getTime() + 3 * 60 * 60 * 1000);

        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;

        const visits = await ActivityModel.find({
            type: 'Site Visit',
            status: { $in: ['Scheduled', 'Pending'] },
            dueDate: { $gte: start, $lte: end },
            'details.remindersSent.h2': { $ne: true }
        }).populate('assignedTo', 'fullName name mobile email');

        const dispatched = [];

        for (const visit of visits) {
            let lead = null;
            if (visit.entityId && mongoose.Types.ObjectId.isValid(visit.entityId)) {
                lead = await LeadModel.findById(visit.entityId).lean().catch(() => null);
            }

            const projectName = visit.details?.projectName || 'property';
            const visitTime = visit.dueTime || (visit.dueDate ? new Date(visit.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '2 hours');
            const agentPhone = visit.assignedTo?.mobile || 'our helpline';

            // Customer alert
            if (lead?.mobile) {
                console.log(`[SiteVisitAutomation] 2h Immediate Arrival Reminder sent to ${lead.name || lead.mobile} for ${projectName}`);
            }

            // High-priority Agent ping
            if (visit.assignedTo?._id && mongoose.connection?.readyState === 1) {
                try {
                    await createNotification(
                        visit.assignedTo._id,
                        'urgent_site_visit',
                        '🚨 2-Hour Site Visit Alert',
                        `Urgent: Site visit starts in ~2 hours (${visitTime}) at ${projectName}. Please ensure flat keys and brochures are ready.`,
                        `/activities/${visit._id}`,
                        { activityId: visit._id, urgent: true }
                    );
                } catch (notifErr) {
                    console.warn('[SiteVisitAutomation] Agent notification warning:', notifErr.message);
                }
            }

            if (!visit.details) visit.details = {};
            if (!visit.details.remindersSent) visit.details.remindersSent = {};
            visit.details.remindersSent.h2 = true;
            visit.details.remindersSent.h2At = new Date();
            await visit.save();

            dispatched.push({
                activityId: visit._id,
                leadId: lead?._id,
                projectName,
                type: '2h_reminder'
            });
        }

        return { count: dispatched.length, dispatched };
    }

    /**
     * Dispatch Customer Feedback Link right after visit completion.
     */
    static async dispatchPostVisitFeedback(activity) {
        if (!activity || !activity.details?.feedbackLink) {
            return { success: false, message: 'No feedback link generated for activity' };
        }

        const LeadModel = mongoose.models.Lead || Lead;
        let lead = null;
        if (activity.entityId && mongoose.Types.ObjectId.isValid(activity.entityId)) {
            lead = await LeadModel.findById(activity.entityId).lean().catch(() => null);
        }

        const projectName = activity.details?.projectName || 'our project';
        const feedbackUrl = activity.details.feedbackLink;

        console.log(`[SiteVisitAutomation] 💌 Dispatched post-visit feedback link to customer ${lead?.name || 'Lead'}: ${feedbackUrl}`);

        const ActivityModel = mongoose.models.Activity || Activity;
        await ActivityModel.findByIdAndUpdate(activity._id, {
            $set: { 'details.feedbackDispatchedAt': new Date() }
        }).catch(() => {});

        return {
            success: true,
            feedbackLink: feedbackUrl,
            recipient: lead?.mobile || lead?.email || 'customer'
        };
    }

    /**
     * Escalate negative customer feedback (Rating <= 2) to Sales Manager.
     */
    static async escalateNegativeFeedback(activity, rating, comments = '') {
        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;

        const projectName = activity.details?.projectName || 'Site Visit';
        const leadId = activity.entityId;

        // Tag Activity
        await ActivityModel.findByIdAndUpdate(activity._id, {
            $addToSet: { tags: 'Escalation-Negative-Feedback' },
            $set: {
                'details.escalatedAt': new Date(),
                'details.escalationReason': comments || `Low customer rating: ${rating}/5`
            }
        }).catch(() => {});

        // Tag Lead & Flag Manager Review
        if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
            await LeadModel.findByIdAndUpdate(leadId, {
                $addToSet: { tags: 'Escalation-Negative-Feedback' },
                $set: {
                    needsManagerReview: true,
                    managerReviewReason: `Customer rated site visit ${rating}/5: ${comments || 'No comment'}`
                }
            }).catch(() => {});
        }

        // Create Escalation Task for Management
        const escalationTask = await ActivityModel.create([{
            type: 'Task',
            subject: `🚨 Manager Action Required: Negative Feedback (${rating}/5) for ${projectName}`,
            entityType: 'Lead',
            entityId: leadId,
            dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
            priority: 'High',
            status: 'Pending',
            description: `Customer submitted a rating of ${rating}/5 after completing site visit. Comments: "${comments || 'None provided'}". Immediate management outreach required.`,
            tags: ['Escalation-Negative-Feedback', 'Management-Action']
        }]).catch(() => null);

        console.log(`[SiteVisitAutomation] 🚨 Created high-priority manager escalation task for Activity ${activity._id}`);

        return {
            success: true,
            escalated: true,
            escalationTaskId: escalationTask ? escalationTask[0]?._id : null
        };
    }
}

export default SiteVisitAutomationService;
