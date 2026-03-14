import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, api } from '../utils/api';
import toast from 'react-hot-toast';

function Header({ onNavigate, onAddContact, onAddLead, onAddActivity, onAddCompany, onAddProject, onAddInventory, onAddDeal }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [profilePicture, setProfilePicture] = useState('');
    const fileInputRef = useRef(null);
    const searchDebounceRef = useRef(null);

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState({ contacts: [], leads: [] });
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

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

    // Live Search — uses Axios api instance directly for correct param handling
    const performSearch = useCallback(async (term) => {
        if (!term || term.trim().length < 2) {
            setSearchResults({ contacts: [], leads: [] });
            setShowSearchDropdown(false);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        setShowSearchDropdown(true);
        try {
            const [cRes, lRes] = await Promise.all([
                api.get('/contacts', { params: { search: term, limit: 5 } }).catch(() => null),
                api.get('/leads', { params: { search: term, limit: 5 } }).catch(() => null),
            ]);

            // Axios wraps response in .data; backend returns { success, records: [...] }
            const cBody = cRes?.data || {};
            const lBody = lRes?.data || {};

            const contacts = Array.isArray(cBody.records) ? cBody.records
                : Array.isArray(cBody.data) ? cBody.data
                : Array.isArray(cBody.contacts) ? cBody.contacts
                : Array.isArray(cBody) ? cBody : [];

            const leads = Array.isArray(lBody.records) ? lBody.records
                : Array.isArray(lBody.data) ? lBody.data
                : Array.isArray(lBody.leads) ? lBody.leads
                : Array.isArray(lBody) ? lBody : [];

            setSearchResults({ contacts: contacts.slice(0, 5), leads: leads.slice(0, 5) });
        } catch (err) {
            console.error('[Search] Error:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);


    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!searchTerm || searchTerm.trim().length < 2) {
            setSearchResults({ contacts: [], leads: [] });
            setShowSearchDropdown(false);
            return;
        }
        searchDebounceRef.current = setTimeout(() => performSearch(searchTerm), 350);
        return () => clearTimeout(searchDebounceRef.current);
    }, [searchTerm, performSearch]);

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
                    {isSearching
                        ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '0.9rem', color: '#3b82f6', marginRight: '8px' }}></i>
                        : <i className="fas fa-search" style={{ fontSize: '0.9rem', color: '#68737d', marginRight: '8px' }}></i>
                    }
                    <input
                        type="text"
                        placeholder="Search contacts, leads..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onBlur={() => setTimeout(() => { setShowSearchDropdown(false); }, 250)}
                        onFocus={() => searchTerm.length >= 2 && setShowSearchDropdown(true)}
                        style={{ width: '220px' }}
                    />

                    {/* Search Results Dropdown */}
                    {showSearchDropdown && (
                        <div style={{
                            position: 'absolute',
                            top: '42px',
                            left: 0,
                            width: '100%',
                            minWidth: '340px',
                            background: '#fff',
                            borderRadius: '10px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            border: '1px solid #e2e8f0',
                            zIndex: 1000,
                            maxHeight: '420px',
                            overflowY: 'auto'
                        }}>
                            {isSearching ? (
                                <div style={{ padding: '20px', color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>
                                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px', color: '#3b82f6' }}></i>Searching...
                                </div>
                            ) : (searchResults.contacts.length === 0 && searchResults.leads.length === 0) ? (
                                <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center' }}>
                                    <i className="fas fa-search" style={{ display: 'block', fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }}></i>
                                    No results for &ldquo;{searchTerm}&rdquo;
                                </div>
                            ) : (
                                <>
                                    {/* Contacts */}
                                    {searchResults.contacts.length > 0 && (
                                        <div>
                                            <div style={{ background: '#f8fafc', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                                                <i className="fas fa-user" style={{ marginRight: '6px', color: '#3b82f6' }}></i>Contacts
                                            </div>
                                            {searchResults.contacts.map((c) => {
                                                const displayName = c.name || c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact';
                                                return (
                                                <div
                                                    key={c._id || c.id}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseDown={() => { onNavigate('contact-detail', c._id || c.id); setSearchTerm(''); setShowSearchDropdown(false); }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                                                            {displayName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 600 }}>{displayName}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.mobile || c.phone || c.email || ''}</div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: '#3b82f6', background: '#eff6ff', borderRadius: '4px', padding: '2px 8px', fontWeight: 600 }}>Contact</span>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Leads */}
                                    {searchResults.leads.length > 0 && (
                                        <div>
                                            <div style={{ background: '#f8fafc', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                                                <i className="fas fa-filter" style={{ marginRight: '6px', color: '#f59e0b' }}></i>Leads
                                            </div>
                                            {searchResults.leads.map((l) => {
                                                const displayName = l.fullName || [l.salutation, l.firstName, l.lastName].filter(Boolean).join(' ') || l.name || 'Lead';
                                                return (
                                                <div
                                                    key={l._id || l.id}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseDown={() => { onNavigate('lead-detail', l._id || l.id); setSearchTerm(''); setShowSearchDropdown(false); }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                                                            {displayName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 600 }}>{displayName}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{l.mobile || l.phone || l.email || ''}</div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: '#fffbeb', borderRadius: '4px', padding: '2px 8px', fontWeight: 600 }}>Lead</span>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div
                                        style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', background: '#f8fafc' }}
                                        onMouseDown={() => { onNavigate('contacts'); setSearchTerm(''); setShowSearchDropdown(false); }}
                                    >
                                        View all results →
                                    </div>
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
                            zIndex: 99999,
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
