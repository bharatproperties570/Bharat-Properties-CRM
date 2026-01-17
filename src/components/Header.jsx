import React, { useState } from 'react';

function Header({ onNavigate }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(3);

    const notifications = [
        { id: 1, type: 'assignment', text: 'New Lead assigned to you: Ramesh Kumar', time: '2 mins ago', icon: 'fas fa-bullseye', color: '#2563eb' },
        { id: 2, type: 'task', text: 'Task "Call Client" is due today', time: '1 hour ago', icon: 'fas fa-tasks', color: '#f59e0b' },
        { id: 3, type: 'mention', text: 'Suraj mentioned you in a comment', time: '3 hours ago', icon: 'fas fa-at', color: '#10b981' },
    ];

    return (
        <header className="header">
            <div className="header-left">
                <div className="add-dropdown">
                    <button className="add-btn" id="addBtn">
                        <span>Add</span>
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }}></i>
                    </button>
                    <div className="dropdown-menu">
                        <a href="#"><i className="fas fa-user-plus"></i> Add Contact</a>
                        <a href="#"><i className="fas fa-filter"></i> Add Lead</a>
                        <a href="#"><i className="fas fa-handshake"></i> Add Deal</a>
                        <a href="#"><i className="fas fa-building"></i> Add Project</a>
                        <a href="#"><i className="fas fa-boxes"></i> Add Inventory</a>
                        <a href="#"><i className="fas fa-tasks"></i> Add Activities</a>
                    </div>
                </div>
            </div>

            <div className="header-right">
                <div className="search-min">
                    <i className="fas fa-search" style={{ fontSize: '0.9rem', color: '#68737d', marginRight: '8px' }}></i>
                    <input type="text" placeholder="Search contacts, leads, properties..." />
                </div>

                {/* Phone Icon - left hand position */}
                <i
                    className="fas fa-phone-alt header-icon"
                    style={{
                        transform: 'scaleX(-1) rotate(15deg)',
                        fontSize: '1.15rem'
                    }}
                ></i>

                {/* Notification Bell - Enhanced with animation */}
                <div style={{ position: 'relative' }}>
                    <i
                        className="fas fa-bell header-icon"
                        style={{
                            fontSize: '1.4rem',
                            animation: unreadCount > 0 ? 'bellRing 2s ease-in-out infinite' : 'none'
                        }}
                        onClick={() => {
                            setShowNotifications(!showNotifications);
                            setUnreadCount(0);
                        }}
                    ></i>
                    {unreadCount > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: '#ef4444',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '10px',
                            height: '10px',
                            border: '2px solid #fff',
                            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                        }}></span>
                    )}

                    {showNotifications && (
                        <div style={{
                            position: 'absolute',
                            top: '40px',
                            right: '0',
                            width: '320px',
                            background: '#fff',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                            borderRadius: '12px',
                            zIndex: 100,
                            border: '1px solid #e2e8f0',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Notifications</h3>
                                <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 600 }}>Mark all as read</span>
                            </div>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {notifications.map(n => (
                                    <div key={n.id} style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${n.color}15`, color: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <i className={n.icon} style={{ fontSize: '0.9rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontSize: '0.85rem', color: '#1e293b', margin: '0 0 4px 0', lineHeight: 1.4 }}>{n.text}</p>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{n.time}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div
                                style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer', background: '#f8fafc' }}
                                onClick={() => { setShowNotifications(false); onNavigate('settings'); }}
                            >
                                All notifications
                            </div>
                        </div>
                    )}
                </div>

                {/* Profile BP Dropdown */}
                <div className="profile-wrapper">
                    <div className="profile-circle">BP</div>
                    <div className="profile-dropdown-content">
                        <div className="p-dropdown-header">
                            <strong>Bharat Properties</strong>
                            <span>Administrator</span>
                        </div>
                        <div className="p-dropdown-divider"></div>
                        <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('profile'); }}>
                            <i className="fas fa-user-circle"></i> Profile
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('settings'); }}>
                            <i className="fas fa-cog"></i> Setting
                        </a>
                        <div className="p-dropdown-divider"></div>
                        <a href="#" onClick={(e) => { e.preventDefault(); console.log('Logout'); }} style={{ color: '#ef4444' }}>
                            <i className="fas fa-sign-out-alt"></i> Logout
                        </a>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
