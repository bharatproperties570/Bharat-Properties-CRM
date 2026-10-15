import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { api, socialAPI } from '../utils/api';
import whatsappService from '../services/whatsappService';
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
    const groupsMapRef = useRef(new Map());

    // 👥 Preload and cache WhatsApp group subjects for fast O(1) group name resolution
    const loadGroupsCache = async () => {
        try {
            const accRes = await whatsappService.getAccounts();
            const accounts = accRes.data || [];
            const baileysAcc = accounts.find(a => a.provider === 'BAILEYS' && (a.status === 'ACTIVE' || a.onboardingStatus === 'CONNECTED'));
            if (!baileysAcc) return;
            const bId = baileysAcc.id || baileysAcc._id;
            const res = await socialAPI.getBaileysGroups(bId);
            if (res?.success && Array.isArray(res.data)) {
                res.data.forEach(g => {
                    if (g.id && g.subject) {
                        groupsMapRef.current.set(g.id, g.subject);
                        groupsMapRef.current.set(g.id.replace('@g.us', ''), g.subject);
                    }
                });
            }
        } catch (err) {
            // Non-critical, fallback to metadata/backend
        }
    };

    useEffect(() => {
        if (!currentUser) return; // Don't poll if not logged in

        // Eagerly populate group names cache on session start
        loadGroupsCache();

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
                        const toastDedupeKey = `wa_msg_${convo._id}_${lastMsgObj.content || ''}`;
                        
                        if (!notifiedCacheRef.current.has(cacheKey) && (!window.__bp_toasted_wa || !window.__bp_toasted_wa.has(toastDedupeKey))) {
                            notifiedCacheRef.current.add(cacheKey);
                            saveStoredCache(notifiedCacheRef.current);
                            if (!window.__bp_toasted_wa) window.__bp_toasted_wa = new Set();
                            window.__bp_toasted_wa.add(toastDedupeKey);

                            // Detect WhatsApp Group
                            const isGroup = Boolean(
                                convo.isGroup || 
                                convo.metadata?.isGroup || 
                                lastMsgObj?.metadata?.isGroup || 
                                (convo.phoneNumber && convo.phoneNumber.includes('@g.us'))
                            );

                            let displayName = 'Unknown User';
                            if (isGroup) {
                                const cleanJid = convo.phoneNumber || convo.metadata?.groupJid || '';
                                const rawName = convo.groupName || 
                                                convo.metadata?.groupName || 
                                                lastMsgObj?.metadata?.groupName || 
                                                groupsMapRef.current.get(cleanJid) ||
                                                groupsMapRef.current.get(cleanJid.replace('@g.us', '')) ||
                                                convo.title;

                                if (rawName && !rawName.includes('@g.us')) {
                                    displayName = rawName;
                                } else {
                                    // Search backwards in thread messages for any saved groupName
                                    const foundMsg = msgs.slice().reverse().find(m => m.metadata?.groupName && !m.metadata.groupName.includes('@g.us'));
                                    displayName = foundMsg ? foundMsg.metadata.groupName : 'WhatsApp Group';
                                }

                                // If groups map wasn't populated yet, trigger background load
                                if (groupsMapRef.current.size === 0) {
                                    loadGroupsCache();
                                }
                            } else if (convo.lead?.firstName) {
                                displayName = `${convo.lead.firstName} ${convo.lead.lastName || ''}`.trim();
                            } else if (convo.contact?.name) {
                                displayName = convo.contact.name;
                            } else {
                                displayName = convo.phoneNumber || 'Unknown User';
                            }
                                
                            // Prepend sender name for group conversations
                            const senderName = lastMsgObj?.metadata?.senderName || lastMsgObj?.metadata?.participantName;
                            const rawMsg = lastMsgObj.content || 'New message received';
                            const lastMsg = (isGroup && senderName) ? `${senderName}: ${rawMsg}` : rawMsg;
                            
                            // Show Toast
                            toast.custom((t) => (
                                <div
                                    onClick={() => {
                                        toast.dismiss(t.id);
                                        api.patch(`conversations/${convo._id}/read`).catch(() => {});
                                        if (onNavigate) {
                                            const targetPhone = convo.phoneNumber || '';
                                            const targetUrl = targetPhone ? `communication?channel=WhatsApp_Web&selected=${encodeURIComponent(targetPhone)}` : 'communication';
                                            onNavigate(targetUrl);
                                        }
                                    }}
                                    style={{
                                        maxWidth: '360px',
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
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#dcf8c6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#128C7E', fontSize: '18px' }}>
                                            <i className={isGroup ? "fas fa-users" : "fab fa-whatsapp"}></i>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }} title={displayName}>
                                                {displayName}
                                            </h4>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>
                                                {convo.metadata?.unreadCount || 1} New
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }}>
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

        // Poll immediately and then every 15 seconds (paused when tab is hidden to prevent background CPU drain)
        fetchUnread();
        pollerRef.current = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchUnread();
        }, 15000);

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                fetchUnread();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (pollerRef.current) clearInterval(pollerRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [currentUser, onNavigate]);

    return null; // Silent component
};

export default WhatsAppNotificationPoller;
