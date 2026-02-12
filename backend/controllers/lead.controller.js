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

        console.log(`[DEBUG] getLeads called with page=${page}, limit=${limit}, search=${search}`);

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

        // Disable population entirely to ensure 200 OK
        const results = await paginate(Lead, query, Number(page), Number(limit), { createdAt: -1 }, []);

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
        const lead = await Lead.create(req.body);
        res.status(201).json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const updateLead = async (req, res, next) => {
    try {
        const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const deleteLead = async (req, res, next) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const getLeadById = async (req, res, next) => {
    try {
        const lead = await Lead.findById(req.params.id);
        res.json({ success: true, data: lead });
    } catch (error) {
        next(error);
    }
};

export const bulkDeleteLeads = async (req, res, next) => {
    try {
        await Lead.deleteMany({ _id: { $in: req.body.ids } });
        res.status(200).json({ success: true, message: "Deleted" });
    } catch (error) {
        next(error);
    }
};

export const importLeads = async (req, res, next) => {
    try {
        await Lead.insertMany(req.body.data, { ordered: false });
        res.status(200).json({ success: true });
    } catch (error) {
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
