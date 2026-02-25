import LeadForm from "../models/LeadForm.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { runFullLeadEnrichment } from "../src/utils/enrichmentEngine.js";

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
        const form = await LeadForm.findOne({ slug: req.params.slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found or inactive" });

        // Track View
        form.analytics.views += 1;
        await form.save();

        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const submitForm = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { formData, sourceMeta } = req.body; // formData is { fieldId: value }

        const form = await LeadForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // 1. Map Form Data to Lead Model
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

            // Add to score if value is provided (simple weight logic)
            // Advanced: field.options could have specific weights? Prompt said "Each field should support weight config"
            preScore += field.weight || 0;

            if (!field.mappingField) continue;

            // Handle Mapping
            if (['mobile', 'firstName', 'lastName', 'email', 'description', 'notes', 'salutation', 'timeline', 'purpose', 'locCity', 'locArea', 'locState', 'locCountry', 'locPinCode', 'sector'].includes(field.mappingField)) {
                leadData[field.mappingField] = value;
            } else if (['budgetMin', 'budgetMax', 'areaMin', 'areaMax'].includes(field.mappingField)) {
                leadData[field.mappingField] = Number(value);
            } else if (['requirement', 'budget', 'location', 'source', 'stage', 'status'].includes(field.mappingField)) {
                // Resolve Lookup
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
                // Resolve Array Lookups
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

        // Auto Assignment
        if (form.settings.autoAssignTo) {
            leadData.owner = form.settings.autoAssignTo;
            leadData.assignment = {
                assignedTo: form.settings.autoAssignTo,
                method: 'Manual/Form'
            };
        }

        // 2. Create Lead
        const lead = await Lead.create(leadData);

        // 3. Update Analytics
        form.analytics.submissions += 1;
        // Optimization: simple conversion logic - views/submissions
        form.analytics.conversions = Math.round((form.analytics.submissions / form.analytics.views) * 100);
        await form.save();

        // 4. Trigger Engines
        // runFullLeadEnrichment is non-blocking here to speed up response
        runFullLeadEnrichment(lead._id).catch(err => console.error("[ENRICHMENT ERROR] Form Submit:", err));

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
