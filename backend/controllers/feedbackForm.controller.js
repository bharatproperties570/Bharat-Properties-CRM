import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getVisibilityFilter } from "../utils/visibility.js";
import withMongoTransaction from "../utils/withMongoTransaction.js";
import FeedbackForm from "../models/FeedbackForm.js";
import FeedbackSubmission from "../models/FeedbackSubmission.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Activity from "../models/Activity.js";
import AuditLog from "../models/AuditLog.js";
import OutboxEvent from "../models/OutboxEvent.js";
import SystemSetting from "../src/modules/systemSettings/system.model.js";
import NurtureBot from "../services/NurtureBot.js";


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

// 🛡️ CRITICAL-01: Cryptographic Token Verifier with Scoped Purpose & Claim Dropping
export const verifyFeedbackToken = (rawToken, slug) => {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const normalized = rawToken.replace(/~/g, '.');
    const secret = process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT secrets missing in production');
    }
    const signingSecret = secret || 'dev_secret_fallback';
    try {
        const decoded = jwt.verify(normalized, signingSecret);

        // Modern Token Contract
        if (decoded.iss === 'bharat-properties-crm' && (decoded.purpose === 'feedback_submission' || decoded.purpose === 'general_feedback')) {
            if (slug && decoded.formSlug && decoded.formSlug !== slug) {
                return null; // Reject token for mismatched form slug
            }
            return {
                valid: true,
                isLegacy: false,
                leadId: (decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId)) ? decoded.leadId : null,
                activityId: (decoded.activityId && mongoose.Types.ObjectId.isValid(decoded.activityId)) ? decoded.activityId : null,
                jti: decoded.jti || null,
                purpose: decoded.purpose
            };
        }

        // Legacy Token Contract: { leadId, source: 'customer_feedback' }
        if (decoded.source === 'customer_feedback' && decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId)) {
            return {
                valid: true,
                isLegacy: true,
                leadId: decoded.leadId,
                activityId: null, // Legacy tokens CANNOT complete activities
                jti: null,
                purpose: 'legacy_feedback'
            };
        }

        return null;
    } catch (_) {
        return null;
    }
};

export const getFormBySlug = async (req, res, next) => {
    try {
        const form = await FeedbackForm.findOne({ slug: req.params.slug, isActive: true }).lean();
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Increment view analytics in background without blocking
        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.views': 1 } }).catch(() => {});

        // 🛡️ CRITICAL-01: Strict PII Protection
        // Check for verified token in custom header, query ref, or token param
        const rawToken = req.headers['x-feedback-token'] || req.query.ref || req.query.token;
        const claims = verifyFeedbackToken(rawToken, req.params.slug);

        let leadInfo = null;
        if (claims && claims.leadId) {
            const lead = await Lead.findById(claims.leadId).select('firstName companyName').lean();
            if (lead) {
                // Return ONLY safe greeting name. NEVER expose email, mobile, or raw lead documents
                leadInfo = {
                    greetingName: lead.firstName || lead.companyName || 'Valued Client'
                };
            }
        }

        let activityDetails = null;
        if (claims && claims.activityId) {
            const activity = await Activity.findById(claims.activityId).select('type subject details status').lean();
            if (activity) {
                activityDetails = {
                    _id: activity._id,
                    type: activity.type,
                    subject: activity.subject,
                    status: activity.status,
                    visitedProperties: activity.details?.visitedProperties || []
                };
            }
        }

        res.json({ success: true, data: { ...form, leadInfo, activityDetails } });
    } catch (error) {
        next(error);
    }
};

export const submitFeedback = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { responses = {}, inventoryId, token: bodyToken } = req.body;

        const form = await FeedbackForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Calculate rating if there's a rating field
        let submissionRating = 0;
        const ratingField = form.sections.flatMap(s => s.fields).find(f => f.type === 'rating');
        if (ratingField && responses[ratingField.id]) {
            submissionRating = Number(responses[ratingField.id]);
        }

        // 🛡️ CRITICAL-01: Token Verification & Untrusted Claim Dropping
        // Client-supplied leadId and activityId in req.body are COMPLETELY DISCARDED
        const rawToken = bodyToken || req.headers['x-feedback-token'] || req.query.ref || req.query.token;
        const claims = verifyFeedbackToken(rawToken, slug);

        const authoritativeLeadId = claims?.leadId || null;
        const authoritativeActivityId = claims?.activityId || null;

        // Establish stable request identity for idempotency
        const requestIdentity = claims?.jti || (claims?.isLegacy && authoritativeLeadId ? `legacy:${authoritativeLeadId}:${slug}` : null);

        // 🛡️ Activity-bound Feedback Submission Flow
        if (authoritativeActivityId) {
            const activityDoc = await Activity.findById(authoritativeActivityId).lean();
            if (!activityDoc) {
                return res.status(404).json({ success: false, error: 'Activity not found' });
            }

            // Safe Activity Ownership Validation
            const activityLeadId = activityDoc.entityId || activityDoc.lead;
            const isLead = !activityDoc.entityType || activityDoc.entityType?.toLowerCase() === 'lead';
            if (!isLead || String(activityLeadId) !== String(authoritativeLeadId)) {
                return res.status(403).json({ success: false, error: 'Activity entity does not match token subject' });
            }

            try {
                const txResult = await withMongoTransaction(async (session) => {
                    // Step 1: Atomic CAS on Activity
                    const completedActivity = await Activity.findOneAndUpdate(
                        {
                            _id: authoritativeActivityId,
                            status: { $ne: 'Completed' }
                        },
                        {
                            $set: {
                                status: 'Completed',
                                completedAt: new Date(),
                                completionResult: 'Feedback Received',
                                performedBy: 'Customer (Public Form)',
                                'details.completedVia': 'public_feedback_form'
                            }
                        },
                        { session, new: true }
                    );

                    if (completedActivity) {
                        // CAS Succeeded: Primary Feedback Completion
                        const [submission] = await FeedbackSubmission.create([{
                            form: form._id,
                            lead: authoritativeLeadId,
                            activity: completedActivity._id,
                            inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
                            department: completedActivity.department || form.department || null,
                            teams: completedActivity.teams || form.teams || [],
                            responses,
                            rating: submissionRating,
                            idempotencyKey: requestIdentity || undefined,
                            sourceMeta: {
                                userAgent: req.headers['user-agent']
                            }
                        }], { session });

                        // Link submission to Activity
                        await Activity.updateOne(
                            { _id: completedActivity._id },
                            { $set: { 'details.submissionId': submission._id } },
                            { session }
                        );

                        // Insert Transactional AuditLog
                        await AuditLog.create([{
                            eventType: 'lead_updated',
                            targetType: 'lead',
                            targetId: authoritativeLeadId,
                            targetName: 'Lead',
                            description: `Customer feedback submitted for Activity ${completedActivity._id}`,
                            changes: {
                                before: { status: activityDoc.status, submissionId: null },
                                after: { status: 'Completed', submissionId: submission._id }
                            },
                            metadata: {
                                activityId: completedActivity._id,
                                formSlug: form.slug,
                                submissionId: submission._id,
                                rating: submissionRating,
                                source: 'public_feedback_form'
                            },
                            status: 'success'
                        }], { session });

                        // Insert Transactional OutboxEvent
                        await OutboxEvent.create([{
                            eventId: uuidv4(),
                            eventType: 'ActivityUpdated',
                            aggregateType: 'Activity',
                            aggregateId: completedActivity._id,
                            correlationId: req.headers['x-correlation-id'] || uuidv4(),
                            status: 'PENDING',
                            payload: {
                                activityId: completedActivity._id,
                                entityType: 'Lead',
                                entityId: String(authoritativeLeadId),
                                status: 'Completed',
                                newStatus: 'Completed',
                                statusChanged: true,
                                type: completedActivity.type,
                                subject: completedActivity.subject || '',
                                description: completedActivity.description || '',
                                completedAt: completedActivity.completedAt,
                                completionResult: 'Feedback Received',
                                completionSource: 'public_feedback_form',
                                performedBy: 'Customer (Public Form)',
                                companyId: null,
                                actorId: null,
                                submissionId: submission._id,
                                details: completedActivity.details || {}
                            }
                        }], { session });

                        return { statusCode: 201, submissionId: submission._id };
                    }

                    // CAS Failed: Activity was already 'Completed'
                    const existingActivity = await Activity.findById(authoritativeActivityId).session(session);
                    const existingSubId = existingActivity?.details?.submissionId;

                    if (existingSubId) {
                        const existingSub = await FeedbackSubmission.findById(existingSubId).session(session);
                        if (existingSub && requestIdentity && existingSub.idempotencyKey === requestIdentity) {
                            // Identical Request Retry (Idempotent)
                            return { statusCode: 200, duplicate: true, submissionId: existingSub._id };
                        }
                        // Conflict: Activity already fulfilled by another submission
                        return { statusCode: 409, conflict: true, error: 'Feedback has already been submitted for this activity.' };
                    }

                    // Policy A: Activity completed by staff without customer feedback
                    return { statusCode: 409, conflict: true, error: 'Activity has already been completed.' };
                });

                if (txResult.conflict) {
                    return res.status(409).json({ success: false, error: txResult.error, message: txResult.error });
                }

                if (txResult.duplicate) {
                    return res.status(200).json({
                        success: true,
                        duplicate: true,
                        submissionId: txResult.submissionId,
                        message: 'Feedback already recorded.'
                    });
                }

                // Increment submission count in analytics
                FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.submissions': 1 } }).catch(() => {});

                return res.status(201).json({
                    success: true,
                    submissionId: txResult.submissionId,
                    message: form.settings?.successMessage || 'Thank you for your feedback!'
                });

            } catch (err) {
                // Duplicate Key Error handling outside the aborted transaction
                if (err.code === 11000 || err.message?.includes('E11000')) {
                    if (requestIdentity) {
                        const existing = await FeedbackSubmission.findOne({ idempotencyKey: requestIdentity }).lean();
                        if (existing && existing.idempotencyKey === requestIdentity) {
                            return res.status(200).json({
                                success: true,
                                duplicate: true,
                                submissionId: existing._id,
                                message: 'Feedback already recorded.'
                            });
                        }
                    }
                }
                throw err;
            }
        }

        // 🛡️ General Lead Feedback or Anonymous Public Submission Flow
        // (authoritativeActivityId is null; NO Activity is completed; NO OutboxEvent is emitted)
        const [generalSubmission] = await FeedbackSubmission.create([{
            form: form._id,
            lead: authoritativeLeadId,
            activity: null,
            inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
            department: form.department || null,
            teams: form.teams || [],
            responses,
            rating: submissionRating,
            idempotencyKey: requestIdentity || undefined,
            sourceMeta: {
                userAgent: req.headers['user-agent']
            }
        }]);

        if (authoritativeLeadId) {
            AuditLog.create([{
                eventType: 'lead_updated',
                targetType: 'lead',
                targetId: authoritativeLeadId,
                targetName: 'Lead',
                description: `General customer feedback recorded via form ${form.slug}`,
                changes: {
                    after: { submissionId: generalSubmission._id }
                },
                metadata: {
                    formSlug: form.slug,
                    submissionId: generalSubmission._id,
                    rating: submissionRating,
                    source: 'public_feedback_form'
                },
                status: 'success'
            }]).catch(err => console.error('[AuditLog Error]:', err.message));
        }

        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.submissions': 1 } }).catch(() => {});

        return res.status(201).json({
            success: true,
            submissionId: generalSubmission._id,
            message: form.settings?.successMessage || 'Thank you for your feedback!'
        });

    } catch (error) {
        console.error('[FeedbackSubmit] Fatal Error:', error);
        next(error);
    }
};
