import { useState, useEffect, useRef, useCallback } from 'react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../utils/api';
import toast from 'react-hot-toast';

export const useNotifications = (onNavigate) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'));

    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getNotifications();
            if (res.success) {
                const newNotifications = res.data.notifications || [];
                const newUnreadCount = res.data.unreadCount || 0;

                // Play sound if unread count increased
                if (newUnreadCount > unreadCount) {
                    audioRef.current.play().catch(e => console.log('Audio play failed:', e));
                }

                setNotifications(newNotifications);
                setUnreadCount(newUnreadCount);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [unreadCount]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
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
