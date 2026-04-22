import { useState, useEffect, useRef, useCallback } from 'react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../utils/api';
import toast from 'react-hot-toast';

export const useNotifications = (onNavigate) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [knownIds, setKnownIds] = useState(new Set());
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    
    // Professional Ping Sound
    const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'));

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await getNotifications();
            // Unwrap res.data since api.js now handles the return structure
            const responseData = res?.data || res;
            
            if (responseData && responseData.notifications) {
                const newNotifications = responseData.notifications;
                const newUnreadCount = responseData.unreadCount || 0;

                // 🔔 Intelligent Detection: Look for IDs we haven't seen before
                const currentIds = new Set(newNotifications.map(n => n._id));
                const hasNewArrival = newNotifications.some(n => !knownIds.has(n._id));

                if (!isFirstLoad && hasNewArrival && newUnreadCount > 0) {
                    console.log('[NotificationEngine] 🔔 New Notification Detected! Triggering Alert...');
                    audioRef.current.currentTime = 0;
                    audioRef.current.play().catch(e => {
                        console.warn('[Audio] Autoplay blocked. Interaction needed.');
                    });
                    window.dispatchEvent(new CustomEvent('new-notification-alert'));
                }

                setNotifications(newNotifications);
                setUnreadCount(newUnreadCount);
                setKnownIds(currentIds);
                setIsFirstLoad(false);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [knownIds, isFirstLoad]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 8000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const handleMarkAllRead = async () => {
        try {
            const res = await markAllNotificationsAsRead();
            if (res.success) {
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                toast.success('All notifications marked as read');
            }
        } catch (error) {
            toast.error('Failed to mark notifications as read');
        }
    };

    const handleReadNotification = async (notification) => {
        if (notification.isRead) {
            if (notification.link) onNavigate(notification.link.replace(/^\//, ''));
            setShowNotifications(false);
            return;
        }

        try {
            const res = await markNotificationAsRead(notification._id);
            if (res.success) {
                setUnreadCount(prev => Math.max(0, prev - 1));
                setNotifications(prev => prev.map(n => n._id === notification._id ? { ...n, isRead: true } : n));
                if (notification.link) onNavigate(notification.link.replace(/^\//, ''));
                setShowNotifications(false);
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    return {
        showNotifications,
        setShowNotifications,
        unreadCount,
        setUnreadCount,
        notifications,
        loading,
        handleMarkAllRead,
        handleReadNotification
    };
};
