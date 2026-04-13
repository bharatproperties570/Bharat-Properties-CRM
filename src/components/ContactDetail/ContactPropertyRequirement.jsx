import React from 'react';

const ContactPropertyRequirement = React.memo(function ContactPropertyRequirement({
    contact,
    aiStats,
    expandedSections,
    toggleSection,
    renderLookup,
    onEdit
}) {
    return (
        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.08)' }}>
            <div onClick={() => toggleSection('property_req')} style={{ padding: '14px 20px', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-home"></i> Property Requirement
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit?.();
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#059669', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                        title="Edit Requirement"
                    >
                        <i className="fas fa-edit" style={{ fontSize: '0.85rem' }}></i>
                    </button>
                    <i className={`fas fa-chevron-${expandedSections.includes('property_req') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                </div>
            </div>
            {expandedSections.includes('property_req') && (
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Group 1: Specifications */}
                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                            <i className="fas fa-list-ul"></i> Requirements
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Intent Type</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.dealType || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Property Category</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.type || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Sub-Categories</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', wordBreak: 'break-word' }}>{aiStats.preferences.subType?.join(', ') || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Area Specs</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.area || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Preferred Sizes</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', wordBreak: 'break-word' }}>{aiStats.preferences.unitType?.join(', ') || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Furnishing Status</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.furnishing || '-'}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#f1f5f9', margin: '8px 0' }}></div>

                    {/* Group 2: Financials & Location Search */}
                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                            <i className="fas fa-coins"></i> Transaction & Geography
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Budget Bracket</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.budget || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Transaction Type</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.transactionType || '-'} <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>(W: {aiStats.preferences.flexibility || '0'})</span></div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Funding</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.funding || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Timeline</label>
                                <span className="pill" style={{ background: '#fff7ed', color: '#9a3412', fontSize: '0.7rem', fontWeight: 800 }}>{aiStats.preferences.urgency?.toUpperCase() || 'NORMAL'}</span>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Search Locations (Radius: {aiStats.preferences.range || '0'})</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', wordBreak: 'break-word', minWidth: '0' }}>
                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                    {aiStats.preferences.locations?.join(', ') || 'No locations specified'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

ContactPropertyRequirement.displayName = 'ContactPropertyRequirement';

export default ContactPropertyRequirement;
