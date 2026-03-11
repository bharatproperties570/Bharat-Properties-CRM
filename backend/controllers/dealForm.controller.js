import DealForm from "../models/DealForm.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import Contact from "../models/Contact.js";
import Inventory from "../models/Inventory.js";
import mongoose from "mongoose";

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
        const form = await DealForm.create(req.body);
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const getForms = async (req, res, next) => {
    try {
        const forms = await DealForm.find().sort({ createdAt: -1 });
        res.json({ success: true, data: forms });
    } catch (error) {
        next(error);
    }
};

export const getFormById = async (req, res, next) => {
    try {
        const form = await DealForm.findById(req.params.id);
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const updateForm = async (req, res, next) => {
    try {
        const form = await DealForm.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const deleteForm = async (req, res, next) => {
    try {
        await DealForm.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Form deleted" });
    } catch (error) {
        next(error);
    }
};

// ─── Public Operations ───────────────────────────────────────────────────────

export const getFormBySlug = async (req, res, next) => {
    try {
        const form = await DealForm.findOne({ slug: req.params.slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found or inactive" });

        // Track View
        form.analytics.views += 1;
        await form.save();

        res.json({ success: true, data: form });
    } catch (error) {
        next(error);
    }
};

export const submitDealForm = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { formData, sourceMeta } = req.body;

        const form = await DealForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Map Form Data to Deal Model
        const dealData = {
            source: 'Capture Form',
            capture_form: form._id,
            status: 'Open',
            stage: 'Open',
            tags: form.settings.autoTags || []
        };

        const allFields = form.sections.flatMap(s => s.fields);
        const contactInfo = {};
        const transactionInfo = {};

        for (const field of allFields) {
            const value = formData[field.id];
            if (value === undefined || value === null || value === "") continue;

            if (!field.mappingField) continue;

            // Direct Mapping
            if (['projectName', 'block', 'unitNo', 'intent', 'remarks'].includes(field.mappingField)) {
                dealData[field.mappingField] = value;
            } else if (['price'].includes(field.mappingField)) {
                dealData[field.mappingField] = Number(value);
            } else if (['fullName', 'phone', 'email', 'role', 'relationship'].includes(field.mappingField)) {
                contactInfo[field.mappingField] = value;
            }
        }

        // 1. Find the Inventory record
        const inventory = await Inventory.findOne({
            projectName: dealData.projectName,
            block: dealData.block,
            unitNo: dealData.unitNo
        });

        if (inventory) {
            dealData.inventoryId = inventory._id;
        }

        // 2. Handle Contact Creation/Linking
        let contactId = null;
        if (contactInfo.phone || contactInfo.fullName) {
            let contact = await Contact.findOne({
                $or: [
                    { 'phones.number': contactInfo.phone },
                    { name: contactInfo.fullName }
                ].filter(q => Object.values(q)[0])
            });

            if (!contact && (contactInfo.phone || contactInfo.fullName)) {
                contact = await Contact.create({
                    name: contactInfo.fullName || 'New Lead from Form',
                    phones: contactInfo.phone ? [{ number: contactInfo.phone, type: 'Personal' }] : [],
                    emails: contactInfo.email ? [{ address: contactInfo.email, type: 'Personal' }] : [],
                    tags: ['Form Submission']
                });
            }
            contactId = contact._id;
            dealData.owner = contactId; // Primary contact for the deal
        }

        // 3. Update Inventory Assignment
        if (inventory && contactId) {
            const isOwner = contactInfo.role === 'Owner';
            if (isOwner) {
                // Add to owners if not already there
                if (!inventory.owners) inventory.owners = [];
                if (!inventory.owners.includes(contactId)) {
                    inventory.owners.push(contactId);
                }
            } else {
                // Add to associates
                if (!inventory.associates) inventory.associates = [];
                const exists = inventory.associates.some(a => a.contact && a.contact.toString() === contactId.toString());
                if (!exists) {
                    inventory.associates.push({
                        contact: contactId,
                        relationship: contactInfo.relationship || 'Associate'
                    });
                }
            }
            
            // Also update inventory intent if provided
            if (dealData.intent) {
                if (!inventory.intent) inventory.intent = [];
                if (!inventory.intent.includes(dealData.intent)) {
                    inventory.intent.push(dealData.intent);
                }
            }

            await inventory.save();
        }

        // 4. Force status to Unverified as requested
        dealData.status = 'Unverified';
        dealData.stage = 'Open';

        // Auto Assignment
        if (form.settings.autoAssignTo) {
            dealData.assignedTo = form.settings.autoAssignTo;
        }

        // Create Deal
        const deal = await Deal.create(dealData);

        // Update Analytics
        form.analytics.submissions += 1;
        form.analytics.conversions = Math.round((form.analytics.submissions / Math.max(1, form.analytics.views)) * 100);
        await form.save();

        res.status(201).json({
            success: true,
            message: form.settings.successMessage || "Deal captured successfully!",
            redirectUrl: form.settings.redirectUrl,
            dealId: deal._id
        });

    } catch (error) {
        console.error("[DEAL FORM SUBMISSION ERROR]:", error);
        res.status(500).json({ success: false, message: "Submission failed", error: error.message });
    }
};

// ─── Inventory Dropdown Data ──────────────────────────────────────────────────

export const getPublicInventoryProjects = async (req, res, next) => {
    try {
        const projects = await Inventory.distinct('projectName');
        res.json({ success: true, data: projects.filter(Boolean).sort() });
    } catch (error) {
        next(error);
    }
};

export const getPublicInventoryBlocks = async (req, res, next) => {
    try {
        const { projectName } = req.query;
        if (!projectName) return res.status(400).json({ success: false, message: "Project Name is required" });
        const blocks = await Inventory.distinct('block', { projectName });
        res.json({ success: true, data: blocks.filter(Boolean).sort() });
    } catch (error) {
        next(error);
    }
};

export const getPublicInventoryUnits = async (req, res, next) => {
    try {
        const { projectName, block } = req.query;
        if (!projectName || !block) return res.status(400).json({ success: false, message: "Project and Block are required" });
        const units = await Inventory.distinct('unitNo', { projectName, block });
        res.json({ success: true, data: units.filter(Boolean).sort() });
    } catch (error) {
        next(error);
    }
};
export const getPublicRelations = async (req, res, next) => {
    try {
        const relations = await Lookup.find({ lookup_type: 'Relation', is_active: true });
        res.json({ success: true, data: relations.map(r => r.lookup_value).sort() });
    } catch (error) {
        next(error);
    }
};
