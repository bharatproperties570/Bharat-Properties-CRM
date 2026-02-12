import mongoose from "mongoose";
import Contact from "../models/Contact.js";
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
        const { error } = createContactSchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const contact = await Contact.create(req.body);
        res.status(201).json({ success: true, data: contact });
    } catch (error) {
        console.error("[ERROR] createContact failed:", error);
        next(error);
    }
};

export const updateContact = async (req, res, next) => {
    try {
        const { error } = updateContactSchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, error: error.details[0].message });

        const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true });
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

// ... other methods remained unchanged but simplified
export const searchDuplicates = async (req, res, next) => {
    try {
        const { name, phone, email } = req.query;
        let query = {};
        if (!name && !phone && !email) return res.status(200).json({ success: true, data: [] });

        const cases = [];
        if (name && name.length > 2) cases.push({ name: { $regex: name, $options: 'i' } });
        if (phone && phone.length > 3) cases.push({ "phones.number": { $regex: phone, $options: 'i' } });
        if (email && email.length > 3) cases.push({ "emails.address": { $regex: email, $options: 'i' } });

        if (cases.length === 0) return res.status(200).json({ success: true, data: [] });
        query = { $or: cases };

        const contacts = await Contact.find(query).limit(10).lean();
        res.status(200).json({ success: true, data: contacts });
    } catch (error) {
        next(error);
    }
};

export const importContacts = async (req, res, next) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: "Invalid data provided" });
        await Contact.insertMany(data, { ordered: false });
        res.status(200).json({ success: true, message: `Imported ${data.length} contacts.` });
    } catch (error) {
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
