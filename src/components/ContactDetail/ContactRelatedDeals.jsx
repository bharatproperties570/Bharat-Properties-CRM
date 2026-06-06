import React from 'react';
// Indian Numbering System price formatter for enterprise-grade real estate CRM
const formatPrice = (price) => {
    if (price === null || price === undefined || price === '') return 'Price TBA';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    if (num >= 10000000) {
        return `₹ ${(num / 10000000).toFixed(2)} Cr`;
    } else if (num >= 100000) {
        return `₹ ${(num / 100000).toFixed(2)} Lac`;
    }
    return `₹ ${num.toLocaleString('en-IN')}`;
};

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

// Premium Stage Badging style resolver
const getStageBadgeStyle = (stage) => {
    const s = String(stage || 'Open').toLowerCase();
    if (s.includes('won') || s.includes('booked') || s === 'closed') {
        return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' };
    }
    if (s.includes('negotiation') || s.includes('quote')) {
        return { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.25)' };
    }
    if (s.includes('lost') || s.includes('cancel') || s === 'cancelled') {
        return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' };
    }
    if (s.includes('stalled') || s.includes('hold')) {
        return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)' };
    }
    // Default open/active
    return { background: 'rgba(13, 148, 136, 0.15)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.25)' };
};

// Left border indicator bar color based on deal stage
const getStageLeftBarColor = (stage) => {
    const s = String(stage || 'Open').toLowerCase();
    if (s.includes('won') || s.includes('booked') || s === 'closed') return '#10b981'; // Success Green
    if (s.includes('negotiation') || s.includes('quote')) return '#3b82f6'; // Info Blue
    if (s.includes('lost') || s.includes('cancel') || s === 'cancelled') return '#ef4444'; // Danger Red
    if (s.includes('stalled') || s.includes('hold')) return '#f59e0b'; // Warning Orange
    return '#6366f1'; // Premium Brand Indigo
};

const ContactRelatedDeals = React.memo(function ContactRelatedDeals({
    contact,
    recordType,
    expandedSections,
    toggleSection,
    matchedDeals,
    loadingMatches,
    renderValue,
    showNotification,
    activeDeals,
    setIsAddDealModalOpen,
    renderLookup,
    onNavigate
}) {
    return (
        <>
            <style>
                {`
                .enterprise-deal-card {
                    background: var(--contact-card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 14px 16px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .enterprise-deal-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
                    border-color: var(--primary-color);
                }
                .enterprise-deal-card:active {
                    transform: translateY(0);
                }
                `}
            </style>

            {/* Match Deal Center */}
            {(recordType === 'lead' || contact?.requirement || contact?.searchLocation) && (
                <div className="glass-card" style={{
                    borderRadius: '16px',
                    border: '2px solid var(--success-color)',
                    boxShadow: '0 12px 40px rgba(16, 185, 129, 0.15)',
                    overflow: 'hidden',
                    minHeight: '120px'
                }}>
                    <div onClick={() => toggleSection('matching')} style={{
                        padding: '14px 20px',
                        background: 'rgba(16, 185, 129, 0.05)',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                    }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-bullseye"></i> Match Deal Center
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {matchedDeals.length > 0 && (
                                <span style={{ background: '#10b981', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                                    {matchedDeals.length} MATCHES
                                </span>
                            )}
                            <i className={`fas fa-chevron-${expandedSections.includes('matching') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#059669' }}></i>
                        </div>
                    </div>
                    {expandedSections.includes('matching') && (
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {loadingMatches ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    <i className="fas fa-spinner fa-spin"></i> Calculating matches...
                                </div>
                            ) : matchedDeals.length > 0 ? (
                                <>
                                    {matchedDeals.map((deal, idx) => {
                                        const matchColor = deal.matchPercentage >= 80 ? '#10b981' : deal.matchPercentage >= 50 ? '#f59e0b' : 'var(--text-muted)';
                                        const matchBg = deal.matchPercentage >= 80 ? 'rgba(16, 185, 129, 0.15)' : deal.matchPercentage >= 50 ? 'rgba(245, 158, 11, 0.15)' : 'var(--contact-row-hover)';
                                        const matchBorder = deal.matchPercentage >= 80 ? 'rgba(16, 185, 129, 0.25)' : deal.matchPercentage >= 50 ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-color)';

                                        // Subcategory resolved from mapping or fallback
                                        const subCategoryText = deal.subCategory || 'Unit';
                                        // Size label formatted properly
                                        const sizeText = typeof deal.size === 'string' ? deal.size : (deal.size?.value ? `${deal.size.value} ${deal.size.unit || 'Sq.Yd.'}` : 'Size N/A');
                                        return (
                                            <div 
                                                key={idx} 
                                                className="enterprise-deal-card"
                                                style={{ 
                                                    borderLeft: `4px solid ${matchColor}`,
                                                    background: 'var(--contact-card-bg)',
                                                    padding: '12px 16px',
                                                    gap: '6px'
                                                }}
                                                onClick={() => onNavigate && onNavigate('lead-matching', contact?._id)}
                                            >
                                                {/* Row 1: Unit + Match Badge + Price */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                            {deal.unitNo || 'Unit'}
                                                        </span>
                                                        <span style={{ 
                                                            fontSize: '0.62rem', 
                                                            background: matchBg, 
                                                            color: matchColor, 
                                                            padding: '2px 8px', 
                                                            borderRadius: '6px', 
                                                            fontWeight: 800,
                                                            border: `1px solid ${matchBorder}`,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px'
                                                        }}>
                                                            {deal.matchPercentage}% Match
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 950, color: '#10b981' }}>
                                                        {formatPrice(deal.price) || 'Price TBA'}
                                                    </span>
                                                </div>
 
                                                {/* Row 2: Project + Location */}
                                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 650 }}>
                                                    <i className="fas fa-building" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                                    <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                                                        {renderValue(deal.projectName) || 'Premium Listing'}
                                                    </span>
                                                    <span style={{ color: 'var(--border-color)' }}>|</span>
                                                    <i className="fas fa-map-marker-alt" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        {renderLookup(deal.location, 'Block') || (typeof deal.location === 'object' ? (deal.location.lookup_value || deal.location.name) : deal.location) || 'Block'}
                                                    </span>
                                                </div>
 
                                                {/* Row 3: Subcategory Badge & Size Badge */}
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                    <span style={{ 
                                                        fontSize: '0.65rem', 
                                                        background: 'rgba(59, 130, 246, 0.15)', 
                                                        color: '#3b82f6', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '6px', 
                                                        fontWeight: 750,
                                                        border: '1px solid rgba(59, 130, 246, 0.25)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <i className="fas fa-tag" style={{ fontSize: '0.55rem' }}></i> {subCategoryText}
                                                    </span>
                                                    <span style={{ 
                                                        fontSize: '0.65rem', 
                                                        background: 'rgba(245, 158, 11, 0.15)', 
                                                        color: '#f59e0b', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '6px', 
                                                        fontWeight: 750,
                                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <i className="fas fa-ruler-combined" style={{ fontSize: '0.55rem' }}></i> {sizeText}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <button
                                        onClick={() => {
                                            if (onNavigate) {
                                                onNavigate('lead-matching', contact?._id);
                                            } else {
                                                showNotification('Redirecting to Match Center...');
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#10b981',
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        View Match Center <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>
                                    </button>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    No matches found for this lead.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Active Deals Section */}
            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)', overflow: 'hidden' }}>
                <div onClick={() => toggleSection('deals')} style={{ padding: '14px 20px', background: 'var(--contact-card-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-handshake" style={{ color: 'var(--primary-color)' }}></i> Active Pipeline Deals
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {activeDeals.length > 0 && (
                            <span style={{ background: 'var(--stat-agent-bg)', color: 'var(--stat-agent-color)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                                {activeDeals.length} ACTIVE
                            </span>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAddDealModalOpen(true);
                            }}
                            style={{
                                background: 'var(--primary-color)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(0, 102, 255, 0.2)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                        <i className={`fas fa-chevron-${expandedSections.includes('deals') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}></i>
                    </div>
                </div>
                {expandedSections.includes('deals') && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {activeDeals.length > 0 ? (
                            activeDeals.map((deal, idx) => {
                                // Extract and normalize SubCategory -> Category -> 'Unit' fallback
                                const subCategoryText = renderLookup(deal.subCategory, '') || renderLookup(deal.category, '') || 'Unit';
                                
                                return (
                                    <div 
                                        key={idx} 
                                        className="enterprise-deal-card"
                                        style={{ 
                                            borderLeft: `4px solid ${getStageLeftBarColor(deal.stage)}`
                                        }}
                                        onClick={() => onNavigate && onNavigate('deal-detail', deal._id)}
                                    >
                                        {/* Row 1: SubCategory + Unit Number & Stage Badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    {subCategoryText} {deal.unitNo || ''}
                                                </span>
                                            </div>
                                            <span style={{
                                                ...getStageBadgeStyle(deal.stage),
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.6rem',
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {(renderLookup(deal.stage, '') || 'Open').toUpperCase()}
                                            </span>
                                        </div>
 
                                        {/* Row 2: Project Name + Block Name (in small text) */}
                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 650 }}>
                                            <i className="fas fa-building" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                                                {renderValue(deal.projectName) || renderLookup(deal.projectId, '') || renderLookup(deal.project, '') || 'General Project'}
                                            </span>
                                            {deal.block && String(deal.block).trim() !== 'null' && String(deal.block).trim() !== 'undefined' && (
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500, background: 'var(--bg-gray)', padding: '1px 6px', borderRadius: '4px', marginLeft: '2px' }}>
                                                    Block {renderValue(deal.block)}
                                                </span>
                                            )}
                                        </div>
 
                                        {/* Row 3: Size Details */}
                                        {(renderLookup(deal.sizeLabel, '') || renderLookup(deal.sizeConfig, '') || renderLookup(deal.size, '') || (deal.size?.value ? `${deal.size.value} ${deal.size.unit || ''}` : '')) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                <i className="fas fa-ruler-combined" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                                <span>
                                                    {renderLookup(deal.sizeLabel, '') || renderLookup(deal.sizeConfig, '') || renderLookup(deal.size, '') || `${deal.size.value} ${deal.size.unit || ''}`}
                                                </span>
                                            </div>
                                        )}
 
                                        {/* Row 4: Deal Value / Price and Deal ID Reference */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#10b981' }}>
                                                    {formatPrice(deal.price) || formatPrice(deal.budgetMin) || 'Price TBA'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                                <span>
                                                    {formatDateTime(deal.createdAt || deal.date) || 'Date TBA'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--bg-gray)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                                <div style={{ width: '32px', height: '32px', background: 'var(--contact-row-hover)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-handshake-slash" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}></i>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>No Active Deals for this Contact</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
});

ContactRelatedDeals.displayName = 'ContactRelatedDeals';

export default ContactRelatedDeals;

