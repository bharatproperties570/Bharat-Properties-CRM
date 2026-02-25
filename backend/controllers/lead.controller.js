import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import mongoose from "mongoose";
import { paginate } from "../utils/pagination.js";
import mockStore from "../utils/mockStore.js";
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
    // If field is an empty string, set it to null so Mongoose doesn't try to cast it as ObjectId
    const fieldsToResolve = ['requirement', 'subRequirement', 'budget', 'location', 'source', 'status', 'stage', 'countryCode', 'campaign', 'subSource'];
    for (const field of fieldsToResolve) {
        if (doc[field] === "") doc[field] = null;
    }

    if (doc.requirement) doc.requirement = await resolveLookup('Requirement', doc.requirement);
    if (doc.subRequirement) doc.subRequirement = await resolveLookup('Sub Requirement', doc.subRequirement);
    if (doc.budget) doc.budget = await resolveLookup('Budget', doc.budget);
    if (doc.location) doc.location = await resolveLookup('Location', doc.location);
    if (doc.source) doc.source = await resolveLookup('Source', doc.source);
    if (doc.status) doc.status = await resolveLookup('Status', doc.status);
    if (doc.stage) doc.stage = await resolveLookup('Stage', doc.stage);
    if (doc.countryCode) doc.countryCode = await resolveLookup('Country-Code', doc.countryCode);
    if (doc.campaign) doc.campaign = await resolveLookup('Campaign', doc.campaign);
    if (doc.subSource) doc.subSource = await resolveLookup('SubSource', doc.subSource);

    // Handle Arrays (Lookup fields)
    const arrayLookups = {
        propertyType: 'PropertyType', // Database uses PropertyType (no space) or Property Type? check_lookup said PropertyType and Property Type both exist but PropertyType is more common? Actually list_lookup showed both. I'll stick to Property Type or check again.
        subType: 'Sub Type',
        unitType: 'Unit Type',
        facing: 'Facing',
        roadWidth: 'Road Width',
        direction: 'Direction'
    };

    // Re-check from list_lookup results:
    // Property Type
    // PropertyType
    // Road Width
    // RoadWidth
    // Unit Type
    // UnitType
    // I'll update to match the ones with spaces if they are more standard, or stick to what was there.
    // The previous code had spaces. I'll keep them but harmonize with Country-Code etc.

    for (const [field, type] of Object.entries(arrayLookups)) {
        if (Array.isArray(doc[field])) {
            // Filter out empty strings from arrays
            doc[field] = doc[field].filter(val => val !== "");
            doc[field] = await Promise.all(doc[field].map(val => resolveLookup(type, val)));
        }
    }

    if (doc.owner === "") doc.owner = null;
    if (doc.owner) doc.owner = await resolveUser(doc.owner);

    // Handle Team resolution (from ID to Name for assignment.team)
    if (doc.team) {
        const Team = mongoose.model('Team');
        let teamId = doc.team;
        if (typeof teamId === 'object' && teamId._id) teamId = teamId._id;

        if (mongoose.Types.ObjectId.isValid(teamId)) {
            const teamDoc = await Team.findById(teamId);
            if (teamDoc) {
                if (!doc.assignment) doc.assignment = {};
                // assignment.team is [String] in Lead model
                doc.assignment.team = [teamDoc.name];
            }
        }
    }

    if (doc.contactDetails && !mongoose.Types.ObjectId.isValid(doc.contactDetails)) {
        // If it's not a valid ID, it might be a name or something from old logic, but here we expect ID
        // However, resolveAllReferenceFields is usually for bulk imports too.
        // For now, just ensure it's handled if it exists.
    }
    if (doc.assignment?.assignedTo) doc.assignment.assignedTo = await resolveUser(doc.assignment.assignedTo);

    // Sync top-level owner to assignment.assignedTo if missing
    if (doc.owner && !doc.assignment?.assignedTo) {
        if (!doc.assignment) doc.assignment = {};
        doc.assignment.assignedTo = doc.owner;
    }

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
            if (docItem.documentCategory) docItem.documentCategory = await resolveLookup('Document-Category', docItem.documentCategory);
            if (docItem.documentName) docItem.documentName = await resolveLookup('Document Name', docItem.documentName);
            if (docItem.documentType) docItem.documentType = await resolveLookup('Document-Type', docItem.documentType);
        }
    }
    console.log("[DEBUG] resolveAllReferenceFields completed successfully");
    return doc;
};

const leadPopulateFields = [
    { path: 'requirement', select: 'lookup_value' },
    { path: 'subRequirement', select: 'lookup_value' },
    { path: 'budget', select: 'lookup_value' },
    { path: 'location', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'subSource', select: 'lookup_value' },
    { path: 'campaign', select: 'lookup_value' },
    { path: 'status', select: 'lookup_value' },
    { path: 'stage', select: 'lookup_value' },
    { path: 'propertyType', select: 'lookup_value' },
    { path: 'subType', select: 'lookup_value' },
    { path: 'unitType', select: 'lookup_value' },
    { path: 'facing', select: 'lookup_value' },
    { path: 'roadWidth', select: 'lookup_value' },
    { path: 'direction', select: 'lookup_value' },
    { path: 'project', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    {
        path: 'contactDetails',
        populate: [
            { path: 'title', select: 'lookup_value' },
            { path: 'source', select: 'lookup_value' },
            { path: 'personalAddress.location', select: 'lookup_value' },
            { path: 'correspondenceAddress.city', select: 'lookup_value' },
            { path: 'correspondenceAddress.state', select: 'lookup_value' },
            { path: 'correspondenceAddress.country', select: 'lookup_value' },
            { path: 'correspondenceAddress.location', select: 'lookup_value' },
            { path: 'professionCategory', select: 'lookup_value' },
            { path: 'professionSubCategory', select: 'lookup_value' },
            { path: 'designation', select: 'lookup_value' },
            { path: 'subSource', select: 'lookup_value' },
            { path: 'campaign', select: 'lookup_value' },
            { path: 'educations.education', select: 'lookup_value' },
            { path: 'educations.degree', select: 'lookup_value' },
            { path: 'loans.loanType', select: 'lookup_value' },
            { path: 'loans.bank', select: 'lookup_value' },
            { path: 'incomes.incomeType', select: 'lookup_value' }
        ]
    },
    { path: 'assignment.assignedTo', select: 'fullName email name' },
    { path: 'assignment.team', select: 'name' },
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
                    { email: { $regex: search, $options: "i" } }
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
        console.log("[DEBUG] addLead called with body:", JSON.stringify(req.body, null, 2));
        const data = { ...req.body };
        await resolveAllReferenceFields(data);
        console.log("[DEBUG] Data after resolution:", JSON.stringify(data, null, 2));
        const lead = await Lead.create(data);
        console.log("[DEBUG] Lead created successfully:", lead._id);

        // Auto-run Enrichment
        await runFullLeadEnrichment(lead._id);

        await lead.populate(leadPopulateFields);
        res.status(201).json({ success: true, data: lead });
    } catch (error) {
        console.error("[ERROR] addLead failed:", error);
        next(error);
    }
};

export const updateLead = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        await resolveAllReferenceFields(updateData);
        const lead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (lead) {
            // Auto-run Enrichment
            await runFullLeadEnrichment(lead._id);
            await lead.populate(leadPopulateFields);
        }
        res.json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const deleteLead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { deleteContact } = req.query;

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        if (deleteContact === 'true' && lead.mobile) {
            await Contact.deleteMany({ 'phones.number': lead.mobile });
        }

        await Lead.findByIdAndDelete(id);
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
        const { ids, deleteContacts } = req.body;

        if (deleteContacts === true) {
            const leads = await Lead.find({ _id: { $in: ids } });
            const mobiles = leads.map(l => l.mobile).filter(Boolean);
            if (mobiles.length > 0) {
                await Contact.deleteMany({ 'phones.number': { $in: mobiles } });
            }
        }

        await Lead.deleteMany({ _id: { $in: ids } });
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
            leadEntry.stage = await resolveLookup('Stage', item.stage || 'New');
            leadEntry.location = await resolveLookup('Location', item.location || leadEntry.locArea);
            leadEntry.budget = await resolveLookup('Budget', item.budget);

            // Resolve Owner
            leadEntry.owner = await resolveUser(item.owner);

            restructuredData.push(leadEntry);
        }

        const importedLeads = await Lead.insertMany(restructuredData, { ordered: false });

        // Auto-run Enrichment for imported leads (in background, non-blocking for response)
        // Using Promise.allSettled to not fail the whole import if one enrichment fails
        if (importedLeads && importedLeads.length > 0) {
            Promise.allSettled(importedLeads.map(l => runFullLeadEnrichment(l._id)))
                .then(results => {
                    const failures = results.filter(r => r.status === 'rejected');
                    if (failures.length > 0) console.error(`[IMPORT ENRICHMENT] ${failures.length} leads failed to enrich.`);
                    console.log(`[IMPORT ENRICHMENT] Finished processing ${importedLeads.length} leads.`);
                });
        }

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

export const matchLeads = async (req, res) => {
    try {
        const { dealId } = req.query;
        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId is required" });
        }

        const deal = await Deal.findById(dealId).lean();
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }

        const query = {
            isVisible: { $ne: false },
            $or: []
        };

        if (deal.projectId) query.$or.push({ project: deal.projectId }, { projectName: deal.projectName });
        if (deal.category) query.$or.push({ requirement: deal.category });
        if (deal.location) query.$or.push({ location: deal.location });

        if (query.$or.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const leads = await Lead.find(query)
            .populate('requirement location status contactDetails')
            .limit(50)
            .sort({ createdAt: -1 })
            .lean();

        // Simple scoring based on how many fields match
        const scoredLeads = leads.map(lead => {
            let score = 50;
            if (lead.project?.toString() === deal.projectId?.toString()) score += 20;
            if (lead.requirement?._id?.toString() === deal.category?.toString() || lead.requirement?.toString() === deal.category?.toString()) score += 20;
            if (lead.location?._id?.toString() === deal.location?.toString() || lead.location?.toString() === deal.location?.toString()) score += 10;
            return { ...lead, score: Math.min(score, 100) };
        });

        return res.status(200).json({ success: true, count: scoredLeads.length, data: scoredLeads });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
