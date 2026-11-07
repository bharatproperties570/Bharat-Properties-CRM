import LeadForm from "../models/LeadForm.js";
import DynamicForm from "../models/DynamicForm.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import OutboxEvent from "../models/OutboxEvent.js";
import mongoose from "mongoose";
import { withMongoTransaction } from "../utils/withMongoTransaction.js";
import jwt from "jsonwebtoken";

// Helper to resolve lookup (Find or Create)
// ARCHITECTURE & FAILURE BEHAVIOR AUDIT:
// - Lookup values are idempotent shared catalog references (e.g. Requirement, Budget, Location).
// - Lookup resolution executes BEFORE the MongoDB transaction begins.
// - If resolveLookup() fails (e.g. database error), it throws immediately before any Lead,
//   Activity, OutboxEvent, or DynamicFormSubmission is modified.
// - If resolveLookup() creates a new Lookup entry and a subsequent step fails, the created
//   Lookup entry remains as a benign catalog entry in the database (no business data corruption).
const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

// ─── Builder Operations ──────────────────────────────────────────────────────

export const createForm = async (req, res, next) => {
    try {
        const form = await LeadForm.create(req.body);
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const getForms = async (req, res, next) => {
    try {
        const forms = await LeadForm.find().sort({ createdAt: -1 });
        res.json({ success: true, data: forms });
    } catch (error) {
        next(error);
    }
};

export const getFormById = async (req, res, next) => {
    try {
        const form = await LeadForm.findById(req.params.id);
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const updateForm = async (req, res, next) => {
    try {
        const form = await LeadForm.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const deleteForm = async (req, res, next) => {
    try {
        await LeadForm.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Form deleted" });
    } catch (error) {
        next(error);
    }
};

// ─── Public Operations ───────────────────────────────────────────────────────

export const getFormBySlug = async (req, res, next) => {
    try {
        let form = await LeadForm.findOne({ slug: req.params.slug, isActive: true });
        
        // 🚀 Senior professional fallback: Check DynamicForm collection if not found in LeadForms
        if (!form) {
            form = await DynamicForm.findOne({ slug: req.params.slug, isActive: true });
        }

        if (!form) return res.status(404).json({ success: false, message: "Form not found or inactive" });

        // Track View
        form.analytics.views += 1;
        await form.save();

        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const submitForm = async (req, res) => {
    try {
        const { slug } = req.params;
        const { formData = {}, sourceMeta = {} } = req.body || {}; // formData is { fieldId: value }

        let form = await LeadForm.findOne({ slug, isActive: true });
        
        // Fallback to DynamicForm
        if (!form) {
            form = await DynamicForm.findOne({ slug, isActive: true });
        }

        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // P1 Submission-Level Idempotency Boundary
        const idempotencyKey = req.headers?.['idempotency-key'] ||
                               req.headers?.['x-idempotency-key'] ||
                               req.body?.idempotencyKey ||
                               sourceMeta?.idempotencyKey ||
                               null;

        if (idempotencyKey) {
            const { default: DynamicFormSubmission } = await import("../models/DynamicFormSubmission.js");
            const existingSubmission = await DynamicFormSubmission.findOne({ formId: form._id, idempotencyKey });
            if (existingSubmission) {
                console.log(`[FORM SUBMIT] Duplicate submission replayed for form ${form.slug}, idempotencyKey: ${idempotencyKey}`);
                return res.status(200).json({
                    success: true,
                    message: form.settings?.successMessage || "Thank you for your interest! We will contact you soon.",
                    redirectUrl: form.settings?.redirectUrl,
                    leadId: existingSubmission.lead || null,
                    idempotentReplay: true
                });
            }
        }

        // 1. P0 IDOR Remediation: Never trust unauthenticated raw req.body.leadId or req.query.leadId
        let leadId = null;
        const urlParams = new URLSearchParams(sourceMeta?.search || "");
        const refToken = urlParams.get('ref') || req.query?.ref || req.body?.ref || null;

        if (refToken) {
            const secret = process.env.JWT_SECRET;
            if (!secret || typeof secret !== 'string' || secret.trim() === '' || secret === 'crm_secret_key') {
                // Fail closed: Insecure or missing JWT signing secret must fail closed
                console.error("[SUBMIT] JWT signing secret unavailable or insecure; failing closed");
                return res.status(500).json({
                    success: false,
                    message: "Security configuration error: Token verification unavailable"
                });
            }

            // Meta WhatsApp replaces . with ~ (new) or - (legacy)
            let normalizedToken = refToken.includes("~") ? refToken.replace(/~/g, ".") : refToken;
            if (!normalizedToken.includes(".") && normalizedToken.split("-").length === 3) {
                normalizedToken = normalizedToken.replace(/-/g, ".");
            }

            let decoded;
            try {
                decoded = jwt.verify(normalizedToken, secret);
            } catch (jwtErr) {
                console.warn(`[SUBMIT] Reference token verification failed (${jwtErr.name}): ${jwtErr.message}`);
                return res.status(400).json({
                    success: false,
                    message: "Invalid, expired, or tampered reference token"
                });
            }

            // Mandatory numeric 'exp' claim validation
            if (typeof decoded.exp !== 'number' || isNaN(decoded.exp) || decoded.exp <= 0) {
                console.warn("[SUBMIT] Reference token rejected: Missing mandatory numeric expiration (exp) claim");
                return res.status(400).json({
                    success: false,
                    message: "Invalid reference token: Missing mandatory expiration claim"
                });
            }

            const nowSec = Math.floor(Date.now() / 1000);
            if (decoded.exp <= nowSec) {
                console.warn(`[SUBMIT] Reference token rejected: Token expired at ${decoded.exp} (now: ${nowSec})`);
                return res.status(400).json({
                    success: false,
                    message: "Reference token has expired"
                });
            }

            // Token purpose binding validation (consistent with issuance contract)
            const ALLOWED_LEAD_FORM_PURPOSES = new Set([
                'lead_reference',
                'public_form',
                'site_visit_scheduler',
                'form_prefill',
                'form_submission',
                'wa_match_centre',
                'client_portal'
            ]);

            if (decoded.purpose && !ALLOWED_LEAD_FORM_PURPOSES.has(decoded.purpose)) {
                console.warn(`[SUBMIT] Reference token rejected: Unauthorized purpose '${decoded.purpose}'`);
                return res.status(403).json({
                    success: false,
                    message: `Forbidden: Token purpose '${decoded.purpose}' is not authorized for lead form submission`
                });
            }

            // Intended form / workflow binding validation
            if (decoded.formSlug && String(decoded.formSlug) !== String(slug)) {
                console.warn(`[SUBMIT] Reference token rejected: Token bound to formSlug '${decoded.formSlug}' but submitted to '${slug}'`);
                return res.status(403).json({
                    success: false,
                    message: "Forbidden: Reference token is not authorized for this form"
                });
            }

            if (decoded.formId && String(decoded.formId) !== String(form._id)) {
                console.warn(`[SUBMIT] Reference token rejected: Token bound to formId '${decoded.formId}' but submitted to '${form._id}'`);
                return res.status(403).json({
                    success: false,
                    message: "Forbidden: Reference token is not authorized for this form"
                });
            }

            if (!decoded || !decoded.leadId || !mongoose.Types.ObjectId.isValid(decoded.leadId)) {
                return res.status(400).json({
                    success: false,
                    message: "Reference token does not contain a valid lead binding"
                });
            }

            // Validate token binding: If caller explicitly provided a leadId, it must match decoded token
            const explicitLeadId = req.body?.leadId || req.query?.leadId;
            if (explicitLeadId && String(explicitLeadId) !== String(decoded.leadId)) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden: Explicit leadId does not match signed reference token binding"
                });
            }

            leadId = String(decoded.leadId);
        }

        const leadData = {
            source_meta: sourceMeta || {},
            capture_form: form._id,
            tags: form.settings?.autoTags || []
        };

        let preScore = 0;
        const allFields = form.sections.flatMap(s => s.fields);

        for (const field of allFields) {
            const value = formData[field.id];
            if (value === undefined || value === null || value === "") continue;

            preScore += field.weight || 0;

            if (!field.mappingField) continue;

            // Handle Mapping
            if (['mobile', 'firstName', 'lastName', 'email', 'description', 'notes', 'salutation', 'timeline', 'purpose', 'locCity', 'locArea', 'locState', 'locCountry', 'locPinCode', 'sector'].includes(field.mappingField)) {
                leadData[field.mappingField] = value;
            } else if (['budgetMin', 'budgetMax', 'areaMin', 'areaMax'].includes(field.mappingField)) {
                leadData[field.mappingField] = Number(value);
            } else if (['requirement', 'budget', 'location', 'source', 'stage', 'status'].includes(field.mappingField)) {
                const lookupTypeMap = {
                    requirement: 'Requirement',
                    budget: 'Budget',
                    location: 'Location',
                    source: 'Source',
                    status: 'Status',
                    stage: 'Stage'
                };
                leadData[field.mappingField] = await resolveLookup(lookupTypeMap[field.mappingField], value);
            } else if (['propertyType', 'subType', 'unitType', 'facing', 'roadWidth', 'direction'].includes(field.mappingField)) {
                const lookupTypeMap = {
                    propertyType: 'Property Type',
                    subType: 'Sub Type',
                    unitType: 'Unit Type',
                    facing: 'Facing',
                    roadWidth: 'Road Width',
                    direction: 'Direction'
                };
                const vals = Array.isArray(value) ? value : [value];
                leadData[field.mappingField] = await Promise.all(vals.map(v => resolveLookup(lookupTypeMap[field.mappingField], v)));
            }
        }

        leadData.pre_intent_score = preScore;

        // 2. Create or Link Lead
        let lead;
        let isNewLead = false;
        let staticFallbackUsed = false;
        
        if (leadId) {
            // Update path: execute Lead mutation, site-visit activity (if applicable), Outbox persistence, and submission record inside ONE MongoDB transaction
            try {
                await withMongoTransaction(async (session) => {
                    lead = await Lead.findByIdAndUpdate(leadId, leadData, { new: true, session });
                    if (!lead) {
                        const notFoundErr = new Error(`Lead ${leadId} not found`);
                        notFoundErr.status = 404;
                        throw notFoundErr;
                    }

                    // If Site Visit category, create Activity inside the same transaction
                    if (form.category === 'site_visit') {
                        const Activity = mongoose.model('Activity');
                        const projectField = allFields.find(f => f.dynamicSource === 'projects' || f.id === 'f_project');
                        const dateField = allFields.find(f => f.type === 'date' || f.id === 'f_date');
                        
                        let activityType = 'Site Visit';
                        if (sourceMeta && sourceMeta.search) {
                            const searchParams = new URLSearchParams(sourceMeta.search);
                            if (searchParams.get('type')) activityType = searchParams.get('type');
                        }
                        
                        await Activity.create([{
                            entityType: 'Lead',
                            entityId: lead._id,
                            type: activityType,
                            status: 'Pending',
                            subject: `🌐 ${activityType} Scheduled: ${form.name}`,
                            description: `Client scheduled a ${activityType.toLowerCase()} for project: ${projectField ? (formData[projectField.id] || 'Not specified') : 'Not specified'}.
                                            Notes: ${leadData.description || leadData.notes || 'No additional notes'}`,
                            dueDate: dateField ? (formData[dateField.id] || new Date()) : new Date(),
                            assignedTo: lead.owner || form.settings?.autoAssignTo
                        }], { session });
                    }

                    // 4. Trigger Engines -> Durable Background Outbox Event
                    await OutboxEvent.create([{
                        eventType: 'LeadEnrichmentRequested',
                        aggregateType: 'Lead',
                        aggregateId: lead._id,
                        payload: { leadId: lead._id },
                        tenantId: lead.tenantId,
                        provenance: { source: 'PUBLIC_FORM', actorType: 'EXTERNAL' }
                    }], { session });

                    // P1: Record submission idempotency inside the same transaction
                    if (idempotencyKey) {
                        const { default: DynamicFormSubmission } = await import("../models/DynamicFormSubmission.js");
                        await DynamicFormSubmission.create([{
                            formId: form._id,
                            lead: lead._id,
                            idempotencyKey,
                            data: formData,
                            metadata: {
                                ip: req.ip,
                                userAgent: req.headers?.['user-agent'],
                                referrer: req.headers?.referrer || sourceMeta?.referrer,
                                utm_source: sourceMeta?.utm_source,
                                utm_medium: sourceMeta?.utm_medium,
                                utm_campaign: sourceMeta?.utm_campaign
                            },
                            status: 'processed'
                        }], { session });
                    }
                });
            } catch (updateErr) {
                if (idempotencyKey && (updateErr.code === 11000 || updateErr.message?.includes('duplicate key') || updateErr.message?.includes('E11000'))) {
                    console.log(`[FORM SUBMIT] Concurrent duplicate update caught for key ${idempotencyKey}; recovering from committed record`);
                    const { default: DynamicFormSubmission } = await import("../models/DynamicFormSubmission.js");
                    let winningSubmission = await DynamicFormSubmission.findOne({ formId: form._id, idempotencyKey });
                    if (!winningSubmission) {
                        for (let waitAttempt = 0; waitAttempt < 10; waitAttempt++) {
                            await new Promise(r => setTimeout(r, 50));
                            winningSubmission = await DynamicFormSubmission.findOne({ formId: form._id, idempotencyKey });
                            if (winningSubmission) break;
                        }
                    }
                    if (winningSubmission) {
                        return res.status(200).json({
                            success: true,
                            message: form.settings?.successMessage || "Thank you for your interest! We will contact you soon.",
                            redirectUrl: form.settings?.redirectUrl,
                            leadId: winningSubmission.lead || null,
                            idempotentReplay: true
                        });
                    }
                }
                throw updateErr;
            }
            console.log(`[FORM SUBMIT] Linked and updated existing lead: ${leadId}`);

            // Non-transactional post-commit distribution and fallback assignment
            try {
                const { distributeEntity } = await import("../src/utils/distributionEngine.js");
                const assignment = await distributeEntity(lead, 'onWebCapture');

                if (!assignment && form.settings?.autoAssignTo) {
                    lead = await Lead.findByIdAndUpdate(lead._id, {
                        owner: form.settings.autoAssignTo,
                        'assignment.assignedTo': form.settings.autoAssignTo,
                        'assignment.method': 'Manual/Form-Static'
                    }, { new: true });
                }
            } catch (distErr) {
                console.error("[DISTRIBUTION ERROR] Form Submit:", distErr);
            }
        } else {
            // New lead creation path via protected LeadCreationEngine inside withMongoTransaction
            const { createStandardizedLead } = await import('../services/LeadCreationEngine.js');
            const { default: DynamicFormSubmission } = await import("../models/DynamicFormSubmission.js");

            try {
                await withMongoTransaction(async (session) => {
                    const result = await createStandardizedLead(leadData, {
                        triggerEvent: 'onWebCapture',
                        session,
                        source: 'PUBLIC_FORM',
                        actorType: 'EXTERNAL'
                    });
                    lead = result.lead;
                    isNewLead = true;
                    
                    // Standard engine handles initial distribution, but fallback to static setting if missing
                    if (!result.assignment && form.settings?.autoAssignTo) {
                        lead = await Lead.findByIdAndUpdate(lead._id, {
                            owner: form.settings.autoAssignTo,
                            'assignment.assignedTo': form.settings.autoAssignTo,
                            'assignment.method': 'Manual/Form-Static'
                        }, { session, new: true });
                        staticFallbackUsed = true;
                    }

                    // SMART ACTIVITY INTEGRATION: If Site Visit category, create Activity inside the same transaction
                    if (form.category === 'site_visit') {
                        const Activity = mongoose.model('Activity');
                        const projectField = allFields.find(f => f.dynamicSource === 'projects' || f.id === 'f_project');
                        const dateField = allFields.find(f => f.type === 'date' || f.id === 'f_date');
                        
                        let activityType = 'Site Visit';
                        if (sourceMeta && sourceMeta.search) {
                            const searchParams = new URLSearchParams(sourceMeta.search);
                            if (searchParams.get('type')) activityType = searchParams.get('type');
                        }
                        
                        await Activity.create([{
                            entityType: 'Lead',
                            entityId: lead._id,
                            type: activityType,
                            status: 'Pending',
                            subject: `🌐 ${activityType} Scheduled: ${form.name}`,
                            description: `Client scheduled a ${activityType.toLowerCase()} for project: ${projectField ? (formData[projectField.id] || 'Not specified') : 'Not specified'}.
                                            Notes: ${leadData.description || leadData.notes || 'No additional notes'}`,
                            dueDate: dateField ? (formData[dateField.id] || new Date()) : new Date(),
                            assignedTo: lead.owner || form.settings?.autoAssignTo
                        }], { session });
                    }

                    // Record submission idempotency inside the same transaction
                    if (idempotencyKey) {
                        await DynamicFormSubmission.create([{
                            formId: form._id,
                            lead: lead._id,
                            idempotencyKey,
                            data: formData,
                            metadata: {
                                ip: req.ip,
                                userAgent: req.headers?.['user-agent'],
                                referrer: req.headers?.referrer || sourceMeta?.referrer,
                                utm_source: sourceMeta?.utm_source,
                                utm_medium: sourceMeta?.utm_medium,
                                utm_campaign: sourceMeta?.utm_campaign
                            },
                            status: 'processed'
                        }], { session });
                    }
                });
            } catch (createErr) {
                // Safe concurrent duplicate-key recovery
                if (idempotencyKey && (createErr.code === 11000 || createErr.message?.includes('duplicate key') || createErr.message?.includes('E11000'))) {
                    console.log(`[FORM SUBMIT] Concurrent duplicate submission caught for key ${idempotencyKey}; recovering from committed record`);
                    let winningSubmission = await DynamicFormSubmission.findOne({ formId: form._id, idempotencyKey });
                    if (!winningSubmission) {
                        for (let waitAttempt = 0; waitAttempt < 10; waitAttempt++) {
                            await new Promise(r => setTimeout(r, 50));
                            winningSubmission = await DynamicFormSubmission.findOne({ formId: form._id, idempotencyKey });
                            if (winningSubmission) break;
                        }
                    }
                    if (winningSubmission) {
                        return res.status(200).json({
                            success: true,
                            message: form.settings?.successMessage || "Thank you for your interest! We will contact you soon.",
                            redirectUrl: form.settings?.redirectUrl,
                            leadId: winningSubmission.lead || null,
                            idempotentReplay: true
                        });
                    }
                }
                throw createErr;
            }
        }

        // 3. Update Analytics (safely caught post-commit so analytics failure cannot duplicate business actions on client retry)
        try {
            form.analytics.submissions += 1;
            form.analytics.conversions = Math.round((form.analytics.submissions / Math.max(1, form.analytics.views)) * 100);
            await form.save();
        } catch (analyticsErr) {
            console.error("[FORM SUBMIT] Form analytics update failed post-commit:", analyticsErr.message);
        }

        // 🚀 Senior Tweak: Notify Owner of New Capture (if assignment occurred and they weren't notified by distribution engine)
        if (lead.owner && (!isNewLead || staticFallbackUsed)) {
            const { createNotification } = await import('./notification.controller.js');
            createNotification(
                lead.owner,
                'publicForms',
                '🌐 New Website Lead Captured',
                `A new lead matching your requirement was just captured via form: ${form.name}`,
                `/leads/${lead._id}`,
                { leadId: lead._id },
                'high'
            ).catch(() => {});
        }

        res.status(201).json({
            success: true,
            message: form.settings?.successMessage,
            redirectUrl: form.settings?.redirectUrl,
            leadId: lead._id
        });

    } catch (error) {
        console.error("[FORM SUBMISSION ERROR]:", error);
        res.status(error.status || 500).json({ success: false, message: "Submission failed", error: error.message });
    }
};
