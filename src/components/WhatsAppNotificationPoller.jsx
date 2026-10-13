import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';
import { useUserContext } from '../context/UserContext';

const WhatsAppNotificationPoller = ({ onNavigate }) => {
    const { currentUser } = useUserContext();
    // Load previously notified keys from sessionStorage to prevent spamming on page refresh
    const getStoredCache = () => {
        try {
            const raw = sessionStorage.getItem('bp_notified_wa_convos');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch {
            return new Set();
        }
    };

    const saveStoredCache = (set) => {
        try {
            sessionStorage.setItem('bp_notified_wa_convos', JSON.stringify(Array.from(set).slice(-100)));
        } catch {}
    };

    const notifiedCacheRef = useRef(getStoredCache());
    const pollerRef = useRef(null);
    const isFirstRunRef = useRef(true);

    useEffect(() => {
        if (!currentUser) return; // Don't poll if not logged in

        const fetchUnread = async () => {
            try {
                const res = await api.get('conversations/unread');
                if (res.data?.success && res.data.data) {
                    const unreadConvos = res.data.data;
                    
                    // On first mount in a new tab/session, establish baseline if storage is empty
                    // so old historical unread messages don't explode all at once on page refresh
                    if (isFirstRunRef.current) {
                        isFirstRunRef.current = false;
                        unreadConvos.forEach(c => {
                            const lastMsg = c.messages?.[c.messages.length - 1];
                            const msgTime = lastMsg?.timestamp ? new Date(lastMsg.timestamp).getTime() : 0;
                            // If message is older than 10 minutes, silently cache it
                            if (Date.now() - msgTime > 10 * 60 * 1000) {
                                const cacheKey = `${c._id}_${c.metadata?.unreadCount || 1}`;
                                notifiedCacheRef.current.add(cacheKey);
                            }
                        });
                        saveStoredCache(notifiedCacheRef.current);
                    }

                    unreadConvos.forEach(convo => {
                        const msgs = convo.messages || [];
                        const lastMsgObj = msgs.length > 0 ? msgs[msgs.length - 1] : null;
                        
                        // Strict check: only notify if the last message is an INCOMING message from the customer
                        if (!lastMsgObj || lastMsgObj.role !== 'user') return;

                        // If we haven't notified for this specific conversation's unread count yet
                        const cacheKey = `${convo._id}_${convo.metadata?.unreadCount || 1}`;
                        
                        if (!notifiedCacheRef.current.has(cacheKey)) {
                            notifiedCacheRef.current.add(cacheKey);
                            saveStoredCache(notifiedCacheRef.current);

                            // Extract details
                            const name = convo.lead?.firstName 
                                ? `${convo.lead.firstName} ${convo.lead.lastName || ''}`.trim()
                                : (convo.contact?.name || convo.phoneNumber || 'Unknown User');
                                
                            const lastMsg = lastMsgObj.content || 'New message received';
                            
                            // Show Toast
                            toast.custom((t) => (
                                <div
                                    onClick={() => {
                                        toast.dismiss(t.id);
                                        api.patch(`conversations/${convo._id}/read`).catch(() => {});
                                        if (onNavigate) onNavigate('communication'); // Navigate to Omnichannel Inbox
                                    }}
                                    style={{
                                        maxWidth: '350px',
                                        width: '100%',
                                        background: '#fff',
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                        borderRadius: '12px',
                                        pointerEvents: 'auto',
                                        display: 'flex',
                                        padding: '16px',
                                        borderLeft: '6px solid #25D366', // WhatsApp Green
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s',
                                        transform: t.visible ? 'translateY(0)' : 'translateY(-20px)',
                                        opacity: t.visible ? 1 : 0
                                    }}
                                >
                                    <div style={{ marginRight: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#dcf8c6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#128C7E', fontSize: '20px' }}>
                                            <i className="fab fa-whatsapp"></i>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                                                {name}
                                            </h4>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>
                                                {convo.metadata?.unreadCount || 1} New
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                                            {lastMsg}
                                        </p>
                                    </div>
                                </div>
                            ), { duration: 8000, position: 'top-right' });
                        }
                    });
                }
            } catch (err) {
                console.error("WhatsApp Poller Error:", err);
            }
        };

        // Poll immediately and then every 10 seconds
        fetchUnread();
        pollerRef.current = setInterval(fetchUnread, 10000);

        return () => {
            if (pollerRef.current) clearInterval(pollerRef.current);
        };
    }, [currentUser, onNavigate]);

    return null; // Silent component
};

export default WhatsAppNotificationPoller;
