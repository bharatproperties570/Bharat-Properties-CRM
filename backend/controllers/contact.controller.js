import Contact from "../models/Contact.js";
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

        const results = await paginate(Contact, query, page, limit, { createdAt: -1 });

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        next(error);
    }
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

        const contact = await Contact.create(req.body);

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

        const contact = await Contact.findById(req.params.id);

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
