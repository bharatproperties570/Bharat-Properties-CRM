import React from 'react';

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
    renderLookup
}) {
    return (
        <>
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
            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(234, 88, 12, 0.3)', boxShadow: '0 8px 32px 0 rgba(234, 88, 12, 0.08)' }}>
                <div onClick={() => toggleSection('deals')} style={{ padding: '14px 20px', background: 'rgba(234, 88, 12, 0.05)', borderBottom: '1px solid rgba(234, 88, 12, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-briefcase"></i> Active Deals
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAddDealModalOpen(true);
                            }}
                            style={{
                                background: '#ea580c',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '50%',
                                width: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.2)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                        <i className={`fas fa-chevron-${expandedSections.includes('deals') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#ea580c' }}></i>
                    </div>
                </div>
                {expandedSections.includes('deals') && (
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {activeDeals.length > 1 ? (
                            activeDeals.map((deal, idx) => (
                                <div key={idx} style={{ background: '#fff7ed', padding: '12px', borderRadius: '12px', border: '1px solid #ffedd5', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                                            {deal.unitNo && `Unit #${deal.unitNo} • `}₹{renderValue(deal.budgetMin) || renderValue(deal.price) || 'Price TBA'} Deal
                                        </div>
                                        <span style={{ background: '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>
                                            {(renderLookup(deal.stage) || 'ACTIVE').toUpperCase()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 700, marginBottom: '2px' }}>
                                        {renderLookup(deal.projectId) || renderValue(deal.projectName) || renderLookup(deal.project) || 'General Category'}
                                        {deal.block && ` (Block: ${renderValue(deal.block)})`}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#9a3412', fontWeight: 600, opacity: 0.8 }}>
                                        at {renderValue(deal.locationDisplay) || renderLookup(deal.location) || deal.locArea || 'TBD Location'}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#fff7ed', borderRadius: '12px', border: '1px dashed #fed7aa' }}>
                                <div style={{ width: '32px', height: '32px', background: '#ffedd5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-handshake-slash" style={{ color: '#ea580c', fontSize: '0.9rem' }}></i>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 600 }}>No Active Deals for this Contact</span>
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
