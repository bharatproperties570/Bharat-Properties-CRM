import React from 'react';

const ContactPreferences = React.memo(function ContactPreferences({
    contact,
    expandedSections,
    toggleSection,
    aiStats
}) {
    if (!expandedSections.includes('pref')) {
        return (
            <div className="glass-card" style={{ borderRadius: '16px' }}>
                <div onClick={() => toggleSection('pref')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Property Preferences</span>
                    <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ borderRadius: '16px' }}>
            <div onClick={() => toggleSection('pref')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Property Preferences</span>
                <i className="fas fa-chevron-up" style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', background: 'transparent' }}>

                {/* Group 1: Acquisition Intelligence */}
                <div>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                        <i className="fas fa-bullhorn"></i> Acquisition Intelligence
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Lead Source</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.source}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Sub-Source</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.subSource}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Campaign</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.campaign}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Visibility Scope</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.visibleTo || 'Everyone'}</div>
                        </div>
                        <div style={{ gridColumn: 'span 4' }}>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Lead Description</label>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                {aiStats.preferences.description || 'No description provided.'}
                            </div>
                        </div>
                        <div style={{ gridColumn: 'span 4' }}>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Tags</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {aiStats.preferences.tags.length > 0 ? aiStats.preferences.tags.map((tag, idx) => (
                                    <span key={idx} style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #dbeafe' }}>{tag}</span>
                                )) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No tags assigned</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                {/* Group 2: Property Requirement Details */}
                <div>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                        <i className="fas fa-home"></i> Property Requirement
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Intent Type</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.dealType}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Property Category</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.type}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Sub-Categories</label>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{aiStats.preferences.subType?.join(', ') || '-'}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Area Specs</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.area}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Preferred Sizes</label>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{aiStats.preferences.unitType?.join(', ') || '-'}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Furnishing Status</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.furnishing}</div>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9' }}></div>

                {/* Group 3: Financials & Location Search */}
                <div>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                        <i className="fas fa-coins"></i> Transaction & Geography
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Budget Bracket</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.budget}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Transaction Type</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.transactionType} <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>(W: {aiStats.preferences.flexibility})</span></div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Funding</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{aiStats.preferences.funding}</div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Timeline</label>
                            <span className="pill" style={{ background: '#fff7ed', color: '#9a3412', fontSize: '0.7rem', fontWeight: 800 }}>{aiStats.preferences.urgency.toUpperCase()}</span>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Search Locations (Radius: {aiStats.preferences.range})</label>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                {aiStats.preferences.locations?.join(', ') || 'No locations specified'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Rejection Alert Overlay */}
                {aiStats.rejectionAlert && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444' }}></i>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>AI Constraint Warning</label>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{aiStats.rejectionAlert}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ContactPreferences.displayName = 'ContactPreferences';

export default ContactPreferences;
