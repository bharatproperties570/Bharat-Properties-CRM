import Deal from "../models/Deal.js";
import Activity from "../models/Activity.js";
import { paginate } from "../utils/pagination.js";

export const getDeals = async (req, res) => {
    try {
        const { page = 1, limit = 25, search = "" } = req.query;
        let query = {};

        if (search) {
            query = {
                $or: [
                    { unitNo: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { projectName: { $regex: search, $options: "i" } }
                ]
            };
        }

        const populateFields = "projectId unitType propertyType location intent status dealType transactionType source owner associatedContact assignedTo";
        const results = await paginate(Deal, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        // Fetch latest activities for owners and associates
        const contactIds = results.records.reduce((acc, deal) => {
            if (deal.owner?._id) acc.push(deal.owner._id);
            if (deal.associatedContact?._id) acc.push(deal.associatedContact._id);
            return acc;
        }, []);

        let activityMap = {};
        if (contactIds.length > 0) {
            const activities = await Activity.aggregate([
                { $match: { entityId: { $in: contactIds }, entityType: "Contact" } },
                { $sort: { performedAt: -1 } },
                { $group: { _id: "$entityId", lastActivity: { $first: "$$ROOT" } } }
            ]);
            activities.forEach(a => {
                activityMap[a._id.toString()] = a.lastActivity;
            });
        }

        // Attach last activity to each deal
        const enrichedRecords = results.records.map(deal => {
            const dealObj = deal.toObject ? deal.toObject() : deal;
            const ownerActivity = deal.owner?._id ? activityMap[deal.owner._id.toString()] : null;
            const associateActivity = deal.associatedContact?._id ? activityMap[deal.associatedContact._id.toString()] : null;

            // Pick the latest between owner and associate activity
            dealObj.lastActivity = [ownerActivity, associateActivity]
                .filter(Boolean)
                .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] || null;

            return dealObj;
        });

        res.json({
            success: true,
            ...results,
            records: enrichedRecords
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getDealById = async (req, res) => {
    try {
        const populateFields = "projectId unitType propertyType location intent status dealType transactionType source owner associatedContact assignedTo";
        const deal = await Deal.findById(req.params.id).populate(populateFields);
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }
        res.json({
            success: true,
            deal: deal
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Helper to convert empty strings to null for reference fields to avoid CastError during population
 */
const sanitizeData = (data) => {
    const refFields = [
        'projectId', 'unitType', 'propertyType', 'location', 'intent',
        'status', 'dealType', 'transactionType', 'source', 'owner', 'associatedContact',
        'category', 'subCategory', 'assignedTo'
    ];
    const sanitized = { ...data };
    refFields.forEach(field => {
        if (sanitized[field] === "" || sanitized[field] === undefined) {
            sanitized[field] = null;
        } else if (typeof sanitized[field] === 'object' && sanitized[field] !== null) {
            // Extract _id if it's an object, otherwise null to avoid CastError in populate
            sanitized[field] = sanitized[field]._id || null;
        }
    });
    return sanitized;
};

export const addDeal = async (req, res) => {
    try {
        const sanitizedData = sanitizeData(req.body);
        const deal = await Deal.create(sanitizedData);
        res.status(201).json({ success: true, data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDeal = async (req, res) => {
    try {
        const sanitizedData = sanitizeData(req.body);
        const deal = await Deal.findByIdAndUpdate(req.params.id, sanitizedData, { new: true });
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });
        res.json({ success: true, data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteDeal = async (req, res) => {
    try {
        const deal = await Deal.findByIdAndDelete(req.params.id);
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });
        res.json({ success: true, message: "Deal deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteDeals = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Deal.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} deals deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
