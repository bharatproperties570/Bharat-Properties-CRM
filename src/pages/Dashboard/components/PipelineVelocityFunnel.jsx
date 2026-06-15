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
        <div className="glass-card" style={{ padding: '24px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>PIPELINE VELOCITY</h2>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0', fontWeight: 600 }}>FUNNEL CONVERSION RATES</p>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 800 }}>LIVE</span>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                {funnelData.map((stage, idx) => {
                    const widthPercent = maxCount === 0 ? 0 : Math.max(10, (stage.count / maxCount) * 100);
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
                            <div style={{ width: '65%', display: 'flex', justifyContent: 'center' }}>
                                <div style={{ 
                                    width: `${widthPercent}%`, 
                                    height: '36px', 
                                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                                    borderRadius: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: `0 4px 12px ${color}33`,
                                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}>
                                    <span style={{ color: 'var(--text-main)', fontWeight: 900, fontSize: '0.9rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                        {fmtNum(stage.count)}
                                    </span>
                                </div>
                            </div>
                            
                            {/* The Label */}
                            <div style={{ width: '35%', paddingLeft: '16px', display: 'flex', flexDirection: 'column' }}>
                                <span style={{ color: '#f8fafc', fontSize: '0.85rem', fontWeight: 700 }}>{stage.label}</span>
                                {convRate !== null && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
                                        <i className="fas fa-level-down-alt" style={{ marginRight: '4px', transform: 'rotate(-45deg)' }}></i>
                                        {convRate}% conv.
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
