import DealForm from "../models/DealForm.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import Contact from "../models/Contact.js";
import Inventory from "../models/Inventory.js";
import MarketingService from "../services/MarketingService.js";




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

export const submitDealForm = async (req, res) => {
    try {
        const { slug } = req.params;
        const { formData } = req.body;

        const form = await DealForm.findOne({ slug, isActive: true });
        if (!form) return res.status(404).json({ success: false, message: "Form not found" });

        // Map Form Data to Deal Model
        const dealData = {
            source: 'Capture Form',
            capture_form: form._id,
            status: 'Unverified',
            stage: 'Open',
            tags: form.settings.autoTags || []
        };

        const allFields = form.sections.flatMap(s => s.fields);
        const ownerInfo = {};
        const associateInfo = {};

        for (const field of allFields) {
            const value = formData[field.id];
            if (value === undefined || value === null || value === "") continue;

            if (!field.mappingField) continue;

            // Direct Mapping
            if (['projectName', 'block', 'unitNo', 'intent', 'remarks', 'price', 'unitType', 'propertyType', 'size', 'location'].includes(field.mappingField)) {
                dealData[field.mappingField] = (field.mappingField === 'price' || field.mappingField === 'size' && !isNaN(value)) ? Number(value) : value;
            } 
            // Owner Mapping
            else if (['ownerName', 'ownerPhone', 'ownerEmail', 'fullName', 'phone', 'email'].includes(field.mappingField)) {
                if (field.mappingField === 'ownerName' || field.mappingField === 'fullName') ownerInfo.name = value;
                if (field.mappingField === 'ownerPhone' || field.mappingField === 'phone') ownerInfo.phone = value;
                if (field.mappingField === 'ownerEmail' || field.mappingField === 'email') ownerInfo.email = value;
            }
            // Associate Mapping
            else if (['associateName', 'associatePhone', 'relationship'].includes(field.mappingField)) {
                if (field.mappingField === 'associateName') associateInfo.name = value;
                if (field.mappingField === 'associatePhone') associateInfo.phone = value;
                if (field.mappingField === 'relationship') associateInfo.relationship = value;
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
        const resolveContact = async (info) => {
            if (!info.name && !info.phone) return null;
            let contact = await Contact.findOne({
                $or: [
                    { 'phones.number': info.phone },
                    { name: info.name }
                ].filter(q => Object.values(q)[0])
            });

            if (!contact) {
                contact = await Contact.create({
                    name: info.name || 'New Lead from Form',
                    phones: info.phone ? [{ number: info.phone, type: 'Personal' }] : [],
                    emails: info.email ? [{ address: info.email, type: 'Personal' }] : [],
                    tags: ['Form Submission']
                });
            }
            return contact;
        };

        const ownerContact = await resolveContact(ownerInfo);
        const associateContact = await resolveContact(associateInfo);

        if (ownerContact) dealData.owner = ownerContact._id;
        if (associateContact) dealData.associatedContact = associateContact._id;

        // 3. Update Inventory Assignment
        if (inventory) {
            // Update owner
            if (ownerContact) {
                if (!inventory.owners) inventory.owners = [];
                if (!inventory.owners.includes(ownerContact._id)) {
                    inventory.owners.push(ownerContact._id);
                }
            }
            // Update associate
            if (associateContact) {
                if (!inventory.associates) inventory.associates = [];
                const exists = inventory.associates.some(a => a.contact && a.contact.toString() === associateContact._id.toString());
                if (!exists) {
                    inventory.associates.push({
                        contact: associateContact._id,
                        relationship: associateInfo.relationship || 'Associate'
                    });
                }
            }
            
            // Update inventory intent if provided
            if (dealData.intent) {
                if (!inventory.intent) inventory.intent = [];
                if (!inventory.intent.includes(dealData.intent)) {
                    inventory.intent.push(dealData.intent);
                }
            }

            await inventory.save();
        }

        // Auto Assignment
        if (form.settings.autoAssignTo) {
            dealData.assignedTo = form.settings.autoAssignTo;
        }

        // Create Deal
        const deal = await Deal.create(dealData);

        // ⚡ [AUTO-PILOT]: Activate 360° Marketing Loop
        // We don't await this to keep the form response fast
        MarketingService.triggerAutoMarketing(deal._id).catch(err => {
            console.error('[AUTO-MARKETING ERROR]: Failed to trigger loop for deal', deal._id, err);
        });

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
        const relations = await Lookup.find({ lookup_type: 'Relation', isActive: true });
        res.json({ success: true, data: relations.map(r => r.lookup_value).sort() });
    } catch (error) {
        next(error);
    }
};
