import { memo } from 'react';

const PipelineVelocityFunnel = ({ leads, formatters }) => {
    const { fmtNum } = formatters;
    
    // Sort leads to form a funnel (Incoming -> Prospect -> Opportunity -> Negotiation -> Won -> Lost)
    const order = ['INCOMING', 'PROSPECT', 'OPPORTUNITY', 'NEGOTIATION', 'WON'];
    
    let maxCount = 0;
    const funnelData = order.map(status => {
        const item = leads.find(l => l.status === status) || { count: 0 };
        if (item.count > maxCount) maxCount = item.count;
        return {
            status,
            label: status === 'INCOMING' ? 'New Leads' : 
                   status === 'PROSPECT' ? 'Contacted' : 
                   status === 'OPPORTUNITY' ? 'Site Visits' : 
                   status === 'NEGOTIATION' ? 'Negotiation' : 'Closed Won',
            count: item.count
        };
    });

    return (
        <div style={{ background: 'var(--panel-bg)', borderRadius: '16px', border: '1px solid var(--border-light)', padding: '14px 16px', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '0.85rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>PIPELINE VELOCITY</h2>
                    <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '2px 0 0 0', fontWeight: 600 }}>FUNNEL CONVERSION RATES</p>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <span style={{ fontSize: '0.62rem', color: '#6366f1', fontWeight: 800 }}>LIVE</span>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'space-around' }}>
                {funnelData.map((stage, idx) => {
                    const widthPercent = maxCount === 0 ? 0 : Math.max(12, (stage.count / maxCount) * 100);
                    // Determine colors based on stage
                    const colors = [
                        '#6366f1', // Indigo
                        '#3b82f6', // Blue
                        '#0ea5e9', // Sky
                        '#f59e0b', // Amber
                        '#10b981'  // Emerald
                    ];
                    const color = colors[idx % colors.length];
                    
                    // Conversion rate from previous stage
                    let convRate = null;
                    if (idx > 0 && funnelData[idx-1].count > 0) {
                        convRate = Math.round((stage.count / funnelData[idx-1].count) * 100);
                    }

                    return (
                        <div key={stage.status} style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                            {/* The Bar */}
                            <div style={{ width: '60%', display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{ 
                                    width: `${widthPercent}%`, 
                                    height: '24px', 
                                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: `0 2px 8px ${color}33`,
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}>
                                    <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.75rem', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                        {fmtNum(stage.count)}
                                    </span>
                                </div>
                            </div>
                            
                            {/* The Label */}
                            <div style={{ width: '40%', paddingLeft: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-main)', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage.label}</span>
                                {convRate !== null && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 600, marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                        {convRate}%
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default memo(PipelineVelocityFunnel);
