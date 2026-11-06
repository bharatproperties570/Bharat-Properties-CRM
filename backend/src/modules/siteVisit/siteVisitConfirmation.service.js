import mongoose from 'mongoose';
import crypto from 'crypto';
import Activity from '../../../models/Activity.js';
import Lead from '../../../models/Lead.js';
import Contact from '../../../models/Contact.js';
import WhatsAppService from '../../../services/WhatsAppService.js';
import { SiteVisitService } from './siteVisit.service.js';
import { SiteVisitJourneyService } from './siteVisitJourney.service.js';
import { normalizePhone } from '../../../utils/normalization.js';

/**
 * Utility helper to extract all possible search variants of an Indian mobile number
 * to ensure robust database resolution across +91, 91, and 10-digit formats.
 */
function getPhoneVariants(phone) {
    if (!phone) return [];
    const raw = String(phone).replace(/\D/g, '');
    const clean10 = raw.slice(-10);
    const set = new Set([
        phone,
        raw,
        clean10,
        `91${clean10}`,
        `+91${clean10}`,
        `0${clean10}`
    ]);
    return Array.from(set).filter(Boolean);
}

/**
 * Formats a JavaScript Date into clean Indian English presentation (e.g. "15 Nov 2026")
 */
function formatVisitDate(dateObj) {
    if (!dateObj) return 'Scheduled Date';
    try {
        const d = new Date(dateObj);
        if (Number.isNaN(d.getTime())) return String(dateObj);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (_) {
        return String(dateObj);
    }
}

/**
 * SiteVisitConfirmationService
 * 
 * Handles the complete lifecycle for:
 * 1. Customer confirmation via WhatsApp "Yes, Confirm" button callbacks.
 * 2. Correlation of inbound replies to pending Site Visit activities.
 * 3. Idempotent confirmation persistence and audit logging.
 * 4. Dispatch of the dedicated Meta-approved Site Visit Journey template.
 * 5. Safe error isolation and "CONFIRMED_JOURNEY_PENDING" state when template is pending approval.
 * 6. Rescheduling callbacks and journey open tracking.
 */
export class SiteVisitConfirmationService {
    /**
     * Determines whether an incoming webhook message represents a "Yes, Confirm" response.
     */
    static isYesConfirmReply(text = '', message = {}) {
        const cleanText = String(text || '').trim().toLowerCase();
        
        // Direct text matches
        if (cleanText === 'yes, confirm' || cleanText === 'yes confirm' || cleanText === 'confirm') {
            return true;
        }

        // WhatsApp button reply matches
        const btnText = String(message.button?.text || message.button?.payload || '').trim().toLowerCase();
        if (btnText === 'yes, confirm' || btnText === 'yes confirm' || btnText === 'confirm' || btnText === 'confirm_visit') {
            return true;
        }

        // WhatsApp interactive button_reply matches
        const interactive = message.interactive || {};
        if (interactive.type === 'button_reply') {
            const title = String(interactive.button_reply?.title || '').trim().toLowerCase();
            const id = String(interactive.button_reply?.id || '').trim().toLowerCase();
            if (title === 'yes, confirm' || title === 'yes confirm' || title === 'confirm' || id === 'yes_confirm' || id === 'confirm_visit') {
                return true;
            }
        }

        return false;
    }

    /**
     * Determines whether an incoming webhook message represents a "Reschedule" request.
     */
    static isRescheduleReply(text = '', message = {}) {
        const cleanText = String(text || '').trim().toLowerCase();
        if (cleanText.includes('reschedule') || cleanText === 'change date' || cleanText === 'change time') {
            return true;
        }

        const btnText = String(message.button?.text || message.button?.payload || '').trim().toLowerCase();
        if (btnText.includes('reschedule')) return true;

        const interactive = message.interactive || {};
        if (interactive.type === 'button_reply') {
            const title = String(interactive.button_reply?.title || '').trim().toLowerCase();
            const id = String(interactive.button_reply?.id || '').trim().toLowerCase();
            if (title.includes('reschedule') || id.includes('reschedule')) return true;
        }

        return false;
    }

    /**
     * Resolves the target Site Visit activity for an inbound customer reply.
     * Correlation hierarchy:
     * 1. Original outbound WhatsApp message ID (message.context.id) matching stored dispatch IDs.
     * 2. Customer mobile number resolving active Lead and their upcoming Pending/Scheduled Site Visit.
     * 3. Customer mobile number matching Activity participants.
     */
    static async resolveSiteVisitForCallback({ mobile, originalMessageId = null, tenantId = null, session = null }) {
        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;
        const sessionOpt = session ? { session } : undefined;

        // ── Precedence 1: Correlation via original outbound message ID ──
        if (originalMessageId && typeof ActivityModel.findOne === 'function') {
            const msgQuery = {
                type: 'Site Visit',
                status: { $in: ['Pending', 'Scheduled'] },
                $or: [
                    { 'details.waScheduleMessageId': originalMessageId },
                    { 'details.waId': originalMessageId },
                    { 'details.remindersSent.h24MessageId': originalMessageId },
                    { 'details.remindersSent.h2MessageId': originalMessageId },
                    { 'details.journeyMessageId': originalMessageId }
                ]
            };
            if (tenantId) msgQuery.tenantId = tenantId;

            const matchedByMsg = await ActivityModel.findOne(msgQuery, null, sessionOpt);
            if (matchedByMsg) {
                return {
                    activity: matchedByMsg,
                    method: 'MESSAGE_CORRELATION',
                    originalMessageId
                };
            }
        }

        // ── Precedence 2: Customer phone number resolving Lead & Site Visit ──
        if (mobile) {
            const phoneVariants = getPhoneVariants(mobile);

            let lead = null;
            if (typeof LeadModel.findOne === 'function') {
                const leadQuery = { mobile: { $in: phoneVariants } };
                if (tenantId) leadQuery.tenantId = tenantId;
                lead = await LeadModel.findOne(leadQuery, null, sessionOpt).lean();
            }

            if (lead && lead._id && typeof ActivityModel.findOne === 'function') {
                // Find pending or scheduled site visit for this lead (within last 24h or in future)
                const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
                const leadVisitQuery = {
                    type: 'Site Visit',
                    entityType: 'Lead',
                    entityId: lead._id,
                    status: { $in: ['Pending', 'Scheduled'] },
                    dueDate: { $gte: yesterday }
                };
                if (tenantId) leadVisitQuery.tenantId = tenantId;

                const visit = await ActivityModel.findOne(leadVisitQuery, null, sessionOpt)
                    .sort({ dueDate: 1 });

                if (visit) {
                    return {
                        activity: visit,
                        lead,
                        method: 'PHONE_LEAD_LOOKUP'
                    };
                }
            }

            // ── Precedence 3: Participants phone matching ──
            if (typeof ActivityModel.findOne === 'function') {
                const partQuery = {
                    type: 'Site Visit',
                    status: { $in: ['Pending', 'Scheduled'] },
                    'participants.mobile': { $in: phoneVariants }
                };
                if (tenantId) partQuery.tenantId = tenantId;

                const visitByPart = await ActivityModel.findOne(partQuery, null, sessionOpt)
                    .sort({ dueDate: 1 });

                if (visitByPart) {
                    return {
                        activity: visitByPart,
                        lead: lead || null,
                        method: 'PARTICIPANT_PHONE_LOOKUP'
                    };
                }
            }
        }

        return { activity: null, method: 'NONE' };
    }

    /**
     * Handles the customer confirmation callback when "Yes, Confirm" is clicked.
     */
    static async handleConfirmationCallback({ mobile, message = {}, originalMessageId = null, value = null, text = '', session = null }) {
        const traceId = crypto.randomBytes(6).toString('hex');
        const resolved = await this.resolveSiteVisitForCallback({
            mobile,
            originalMessageId: originalMessageId || message?.context?.id || null,
            session
        });

        const activity = resolved.activity;
        if (!activity) {
            console.warn(`[SiteVisitConfirmation][${traceId}] No pending Site Visit activity found for customer ${mobile}`);
            return {
                matched: false,
                reason: 'NO_ACTIVE_SITE_VISIT'
            };
        }

        // Strict Cancellation Check: Cancelled site visits cannot be confirmed
        if (activity.status === 'Cancelled') {
            console.warn(`[SiteVisitConfirmation][${traceId}] Confirmation attempted on CANCELLED Site Visit ${activity._id}`);
            return {
                matched: true,
                success: false,
                reason: 'VISIT_CANCELLED',
                activityId: activity._id
            };
        }

        // Idempotency Contract: Prevent duplicate confirmations and redundant template dispatch
        const incomingMsgId = message?.id || null;
        const alreadyConfirmed = activity.details?.customerConfirmed === true;
        const isDuplicateCallback = alreadyConfirmed && (
            (incomingMsgId && activity.details?.confirmationMessageId === incomingMsgId) ||
            activity.details?.confirmationStatus === 'CONFIRMED'
        );

        if (isDuplicateCallback) {
            console.log(`[SiteVisitConfirmation][${traceId}] Idempotent callback suppressed: Activity ${activity._id} is already CONFIRMED.`);
            return {
                matched: true,
                success: true,
                duplicate: true,
                activity,
                confirmationStatus: activity.details?.confirmationStatus || 'CONFIRMED'
            };
        }

        // Persist Customer Confirmation State
        if (!activity.details) activity.details = {};
        activity.details.customerConfirmed = true;
        activity.details.customerConfirmedAt = new Date();
        activity.details.confirmationMethod = 'WHATSAPP_BUTTON';
        activity.details.confirmationMessageId = incomingMsgId;
        activity.details.confirmationOpaqueId = originalMessageId || message?.context?.id || null;

        // Audit Trail Entry
        if (!Array.isArray(activity.details.auditHistory)) {
            activity.details.auditHistory = [];
        }
        activity.details.auditHistory.push({
            action: 'CUSTOMER_CONFIRMED',
            source: 'WHATSAPP_QUICK_REPLY',
            timestamp: new Date(),
            metadata: {
                mobile,
                messageId: incomingMsgId,
                originalMessageId: originalMessageId || message?.context?.id || null,
                traceId
            }
        });

        // Generate / Retrieve Personal Journey Link upfront
        let journeyInfo = null;
        try {
            journeyInfo = await SiteVisitService.getJourneyLink(activity._id, null, { session });
        } catch (linkErr) {
            console.error(`[SiteVisitConfirmation][${traceId}] Error generating journey link:`, linkErr.message);
        }

        // Attempt Dedicated Journey Template Dispatch
        let dispatchResult = { success: false, status: 'SKIPPED', error: 'Journey token unavailable' };
        if (journeyInfo && journeyInfo.safeToken) {
            dispatchResult = await this.dispatchJourneyTemplate(activity._id, null, {
                session,
                safeToken: journeyInfo.safeToken,
                journeyUrl: journeyInfo.journeyUrl
            });
        }

        // Set Confirmation Status based on dispatch outcome
        if (dispatchResult.success) {
            activity.details.confirmationStatus = 'CONFIRMED';
            activity.details.journeyDispatchStatus = 'ACCEPTED';
            activity.details.journeyMessageId = dispatchResult.messageId || null;
            activity.details.journeyDispatchedAt = new Date();
            activity.details.journeyShared = true;
        } else {
            // Business Decision Locked: Retain confirmation but flag journey pending
            activity.details.confirmationStatus = 'CONFIRMED_JOURNEY_PENDING';
            activity.details.journeyDispatchStatus = 'FAILED';
            activity.details.journeyDispatchError = dispatchResult.error || 'Meta template delivery pending or failed';
            activity.details.journeyLastAttemptAt = new Date();
            console.warn(`[SiteVisitConfirmation][${traceId}] Journey dispatch failed for Activity ${activity._id}. State set to CONFIRMED_JOURNEY_PENDING: ${dispatchResult.error}`);
        }

        // Save activity document
        const ActivityModel = mongoose.models.Activity || Activity;
        if (typeof ActivityModel.findByIdAndUpdate === 'function') {
            await ActivityModel.findByIdAndUpdate(
                activity._id,
                { $set: { details: activity.details } },
                session ? { session } : {}
            );
        } else if (typeof activity.save === 'function') {
            await activity.save(session ? { session } : {});
        }

        return {
            matched: true,
            success: true,
            duplicate: false,
            activity,
            confirmationStatus: activity.details.confirmationStatus,
            journeyDispatched: dispatchResult.success
        };
    }

    /**
     * Dispatches the dedicated Meta-approved Site Visit Journey template:
     * Template: site_visit_journey_confirmation
     * Category: UTILITY
     * Dynamic URL Button: View Visit Journey (suffix = safeToken)
     */
    static async dispatchJourneyTemplate(activityId, user = null, options = {}) {
        const traceId = crypto.randomBytes(6).toString('hex');
        const ActivityModel = mongoose.models.Activity || Activity;
        const LeadModel = mongoose.models.Lead || Lead;
        const sessionOpt = options.session ? { session: options.session } : undefined;

        let activity = null;
        if (typeof ActivityModel.findById === 'function') {
            activity = await ActivityModel.findById(activityId, null, sessionOpt);
        }
        if (!activity) {
            return { success: false, error: 'Activity not found' };
        }

        if (activity.status === 'Cancelled') {
            return { success: false, error: 'Cannot dispatch journey template for cancelled visit' };
        }

        // Resolve recipient customer mobile and name
        let recipientMobile = null;
        let recipientName = 'Client';

        if (activity.entityType === 'Lead' && activity.entityId && typeof LeadModel.findById === 'function') {
            const lead = await LeadModel.findById(activity.entityId, null, sessionOpt).lean();
            if (lead) {
                recipientMobile = lead.mobile;
                recipientName = lead.firstName || lead.name || 'Client';
            }
        }

        if (!recipientMobile && Array.isArray(activity.participants) && activity.participants.length > 0) {
            recipientMobile = activity.participants[0].mobile;
            recipientName = activity.participants[0].name || recipientName;
        }

        if (!recipientMobile) {
            return { success: false, error: 'Recipient customer mobile number is missing' };
        }

        // Resolve or verify journey token
        let safeToken = options.safeToken;
        if (!safeToken) {
            try {
                const linkRes = await SiteVisitService.getJourneyLink(activity._id, user, options);
                safeToken = linkRes.safeToken;
            } catch (linkErr) {
                return { success: false, error: `Failed to resolve journey token: ${linkErr.message}` };
            }
        }

        const visitDateStr = formatVisitDate(activity.dueDate);
        const visitTimeStr = String(activity.dueTime || '11:00 AM');

        // Meta Template Component Specification
        // Body parameters: {{1}} = Name, {{2}} = Date, {{3}} = Time
        // Button parameters: {{1}} = Dynamic URL Suffix (safeToken)
        const templateComponents = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: recipientName },
                    { type: 'text', text: visitDateStr },
                    { type: 'text', text: visitTimeStr }
                ]
            },
            {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                    { type: 'text', text: safeToken }
                ]
            }
        ];

        const idempotencyKey = `sv_journey_tpl_${activity._id}_${Date.now()}`;

        try {
            const sendResult = await WhatsAppService.sendTemplate(
                recipientMobile,
                'site_visit_journey_confirmation',
                'en',
                templateComponents,
                { idempotencyKey }
            );

            if (sendResult?.success || sendResult?.messages?.[0]?.id) {
                const messageId = sendResult?.messageId || sendResult?.messages?.[0]?.id || `wamid.mock.${Date.now()}`;
                console.log(`[SiteVisitConfirmation][${traceId}] Journey template dispatched successfully to ${recipientMobile}. MessageId: ${messageId}`);
                return {
                    success: true,
                    messageId,
                    status: 'ACCEPTED'
                };
            }

            const errorMsg = sendResult?.error || 'Provider rejected template dispatch';
            console.warn(`[SiteVisitConfirmation][${traceId}] Template dispatch rejected: ${errorMsg}`);
            return {
                success: false,
                error: errorMsg,
                status: 'FAILED'
            };
        } catch (sendErr) {
            console.error(`[SiteVisitConfirmation][${traceId}] Exception during template dispatch:`, sendErr.message);
            return {
                success: false,
                error: sendErr.message,
                status: 'FAILED'
            };
        }
    }

    /**
     * Resends or retries the Site Visit Journey template (e.g. from CRM UI or retry queue)
     * without resetting or changing the customer's verified confirmation status.
     */
    static async resendJourneyTemplate(activityId, user = null, options = {}) {
        const ActivityModel = mongoose.models.Activity || Activity;
        const activity = await ActivityModel.findById(activityId);
        if (!activity) {
            const err = new Error('Site visit not found');
            err.statusCode = 404;
            throw err;
        }

        if (activity.status === 'Cancelled') {
            const err = new Error('Cannot send journey template for cancelled visit');
            err.statusCode = 410;
            throw err;
        }

        const dispatchResult = await this.dispatchJourneyTemplate(activityId, user, options);

        if (!activity.details) activity.details = {};
        if (dispatchResult.success) {
            activity.details.confirmationStatus = 'CONFIRMED';
            activity.details.journeyDispatchStatus = 'ACCEPTED';
            activity.details.journeyMessageId = dispatchResult.messageId;
            activity.details.journeyDispatchedAt = new Date();
            activity.details.journeyShared = true;
        } else {
            // Keep customer confirmation intact; record retry failure
            activity.details.confirmationStatus = 'CONFIRMED_JOURNEY_PENDING';
            activity.details.journeyDispatchStatus = 'FAILED';
            activity.details.journeyDispatchError = dispatchResult.error;
            activity.details.journeyLastAttemptAt = new Date();
        }

        // Add audit history
        if (!Array.isArray(activity.details.auditHistory)) activity.details.auditHistory = [];
        activity.details.auditHistory.push({
            action: 'JOURNEY_TEMPLATE_RESEND_ATTEMPT',
            user: user?._id || user?.id || 'SYSTEM',
            success: dispatchResult.success,
            messageId: dispatchResult.messageId || null,
            error: dispatchResult.error || null,
            timestamp: new Date()
        });

        await ActivityModel.findByIdAndUpdate(activity._id, { $set: { details: activity.details } });

        return {
            success: dispatchResult.success,
            confirmationStatus: activity.details.confirmationStatus,
            journeyMessageId: dispatchResult.messageId || null,
            error: dispatchResult.error || null
        };
    }

    /**
     * Handles customer request to reschedule.
     */
    static async handleRescheduleCallback({ mobile, message = {}, text = '', session = null }) {
        const resolved = await this.resolveSiteVisitForCallback({
            mobile,
            originalMessageId: message?.context?.id || null,
            session
        });

        const activity = resolved.activity;
        if (!activity) {
            return { matched: false, reason: 'NO_ACTIVE_SITE_VISIT' };
        }

        if (!activity.details) activity.details = {};
        activity.details.rescheduleRequested = true;
        activity.details.rescheduleRequestedAt = new Date();
        activity.details.confirmationStatus = 'RESCHEDULE_REQUESTED';

        if (!Array.isArray(activity.details.auditHistory)) activity.details.auditHistory = [];
        activity.details.auditHistory.push({
            action: 'CUSTOMER_RESCHEDULE_REQUESTED',
            source: 'WHATSAPP_MESSAGE',
            timestamp: new Date(),
            metadata: { mobile, messageId: message?.id }
        });

        const ActivityModel = mongoose.models.Activity || Activity;
        if (typeof ActivityModel.findByIdAndUpdate === 'function') {
            await ActivityModel.findByIdAndUpdate(activity._id, { $set: { details: activity.details } });
        } else if (typeof activity.save === 'function') {
            await activity.save();
        }

        return {
            matched: true,
            success: true,
            activity,
            confirmationStatus: 'RESCHEDULE_REQUESTED'
        };
    }

    /**
     * Tracks when a client actually opens their personalized journey web link.
     */
    static async trackJourneyOpened(activityId) {
        if (!activityId) return;
        try {
            const ActivityModel = mongoose.models.Activity || Activity;
            if (typeof ActivityModel.findById === 'function') {
                const activity = await ActivityModel.findById(activityId);
                if (activity && activity.details) {
                    const wasOpened = activity.details.journeyOpened === true;
                    const update = {
                        'details.journeyOpened': true,
                        'details.journeyOpenedAt': activity.details.journeyOpenedAt || new Date()
                    };
                    if (!wasOpened) {
                        update['details.journeyOpenCount'] = 1;
                        if (!Array.isArray(activity.details.auditHistory)) activity.details.auditHistory = [];
                        update['$push'] = {
                            'details.auditHistory': {
                                action: 'JOURNEY_OPENED',
                                timestamp: new Date()
                            }
                        };
                    } else {
                        update['$inc'] = { 'details.journeyOpenCount': 1 };
                    }
                    await ActivityModel.findByIdAndUpdate(activityId, update);
                }
            }
        } catch (err) {
            console.warn('[SiteVisitConfirmation] Failed to track journey opened:', err.message);
        }
    }
}

export default SiteVisitConfirmationService;
