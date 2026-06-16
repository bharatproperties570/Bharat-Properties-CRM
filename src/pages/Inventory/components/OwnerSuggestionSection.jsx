import { useTheme } from '../../../context/ThemeContext';
import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { renderValue } from '../../../utils/renderUtils';
import { getInitials } from '../../../utils/helpers';
import toast from 'react-hot-toast';

const OwnerSuggestionSection = ({ inventory, onRefresh }) => {
    const { isDark } = useTheme();
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showLocationMatches, setShowLocationMatches] = useState(false);
    const inventoryId = inventory?._id;

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                setLoading(true);
                const res = await api.get(`inventory/${inventoryId}/suggested-owners`);
                if (res.data?.success) {
                    setSuggestions(res.data.data);
                }
            } catch (err) {
                console.error("Failed to fetch suggested owners:", err);
            } finally {
                setLoading(false);
            }
        };

        if (inventoryId) fetchSuggestions();
    }, [inventoryId]);

    const handleQuickAdd = async (contact) => {
        try {
            const toastId = toast.loading(`Linking ${contact.name}...`);
            
            const currentOwnerIds = (inventory.owners || []).map(o => o._id || o.id || o);
            if (currentOwnerIds.includes(contact._id)) {
                toast.error("Already linked", { id: toastId });
                return;
            }

            const newHistoryEntry = {
                contactName: contact.name,
                contactMobile: contact.phones?.[0]?.number || '',
                contactId: contact._id,
                role: 'Property Owner',
                source: 'Address Intelligence Suggestion',
                date: new Date().toISOString(),
                type: 'Added'
            };

            const updates = {
                owners: [...currentOwnerIds, contact._id],
                ownerHistory: [...(inventory.ownerHistory || []), newHistoryEntry]
            };

            const res = await api.put(`inventory/${inventoryId}`, updates);
            
            if (res.data?.success) {
                toast.success(`${contact.name} linked successfully`, { id: toastId });
                setSuggestions(prev => prev.filter(c => c._id !== contact._id));
                if (onRefresh) onRefresh();
            } else {
                toast.error("Failed to link contact", { id: toastId });
            }
        } catch (err) {
            console.error("Quick add error:", err);
            toast.error("An error occurred");
        }
    };

    if (loading) return (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', background: 'var(--bg-gray)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }}></div>
                <div style={{ height: '14px', width: '120px', background: 'var(--bg-gray)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
            </div>
            {[1, 2].map(i => (
                <div key={i} style={{ height: '60px', background: 'var(--bg-gray)', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
            ))}
        </div>
    );

    const highConfidence = suggestions.filter(c => c.matchConfidence >= 80);
    const locationMatches = suggestions.filter(c => c.matchConfidence < 80);

    const renderContact = (contact) => {
        const addr = contact.personalAddress || contact.correspondenceAddress || {};
        const addrStr = [addr.hNo, addr.area || addr.location, addr.city].filter(Boolean).join(', ');
        
        return (
            <div key={contact._id} style={{ 
                padding: '12px', 
                background: 'var(--bg-card)', 
                borderRadius: '16px', 
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: '10px', 
                    background: 'var(--bg-gray)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)'
                }}>
                    {getInitials(contact.name)}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 850, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <i className="fas fa-map-marker-alt" style={{ fontSize: '0.55rem' }}></i>
                        <span>{addrStr}</span>
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ 
                            fontSize: '0.55rem', 
                            fontWeight: 800, 
                            padding: '2px 6px', 
                            borderRadius: '12px',
                            background: contact.matchConfidence === 100 ? 'rgba(34, 197, 94, 0.1)' : 
                                        contact.matchConfidence === 80 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: contact.matchConfidence === 100 ? '#22c55e' : 
                                   contact.matchConfidence === 80 ? '#3b82f6' : isDark ? 'var(--text-muted)' : '#64748b',
                            border: contact.matchConfidence === 100 ? '1px solid rgba(34, 197, 94, 0.2)' : 
                                    contact.matchConfidence === 80 ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(100, 116, 139, 0.2)'
                        }}>
                            {contact.matchConfidence === 100 ? 'Direct H.No Match' : 
                             contact.matchConfidence === 80 ? 'Fuzzy Match' : 'Location Option (Blank H.No)'}
                        </span>
                    </div>
                </div>

                <button 
                    onClick={() => handleQuickAdd(contact)}
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#4f46e5',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 8px rgba(79, 70, 229, 0.15)'
                    }}
                    title="Quick Link"
                >
                    <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                </button>
            </div>
        );
    };

    return (
        <div className="glass-card" style={{ border: '1px solid rgba(79, 70, 229, 0.1)', minHeight: '120px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-lightbulb" style={{ color: '#4f46e5', fontSize: '0.9rem' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)' }}>Owner Suggestions</h3>
                        <p style={{ margin: 0, fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Intelligence Match</p>
                    </div>
                </div>
                {suggestions.length > 0 && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#4f46e5', background: 'rgba(79, 70, 229, 0.05)', padding: '4px 8px', borderRadius: '20px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                        {suggestions.length} MATCH{suggestions.length > 1 ? 'ES' : ''}
                    </span>
                )}
            </div>

            {suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 10px', background: 'var(--bg-gray)', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                    <i className="fas fa-search-location" style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '8px' }}></i>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>No potential owner matches found in this location.</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500 }}>Matching is based on Unit No & City intelligence.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {highConfidence.length > 0 ? (
                        highConfidence.map(renderContact)
                    ) : (
                        <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-gray)', borderRadius: '12px', border: '1px dashed #e2e8f0', marginBottom: '8px' }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>No exact or fuzzy unit matches found.</p>
                        </div>
                    )}

                    {locationMatches.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                            <button 
                                onClick={() => setShowLocationMatches(!showLocationMatches)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: showLocationMatches ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span>
                                    <i className="fas fa-map-marked-alt" style={{ marginRight: '6px', color: 'var(--text-muted)' }}></i>
                                    Show Location-Based Options ({locationMatches.length})
                                </span>
                                <i className={`fas fa-chevron-${showLocationMatches ? 'up' : 'down'}`} style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}></i>
                            </button>
                            
                            {showLocationMatches && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', paddingLeft: '8px', borderLeft: '2px solid #f1f5f9' }}>
                                    {locationMatches.map(renderContact)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default OwnerSuggestionSection;
