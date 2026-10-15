import React, { useEffect } from 'react';
import toast from 'react-hot-toast';

const LiveNotificationListener = ({ onNavigate }) => {
    useEffect(() => {
        const handleNewNotification = (e) => {
            const { newNotifications } = e.detail || {};
            if (!newNotifications || !Array.isArray(newNotifications)) return;

            newNotifications.forEach(notif => {
                if (!notif) return;

                // 1. Flow Feedback Toast
                if (notif.title && notif.title.includes('Flow Feedback Received')) {
                    toast.custom((t) => (
                        <div
                            onClick={() => {
                                toast.dismiss(t.id);
                                if (notif.link && onNavigate) onNavigate(notif.link.replace(/^\//, ''));
                            }}
                            className={`${
                                t.visible ? 'animate-enter' : 'animate-leave'
                            } max-w-md w-full bg-white shadow-2xl rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 cursor-pointer transform transition-all hover:scale-105`}
                            style={{ 
                                borderLeft: '4px solid #10b981', // green accent
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            <div className="flex-1 w-0 p-4 relative z-10">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0 pt-0.5">
                                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shadow-inner">
                                            <i className="fab fa-whatsapp text-green-600 text-xl"></i>
                                        </div>
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-bold text-gray-900 mb-1">
                                            {notif.title}
                                        </p>
                                        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-tight">
                                            {notif.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex border-l border-gray-100 relative z-10 bg-gray-50 hover:bg-gray-100 transition-colors">
                                <button
                                    onClick={(evt) => {
                                        evt.stopPropagation();
                                        toast.dismiss(t.id);
                                    }}
                                    className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none"
                                >
                                    Dismiss
                                </button>
                            </div>
                            <div className="absolute inset-0 pointer-events-none" style={{
                                background: 'linear-gradient(90deg, rgba(16,185,129,0) 0%, rgba(16,185,129,0.05) 50%, rgba(16,185,129,0) 100%)',
                                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}></div>
                        </div>
                    ), {
                        duration: 8000,
                        position: 'top-right',
                    });
                } 
                // 2. Incoming WhatsApp Message Alert
                else if (notif.type === 'messaging' || notif.type === 'whatsapp' || (notif.title && notif.title.includes('WhatsApp'))) {
                    const toastKey = `wa_msg_${notif._id || notif.title}_${notif.message}`;
                    if (!window.__bp_toasted_wa) window.__bp_toasted_wa = new Set();
                    if (window.__bp_toasted_wa.has(toastKey)) return;
                    window.__bp_toasted_wa.add(toastKey);
                    if (window.__bp_toasted_wa.size > 200) {
                        window.__bp_toasted_wa = new Set(Array.from(window.__bp_toasted_wa).slice(-100));
                    }

                    const isGroup = notif.title?.toLowerCase().includes('group') || notif.link?.includes('@g.us');
                    const cleanTitle = notif.title ? notif.title.replace(/^💬\s*WhatsApp from\s*/i, '') : 'New Message';

                    toast.custom((t) => (
                        <div
                            onClick={() => {
                                toast.dismiss(t.id);
                                if (notif.link && onNavigate) {
                                    onNavigate(notif.link.replace(/^\//, ''));
                                } else if (onNavigate) {
                                    onNavigate('communication');
                                }
                            }}
                            style={{
                                maxWidth: '380px',
                                width: '100%',
                                background: '#fff',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                borderRadius: '14px',
                                pointerEvents: 'auto',
                                display: 'flex',
                                padding: '14px 16px',
                                border: '1px solid #e2e8f0',
                                borderLeft: '6px solid #25D366',
                                cursor: 'pointer',
                                transition: 'all 0.25s ease',
                                transform: t.visible ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.95)',
                                opacity: t.visible ? 1 : 0
                            }}
                        >
                            <div style={{ marginRight: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#dcf8c6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#128C7E', fontSize: '20px', flexShrink: 0 }}>
                                    <i className={isGroup ? "fas fa-users" : "fab fa-whatsapp"}></i>
                                </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={cleanTitle}>
                                        {cleanTitle}
                                    </h4>
                                    <span style={{ fontSize: '0.68rem', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '10px', fontWeight: 700, flexShrink: 0, marginLeft: '6px' }}>
                                        WhatsApp
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>
                                    {notif.message}
                                </p>
                            </div>
                        </div>
                    ), {
                        duration: 8000,
                        position: 'top-right'
                    });
                }
            });
        };

        window.addEventListener('new-notification-alert', handleNewNotification);

        return () => {
            window.removeEventListener('new-notification-alert', handleNewNotification);
        };
    }, [onNavigate]);

    return null; // This is a logic-only component
};

export default LiveNotificationListener;
