import mongoose from "mongoose";
import Contact from "../models/Contact.js";
import DuplicationRule from "../models/DuplicationRule.js";
import { paginate } from "../utils/pagination.js";
import { createContactSchema, updateContactSchema } from "../validations/contact.validation.js";

const populateFields = [
    { path: 'title', select: 'lookup_value', options: { strictPopulate: false } },
    { path: 'designation', select: 'lookup_value', options: { strictPopulate: false } },
    { path: 'owner', select: 'name email', options: { strictPopulate: false } },
    { path: 'source', select: 'lookup_value', options: { strictPopulate: false } },
    { path: 'subSource', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'professionCategory', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'professionSubCategory', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'personalAddress.country', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'personalAddress.state', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'personalAddress.city', select: 'lookup_value', options: { strictPopulate: false } },
    { path: 'personalAddress.location', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'correspondenceAddress.country', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'correspondenceAddress.state', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'correspondenceAddress.city', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'requirement', select: 'lookup_value', options: { strictPopulate: false } },
    { path: 'documents.documentName', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'documents.documentType', select: 'lookup_value', options: { strictPopulate: false } }, // Added
    { path: 'campaign', select: 'lookup_value', options: { strictPopulate: false } }
];

export const getContacts = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = "" } = req.query;

        console.log(`[DEBUG] getContacts called with page=${page}, limit=${limit}, search=${search}`);

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } },
                    { "phones.number": { $regex: search, $options: "i" } },
                    { "emails.address": { $regex: search, $options: "i" } }
                ]
            };
        }

        // Enabled population
        let mongoQuery = paginate(Contact, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        // Wait, paginate utility handles call. 
        // We passed populateFields (Array) to paginate.
        // paginate uses model.find()...populate(populate).
        // If populate is array, it works.
        const results = await paginate(Contact, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("[ERROR] getContacts failed:", error);
        next(error);
    }
};

export const getContact = async (req, res, next) => {
    try {
        const contact = await Contact.findById(req.params.id).populate(populateFields);
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });
        res.json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] getContact failed:", error);
        next(error);
    }
};

export const createContact = async (req, res, next) => {
    try {
        // Strip internal fields that shouldn't be in the create payload according to Joi
        const data = { ...req.body };
        delete data._id;
        delete data.id;
        delete data.__v;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.fullName;

        const { error } = createContactSchema.validate(data);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const contact = await Contact.create(data);
        res.status(201).json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] createContact failed:", error);
        next(error);
    }
};

export const updateContact = async (req, res, next) => {
    try {
        console.log("[updateContact] Request Body:", JSON.stringify(req.body, null, 2));

        // Strip internal fields that shouldn't be in the update payload according to Joi
        const updateData = { ...req.body };
        delete updateData._id;
        delete updateData.id;
        delete updateData.__v;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.fullName;

        const { error } = updateContactSchema.validate(updateData);
        if (error) {
            console.error("[updateContact] Validation Error:", JSON.stringify(error.details, null, 2));
            return res.status(400).json({ success: false, error: error.details[0].message });
        }

        const contact = await Contact.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });
        res.json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] updateContact failed:", error);
        next(error);
    }
};

export const deleteContact = async (req, res, next) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });
        res.json({ success: true, message: "Contact deleted successfully" });
    } catch (error) {
        console.error("[ERROR] deleteContact failed:", error);
        next(error);
    }
};

export const searchDuplicates = async (req, res, next) => {
    try {
        const { name, phone, email } = req.query;
        if (!name && !phone && !email) return res.status(200).json({ success: true, data: [] });

        // 1. Fetch Active Rules
        const activeRules = await DuplicationRule.find({ isActive: true });

        let query = {};

        if (activeRules.length > 0) {
            // 2. Build Query from Rules
            const ruleQueries = activeRules.map(rule => {
                const fieldQueries = rule.fields.map(field => {
                    if (field === 'name' && name) return { name: { $regex: name, $options: 'i' } };
                    if (field === 'phones.number' && phone) return { "phones.number": { $regex: phone, $options: 'i' } };
                    if (field === 'emails.address' && email) return { "emails.address": { $regex: email, $options: 'i' } };
                    return null;
                }).filter(Boolean);

                if (fieldQueries.length === 0) return null;
                return rule.matchType === 'all' ? { $and: fieldQueries } : { $or: fieldQueries };
            }).filter(Boolean);

            if (ruleQueries.length === 0) return res.status(200).json({ success: true, data: [] });
            query = { $or: ruleQueries };
        } else {
            // 3. Fallback to Default Logic (Any match)
            const cases = [];
            if (name && name.length > 2) cases.push({ name: { $regex: name, $options: 'i' } });
            if (phone && phone.length > 3) cases.push({ "phones.number": { $regex: phone, $options: 'i' } });
            if (email && email.length > 3) cases.push({ "emails.address": { $regex: email, $options: 'i' } });

            if (cases.length === 0) return res.status(200).json({ success: true, data: [] });
            query = { $or: cases };
        }

        const contacts = await Contact.find(query).limit(10).lean();
        res.status(200).json({ success: true, data: contacts });
    } catch (error) {
        console.error("[ERROR] searchDuplicates failed:", error);
        next(error);
    }
};

import Lookup from "../models/Lookup.js";

// Helper to resolve lookup (Find or Create)
const resolveLookup = async (type, value) => {
    if (!value) return null;
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: value });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

// Helper to resolve User (By Name or Email)
import User from "../models/User.js";
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${identifier}$`, 'i') } },
            { email: identifier.toLowerCase() }
        ]
    });
    return user ? user._id : null;
};

export const importContacts = async (req, res, next) => {
    try {
        const { data } = req.body;
        console.log(`[ImportContacts] Received request with ${data?.length} records`);

        if (!data || !Array.isArray(data)) {
            console.error("[ImportContacts] Invalid data format");
            return res.status(400).json({ success: false, message: "Invalid data provided" });
        }

        const processedData = [];

        for (const item of data) {
            const newItem = { ...item };

            // Resolve Lookups
            newItem.title = await resolveLookup('Title', item.title);
            newItem.professionCategory = await resolveLookup('ProfessionalCategory', item.professionCategory);
            newItem.professionSubCategory = await resolveLookup('ProfessionalSubCategory', item.professionSubCategory);
            newItem.designation = await resolveLookup('ProfessionalDesignation', item.designation);
            newItem.source = await resolveLookup('Source', item.source);
            newItem.subSource = await resolveLookup('Sub-Source', item.subSource);
            newItem.campaign = await resolveLookup('Campaign', item.campaign);
            newItem.owner = await resolveUser(item.owner);
            newItem.status = item.status || 'Active';
            newItem.stage = item.stage || 'New';

            // Automatic 'Import' Tag logic
            let currentTags = [];
            if (Array.isArray(item.tags)) {
                currentTags = [...item.tags];
            } else if (typeof item.tags === 'string' && item.tags.trim()) {
                currentTags = item.tags.split(',').map(t => t.trim());
            }

            if (!currentTags.includes('Import')) {
                currentTags.push('Import');
            }
            newItem.tags = currentTags;

            // Restructure phones
            if (item.mobile) {
                newItem.phones = [{ number: item.mobile, type: 'Personal' }];
                delete newItem.mobile;
            }

            // Restructure emails
            if (item.email) {
                newItem.emails = [{ address: item.email, type: 'Personal' }];
                delete newItem.email;
            }

            // Restructure Personal Address
            const addressFields = ['hNo', 'street', 'area', 'city', 'tehsil', 'postOffice', 'state', 'country', 'pinCode', 'location'];
            newItem.personalAddress = {};

            // Resolve Address Lookups
            if (item.country) newItem.personalAddress.country = await resolveLookup('Country', item.country);
            if (item.state) newItem.personalAddress.state = await resolveLookup('State', item.state);
            if (item.city) newItem.personalAddress.city = await resolveLookup('City', item.city);
            if (item.tehsil) newItem.personalAddress.tehsil = await resolveLookup('Tehsil', item.tehsil);
            if (item.postOffice) newItem.personalAddress.postOffice = await resolveLookup('PostOffice', item.postOffice);
            if (item.location) newItem.personalAddress.location = await resolveLookup('Location', item.location); // Assuming Location lookup type

            addressFields.forEach(field => {
                if (item[field]) {
                    if (!['country', 'state', 'city', 'tehsil', 'postOffice', 'location'].includes(field)) {
                        newItem.personalAddress[field] = item[field];
                    }
                    delete newItem[field];
                }
            });

            // Clean up empty address object
            if (Object.keys(newItem.personalAddress).length === 0) {
                delete newItem.personalAddress;
            }

            // Clean empty strings recursively to prevent Schema validation errors (e.g. casting "" to ObjectId)
            const cleanEmptyFields = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === 'string' && obj[key].trim() === '') {
                        obj[key] = undefined; // Set to undefined so Mongoose ignores it or uses default
                    } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                        cleanEmptyFields(obj[key]);
                    }
                }
            };
            cleanEmptyFields(newItem);

            processedData.push(newItem);
        }

        console.log(`[ImportContacts] Processed data sample:`, JSON.stringify(processedData[0], null, 2));

        console.log(`[ImportContacts] Processed data sample:`, JSON.stringify(processedData[0], null, 2));

        // Use rawResult: true to capture validation errors that otherwise fail silently with ordered: false
        const result = await Contact.insertMany(processedData, { ordered: false, rawResult: true });

        const successCount = result.insertedCount;
        const validationErrors = result.mongoose ? result.mongoose.validationErrors : [];
        const errorDetails = [];

        if (validationErrors && validationErrors.length > 0) {
            validationErrors.forEach((err, idx) => {
                errorDetails.push({
                    row: 'Validation',
                    name: processedData[idx]?.name || 'Unknown',
                    reason: err.message
                });
            });
        }

        if (errorDetails.length > 0) {
            return res.status(200).json({
                success: true,
                message: `Imported ${successCount} contacts. ${errorDetails.length} failed validation.`,
                successCount: successCount,
                errorCount: errorDetails.length,
                errors: errorDetails
            });
        }

        res.status(200).json({
            success: true,
            message: `Imported ${successCount} contacts.`,
            successCount: successCount,
            errorCount: 0,
            errors: []
        });
    } catch (error) {
        if (error.writeErrors) {
            const successCount = (req.body.data?.length || 0) - error.writeErrors.length;
            const failedCount = error.writeErrors.length;
            const errorDetails = error.writeErrors.map(e => ({
                row: e.index + 1,
                name: (req.body.data[e.index]?.name || 'Unknown'),
                reason: e.errmsg?.includes('duplicate key') ? 'Duplicate mobile number' : e.errmsg
            }));

            return res.status(200).json({
                success: true,
                message: `Imported ${successCount} contacts. ${failedCount} failed.`,
                successCount: successCount,
                errorCount: failedCount,
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
        console.error("Import error (General):", error);
        next(error);
    }
};

export const checkDuplicatesImport = async (req, res, next) => {
    try {
        const { mobiles } = req.body;
        if (!mobiles || !Array.isArray(mobiles)) return res.status(400).json({ success: false, message: "Invalid mobile numbers provided" });
        const duplicates = await Contact.find({ $or: [{ mobile: { $in: mobiles } }, { "phones.number": { $in: mobiles } }] }, 'mobile phones name').lean();
        res.status(200).json({ success: true, duplicates: duplicates.map(d => d.mobile) });
    } catch (error) {
        next(error);
    }
};
