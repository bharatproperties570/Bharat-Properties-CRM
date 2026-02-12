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
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data format" });
        }

        const restructuredData = data.map(item => {
            const firstName = item.name || item.firstName || '';
            const lastName = item.surname || item.lastName || '';

            return {
                salutation: item.title || 'Mr.',
                firstName: firstName,
                lastName: lastName,
                mobile: item.mobile,
                email: item.email,
                description: item.description,
                campaign: item.campaign,
                source: item.source,
                subSource: item.subSource,
                team: item.team ? item.team.split(',').map(t => t.trim()) : [],
                owner: item.owner,
                visibleTo: item.visibleTo || 'Everyone',
                requirement: item.requirement,
                propertyType: item.propertyType ? item.propertyType.split(',').map(t => t.trim()) : [],
                customFields: {
                    purpose: item.purpose,
                    nri: item.nri === 'Yes' || item.nri === true,
                    subType: item.subType ? item.subType.split(',').map(t => t.trim()) : [],
                    unitType: item.unitType ? item.unitType.split(',').map(t => t.trim()) : [],
                    budgetMin: item.budgetMin,
                    budgetMax: item.budgetMax,
                    areaMin: item.areaMin,
                    areaMax: item.areaMax,
                    areaMetric: item.areaMetric,
                    facing: item.facing ? item.facing.split(',').map(t => t.trim()) : [],
                    roadWidth: item.roadWidth ? item.roadWidth.split(',').map(t => t.trim()) : [],
                    direction: item.direction ? item.direction.split(',').map(t => t.trim()) : [],
                    funding: item.funding,
                    timeline: item.timeline,
                    furnishing: item.furnishing,
                    transactionType: item.transactionType,
                    transactionFlexiblePercentage: item.transactionFlexiblePercentage
                }
            };
        });

        await Lead.insertMany(restructuredData, { ordered: false });
        res.status(200).json({ success: true, message: `Successfully imported ${restructuredData.length} leads.` });
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
