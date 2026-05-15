import mongoose from "mongoose";
import { getVisibilityFilter } from "../utils/visibility.js";
import FeedbackForm from "../models/FeedbackForm.js";
import FeedbackSubmission from "../models/FeedbackSubmission.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import SystemSetting from "../src/modules/systemSettings/system.model.js";
import NurtureBot from "../services/NurtureBot.js";


export const createForm = async (req, res, next) => {
    try {
        const formData = { ...req.body };
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
        next(error);
    }
};

export const getForms = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const forms = await FeedbackForm.find(visibilityFilter).sort({ createdAt: -1 });
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
        const form = await FeedbackForm.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, req.body, { new: true });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const deleteForm = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        await FeedbackForm.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });
        res.json({ success: true, message: "Form deleted" });
    } catch (error) {
        next(error);
    }
};

export const getFormBySlug = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findOne({ slug: req.params.slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        form.analytics.views += 1;
        await form.save();

        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const submitFeedback = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { responses, sourceMeta, leadId, inventoryId } = req.body;

        const form = await FeedbackForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Calculate rating if there's a rating field
        let submissionRating = 0;
        const ratingField = form.sections.flatMap(s => s.fields).find(f => f.type === 'rating');
        if (ratingField && responses[ratingField.id]) {
            submissionRating = Number(responses[ratingField.id]);
        }

        // 🌟 PROFESIONAL LOGIC: Smart Lead Matching (if leadId not provided)
        let finalLeadId = leadId;
        if (!finalLeadId || !mongoose.Types.ObjectId.isValid(finalLeadId)) {
            const phoneField = form.sections.flatMap(s => s.fields).find(f => f.type === 'phone');
            const phoneResponse = phoneField ? responses[phoneField.id] : null;
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
            department: form.department, // Heritage: inherit branch from form
            teams: form.teams,
            responses,
            rating: submissionRating,
            sourceMeta: sourceMeta || {}
        });

        // 🚀 SMART SYNC: Update Inventory History and Activity Timeline
        if (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) {
            const inventory = await Inventory.findById(inventoryId).populate('owners associates.contact');
            if (inventory) {
                // [ENTERPRISE] Heuristic Field Resolution for Outcome, Reason, and Follow-up
                let outcome = '';
                let reason = '';
                let nextFollowUp = null;

                const fieldEntries = Object.entries(responses);
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

                const feedbackNote = Object.values(responses).join(' | ');
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

                // [ENTERPRISE] Unified Activity Linking (One record, multiple timelines)
                const relatedTo = [
                    { id: inventory._id, name: inventory.unitNo || 'Property', model: 'Inventory' }
                ];

                // Add Owners
                if (inventory.owners && inventory.owners.length > 0) {
                    inventory.owners.forEach(owner => {
                        relatedTo.push({ id: owner._id || owner, name: owner.name || 'Owner', model: 'Contact' });
                    });
                }

                // Add Associates
                if (inventory.associates && inventory.associates.length > 0) {
                    inventory.associates.forEach(assoc => {
                        const contactId = assoc.contact?._id || assoc.contact;
                        if (contactId) {
                            relatedTo.push({ id: contactId, name: assoc.contact?.name || assoc.name || 'Associate', model: 'Contact' });
                        }
                    });
                }

                // Add Lead if present
                if (finalLeadId && mongoose.Types.ObjectId.isValid(finalLeadId)) {
                    relatedTo.push({ id: finalLeadId, name: 'Target Lead', model: 'Lead' });
                }

                await Activity.create({
                    type: 'Feedback',
                    subject: `Feedback: ${outcome || 'Received'}`,
                    description: feedbackNote,
                    status: 'Completed',
                    performedBy: 'System (Feedback Form)',
                    dueDate: new Date(),
                    entityType: 'Inventory',
                    entityId: inventory._id,
                    relatedTo,
                    details: { submissionId: submission._id, outcome, reason },
                    department: form.department,
                    teams: form.teams
                });

                console.log(`[FeedbackSync] Unified Activity Logging Complete for ${relatedTo.length} entities linked to Inventory: ${inventoryId}`);
            }
        }

        // 🚀 SMART SYNC: Update Lead Activity if linked
        if (finalLeadId && mongoose.Types.ObjectId.isValid(finalLeadId)) {
            const lead = await Lead.findById(finalLeadId);
            if (lead) {
                await Activity.create({
                    type: 'Feedback',
                    subject: `Feedback Submitted: ${form.name}`,
                    entityId: finalLeadId,
                    entityType: 'Lead',
                    status: 'Completed',
                    performedBy: 'Customer (Form)',
                    description: Object.values(responses).join(' | '),
                    dueDate: new Date(),
                    details: { submissionId: submission._id, rating: submissionRating }
                });

                // Trigger Automation Rules with full lead context
                NurtureBot.executeAutomation('onFeedbackReceived', lead).catch(err => {
                    console.error('[Automation] Failed to trigger feedback automation:', err.message);
                });
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
            message: form.settings.successMessage,
            redirectUrl: form.settings.redirectUrl
        });
    } catch (error) {
        console.error('[FeedbackSubmit] Fatal Error:', error);
        next(error);
    }
};
