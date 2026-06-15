import { memo } from 'react';

const KpiCard = memo(function KpiCard({ title, value, subtitle, icon, color, trend }) {
    const isPositive = trend > 0;
    
    return (
        <div className="glass-card" style={{ padding: '14px 12px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, boxShadow: `0 0 15px ${color}10` }}>
                    <i className={`${icon} fa-md`}></i>
                </div>
                {trend !== undefined && (
                    <div style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 700, 
                        color: isPositive ? '#10b981' : '#94a3b8', 
                        background: isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.05)', 
                        padding: '4px 8px', 
                        borderRadius: '20px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)'}`
                    }}>
                        <i className={`fas fa-caret-${isPositive ? 'up' : 'down'}`}></i> {Math.abs(trend)}%
                    </div>
                )}
            </div>
            
            <h3 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 4px 0', letterSpacing: '0.02em', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title.toUpperCase()}</h3>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{value}</div>
            <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '4px 0 0 0', fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>
            
            {/* Decorative Glow */}
            <div style={{ position: 'absolute', right: '-15px', bottom: '-15px', fontSize: '4rem', color: `${color}05`, transform: 'rotate(-15deg)', pointerEvents: 'none' }}>
                <i className={icon}></i>
            </div>
        </div>
    );
});

const DashboardKPIs = ({ metrics, formatters }) => {
    const { totalLeads, hotLeads, totalDeals, totalInventory, reengagedCount, nfaCount, trends, perf } = metrics;
    const { fmtNum, fmtCr } = formatters;

    return (
        <div className="kpi-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: '12px', 
            marginBottom: '24px'
        }}>
            <div><KpiCard title="Total Intelligence" value={fmtNum(totalLeads)} subtitle="Captured all-time" icon="fas fa-brain" color="#6366f1" trend={trends.leads} /></div>
            <div><KpiCard title="Hot Prospects" value={fmtNum(hotLeads)} subtitle="High conversion potential" icon="fas fa-fire-alt" color="#f43f5e" trend={trends.deals} /></div>
            <div><KpiCard title="Active Pipeline" value={fmtNum(totalDeals)} subtitle="Deals in movement" icon="fas fa-project-diagram" color="#10b981" trend={trends.deals} /></div>
            <div><KpiCard title="Asset Inventory" value={fmtNum(totalInventory)} subtitle="Ready for matching" icon="fas fa-cube" color="#8b5cf6" /></div>
            <div><KpiCard title="Lead Revival" value={fmtNum(reengagedCount)} subtitle="Dormant leads re-engaged" icon="fas fa-bolt" color="#06b6d4" /></div>
            <div><KpiCard title="Revenue Performance" value={fmtCr(perf?.mtdCommission || 0)} subtitle="MTD Secured Revenue" icon="fas fa-hand-holding-usd" color="#10b981" trend={trends.revenue} /></div>
            <div><KpiCard title="Critical Action" value={fmtNum(nfaCount)} subtitle="Leads with no future" icon="fas fa-radiation" color="#f59e0b" /></div>
        </div>
    );
};

export default memo(DashboardKPIs);
