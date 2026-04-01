import React from 'react';

const ContactHistory = React.memo(function ContactHistory({
    historyProperties,
    expandedSections,
    toggleSection
}) {
    return (
        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.3)', boxShadow: '0 8px 32px 0 rgba(148, 163, 184, 0.05)' }}>
            <div onClick={() => toggleSection('history')} style={{ padding: '14px 20px', background: 'rgba(148, 163, 184, 0.05)', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-history"></i> History (Previously Owned)
                </span>
                <i className={`fas fa-chevron-${expandedSections.includes('history') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#64748b' }}></i>
            </div>
            {expandedSections.includes('history') && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {historyProperties.length > 0 ? (
                        historyProperties.map((prop, idx) => (
                            <div key={idx} style={{
                                padding: '10px 14px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                background: '#f8fafc',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                position: 'relative',
                                opacity: 0.85
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: '40px', height: '40px',
                                        background: '#f1f5f9',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <i className={`fas ${(() => {
                                            const t = prop.type?.toLowerCase() || '';
                                            if (t.includes('plot')) return 'fa-map-location-dot';
                                            if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                                            if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                                            if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                            return 'fa-building';
                                        })()}`} style={{ color: '#94a3b8', fontSize: '1rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textDecoration: 'line-through' }}>
                                                    {(prop.unitNumber || prop.unitNo) && `Unit #${prop.unitNumber || prop.unitNo} • `}{prop.type}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{prop.location || prop.area}</div>
                                            </div>
                                            <span style={{
                                                background: '#f1f5f9',
                                                color: '#64748b',
                                                fontSize: '0.55rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontWeight: 800
                                            }}>PREVIOUSLY OWNED</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No historical properties found.</div>
                    )}
                </div>
            )}
        </div>
    );
});

ContactHistory.displayName = 'ContactHistory';

export default ContactHistory;
