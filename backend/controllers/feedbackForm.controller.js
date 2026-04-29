import mongoose from "mongoose";
import FeedbackForm from "../models/FeedbackForm.js";
import FeedbackSubmission from "../models/FeedbackSubmission.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import SystemSetting from "../src/modules/systemSettings/system.model.js";
import NurtureBot from "../services/NurtureBot.js";


export const createForm = async (req, res, next) => {
    try {
        const form = await FeedbackForm.create(req.body);
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const getForms = async (req, res, next) => {
    try {
        const forms = await FeedbackForm.find().sort({ createdAt: -1 });
        res.json({ success: true, data: forms });
    } catch (error) {
        next(error);
    }
};

export const getFormById = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findById(req.params.id);
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const updateForm = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const deleteForm = async (req, res, next) => {
    try {
        await FeedbackForm.findByIdAndDelete(req.params.id);
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
            responses,
            rating: submissionRating,
            sourceMeta: sourceMeta || {}
        });

        // 🚀 SMART SYNC: Update Inventory History if linked
        if (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) {
            const feedbackNote = Object.values(responses).join(' | ');
            await Inventory.findByIdAndUpdate(inventoryId, {
                $push: {
                    history: {
                        type: 'Feedback',
                        note: `Feedback Received via ${form.name}: ${feedbackNote}`,
                        details: {
                            submissionId: submission._id,
                            rating: submissionRating,
                            responses
                        },
                        date: new Date()
                    }
                },
                $set: { lastContactedAt: new Date() }
            });
            console.log(`[FeedbackSync] Updated History for Inventory: ${inventoryId}`);
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
