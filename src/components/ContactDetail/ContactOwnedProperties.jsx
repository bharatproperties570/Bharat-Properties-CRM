import React from 'react';

// Professional Date & Time Formatter
const formatDateTime = (dateVal) => {
    if (!dateVal) return '';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(d);
    } catch (e) {
        return '';
    }
};

const ContactOwnedProperties = React.memo(function ContactOwnedProperties({
    ownedProperties,
    expandedSections,
    toggleSection,
    setIsInventoryModalOpen,
    renderValue,
    renderLookup,
    onNavigate
}) {
    return (
        <>
            <style>
                {`
                .enterprise-asset-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-top: 3px solid #10b981; /* Top accent green representing hard assets */
                    border-radius: 12px;
                    padding: 14px 16px;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.01);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .enterprise-asset-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(16, 185, 129, 0.08), 0 4px 12px rgba(15, 23, 42, 0.02);
                    border-color: #a7f3d0;
                }
                `}
            </style>

            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.08)' }}>
                <div onClick={() => toggleSection('owned')} style={{ padding: '14px 20px', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-building" style={{ color: '#059669' }}></i> Owned Properties
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
                                borderRadius: '8px',
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                        <i className={`fas fa-chevron-${expandedSections.includes('owned') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                    </div>
                </div>

                {expandedSections.includes('owned') && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {ownedProperties.length > 0 ? (
                            ownedProperties.map((prop, idx) => {
                                // Extract and normalize SubCategory -> Category -> Type -> 'Unit' fallback
                                const subCategoryText = renderLookup(prop.subCategory, '') || renderLookup(prop.category, '') || renderLookup(prop.type, '') || 'Property';
                                const unitNoText = renderValue(prop.unitNumber) || renderValue(prop.unitNo) || '';
                                
                                // Resolve project name beautifully
                                const projectNameText = renderLookup(prop.projectId, '') || renderValue(prop.projectName) || renderLookup(prop.project, '') || 'General Project';

                                return (
                                    <div 
                                        key={idx} 
                                        className="enterprise-asset-card"
                                        onClick={() => onNavigate && onNavigate('inventory-detail', prop._id)}
                                    >
                                        {/* Row 1: SubCategory + Unit Number (e.g. "3 BHK 101" instead of "Unit #101") & Role Badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                                                    {subCategoryText} {unitNoText}
                                                </span>
                                            </div>
                                            <span style={{
                                                background: prop.matchRole === 'ASSOCIATE' ? '#eff6ff' : '#ecfdf5',
                                                color: prop.matchRole === 'ASSOCIATE' ? '#2563eb' : '#059669',
                                                fontSize: '0.55rem',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontWeight: 900,
                                                border: `1px solid ${prop.matchRole === 'ASSOCIATE' ? '#dbeafe' : '#d1fae5'}`,
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {prop.matchRole === 'ASSOCIATE' ? `ASSOCIATE${prop.relationship ? ` - ${prop.relationship}` : ''}` : 'OWNER'}
                                            </span>
                                        </div>

                                        {/* Row 2: Project Name + Block Name (in smaller text) + Asset icon circle badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', color: '#475569', fontWeight: 650 }}>
                                            <div style={{
                                                width: '24px', height: '24px',
                                                background: '#f0fdf4',
                                                border: '1px solid #dcfce7',
                                                borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                            }}>
                                                <i className={`fas ${(() => {
                                                    const t = (prop.type || prop.category || '').toString().toLowerCase();
                                                    if (t.includes('plot')) return 'fa-map-location-dot';
                                                    if (t.includes('shop') || t.includes('showroom') || t.includes('sco') || t.includes('commercial')) return 'fa-store';
                                                    if (t.includes('house') || t.includes('apartment') || t.includes('residential')) return 'fa-home';
                                                    if (t.includes('school') || t.includes('institutional')) return 'fa-university';
                                                    return 'fa-building';
                                                })()}`} style={{ color: '#10b981', fontSize: '0.75rem' }}></i>
                                            </div>
                                            <span style={{ color: '#1e293b', fontWeight: 700 }}>
                                                {projectNameText}
                                            </span>
                                            {prop.block && String(prop.block).trim() !== 'null' && String(prop.block).trim() !== 'undefined' && (
                                                <span style={{ fontSize: '0.65rem', color: '#047857', fontWeight: 600, background: '#e6fcf5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #c6f6e5' }}>
                                                    Block {renderLookup(prop.block) || renderValue(prop.block)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Row 3: Size & Status + Creation Date & Time (formatted with clock icon) */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                                    {renderLookup(prop.sizeLabel, '') || renderLookup(prop.sizeConfig, '') || renderLookup(prop.size, '') || (prop.size?.value ? `${prop.size.value} ${prop.size.unit || ''}` : 'Size TBA')}
                                                </span>
                                                <span style={{ width: '3px', height: '3px', background: '#cbd5e1', borderRadius: '50%' }}></span>
                                                <span style={{ fontSize: '0.65rem', color: prop.status === 'Active' ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                                                    {renderLookup(prop.status) || 'Active'}
                                                </span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.65rem', color: '#94a3b8' }}></i>
                                                <span>
                                                    {formatDateTime(prop.createdAt || prop.date) || 'Date TBA'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#f0fdf4', borderRadius: '12px', border: '1px dashed #a7f3d0' }}>
                                <div style={{ width: '32px', height: '32px', background: '#dcfce7', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-building" style={{ color: '#059669', fontSize: '0.9rem' }}></i>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>No owned properties found.</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
});

ContactOwnedProperties.displayName = 'ContactOwnedProperties';

export default ContactOwnedProperties;
