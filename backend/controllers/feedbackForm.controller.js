import mongoose from "mongoose";
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

export const getFormBySlug = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findOne({ slug: req.params.slug, isActive: true }).lean();
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Increment view analytics in background without blocking
        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.views': 1 } }).catch(() => {});

        let leadInfo = null;
        let activityInfo = null;
        let resolvedLeadId = req.query.leadId;
        let resolvedActivityId = req.query.activityId;

        // Parse JWT ref/token if provided
        const token = req.query.ref || req.query.token;
        if (token && process.env.JWT_SECRET) {
            try {
                let normalizedToken = typeof token === 'string' ? token.trim() : '';
                if (!normalizedToken.includes('.')) {
                    if (normalizedToken.includes('~')) {
                        normalizedToken = normalizedToken.replace(/~/g, '.');
                    } else if (normalizedToken.split('-').length === 3) {
                        normalizedToken = normalizedToken.replace(/-/g, '.');
                    }
                }

                const decoded = jwt.verify(normalizedToken, process.env.JWT_SECRET);
                if (decoded && decoded.leadId) {
                    resolvedLeadId = decoded.leadId;
                }
                if (decoded && decoded.activityId) {
                    resolvedActivityId = decoded.activityId;
                }
            } catch (tokErr) {
                console.warn('[FeedbackForm] Token resolution error:', tokErr.message);
            }
        }

        if (resolvedLeadId && mongoose.Types.ObjectId.isValid(resolvedLeadId)) {
            const lead = await Lead.findById(resolvedLeadId).select('firstName lastName email mobile companyName').lean();
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

        if (resolvedActivityId && mongoose.Types.ObjectId.isValid(resolvedActivityId)) {
            const activity = await Activity.findById(resolvedActivityId).select('type subject dueDate dueTime details').lean();
            if (activity) {
                activityInfo = {
                    _id: activity._id,
                    type: activity.type,
                    subject: activity.subject,
                    dueDate: activity.dueDate,
                    dueTime: activity.dueTime,
                    projectName: activity.details?.projectName || '',
                    visitedProperties: activity.details?.visitedProperties || []
                };
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
        let { responses, sourceMeta, leadId, inventoryId, activityId, token, ref } = req.body;

        const form = await FeedbackForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Resolve token if leadId or activityId are missing
        const feedbackToken = token || ref || req.query.ref || req.query.token;
        if (feedbackToken && process.env.JWT_SECRET) {
            try {
                let normalizedToken = typeof feedbackToken === 'string' ? feedbackToken.trim() : '';
                if (!normalizedToken.includes('.')) {
                    if (normalizedToken.includes('~')) {
                        normalizedToken = normalizedToken.replace(/~/g, '.');
                    } else if (normalizedToken.split('-').length === 3) {
                        normalizedToken = normalizedToken.replace(/-/g, '.');
                    }
                }
                const decoded = jwt.verify(normalizedToken, process.env.JWT_SECRET);
                if (!leadId && decoded?.leadId) leadId = decoded.leadId;
                if (!activityId && decoded?.activityId) activityId = decoded.activityId;
            } catch (jwtErr) {
                console.warn('[FeedbackSubmit] Token verification warning:', jwtErr.message);
            }
        }

        // Calculate rating if there's a rating field
        let submissionRating = 0;
        const ratingField = form.sections.flatMap(s => s.fields).find(f => f.type === 'rating');
        if (ratingField && responses && responses[ratingField.id]) {
            submissionRating = Number(responses[ratingField.id]);
        }

        // Smart Lead Matching (if leadId not provided)
        let finalLeadId = leadId;
        if (!finalLeadId || !mongoose.Types.ObjectId.isValid(finalLeadId)) {
            const phoneField = form.sections.flatMap(s => s.fields).find(f => f.type === 'phone');
            const phoneResponse = phoneField && responses ? responses[phoneField.id] : null;
            if (phoneResponse) {
                const { normalizePhone } = await import('../utils/normalization.js');
                const cleanPhone = normalizePhone(phoneResponse);
                const existingLead = await Lead.findOne({ 
                    $or: [
                        { mobile: cleanPhone },
                        { 'phones.number': cleanPhone }
                    ]
                }).select('_id').lean();
                if (existingLead) {
                    finalLeadId = existingLead._id;
                    console.log(`[FeedbackSubmit] Auto-matched Lead: ${finalLeadId} via Phone: ${cleanPhone}`);
                }
            }
        }

        const submission = await FeedbackSubmission.create({
            form: form._id,
            lead: (finalLeadId && mongoose.Types.ObjectId.isValid(finalLeadId)) ? finalLeadId : null,
            inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
            department: form.department,
            teams: form.teams,
            responses,
            rating: submissionRating,
            sourceMeta: sourceMeta || {}
        });

        // 🚀 SMART SYNC: Update Inventory History if inventoryId is present
        if (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) {
            const inventory = await Inventory.findById(inventoryId).populate('owners associates.contact');
            if (inventory) {
                let outcome = '';
                let reason = '';
                let nextFollowUp = null;

                const fieldEntries = Object.entries(responses || {});
                const formFields = form.sections.flatMap(s => s.fields);

                for (const [fieldId, value] of fieldEntries) {
                    const fieldDef = formFields.find(f => f.id === fieldId);
                    if (!fieldDef) continue;

                    const label = fieldDef.label.toLowerCase();
                    if (label.includes('outcome')) outcome = value;
                    else if (label.includes('reason')) reason = value;
                    else if (label.includes('follow-up') || label.includes('next action')) {
                        const d = new Date(value);
                        if (!isNaN(d.getTime())) nextFollowUp = d;
                    }
                }

                const feedbackNote = Object.values(responses || {}).join(' | ');
                const updatePayload = {
                    $push: {
                        history: {
                            type: 'Feedback',
                            note: `Feedback Received via ${form.name}: ${feedbackNote}`,
                            details: {
                                submissionId: submission._id,
                                rating: submissionRating,
                                responses,
                                result: outcome,
                                reason: reason
                            },
                            date: new Date()
                        }
                    },
                    $set: { lastContactedAt: new Date() }
                };

                if (nextFollowUp) updatePayload.$set.followUpDate = nextFollowUp;

                await Inventory.findByIdAndUpdate(inventoryId, updatePayload);
            }
        }

        // Closed-Loop: Update Site Visit Activity (both pending and completed)
        if (activityId && mongoose.Types.ObjectId.isValid(activityId)) {
            const activity = await Activity.findById(activityId);
            if (activity) {
                const propertyFeedbackField = form.sections.flatMap(s => s.fields).find(f => f.type === 'property_feedback');
                let updatedVisitedProperties = activity.details?.visitedProperties || [];

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
                    'details.visitedProperties': updatedVisitedProperties,
                    'details.customerFeedback': {
                        submissionId: submission._id,
                        rating: submissionRating,
                        feedbackText,
                        submittedAt: new Date()
                    }
                };

                if (activity.status !== 'Completed') {
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

                    const alertTarget = activity.assignedTo || (finalLeadId ? (await Lead.findById(finalLeadId).select('owner').lean())?.owner : null);
                    if (alertTarget) {
                        createNotification({
                            userId: alertTarget,
                            title: '⚠️ Negative Customer Feedback Alert',
                            message: `Client rated site visit ${submissionRating}/5 stars. Follow-up required.`,
                            type: 'warning',
                            link: `/activities/${activity._id}`
                        }).catch(() => {});
                    }
                }

                activityUpdates.$addToSet = { tags: { $each: tagsToAdd } };
                await Activity.findByIdAndUpdate(activityId, activityUpdates);
                console.log(`[FeedbackSubmit] Closed feedback loop for Activity ${activityId} (Rating: ${submissionRating})`);
            }
        } else if (finalLeadId && mongoose.Types.ObjectId.isValid(finalLeadId)) {
            const lead = await Lead.findById(finalLeadId);
            if (lead) {
                await Activity.create({
                    type: 'Feedback',
                    subject: `Feedback Submitted: ${form.name}`,
                    entityId: finalLeadId,
                    entityType: 'Lead',
                    status: 'Completed',
                    performedBy: 'Customer (Form)',
                    description: Object.values(responses || {}).filter(v => typeof v === 'string').join(' | '),
                    dueDate: new Date(),
                    details: { submissionId: submission._id, rating: submissionRating }
                });
            }
        }

        // Closed-Loop: Update Lead Intent & Stage Automation
        if (finalLeadId && mongoose.Types.ObjectId.isValid(finalLeadId)) {
            const leadUpdate = {
                lastFeedbackReceivedAt: new Date(),
                latestFeedbackRating: submissionRating
            };
            if (submissionRating >= 4) {
                leadUpdate.$inc = { intent_index: 10 };
            }
            await Lead.findByIdAndUpdate(finalLeadId, leadUpdate).catch(() => {});

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const lead = await Lead.findById(finalLeadId);
                if (lead) {
                    NurtureBot.executeAutomation('onFeedbackReceived', lead).catch(err => {
                        console.error('[Automation] Failed to trigger feedback automation:', err.message);
                    });
                }
            }
        }

        // Update analytics
        form.analytics.submissions += 1;
        if (submissionRating > 0) {
            form.analytics.averageRating = ((form.analytics.averageRating * (form.analytics.submissions - 1)) + submissionRating) / form.analytics.submissions;
        }
        await form.save();

        res.status(201).json({
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
