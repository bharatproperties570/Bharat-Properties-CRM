import Notification from "../models/Notification.js";
import NotificationSetting from "../models/NotificationSetting.js";
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
        console.log(`[NotificationController] Fetching for User: ${userId}`);

        // Generate today's activity reminders (site visits, calls, meetings, tasks)
        await generateTodayActivityReminders(userId);

        // 🌟 SENIOR TWEAK: Filter notifications based on user preferences
        const settings = await NotificationSetting.findOne({ user: userId }).lean();
        console.log(`[NotificationController] Settings found: ${!!settings}`);
        const presets = settings?.presets || new Map();

        const notifications = await Notification.find({ 
            $or: [
                { user: userId },
                { type: 'system' }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(100);

        console.log(`[NotificationController] Raw count from DB: ${notifications.length}`);

        // 🌟 TYPE NORMALIZATION: Map DB types to Settings Categories
        const typeMap = {
            assignment: 'assignments',
            assignments: 'assignments',
            messaging: 'messaging',
            whatsapp: 'messaging',
            call: 'messaging',
            sms: 'messaging',
            activity: 'reminders',
            reminder: 'reminders',
            task: 'reminders',
            lead: 'assignments',
            lead_capture: 'publicForms',
            publicForms: 'publicForms'
        };

        // Filter based on 'web' preference in presets
        const filteredNotifications = notifications.filter(n => {
            if (n.type === 'system' || n.type === 'announcement') return true;
            
            // Map the type to a category
            const category = typeMap[n.type] || n.type;
            
            // Check presets for this specific category
            const categorySettings = presets.get ? presets.get(category) : presets[category];
            if (!categorySettings) return true; // Default to allow if not explicitly set
            
            const webEnabled = categorySettings.get ? categorySettings.get('web') : categorySettings.web;
            return webEnabled !== false;
        }).slice(0, 50);

        // 🌟 Robust Fallback for testing/new users
        if (filteredNotifications.length === 0) {
            filteredNotifications.push({
                _id: new mongoose.Types.ObjectId(),
                title: '🔔 Notification System Active',
                message: 'Your notification pipeline is ready. New leads and matches will appear here.',
                type: 'system',
                createdAt: new Date(),
                isRead: false,
                link: '/settings/notifications'
            });
        }

        const unreadCount = filteredNotifications.filter(n => !n.isRead).length;

        res.json({
            success: true,
            data: {
                notifications: filteredNotifications,
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
            'Messaging': '💬',
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
export const createNotification = async (userId, type, title, message, link = '', metadata = {}, priority = 'medium') => {
    try {
        const NotificationEngine = (await import('../services/NotificationEngine.js')).default;
        await NotificationEngine.notify({ userId, type, title, message, link, metadata, priority });
    } catch (err) {
        console.error("[NotificationController] Failed to create notification:", err);
    }
};

// Trigger a test notification for the current user
export const triggerTestNotification = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        await createNotification(
            userId,
            'system',
            '🧪 Test Notification success!',
            'If you see this, your notification pipeline is working perfectly. Sound and color should have triggered!',
            '/settings/notifications',
            { test: true }
        );
        res.json({ success: true, message: "Test notification triggered" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export default {
    getNotifications,
    markAsRead,
    markAllAsRead,
    createNotification,
    triggerTestNotification
};
