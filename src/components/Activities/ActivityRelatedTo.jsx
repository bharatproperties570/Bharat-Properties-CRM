import { useTheme } from '../../context/ThemeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { api } from '../../utils/api';

const ActivityRelatedTo = ({ relatedTo = [], participants = [], onAddRelation, onRemoveRelation }) => {
    const { isDark } = useTheme();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState({ leads: [], contacts: [] });
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const debouncedSearch = useDebounce(searchTerm, 500);
    const dropdownRef = useRef(null);

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getItemName = (item) => {
        if (!item) return 'Unknown';
        if (item.fullName && typeof item.fullName === 'string' && !item.fullName.includes('null') && !item.fullName.includes('undefined')) return item.fullName;
        if (item.name && typeof item.name === 'string' && !item.name.includes('null') && !item.name.includes('undefined')) return item.name;
        const combined = `${item.firstName || ''} ${item.lastName || ''}`.trim();
        if (combined) return combined;
        return item.mobile || item.email || 'Lead/Contact';
    };

    const fetchResults = useCallback(async (term) => {
        const trimmed = (term || '').trim();
        if (!trimmed) {
            setSearchResults({ leads: [], contacts: [] });
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const [leadsRes, contactsRes] = await Promise.all([
                api.get('/leads', { params: { search: trimmed, limit: 10 } }).catch(() => null),
                api.get('/contacts', { params: { search: trimmed, limit: 10 } }).catch(() => null)
            ]);

            const extractRecords = (res) => {
                if (!res) return [];
                const d = res.data;
                if (Array.isArray(d)) return d;
                if (Array.isArray(d?.data)) return d.data;
                if (Array.isArray(d?.records)) return d.records;
                if (Array.isArray(res?.records)) return res.records;
                return [];
            };

            setSearchResults({
                leads: extractRecords(leadsRes),
                contacts: extractRecords(contactsRes)
            });
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        if (debouncedSearch && debouncedSearch.trim().length > 0) {
            fetchResults(debouncedSearch);
        } else {
            setSearchResults({ leads: [], contacts: [] });
            setIsSearching(false);
        }
    }, [debouncedSearch, fetchResults]);

    const handleSelect = (item, model) => {
        if (onAddRelation) {
            onAddRelation({
                id: item._id || item.id,
                name: getItemName(item),
                model: model
            });
        }
        setSearchTerm('');
        setShowResults(false);
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {relatedTo.map((item, idx) => (
                    <div key={idx} style={{
                        padding: '6px 12px',
                        background: 'linear-gradient(to right, #eff6ff, #f8fafc)',
                        border: '1px solid #bfdbfe',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#1e40af'
                    }}>
                        <i className={item.model === 'Lead' ? 'fas fa-bullseye' : item.model === 'Deal' ? 'fas fa-handshake' : 'fas fa-user'}></i>
                        {item.name}
                        <span style={{ fontSize: '0.65rem', color: '#60a5fa', fontWeight: 700 }}>{item.model}</span>
                        {onRemoveRelation && (
                            <i 
                                className="fas fa-times" 
                                onClick={() => onRemoveRelation(item.id || item._id)}
                                style={{ cursor: 'pointer', marginLeft: '4px', opacity: 0.6 }}
                            ></i>
                        )}
                    </div>
                ))}

                {participants?.map((p, idx) => (
                    <div key={idx} style={{
                        padding: '6px 12px',
                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#166534'
                    }}>
                        <i className="fas fa-user-friends"></i>
                        {p.name}
                    </div>
                ))}
            </div>

            <div style={{ position: 'relative' }} ref={dropdownRef}>
                <div style={{ position: 'relative' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (e.target.value.trim().length > 0) setShowResults(true);
                        }}
                        onFocus={() => {
                            setShowResults(true);
                            if (searchTerm.trim().length > 0) fetchResults(searchTerm);
                        }}
                        placeholder="Search Lead or Contact to link..."
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 36px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.9rem',
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                            outline: 'none',
                            transition: 'all 0.2s'
                        }}
                    />
                    {isSearching && (
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                            <i className="fas fa-spinner fa-spin" style={{ color: '#3b82f6' }}></i>
                        </div>
                    )}
                </div>

                {showResults && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                        border: '1px solid #e2e8f0',
                        marginTop: '8px',
                        zIndex: 100,
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        {isSearching ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <i className="fas fa-spinner fa-spin" style={{ color: '#3b82f6' }}></i> Searching leads and contacts...
                            </div>
                        ) : (
                            <>
                                {/* Leads */}
                                {searchResults.leads.length > 0 && (
                                    <div>
                                        <div style={{ padding: '8px 12px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Leads</div>
                                        {searchResults.leads.map(lead => (
                                            <div 
                                                key={lead._id || lead.id} 
                                                onClick={() => handleSelect(lead, 'Lead')}
                                                style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                                onMouseOver={e => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}
                                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                                                    <i className="fas fa-bullseye" style={{ fontSize: '0.8rem' }}></i>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? 'var(--text-main)' : '#1e293b' }}>{getItemName(lead)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{lead.mobile || lead.email || 'Lead'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Contacts */}
                                {searchResults.contacts.length > 0 && (
                                    <div>
                                        <div style={{ padding: '8px 12px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Contacts</div>
                                        {searchResults.contacts.map(contact => (
                                            <div 
                                                key={contact._id || contact.id} 
                                                onClick={() => handleSelect(contact, 'Contact')}
                                                style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                                onMouseOver={e => e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}
                                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                                                    <i className="fas fa-user" style={{ fontSize: '0.8rem' }}></i>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? 'var(--text-main)' : '#1e293b' }}>{getItemName(contact)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{contact.mobile || contact.email || 'Contact'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No matches found ONLY when user has typed text */}
                                {searchTerm.trim().length > 0 && searchResults.leads.length === 0 && searchResults.contacts.length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                        No matches found for "{searchTerm}"
                                    </div>
                                )}

                                {/* Empty input placeholder */}
                                {searchTerm.trim().length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                        Type a name, mobile, or email to search...
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityRelatedTo;
