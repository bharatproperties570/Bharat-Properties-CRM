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
        return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
    }
    if (s.includes('negotiation') || s.includes('quote')) {
        return { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' };
    }
    if (s.includes('lost') || s.includes('cancel') || s === 'cancelled') {
        return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' };
    }
    if (s.includes('stalled') || s.includes('hold')) {
        return { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
    }
    // Default open/active
    return { background: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1' };
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
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 14px 16px;
                    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
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
                    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
                    border-color: #cbd5e1;
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
                    border: '2px solid #10b981',
                    boxShadow: '0 12px 40px rgba(16, 185, 129, 0.15)',
                    overflow: 'hidden',
                    minHeight: '120px'
                }}>
                    <div onClick={() => toggleSection('matching')} style={{
                        padding: '14px 20px',
                        background: 'rgba(16, 185, 129, 0.05)',
                        borderBottom: '1px solid rgba(16, 185, 129, 0.1)',
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
                                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.8rem' }}>
                                    <i className="fas fa-spinner fa-spin"></i> Calculating matches...
                                </div>
                            ) : matchedDeals.length > 0 ? (
                                <>
                                    {matchedDeals.map((deal, idx) => (
                                        <div key={idx} style={{
                                            background: '#f8fafc',
                                            borderRadius: '12px',
                                            padding: '12px',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', wordBreak: 'break-word' }}>{deal.unitNo || 'Unit'}</div>
                                                    <span style={{ fontSize: '0.65rem', background: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                        {deal.matchPercentage}% MATCH
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', wordBreak: 'break-word' }}>
                                                    <i className="fas fa-building" style={{ fontSize: '0.6rem' }}></i> {deal.projectName || 'Project'}
                                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                                    <i className="fas fa-layer-group" style={{ fontSize: '0.6rem' }}></i> {deal.location || 'Block'}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981' }}>{renderValue(deal.price, 'Price TBA', '₹')}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>
                                                    {deal.size?.value ? `${deal.size.value} ${deal.size.unit || ''}` : (typeof deal.size === 'string' ? deal.size : 'Size N/A')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => showNotification('Redirecting to Match Center...')}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '10px',
                                            border: '1px solid #d1fae5',
                                            background: '#ecfdf5',
                                            color: '#059669',
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
                                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.8rem' }}>
                                    No matches found for this lead.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Active Deals Section */}
            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
                <div onClick={() => toggleSection('deals')} style={{ padding: '14px 20px', background: 'linear-gradient(to right, #f8fafc, #ffffff)', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-handshake" style={{ color: '#4f46e5' }}></i> Active Pipeline Deals
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {activeDeals.length > 0 && (
                            <span style={{ background: '#e0e7ff', color: '#4f46e5', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                                {activeDeals.length} ACTIVE
                            </span>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAddDealModalOpen(true);
                            }}
                            style={{
                                background: '#4f46e5',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                        <i className={`fas fa-chevron-${expandedSections.includes('deals') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#64748b' }}></i>
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
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
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
                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem', color: '#475569', fontWeight: 650 }}>
                                            <i className="fas fa-building" style={{ fontSize: '0.65rem', color: '#64748b' }}></i>
                                            <span style={{ color: '#1e293b', fontWeight: 700 }}>
                                                {renderValue(deal.projectName) || renderLookup(deal.projectId, '') || renderLookup(deal.project, '') || 'General Project'}
                                            </span>
                                            {deal.block && String(deal.block).trim() !== 'null' && String(deal.block).trim() !== 'undefined' && (
                                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500, background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', marginLeft: '2px' }}>
                                                    Block {renderValue(deal.block)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Row 3: Size Details */}
                                        {(renderLookup(deal.sizeLabel, '') || renderLookup(deal.sizeConfig, '') || renderLookup(deal.size, '') || (deal.size?.value ? `${deal.size.value} ${deal.size.unit || ''}` : '')) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                <i className="fas fa-ruler-combined" style={{ fontSize: '0.65rem', color: '#94a3b8' }}></i>
                                                <span>
                                                    {renderLookup(deal.sizeLabel, '') || renderLookup(deal.sizeConfig, '') || renderLookup(deal.size, '') || `${deal.size.value} ${deal.size.unit || ''}`}
                                                </span>
                                            </div>
                                        )}

                                        {/* Row 4: Deal Value / Price and Deal ID Reference */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#10b981' }}>
                                                    {formatPrice(deal.price) || formatPrice(deal.budgetMin) || 'Price TBA'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.65rem', color: '#94a3b8' }}></i>
                                                <span>
                                                    {formatDateTime(deal.createdAt || deal.date) || 'Date TBA'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                <div style={{ width: '32px', height: '32px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-handshake-slash" style={{ color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>No Active Deals for this Contact</span>
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

