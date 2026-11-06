import React, { useState, useMemo } from 'react';
import { formatIndianCurrency } from '../../../utils/numberToWords';
import { renderValue } from '../../../utils/renderUtils';

const ProjectDealsTab = ({
    dealsData = [],
    onNavigate,
    isDark = false
}) => {
    const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStage, setSelectedStage] = useState('all');

    const canonicalStages = [
        { id: 'Open', label: 'Initial Inquiries / Open', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
        { id: 'Quote', label: 'Quotation Shared', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)' },
        { id: 'Negotiation', label: 'Active Negotiation', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
        { id: 'Booked', label: 'Token / Booked', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)' },
        { id: 'Closed', label: 'Closed & Registered', color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' }
    ];

    // Filter deals
    const filteredDeals = useMemo(() => {
        return dealsData.filter(deal => {
            const dealId = String(deal.dealId || deal._id || '').toLowerCase();
            const unit = String(deal.unitNo || '').toLowerCase();
            const buyer = String(deal.buyerName || deal.ownerName || '').toLowerCase();
            const stage = String(deal.stage || 'Open').toLowerCase();

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matches = dealId.includes(term) || unit.includes(term) || buyer.includes(term);
                if (!matches) return false;
            }

            if (selectedStage !== 'all') {
                if (stage !== selectedStage.toLowerCase()) return false;
            }

            return true;
        });
    }, [dealsData, searchTerm, selectedStage]);

    // Group deals by canonical stages for Kanban
    const kanbanColumns = useMemo(() => {
        const columns = {
            'Open': [],
            'Quote': [],
            'Negotiation': [],
            'Booked': [],
            'Closed': []
        };

        filteredDeals.forEach(deal => {
            const rawStage = deal.stage || 'Open';
            let targetKey = 'Open';

            if (rawStage.includes('Quote')) targetKey = 'Quote';
            else if (rawStage.includes('Negotiation')) targetKey = 'Negotiation';
            else if (rawStage.includes('Booked')) targetKey = 'Booked';
            else if (rawStage.includes('Closed') || rawStage.includes('Won')) targetKey = 'Closed';

            if (columns[targetKey]) {
                columns[targetKey].push(deal);
            } else {
                columns['Open'].push(deal);
            }
        });

        return columns;
    }, [filteredDeals]);

    // Total metrics
    const totalPipelineValue = useMemo(() => {
        return filteredDeals.reduce((acc, d) => acc + (d.price || 0), 0);
    }, [filteredDeals]);

    return (
        <div className="project-deals-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--bg-card)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                    {/* Search */}
                    <div style={{ position: 'relative', minWidth: '180px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
                        <input
                            type="text"
                            placeholder="Search deal ID, unit, buyer..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 12px 6px 28px',
                                background: 'var(--bg-gray)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: 'var(--text-main)',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Stage filter */}
                    <select
                        value={selectedStage}
                        onChange={(e) => setSelectedStage(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--bg-gray)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-main)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Stages ({dealsData.length})</option>
                        <option value="open">Open</option>
                        <option value="quote">Quote</option>
                        <option value="negotiation">Negotiation</option>
                        <option value="booked">Booked</option>
                        <option value="closed">Closed / Won</option>
                    </select>

                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', marginLeft: '6px' }}>
                        Total Value: {formatIndianCurrency(totalPipelineValue)}
                    </span>
                </div>

                {/* View Mode Toggle */}
                <div style={{
                    display: 'flex',
                    background: 'var(--bg-gray)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    padding: '2px'
                }}>
                    <button
                        onClick={() => setViewMode('kanban')}
                        style={{
                            padding: '5px 12px',
                            border: 'none',
                            borderRadius: '6px',
                            background: viewMode === 'kanban' ? 'var(--bg-card)' : 'transparent',
                            color: viewMode === 'kanban' ? '#2563eb' : 'var(--text-muted)',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <i className="fas fa-columns" style={{ marginRight: '4px' }}></i> Pipeline Board
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        style={{
                            padding: '5px 12px',
                            border: 'none',
                            borderRadius: '6px',
                            background: viewMode === 'list' ? 'var(--bg-card)' : 'transparent',
                            color: viewMode === 'list' ? '#2563eb' : 'var(--text-muted)',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <i className="fas fa-list" style={{ marginRight: '4px' }}></i> List View
                    </button>
                </div>
            </div>

            {/* View Render */}
            {viewMode === 'kanban' ? (
                /* Kanban Pipeline Board */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '14px',
                    alignItems: 'flex-start'
                }}>
                    {canonicalStages.map((stageDef) => {
                        const stageDeals = kanbanColumns[stageDef.id] || [];
                        const stageSum = stageDeals.reduce((sum, d) => sum + (d.price || 0), 0);

                        return (
                            <div
                                key={stageDef.id}
                                style={{
                                    background: 'var(--bg-card)',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    maxHeight: 'calc(100vh - 340px)',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Column Header */}
                                <div style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid var(--border-color)',
                                    background: stageDef.bg,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: stageDef.color, textTransform: 'uppercase' }}>
                                            {stageDef.id}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {formatIndianCurrency(stageSum)}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-main)',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        {stageDeals.length}
                                    </span>
                                </div>

                                {/* Cards List */}
                                <div className="no-scrollbar" style={{
                                    padding: '10px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    overflowY: 'auto'
                                }}>
                                    {stageDeals.length > 0 ? (
                                        stageDeals.map((deal, idx) => (
                                            <div
                                                key={deal._id || idx}
                                                onClick={() => onNavigate?.('deal-detail', deal._id || deal.id)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    background: 'var(--bg-gray)',
                                                    border: '1px solid var(--border-color)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                className="hover:scale-[1.02]"
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--primary, #3b82f6)' }}>
                                                        #{deal.dealId || (deal._id ? deal._id.substring(deal._id.length - 6).toUpperCase() : 'DEAL')}
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                        Unit {deal.unitNo || '--'}
                                                    </span>
                                                </div>

                                                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#10b981', margin: '3px 0' }}>
                                                    {formatIndianCurrency(deal.price)}
                                                </div>

                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {deal.buyerName || deal.ownerName || 'Direct Buyer'}
                                                </div>

                                                {deal.intent && (
                                                    <div style={{ marginTop: '4px' }}>
                                                        <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                                                            {renderValue(deal.intent)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                            No deals in this stage
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* List View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredDeals.length > 0 ? (
                        filteredDeals.map((deal, idx) => (
                            <div
                                key={deal._id || idx}
                                onClick={() => onNavigate?.('deal-detail', deal._id || deal.id)}
                                style={{
                                    padding: '12px 16px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    background: 'var(--bg-card)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}
                                className="hover:shadow-sm"
                            >
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ width: '36px', height: '36px', background: 'var(--bg-gray)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-handshake" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                                            Deal #{deal.dealId || (deal._id ? deal._id.substring(deal._id.length - 6).toUpperCase() : 'DEAL')}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            Unit: {deal.unitNo || '--'} • {renderValue(deal.intent) || 'Sale'} • {deal.buyerName || deal.ownerName || 'Direct'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 900, color: '#10b981', fontSize: '0.9rem' }}>
                                        {formatIndianCurrency(deal.price)}
                                    </div>
                                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-gray)', fontWeight: 800, color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                        {deal.stage || 'Open'}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No deals match the selected criteria.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProjectDealsTab;
