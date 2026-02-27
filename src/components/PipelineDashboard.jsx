import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

function PipelineDashboard({ data = [] }) {
    const total = data.length || 1; // Avoid division by zero

    const getCount = (stages) => data.filter(item => 
        stages.some(s => (item.stage || 'New').toLowerCase() === s.toLowerCase())
    ).length;

    const stats = {
        incoming: getCount(['New']),
        prospect: getCount(['Prospect', 'Qualified']),
        opportunity: getCount(['Opportunity']),
        negotiation: getCount(['Negotiation', 'Booked']),
        won: getCount(['Closed Won']),
        lost: getCount(['Closed Lost']),
        unqualified: getCount(['Stalled'])
    };

    const closedTotal = stats.won + stats.lost + stats.unqualified;

    const getPercent = (val) => Math.round((val / total) * 100) + '%';
    const getClosedPercent = (val) => closedTotal > 0 ? Math.round((val / closedTotal) * 100) + '%' : '0%';

    return (
        <div className="pipeline-dashboard" id="pipelineDashboard">
            <PipelineItem label="INCOMING" value={stats.incoming} percent={getPercent(stats.incoming)} />
            <PipelineItem label="PROSPECT" value={stats.prospect} percent={getPercent(stats.prospect)} />
            <PipelineItem label="OPPORTUNITY" value={stats.opportunity} percent={getPercent(stats.opportunity)} />
            <PipelineItem label="NEGOTIATION" value={stats.negotiation} percent={getPercent(stats.negotiation)} />

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
            />
        </div>
    );
}

function PipelineItem({ label, value, percent }) {
    return (
        <div className="pipeline-item">
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">{label}</div>
                    <div className="pipeline-value">{value}</div>
                </div>
                <div className="pipeline-percent">{percent}</div>
            </div>
        </div>
    );
}

function ClosedPipelineItem({ total, won, lost, unqualified, wonPerc, lostPerc, unqualifiedPerc, overallPerc }) {
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
                background: '#fff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="sub-stage-item success" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>Won</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{won}</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>{wonPerc}</span>
                </div>
            </div>
            <div className="sub-stage-item neutral" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Unqualified</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{unqualified}</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>{unqualifiedPerc}</span>
                </div>
            </div>
            <div className="sub-stage-item danger" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>Lost</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>{lost}</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>{lostPerc}</span>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div
                className="pipeline-item"
                style={{
                    cursor: 'pointer',
                    background: isOpen ? '#f8fafc' : undefined,
                    transition: 'background 0.2s'
                }}
                onClick={toggleMenu}
                ref={itemRef}
            >
                <div className="pipeline-content-wrapper">
                    <div>
                        <div className="pipeline-label">CLOSED <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7em', marginLeft: '5px' }}></i></div>
                        <div className="pipeline-value">{total}</div>
                    </div>
                    <div className="pipeline-percent">{overallPerc}</div>
                </div>
            </div>
            {isOpen && createPortal(dropdownContent, document.body)}
        </>
    );
}

export default PipelineDashboard;
