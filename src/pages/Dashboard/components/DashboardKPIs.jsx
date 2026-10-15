import { memo, useState } from 'react';

/* ─── Injected CSS ─────────────────────────────────────────────── */
const KPI_STYLES = `
  @keyframes kpi-pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
    70%  { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  @keyframes kpi-dot-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
  .kpi-hover-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: default;
  }
  .kpi-hover-card:hover {
    transform: translateY(-3px) scale(1.025);
  }
  .kpi-hover-card[data-color='#6366f1']:hover { box-shadow: 0 8px 30px rgba(99,102,241,0.25); }
  .kpi-hover-card[data-color='#f43f5e']:hover { box-shadow: 0 8px 30px rgba(244,63,94,0.25); }
  .kpi-hover-card[data-color='#10b981']:hover { box-shadow: 0 8px 30px rgba(16,185,129,0.25); }
  .kpi-hover-card[data-color='#8b5cf6']:hover { box-shadow: 0 8px 30px rgba(139,92,246,0.25); }
  .kpi-hover-card[data-color='#06b6d4']:hover { box-shadow: 0 8px 30px rgba(6,182,212,0.25); }
  .kpi-hover-card[data-color='#f59e0b']:hover { box-shadow: 0 8px 30px rgba(245,158,11,0.25); }
  .kpi-critical-pulse {
    animation: kpi-pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite;
    border-radius: 10px;
  }
  .kpi-dot-blink {
    animation: kpi-dot-blink 1.2s ease-in-out infinite;
  }
`;

/* ─── Mini Sparkline (3 bars) ──────────────────────────────────── */
const MiniSparkline = ({ trend, color }) => {
    const positive = trend > 0;
    // bar heights: [low, mid, high] for upward; reversed for downward; flat for zero
    const bars = positive
        ? [4, 8, 14]
        : trend < 0
            ? [14, 8, 4]
            : [8, 8, 8];

    return (
        <div style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '3px',
            opacity: 0.45,
            pointerEvents: 'none',
        }}>
            {bars.map((h, i) => (
                <div
                    key={i}
                    style={{
                        width: '4px',
                        height: `${h}px`,
                        borderRadius: '2px',
                        background: color,
                    }}
                />
            ))}
        </div>
    );
};

/* ─── KpiCard ──────────────────────────────────────────────────── */
const KpiCard = memo(function KpiCard({
    title, value, subtitle, icon, color, trend,
    isCritical = false,
    isRevenue   = false,
}) {
    const [hovered, setHovered] = useState(false);
    const isPositive = trend > 0;
    const showRevNote = isRevenue && (
        typeof value === 'string' && (value === '₹0.00Cr' || value.startsWith('₹0'))
    );

    return (
        <div
            className={`glass-card kpi-hover-card${isCritical && hovered ? ' kpi-critical-pulse' : ''}`}
            data-color={color}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ padding: '16px 14px', position: 'relative', overflow: 'hidden', minHeight: '120px' }}
        >
            {/* Header row: icon + trend badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                {/* Icon box */}
                <div style={{
                    width: '38px', height: '38px', borderRadius: '11px',
                    background: `${color}18`, border: `1px solid ${color}35`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: color, boxShadow: `0 0 18px ${color}15`,
                    flexShrink: 0,
                }}>
                    <i className={`${icon} fa-sm`}></i>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Pulsing alert dot for critical card */}
                    {isCritical && (
                        <div
                            className="kpi-dot-blink"
                            style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: '#ef4444',
                                boxShadow: '0 0 6px rgba(239,68,68,0.7)',
                            }}
                        />
                    )}

                    {/* Trend badge */}
                    {trend !== undefined && (
                        <div style={{
                            fontSize: '0.62rem', fontWeight: 700,
                            color: isPositive ? '#10b981' : '#94a3b8',
                            background: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.05)',
                            padding: '3px 7px', borderRadius: '20px',
                            display: 'flex', alignItems: 'center', gap: '3px',
                            border: `1px solid ${isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.1)'}`,
                        }}>
                            <i className={`fas fa-caret-${isPositive ? 'up' : 'down'}`}></i>
                            {Math.abs(trend)}%
                        </div>
                    )}
                </div>
            </div>

            {/* Label */}
            <h3 style={{
                fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700,
                margin: '0 0 4px 0', letterSpacing: '0.06em', textTransform: 'uppercase',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.75,
            }}>
                {title}
            </h3>

            {/* Value */}
            <div style={{
                fontSize: '1.55rem', fontWeight: 900, color: 'var(--text-main)',
                letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '4px',
            }}>
                {value}
            </div>

            {/* Subtitle */}
            <p style={{
                fontSize: '0.63rem', color: '#64748b', margin: 0,
                fontWeight: 500, lineHeight: 1.3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
                {subtitle}
            </p>

            {/* Revenue context note */}
            {showRevNote && (
                <p style={{
                    fontSize: '0.58rem', color: '#475569', margin: '4px 0 0 0',
                    fontWeight: 600, letterSpacing: '0.02em',
                }}>
                    Target not yet tracked
                </p>
            )}

            {/* Mini sparkline (bottom-right) */}
            {trend !== undefined && <MiniSparkline trend={trend} color={color} />}

            {/* Decorative background icon */}
            <div style={{
                position: 'absolute', right: '-12px', bottom: '-12px',
                fontSize: '3.5rem', color: `${color}06`,
                transform: 'rotate(-15deg)', pointerEvents: 'none',
            }}>
                <i className={icon}></i>
            </div>
        </div>
    );
});

/* ─── DashboardKPIs ────────────────────────────────────────────── */
const DashboardKPIs = ({ metrics, formatters }) => {
    const { totalLeads, hotLeads, totalDeals, totalInventory, reengagedCount, nfaCount, trends, perf } = metrics;
    const { fmtNum, fmtCr } = formatters;

    const revenueValue = fmtCr(perf?.mtdCommission || 0);

    return (
        <>
            {/* Inject CSS once */}
            <style>{KPI_STYLES}</style>

            <div
                className="kpi-grid"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                    gap: '12px',
                    marginBottom: '24px',
                }}
            >
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
                    subtitle="Dormant leads re-engaged"
                    icon="fas fa-bolt"
                    color="#06b6d4"
                />
                <KpiCard
                    title="Revenue Performance"
                    value={revenueValue}
                    subtitle="MTD Secured Revenue"
                    icon="fas fa-hand-holding-usd"
                    color="#10b981"
                    trend={trends.revenue}
                    isRevenue={true}
                />
                <KpiCard
                    title="Critical Action"
                    value={fmtNum(nfaCount)}
                    subtitle="Leads with no follow-up"
                    icon="fas fa-radiation"
                    color="#f59e0b"
                    isCritical={true}
                />
            </div>
        </>
    );
};

export default memo(DashboardKPIs);
