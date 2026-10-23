import mongoose from "mongoose";
import crypto from "crypto";
import { getVisibilityFilter } from "../utils/visibility.js";
import FeedbackForm from "../models/FeedbackForm.js";
import FeedbackSubmission from "../models/FeedbackSubmission.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import SystemSetting from "../src/modules/systemSettings/system.model.js";
import NurtureBot from "../services/NurtureBot.js";
import jwt from "jsonwebtoken";
import { createNotification } from "./notification.controller.js";


export const createForm = async (req, res, next) => {
    try {
        const formData = { ...req.body };

        // 🛡️ Fallback: if name missing but title present (legacy/EnterpriseBuilder), use title
        if (!formData.name && formData.title) formData.name = formData.title;
        if (!formData.name) formData.name = 'Untitled Form';

        // 🛡️ Ensure unique slug — use full timestamp to prevent 4-digit collisions
        if (!formData.slug || formData.slug === 'new-form') {
            formData.slug = (formData.name || 'form').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        }

        // 🛡️ Sanitize field types in sections
        if (formData.sections && Array.isArray(formData.sections)) {
            formData.sections = formData.sections.map(section => ({
                ...section,
                fields: (section.fields || []).map(field => ({
                    ...field,
                    // Normalize unsupported aliases
                    type: field.type === 'multiline' || field.type === 'long-text' ? 'textarea' : field.type
                }))
            }));
        }

        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !formData.department) formData.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!formData.teams || formData.teams.length === 0)) {
                formData.teams = req.user.teams.map(t => t._id || t);
            }
        }
        const form = await FeedbackForm.create(formData);
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        console.error('[CreateForm Error]:', error);
        next(error);
    }
};


export const getForms = async (req, res, next) => {
    try {
        const forms = await FeedbackForm.find({}).sort({ createdAt: -1 });
        res.json({ success: true, data: forms });
    } catch (error) {
        next(error);
    }
};

export const getFormById = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const form = await FeedbackForm.findOne({ _id: req.params.id, ...visibilityFilter });
        if (!form) return res.status(404).json({ success: false, message: "Form not found or access denied" });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const updateForm = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const updateData = { ...req.body };
        delete updateData._id;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.__v;

        // Strip _id from subdocuments to prevent MongoServerError on sections._id
        if (updateData.sections && Array.isArray(updateData.sections)) {
            updateData.sections = updateData.sections.map(section => {
                const cleanSection = { ...section };
                delete cleanSection._id;
                if (cleanSection.fields && Array.isArray(cleanSection.fields)) {
                    cleanSection.fields = cleanSection.fields.map(field => {
                        const cleanField = { ...field };
                        delete cleanField._id;
                        // 🛡️ Normalize field type: 'dropdown' is valid, other aliases corrected
                        if (cleanField.type === 'multiline' || cleanField.type === 'long-text') cleanField.type = 'textarea';
                        return cleanField;
                    });
                }
                return cleanSection;
            });
        }

        // 🌟 CRITICAL FIX: Use $set to ensure sections are FULLY REPLACED not partially merged.
        // Without $set, MongoDB can revert to old sub-document values on validation.
        const form = await FeedbackForm.findOneAndUpdate(
            { _id: req.params.id, ...visibilityFilter },
            { $set: updateData },
            { new: true, runValidators: false }
        );
        if (!form) return res.status(404).json({ success: false, message: 'Form not found or access denied' });
        res.json({ success: true, data: form });
    } catch (error) {
        console.error('[UpdateForm Error]:', error);
        next(error);
    }
};


export const deleteForm = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findOneAndDelete({ _id: req.params.id });
        if (!form) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }
        res.json({ success: true, message: "Form deleted" });
    } catch (error) {
        next(error);
    }
};

// 🛡️ CRITICAL-SV-11: Cryptographic Token Verifier with Scoped Purpose & Dual-Key Rotation
export const verifyFeedbackToken = (rawToken, slug = null) => {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const primarySecret = process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET;
    if (!primarySecret || typeof primarySecret !== 'string' || primarySecret.trim() === '') {
        // Fail closed: without explicit secret configuration, no tokens can be verified
        return null;
    }

    const secondarySecret = (
        process.env.FEEDBACK_JWT_SECRET &&
        process.env.JWT_SECRET &&
        process.env.FEEDBACK_JWT_SECRET !== process.env.JWT_SECRET
    ) ? process.env.JWT_SECRET : null;

    // Meta WhatsApp URL safe encoding replaces . with ~
    let normalized = rawToken.trim();
    if (!normalized.includes('.')) {
        if (normalized.includes('~')) {
            normalized = normalized.replace(/~/g, '.');
        } else if (normalized.split('-').length === 3) {
            normalized = normalized.replace(/-/g, '.');
        }
    }

    let decoded = null;
    try {
        decoded = jwt.verify(normalized, primarySecret);
    } catch (_) {
        if (secondarySecret) {
            try {
                decoded = jwt.verify(normalized, secondarySecret);
            } catch (_) {
                return null;
            }
        } else {
            return null;
        }
    }

    if (!decoded || typeof decoded !== 'object') return null;

    // Validate purpose
    const validPurposes = ['customer_feedback', 'feedback_submission', 'general_feedback'];
    const purpose = decoded.purpose || 'customer_feedback';
    if (!validPurposes.includes(purpose)) {
        return null; // Reject wrong purpose
    }

    // If token is form-scoped, ensure it matches target form slug
    if (decoded.formSlug && slug && decoded.formSlug !== slug) {
        return null; // Reject token for mismatched form slug
    }

    // Only activity-bound feedback tokens are permitted to carry an activityId binding
    const isActivityBound = purpose === 'customer_feedback' || purpose === 'feedback_submission';
    const activityId = (isActivityBound && decoded.activityId && mongoose.Types.ObjectId.isValid(decoded.activityId))
        ? String(decoded.activityId)
        : null;

    const leadId = (decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId))
        ? String(decoded.leadId)
        : null;

    return {
        valid: true,
        isLegacy: !decoded.iss || decoded.purpose === 'customer_feedback',
        leadId,
        activityId,
        jti: decoded.jti || null,
        purpose,
        formSlug: decoded.formSlug || null
    };
};

export const getFormBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const form = await FeedbackForm.findOne({ slug, isActive: true }).lean();
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Increment view analytics in background without blocking
        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.views': 1 } }).catch(() => {});

        let leadInfo = null;
        let activityInfo = null;

        // Strictly verify token if provided in query. Raw query params leadId/activityId are ignored.
        const rawToken = req.query.ref || req.query.token;
        if (rawToken) {
            const claims = verifyFeedbackToken(rawToken, slug);
            if (!claims) {
                return res.status(403).json({ success: false, message: "Invalid or expired feedback token" });
            }

            if (claims.leadId && mongoose.Types.ObjectId.isValid(claims.leadId)) {
                const lead = await Lead.findById(claims.leadId).select('firstName lastName email mobile companyName').lean();
                if (lead) {
                    const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.companyName || 'Valued Client';
                    leadInfo = {
                        _id: lead._id,
                        name: fullName,
                        firstName: lead.firstName || '',
                        lastName: lead.lastName || '',
                        email: lead.email || '',
                        mobile: lead.mobile || ''
                    };
                }
            }

            if (claims.activityId && mongoose.Types.ObjectId.isValid(claims.activityId)) {
                const activity = await Activity.findById(claims.activityId).select('type subject entityId entityType dueDate dueTime details status').lean();
                if (activity) {
                    const actLeadId = activity.entityId || activity.lead;
                    if (activity.type === 'Site Visit' && (!actLeadId || String(actLeadId) === String(claims.leadId))) {
                        activityInfo = {
                            _id: activity._id,
                            type: activity.type,
                            subject: activity.subject,
                            dueDate: activity.dueDate,
                            dueTime: activity.dueTime,
                            projectName: activity.details?.projectName || '',
                            visitedProperties: activity.details?.visitedProperties || [],
                            status: activity.status
                        };
                    }
                }
            }
        }

        res.json({ success: true, data: { ...form, leadInfo, activityInfo } });
    } catch (error) {
        next(error);
    }
};

export const submitFeedback = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { responses = {}, sourceMeta, inventoryId, token: bodyToken, ref: bodyRef } = req.body;

        const form = await FeedbackForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Calculate rating if there's a rating field
        let submissionRating = 0;
        const ratingField = form.sections.flatMap(s => s.fields).find(f => f.type === 'rating');
        if (ratingField && responses && responses[ratingField.id]) {
            submissionRating = Number(responses[ratingField.id]);
        }

        // Token Verification: Client-supplied leadId and activityId in req.body are strictly discarded
        const rawToken = bodyToken || bodyRef || req.headers['x-feedback-token'] || req.query.ref || req.query.token;

        let claims = null;
        if (rawToken) {
            claims = verifyFeedbackToken(rawToken, slug);
            if (!claims) {
                return res.status(403).json({ success: false, message: "Invalid or unauthorized feedback token" });
            }
        }

        // Reject untrusted activityId if passed in body without matching authorized token
        if (req.body.activityId && (!claims || claims.activityId !== String(req.body.activityId))) {
            return res.status(403).json({ success: false, message: "Unauthorized: activity feedback requires a valid token" });
        }

        const authoritativeLeadId = claims?.leadId || null;
        const authoritativeActivityId = claims?.activityId || null;
        const requestIdentity = claims?.jti || (claims?.isLegacy && authoritativeLeadId ? `legacy:${authoritativeLeadId}:${slug}` : null);

        // Case 1: Site Visit Activity-Bound Feedback Flow
        if (authoritativeActivityId) {
            const activityDoc = await Activity.findById(authoritativeActivityId);
            if (!activityDoc) {
                return res.status(404).json({ success: false, message: "Activity not found" });
            }

            // Verify activity ownership
            const actLeadId = activityDoc.entityId || activityDoc.lead;
            if (actLeadId && authoritativeLeadId && String(actLeadId) !== String(authoritativeLeadId)) {
                return res.status(403).json({ success: false, message: "Activity entity does not match token subject" });
            }

            // Verify eligibility
            if (activityDoc.type !== 'Site Visit') {
                return res.status(400).json({ success: false, message: "Activity is not a Site Visit" });
            }
            if (activityDoc.status === 'Cancelled') {
                return res.status(400).json({ success: false, message: "Cancelled site visits are not eligible for feedback" });
            }

            // Check if feedback already submitted (Single-use & Idempotency)
            if (activityDoc.details?.customerFeedback?.submissionId || activityDoc.details?.feedbackSubmitted) {
                const existingSubmissionId = activityDoc.details?.customerFeedback?.submissionId;
                const existingSub = existingSubmissionId ? await FeedbackSubmission.findById(existingSubmissionId).lean().catch(() => null) : null;
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    data: existingSub || { _id: existingSubmissionId },
                    message: "Feedback has already been recorded for this activity."
                });
            }

            // Concurrency-Safe Atomic Lock
            let lockedActivity = null;
            if (typeof Activity.findOneAndUpdate === 'function' && mongoose.connection?.readyState === 1) {
                lockedActivity = await Activity.findOneAndUpdate(
                    {
                        _id: authoritativeActivityId,
                        'details.customerFeedback.submissionId': { $exists: false },
                        'details.feedbackLock': { $ne: true }
                    },
                    {
                        $set: {
                            'details.feedbackLock': true,
                            'details.feedbackLockAt': new Date()
                        }
                    },
                    { new: false }
                );

                if (!lockedActivity) {
                    const recheck = await Activity.findById(authoritativeActivityId);
                    if (recheck?.details?.customerFeedback?.submissionId) {
                        return res.status(200).json({
                            success: true,
                            duplicate: true,
                            message: "Feedback has already been recorded for this activity."
                        });
                    }
                    return res.status(409).json({ success: false, message: "Feedback submission in progress by another request" });
                }
            } else {
                lockedActivity = activityDoc;
            }

            try {
                // Create single feedback submission
                const created = await FeedbackSubmission.create({
                    form: form._id,
                    lead: authoritativeLeadId,
                    activity: authoritativeActivityId,
                    inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
                    department: activityDoc.department || form.department,
                    teams: activityDoc.teams || form.teams,
                    responses,
                    rating: submissionRating,
                    idempotencyKey: requestIdentity || undefined,
                    sourceMeta: sourceMeta || {}
                });
                const submission = Array.isArray(created) ? created[0] : created;

                // Update visited properties ratings if property_feedback field is present
                const propertyFeedbackField = form.sections.flatMap(s => s.fields).find(f => f.type === 'property_feedback');
                let updatedVisitedProperties = activityDoc.details?.visitedProperties || [];

                if (propertyFeedbackField && responses && responses[propertyFeedbackField.id]) {
                    const customerPropertyFeedback = responses[propertyFeedbackField.id];
                    updatedVisitedProperties = updatedVisitedProperties.map((prop, idx) => {
                        const feedback = customerPropertyFeedback[idx];
                        if (feedback) {
                            return {
                                ...prop,
                                result: feedback.result || prop.result,
                                customerRating: feedback.rating,
                                customerComments: feedback.comments
                            };
                        }
                        return prop;
                    });
                }

                const feedbackText = Object.values(responses || {}).filter(v => typeof v === 'string').join(' | ');
                const activityUpdates = {
                    'details.submissionId': submission._id,
                    'details.feedbackSubmitted': true,
                    'details.visitedProperties': updatedVisitedProperties,
                    'details.customerFeedback': {
                        submissionId: submission._id,
                        rating: submissionRating,
                        feedbackText,
                        submittedAt: new Date()
                    },
                    $unset: { 'details.feedbackLock': 1 }
                };

                if (activityDoc.status !== 'Completed') {
                    activityUpdates.status = 'Completed';
                    activityUpdates.completedAt = new Date();
                    activityUpdates.completionResult = 'Feedback Received';
                    activityUpdates.performedBy = 'Customer (Form)';
                }

                const tagsToAdd = ['Customer-Feedback-Received'];
                if (submissionRating >= 4) {
                    tagsToAdd.push('High-Satisfaction');
                } else if (submissionRating > 0 && submissionRating <= 2) {
                    tagsToAdd.push('Escalation-Negative-Feedback');
                }

                activityUpdates.$addToSet = { tags: { $each: tagsToAdd } };
                await Activity.findByIdAndUpdate(authoritativeActivityId, activityUpdates);

                // Update Lead Intent & Stage Automation (SINGLE EXECUTION)
                if (authoritativeLeadId && mongoose.Types.ObjectId.isValid(authoritativeLeadId)) {
                    const leadUpdate = {
                        lastFeedbackReceivedAt: new Date(),
                        latestFeedbackRating: submissionRating
                    };
                    if (submissionRating >= 4) {
                        leadUpdate.$inc = { intent_index: 10 };
                    }
                    await Lead.findByIdAndUpdate(authoritativeLeadId, leadUpdate).catch(() => {});

                    if (mongoose.connection && mongoose.connection.readyState === 1) {
                        const lead = await Lead.findById(authoritativeLeadId);
                        if (lead) {
                            NurtureBot.executeAutomation('onFeedbackReceived', lead).catch(() => {});
                        }
                    }
                }

                // Escalations on Negative Feedback (SINGLE EXECUTION)
                if (submissionRating > 0 && submissionRating <= 2) {
                    const alertTarget = activityDoc.assignedTo || (authoritativeLeadId ? (await Lead.findById(authoritativeLeadId).select('owner').lean())?.owner : null);
                    if (alertTarget) {
                        createNotification({
                            userId: alertTarget,
                            title: '⚠️ Negative Customer Feedback Alert',
                            message: `Client rated site visit ${submissionRating}/5 stars. Follow-up required.`,
                            type: 'warning',
                            link: `/activities/${activityDoc._id}`
                        }).catch(() => {});
                    }

                    try {
                        const { default: SiteVisitAutomationService } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
                        await SiteVisitAutomationService.escalateNegativeFeedback(activityDoc, submissionRating, feedbackText);
                    } catch (escErr) {
                        console.warn('[FeedbackSubmit] Escalation service warning:', escErr.message);
                    }
                }

                // Update analytics
                form.analytics.submissions += 1;
                if (submissionRating > 0) {
                    form.analytics.averageRating = ((form.analytics.averageRating * (form.analytics.submissions - 1)) + submissionRating) / form.analytics.submissions;
                }
                await form.save();

                return res.status(201).json({
                    success: true,
                    data: submission,
                    message: form.settings?.successMessage || "Feedback submitted successfully. Thank you!",
                    redirectUrl: form.settings?.redirectUrl
                });

            } catch (innerErr) {
                await Activity.findByIdAndUpdate(authoritativeActivityId, { $unset: { 'details.feedbackLock': 1 } }).catch(() => {});
                throw innerErr;
            }
        }

        // Case 2: General / Anonymous Public Feedback Submission
        const created = await FeedbackSubmission.create({
            form: form._id,
            lead: (authoritativeLeadId && mongoose.Types.ObjectId.isValid(authoritativeLeadId)) ? authoritativeLeadId : null,
            inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
            department: form.department,
            teams: form.teams,
            responses,
            rating: submissionRating,
            idempotencyKey: requestIdentity || undefined,
            sourceMeta: sourceMeta || {}
        });
        const submission = Array.isArray(created) ? created[0] : created;

        // Update analytics
        form.analytics.submissions += 1;
        if (submissionRating > 0) {
            form.analytics.averageRating = ((form.analytics.averageRating * (form.analytics.submissions - 1)) + submissionRating) / form.analytics.submissions;
        }
        await form.save();

        return res.status(201).json({
            success: true,
            data: submission,
            message: form.settings?.successMessage || "Feedback submitted successfully. Thank you!",
            redirectUrl: form.settings?.redirectUrl
        });

    } catch (error) {
        console.error('[FeedbackSubmit] Fatal Error:', error);
        next(error);
    }
};
