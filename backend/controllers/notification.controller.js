import Notification from "../models/Notification.js";
import Activity from "../models/Activity.js";
import mongoose from "mongoose";

// @desc    Get user's notifications
// @route   GET /api/notifications
export const getNotifications = async (req, res) => {
    try {
        const rawUserId = req.user?.id || req.user?._id;
        if (!rawUserId) {
            console.error("[NotificationController] No user ID in request");
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const userId = new mongoose.Types.ObjectId(rawUserId);

        // Generate today's activity reminders (site visits, calls, meetings, tasks)
        await generateTodayActivityReminders(userId);

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
        console.error("[NotificationController] getNotifications Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Generates notification reminders for all activities due TODAY.
 * Includes:
 *  1. Activities assigned to this user
 *  2. Activities with NO assignedTo set (created by anyone — org-wide visibility)
 *
 * This means site visits, calls, meetings scheduled today will always appear.
 */
const generateTodayActivityReminders = async (userId) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        console.log(`[Notifications] Generating today's reminders (${startOfDay.toISOString()} - ${endOfDay.toISOString()}) for user ${userId}`);

        // Fetch today's activities — show assigned-to-me AND unassigned (org level)
        const activities = await Activity.find({
            $and: [
                { dueDate: { $gte: startOfDay, $lte: endOfDay } },
                { status: { $regex: /pending|open|scheduled|site visit/i } },
                {
                    $or: [
                        { assignedTo: userId },
                        { assignedTo: { $exists: false } },
                        { assignedTo: null }
                    ]
                }
            ]
        }).lean();

        console.log(`[Notifications] Found ${activities.length} activities for today`);

        const ACTIVITY_ICONS = {
            'Site Visit': '🏠',
            'Call': '📞',
            'Meeting': '🤝',
            'Task': '✅',
            'Email': '📧',
            'WhatsApp': '💬',
        };

        for (const act of activities) {
            // Deduplicate: don't create the same notification twice per day
            const exists = await Notification.findOne({
                user: userId,
                type: 'reminder',
                'metadata.activityId': act._id,
                createdAt: { $gte: startOfDay }
            });

            if (!exists) {
                const icon = ACTIVITY_ICONS[act.type] || '📌';
                const timeStr = act.dueTime ? ` at ${act.dueTime}` : '';
                const subjectStr = act.subject || 'Reminder';

                let contactName = '';
                if (act.relatedTo && act.relatedTo.length > 0) {
                    contactName = act.relatedTo[0]?.name || '';
                }
                const withStr = contactName ? ` with ${contactName}` : '';
                const locationStr = act.details?.location ? ` @ ${act.details.location}` : '';

                await Notification.create({
                    user: userId,
                    type: 'reminder',
                    title: `${icon} Today's ${act.type || 'Activity'}${timeStr}`,
                    message: `${subjectStr}${withStr}${locationStr}`,
                    link: `/activities`,
                    isRead: false,
                    metadata: {
                        activityId: act._id,
                        activityType: act.type,
                        entityType: act.entityType,
                        entityId: act.entityId,
                    }
                });

                console.log(`[Notifications] Created reminder → ${act.type}: ${subjectStr} (${act._id})`);
            }
        }
    } catch (err) {
        console.error("[NotificationController] generateTodayActivityReminders failed:", err);
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
        const rawUserId = req.user?.id || req.user?._id;
        const userId = new mongoose.Types.ObjectId(rawUserId);
        await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper: create a notification programmatically (used in other controllers)
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
