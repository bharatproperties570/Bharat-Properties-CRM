import Notification from "../models/Notification.js";

// @desc    Get user's notifications
// @route   GET /api/notifications
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user?._id; // Assuming auth middleware sets req.user
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const notifications = await Notification.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

        res.json({
            success: true,
            data: {
                notifications,
                unreadCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
export const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, error: "Notification not found" });
        }

        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;
        await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper function to create notification (not an exported route)
export const createNotification = async (userId, type, title, message, link = '', metadata = {}) => {
    try {
        await Notification.create({
            user: userId,
            type,
            title,
            message,
            link,
            metadata
        });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
};
