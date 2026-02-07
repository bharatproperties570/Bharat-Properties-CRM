import Activity from "../models/Activity.js";

export const getActivities = async (req, res) => {
    try {
        const { entityId, entityType } = req.query;
        const query = {};
        if (entityId) query.entityId = entityId;
        if (entityType) query.entityType = entityType;

        const activities = await Activity.find(query).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ success: true, data: activities });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addActivity = async (req, res) => {
    try {
        const activity = await Activity.create(req.body);
        res.json({ success: true, data: activity });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
