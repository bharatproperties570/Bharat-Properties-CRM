import FeedbackForm from "../models/FeedbackForm.js";
import FeedbackSubmission from "../models/FeedbackSubmission.js";


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
        const { responses, sourceMeta, leadId } = req.body;

        const form = await FeedbackForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Calculate rating if there's a rating field
        let submissionRating = 0;
        const ratingField = form.sections.flatMap(s => s.fields).find(f => f.type === 'rating');
        if (ratingField && responses[ratingField.id]) {
            submissionRating = Number(responses[ratingField.id]);
        }

        await FeedbackSubmission.create({
            form: form._id,
            lead: leadId || null,
            responses,
            rating: submissionRating,
            sourceMeta: sourceMeta || {}
        });

        // Update analytics
        form.analytics.submissions += 1;
        if (submissionRating > 0) {
            // Simple running average
            form.analytics.averageRating = ((form.analytics.averageRating * (form.analytics.submissions - 1)) + submissionRating) / form.analytics.submissions;
        }
        await form.save();

        res.status(201).json({
            success: true,
            message: form.settings.successMessage,
            redirectUrl: form.settings.redirectUrl
        });
    } catch (error) {
        next(error);
    }
};
