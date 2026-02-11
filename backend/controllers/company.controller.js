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
