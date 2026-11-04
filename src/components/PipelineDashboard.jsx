import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';

function PipelineDashboard({ entityType = 'lead', refreshTrigger, onStageClick, activeStage }) {
    const [densityData, setDensityData] = useState([]);
    const [totalLeads, setTotalLeads] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchDensity = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/stage-engine/density?entityType=${entityType}`);
                if (res.data?.success && isMounted) {
                    setDensityData(res.data.density || []);
                    setTotalLeads(res.data.totalLeads || 0);
                }
            } catch (err) {
                console.error('[PipelineDashboard] Error fetching stage density:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchDensity();
        return () => { isMounted = false; };
    }, [entityType, refreshTrigger]);

    const total = totalLeads || 1; // Avoid division by zero

    const getCount = (stages) => {
        let count = 0;
        stages.forEach(s => {
            const found = densityData.find(d => d.stage.toLowerCase() === s.toLowerCase());
            if (found) count += found.count;
        });
        return count;
    };

    let stats;
    if (entityType === 'deal') {
        stats = {
            open: getCount(['Open']),
            quote: getCount(['Quote']),
            negotiation: getCount(['Negotiation']),
            won: getCount(['Closed Won', 'Won']),
            lost: getCount(['Closed Lost', 'Lost', 'Cancelled', 'Unqualified'])
        };
        stats.unqualified = 0; // Simplified for deals
    } else {
        stats = {
            incoming: getCount(['Incoming']),
            prospect: getCount(['Prospect']),
            opportunity: getCount(['Opportunity']),
            negotiation: getCount(['Negotiation']),
            won: getCount(['Closed Won', 'Won', 'Closed']),
            lost: getCount(['Closed Lost', 'Lost']),
            unqualified: getCount(['Unqualified'])
        };
    }

    const closedTotal = stats.won + stats.lost + stats.unqualified;

    const getPercent = (val) => Math.round((val / total) * 100) + '%';
    const getClosedPercent = (val) => closedTotal > 0 ? Math.round((val / closedTotal) * 100) + '%' : '0%';

    const isStageActive = (stageNames) => {
        if (!activeStage) return false;
        const activeArr = Array.isArray(activeStage) ? activeStage : [activeStage];
        const targetArr = Array.isArray(stageNames) ? stageNames : [stageNames];
        return targetArr.some(t => activeArr.some(a => String(a).toLowerCase() === String(t).toLowerCase()));
    };

    if (loading) {
        return (
            <div className="pipeline-dashboard" id="pipelineDashboard" style={{ opacity: 0.5 }}>
                <div style={{ padding: '20px', textAlign: 'center', width: '100%', color: 'var(--text-muted)' }}>
                    <i className="fas fa-spinner fa-spin"></i> Loading live pipeline data...
                </div>
            </div>
        );
    }

    return (
        <div className="pipeline-dashboard" id="pipelineDashboard">
            {entityType === 'deal' ? (
                <>
                    <PipelineItem 
                        label="OPEN" 
                        value={stats.open} 
                        percent={getPercent(stats.open)} 
                        isActive={isStageActive(['Open'])}
                        onClick={() => onStageClick && onStageClick(['Open'])} 
                    />
                    <PipelineItem 
                        label="QUOTE" 
                        value={stats.quote} 
                        percent={getPercent(stats.quote)} 
                        isActive={isStageActive(['Quote'])}
                        onClick={() => onStageClick && onStageClick(['Quote'])} 
                    />
                    <PipelineItem 
                        label="NEGOTIATION" 
                        value={stats.negotiation} 
                        percent={getPercent(stats.negotiation)} 
                        isActive={isStageActive(['Negotiation'])}
                        onClick={() => onStageClick && onStageClick(['Negotiation'])} 
                    />
                </>
            ) : (
                <>
                    <PipelineItem 
                        label="INCOMING" 
                        value={stats.incoming} 
                        percent={getPercent(stats.incoming)} 
                        isActive={isStageActive(['Incoming'])}
                        onClick={() => onStageClick && onStageClick(['Incoming'])} 
                    />
                    <PipelineItem 
                        label="PROSPECT" 
                        value={stats.prospect} 
                        percent={getPercent(stats.prospect)} 
                        isActive={isStageActive(['Prospect'])}
                        onClick={() => onStageClick && onStageClick(['Prospect'])} 
                    />
                    <PipelineItem 
                        label="OPPORTUNITY" 
                        value={stats.opportunity} 
                        percent={getPercent(stats.opportunity)} 
                        isActive={isStageActive(['Opportunity'])}
                        onClick={() => onStageClick && onStageClick(['Opportunity'])} 
                    />
                    <PipelineItem 
                        label="NEGOTIATION" 
                        value={stats.negotiation} 
                        percent={getPercent(stats.negotiation)} 
                        isActive={isStageActive(['Negotiation'])}
                        onClick={() => onStageClick && onStageClick(['Negotiation'])} 
                    />
                </>
            )}

            {/* Closed Stage with Dynamic Logic */}
            <ClosedPipelineItem
                total={closedTotal}
                won={stats.won}
                lost={stats.lost}
                unqualified={stats.unqualified}
                wonPerc={getClosedPercent(stats.won)}
                lostPerc={getClosedPercent(stats.lost)}
                unqualifiedPerc={getClosedPercent(stats.unqualified)}
                overallPerc={getPercent(closedTotal)}
                onStageClick={onStageClick}
                isActive={isStageActive(['Closed Won', 'Won', 'Closed', 'Unqualified', 'Cancelled', 'Closed Lost', 'Lost'])}
                isWonActive={isStageActive(['Closed Won', 'Won', 'Closed'])}
                isUnqualifiedActive={isStageActive(['Unqualified', 'Cancelled'])}
                isLostActive={isStageActive(['Closed Lost', 'Lost'])}
            />
        </div>
    );
}

function PipelineItem({ label, value, percent, onClick, isActive }) {
    return (
        <div 
            className={`pipeline-item ${isActive ? 'active-stage-card' : ''}`} 
            onClick={onClick} 
            style={{ 
                cursor: onClick ? 'pointer' : 'default',
                position: 'relative',
                border: isActive ? '2px solid var(--primary-color)' : '1px solid transparent',
                background: isActive ? 'rgba(99, 102, 241, 0.16)' : undefined,
                boxShadow: isActive ? '0 0 12px rgba(99, 102, 241, 0.35)' : undefined,
                transform: isActive ? 'scale(1.02)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            title={isActive ? `Active: Click to clear ${label} stage filter` : `Click to filter by ${label} stage`}
        >
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label" style={{ color: isActive ? 'var(--primary-color)' : undefined, fontWeight: isActive ? 800 : undefined }}>{label}</div>
                    <div className="pipeline-value">{value}</div>
                </div>
                <div className="pipeline-percent">{percent}</div>
            </div>
            {isActive && (
                <div style={{ position: 'absolute', top: '4px', right: '6px', fontSize: '0.65rem', color: 'var(--primary-color)' }}>
                    <i className="fas fa-check-circle"></i>
                </div>
            )}
        </div>
    );
}

function ClosedPipelineItem({ total, won, lost, unqualified, wonPerc, lostPerc, unqualifiedPerc, overallPerc, onStageClick, isActive, isWonActive, isUnqualifiedActive, isLostActive }) {
    const [isOpen, setIsOpen] = useState(false);
    const itemRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    const updateCoords = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    const toggleMenu = (e) => {
        e.stopPropagation();
        if (!isOpen) {
            updateCoords();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        const handleResize = () => setIsOpen(false);
        const handleScroll = () => { if (isOpen) setIsOpen(false); };

        if (isOpen) {
            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleScroll, { capture: true });
            window.addEventListener('click', () => setIsOpen(false));
        }
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('click', () => setIsOpen(false));
        };
    }, [isOpen]);

    const dropdownContent = (
        <div
            className="pipeline-sub-stages-portal"
            style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 99999,
                background: 'var(--bg-card)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="sub-stage-item success" 
                style={{ 
                    padding: '10px 12px', 
                    borderBottom: '1px solid var(--border-color)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: isWonActive ? 'rgba(22, 101, 52, 0.15)' : undefined,
                    fontWeight: isWonActive ? 700 : undefined
                }}
                onClick={() => { setIsOpen(false); if(onStageClick) onStageClick(['Closed Won', 'Won', 'Closed']); }}
                title={isWonActive ? "Click to clear Won stage filter" : "Filter by Won"}
            >
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>
                    {isWonActive && <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>}
                    Won
                </div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{won}</span>
                    <span className="sub-percent" style={{ color: 'var(--text-muted)' }}>{wonPerc}</span>
                </div>
            </div>
            <div className="sub-stage-item neutral" 
                style={{ 
                    padding: '10px 12px', 
                    borderBottom: '1px solid var(--border-color)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: isUnqualifiedActive ? 'rgba(148, 163, 184, 0.15)' : undefined,
                    fontWeight: isUnqualifiedActive ? 700 : undefined
                }}
                onClick={() => { setIsOpen(false); if(onStageClick) onStageClick(['Unqualified', 'Cancelled']); }}
                title={isUnqualifiedActive ? "Click to clear Unqualified filter" : "Filter by Unqualified"}
            >
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {isUnqualifiedActive && <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>}
                    Unqualified
                </div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{unqualified}</span>
                    <span className="sub-percent" style={{ color: 'var(--text-muted)' }}>{unqualifiedPerc}</span>
                </div>
            </div>
            <div className="sub-stage-item danger" 
                style={{ 
                    padding: '10px 12px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: isLostActive ? 'rgba(153, 27, 27, 0.15)' : undefined,
                    fontWeight: isLostActive ? 700 : undefined
                }}
                onClick={() => { setIsOpen(false); if(onStageClick) onStageClick(['Closed Lost', 'Lost']); }}
                title={isLostActive ? "Click to clear Lost stage filter" : "Filter by Lost"}
            >
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>
                    {isLostActive && <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>}
                    Lost
                </div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{lost}</span>
                    <span className="sub-percent" style={{ color: 'var(--text-muted)' }}>{lostPerc}</span>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div
                className={`pipeline-item ${isActive ? 'active-stage-card' : ''}`}
                style={{
                    cursor: 'pointer',
                    position: 'relative',
                    border: isActive ? '2px solid var(--primary-color)' : '1px solid transparent',
                    background: isActive ? 'rgba(99, 102, 241, 0.16)' : (isOpen ? 'var(--bg-gray)' : undefined),
                    boxShadow: isActive ? '0 0 12px rgba(99, 102, 241, 0.35)' : undefined,
                    transform: isActive ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onClick={toggleMenu}
                ref={itemRef}
                title={isActive ? "Closed stage active (click to view sub-stages)" : "Click to select Closed sub-stage"}
            >
                <div className="pipeline-content-wrapper">
                    <div>
                        <div className="pipeline-label" style={{ color: isActive ? 'var(--primary-color)' : undefined, fontWeight: isActive ? 800 : undefined }}>
                            CLOSED <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7em', marginLeft: '5px' }}></i>
                        </div>
                        <div className="pipeline-value">{total}</div>
                    </div>
                    <div className="pipeline-percent">{overallPerc}</div>
                </div>
                {isActive && (
                    <div style={{ position: 'absolute', top: '4px', right: '6px', fontSize: '0.65rem', color: 'var(--primary-color)' }}>
                        <i className="fas fa-check-circle"></i>
                    </div>
                )}
            </div>
            {isOpen && createPortal(dropdownContent, document.body)}
        </>
    );
}

export default PipelineDashboard;
