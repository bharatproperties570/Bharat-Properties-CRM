import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { api } from '../../utils/api';

const ActivityRelatedTo = ({ relatedTo = [], participants = [], onAddRelation, onRemoveRelation }) => {
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

    const fetchResults = useCallback(async (term) => {
        if (!term || term.length < 2) {
            setSearchResults({ leads: [], contacts: [] });
            return;
        }

        setIsSearching(true);
        try {
            const [leadsRes, contactsRes] = await Promise.all([
                api.get('/leads', { params: { search: term, limit: 5 } }),
                api.get('/contacts', { params: { search: term, limit: 5 } })
            ]);

            setSearchResults({
                leads: leadsRes.data?.records || leadsRes.data?.data || (Array.isArray(leadsRes.data) ? leadsRes.data : []),
                contacts: contactsRes.data?.records || contactsRes.data?.data || (Array.isArray(contactsRes.data) ? contactsRes.data : [])
            });
            setShowResults(true);
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        if (debouncedSearch) {
            fetchResults(debouncedSearch);
        } else {
            setSearchResults({ leads: [], contacts: [] });
            setShowResults(false);
        }
    }, [debouncedSearch, fetchResults]);

    const handleSelect = (item, model) => {
        if (onAddRelation) {
            onAddRelation({
                id: item._id || item.id,
                name: item.fullName || item.name || 'Unknown',
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
                        background: '#f0fdf4',
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
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
                        placeholder="Search Lead or Contact to link..."
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 36px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.9rem',
                            backgroundColor: '#f8fafc',
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
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        border: '1px solid #e2e8f0',
                        marginTop: '8px',
                        zIndex: 100,
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        {/* Leads */}
                        {searchResults.leads.length > 0 && (
                            <div>
                                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Leads</div>
                                {searchResults.leads.map(lead => (
                                    <div 
                                        key={lead._id} 
                                        onClick={() => handleSelect(lead, 'Lead')}
                                        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                                            <i className="fas fa-bullseye" style={{ fontSize: '0.8rem' }}></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{lead.fullName || lead.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{lead.mobile || lead.email || 'Lead'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Contacts */}
                        {searchResults.contacts.length > 0 && (
                            <div>
                                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Contacts</div>
                                {searchResults.contacts.map(contact => (
                                    <div 
                                        key={contact._id} 
                                        onClick={() => handleSelect(contact, 'Contact')}
                                        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                                            <i className="fas fa-user" style={{ fontSize: '0.8rem' }}></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{contact.name || contact.fullName}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{contact.mobile || contact.email || 'Contact'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {searchResults.leads.length === 0 && searchResults.contacts.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No matches found</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityRelatedTo;
