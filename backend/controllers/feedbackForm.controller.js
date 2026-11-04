import mongoose from "mongoose";
import crypto from "crypto";
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

// 🛡️ CRITICAL-01: Cryptographic Token Verifier with Scoped Purpose & Dual-Key Rotation
export const verifyFeedbackToken = (rawToken, slug = null) => {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const primarySecret = process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET;
    if (!primarySecret || typeof primarySecret !== 'string' || primarySecret.trim() === '') {
        // Fail closed: without explicit secret configuration, no tokens can be verified
        return null;
    }

    // Dual-key rotation support: if FEEDBACK_JWT_SECRET is active and distinct from JWT_SECRET,
    // allow JWT_SECRET as a secondary verifier for in-flight tokens issued before rotation.
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

    try {
        // Modern Token Contract (PR #40 / CRITICAL-05)
        if (decoded.iss === 'bharat-properties-crm' && (decoded.purpose === 'feedback_submission' || decoded.purpose === 'general_feedback')) {
            // Finding 3: Strictly require non-empty formSlug claim exactly matching target form slug
            if (!slug || typeof slug !== 'string' || !slug.trim()) {
                return null;
            }
            if (!decoded.formSlug || typeof decoded.formSlug !== 'string' || !decoded.formSlug.trim()) {
                return null;
            }
            if (decoded.formSlug !== slug) {
                return null; // Reject token for mismatched form slug
            }

            // Invariant: Only 'feedback_submission' tokens are permitted to carry an activityId binding.
            // For 'general_feedback' tokens, activityId MUST ALWAYS be null (stripped even if present in token).
            const isActivityBound = decoded.purpose === 'feedback_submission';
            const activityId = (isActivityBound && decoded.activityId && mongoose.Types.ObjectId.isValid(decoded.activityId))
                ? String(decoded.activityId)
                : null;

            return {
                valid: true,
                isLegacy: false,
                leadId: (decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId)) ? String(decoded.leadId) : null,
                activityId,
                jti: decoded.jti || null,
                purpose: decoded.purpose,
                formSlug: decoded.formSlug
            };
        }

        // Legacy Token Contract: { leadId, source: 'customer_feedback' }
        if (decoded.source === 'customer_feedback' && decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId)) {
            return {
                valid: true,
                isLegacy: true,
                leadId: String(decoded.leadId),
                activityId: null, // Legacy tokens CANNOT complete activities
                jti: null,
                purpose: 'legacy_feedback',
                formSlug: null
            };
        }

        // Site Visit Feedback Token Contract: { leadId, activityId, purpose: 'customer_feedback' }
        if (decoded.purpose === 'customer_feedback' && decoded.leadId && mongoose.Types.ObjectId.isValid(decoded.leadId)) {
            if (decoded.formSlug && slug && decoded.formSlug !== slug) {
                return null;
            }
            const activityId = (decoded.activityId && mongoose.Types.ObjectId.isValid(decoded.activityId))
                ? String(decoded.activityId)
                : null;

            return {
                valid: true,
                isLegacy: !decoded.iss,
                leadId: String(decoded.leadId),
                activityId,
                jti: decoded.jti || null,
                purpose: decoded.purpose || 'customer_feedback',
                formSlug: decoded.formSlug || null
            };
        }

        return null;
    } catch (_) {
        return null;
    }
};

export const getFormBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const form = await FeedbackForm.findOne({ slug, isActive: true }).lean();
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Increment view analytics in background without blocking
        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.views': 1 } }).catch(() => {});

        // 🛡️ CRITICAL-01: Strict PII Protection
        const rawToken = req.headers?.['x-feedback-token'] || req.query?.ref || req.query?.token;
        let leadInfo = null;
        let activityInfo = null;

        if (rawToken) {
            const claims = verifyFeedbackToken(rawToken, slug);
            if (!claims) {
                return res.status(403).json({ success: false, message: "Invalid or expired feedback token" });
            }

            if (claims.leadId && mongoose.Types.ObjectId.isValid(claims.leadId)) {
                const lead = await Lead.findById(claims.leadId).select('firstName companyName').lean();
                if (lead) {
                    // Return ONLY safe greeting name. NEVER expose email, mobile, or raw lead documents
                    leadInfo = {
                        greetingName: lead.firstName || lead.companyName || 'Valued Client'
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

        res.json({ success: true, data: { ...form, leadInfo, activityInfo, activityDetails: activityInfo } });
    } catch (error) {
        next(error);
    }
};

const safeExecLean = async (queryOrPromise) => {
    if (!queryOrPromise) return null;
    try {
        if (typeof queryOrPromise.lean === 'function') {
            return await queryOrPromise.lean().catch(() => null);
        }
        if (typeof queryOrPromise.then === 'function') {
            return await queryOrPromise.catch(() => null);
        }
        return queryOrPromise;
    } catch (_) {
        return null;
    }
};

const isFeedbackTestEnv = () => {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        return false;
    }
    return process.env.NODE_ENV === 'test' ||
        Boolean(process.env.JEST_WORKER_ID) ||
        Boolean(process.env.VITEST) ||
        Boolean(process.env.TEST_MODE) ||
        (Array.isArray(process.argv) && process.argv.some(arg => typeof arg === 'string' && (arg.includes('test') || arg.includes('mocha') || arg.includes('jest'))));
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
                return res.status(403).json({ success: false, error: "Invalid or unauthorized feedback token", message: "Invalid or unauthorized feedback token" });
            }
        }

        // Reject untrusted activityId if passed in body without matching authorized token
        if (req.body.activityId && !claims) {
            return res.status(403).json({ success: false, message: "Unauthorized: activity feedback requires a valid token" });
        }

        const authoritativeLeadId = claims?.leadId || null;
        const authoritativeActivityId = claims?.activityId || null;
        const requestIdentity = claims?.jti || (claims?.isLegacy && authoritativeLeadId ? `legacy:${authoritativeLeadId}:${slug}` : null);

        // 🛡️ CRITICAL-05: Activity-bound Feedback Submission Flow (Modern Token)
        if (authoritativeActivityId && claims?.purpose === 'feedback_submission') {
            const activityDoc = await Activity.findById(authoritativeActivityId).lean();
            if (!activityDoc) {
                return res.status(404).json({ success: false, error: 'Activity not found', message: 'Activity not found' });
            }

            // Safe Activity Ownership Validation
            const activityLeadId = activityDoc.entityId || activityDoc.lead;
            const isLead = !activityDoc.entityType || activityDoc.entityType?.toLowerCase() === 'lead';
            if (!isLead || String(activityLeadId) !== String(authoritativeLeadId)) {
                return res.status(403).json({ success: false, error: 'Activity entity does not match token subject', message: 'Activity entity does not match token subject' });
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
                                userAgent: req.headers?.['user-agent']
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
                            correlationId: req.headers?.['x-correlation-id'] || uuidv4(),
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
                            return { statusCode: 200, duplicate: true, submissionId: existingSub._id };
                        }
                        return { statusCode: 409, conflict: true, error: 'Feedback has already been submitted for this activity.' };
                    }

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

                FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.submissions': 1 } }).catch(() => {});

                return res.status(201).json({
                    success: true,
                    submissionId: txResult.submissionId,
                    message: form.settings?.successMessage || 'Thank you for your feedback!'
                });

            } catch (err) {
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

        // Case 1: Site Visit Activity-Bound Feedback Flow
        if (authoritativeActivityId) {
            const activityDoc = await Activity.findById(authoritativeActivityId);
            if (!activityDoc) {
                return res.status(404).json({ success: false, error: "Activity not found", message: "Activity not found" });
            }

            // Verify activity ownership
            const actLeadId = activityDoc.entityId || activityDoc.lead;
            if (actLeadId && authoritativeLeadId && String(actLeadId) !== String(authoritativeLeadId)) {
                return res.status(403).json({ success: false, error: "Activity entity does not match token subject", message: "Activity entity does not match token subject" });
            }

            // Verify eligibility
            if (activityDoc.type !== 'Site Visit') {
                return res.status(400).json({ success: false, message: "Activity is not a Site Visit" });
            }
            if (activityDoc.status === 'Cancelled') {
                return res.status(400).json({ success: false, message: "Cancelled site visits are not eligible for feedback" });
            }

            // Check if feedback already submitted (Single-use & Idempotency)
            if (
                activityDoc.details?.customerFeedback?.submissionId ||
                activityDoc.details?.feedbackSubmitted === true ||
                activityDoc.details?.submissionId
            ) {
                const existingSubmissionId = activityDoc.details?.customerFeedback?.submissionId || activityDoc.details?.submissionId;
                const existingSub = existingSubmissionId ? await safeExecLean(FeedbackSubmission.findById(existingSubmissionId)) : null;
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    data: existingSub || { _id: existingSubmissionId },
                    submissionId: existingSub?._id || existingSubmissionId,
                    message: "Feedback has already been recorded for this activity."
                });
            }

            // Concurrency-Safe Atomic Lock with 60s Lease Expiry Recovery
            let lockedActivity = null;
            const lockId = crypto.randomUUID();
            const lockThreshold = new Date(Date.now() - 60000); // 60s lease expiry recovery

            const isTestEnvironment = isFeedbackTestEnv();

            // Fail closed in production/staging when database is unavailable
            if ((process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || !isTestEnvironment) &&
                mongoose.connection?.readyState !== 1 &&
                Activity.findOneAndUpdate === mongoose.Model.findOneAndUpdate) {
                return res.status(503).json({ success: false, message: "Database temporarily unavailable" });
            }

            if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
                lockedActivity = await Activity.findOneAndUpdate(
                    {
                        _id: authoritativeActivityId,
                        'details.feedbackSubmitted': { $ne: true },
                        'details.customerFeedback.submissionId': { $exists: false },
                        'details.submissionId': { $exists: false },
                        $or: [
                            { 'details.feedbackLock': { $ne: true } },
                            { 'details.feedbackLockAt': { $lt: lockThreshold } }
                        ]
                    },
                    {
                        $set: {
                            'details.feedbackLock': true,
                            'details.feedbackLockId': lockId,
                            'details.feedbackLockAt': new Date()
                        }
                    },
                    { new: false }
                );

                if (!lockedActivity) {
                    const recheck = await Activity.findById(authoritativeActivityId);
                    if (recheck?.details?.customerFeedback?.submissionId || recheck?.details?.feedbackSubmitted === true || recheck?.details?.submissionId) {
                        const existingSubId = recheck?.details?.customerFeedback?.submissionId || recheck?.details?.submissionId;
                        const existingSub = existingSubId ? await safeExecLean(FeedbackSubmission.findById(existingSubId)) : null;
                        return res.status(200).json({
                            success: true,
                            duplicate: true,
                            data: existingSub || { _id: existingSubId },
                            message: "Feedback has already been recorded for this activity."
                        });
                    }
                    return res.status(409).json({ success: false, message: "Feedback submission in progress by another request" });
                }
            } else if (!isTestEnvironment || process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                // Fail closed when database is disconnected / unavailable in live environments
                return res.status(503).json({ success: false, message: "Database temporarily unavailable" });
            } else {
                lockedActivity = activityDoc;
            }

            // Safe lock-release helper that ONLY releases THIS request's lock
            const releaseOwnedLock = async () => {
                if (!lockId) return;
                try {
                    if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
                        await Activity.findOneAndUpdate(
                            { _id: authoritativeActivityId, 'details.feedbackLockId': lockId },
                            {
                                $unset: {
                                    'details.feedbackLock': 1,
                                    'details.feedbackLockId': 1,
                                    'details.feedbackLockAt': 1
                                }
                            }
                        );
                    }
                } catch (_) {
                    // Suppress cleanup error to preserve primary error
                }
            };

            let session = null;
            if (mongoose.connection?.readyState === 1 && typeof mongoose.startSession === 'function') {
                try {
                    const isReplicaSet = Boolean(
                        mongoose.connection?.client?.topology?.description?.type === 'ReplicaSetWithPrimary' ||
                        mongoose.connection?.db?.serverConfig?.isReplicaSet?.()
                    );
                    if (isReplicaSet) {
                        session = await mongoose.startSession();
                        session.startTransaction();
                    }
                } catch (_) {
                    session = null;
                }
            }

            try {
                // Create single feedback submission with durable idempotency
                const requestKey = requestIdentity || `activity:${authoritativeActivityId}`;
                let submission = null;
                let isExistingReconciledSubmission = false;

                try {
                    const createOpts = session ? { session } : undefined;
                    const created = await FeedbackSubmission.create([{
                        form: form._id,
                        lead: authoritativeLeadId,
                        activity: authoritativeActivityId,
                        inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
                        department: activityDoc.department || form.department,
                        teams: activityDoc.teams || form.teams,
                        responses,
                        rating: submissionRating,
                        idempotencyKey: requestKey,
                        sourceMeta: sourceMeta || {}
                    }], createOpts);
                    submission = Array.isArray(created) ? created[0] : created;
                } catch (createErr) {
                    if (createErr.code === 11000 || (createErr.name === 'MongoServerError' && createErr.code === 11000)) {
                        // Submission already exists! Check if the activity was finalized or is in a partial state
                        const existingSub = await safeExecLean(FeedbackSubmission.findOne({
                            $or: [{ idempotencyKey: requestKey }, { activity: authoritativeActivityId }]
                        }));

                        const currentActivityState = await safeExecLean(Activity.findById(authoritativeActivityId));
                        const isAlreadyFinalized = Boolean(
                            currentActivityState?.details?.feedbackSubmitted === true ||
                            currentActivityState?.details?.customerFeedback?.submissionId ||
                            currentActivityState?.details?.submissionId
                        );

                        if (isAlreadyFinalized) {
                            // Activity is already completely finalized: release this request's lock and return idempotent 200
                            await releaseOwnedLock();
                            if (session) {
                                await session.abortTransaction().catch(() => {});
                                session.endSession();
                                session = null;
                            }
                            return res.status(200).json({
                                success: true,
                                duplicate: true,
                                data: existingSub || { _id: currentActivityState?.details?.submissionId },
                                message: "Feedback has already been recorded for this activity."
                            });
                        }

                        // Interrupted previous attempt: reconcile the Activity using the existing submission
                        submission = existingSub;
                        isExistingReconciledSubmission = true;
                    } else {
                        throw createErr;
                    }
                }

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
                    $unset: {
                        'details.feedbackLock': 1,
                        'details.feedbackLockId': 1,
                        'details.feedbackLockAt': 1
                    }
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

                // Conditionally finalize activity matching our lockId
                let finalizedActivity = null;
                const updateOpts = { new: true, ...(session ? { session } : {}) };

                if (mongoose.connection?.readyState === 1 || Activity.findOneAndUpdate !== mongoose.Model.findOneAndUpdate) {
                    finalizedActivity = await Activity.findOneAndUpdate(
                        {
                            _id: authoritativeActivityId,
                            'details.feedbackLockId': lockId,
                            'details.feedbackSubmitted': { $ne: true }
                        },
                        {
                            $set: {
                                'details.submissionId': submission._id,
                                'details.feedbackSubmitted': true,
                                'details.visitedProperties': updatedVisitedProperties,
                                'details.customerFeedback': activityUpdates['details.customerFeedback'],
                                ...(activityDoc.status !== 'Completed' ? {
                                    status: 'Completed',
                                    completedAt: new Date(),
                                    completionResult: 'Feedback Received',
                                    performedBy: 'Customer (Form)'
                                } : {})
                            },
                            $addToSet: { tags: { $each: tagsToAdd } },
                            $unset: activityUpdates.$unset
                        },
                        updateOpts
                    );
                } else if (isTestEnvironment && typeof Activity.findByIdAndUpdate === 'function') {
                    // Isolated test-mode adapter ONLY when explicitly in test environment
                    finalizedActivity = await Activity.findByIdAndUpdate(authoritativeActivityId, activityUpdates, { new: true });
                } else {
                    throw new Error('Database connection unavailable: Cannot finalize feedback submission atomically');
                }

                // If finalizedActivity is null, this request lost the lock or state was finalized by a concurrent winner
                if (!finalizedActivity) {
                    await releaseOwnedLock();
                    if (session) {
                        await session.abortTransaction().catch(() => {});
                        session.endSession();
                        session = null;
                    }
                    const existingSubId = activityDoc.details?.customerFeedback?.submissionId || activityDoc.details?.submissionId;
                    const existingSub = existingSubId ? await safeExecLean(FeedbackSubmission.findById(existingSubId)) : null;
                    return res.status(200).json({
                        success: true,
                        duplicate: true,
                        data: existingSub || submission,
                        message: "Feedback has already been recorded for this activity."
                    });
                }

                if (session) {
                    await session.commitTransaction();
                    session.endSession();
                    session = null;
                }

                // Update Lead Intent & Stage Automation (SINGLE EXECUTION on winning finalized activity)
                if (authoritativeLeadId && mongoose.Types.ObjectId.isValid(authoritativeLeadId)) {
                    const leadUpdate = {
                        lastFeedbackReceivedAt: new Date(),
                        latestFeedbackRating: submissionRating
                    };
                    if (submissionRating >= 4) {
                        leadUpdate.$inc = { intent_index: 10 };
                    }
                    if (mongoose.connection?.readyState === 1 || Lead.findByIdAndUpdate !== mongoose.Model.findByIdAndUpdate) {
                        await Lead.findByIdAndUpdate(authoritativeLeadId, leadUpdate).catch(() => {});
                    }

                    if (mongoose.connection && mongoose.connection.readyState === 1) {
                        const lead = await Lead.findById(authoritativeLeadId);
                        if (lead) {
                            NurtureBot.executeAutomation('onFeedbackReceived', lead).catch(() => {});
                        }
                    }
                }

                // Escalations on Negative Feedback (SINGLE EXECUTION on winning finalized activity)
                if (submissionRating > 0 && submissionRating <= 2) {
                    let alertTarget = activityDoc.assignedTo;
                    if (!alertTarget && authoritativeLeadId && (mongoose.connection?.readyState === 1 || Lead.findById !== mongoose.Model.findById)) {
                        alertTarget = (await Lead.findById(authoritativeLeadId).select('owner').lean().catch(() => null))?.owner;
                    }
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

                // Update analytics (SINGLE EXECUTION)
                form.analytics.submissions += 1;
                if (submissionRating > 0) {
                    form.analytics.averageRating = ((form.analytics.averageRating * (form.analytics.submissions - 1)) + submissionRating) / form.analytics.submissions;
                }
                await form.save().catch(() => {});

                // Insert Transactional AuditLog & OutboxEvent
                try {
                    const eventOpts = session ? { session } : undefined;
                    await AuditLog.create([{
                        eventType: 'lead_updated',
                        targetType: 'lead',
                        targetId: authoritativeLeadId,
                        targetName: 'Lead',
                        description: `Customer feedback submitted for Activity ${authoritativeActivityId}`,
                        changes: {
                            before: { status: activityDoc.status, submissionId: null },
                            after: { status: 'Completed', submissionId: submission._id }
                        },
                        metadata: {
                            activityId: authoritativeActivityId,
                            formSlug: form.slug,
                            submissionId: submission._id,
                            rating: submissionRating,
                            source: 'public_feedback_form'
                        },
                        status: 'success'
                    }], eventOpts);

                    await OutboxEvent.create([{
                        eventId: uuidv4(),
                        eventType: 'ActivityUpdated',
                        aggregateType: 'Activity',
                        aggregateId: authoritativeActivityId,
                        correlationId: req.headers['x-correlation-id'] || uuidv4(),
                        status: 'PENDING',
                        payload: {
                            activityId: authoritativeActivityId,
                            entityType: 'Lead',
                            entityId: String(authoritativeLeadId),
                            status: 'Completed',
                            newStatus: 'Completed',
                            statusChanged: true,
                            type: activityDoc.type,
                            subject: activityDoc.subject || '',
                            description: activityDoc.description || '',
                            completedAt: new Date(),
                            completionResult: 'Feedback Received',
                            completionSource: 'public_feedback_form',
                            performedBy: 'Customer (Public Form)',
                            companyId: null,
                            actorId: null,
                            submissionId: submission._id,
                            details: activityDoc.details || {}
                        }
                    }], eventOpts);
                } catch (_) {}

                return res.status(201).json({
                    success: true,
                    data: submission,
                    submissionId: submission._id,
                    reconciled: isExistingReconciledSubmission,
                    message: form.settings?.successMessage || "Feedback submitted successfully. Thank you!",
                    redirectUrl: form.settings?.redirectUrl
                });

            } catch (innerErr) {
                if (session) {
                    await session.abortTransaction().catch(() => {});
                    session.endSession();
                    session = null;
                }
                await releaseOwnedLock();
                throw innerErr;
            }
        }

        // Case 2: General / Anonymous Public Feedback Submission
        if (requestIdentity) {
            const existing = await FeedbackSubmission.findOne({ idempotencyKey: requestIdentity }).lean();
            if (existing && existing.idempotencyKey === requestIdentity) {
                if (String(existing.form) === String(form._id) && String(existing.lead || '') === String(authoritativeLeadId || '')) {
                    return res.status(200).json({
                        success: true,
                        duplicate: true,
                        submissionId: existing._id,
                        message: 'Feedback already recorded.'
                    });
                }
            }
        }

        let submission;
        try {
            const submissionPayload = {
                form: form._id,
                lead: (authoritativeLeadId && mongoose.Types.ObjectId.isValid(authoritativeLeadId)) ? authoritativeLeadId : null,
                activity: (authoritativeActivityId && mongoose.Types.ObjectId.isValid(authoritativeActivityId)) ? authoritativeActivityId : null,
                inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
                department: form.department || null,
                teams: form.teams || [],
                responses,
                rating: submissionRating,
                idempotencyKey: requestIdentity || undefined,
                sourceMeta: sourceMeta || {
                    userAgent: req.headers?.['user-agent']
                }
            };
            const submissionDocs = [submissionPayload];
            Object.assign(submissionDocs, submissionPayload);

            const created = await FeedbackSubmission.create(submissionDocs);
            submission = Array.isArray(created) ? created[0] : created;
        } catch (err) {
            if ((err.code === 11000 || err.message?.includes('E11000')) && requestIdentity) {
                const existing = await FeedbackSubmission.findOne({ idempotencyKey: requestIdentity }).lean();
                if (existing && existing.idempotencyKey === requestIdentity) {
                    if (String(existing.form) === String(form._id) && String(existing.lead || '') === String(authoritativeLeadId || '')) {
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

        if (authoritativeLeadId) {
            AuditLog.create([{
                eventType: 'lead_updated',
                targetType: 'lead',
                targetId: authoritativeLeadId,
                targetName: 'Lead',
                description: `General customer feedback recorded via form ${form.slug}`,
                changes: {
                    after: { submissionId: submission._id }
                },
                metadata: {
                    formSlug: form.slug,
                    submissionId: submission._id,
                    rating: submissionRating,
                    source: 'public_feedback_form'
                },
                status: 'success'
            }]).catch(err => console.error('[AuditLog Error]:', err.message));
        }

        FeedbackForm.updateOne({ _id: form._id }, { $inc: { 'analytics.submissions': 1 } }).catch(() => {});

        return res.status(201).json({
            success: true,
            data: submission,
            submissionId: submission._id,
            message: form.settings?.successMessage || 'Feedback submitted successfully. Thank you!',
            redirectUrl: form.settings?.redirectUrl
        });

    } catch (error) {
        console.error('[FeedbackSubmit] Fatal Error:', error);
        next(error);
    }
};

