import Lead from "../models/Lead.js";
import { paginate } from "../utils/pagination.js";
import mockStore from "../utils/mockStore.js";

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

        const results = await paginate(Lead, query, Number(page), Number(limit), { createdAt: -1 });

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create a new lead
 * @route   POST /leads
 * @access  Private
 */
export const addLead = async (req, res, next) => {
    try {
        if (process.env.MOCK_MODE === 'true') {
            const lead = mockStore.addLead(req.body);
            return res.status(201).json({ success: true, data: lead });
        }

        const lead = await Lead.create(req.body);
        res.status(201).json({ success: true, data: lead });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Lead with this mobile already exists"
            });
        }
        next(error);
    }
}

/**
 * @desc    Delete a lead
 * @route   DELETE /leads/:id
 * @access  Private
 */
export const deleteLead = async (req, res, next) => {
    try {
        const lead = await Lead.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        await lead.remove();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};
