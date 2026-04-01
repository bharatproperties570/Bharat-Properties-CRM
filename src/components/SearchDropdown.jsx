import React from 'react';

const SearchDropdown = React.memo(function SearchDropdown({ 
    showSearchDropdown, 
    isSearching, 
    searchResults, 
    searchTerm, 
    onNavigate, 
    setSearchTerm, 
    setShowSearchDropdown 
}) {
    if (!showSearchDropdown) return null;

    return (
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
    );
});

SearchDropdown.displayName = 'SearchDropdown';

export default SearchDropdown;
