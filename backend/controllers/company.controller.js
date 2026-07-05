import mongoose from "mongoose";
import Company from "../models/Company.js";
import User from "../models/User.js";
import Lookup from "../models/Lookup.js";
import Contact from "../models/Contact.js";
import Inventory from "../models/Inventory.js";
import Deal from "../models/Deal.js";
import { paginate } from "../utils/pagination.js";
import { createCompanySchema, updateCompanySchema } from "../validations/company.validation.js";
import { getVisibilityFilter } from "../utils/visibility.js";
import AddressParsingService from '../services/AddressParsingService.js';


const populateFields = [
    { path: 'companyType', select: 'lookup_value' },
    { path: 'industry', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'subSource', select: 'lookup_value' },
    { path: 'team', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    { path: 'addresses.registeredOffice.country', select: 'lookup_value' },
    { path: 'addresses.registeredOffice.state', select: 'lookup_value' },
    { path: 'addresses.registeredOffice.city', select: 'lookup_value' },
    { path: 'addresses.registeredOffice.tehsil', select: 'lookup_value' },
    { path: 'addresses.registeredOffice.postOffice', select: 'lookup_value' },
    { path: 'addresses.registeredOffice.location', select: 'lookup_value' },
    { path: 'addresses.branchOffice.country', select: 'lookup_value' },
    { path: 'addresses.branchOffice.state', select: 'lookup_value' },
    { path: 'addresses.branchOffice.city', select: 'lookup_value' },
    { path: 'addresses.branchOffice.tehsil', select: 'lookup_value' },
    { path: 'addresses.branchOffice.postOffice', select: 'lookup_value' },
    { path: 'addresses.branchOffice.location', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.country', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.state', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.city', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.tehsil', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.postOffice', select: 'lookup_value' },
    { path: 'addresses.corporateOffice.location', select: 'lookup_value' },
    { path: 'addresses.headOffice.country', select: 'lookup_value' },
    { path: 'addresses.headOffice.state', select: 'lookup_value' },
    { path: 'addresses.headOffice.city', select: 'lookup_value' },
    { path: 'addresses.headOffice.tehsil', select: 'lookup_value' },
    { path: 'addresses.headOffice.postOffice', select: 'lookup_value' },
    { path: 'addresses.headOffice.location', select: 'lookup_value' },
    { path: 'addresses.siteOffice.country', select: 'lookup_value' },
    { path: 'addresses.siteOffice.state', select: 'lookup_value' },
    { path: 'addresses.siteOffice.city', select: 'lookup_value' },
    { path: 'addresses.siteOffice.tehsil', select: 'lookup_value' },
    { path: 'addresses.siteOffice.postOffice', select: 'lookup_value' },
    { path: 'addresses.siteOffice.location', select: 'lookup_value' },
    { path: 'employees', select: 'name surname fullName phones emails designation' }
];

// Helper to resolve string lookups or populated objects to ObjectIds
const resolveLookup = async (type, value) => {
    if (!value) return null;

    // If already a valid ObjectId (as string or object)
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    if (typeof value === 'object' && value._id && mongoose.Types.ObjectId.isValid(value._id)) return value._id;

    // If it's a value/name string, find or create
    const lookupValue = typeof value === 'object' ? (value.lookup_value || value.name) : value;
    if (!lookupValue || lookupValue === 'N/A') return null;

    const regexMatch = new RegExp(`^${lookupValue}$`, 'i');
    let lookup = await Lookup.findOne({
        lookup_type: type,
        $or: [
            { lookup_value: { $regex: regexMatch } },
            { "metadata.aliases": { $regex: regexMatch } }
        ]
    });

    if (!lookup) {
        console.log(`[NEW LOOKUP] Creating ${type}: ${lookupValue}`);
        lookup = await Lookup.create({
            lookup_type: type,
            lookup_value: lookupValue,
            status: 'Active'
        });
    }
    return lookup._id;
};

// Helper to resolve User by ID, name or email
const resolveUser = async (idOrName) => {
    if (!idOrName) return null;
    if (mongoose.Types.ObjectId.isValid(idOrName)) return idOrName;
    if (typeof idOrName === 'object' && idOrName._id && mongoose.Types.ObjectId.isValid(idOrName._id)) return idOrName._id;

    const identifier = typeof idOrName === 'object' ? (idOrName.fullName || idOrName.name || idOrName.email) : idOrName;
    if (!identifier) return null;

    const user = await User.findOne({
        $or: [
            { fullName: identifier },
            { name: identifier },
            { email: identifier },
            { username: identifier }
        ]
    });
    return user ? user._id : null;
};

// Exhaustive resolution for ALL reference fields
const resolveAllReferenceFields = async (doc) => {
    if (!doc) return;

    if (doc.companyType) doc.companyType = await resolveLookup('Company Type', doc.companyType);
    if (doc.industry) doc.industry = await resolveLookup('Industry', doc.industry);
    if (doc.source) doc.source = await resolveLookup('Source', doc.source);
    if (doc.subSource) doc.subSource = await resolveLookup('SubSource', doc.subSource);
    if (doc.owner) doc.owner = await resolveUser(doc.owner);

    const resolveAddress = async (addr) => {
        if (!addr) return;
        if (addr.country) addr.country = await resolveLookup('Country', addr.country);
        if (addr.state) addr.state = await resolveLookup('State', addr.state);
        if (addr.city) addr.city = await resolveLookup('City', addr.city);
        if (addr.tehsil) addr.tehsil = await resolveLookup('Tehsil', addr.tehsil);
        if (addr.postOffice) addr.postOffice = await resolveLookup('Post Office', addr.postOffice);
        if (addr.location) addr.location = await resolveLookup('Location', addr.location);
    };

    if (doc.addresses) {
        await resolveAddress(doc.addresses.registeredOffice);
        await resolveAddress(doc.addresses.corporateOffice);
        await resolveAddress(doc.addresses.headOffice);
        if (Array.isArray(doc.addresses.branchOffice)) {
            for (const addr of doc.addresses.branchOffice) await resolveAddress(addr);
        }
        if (Array.isArray(doc.addresses.siteOffice)) {
            for (const addr of doc.addresses.siteOffice) await resolveAddress(addr);
        }
    }
};

const sanitizeData = (data) => {
    const isValidId = (id) => id && mongoose.Types.ObjectId.isValid(id);

    // Recursive sanitizer for lookup fields
    const sanitizeObj = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        for (const key in obj) {
            if (['companyType', 'industry', 'source', 'subSource', 'owner', 'country', 'state', 'city', 'tehsil', 'postOffice', 'location'].includes(key)) {
                if (!isValidId(obj[key])) obj[key] = null;
            } else if (typeof obj[key] === 'object') {
                sanitizeObj(obj[key]);
            }
        }
        return obj;
    };

    return sanitizeObj(data);
};

export const getCompanies = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = "", sortBy, sortOrder, view, ...dynamicFilters } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 🚀 COMPACT VIEW FLAG: Mobile list view — skip heavy address populations
        const isCompactView = view === 'compact';

        // 🚀 SENIOR OPTIMIZATION: Compact populate (5 fields) vs Full populate (51 paths)
        // Mobile list card only shows: name, phone, industry badge, relationship color.
        // The 46 address lookup paths are only needed on the Detail page.
        const listPopulateFields = isCompactView ? [
            { path: 'companyType', select: 'lookup_value' },
            { path: 'industry', select: 'lookup_value' },
            { path: 'relationshipType', select: 'lookup_value' },
            { path: 'owner', select: 'fullName name' },
            { path: 'team', select: 'name' }
        ] : populateFields;

        let query = { ...visibilityFilter };

        // 🛡️ [SENIOR FIX] Dynamically apply all un-extracted filter keys
        for (const [key, value] of Object.entries(dynamicFilters)) {
            if (value && value !== "" && value !== "undefined") {
                if (Array.isArray(value)) {
                    query[key] = { $in: value };
                } else if (mongoose.Types.ObjectId.isValid(value)) {
                    query[key] = value;
                } else {
                    query[key] = value;
                }
            }
        }
        if (search) {
            query = {
                ...query,
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } },
                    { gstNumber: { $regex: search, $options: "i" } },
                    { "phones.phoneNumber": { $regex: search, $options: "i" } },
                    { "emails.address": { $regex: search, $options: "i" } }
                ]
            };
        }

        // ─── DYNAMIC SORTING (Senior Professional Optimization) ───
        const finalSortBy = sortBy || 'updatedAt';
        const finalSortOrder = parseInt(sortOrder) || -1;
        const sortOption = { [finalSortBy]: finalSortOrder };

        // 🚀 SENIOR OPTIMIZATION: Run pagination + industry stats concurrently.
        // Fix N+1 anti-pattern: Replace N separate countDocuments() calls
        // with a single $group aggregation — O(N) → O(1) DB round-trips.
        const [results, industryStatsAgg] = await Promise.all([
            paginate(Company, query, page, limit, sortOption, listPopulateFields),
            Company.aggregate([
                { $match: query },
                { $group: { _id: '$industry', count: { $sum: 1 } } }
            ])
        ]);

        // Resolve industry ObjectIds to names in a single batch lookup
        const industryIds = industryStatsAgg
            .map(s => s._id)
            .filter(id => id && mongoose.Types.ObjectId.isValid(id));
        const industryDocs = industryIds.length > 0
            ? await Lookup.find({ _id: { $in: industryIds } }).select('lookup_value').lean()
            : [];
        const industryNameMap = new Map(industryDocs.map(d => [d._id.toString(), d.lookup_value]));

        const industryCounts = industryStatsAgg.map(s => ({
            name: s._id
                ? (industryNameMap.get(String(s._id)) || String(s._id))
                : 'Unknown',
            count: s.count
        }));

        res.status(200).json({
            success: true,
            industryStats: industryCounts,
            ...results
        });
    } catch (error) {
        console.error("Error in getCompanies:", error);
        next(error);
    }
};

export const getCompany = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const company = await Company.findOne({ _id: req.params.id, ...visibilityFilter }).populate(populateFields);
        if (!company) return res.status(404).json({ success: false, error: "Company not found or access denied" });
        res.json({ success: true, data: company });
    } catch (error) {
        next(error);
    }
};

export const addCompany = async (req, res, next) => {
    try {
        const { error } = createCompanySchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const data = { ...req.body };
        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                data.teams = req.user.teams.map(t => t._id || t);
            }
        }
        await resolveAllReferenceFields(data);

        const sanitized = sanitizeData(data);
        const company = await Company.create(sanitized);
        res.status(201).json({ success: true, data: company });
    } catch (error) {
        next(error);
    }
};

export const updateCompany = async (req, res, next) => {
    try {
        const { error } = updateCompanySchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const data = { ...req.body };
        await resolveAllReferenceFields(data);

        const sanitized = sanitizeData(data);
        const visibilityFilter = await getVisibilityFilter(req.user);
        const company = await Company.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, sanitized, { new: true });
        if (!company) return res.status(404).json({ success: false, error: "Company not found or access denied" });
        res.json({ success: true, data: company });
    } catch (error) {
        next(error);
    }
};

export const deleteCompany = async (req, res, next) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const company = await Company.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });
        if (!company) return res.status(404).json({ success: false, error: "Company not found or access denied" });
        res.json({ success: true, message: "Company deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const bulkDeleteCompanies = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, message: "Invalid IDs provided" });
        }

        const result = await Company.deleteMany({ _id: { $in: ids } });
        res.status(200).json({
            success: true,
            message: `Successfully deleted ${result.deletedCount} companies.`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Bulk import companies
 * @route   POST /companies/import
 * @access  Private
 */
export const importCompanies = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data provided" });
        }

        const restructuredData = [];
        const errorDetails = [];

        for (let index = 0; index < data.length; index++) {
            const item = data[index];
            try {
                if (!item.name || !item.name.trim()) {
                    errorDetails.push({
                        row: index + 1,
                        name: 'N/A',
                        reason: "Company Name is required"
                    });
                    continue;
                }

                let reg_hNo = item.reg_hNo || '';
                let reg_street = item.reg_street || '';
                let reg_city = item.reg_city || '';
                let reg_tehsil = item.reg_tehsil || '';
                let reg_state = item.reg_state || '';
                let reg_country = item.reg_country || 'India';
                let reg_pinCode = item.reg_pinCode || item.reg_pincode || '';

                let fullAddress = item.address || item.fullAddress || item['Address'] || item['Full Address'] || item.reg_address || item.registered_address || '';
                
                // Fallback: If no explicit fullAddress is mapped, check if 'reg_street' contains the full address string
                if (!fullAddress && !reg_hNo && reg_street && AddressParsingService.shouldParse(reg_street)) {
                    fullAddress = reg_street;
                    reg_street = '';
                }

                if ((!reg_hNo || !reg_street) && fullAddress && String(fullAddress).trim()) {
                    try {
                        const parsed = await AddressParsingService.parseAddress(String(fullAddress).trim());
                        reg_hNo = parsed.houseNo || reg_hNo;
                        reg_street = parsed.street || reg_street;
                        reg_city = parsed.city || reg_city;
                        reg_tehsil = parsed.tehsil || reg_tehsil;
                        reg_state = parsed.state || reg_state;
                        reg_country = parsed.country || reg_country;
                        reg_pinCode = parsed.pincode || reg_pinCode;
                    } catch (parseErr) {
                        console.error("[COMPANY_IMPORT] Address parse fallback failed:", parseErr.message);
                    }
                }

                const rawCompany = {
                    name: item.name.trim(),
                    phones: item.phone ? [{ phoneNumber: item.phone, type: 'Work' }] : [],
                    emails: item.email ? [{ address: item.email, type: 'Work' }] : [],
                    companyType: item.type,
                    industry: item.industry,
                    description: item.description,
                    gstNumber: item.gstNumber,
                    campaign: item.campaign,
                    source: item.source,
                    subSource: item.subSource,
                    team: item.team || 'Sales',
                    owner: item.owner,
                    visibleTo: item.visibleTo || 'Everyone',
                    addresses: {
                        registeredOffice: {
                            hNo: reg_hNo,
                            street: reg_street,
                            city: reg_city,
                            tehsil: reg_tehsil,
                            state: reg_state,
                            country: reg_country,
                            pinCode: reg_pinCode
                        }
                    }
                };

                restructuredData.push(sanitizeData(rawCompany));
            } catch (err) {
                errorDetails.push({
                    row: index + 1,
                    name: item.name || 'Unknown',
                    reason: err.message || "Data processing error"
                });
            }
        }

        let successCount = 0;
        let failedCount = errorDetails.length;

        if (restructuredData.length > 0) {
            try {
                const result = await Company.insertMany(restructuredData, { ordered: false, rawResult: true });
                successCount = result.insertedCount || 0;
            } catch (error) {
                if (error.writeErrors) {
                    successCount = (restructuredData.length) - error.writeErrors.length;
                    failedCount += error.writeErrors.length;
                    error.writeErrors.forEach(e => {
                        errorDetails.push({
                            row: (e.index !== undefined) ? e.index + 1 : 'N/A',
                            name: (restructuredData[e.index]?.name || 'Unknown'),
                            reason: e.errmsg?.includes('duplicate key') ? 'Duplicate company name' : (e.errmsg || 'Check data formats')
                        });
                    });
                } else if (error.name === 'ValidationError') {
                    failedCount += Object.keys(error.errors).length;
                    Object.values(error.errors).forEach(err => {
                        errorDetails.push({
                            row: 'Validation',
                            name: 'Bulk Validation',
                            reason: err.message
                        });
                    });
                } else {
                    throw error;
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Processed import. Success: ${successCount}, Failed: ${failedCount}`,
            successCount,
            errorCount: failedCount,
            errors: errorDetails
        });
    } catch (error) {
        console.error("Critical Import error (Companies):", error);
        res.status(500).json({
            success: false,
            message: "An internal server error occurred during company import.",
            errorCount: 1,
            errors: [{
                row: 'System',
                name: 'Critical Error',
                reason: error.message || "Something went wrong while processing the CSV data."
            }]
        });
    }
};

/**
 * @desc    Check for duplicate companies by name
 * @route   POST /companies/check-duplicates
 * @access  Private
 */
export const checkDuplicatesImport = async (req, res, next) => {
    try {
        const { names } = req.body;
        if (!names || !Array.isArray(names)) {
            return res.status(400).json({ success: false, message: "Invalid company names provided" });
        }

        const duplicates = await Company.find({ name: { $in: names } }, 'name').lean();
        const existingNames = duplicates.map(d => d.name);
        const matchedNames = names.filter(n => existingNames.includes(n));
        const uniqueMatched = [...new Set(matchedNames)];

        res.status(200).json({
            success: true,
            duplicates: uniqueMatched,
            details: duplicates.map(d => ({
                id: d._id,
                name: d.name
            }))
        });
    } catch (error) {
        next(error);
    }
};

export const getCompanyAssociatedAssets = async (req, res, next) => {
    try {
        const companyId = req.params.id;
        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // Fetch company and its employees
        const company = await Company.findOne({ _id: companyId, ...visibilityFilter }).select('employees name');
        
        if (!company) {
            return res.status(404).json({ success: false, error: "Company not found or access denied" });
        }

        // Resolve Lookups for 'SELF EMPLOYED' and 'Real Estate Agent'
        const selfEmployedLookup = await Lookup.findOne({ lookup_type: 'ProfessionCategory', lookup_value: { $regex: /^SELF EMPLOYED$/i } });
        const realEstateAgentLookup = await Lookup.findOne({ lookup_type: 'ProfessionSubCategory', lookup_value: { $regex: /^Real Estate Agent$/i } });
        
        const conditions = [
            { professionCategory: { $regex: /^SELF EMPLOYED$/i } },
            { professionSubCategory: { $regex: /^Real Estate Agent$/i } }
        ];
        
        if (selfEmployedLookup) conditions.push({ professionCategory: selfEmployedLookup._id });
        if (realEstateAgentLookup) conditions.push({ professionSubCategory: realEstateAgentLookup._id });

        // Find employees that match the professional criteria
        // Also include contacts that have the company's name as a string
        const eligibleEmployees = await Contact.find({
            $and: [
                {
                    $or: [
                        { _id: { $in: company.employees || [] } },
                        { company: company.name }
                    ]
                },
                { $or: conditions }
            ]
        }).select('_id');

        const eligibleContactIds = eligibleEmployees.map(e => e._id);

        if (eligibleContactIds.length === 0) {
            return res.json({ success: true, data: { properties: [], deals: [] } });
        }

        // Fetch Inventory where eligible contacts are owners or associates
        const properties = await Inventory.find({
            $or: [
                { owners: { $in: eligibleContactIds } },
                { 'associates.contact': { $in: eligibleContactIds } }
            ]
        }).populate([
            { path: 'projectName', select: 'lookup_value name' },
            { path: 'status', select: 'lookup_value' },
            { path: 'unitType', select: 'lookup_value' }
        ]).lean();

        // Fetch all Deals where eligible contacts are involved
        const deals = await Deal.find({
            $or: [
                { owner: { $in: eligibleContactIds } },
                { associatedContact: { $in: eligibleContactIds } },
                { 'partyStructure.owner': { $in: eligibleContactIds } },
                { 'partyStructure.buyer': { $in: eligibleContactIds } },
                { 'partyStructure.channelPartner': { $in: eligibleContactIds } }
            ]
        }).populate([
            { path: 'projectId', select: 'name' }
        ]).lean();

        res.json({ success: true, data: { properties, deals } });
    } catch (error) {
        console.error("Error fetching company associated assets:", error);
        next(error);
    }
};
