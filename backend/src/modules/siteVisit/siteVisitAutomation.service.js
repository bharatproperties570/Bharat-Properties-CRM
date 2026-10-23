import mongoose from 'mongoose';
import Activity from '../../../models/Activity.js';
import Lead from '../../../models/Lead.js';
import { createNotification } from '../../../controllers/notification.controller.js';
import WhatsAppService from '../../../services/WhatsAppService.js';
import SmsService from '../../../services/SmsService.js';
import IntegrationGuard from '../../../src/utils/IntegrationGuard.js';

function evaluateProviderDispatch(res, channel) {
    if (!res || res.status === 'UNCONFIGURED' || res.unconfigured === true) {
        return {
            success: false,
            status: 'UNCONFIGURED',
            channel,
            delivered: false,
            retryable: true,
            error: res?.error || 'Provider unconfigured or returned empty response'
        };
    }
    // Staging guard block / simulation / mock fallback detection
    const firstMsgId = res.messages?.[0]?.id || res.messageId || '';
    const isBlocked = String(firstMsgId).includes('staging-blocked') || res.blocked === true;
    const isMock = res.mock === true || res.provider === 'mock' || res.simulated === true || res.mockMode === true || isBlocked;

    if (isMock) {
        return {
            success: false,
            status: isBlocked ? 'BLOCKED_BY_GUARD' : 'SIMULATED',
            channel: isBlocked ? 'guard' : 'mock',
            providerMessageId: null,
            delivered: false,
            retryable: true,
            error: isBlocked
                ? 'Outbound dispatch blocked by staging environment guard'
                : 'Simulated send in test/mock mode - carrier dispatch bypassed'
        };
    }
    // Confirmed delivery receipt
    if (res.status === 'DELIVERED' || res.delivered === true) {
        return {
            success: true,
            status: 'DELIVERED',
            channel,
            delivered: true,
            retryable: false,
            providerMessageId: res.messageId || res.messages?.[0]?.id || null
        };
    }
    // Provider acceptance without confirmed delivery receipt
    if (res.status === 'ACCEPTED' || res.success === true || (Array.isArray(res.messages) && res.messages.length > 0) || res.messageId) {
        return {
            success: true,
            status: 'ACCEPTED',
            channel,
            delivered: false,
            retryable: false,
            providerMessageId: res.messages?.[0]?.id || res.messageId || null
        };
    }
    return {
        success: false,
        status: 'FAILED',
        channel,
        delivered: false,
        retryable: true,
        error: res.error || 'Provider rejected dispatch'
    };
}

export { evaluateProviderDispatch };

export class SiteVisitAutomationService {
    static evaluateProviderDispatch(res, channel) {
        return evaluateProviderDispatch(res, channel);
    }
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
            if (visit.status === 'Cancelled' || visit.status === 'Completed') continue;

            // Concurrency-safe atomic check or status claim
            let claimed = true;
            if (typeof ActivityModel.findOneAndUpdate === 'function' && mongoose.connection?.readyState === 1) {
                const claimResult = await ActivityModel.findOneAndUpdate(
                    {
                        _id: visit._id,
                        status: { $in: ['Scheduled', 'Pending'] },
                        'details.remindersSent.h24': { $ne: true }
                    },
                    {
                        $set: {
                            'details.remindersSent.h24Status': 'PROCESSING',
                            'details.remindersSent.h24At': new Date()
                        }
                    },
                    { new: false }
                );
                if (!claimResult) claimed = false;
            }

            if (!claimed) continue; // Already claimed by another concurrent worker or not eligible

            let lead = null;
            if (visit.entityId && mongoose.Types.ObjectId.isValid(visit.entityId)) {
                lead = await LeadModel.findById(visit.entityId).lean().catch(() => null);
            }

            const projectName = visit.details?.projectName || 'your selected property';
            const visitTime = visit.dueTime || (visit.dueDate ? new Date(visit.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'scheduled time');
            const agentName = visit.assignedTo?.fullName || visit.assignedTo?.name || 'our Senior Property Advisor';

            let deliveryResult = { success: false, status: 'UNCONFIGURED', channel: 'none', error: 'No messaging providers configured' };

            // Real Provider Dispatch to Customer
            if (lead?.mobile) {
                const message = `Namaste ${lead.name || lead.firstName || 'Client'}, this is a reminder for your upcoming site visit to ${projectName} tomorrow at ${visitTime}. Property Advisor: ${agentName}. Team Bharat Properties.`;

                try {
                    if (IntegrationGuard.canSendWhatsapp()) {
                        const waRes = await WhatsAppService.sendMessage(lead.mobile, message);
                        deliveryResult = evaluateProviderDispatch(waRes, 'whatsapp');
                    } else if (IntegrationGuard.canSendSms()) {
                        const smsRes = await SmsService.sendSms(lead.mobile, message);
                        deliveryResult = evaluateProviderDispatch(smsRes, 'sms');
                    } else {
                        deliveryResult = { success: false, channel: 'none', status: 'UNCONFIGURED', error: 'Messaging guards disabled' };
                    }
                } catch (sendErr) {
                    deliveryResult = { success: false, status: 'FAILED', channel: 'unknown', error: sendErr.message };
                }

                const maskedPhone = lead.mobile.replace(/(\+\d{2})\d+(\d{4})/, '$1******$2');
                console.log(`[SiteVisitAutomation] 24h Reminder dispatched for Activity ${visit._id} to ${maskedPhone} (Status: ${deliveryResult.status})`);
            } else {
                deliveryResult = { success: false, status: 'MISSING_MOBILE', channel: 'none', error: 'Customer mobile missing' };
            }

            // Only mark h24 = true if real provider accepted or confirmed delivery!
            // Simulated or unconfigured or failed sends do NOT set h24 = true, allowing future retry.
            const isAcceptedOrDelivered = deliveryResult.success === true && (deliveryResult.status === 'ACCEPTED' || deliveryResult.status === 'DELIVERED');

            if (!visit.details) visit.details = {};
            if (!visit.details.remindersSent) visit.details.remindersSent = {};
            visit.details.remindersSent.h24 = isAcceptedOrDelivered;
            visit.details.remindersSent.h24Status = deliveryResult.status;
            visit.details.remindersSent.h24At = isAcceptedOrDelivered ? new Date() : null;
            visit.details.remindersSent.h24AttemptedAt = new Date();
            visit.details.remindersSent.h24Error = deliveryResult.error || null;
            visit.details.remindersSent.h24Channel = deliveryResult.channel || null;
            visit.details.remindersSent.h24MessageId = deliveryResult.providerMessageId || null;

            await ActivityModel.findByIdAndUpdate(visit._id, {
                $set: {
                    'details.remindersSent.h24': isAcceptedOrDelivered,
                    'details.remindersSent.h24Status': deliveryResult.status,
                    'details.remindersSent.h24At': isAcceptedOrDelivered ? new Date() : null,
                    'details.remindersSent.h24AttemptedAt': new Date(),
                    'details.remindersSent.h24Error': deliveryResult.error || null,
                    'details.remindersSent.h24Channel': deliveryResult.channel || null,
                    'details.remindersSent.h24MessageId': deliveryResult.providerMessageId || null
                }
            }).catch(() => {});

            if (typeof visit.save === 'function') {
                await visit.save().catch(() => {});
            }

            // Notify Assigned Agent via In-App Notification
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

            if (deliveryResult.success) {
                dispatched.push({
                    activityId: visit._id,
                    leadId: lead?._id,
                    projectName,
                    type: '24h_reminder',
                    status: deliveryResult.status
                });
            }
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
            if (visit.status === 'Cancelled' || visit.status === 'Completed') continue;

            let claimed = true;
            if (typeof ActivityModel.findOneAndUpdate === 'function' && mongoose.connection?.readyState === 1) {
                const claimResult = await ActivityModel.findOneAndUpdate(
                    {
                        _id: visit._id,
                        status: { $in: ['Scheduled', 'Pending'] },
                        'details.remindersSent.h2': { $ne: true }
                    },
                    {
                        $set: {
                            'details.remindersSent.h2Status': 'PROCESSING',
                            'details.remindersSent.h2At': new Date()
                        }
                    },
                    { new: false }
                );
                if (!claimResult) claimed = false;
            }

            if (!claimed) continue;

            let lead = null;
            if (visit.entityId && mongoose.Types.ObjectId.isValid(visit.entityId)) {
                lead = await LeadModel.findById(visit.entityId).lean().catch(() => null);
            }

            const projectName = visit.details?.projectName || 'property';
            const visitTime = visit.dueTime || (visit.dueDate ? new Date(visit.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '2 hours');
            const agentPhone = visit.assignedTo?.mobile || 'our helpline';

            let deliveryResult = { success: false, status: 'UNCONFIGURED', channel: 'none', error: 'No messaging providers configured' };

            // Real Provider Dispatch to Customer
            if (lead?.mobile) {
                const message = `Namaste ${lead.name || lead.firstName || 'Client'}, your site visit at ${projectName} begins in approximately 2 hours (${visitTime}). For assistance on arrival, call ${agentPhone}. Team Bharat Properties.`;

                try {
                    if (IntegrationGuard.canSendWhatsapp()) {
                        const waRes = await WhatsAppService.sendMessage(lead.mobile, message);
                        deliveryResult = evaluateProviderDispatch(waRes, 'whatsapp');
                    } else if (IntegrationGuard.canSendSms()) {
                        const smsRes = await SmsService.sendSms(lead.mobile, message);
                        deliveryResult = evaluateProviderDispatch(smsRes, 'sms');
                    } else {
                        deliveryResult = { success: false, channel: 'none', status: 'UNCONFIGURED', error: 'Messaging guards disabled' };
                    }
                } catch (sendErr) {
                    deliveryResult = { success: false, status: 'FAILED', channel: 'unknown', error: sendErr.message };
                }

                const maskedPhone = lead.mobile.replace(/(\+\d{2})\d+(\d{4})/, '$1******$2');
                console.log(`[SiteVisitAutomation] 2h Reminder dispatched for Activity ${visit._id} to ${maskedPhone} (Status: ${deliveryResult.status})`);
            } else {
                deliveryResult = { success: false, status: 'MISSING_MOBILE', channel: 'none', error: 'Customer mobile missing' };
            }

            // Only mark h2 = true if real provider accepted or confirmed delivery!
            const isAcceptedOrDelivered = deliveryResult.success === true && (deliveryResult.status === 'ACCEPTED' || deliveryResult.status === 'DELIVERED');

            if (!visit.details) visit.details = {};
            if (!visit.details.remindersSent) visit.details.remindersSent = {};
            visit.details.remindersSent.h2 = isAcceptedOrDelivered;
            visit.details.remindersSent.h2Status = deliveryResult.status;
            visit.details.remindersSent.h2At = isAcceptedOrDelivered ? new Date() : null;
            visit.details.remindersSent.h2AttemptedAt = new Date();
            visit.details.remindersSent.h2Error = deliveryResult.error || null;
            visit.details.remindersSent.h2Channel = deliveryResult.channel || null;
            visit.details.remindersSent.h2MessageId = deliveryResult.providerMessageId || null;

            await ActivityModel.findByIdAndUpdate(visit._id, {
                $set: {
                    'details.remindersSent.h2': isAcceptedOrDelivered,
                    'details.remindersSent.h2Status': deliveryResult.status,
                    'details.remindersSent.h2At': isAcceptedOrDelivered ? new Date() : null,
                    'details.remindersSent.h2AttemptedAt': new Date(),
                    'details.remindersSent.h2Error': deliveryResult.error || null,
                    'details.remindersSent.h2Channel': deliveryResult.channel || null,
                    'details.remindersSent.h2MessageId': deliveryResult.providerMessageId || null
                }
            }).catch(() => {});

            if (typeof visit.save === 'function') {
                await visit.save().catch(() => {});
            }

            // High-priority Agent Notification
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

            if (deliveryResult.success) {
                dispatched.push({
                    activityId: visit._id,
                    leadId: lead?._id,
                    projectName,
                    type: '2h_reminder',
                    status: deliveryResult.status
                });
            }
        }

        return { count: dispatched.length, dispatched };
    }

    /**
     * Dispatch Customer Feedback Link right after visit completion.
     */
    static async dispatchPostVisitFeedback(activity, deliveryOptions = {}) {
        const feedbackUrl = deliveryOptions.feedbackUrl || activity?.details?.feedbackLink;
        if (!activity || !feedbackUrl) {
            return { success: false, message: 'No feedback link generated for activity' };
        }

        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;

        // Idempotency: check if already accepted/delivered
        let currentAct = activity;
        if (mongoose.connection?.readyState === 1 && typeof ActivityModel.findById === 'function') {
            currentAct = await ActivityModel.findById(activity._id).lean().catch(() => null);
        }
        if (currentAct?.details?.feedbackDispatchStatus === 'ACCEPTED' || currentAct?.details?.feedbackDispatchStatus === 'DELIVERED' || currentAct?.details?.feedbackDispatchedAt) {
            return {
                success: true,
                alreadyDispatched: true,
                status: currentAct.details?.feedbackDispatchStatus || 'ACCEPTED',
                feedbackLink: feedbackUrl
            };
        }

        let lead = null;
        if (activity.entityId && mongoose.Types.ObjectId.isValid(activity.entityId)) {
            lead = await LeadModel.findById(activity.entityId).lean().catch(() => null);
        }

        const projectName = activity.details?.projectName || 'our project';

        let dispatchResult = { success: false, status: 'UNCONFIGURED', channel: 'none', error: 'No messaging providers configured' };

        if (lead?.mobile) {
            const message = `Namaste ${lead.name || lead.firstName || 'Client'}, thank you for visiting ${projectName} with Bharat Properties. Please share your valuable experience here: ${feedbackUrl}`;

            try {
                if (IntegrationGuard.canSendWhatsapp()) {
                    const waRes = await WhatsAppService.sendMessage(lead.mobile, message);
                    dispatchResult = evaluateProviderDispatch(waRes, 'whatsapp');
                } else if (IntegrationGuard.canSendSms()) {
                    const smsRes = await SmsService.sendSms(lead.mobile, message);
                    dispatchResult = evaluateProviderDispatch(smsRes, 'sms');
                } else {
                    dispatchResult = { success: false, channel: 'none', status: 'UNCONFIGURED', error: 'Messaging guards disabled' };
                }
            } catch (err) {
                dispatchResult = { success: false, status: 'FAILED', channel: 'unknown', error: err.message };
            }
        } else {
            dispatchResult = { success: false, status: 'MISSING_MOBILE', channel: 'none', error: 'Customer contact details missing' };
        }

        const isAcceptedOrDelivered = dispatchResult.success === true && (dispatchResult.status === 'ACCEPTED' || dispatchResult.status === 'DELIVERED');

        const updateData = {
            'details.feedbackDispatchStatus': dispatchResult.status,
            'details.feedbackDispatchError': dispatchResult.error || null,
            'details.feedbackDispatchChannel': dispatchResult.channel || null,
            'details.feedbackDispatchMessageId': dispatchResult.providerMessageId || null,
            'details.feedbackDispatchAttemptedAt': new Date()
        };
        if (isAcceptedOrDelivered) {
            updateData['details.feedbackDispatchedAt'] = new Date();
        }

        await ActivityModel.findByIdAndUpdate(activity._id, { $set: updateData }).catch(() => {});

        console.log(`[SiteVisitAutomation] Post-visit feedback link dispatch status for Activity ${activity._id}: ${dispatchResult.status}`);

        return {
            success: dispatchResult.success,
            status: dispatchResult.status,
            error: dispatchResult.error,
            feedbackLink: feedbackUrl,
            recipient: lead?.mobile || lead?.email || 'customer',
            activityId: activity._id
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

        // Idempotency check: Ensure at most one escalation task is created per Activity
        let existingTask = null;
        if (typeof ActivityModel.findOne === 'function') {
            if (mongoose.connection?.readyState === 1 || ActivityModel.findOne !== mongoose.Model.findOne) {
                existingTask = await ActivityModel.findOne({
                    type: 'Task',
                    entityId: leadId,
                    tags: 'Escalation-Negative-Feedback',
                    'details.sourceActivityId': activity._id
                });
            }
        }

        if (existingTask) {
            return {
                success: true,
                alreadyEscalated: true,
                escalationTaskId: existingTask._id
            };
        }

        const escalationTags = ['Escalation-Negative-Feedback'];
        escalationTags.$each = ['Escalation-Negative-Feedback'];

        // Tag Activity
        await ActivityModel.findByIdAndUpdate(activity._id, {
            $addToSet: { tags: escalationTags },
            $set: {
                'details.escalatedAt': new Date(),
                'details.escalationReason': comments || `Low customer rating: ${rating}/5`
            }
        }).catch(() => {});

        // Tag Lead & Flag Manager Review
        if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
            await LeadModel.findByIdAndUpdate(leadId, {
                $addToSet: { tags: escalationTags },
                $set: {
                    needsManagerReview: true,
                    managerReviewReason: `Customer rated site visit ${rating}/5: ${comments || 'No comment'}`
                }
            }).catch(() => {});
        }

        // Create Escalation Task for Management (bounded to sourceActivityId)
        const escalationTask = await ActivityModel.create([{
            type: 'Task',
            subject: `🚨 Manager Action Required: Negative Feedback (${rating}/5) for ${projectName}`,
            entityType: 'Lead',
            entityId: leadId,
            dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
            priority: 'High',
            status: 'Pending',
            description: `Customer submitted a rating of ${rating}/5 after completing site visit. Comments: "${comments || 'None provided'}". Immediate management outreach required.`,
            tags: ['Escalation-Negative-Feedback', 'Management-Action'],
            details: {
                sourceActivityId: activity._id,
                rating,
                comments
            }
        }]).catch(() => null);

        console.log(`[SiteVisitAutomation] Created high-priority manager escalation task for Activity ${activity._id}`);

        return {
            success: true,
            escalated: true,
            escalationTaskId: escalationTask ? escalationTask[0]?._id : null
        };
    }
}

export default SiteVisitAutomationService;
