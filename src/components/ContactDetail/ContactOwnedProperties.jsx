import React from 'react';

const ContactOwnedProperties = React.memo(function ContactOwnedProperties({
    ownedProperties,
    expandedSections,
    toggleSection,
    setIsInventoryModalOpen,
    renderValue,
    renderLookup
}) {
    return (
        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.08)' }}>
            <div onClick={() => toggleSection('owned')} style={{ padding: '14px 20px', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-building"></i> Owned Properties
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsInventoryModalOpen(true);
                        }}
                        style={{
                            background: '#059669',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                    </button>
                    <i className={`fas fa-chevron-${expandedSections.includes('owned') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                </div>
            </div>
            {expandedSections.includes('owned') && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {ownedProperties.length > 0 ? (
                        ownedProperties.map((prop, idx) => (
                            <div key={idx} style={{
                                padding: '10px 14px',
                                border: '1px solid #f1f5f9',
                                borderRadius: '12px',
                                background: '#fff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                position: 'relative'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: '40px', height: '40px',
                                        background: '#f0fdf4',
                                        border: '1px solid #dcfce7',
                                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <i className={`fas ${(() => {
                                            const t = prop.type?.toLowerCase() || '';
                                            if (t.includes('plot')) return 'fa-map-location-dot';
                                            if (t.includes('shop') || t.includes('showroom') || t.includes('sco')) return 'fa-store';
                                            if (t.includes('house') || t.includes('apartment')) return 'fa-home';
                                            if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                            return 'fa-building';
                                        })()}`} style={{ color: '#10b981', fontSize: '1rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                                    {(renderValue(prop.unitNumber) || renderValue(prop.unitNo)) && `Unit #${renderValue(prop.unitNumber) || renderValue(prop.unitNo)} • `}{renderLookup(prop.projectId) || renderLookup(prop.projectName) || 'Property'} {prop.block && `(Block: ${renderLookup(prop.block)})`}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                    {renderLookup(prop.subCategory) || renderLookup(prop.category) || renderLookup(prop.type)} • {renderLookup(prop.location) || renderLookup(prop.area) || renderValue(prop.locArea)}
                                                </div>
                                            </div>
                                            <span style={{
                                                background: prop.matchRole === 'ASSOCIATE' ? '#eff6ff' : '#ecfdf5',
                                                color: prop.matchRole === 'ASSOCIATE' ? '#2563eb' : '#059669',
                                                fontSize: '0.5rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontWeight: 900,
                                                border: `1px solid ${prop.matchRole === 'ASSOCIATE' ? '#dbeafe' : '#d1fae5'}`,
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {prop.matchRole === 'ASSOCIATE' ? `ASSOCIATE${prop.relationship ? ` - ${prop.relationship}` : ''}` : 'OWNER'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
                                                        {prop.sizeLabel ? prop.sizeLabel : (prop.size?.value ? `${prop.size.value} ${prop.size.unit || ''}` : (typeof prop.size === 'string' ? prop.size : 'Size N/A'))}
                                                    </span>
                                                <span style={{ width: '3px', height: '3px', background: '#e2e8f0', borderRadius: '50%' }}></span>
                                                <span style={{ fontSize: '0.65rem', color: prop.status === 'Active' ? '#10b981' : '#ef4444', fontWeight: 800 }}>{renderLookup(prop.status)}</span>
                                            </div>
                                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.6rem', borderRadius: '6px' }}>View Record</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No owned properties found.</div>
                    )}
                </div>
            )}
        </div>
    );
});

ContactOwnedProperties.displayName = 'ContactOwnedProperties';

export default ContactOwnedProperties;
