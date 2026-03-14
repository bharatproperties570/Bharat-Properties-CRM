import React, { useState, useEffect, useRef } from 'react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../utils/api';
import toast from 'react-hot-toast';

// Mock data removed
const contactData = [];
const leadData = [];
const inventoryData = [];

function Header({ onNavigate, onAddContact, onAddLead, onAddActivity, onAddCompany, onAddProject, onAddInventory, onAddDeal }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [profilePicture, setProfilePicture] = useState('');
    const fileInputRef = useRef(null);

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState({ contacts: [], leads: [], inventory: [] });
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    // Load profile picture from localStorage
    useEffect(() => {
        const savedPicture = localStorage.getItem('userProfilePicture');
        if (savedPicture) {
            setProfilePicture(savedPicture);
        }
    }, []);

    // Handle profile picture upload
    const handlePictureUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                alert('Image size should be less than 2MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result;
                setProfilePicture(base64);
                localStorage.setItem('userProfilePicture', base64);
            };
            reader.readAsDataURL(file);
        }
    };

    // Search Logic
    useEffect(() => {
        if (searchTerm.trim().length < 2) {
            setSearchResults({ contacts: [], leads: [], inventory: [] });
            setShowSearchDropdown(false);
            return;
        }

        const term = searchTerm.toLowerCase();
        const cleanTerm = term.replace(/\D/g, ''); // For phone matching

        const matchedContacts = contactData.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.mobile && c.mobile.replace(/\D/g, '').includes(cleanTerm)) ||
            (c.email && c.email.toLowerCase().includes(term))
        ).slice(0, 3);

        const matchedLeads = leadData.filter(l =>
            l.name.toLowerCase().includes(term) ||
            (l.mobile && l.mobile.replace(/\D/g, '').includes(cleanTerm))
        ).slice(0, 3);

        const matchedInventory = inventoryData.filter(i =>
            (i.unitNo && i.unitNo.toLowerCase().includes(term)) ||
            (i.ownerName && i.ownerName.toLowerCase().includes(term)) ||
            (i.ownerPhone && i.ownerPhone.replace(/\D/g, '').includes(cleanTerm)) ||
            (i.location && i.location.toLowerCase().includes(term)) ||
            (i.area && i.area.toLowerCase().includes(term))
        ).slice(0, 3);

        setSearchResults({ contacts: matchedContacts, leads: matchedLeads, inventory: matchedInventory });
        setShowSearchDropdown(true);

    }, [searchTerm]);

    // Notifications Logic
    const fetchNotifications = async () => {
        try {
            const res = await getNotifications();
            if (res.success) {
                setNotifications(res.data.notifications || []);
                setUnreadCount(res.data.unreadCount || 0);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every 60 seconds
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

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

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'assignment': return { icon: 'fas fa-bullseye', color: '#2563eb' };
            case 'task': return { icon: 'fas fa-tasks', color: '#f59e0b' };
            case 'mention': return { icon: 'fas fa-at', color: '#10b981' };
            case 'stage_change': return { icon: 'fas fa-exchange-alt', color: '#8b5cf6' };
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
        <header className="header">
            <div className="header-left">
                <div className="add-dropdown">
                    <button className="add-btn" id="addBtn">
                        <span>Add</span>
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }}></i>
                    </button>
                    <div className="dropdown-menu">
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddContact(); }}><i className="fas fa-user-plus"></i> Add Contact</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddCompany(); }}><i className="fas fa-building"></i> Add Company</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddLead(); }}><i className="fas fa-filter"></i> Add Lead</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddDeal(); }}><i className="fas fa-handshake"></i> Add Deal</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddProject(); }}><i className="fas fa-building"></i> Add Project</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddInventory(); }}><i className="fas fa-boxes"></i> Add Inventory</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); onAddActivity(); }}><i className="fas fa-tasks"></i> Add Activities</a>
                    </div>
                </div>
            </div>

            <div className="header-right">
                <div className="search-min" style={{ position: 'relative' }}>
                    <i className="fas fa-search" style={{ fontSize: '0.9rem', color: '#68737d', marginRight: '8px' }}></i>
                    <input
                        type="text"
                        placeholder="Search contacts, leads, properties..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                        onFocus={() => searchTerm.length >= 2 && setShowSearchDropdown(true)}
                    />

                    {/* Search Results Dropdown */}
                    {showSearchDropdown && (
                        <div style={{
                            position: 'absolute',
                            top: '40px',
                            left: 0,
                            width: '100%',
                            minWidth: '300px',
                            background: '#fff',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            border: '1px solid #e2e8f0',
                            zIndex: 1000,
                            maxHeight: '400px',
                            overflowY: 'auto'
                        }}>
                            {(searchResults.contacts.length === 0 && searchResults.leads.length === 0 && searchResults.inventory.length === 0) ? (
                                <div style={{ padding: '12px', color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>No results found</div>
                            ) : (
                                <>
                                    {searchResults.contacts.length > 0 && (
                                        <div style={{ padding: '8px 0' }}>
                                            <div style={{ background: '#f8fafc', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Contacts</div>
                                            {searchResults.contacts.map((c, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseDown={() => {
                                                        // Use onMouseDown to trigger before onBlur
                                                        onNavigate('contact-detail', c.mobile); // Assuming mobile is ID or we use index? mockData doesn't always have ID. c.mobile often used as key.
                                                        setSearchTerm('');
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div>
                                                        <div style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 500 }}>{c.name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.mobile}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Contact</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {searchResults.leads.length > 0 && (
                                        <div style={{ padding: '8px 0' }}>
                                            <div style={{ background: '#f8fafc', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Leads</div>
                                            {searchResults.leads.map((l, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseDown={() => {
                                                        onNavigate('leads'); // Leads don't have detail view yet in navigation logic
                                                        setSearchTerm('');
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div>
                                                        <div style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 500 }}>{l.name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{l.mobile}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#f59e0b' }}>Lead</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {searchResults.inventory.length > 0 && (
                                        <div style={{ padding: '8px 0' }}>
                                            <div style={{ background: '#f8fafc', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Inventory</div>
                                            {searchResults.inventory.map((i, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseDown={() => {
                                                        onNavigate('projects'); // Inventory usually linked to projects? Or just go to inventory list? onNavigate doesn't strictly support 'inventory' in the switch?
                                                        // App.jsx: if (path === '/projects') return 'projects';
                                                        // It doesn't seem to have explicit inventory route in App.jsx switch I read earlier?
                                                        // Wait, App.jsx line 43: if (path === '/projects') return 'projects';
                                                        // Checked App.jsx again. Line 36..48.
                                                        // It doesn't have 'inventory'. It probably shares 'projects' view or I missed it.
                                                        // Wait, I read: "if (path === '/activities') return 'activities';"
                                                        // I don't see 'inventory'.
                                                        // BUT Sidebar typically has Inventory.
                                                        // Let's assume 'projects' or I should add 'inventory' to App.jsx?
                                                        // Sidebar.jsx probably triggers onNavigate('inventory').
                                                        // Let's check App.jsx again if I can... 
                                                        // Actually, I'll just use 'projects' for now as safe bet or 'inventory' if it works.
                                                        // I'll try 'inventory'. If App.jsx handles generic defaults:
                                                        // "else url = `/${view}`;" (line 76)
                                                        // So onNavigate('inventory') -> /inventory
                                                        onNavigate('inventory');
                                                        setSearchTerm('');
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div>
                                                        <div style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 500 }}>{i.unitNo} {i.location}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{i.area}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#10b981' }}>Unit</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Phone Icon - left hand position */}
                <i
                    className="fas fa-phone-alt header-icon"
                    style={{
                        transform: 'scaleX(-1) rotate(5deg)',
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
                                {unreadCount > 0 && <span style={{ fontSize: '0.8rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }} onClick={handleMarkAllRead}>Mark all as read</span>}
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
                    )}
                </div>

                {/* Profile BP Dropdown */}
                <div className="profile-wrapper">
                    <div
                        className="profile-circle"
                        style={{ position: 'relative', overflow: 'hidden' }}
                        title="Profile"
                    >
                        {profilePicture ? (
                            <img
                                src={profilePicture}
                                alt="Profile"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            'BP'
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handlePictureUpload}
                    />
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
