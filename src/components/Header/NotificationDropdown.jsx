
const NotificationDropdown = ({ 
    showNotifications, 
    setShowNotifications, 
    notifications, 
    unreadCount, 
    handleMarkAllRead, 
    handleReadNotification,
    onNavigate 
}) => {
    if (!showNotifications) return null;

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'assignment': 
            case 'assignments': return { icon: 'fas fa-bullseye', color: '#2563eb' };
            case 'publicForms': return { icon: 'fas fa-file-signature', color: '#0ea5e9' };
            case 'inventoryMatch': return { icon: 'fas fa-magic', color: '#f59e0b' };
            case 'conflictAlerts': return { icon: 'fas fa-exclamation-triangle', color: '#ef4444' };
            case 'whatsapp': 
            case 'messaging': return { icon: 'fab fa-whatsapp', color: '#25d366' };
            case 'lead': return { icon: 'fas fa-user-plus', color: '#3b82f6' };
            case 'deal': return { icon: 'fas fa-handshake', color: '#8b5cf6' };
            case 'task': 
            case 'reminder':
            case 'reminders':
            case 'activity': return { icon: 'fas fa-clock', color: '#f59e0b' };
            case 'stageChanges':
            case 'stage_change': return { icon: 'fas fa-exchange-alt', color: '#8b5cf6' };
            case 'system': return { icon: 'fas fa-info-circle', color: '#3b82f6' };
            case 'announcement': return { icon: 'fas fa-bullhorn', color: '#f97316' };
            default: return { icon: 'fas fa-bell', color: '#64748b' };
        }
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div style={{
            position: 'absolute',
            top: '40px',
            right: '0',
            width: '320px',
            background: '#fff',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            borderRadius: '12px',
            zIndex: 100000,
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
        }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Notifications</h3>
                {unreadCount > 0 && (
                    <span 
                        style={{ fontSize: '0.8rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }} 
                        onClick={handleMarkAllRead}
                    >
                        Mark all as read
                    </span>
                )}
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>No notifications today</div>
                ) : (
                    notifications.map(n => {
                        const { icon, color } = getNotificationIcon(n.type);
                        return (
                            <div 
                                key={n._id} 
                                style={{ 
                                    padding: '16px', 
                                    borderBottom: '1px solid #f1f5f9', 
                                    display: 'flex', 
                                    gap: '12px', 
                                    cursor: 'pointer',
                                    background: n.isRead ? '#fff' : 'rgba(59, 130, 246, 0.05)'
                                }} 
                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} 
                                onMouseOut={e => e.currentTarget.style.background = n.isRead ? '#fff' : 'rgba(59, 130, 246, 0.05)'}
                                onClick={() => handleReadNotification(n)}
                            >
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={icon} style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ 
                                        fontSize: '0.85rem', 
                                        color: '#1e293b', 
                                        margin: '0 0 4px 0', 
                                        lineHeight: 1.4,
                                        fontWeight: n.isRead ? 400 : 600
                                    }}>{n.title}</p>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 2px 0' }}>{n.message}</p>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatTime(n.createdAt)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            <div
                style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', background: '#f8fafc' }}
                onClick={() => { setShowNotifications(false); onNavigate('activities'); }}
            >
                View all activities
            </div>
        </div>
    );
};

export default NotificationDropdown;
