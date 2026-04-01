import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { useUserContext } from '../context/UserContext';
import SearchDropdown from './SearchDropdown';

// Modular Components
import NotificationDropdown from './Header/NotificationDropdown';
import HeaderActionMenu from './Header/HeaderActionMenu';
import ProfileMenu from './Header/ProfileMenu';

// Hooks
import { useNotifications } from '../hooks/useNotifications';

function Header({ onNavigate, onAddContact, onAddLead, onAddActivity, onAddCompany, onAddProject, onAddInventory, onAddDeal }) {
    const { currentUser, logout } = useUserContext();
    const { 
        showNotifications, 
        setShowNotifications, 
        unreadCount, 
        notifications, 
        handleMarkAllRead, 
        handleReadNotification 
    } = useNotifications(onNavigate);

    const searchDebounceRef = useRef(null);

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState({ contacts: [], leads: [] });
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    // Global Search — dedicated /api/search endpoint handles contacts + leads + inventory/deal owners
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
            const res = await api.get('/search', { params: { q: term, limit: 5 } });
            const body = res?.data || {};
            setSearchResults({
                contacts: Array.isArray(body.contacts) ? body.contacts : [],
                leads: Array.isArray(body.leads) ? body.leads : [],
            });
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

    return (
        <header className="header">
            <div className="header-left">
                <HeaderActionMenu 
                    onAddContact={onAddContact}
                    onAddCompany={onAddCompany}
                    onAddLead={onAddLead}
                    onAddDeal={onAddDeal}
                    onAddProject={onAddProject}
                    onAddInventory={onAddInventory}
                    onAddActivity={onAddActivity}
                />
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

                    <SearchDropdown 
                        showSearchDropdown={showSearchDropdown}
                        isSearching={isSearching}
                        searchResults={searchResults}
                        searchTerm={searchTerm}
                        onNavigate={onNavigate}
                        setSearchTerm={setSearchTerm}
                        setShowSearchDropdown={setShowSearchDropdown}
                    />
                </div>

                <i
                    className="fas fa-phone-alt header-icon"
                    style={{
                        transform: 'scaleX(-1) rotate(5deg)',
                        fontSize: '1.15rem'
                    }}
                ></i>

                <div style={{ position: 'relative' }}>
                    <i
                        className="fas fa-bell header-icon"
                        style={{
                            fontSize: '1.4rem',
                            animation: unreadCount > 0 ? 'bellRing 2s ease-in-out infinite' : 'none'
                        }}
                        onClick={() => setShowNotifications(!showNotifications)}
                    ></i>
                    {unreadCount > 0 && (
                        <span style={{
                            position: 'absolute', top: '2px', right: '2px', background: '#ef4444',
                            color: '#fff', borderRadius: '50%', width: '10px', height: '10px',
                            border: '2px solid #fff', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                        }}></span>
                    )}

                    <NotificationDropdown 
                        showNotifications={showNotifications}
                        setShowNotifications={setShowNotifications}
                        notifications={notifications}
                        unreadCount={unreadCount}
                        handleMarkAllRead={handleMarkAllRead}
                        handleReadNotification={handleReadNotification}
                        onNavigate={onNavigate}
                    />
                </div>

                <ProfileMenu 
                    currentUser={currentUser}
                    logout={logout}
                    onNavigate={onNavigate}
                />
            </div>
        </header>
    );
}

export default Header;

// Styles for animations
const styles = `
@keyframes bellRing {
  0% { transform: scale(1.4) rotate(0); }
  10% { transform: scale(1.4) rotate(15deg); }
  20% { transform: scale(1.4) rotate(-15deg); }
  30% { transform: scale(1.4) rotate(10deg); }
  40% { transform: scale(1.4) rotate(-10deg); }
  50% { transform: scale(1.4) rotate(5deg); }
  60% { transform: scale(1.4) rotate(-5deg); }
  100% { transform: scale(1.4) rotate(0); }
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
`;

if (typeof document !== 'undefined') {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}
