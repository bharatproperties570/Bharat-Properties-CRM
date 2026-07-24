import LeadForm from "../models/LeadForm.js";
import DynamicForm from "../models/DynamicForm.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import mongoose from "mongoose";
import { enrichmentQueue } from "../src/queues/queueManager.js";
import jwt from "jsonwebtoken";

// Helper to resolve lookup (Find or Create)
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
        const { formData, sourceMeta } = req.body; // formData is { fieldId: value }

        let form = await LeadForm.findOne({ slug, isActive: true });
        
        // Fallback to DynamicForm
        if (!form) {
            form = await DynamicForm.findOne({ slug, isActive: true });
        }

        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // 1. Map Form Data to Lead Model
        let leadId = null;
        const urlParams = new URLSearchParams(sourceMeta?.search || "");
        const refToken = urlParams.get('ref');

        if (refToken) {
            try {
                // Meta WhatsApp replaces . with ~ (new) or - (legacy)
                let normalizedToken = refToken.includes("~") ? refToken.replace(/~/g, ".") : refToken;
                if (!refToken.includes("~") && refToken.split("-").length === 3) {
                    normalizedToken = refToken.replace(/-/g, ".");
                }
                
                const decoded = jwt.verify(normalizedToken, process.env.JWT_SECRET || 'crm_secret_key');
                if (decoded && decoded.leadId) {
                    leadId = decoded.leadId;
                }
            } catch (e) {
                console.warn("[SUBMIT] Token verification failed, falling back to new lead capture");
            }
        }

        const leadData = {
            source_meta: sourceMeta || {},
            capture_form: form._id,
            tags: form.settings.autoTags || []
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
        if (leadId) {
            lead = await Lead.findByIdAndUpdate(leadId, leadData, { new: true });
            console.log(`[FORM SUBMIT] Linked to existing lead: ${leadId}`);
        } else {
            lead = await Lead.create(leadData);
        }

        // 🚀 SMART ACTIVITY INTEGRATION: If Site Visit category, create Activity
        if (form.category === 'site_visit') {
            const Activity = mongoose.model('Activity');
            const projectField = allFields.find(f => f.dynamicSource === 'projects' || f.id === 'f_project');
            const dateField = allFields.find(f => f.type === 'date' || f.id === 'f_date');
            
            await Activity.create({
                entityType: 'Lead',
                entityId: lead._id,
                type: 'Site Visit',
                status: 'Pending',
                subject: `🌐 Site Visit Scheduled: ${form.name}`,
                description: `Client scheduled a visit for project: ${projectField ? (formData[projectField.id] || 'Not specified') : 'Not specified'}.
                               Notes: ${leadData.description || leadData.notes || 'No additional notes'}`,
                dueDate: dateField ? (formData[dateField.id] || new Date()) : new Date(),
                assignedTo: lead.owner || form.settings.autoAssignTo
            });
        }
        try {
            const { distributeEntity } = await import("../src/utils/distributionEngine.js");
            const assignment = await distributeEntity(lead, 'onWebCapture');

            if (!assignment && form.settings.autoAssignTo) {
                // Priority 2: Fallback to static form-level assignment if no rule matched
                await Lead.findByIdAndUpdate(lead._id, {
                    owner: form.settings.autoAssignTo,
                    'assignment.assignedTo': form.settings.autoAssignTo,
                    'assignment.method': 'Manual/Form-Static'
                });
            }
        } catch (distErr) {
            console.error("[DISTRIBUTION ERROR] Form Submit:", distErr);
        }

        // 3. Update Analytics
        form.analytics.submissions += 1;
        // Optimization: simple conversion logic - views/submissions
        form.analytics.conversions = Math.round((form.analytics.submissions / Math.max(1, form.analytics.views)) * 100);
        await form.save();

        // 4. Trigger Engines -> Moved to Background Event Queue
        enrichmentQueue.add('enrichLead', { leadId: lead._id })
            .catch(err => console.error("[ENRICHMENT QUEUE ERROR] Form Submit:", err));

        // 🚀 Senior Tweak: Notify Owner of New Capture
        if (lead.owner) {
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
            message: form.settings.successMessage,
            redirectUrl: form.settings.redirectUrl,
            leadId: lead._id
        });

    } catch (error) {
        console.error("[FORM SUBMISSION ERROR]:", error);
        res.status(500).json({ success: false, message: "Submission failed", error: error.message });
    }
};
