import { useState, useEffect, useRef, useCallback } from 'react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../utils/api';
import toast from 'react-hot-toast';

// ── Polling Cadence Constants ────────────────────────────────────────────────
const ACTIVE_POLL_INTERVAL_MS = 30000;    // 30s when user is active
const IDLE_POLL_INTERVAL_MS   = 60000;    // 60s when user is idle (2-10 min)
const DEEP_IDLE_INTERVAL_MS   = 180000;   // 3 min when user is away (>10 min)
const IDLE_THRESHOLD_MS       = 120000;   // 2 minutes of no interaction
const DEEP_IDLE_THRESHOLD_MS  = 600000;   // 10 minutes of no interaction

export const useNotifications = (onNavigate) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const knownIds = useRef(new Set());
    const [isFirstLoad, setIsFirstLoad] = useState(true);

    // Activity tracking & Adaptive Polling Refs
    const lastActivityRef = useRef(Date.now());
    const lastFetchTimeRef = useRef(0);
    const pollTimerRef = useRef(null);
    const isFetchingRef = useRef(false);

    // Cross-Tab Broadcast Channel (Memory-efficient, 0 extra HTTP requests)
    const channelRef = useRef(null);
    
    // Professional Ping Sound
    const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'));

    // Safe Audio Trigger
    const playNotificationSound = useCallback(() => {
        try {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {
                // Autoplay policy: suppress silently until user interacts
            });
        } catch (e) {}
    }, []);

    // ── Core Fetch Function ──────────────────────────────────────────────────
    const fetchNotifications = useCallback(async (isBackground = false) => {
        if (isFetchingRef.current) return;
        if (typeof document !== 'undefined' && document.hidden) return;

        isFetchingRef.current = true;
        if (!isBackground) setLoading(true);

        try {
            const res = await getNotifications();
            const responseData = res?.data || res;
            
            if (responseData && responseData.notifications) {
                const newNotifications = responseData.notifications;
                const newUnreadCount = responseData.unreadCount || 0;
                lastFetchTimeRef.current = Date.now();

                // 🔔 Intelligent Detection: Look for IDs we haven't seen before
                const hasNewArrival = newNotifications.some(n => !knownIds.current.has(n._id));

                if (!isFirstLoad && hasNewArrival && newUnreadCount > 0) {
                    playNotificationSound();
                    const newArrivals = newNotifications.filter(n => !knownIds.current.has(n._id));
                    window.dispatchEvent(new CustomEvent('new-notification-alert', { 
                        detail: { newNotifications: newArrivals } 
                    }));
                    
                    // Trigger Call Resolution Modal if applicable
                    const newPendingCalls = newNotifications.filter(n => !knownIds.current.has(n._id) && n.type === 'pending_call_resolution');
                    newPendingCalls.forEach(callNotif => {
                        window.dispatchEvent(new CustomEvent('resolve-pending-call', { detail: callNotif }));
                    });
                }

                // Explicitly sort newest first
                const sortedNotifs = [...newNotifications].sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                setNotifications(sortedNotifs);
                setUnreadCount(newUnreadCount);
                knownIds.current = new Set(newNotifications.map(n => n._id));
                setIsFirstLoad(false);

                // ⚡ Cross-Tab Sync: Broadcast fresh data to other tabs (0 network overhead)
                if (channelRef.current) {
                    channelRef.current.postMessage({
                        type: 'SYNC_NOTIFICATIONS',
                        payload: {
                            notifications: sortedNotifs,
                            unreadCount: newUnreadCount,
                            timestamp: Date.now()
                        }
                    });
                }
            }
        } catch (error) {
            console.warn('[useNotifications] Polling fetch suppressed:', error.message);
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [isFirstLoad, playNotificationSound]);

    // ── Adaptive Polling Scheduler ───────────────────────────────────────────
    const scheduleNextPoll = useCallback(() => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        if (typeof document !== 'undefined' && document.hidden) return;

        const idleDuration = Date.now() - lastActivityRef.current;
        let delay = ACTIVE_POLL_INTERVAL_MS;

        if (idleDuration >= DEEP_IDLE_THRESHOLD_MS) {
            delay = DEEP_IDLE_INTERVAL_MS;
        } else if (idleDuration >= IDLE_THRESHOLD_MS) {
            delay = IDLE_POLL_INTERVAL_MS;
        }

        pollTimerRef.current = setTimeout(async () => {
            await fetchNotifications(true);
            scheduleNextPoll();
        }, delay);
    }, [fetchNotifications]);

    // ── Lifecycle & Event Listeners ──────────────────────────────────────────
    useEffect(() => {
        // 1. Initial Fetch on Mount
        fetchNotifications();
        scheduleNextPoll();

        // 2. Setup BroadcastChannel for Cross-Tab Coordination
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                channelRef.current = new BroadcastChannel('bp_crm_notifications_sync');
                channelRef.current.onmessage = (event) => {
                    const { type, payload } = event.data || {};
                    if (type === 'SYNC_NOTIFICATIONS' && payload) {
                        setNotifications(payload.notifications || []);
                        setUnreadCount(payload.unreadCount || 0);
                        if (Array.isArray(payload.notifications)) {
                            knownIds.current = new Set(payload.notifications.map(n => n._id));
                        }
                        lastFetchTimeRef.current = payload.timestamp || Date.now();
                        // Reset local poll timer since another tab just synced data
                        scheduleNextPoll();
                    } else if (type === 'MARK_ALL_READ') {
                        setUnreadCount(0);
                        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                    } else if (type === 'MARK_READ' && payload?.id) {
                        setUnreadCount(prev => Math.max(0, prev - 1));
                        setNotifications(prev => prev.map(n => n._id === payload.id ? { ...n, isRead: true } : n));
                    }
                };
            } catch (e) {
                channelRef.current = null;
            }
        }

        // 3. User Activity Listeners (Throttled)
        let lastRecordedTime = 0;
        const handleUserActivity = () => {
            const now = Date.now();
            if (now - lastRecordedTime < 5000) return; // Throttle to every 5s
            lastRecordedTime = now;
            
            const wasIdle = (now - lastActivityRef.current) > IDLE_THRESHOLD_MS;
            lastActivityRef.current = now;

            // If user was idle and returns, fetch if data is older than 30s
            if (wasIdle && (now - lastFetchTimeRef.current) > ACTIVE_POLL_INTERVAL_MS) {
                fetchNotifications(true);
            }
            scheduleNextPoll();
        };

        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

        // 4. Tab Visibility (Pause on hide, instant catch-up on show)
        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                lastActivityRef.current = Date.now();
                if (Date.now() - lastFetchTimeRef.current > 15000) {
                    fetchNotifications(true);
                }
                scheduleNextPoll();
            } else {
                if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 5. Real-time Live Event Listeners (SSE / Direct Event Dispatch)
        const handleLiveAlert = (e) => {
            const newNotifs = e.detail?.newNotifications || [];
            if (newNotifs.length > 0) {
                setNotifications(prev => {
                    const existingIds = new Set(prev.map(n => n._id));
                    const freshItems = newNotifs.filter(n => !existingIds.has(n._id));
                    if (freshItems.length === 0) return prev;
                    freshItems.forEach(n => knownIds.current.add(n._id));
                    return [...freshItems, ...prev];
                });
                setUnreadCount(prev => prev + newNotifs.length);
            }
        };
        window.addEventListener('new-notification-alert', handleLiveAlert);

        return () => {
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            activityEvents.forEach(evt => window.removeEventListener(evt, handleUserActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('new-notification-alert', handleLiveAlert);
            if (channelRef.current) {
                channelRef.current.close();
                channelRef.current = null;
            }
        };
    }, [fetchNotifications, scheduleNextPoll]);

    // ── Mark All as Read (Optimistic + Multi-Tab Broadcast) ──────────────────
    const handleMarkAllRead = async () => {
        // Optimistic UI update
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

        // Broadcast to other tabs
        if (channelRef.current) {
            channelRef.current.postMessage({ type: 'MARK_ALL_READ' });
        }

        try {
            const res = await markAllNotificationsAsRead();
            if (res.success) {
                toast.success('All notifications marked as read');
            }
        } catch (error) {
            console.error('Failed to mark notifications as read on server:', error);
            toast.error('Failed to mark notifications as read');
        }
    };

    // ── Mark Single Notification as Read ────────────────────────────────────
    const handleReadNotification = async (notification) => {
        if (notification.isRead) {
            if (notification.link) onNavigate(notification.link.replace(/^\//, ''));
            setShowNotifications(false);
            return;
        }

        // Optimistic UI update
        setUnreadCount(prev => Math.max(0, prev - 1));
        setNotifications(prev => prev.map(n => n._id === notification._id ? { ...n, isRead: true } : n));
        if (notification.link) onNavigate(notification.link.replace(/^\//, ''));
        setShowNotifications(false);

        // Broadcast to other tabs
        if (channelRef.current) {
            channelRef.current.postMessage({ type: 'MARK_READ', payload: { id: notification._id } });
        }

        try {
            await markNotificationAsRead(notification._id);
        } catch (error) {
            console.error('Failed to mark notification as read on server:', error);
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

