import React, { useMemo } from 'react';
import { formatIndianCurrency } from '../../../utils/numberToWords';

const ProjectKPIStrip = ({ 
    inventoryData = [], 
    dealsData = [], 
    leadsCount = 0, 
    project = null,
    analyticsData = null 
}) => {
    const kpiMetrics = useMemo(() => {
        const totalInv = inventoryData.length || Number(project?.totalUnits) || 0;
        
        let availableCount = 0;
        let soldCount = 0;
        let holdCount = 0;

        inventoryData.forEach(item => {
            const rawStatus = (item.status && typeof item.status === 'object' && item.status.lookup_value)
                ? item.status.lookup_value
                : (typeof item.status === 'string' ? item.status : '');
            
            const lower = rawStatus.toLowerCase();
            if (lower.includes('sold')) {
                soldCount++;
            } else if (lower.includes('hold') || lower.includes('book')) {
                holdCount++;
            } else {
                availableCount++;
            }
        });

        // Use analyticsData overrides if available
        if (analyticsData?.inventory) {
            availableCount = analyticsData.inventory.available ?? availableCount;
            soldCount = analyticsData.inventory.sold ?? soldCount;
        }

        const absorption = totalInv > 0 ? Math.round((soldCount / totalInv) * 100) : 0;

        // CRM Deal Stages: Open, Quote, Negotiation | Closed: Won, Lost, Unqualified
        const activeStages = ['Open', 'Quote', 'Negotiation'];
        const lostStages = ['Closed Lost', 'Closed (Lost)', 'Cancelled'];
        const wonStages = ['Closed Won', 'Closed (Won)', 'Sold Out'];

        let activeDeals = 0;
        let pipelineVal = 0;

        dealsData.forEach(deal => {
            const stage = deal.stage || 'Open';
            const status = deal.status || '';
            const price = Number(deal.price) || Number(deal.quotePrice) || 0;

            const isLost = lostStages.includes(stage) || (stage === 'Closed' && (status === 'Lost' || status === 'Unqualified' || status === 'Cancelled'));
            const isWon = wonStages.includes(stage) || (stage === 'Closed' && (status === 'Won' || status === 'Closed Won'));

            if (!isWon && !isLost && (activeStages.includes(stage) || stage === 'Open')) {
                activeDeals++;
                pipelineVal += price;
            }
        });

        let realizedRev = 0;
        let bookingsCount = 0;

        if (analyticsData?.bookings) {
            realizedRev = analyticsData.bookings.realizedRevenue || 0;
            bookingsCount = analyticsData.bookings.confirmed || 0;
        } else if (analyticsData?.deals?.totalRealizedRevenue) {
            realizedRev = analyticsData.deals.totalRealizedRevenue;
        }

        if (analyticsData?.deals) {
            activeDeals = analyticsData.deals.active ?? activeDeals;
            pipelineVal = analyticsData.deals.totalPipelineValue ?? pipelineVal;
        }

        return [
            {
                id: 'total-inventory',
                label: 'TOTAL UNITS',
                value: totalInv.toLocaleString('en-IN'),
                subtext: `${project?.blocks?.length || project?.totalBlocks || 1} Blocks mapped`,
                icon: 'fas fa-cubes',
                color: '#3b82f6',
                bgLight: 'rgba(59, 130, 246, 0.08)'
            },
            {
                id: 'available-inventory',
                label: 'AVAILABLE STOCK',
                value: availableCount.toLocaleString('en-IN'),
                subtext: `${totalInv > 0 ? Math.round((availableCount / totalInv) * 100) : 0}% unallocated`,
                icon: 'fas fa-door-open',
                color: '#10b981',
                bgLight: 'rgba(16, 185, 129, 0.08)'
            },
            {
                id: 'sold-inventory',
                label: 'UNITS SOLD',
                value: soldCount.toLocaleString('en-IN'),
                subtext: 'Sold via deals & bookings',
                icon: 'fas fa-check-circle',
                color: '#ef4444',
                bgLight: 'rgba(239, 68, 68, 0.08)'
            },
            {
                id: 'absorption-rate',
                label: 'ABSORPTION RATE',
                value: `${absorption}%`,
                subtext: absorption >= 70 ? 'High velocity' : 'Standard pace',
                icon: 'fas fa-chart-line',
                color: '#8b5cf6',
                bgLight: 'rgba(139, 92, 246, 0.08)'
            },
            {
                id: 'active-deals',
                label: 'ACTIVE PIPELINE',
                value: activeDeals.toLocaleString('en-IN'),
                subtext: 'Open, Quote, Negotiation',
                icon: 'fas fa-handshake',
                color: '#6366f1',
                bgLight: 'rgba(99, 102, 241, 0.08)'
            },
            {
                id: 'pipeline-value',
                label: 'PIPELINE VALUE',
                value: formatIndianCurrency(pipelineVal),
                subtext: 'Total pipeline deals value',
                icon: 'fas fa-sack-dollar',
                color: '#0284c7',
                bgLight: 'rgba(2, 132, 199, 0.08)'
            },
            {
                id: 'realized-revenue',
                label: 'REALIZED REVENUE',
                value: formatIndianCurrency(realizedRev),
                subtext: bookingsCount > 0 ? `${bookingsCount} confirmed bookings` : 'Secured via bookings',
                icon: 'fas fa-trophy',
                color: '#059669',
                bgLight: 'rgba(5, 150, 105, 0.08)'
            },
            {
                id: 'interested-leads',
                label: 'INTERESTED LEADS',
                value: (leadsCount || 0).toLocaleString('en-IN'),
                subtext: 'Matching buyer pool',
                icon: 'fas fa-user-tag',
                color: '#f59e0b',
                bgLight: 'rgba(245, 158, 11, 0.08)'
            }
        ];
    }, [inventoryData, dealsData, leadsCount, project, analyticsData]);

    return (
        <div 
            className="project-kpi-strip no-scrollbar"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: '8px',
                padding: '8px 16px',
                background: 'var(--bg-gray)',
                borderBottom: '1px solid var(--border-color)',
                width: '100%',
                boxSizing: 'border-box'
            }}
        >
            {kpiMetrics.map((kpi) => (
                <div
                    key={kpi.id}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '72px',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: 800, 
                            color: 'var(--text-muted)', 
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase'
                        }}>
                            {kpi.label}
                        </span>
                        <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            background: kpi.bgLight,
                            color: kpi.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem'
                        }}>
                            <i className={kpi.icon}></i>
                        </div>
                    </div>

                    <div style={{ marginTop: '2px' }}>
                        <div style={{ 
                            fontSize: '1.15rem', 
                            fontWeight: 900, 
                            color: 'var(--text-main)', 
                            lineHeight: 1.1,
                            letterSpacing: '-0.02em'
                        }}>
                            {kpi.value}
                        </div>
                        <div style={{ 
                            fontSize: '0.62rem', 
                            color: 'var(--text-muted)', 
                            marginTop: '2px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {kpi.subtext}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ProjectKPIStrip;
