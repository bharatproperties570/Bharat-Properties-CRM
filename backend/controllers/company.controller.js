import mongoose from "mongoose";
import Company from "../models/Company.js";
import { paginate } from "../utils/pagination.js";
import { createCompanySchema, updateCompanySchema } from "../validations/company.validation.js";

const populateFields = [
    { path: 'companyType', select: 'lookup_value' },
    { path: 'industry', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'subSource', select: 'lookup_value' },
    { path: 'owner', select: 'name email' },
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
    { path: 'employees', select: 'name surname phones emails' }
];

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
        const { page = 1, limit = 10, search = "" } = req.query;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } },
                    { gstNumber: { $regex: search, $options: "i" } },
                    { "phones.phoneNumber": { $regex: search, $options: "i" } },
                    { "emails.address": { $regex: search, $options: "i" } }
                ]
            };
        }

        const results = await paginate(Company, query, page, limit, { createdAt: -1 }, populateFields);

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("Error in getCompanies:", error);
        next(error);
    }
};

export const getCompany = async (req, res, next) => {
    try {
        const company = await Company.findById(req.params.id).populate(populateFields);
        if (!company) return res.status(404).json({ success: false, error: "Company not found" });
        res.json({ success: true, data: company });
    } catch (error) {
        next(error);
    }
};

export const addCompany = async (req, res, next) => {
    try {
        const { error } = createCompanySchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const sanitized = sanitizeData(req.body);
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

        const sanitized = sanitizeData(req.body);
        const company = await Company.findByIdAndUpdate(req.params.id, sanitized, { new: true });
        if (!company) return res.status(404).json({ success: false, error: "Company not found" });
        res.json({ success: true, data: company });
    } catch (error) {
        next(error);
    }
};

export const deleteCompany = async (req, res, next) => {
    try {
        const company = await Company.findByIdAndDelete(req.params.id);
        if (!company) return res.status(404).json({ success: false, error: "Company not found" });
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
export const importCompanies = async (req, res, next) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data provided" });
        }

        const restructuredData = [];
        const errorDetails = [];

        data.forEach((item, index) => {
            try {
                if (!item.name || !item.name.trim()) {
                    errorDetails.push({
                        row: index + 1,
                        name: 'N/A',
                        reason: "Company Name is required"
                    });
                    return;
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
                            hNo: item.reg_hNo,
                            street: item.reg_street,
                            city: item.reg_city,
                            state: item.reg_state,
                            country: item.reg_country,
                            pinCode: item.reg_pinCode
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
        });

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
