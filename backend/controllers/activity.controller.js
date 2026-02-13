import Activity from "../models/Activity.js";

// @desc    Get all activities with filtering and pagination
// @route   GET /api/activities
export const getActivities = async (req, res) => {
    try {
        const {
            entityId,
            entityType,
            type,
            status,
            assignedTo,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 100
        } = req.query;

        const query = {};

        if (entityId) query.entityId = entityId;
        if (entityType) query.entityType = entityType;
        if (type) query.type = type;
        if (status) query.status = status;
        if (assignedTo) query.assignedTo = assignedTo;

        // Date Range Filtering
        if (startDate || endDate) {
            query.dueDate = {};
            if (startDate) query.dueDate.$gte = new Date(startDate);
            if (endDate) query.dueDate.$lte = new Date(endDate);
        }

        // Search in subject or description
        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { "participants.name": { $regex: search, $options: 'i' } }
            ];
        }

        const activities = await Activity.find(query)
            .sort({ dueDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate('assignedTo', 'firstName lastName email')
            .lean();

        const total = await Activity.countDocuments(query);

        res.json({
            success: true,
            data: activities,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Add new activity
// @route   POST /api/activities
export const addActivity = async (req, res) => {
    try {
        const activity = await Activity.create(req.body);
        res.status(201).json({ success: true, data: activity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update an activity
// @route   PUT /api/activities/:id
export const updateActivity = async (req, res) => {
    try {
        const activity = await Activity.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        res.json({ success: true, data: activity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete an activity
// @route   DELETE /api/activities/:id
export const deleteActivity = async (req, res) => {
    try {
        const activity = await Activity.findByIdAndDelete(req.params.id);

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        res.json({ success: true, message: "Activity deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
