import Notification from "../models/Notification.js";
import User from "../models/User.js";
import mongoose from "mongoose";

/**
 * Senior Notification Engine
 * Standardizes alerting across the entire CRM ecosystem.
 */
class NotificationEngine {
    /**
     * Sends a notification to a specific user or group.
     * @param {Object} options - { userId, type, title, message, link, metadata, priority }
     */
    static async notify(options) {
        const { 
            userId, 
            type = 'system', 
            title, 
            message, 
            link = '', 
            metadata = {}, 
            priority = 'medium' 
        } = options;

        try {
            let targetUserId = userId;

            // 1. Fallback Logic: If no user ID, find the Primary Admin
            if (!targetUserId) {
                const admin = await User.findOne({ role: { $ne: null } }).sort({ createdAt: 1 }).lean();
                targetUserId = admin?._id;
                console.log(`[NotificationEngine] No target user. Falling back to Admin: ${targetUserId}`);
            }

            if (!targetUserId) {
                console.warn('[NotificationEngine] No target user found even after fallback. Aborting.');
                return null;
            }

            // 2. Persistence
            console.log(`[NotificationEngine] Attempting to create notification for user: ${targetUserId}`);
            const notification = await Notification.create({
                user: targetUserId,
                type,
                title,
                message,
                link,
                metadata,
                priority
            });

            if (notification) {
                console.log(`[NotificationEngine] ✅ SUCCESS: Notification ID ${notification._id} created.`);
            } else {
                console.warn('[NotificationEngine] ⚠️ FAILED: Notification.create returned null.');
            }
            return notification;
        } catch (error) {
            console.error('[NotificationEngine] ❌ Error:', error.message);
            return null;
        }
    }

    /**
     * Specialized: Trigger High-Priority WhatsApp Alert
     */
    static async notifyWhatsApp(userId, senderName, text, link, entityId) {
        return this.notify({
            userId,
            type: 'messaging',
            title: `💬 WhatsApp from ${senderName}`,
            message: text.length > 80 ? text.substring(0, 77) + '...' : text,
            link,
            metadata: { entityId, platform: 'whatsapp' },
            priority: 'high'
        });
    }

    /**
     * Specialized: Trigger Assignment Alert
     */
    static async notifyAssignment(userId, entityType, entityName, link) {
        return this.notify({
            userId,
            type: 'assignments',
            title: `🎯 New ${entityType} Assigned`,
            message: `You have been assigned to ${entityName}.`,
            link,
            priority: 'medium'
        });
    }
}

export default NotificationEngine;
