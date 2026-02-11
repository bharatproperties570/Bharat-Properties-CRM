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

        const populateFields = "requirement subRequirement project budget location source status";
        const results = await paginate(Lead, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);


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

/**
 * @desc    Get lead by ID or Mobile
 * @route   GET /leads/:id
 * @access  Private
 */
export const getLeadById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

        let lead;
        if (isObjectId) {
            lead = await Lead.findById(id);
        }

        if (!lead) {
            lead = await Lead.findOne({ mobile: id });
        }

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });
        }

        // Map flat backend fields to the structured format expected by LeadMatchingPage.jsx
        const leadObj = lead.toObject();

        // Ensure name exists
        if (!leadObj.name) {
            leadObj.name = `${leadObj.firstName || ''} ${leadObj.lastName || ''}`.trim();
        }

        // Construct req object
        if (!leadObj.req) {
            leadObj.req = {
                type: Array.isArray(leadObj.propertyType) ? leadObj.propertyType.join(', ') : (leadObj.propertyType || leadObj.requirement || ''),
                size: (leadObj.areaMin || leadObj.areaMax) ? `${leadObj.areaMin || 0} - ${leadObj.areaMax || 0} ${leadObj.areaMetric || 'Sq Yard'}` : (leadObj.subRequirement || '')
            };
        }

        // Ensure budget is a formatted string for parseBudget
        if (!leadObj.budget && (leadObj.budgetMin || leadObj.budgetMax)) {
            leadObj.budget = `₹${leadObj.budgetMin || 0} - ₹${leadObj.budgetMax || 0}`;
        }

        res.status(200).json({
            success: true,
            lead: leadObj
        });
    } catch (error) {
        next(error);
    }
};

export const bulkDeleteLeads = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Lead.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} leads deleted successfully` });
    } catch (error) {
        next(error);
    }
};
