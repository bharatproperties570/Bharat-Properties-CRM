import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { paginate } from "../utils/pagination.js";
import mockStore from "../utils/mockStore.js";

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

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${identifier}$`, 'i') } },
            { email: identifier.toLowerCase() },
            { name: { $regex: new RegExp(`^${identifier}$`, 'i') } }
        ]
    });
    return user ? user._id : null;
};

// Resolve All Reference Fields for Lead
const resolveAllReferenceFields = async (doc) => {
    if (doc.requirement) doc.requirement = await resolveLookup('Requirement', doc.requirement);
    if (doc.subRequirement) doc.subRequirement = await resolveLookup('Sub Requirement', doc.subRequirement);
    if (doc.budget) doc.budget = await resolveLookup('Budget', doc.budget);
    if (doc.location) doc.location = await resolveLookup('Location', doc.location);
    if (doc.source) doc.source = await resolveLookup('Source', doc.source);
    if (doc.status) doc.status = await resolveLookup('Status', doc.status);

    // Handle Arrays (Lookup fields)
    const arrayLookups = {
        propertyType: 'Property Type',
        subType: 'Sub Type',
        unitType: 'Unit Type',
        facing: 'Facing',
        roadWidth: 'Road Width',
        direction: 'Direction'
    };

    for (const [field, type] of Object.entries(arrayLookups)) {
        if (Array.isArray(doc[field])) {
            doc[field] = await Promise.all(doc[field].map(val => resolveLookup(type, val)));
        }
    }

    if (doc.owner) doc.owner = await resolveUser(doc.owner);
    if (doc.assignment?.assignedTo) doc.assignment.assignedTo = await resolveUser(doc.assignment.assignedTo);
    if (doc.project) {
        // Assume doc.project is name if not valid ID
        if (!mongoose.Types.ObjectId.isValid(doc.project)) {
            const Project = mongoose.model('Project');
            const p = await Project.findOne({ name: { $regex: new RegExp(`^${doc.project}$`, 'i') } });
            if (p) doc.project = p._id;
        }
    }

    // Resolve Documents
    if (Array.isArray(doc.documents)) {
        for (const docItem of doc.documents) {
            if (docItem.documentCategory) docItem.documentCategory = await resolveLookup('Document Category', docItem.documentCategory);
            if (docItem.documentName) docItem.documentName = await resolveLookup('Document Name', docItem.documentName);
            if (docItem.documentType) docItem.documentType = await resolveLookup('Document Type', docItem.documentType);
        }
    }
    return doc;
};

const leadPopulateFields = [
    { path: 'requirement', select: 'lookup_value' },
    { path: 'subRequirement', select: 'lookup_value' },
    { path: 'budget', select: 'lookup_value' },
    { path: 'location', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'status', select: 'lookup_value' },
    { path: 'propertyType', select: 'lookup_value' },
    { path: 'subType', select: 'lookup_value' },
    { path: 'unitType', select: 'lookup_value' },
    { path: 'facing', select: 'lookup_value' },
    { path: 'roadWidth', select: 'lookup_value' },
    { path: 'direction', select: 'lookup_value' },
    { path: 'owner', select: 'fullName email name' },
    { path: 'assignment.assignedTo', select: 'fullName email name' },
    { path: 'documents.documentCategory', select: 'lookup_value' },
    { path: 'documents.documentName', select: 'lookup_value' },
    { path: 'documents.documentType', select: 'lookup_value' }
];

/**
 * @desc    Get all leads with pagination and search
 * @route   GET /leads
 * @access  Private
 */
export const getLeads = async (req, res, next) => {
    try {
        const { page = 1, limit = 25, search = "" } = req.query;


        if (process.env.MOCK_MODE === 'true') {
            const results = mockStore.getLeads({}, Number(page), Number(limit));
            return res.status(200).json({ success: true, ...results });
        }

        const query = search
            ? {
                $or: [
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } },
                    { mobile: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { project: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } }
                ]
            }
            : {};

        // Enable population for key fields
        const results = await paginate(Lead, query, Number(page), Number(limit), { createdAt: -1 }, leadPopulateFields);

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("[ERROR] getLeads failed:", error);
        next(error);
    }
};

// ... Rest of the file remained unchanged but simplified for logging
export const addLead = async (req, res, next) => {
    try {
        const data = { ...req.body };
        await resolveAllReferenceFields(data);
        const lead = await Lead.create(data);
        await lead.populate(leadPopulateFields);
        res.status(201).json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const updateLead = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        await resolveAllReferenceFields(updateData);
        const lead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (lead) await lead.populate(leadPopulateFields);
        res.json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const deleteLead = async (req, res, next) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const getLeadById = async (req, res, next) => {
    try {
        const { id } = req.params;
        let lead;

        // Check if ID is a valid MongoDB ObjectId
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            lead = await Lead.findById(id);
        } else {
            // Fallback: search by mobile number
            lead = await Lead.findOne({ mobile: id });
        }

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        // Populate lead before returning
        await lead.populate(leadPopulateFields);

        res.json({ success: true, data: lead });
    } catch (error) {
        console.error("[ERROR] getLeadById failed:", error);
        next(error);
    }
};

export const bulkDeleteLeads = async (req, res, next) => {
    try {
        await Lead.deleteMany({ _id: { $in: req.body.ids } });
        res.status(200).json({ success: true, message: "Deleted" });
    } catch (error) {
        next(error);
    }
};

export const importLeads = async (req, res, next) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data format" });
        }

        const restructuredData = [];

        for (const item of data) {
            const firstName = item.name || item.firstName || '';
            const lastName = item.surname || item.lastName || '';

            const leadEntry = {
                salutation: item.title || item.salutation || 'Mr.',
                firstName: firstName,
                lastName: lastName,
                mobile: item.mobile,
                email: item.email,
                description: item.description,
                projectName: item.projectName ? (Array.isArray(item.projectName) ? item.projectName : [item.projectName]) : [],

                // Location Fields
                locCity: item.locCity || item.city,
                locArea: item.locArea || item.area,
                locBlock: item.locBlock ? (Array.isArray(item.locBlock) ? item.locBlock : [item.locBlock]) : [],
                locPinCode: item.locPinCode || item.pinCode,
                locState: item.locState || item.state,
                locCountry: item.locCountry || item.country,
                searchLocation: item.searchLocation,

                // Property/Requirement Fields
                budgetMin: Number(item.budgetMin) || undefined,
                budgetMax: Number(item.budgetMax) || undefined,
                areaMin: Number(item.areaMin) || undefined,
                areaMax: Number(item.areaMax) || undefined,
                areaMetric: item.areaMetric || 'Sq Yard',
                propertyType: item.propertyType ? (Array.isArray(item.propertyType) ? item.propertyType : item.propertyType.split(',').map(t => t.trim())) : [],
                subType: item.subType ? (Array.isArray(item.subType) ? item.subType : item.subType.split(',').map(t => t.trim())) : [],
                unitType: item.unitType ? (Array.isArray(item.unitType) ? item.unitType : item.unitType.split(',').map(t => t.trim())) : [],
                facing: item.facing ? (Array.isArray(item.facing) ? item.facing : item.facing.split(',').map(t => t.trim())) : [],
                roadWidth: item.roadWidth ? (Array.isArray(item.roadWidth) ? item.roadWidth : item.roadWidth.split(',').map(t => t.trim())) : [],
                direction: item.direction ? (Array.isArray(item.direction) ? item.direction : item.direction.split(',').map(t => t.trim())) : [],

                purpose: item.purpose,
                nri: item.nri === 'Yes' || item.nri === true,
                funding: item.funding,
                timeline: item.timeline,
                furnishing: item.furnishing,
                transactionType: item.transactionType,

                team: item.team ? (Array.isArray(item.team) ? item.team : item.team.split(',').map(t => t.trim())) : [],
                visibleTo: item.visibleTo || 'Everyone',
                notes: item.notes || item.remarks,
                tags: item.tags ? (Array.isArray(item.tags) ? item.tags : item.tags.split(',').map(t => t.trim())) : [],
            };

            // Inject "Import" tag
            if (!leadEntry.tags.includes('Import')) {
                leadEntry.tags.push('Import');
            }

            // Resolve Lookups
            leadEntry.requirement = await resolveLookup('Requirement', item.requirement || 'Buy');
            leadEntry.source = await resolveLookup('Source', item.source || 'Direct');
            leadEntry.status = await resolveLookup('Status', item.status || 'Active');
            leadEntry.location = await resolveLookup('Location', item.location || leadEntry.locArea);
            leadEntry.budget = await resolveLookup('Budget', item.budget);

            // Resolve Owner
            leadEntry.owner = await resolveUser(item.owner);

            restructuredData.push(leadEntry);
        }

        await Lead.insertMany(restructuredData, { ordered: false });
        res.status(200).json({
            success: true,
            message: `Successfully imported ${restructuredData.length} leads.`,
            successCount: restructuredData.length,
            errorCount: 0,
            errors: []
        });
    } catch (error) {
        if (error.writeErrors) {
            const successCount = (req.body.data?.length || 0) - error.writeErrors.length;
            const errorDetails = error.writeErrors.map(e => ({
                row: e.index + 1,
                name: (restructuredData[e.index]?.firstName || 'Unknown') + " " + (restructuredData[e.index]?.lastName || ""),
                reason: e.errmsg?.includes('duplicate key') ? 'Duplicate mobile or email' : e.errmsg
            }));

            return res.status(200).json({
                success: true,
                message: `Imported ${successCount} leads. ${errorDetails.length} failed.`,
                successCount,
                errorCount: errorDetails.length,
                errors: errorDetails
            });
        }
        if (error.name === 'ValidationError') {
            const errorDetails = Object.values(error.errors).map(err => ({
                row: 'N/A',
                name: 'Validation Error',
                reason: err.message
            }));
            return res.status(200).json({
                success: true,
                message: `Import failed: ${error.message}`,
                successCount: 0,
                errorCount: errorDetails.length,
                errors: errorDetails
            });
        }
        console.error("[ERROR] importLeads failed:", error);
        next(error);
    }
};

export const checkDuplicatesImport = async (req, res, next) => {
    try {
        const { mobiles } = req.body;
        const duplicates = await Lead.find({ mobile: { $in: mobiles } }).lean();
        res.status(200).json({ success: true, duplicates: duplicates.map(d => d.mobile) });
    } catch (error) {
        next(error);
    }
};
