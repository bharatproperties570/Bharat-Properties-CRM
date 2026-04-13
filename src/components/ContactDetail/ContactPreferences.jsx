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
            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'transparent' }}>

                {/* Group 1: Acquisition Intelligence */}
                <div>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#6366f1', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                        <i className="fas fa-bullhorn"></i> Acquisition Intelligence
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
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
                        <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Lead Description</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9', wordBreak: 'break-word' }}>
                                    {aiStats.preferences.description || 'No description provided.'}
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Tags</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {aiStats.preferences.tags.length > 0 ? aiStats.preferences.tags.map((tag, idx) => (
                                        <span key={idx} style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #dbeafe' }}>{tag}</span>
                                    )) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No tags assigned</span>}
                                </div>
                            </div>
                    </div>
                </div>



            </div>
        </div>
    );
});

ContactPreferences.displayName = 'ContactPreferences';

export default ContactPreferences;
