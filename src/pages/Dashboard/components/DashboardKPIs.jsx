import { memo } from 'react';

const KpiCard = memo(function KpiCard({ title, value, subtitle, icon, color, trend }) {
    const isPositive = trend > 0;
    
    return (
        <div className="glass-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, boxShadow: `0 0 20px ${color}10` }}>
                    <i className={`${icon} fa-xl`}></i>
                </div>
                {trend !== undefined && (
                    <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        color: isPositive ? '#10b981' : '#94a3b8', 
                        background: isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.05)', 
                        padding: '6px 10px', 
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
            
            <h3 style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, margin: '0 0 8px 0', letterSpacing: '0.02em' }}>{title.toUpperCase()}</h3>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>{value}</div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '6px 0 0 0', fontWeight: 500 }}>{subtitle}</p>
            
            {/* Decorative Glow */}
            <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', fontSize: '5rem', color: `${color}05`, transform: 'rotate(-15deg)', pointerEvents: 'none' }}>
                <i className={icon}></i>
            </div>
        </div>
    );
});

const DashboardKPIs = ({ metrics, formatters }) => {
    const { totalLeads, hotLeads, totalDeals, totalInventory, reengagedCount, nfaCount, trends } = metrics;
    const { fmtNum } = formatters;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
            <KpiCard
                title="Total Intelligence"
                value={fmtNum(totalLeads)}
                subtitle="Captured all-time"
                icon="fas fa-brain"
                color="#6366f1"
                trend={trends.leads}
            />
            <KpiCard
                title="Hot Prospects"
                value={fmtNum(hotLeads)}
                subtitle="High conversion potential"
                icon="fas fa-fire-alt"
                color="#f43f5e"
                trend={trends.deals}
            />
            <KpiCard
                title="Active Pipeline"
                value={fmtNum(totalDeals)}
                subtitle="Deals in movement"
                icon="fas fa-project-diagram"
                color="#10b981"
                trend={trends.deals}
            />
            <KpiCard
                title="Asset Inventory"
                value={fmtNum(totalInventory)}
                subtitle="Ready for matching"
                icon="fas fa-cube"
                color="#8b5cf6"
            />
            <KpiCard
                title="Lead Revival"
                value={fmtNum(reengagedCount)}
                subtitle="Dormant intelligence active"
                icon="fas fa-bolt"
                color="#06b6d4"
            />
            <KpiCard
                title="Critical Action"
                value={fmtNum(nfaCount)}
                subtitle="Immediate NFA required"
                icon="fas fa-radiation"
                color="#f59e0b"
            />
        </div>
    );
};

export default memo(DashboardKPIs);
