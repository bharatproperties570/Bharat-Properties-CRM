import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { api } from '../../utils/api';

const Chart = lazy(() => import('react-apexcharts'));

const ChartPlaceholder = ({ h = 200 }) => (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
        <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>LOADING METRICS...</div>
        </div>
    </div>
);

const fmtCr = (v) => {
    if (!v || v === 0) return '₹0';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
    return `₹${v}`;
};

const fmtNum = (v) => new Intl.NumberFormat('en-IN').format(v || 0);

// ─── KPI Card ────────────────────────────────────────────────────────────────
const KpiCard = ({ icon, label, value, desc, color = '#4f46e5', trend, trendUp, bg }) => (
    <div style={{
        background: bg || '#fff',
        borderRadius: '20px',
        padding: '20px',
        border: `1px solid ${color}22`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        cursor: 'default'
    }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${color}22`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
        <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: color, borderRadius: '50%', opacity: 0.06 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: 40, height: 40, borderRadius: '12px', background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`fas ${icon}`} style={{ color, fontSize: '1rem' }} />
            </div>
            {trend !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', fontWeight: 800, color: trendUp ? '#10b981' : '#ef4444', background: trendUp ? '#ecfdf5' : '#fef2f2', padding: '3px 8px', borderRadius: '20px' }}>
                    <i className={`fas fa-arrow-${trendUp ? 'up' : 'down'}`} style={{ fontSize: '0.55rem' }} />
                    {Math.abs(trend)}%
                </div>
            )}
        </div>
        <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', marginTop: '4px' }}>{label}</div>
            {desc && <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px', fontWeight: 600 }}>{desc}</div>}
        </div>
    </div>
);

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, badge, color = '#4f46e5' }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <span style={{ width: 32, height: 32, background: `${color}14`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`fas ${icon}`} style={{ color, fontSize: '0.85rem' }} />
            </span>
            {title}
        </h3>
        {badge && <span style={{ fontSize: '0.62rem', fontWeight: 900, color, background: `${color}12`, padding: '4px 10px', borderRadius: '20px', border: `1px solid ${color}22`, letterSpacing: '0.05em' }}>{badge}</span>}
    </div>
);

// ─── Card Wrapper ─────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
    <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '22px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        transition: 'all 0.3s ease',
        ...style
    }}>
        {children}
    </div>
);

// ─── Stage Funnel Bar ─────────────────────────────────────────────────────────
const StageFunnel = ({ stages = [] }) => {
    const max = Math.max(...stages.map(s => s.count), 1);
    const colors = ['#6366f1', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stages.map((s, i) => (
                <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>{s.status}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: colors[i] }}>{s.count}</span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${(s.count / max) * 100}%`,
                            background: `linear-gradient(90deg, ${colors[i]}, ${colors[i]}cc)`,
                            borderRadius: 4,
                            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Activity Badge ───────────────────────────────────────────────────────────
const activityIcon = (type) => {
    const map = { Call: 'fa-phone', Site_Visit: 'fa-map-marker-alt', 'Site Visit': 'fa-map-marker-alt', WhatsApp: 'fa-whatsapp', Note: 'fa-sticky-note', Email: 'fa-envelope', Meeting: 'fa-handshake', Task: 'fa-tasks' };
    return map[type] || 'fa-calendar';
};
const activityColor = (type) => {
    const map = { Call: '#10b981', 'Site Visit': '#8b5cf6', WhatsApp: '#25d366', Note: '#f59e0b', Email: '#3b82f6', Meeting: '#4f46e5', Task: '#ef4444' };
    return map[type] || '#64748b';
};

import { useUserContext } from '../../context/UserContext';

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const DashboardPage = () => {
    const { users, teams } = useUserContext();
    const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', userId, or teamId
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = {};
            if (selectedFilter !== 'all') {
                const isTeam = teams?.some(t => t.id === selectedFilter || t._id === selectedFilter);
                if (isTeam) params.teamId = selectedFilter;
                else params.userId = selectedFilter;
            }
            const response = await api.get('/dashboard/stats', { params });
            if (response.data.success) {
                setDashboardData(response.data.data);
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Dashboard fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedFilter]);

    // ── Derived data ────────────────────────────────────────────────────────
    const d = dashboardData || {};
    const perf = d.performance || {};
    const activities = d.activities || {};
    const leads = d.leads || [];
    const deals = d.deals || [];
    const inventory = d.inventoryHealth || [];
    const agenda = d.agenda || { tasks: [], siteVisits: [] };
    const aiAlerts = d.aiAlertHub || {};
    const suggestions = d.autoSuggestions || {};
    const actFeed = d.recentActivityFeed || [];
    const recentDeals = d.recentDeals || [];
    const leadSourceStats = d.leadSourceStats || [];
    const reengagedCount = d.reengagedCount || 0;
    const nfaCount = d.nfaCount || 0;
    const availability = d.availability || { totalIn: 0, totalNotIn: 0, totalOnLeave: 0 };
    const mtdVisits = d.mtdVisits || [];
    const mtdBookings = d.mtdBookings || [];
    const missedCallsCount = activities.missedCalls || 0;
    const missedFollowupsCount = activities.missedFollowups || 0;

    const totalLeads = leads.reduce((s, l) => s + l.count, 0);
    const totalDeals = deals.reduce((s, d) => s + d.count, 0);
    const totalInventory = inventory.reduce((s, i) => s + i.count, 0);
    const hotLeads = leads.find(l => l.status === 'PROSPECT')?.count || 0;

    const allAlerts = [
        ...(aiAlerts.followupFailure || []),
        ...(aiAlerts.hotLeads || []),
        ...(aiAlerts.stuckDeals || []),
        ...(aiAlerts.inventory || [])
    ];

    const allSuggestions = [
        ...(suggestions.leads || []),
        ...(suggestions.performance || []),
        ...(suggestions.pipeline || []),
        ...(suggestions.strategy || [])
    ];

    // Charts config
    const leadTrendChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false }, sparkline: { enabled: false } },
            stroke: { curve: 'smooth', width: 3 },
            colors: ['#4f46e5'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.02, stops: [0, 100] } },
            xaxis: { categories: d.leadTrend?.categories || [], labels: { style: { fontSize: '11px', fontWeight: 600 } } },
            yaxis: { labels: { style: { fontSize: '11px' } } },
            grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
            markers: { size: 5, strokeColors: '#fff', strokeWidth: 3 },
            tooltip: { theme: 'light' }
        },
        series: d.leadTrend?.series || [{ name: 'Leads', data: [] }]
    }), [d.leadTrend]);

    const cashFlowChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false } },
            stroke: { curve: 'smooth', width: 3 },
            colors: ['#10b981'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.02, stops: [0, 100] } },
            xaxis: { categories: d.cashFlowProjection?.categories || [], labels: { style: { fontSize: '11px', fontWeight: 600 } } },
            yaxis: { labels: { formatter: v => fmtCr(v), style: { fontSize: '11px' } } },
            grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
            tooltip: { y: { formatter: v => fmtCr(v) } }
        },
        series: d.cashFlowProjection?.series || [{ name: 'Commission', data: [] }]
    }), [d.cashFlowProjection]);

    const sourceChart = useMemo(() => ({
        options: {
            labels: leadSourceStats.map(s => s?.source || 'Other'),
            colors: ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'],
            legend: { position: 'bottom', fontSize: '11px', fontWeight: 700 },
            stroke: { width: 2 },
            plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total Leads', fontSize: '13px', fontWeight: 800 } } } } },
            dataLabels: { enabled: false }
        },
        series: leadSourceStats.map(s => s?.count || 0)
    }), [leadSourceStats]);

    const activityTypeChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
            colors: ['#4f46e5'],
            xaxis: { categories: (d.activityTypeBreakdown || []).map(a => a._id || 'Other'), labels: { style: { fontSize: '11px', fontWeight: 600 } } },
            grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
            dataLabels: { enabled: false },
            tooltip: { y: { formatter: v => `${v} activities` } }
        },
        series: [{ name: 'Activities', data: (d.activityTypeBreakdown || []).map(a => a.count) }]
    }), [d.activityTypeBreakdown]);

    if (loading) return (
        <section style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc, #eef2ff)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, border: '4px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Loading Command Center</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Aggregating live real estate data...</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
    );

    return (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(145deg, #f0f4ff 0%, #f8fafc 40%, #faf5ff 100%)', overflow: 'hidden' }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
                @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
                .dash-card { animation: slideUp 0.5s ease forwards; }
                .kpi-card:hover { transform: translateY(-4px); }
                .agenda-item:hover { background: #f8fafc !important; }
                .alert-chip:hover { transform: scale(1.02); }
            `}</style>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 40px' }}>

                {/* ── TOP HEADER BAR ────────────────────────────────────────────── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
                            Real Estate Command Center
                        </h1>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 7, height: 7, background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                                Live Data
                            </span>
                            {lastRefresh && <span>· Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '4px 8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <i className="fas fa-filter" style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: '4px' }}></i>
                            <select
                                value={selectedFilter}
                                onChange={(e) => setSelectedFilter(e.target.value)}
                                style={{
                                    border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: 700,
                                    color: '#334155', padding: '6px 8px', outline: 'none', cursor: 'pointer', maxWidth: '200px'
                                }}
                            >
                                <option value="all">Company View (All)</option>
                                {teams?.length > 0 && <optgroup label="Teams">
                                    {teams.map(t => <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>)}
                                </optgroup>}
                                {users?.length > 0 && <optgroup label="Users">
                                    {users.map(u => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName || u.name}</option>)}
                                </optgroup>}
                            </select>
                        </div>
                        <button onClick={fetchData} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', padding: '8px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#4338ca'}
                            onMouseLeave={e => e.currentTarget.style.background = '#4f46e5'}>
                            <i className="fas fa-sync-alt" />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── HERO KPI STRIP (ORIGINAL) ─────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <KpiCard icon="fa-users" label="Total Leads" value={fmtNum(totalLeads)} desc={`+${perf.newLeadsThisMonth || 0} this month`} color="#4f46e5" trend={perf.trend} trendUp={(perf.trend || 0) >= 0} />
                    <KpiCard icon="fa-fire" label="Hot Prospects" value={fmtNum(hotLeads)} desc="Active & high intent" color="#ef4444" />
                    <KpiCard icon="fa-handshake" label="Active Deals" value={fmtNum(totalDeals)} desc={`${perf.dealsThisMonth || 0} new this month`} color="#f59e0b" />
                    <KpiCard icon="fa-rupee-sign" label="Pipeline Value" value={fmtCr(perf.pipelineValue)} desc="Total active deal value" color="#10b981" />
                    <KpiCard icon="fa-warehouse" label="Inventory Units" value={fmtNum(totalInventory)} desc={`${perf.soldCount || 0} sold · ${perf.blockedCount || 0} blocked`} color="#8b5cf6" />
                </div>

                {/* ── SELL.DO INSPIRED KPI STRIP ────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <KpiCard icon="fa-sync-alt" label="Reengaged Leads" value={fmtNum(reengagedCount)} desc="Created before, active now" color="#3b82f6" />
                    <KpiCard icon="fa-user-slash" label="NFA (No Future Action)" value={fmtNum(nfaCount)} desc="No upcoming activities" color="#ef4444" />
                    <KpiCard icon="fa-phone-slash" label="Missed Calls" value={fmtNum(missedCallsCount)} desc="Pending overdue calls" color="#ef4444" />
                    <KpiCard icon="fa-history" label="Missed Followups" value={fmtNum(missedFollowupsCount)} desc="Pending overdue tasks" color="#f59e0b" />
                </div>

                {/* ── PERFORMANCE MONITOR ───────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                        {[
                            { label: 'Agreement Value (MTD)', val: fmtCr((mtdBookings || []).reduce((s,b) => s + b.value, 0)), icon: 'fa-file-signature', color: '#f59e0b' },
                            { label: 'Conducted Visits (MTD)', val: (mtdVisits || []).reduce((s,v) => s + (v.conducted || 0), 0), icon: 'fa-walking', color: '#8b5cf6' }
                        ].map((item, i) => (
                            <div key={i} style={{ background: '#fff', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>{item.label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>{item.val}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '18px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', marginBottom: '10px' }}>User Availability Status</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>{availability.totalIn}</div>
                                <div style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>Total In</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#ef4444' }}>{availability.totalNotIn}</div>
                                <div style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>Total Not In</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#f59e0b' }}>{availability.totalOnLeave || 0}</div>
                                <div style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>On Leave</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 340px', gap: '20px', alignItems: 'start' }}>

                    {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Lead Acquisition Command */}
                        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', padding: '24px', borderRadius: '24px', color: '#fff', boxShadow: '0 20px 40px rgba(79,70,229,0.2)' }} className="dash-card">
                            <SectionHeader icon="fa-bolt" title="Lead Acquisition Command" badge="LIVE SYNC" color="#a5b4fc" />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                                {leads.map((l, i) => {
                                    const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
                                    const icons = ['fa-satellite-dish', 'fa-user-check', 'fa-star', 'fa-comments-dollar', 'fa-trophy'];
                                    return (
                                        <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: -10, right: -10, width: 50, height: 50, background: colors[i] || '#fff', borderRadius: '50%', opacity: 0.15, filter: 'blur(12px)' }} />
                                            <div style={{ width: 28, height: 28, borderRadius: '8px', background: `${colors[i] || '#fff'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                                                <i className={`fas ${icons[i] || 'fa-circle'}`} style={{ color: colors[i] || '#fff', fontSize: '0.75rem' }} />
                                            </div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{l.count}</div>
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l.status}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Lead Funnel */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '16px' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.08em' }}>Stage Distribution</div>
                                <StageFunnel stages={leads} />
                            </div>
                        </div>

                        {/* Lead Growth Trend Chart */}
                        <Card>
                            <SectionHeader icon="fa-chart-line" title="Lead Growth Trend" badge="6 MONTHS" color="#4f46e5" />
                            <Suspense fallback={<ChartPlaceholder h={220} />}>
                                <Chart options={leadTrendChart.options} series={leadTrendChart.series} type="area" height={220} />
                            </Suspense>
                        </Card>

                        {/* Activity Breakdown (ORIGINAL) */}
                        <Card>
                            <SectionHeader icon="fa-chart-bar" title="Activity Type Breakdown" badge="30 DAYS" color="#f59e0b" />
                            <Suspense fallback={<ChartPlaceholder h={200} />}>
                                <Chart options={activityTypeChart.options} series={activityTypeChart.series} type="bar" height={200} />
                            </Suspense>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '16px' }}>
                                {[
                                    { label: 'Overdue', val: activities.overdue, color: '#ef4444', icon: 'fa-clock' },
                                    { label: 'Today', val: activities.today, color: '#f59e0b', icon: 'fa-calendar-day' },
                                    { label: 'Upcoming', val: activities.upcoming, color: '#10b981', icon: 'fa-calendar-check' }
                                ].map((a, i) => (
                                    <div key={i} style={{ background: `${a.color}08`, border: `1px solid ${a.color}20`, borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                                        <i className={`fas ${a.icon}`} style={{ color: a.color, fontSize: '1rem', marginBottom: '4px', display: 'block' }} />
                                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: a.color }}>{a.val || 0}</div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>{a.label}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* MTD Performance Combined */}
                        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '16px' }}>
                            {/* MTD Visits By Project */}
                            <Card>
                                <SectionHeader icon="fa-map-marked-alt" title="MTD Visits by Project" badge="THIS MONTH" color="#8b5cf6" />
                                <div style={{ overflowY: 'auto', maxHeight: '150px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead style={{ background: '#f8fafc', color: '#64748b', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Project</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Planned</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Conducted</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mtdVisits.map((v, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px', fontWeight: 700 }}>{v._id || 'General'}</td>
                                                    <td style={{ padding: '8px' }}>{v.count}</td>
                                                    <td style={{ padding: '8px', color: '#10b981', fontWeight: 800 }}>{v.conducted}</td>
                                                </tr>
                                            ))}
                                            {mtdVisits.length === 0 && <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No visits logged this month</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* MTD Bookings By Project */}
                            <Card>
                                <SectionHeader icon="fa-trophy" title="MTD Bookings by Project" badge="THIS MONTH" color="#10b981" />
                                <div style={{ overflowY: 'auto', maxHeight: '150px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead style={{ background: '#f8fafc', color: '#64748b', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Project</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Units</th>
                                                <th style={{ padding: '8px', textAlign: 'left' }}>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mtdBookings.map((b, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px', fontWeight: 700 }}>{b._id || 'N/A'}</td>
                                                    <td style={{ padding: '8px' }}>{b.count}</td>
                                                    <td style={{ padding: '8px', color: '#10b981', fontWeight: 800 }}>{fmtCr(b.value)}</td>
                                                </tr>
                                            ))}
                                            {mtdBookings.length === 0 && <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No bookings this month</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                    </div>

                    {/* ══ MIDDLE COLUMN ════════════════════════════════════════════ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Revenue & Commission Panel */}
                        <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)', padding: '24px', borderRadius: '24px', color: '#fff', boxShadow: '0 20px 40px rgba(16,185,129,0.15)' }} className="dash-card">
                            <SectionHeader icon="fa-rupee-sign" title="Revenue & Commission" badge="FINANCIAL" color="#6ee7b7" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                {[
                                    { label: 'Commission Collected', val: fmtCr(perf.revenue), icon: 'fa-check-circle', color: '#6ee7b7' },
                                    { label: 'Commission Pending', val: fmtCr(perf.pendingCommission), icon: 'fa-hourglass-half', color: '#fbbf24' },
                                    { label: 'Pipeline Value', val: fmtCr(perf.pipelineValue), icon: 'fa-filter', color: '#93c5fd' },
                                    { label: 'Target Remaining', val: fmtCr(perf.remaining), icon: 'fa-bullseye', color: '#f87171' }
                                ].map((item, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <i className={`fas ${item.icon}`} style={{ color: item.color, fontSize: '0.75rem' }} />
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>{item.val}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Target Progress Bar */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>MONTHLY TARGET</span>
                                    <span style={{ fontSize: '0.65rem', color: '#6ee7b7', fontWeight: 900 }}>{perf.conversion || 0}% Achieved</span>
                                </div>
                                <div style={{ height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', width: `${Math.min(100, Math.round(((perf.achieved || 0) / (perf.target || 1)) * 100))}%`,
                                        background: 'linear-gradient(90deg, #10b981, #6ee7b7)', borderRadius: 5, transition: 'width 1.5s ease'
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>{fmtCr(perf.achieved)} closed</span>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>Target: {fmtCr(perf.target)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Commission Cash Flow Chart */}
                        <Card>
                            <SectionHeader icon="fa-chart-area" title="Commission Cash Flow" badge="6 MONTHS" color="#10b981" />
                            <Suspense fallback={<ChartPlaceholder h={200} />}>
                                <Chart options={cashFlowChart.options} series={cashFlowChart.series} type="area" height={200} />
                            </Suspense>
                        </Card>

                        {/* Inventory Health */}
                        <Card>
                            <SectionHeader icon="fa-warehouse" title="Inventory Health" badge="REAL-TIME" color="#8b5cf6" />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                                {inventory.slice(0, 4).map((item, i) => {
                                    const colors = ['#10b981', '#4f46e5', '#f59e0b', '#ef4444'];
                                    return (
                                        <div key={i} style={{ padding: '14px', background: `${colors[i] || '#64748b'}08`, borderRadius: '12px', border: `1px solid ${colors[i] || '#64748b'}20` }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: colors[i] || '#64748b' }}>{item.count}</div>
                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginTop: '2px' }}>{item.status}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Source Donut Chart */}
                            {leadSourceStats.length > 0 && (
                                <>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Lead Sources</div>
                                    <Suspense fallback={<ChartPlaceholder h={180} />}>
                                        <Chart options={sourceChart.options} series={sourceChart.series} type="donut" height={180} />
                                    </Suspense>
                                </>
                            )}
                        </Card>

                        {/* Recent Deals Feed */}
                        <Card>
                            <SectionHeader icon="fa-history" title="Recent Deal Activity" badge="LIVE FEED" color="#f59e0b" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {recentDeals.length > 0 ? recentDeals.map((deal, i) => {
                                    const stageColors = { Open: '#3b82f6', Negotiation: '#8b5cf6', Booked: '#10b981', 'Closed Won': '#10b981', 'Closed Lost': '#ef4444', Quote: '#f59e0b', Stalled: '#64748b' };
                                    const sc = stageColors[deal.stage] || '#64748b';
                                    return (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}
                                            className="agenda-item">
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <div style={{ width: 32, height: 32, background: `${sc}14`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-building" style={{ color: sc, fontSize: '0.75rem' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>{deal.unitNo || deal.project || 'Deal'}</div>
                                                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>{deal.project || ''}</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 900, color: sc, background: `${sc}12`, padding: '3px 8px', borderRadius: '6px', marginBottom: '2px' }}>{deal.stage}</div>
                                                {deal.value > 0 && <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569' }}>{fmtCr(deal.value)}</div>}
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>No recent deal activity</div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* ══ RIGHT SIDEBAR ════════════════════════════════════════════ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Today's Agenda */}
                        <Card style={{ border: '1px solid #e0e7ff', background: 'linear-gradient(to bottom, #fff 0%, #fafafe 100%)' }}>
                            <SectionHeader icon="fa-calendar-check" title="Today's Agenda" badge={`${agenda.tasks.length + agenda.siteVisits.length} items`} color="#4f46e5" />

                            {agenda.siteVisits.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-map-marker-alt" /> Site Visits ({agenda.siteVisits.length})
                                    </div>
                                    {agenda.siteVisits.map((v, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '12px', marginBottom: '6px' }} className="agenda-item">
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0f172a' }}>{v.client}</span>
                                                <span style={{ fontSize: '0.62rem', color: '#8b5cf6', fontWeight: 800 }}>{v.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>{v.target}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {agenda.tasks.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-exclamation-circle" /> Overdue & Due ({agenda.tasks.length})
                                    </div>
                                    {agenda.tasks.map((t, i) => (
                                        <div key={i} style={{ padding: '10px 12px', background: t.status === 'overdue' ? 'rgba(239,68,68,0.04)' : '#f8fafc', border: `1px solid ${t.status === 'overdue' ? 'rgba(239,68,68,0.15)' : '#e2e8f0'}`, borderRadius: '12px', marginBottom: '6px' }} className="agenda-item">
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0f172a' }}>{t.title}</span>
                                                <span style={{ fontSize: '0.62rem', color: t.status === 'overdue' ? '#ef4444' : '#64748b', fontWeight: 800 }}>{t.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>{t.target}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {agenda.tasks.length === 0 && agenda.siteVisits.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                                    <i className="fas fa-check-circle" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block', color: '#10b981' }} />
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Clear agenda today!</div>
                                </div>
                            )}
                        </Card>

                        {/* AI Alert Hub */}
                        <Card style={{ background: 'linear-gradient(to bottom, #020617, #0f172a)', border: 'none' }}>
                            <SectionHeader icon="fa-microchip" title="AI Alert Hub" badge="NEURAL ENGINE" color="#818cf8" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {allAlerts.length > 0 ? allAlerts.slice(0, 4).map((alert, i) => {
                                    const typeStyle = {
                                        critical: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', badge: '#ef4444', dot: '#ef4444' },
                                        hot: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', badge: '#f59e0b', dot: '#f59e0b' },
                                        warning: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.15)', badge: '#fbbf24', dot: '#fbbf24' },
                                        info: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)', badge: '#818cf8', dot: '#6366f1' }
                                    };
                                    const ts = typeStyle[alert.type] || typeStyle.info;
                                    return (
                                        <div key={i} style={{ background: ts.bg, border: `1px solid ${ts.border}`, borderRadius: '14px', padding: '14px' }} className="alert-chip">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ts.dot, display: 'inline-block' }} />
                                                    {alert.title}
                                                </span>
                                                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: ts.badge, textTransform: 'uppercase', border: `1px solid ${ts.badge}44`, padding: '2px 6px', borderRadius: '6px' }}>{alert.type}</span>
                                            </div>
                                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, margin: '0 0 10px' }}>{alert.message}</p>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {(alert.actions || []).map((act, j) => (
                                                    <button key={j} style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: j === 0 ? '#4f46e5' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = j === 0 ? '#4338ca' : 'rgba(255,255,255,0.1)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = j === 0 ? '#4f46e5' : 'rgba(255,255,255,0.06)'}>{act}</button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
                                        <i className="fas fa-shield-alt" style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block' }} />
                                        All systems optimal — no critical alerts
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Recent Activity Feed */}
                        <Card>
                            <SectionHeader icon="fa-stream" title="Activity Feed" badge="RECENT" color="#06b6d4" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {actFeed.slice(0, 6).map((act, i) => {
                                    const aColor = activityColor(act.type);
                                    const aIcon = activityIcon(act.type);
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px', borderRadius: '10px', transition: 'all 0.2s' }} className="agenda-item">
                                            <div style={{ width: 28, height: 28, minWidth: 28, borderRadius: '8px', background: `${aColor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className={`fas ${aIcon}`} style={{ color: aColor, fontSize: '0.7rem' }} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.subject}</div>
                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600 }}>
                                                    {act.relatedTo?.[0]?.name || act.type}
                                                    {act.createdAt && <> · {new Date(act.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: act.status === 'Completed' ? '#10b981' : '#f59e0b', background: act.status === 'Completed' ? '#ecfdf5' : '#fffbeb', padding: '2px 6px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{act.status || 'Logged'}</span>
                                        </div>
                                    );
                                })}
                                {actFeed.length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>No recent activities</div>
                                )}
                            </div>
                        </Card>

                        {/* AI Suggestions */}
                        <Card style={{ background: 'linear-gradient(135deg, #eff6ff, #fafafe)', border: '1px solid #dbeafe' }}>
                            <SectionHeader icon="fa-lightbulb" title="AI Recommendations" badge={`${allSuggestions.length} insights`} color="#3b82f6" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {allSuggestions.slice(0, 4).map((sug, i) => {
                                    const typeGlyph = { optimization: '⚡', training: '📚', growth: '🚀', strategy: '🎯' };
                                    return (
                                        <div key={i} style={{ padding: '10px 12px', background: '#fff', borderRadius: '12px', border: '1px solid #e0e7ff', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{typeGlyph[sug.type] || '💡'}</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#374151', lineHeight: 1.4 }}>{sug.text}</span>
                                        </div>
                                    );
                                })}
                                {allSuggestions.length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>No suggestions available</div>
                                )}
                            </div>
                        </Card>

                        {/* Projects Quick View */}
                        <Card>
                            <SectionHeader icon="fa-city" title="Projects" badge={`${d.projects || 0} active`} color="#4f46e5" />
                            {(d.projectList || []).length > 0 ? (d.projectList || []).map((proj, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < (d.projectList.length - 1) ? '1px solid #f1f5f9' : 'none' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-building" style={{ color: '#4f46e5', fontSize: '0.7rem' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>{proj.name}</div>
                                            {proj.location && <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{proj.location}</div>}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '3px 8px', borderRadius: '8px' }}>{proj.status || 'Active'}</span>
                                </div>
                            )) : (
                                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>No active projects</div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DashboardPage;
