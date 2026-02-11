import mongoose from "mongoose";
import Contact from "../models/Contact.js";
import Lookup from "../models/Lookup.js"; // Ensure Lookup model is registered
import User from "../models/User.js"; // Ensure User model is registered
import { paginate } from "../utils/pagination.js";
import mockStore from "../utils/mockStore.js";

/**
 * @desc    Get all contacts with pagination and search
 * @route   GET /contacts
 * @access  Private
 */
export const getContacts = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = "" } = req.query;

        if (process.env.MOCK_MODE === 'true') {
            const results = mockStore.getContacts({}, Number(page), Number(limit));
            return res.status(200).json({ success: true, ...results });
        }

        const query = search
            ? {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { surname: { $regex: search, $options: "i" } },
                    { "phones.number": { $regex: search, $options: "i" } },
                    { "emails.address": { $regex: search, $options: "i" } },
                    { company: { $regex: search, $options: "i" } }
                ]
            }
            : {};

        const populateFields = [
            { path: 'title', select: 'lookup_value' },
            { path: 'countryCode', select: 'lookup_value' },
            { path: 'professionCategory', select: 'lookup_value' },
            { path: 'professionSubCategory', select: 'lookup_value' },
            { path: 'designation', select: 'lookup_value' },
            { path: 'source', select: 'lookup_value' },
            { path: 'subSource', select: 'lookup_value' },
            { path: 'owner', select: 'firstName lastName email' },
            { path: 'personalAddress.country', select: 'lookup_value' },
            { path: 'personalAddress.state', select: 'lookup_value' },
            { path: 'personalAddress.city', select: 'lookup_value' },
            { path: 'personalAddress.tehsil', select: 'lookup_value' },
            { path: 'personalAddress.postOffice', select: 'lookup_value' },
            { path: 'personalAddress.location', select: 'lookup_value' },
            { path: 'correspondenceAddress.country', select: 'lookup_value' },
            { path: 'correspondenceAddress.state', select: 'lookup_value' },
            { path: 'correspondenceAddress.city', select: 'lookup_value' },
            { path: 'correspondenceAddress.tehsil', select: 'lookup_value' },
            { path: 'correspondenceAddress.postOffice', select: 'lookup_value' },
            { path: 'correspondenceAddress.location', select: 'lookup_value' },
            { path: 'educations.education', select: 'lookup_value' },
            { path: 'educations.degree', select: 'lookup_value' },
            { path: 'loans.loanType', select: 'lookup_value' },
            { path: 'loans.bank', select: 'lookup_value' },
            { path: 'socialMedia.platform', select: 'lookup_value' },
            { path: 'incomes.incomeType', select: 'lookup_value' },
            { path: 'documents.documentName', select: 'lookup_value' },
            { path: 'documents.documentType', select: 'lookup_value' }
        ];
        const results = await paginate(Contact, query, page, limit, { createdAt: -1 }, populateFields);


        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("Error in getContacts:", error);
        next(error);
    }
};

/**
 * @desc    Create a new contact
 * @route   POST /contacts
 * @access  Private
 */
import { createContactSchema, updateContactSchema } from "../validations/contact.validation.js";

// ... [existing imports]

// ... [getContacts function]

/**
 * Helper to convert empty strings to null for reference fields to avoid CastError during population
 */
/**
 * Helper to convert invalid values to null for reference fields to avoid CastError during population
 */
const sanitizeData = (data) => {
    const isValidId = (id) => id && mongoose.Types.ObjectId.isValid(id);

    const refFields = [
        'title', 'countryCode', 'professionCategory', 'professionSubCategory',
        'designation', 'source', 'subSource', 'owner'
    ];

    const sanitized = { ...data };

    // Sanitize top-level ref fields
    refFields.forEach(field => {
        if (sanitized[field] !== undefined) {
            if (!isValidId(sanitized[field])) {
                sanitized[field] = null;
            }
        }
    });

    // Sanitize nested address ref fields
    const addressFields = ['country', 'state', 'city', 'tehsil', 'postOffice', 'location'];

    if (sanitized.personalAddress) {
        addressFields.forEach(f => {
            if (!isValidId(sanitized.personalAddress[f])) {
                sanitized.personalAddress[f] = null;
            }
        });
    }
    if (sanitized.correspondenceAddress) {
        addressFields.forEach(f => {
            if (!isValidId(sanitized.correspondenceAddress[f])) {
                sanitized.correspondenceAddress[f] = null;
            }
        });
    }

    // Sanitize arrays of objects with ref fields
    const arrayCleanup = (arr, fields) => {
        if (!Array.isArray(arr)) return arr;
        return arr.map(item => {
            const cleanItem = { ...item };
            fields.forEach(f => {
                if (!isValidId(cleanItem[f])) {
                    cleanItem[f] = null;
                }
            });
            return cleanItem;
        });
    };

    if (sanitized.educations) {
        sanitized.educations = arrayCleanup(sanitized.educations, ['education', 'degree']);
    }
    if (sanitized.loans) {
        sanitized.loans = arrayCleanup(sanitized.loans, ['loanType', 'bank']);
    }
    if (sanitized.socialMedia) {
        sanitized.socialMedia = arrayCleanup(sanitized.socialMedia, ['platform']);
    }
    if (sanitized.incomes) {
        sanitized.incomes = arrayCleanup(sanitized.incomes, ['incomeType']);
    }
    if (sanitized.documents) {
        sanitized.documents = arrayCleanup(sanitized.documents, ['documentName', 'documentType']);
    }

    return sanitized;
};

/**
 * @desc    Create a new contact
 * @route   POST /contacts
 * @access  Private
 */
export const createContact = async (req, res, next) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            const contact = mockStore.addContact(req.body);
            return res.status(201).json({ success: true, data: contact });
        }

        // Joi Validation
        const { error, value } = createContactSchema.validate(req.body, { abortEarly: false });
        if (error) {
            console.log("Validation Error Details:", JSON.stringify(error.details, null, 2)); // DEBUG LOG
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: error.details.map(detail => detail.message)
            });
        }

        const sanitizedValue = sanitizeData(value);
        const contact = await Contact.create(sanitizedValue);

        res.status(201).json({
            success: true,
            data: contact
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Contact with this mobile already exists"
            });
        }
        next(error);
    }
};

/**
 * @desc    Get single contact
 * @route   GET /contacts/:id
 * @access  Private
 */
export const getContact = async (req, res, next) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            const contact = mockStore.contacts.find(c => c._id === req.params.id);
            if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });
            return res.status(200).json({ success: true, data: contact });
        }

        const populateFields = [
            { path: 'title', select: 'lookup_value' },
            { path: 'professionCategory', select: 'lookup_value' },
            { path: 'professionSubCategory', select: 'lookup_value' },
            { path: 'designation', select: 'lookup_value' },
            { path: 'source', select: 'lookup_value' },
            { path: 'subSource', select: 'lookup_value' },
            { path: 'owner', select: 'name email' },
            { path: 'personalAddress.country', select: 'lookup_value' },
            { path: 'personalAddress.state', select: 'lookup_value' },
            { path: 'personalAddress.city', select: 'lookup_value' },
            { path: 'personalAddress.tehsil', select: 'lookup_value' },
            { path: 'personalAddress.postOffice', select: 'lookup_value' },
            { path: 'personalAddress.location', select: 'lookup_value' },
            { path: 'correspondenceAddress.country', select: 'lookup_value' },
            { path: 'correspondenceAddress.state', select: 'lookup_value' },
            { path: 'correspondenceAddress.city', select: 'lookup_value' },
            { path: 'correspondenceAddress.tehsil', select: 'lookup_value' },
            { path: 'correspondenceAddress.postOffice', select: 'lookup_value' },
            { path: 'correspondenceAddress.location', select: 'lookup_value' },
            { path: 'educations.education', select: 'lookup_value' },
            { path: 'educations.degree', select: 'lookup_value' },
            { path: 'loans.loanType', select: 'lookup_value' },
            { path: 'loans.bank', select: 'lookup_value' },
            { path: 'socialMedia.platform', select: 'lookup_value' },
            { path: 'incomes.incomeType', select: 'lookup_value' },
            { path: 'documents.documentName', select: 'lookup_value' },
            { path: 'documents.documentType', select: 'lookup_value' }
        ];

        const contact = await Contact.findById(req.params.id).populate(populateFields);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: "Contact not found"
            });
        }

        res.status(200).json({
            success: true,
            data: contact
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update contact
 * @route   PUT /contacts/:id
 * @access  Private
 */
export const updateContact = async (req, res, next) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            const contact = mockStore.updateContact(req.params.id, req.body);
            if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });
            return res.status(200).json({ success: true, data: contact });
        }

        // Joi Validation
        const { error, value } = updateContactSchema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: error.details.map(detail => detail.message)
            });
        }

        const sanitizedValue = sanitizeData(value);
        const contact = await Contact.findByIdAndUpdate(req.params.id, sanitizedValue, {
            new: true,
            runValidators: true
        });

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: "Contact not found"
            });
        }

        res.status(200).json({
            success: true,
            data: contact
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Contact with this mobile already exists"
            });
        }
        next(error);
    }
};

/**
 * @desc    Delete contact
 * @route   DELETE /contacts/:id
 * @access  Private
 */
export const deleteContact = async (req, res, next) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            const success = mockStore.deleteContact(req.params.id);
            if (!success) return res.status(404).json({ success: false, message: "Contact not found" });
            return res.status(200).json({ success: true, data: {} });
        }

        const contact = await Contact.findByIdAndDelete(req.params.id);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: "Contact not found"
            });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Search for similar contacts (Duplicate Check)
 * @route   GET /contacts/search/duplicates
 * @access  Private
 */
export const searchDuplicates = async (req, res, next) => {
    try {
        const { name, phone, email } = req.query;
        let query = {};

        if (!name && !phone && !email) {
            return res.status(200).json({ success: true, data: [] });
        }

        const cases = [];
        if (name && name.length > 2) {
            cases.push({ name: { $regex: name, $options: 'i' } });
        }
        if (phone && phone.length > 3) {
            cases.push({ "phones.number": { $regex: phone, $options: 'i' } });
        }
        if (email && email.length > 3) {
            cases.push({ "emails.address": { $regex: email, $options: 'i' } });
        }

        if (cases.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        query = { $or: cases };

        const contacts = await Contact.find(query)
            .populate('title', 'lookup_value')
            .populate('designation', 'lookup_value')
            .populate('professionSubCategory', 'lookup_value')
            .limit(10)
            .lean();

        res.status(200).json({
            success: true,
            data: contacts
        });
    } catch (error) {
        next(error);
    }
};
