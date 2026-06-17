import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { useTheme } from '../../context/ThemeContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, CartesianGrid
} from 'recharts';
import './DealAnalyticsPage.css';
import MarketPriceTrendChart from '../../components/charts/MarketPriceTrendChart';

// ── Constants ───────────────────────────────────────────────────
const DEAL_STAGES = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed Won', 'Closed Lost', 'Stalled', 'Cancelled'];
const STAGE_COLORS = {
  'Open': '#3b82f6',
  'Quote': '#8b5cf6',
  'Negotiation': '#f59e0b',
  'Booked': '#10b981',
  'Closed Won': '#10b981',
  'Closed Lost': '#ef4444',
  'Stalled': '#f43f5e',
  'Cancelled': '#64748b',
};
const STAGE_PROB = { 'Open': 20, 'Quote': 40, 'Negotiation': 70, 'Booked': 90, 'Closed Won': 100, 'Closed Lost': 0, 'Stalled': 20, 'Cancelled': 0 };

const SOURCE_COLORS = {
  'Walk-in': '#10b981',
  'Newspaper': '#6366f1',
  '99acres': '#f59e0b',
  'Social Media': '#ec4899',
  'Cold Calling': '#3b82f6',
  'Own Website': '#14b8a6',
};

const INTENT_COLORS = { 'Sell': '#ec4899', 'Rent': '#f59e0b', 'Lease': '#3b82f6' };
const PRICE_BANDS = [
  { label: 'Under ₹25L', min: 0, max: 2500000, color: '#3b82f6' },
  { label: '₹25L–50L', min: 2500000, max: 5000000, color: '#6366f1' },
  { label: '₹50L–75L', min: 5000000, max: 7500000, color: '#8b5cf6' },
  { label: '₹75L–1Cr', min: 7500000, max: 10000000, color: '#f59e0b' },
  { label: 'Above ₹1Cr', min: 10000000, max: Infinity, color: '#ef4444' },
];

// ── Custom Tooltip ───────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: isDark ? '#1e293b' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
      boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
      borderRadius: '10px', padding: '10px 14px', fontSize: '0.75rem',
      color: isDark ? '#e2e8f0' : '#1e293b'
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 4, color: isDark ? '#94a3b8' : '#64748b' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || (isDark ? '#e2e8f0' : '#1e293b'), fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 100000
            ? formatIndianCurrency(p.value)
            : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Skeleton ─────────────────────────────────────────────────────
const Skeleton = ({ height = 100, style = {} }) => (
  <div className="skeleton-line" style={{ height, borderRadius: '16px', ...style }} />
);

// ── KPI Card ─────────────────────────────────────────────────────
const KPICard = ({ icon, iconBg, label, value, sub, trend, trendDir, color }) => (
  <div className="kpi-card" style={{ '--kpi-color': color || 'linear-gradient(90deg, #3b82f6, #6366f1)' }}>
    <div className="kpi-card-header">
      <div className="kpi-icon" style={{ background: iconBg || 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
        <i className={`fas ${icon}`} />
      </div>
      {trend != null && (
        <span className={`kpi-trend ${trendDir || 'neutral'}`}>
          <i className={`fas fa-arrow-${trendDir === 'up' ? 'up' : trendDir === 'down' ? 'down' : 'right'}`} />
          {trend}
        </span>
      )}
    </div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-label">{label}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);

// ── Main Component ───────────────────────────────────────────────
const DealAnalyticsPage = ({ onNavigate }) => {
    const { isDark } = useTheme();
  const { sizes, getLookupValue } = usePropertyConfig();
  const tickColor   = isDark ? '#64748b' : '#94a3b8';
  const gridStroke  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const Tip = (props) => <CustomTooltip {...props} isDark={isDark} />;

  const [deals, setDeals] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch all deals (large limit for analytics)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, scoresRes] = await Promise.all([
        api.get('deals?limit=2000&sortBy=createdAt&sortOrder=-1'),
        api.get('stage-engine/deals/scores').catch(() => ({ data: { scores: {} } }))
      ]);
      if (dealsRes.data?.success) setDeals(dealsRes.data.records || []);
      if (scoresRes.data?.success) setScores(scoresRes.data.scores || {});
    } catch (e) {
      console.error('Analytics fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // ── Date Filtering ───────────────────────────────────────────
  const filteredDeals = useMemo(() => {
    let d = deals.filter(deal => deal.isVisible !== false);
    if (dateRange === 'all') return d;
    const days = parseInt(dateRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return d.filter(deal => new Date(deal.createdAt) >= cutoff);
  }, [deals, dateRange]);

  // ── KPI Computations ─────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = filteredDeals.filter(d => ['Open', 'Quote', 'Negotiation', 'Booked'].includes(d.stage));
    const won = filteredDeals.filter(d => d.stage === 'Closed Won');
    const lost = filteredDeals.filter(d => d.stage === 'Closed Lost');
    const stalled = filteredDeals.filter(d => d.stage === 'Stalled');

    const now = new Date();
    const thisMonth = filteredDeals.filter(d => {
      const cd = new Date(d.closingDetails?.closingDate || d.updatedAt);
      return cd.getMonth() === now.getMonth() && cd.getFullYear() === now.getFullYear();
    });
    const wonThisMonth = thisMonth.filter(d => d.stage === 'Closed Won');
    const lostThisMonth = thisMonth.filter(d => d.stage === 'Closed Lost');

    const pipelineValue = active.reduce((sum, d) => {
      const prob = STAGE_PROB[d.stage] || 20;
      return sum + ((d.price || 0) * prob / 100);
    }, 0);

    const winRate = (won.length + lost.length) > 0
      ? ((won.length / (won.length + lost.length)) * 100).toFixed(1)
      : 0;

    const hotDeals = Object.values(scores).filter(s => s?.score >= 80).length;

    const staleDeals = filteredDeals.filter(d => {
      const daysSince = (Date.now() - new Date(d.updatedAt)) / (1000 * 60 * 60 * 24);
      return daysSince > 30 && ['Open', 'Quote', 'Negotiation'].includes(d.stage);
    });

    // Avg cycle time
    const closedWithDates = won.filter(d => d.closingDetails?.closingDate && d.createdAt);
    const avgCycle = closedWithDates.length > 0
      ? Math.round(closedWithDates.reduce((sum, d) => {
          return sum + (new Date(d.closingDetails.closingDate) - new Date(d.createdAt)) / (1000 * 60 * 60 * 24);
        }, 0) / closedWithDates.length)
      : null;

    const wonValue = won.reduce((s, d) => s + (d.price || 0), 0);
    const wonThisMonthValue = wonThisMonth.reduce((s, d) => s + (d.price || 0), 0);

    return {
      totalDeals: filteredDeals.length,
      activeDeals: active.length,
      pipelineValue,
      wonTotal: won.length,
      wonValue,
      wonThisMonth: wonThisMonth.length,
      wonThisMonthValue,
      lostThisMonth: lostThisMonth.length,
      winRate,
      avgCycle,
      hotDeals,
      staleDeals: staleDeals.length,
      stalledDeals: stalled.length,
      staleList: staleDeals.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)).slice(0, 20)
    };
  }, [filteredDeals, scores]);

  // ── Stage Funnel ─────────────────────────────────────────────
  const stageData = useMemo(() => {
    const openStages = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed Won'];
    return openStages.map(stage => {
      const count = filteredDeals.filter(d => d.stage === stage).length;
      const value = filteredDeals.filter(d => d.stage === stage).reduce((s, d) => s + (d.price || 0), 0);
      return { stage, count, value, color: STAGE_COLORS[stage] };
    });
  }, [filteredDeals]);

  const maxStageCount = Math.max(...stageData.map(s => s.count), 1);

  // Stage conversion rates
  const conversionRates = useMemo(() => {
    const rates = [];
    for (let i = 0; i < stageData.length - 1; i++) {
      const from = stageData[i].count;
      const to = stageData[i + 1].count;
      rates.push(from > 0 ? ((to / from) * 100).toFixed(0) : 0);
    }
    return rates;
  }, [stageData]);

  // ── Monthly Revenue Chart ─────────────────────────────────────
  const monthlyData = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, won: 0, pipeline: 0, new: 0 };
    }
    filteredDeals.forEach(deal => {
      const cd = new Date(deal.createdAt);
      const key = cd.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) {
        months[key].new++;
        if (deal.stage === 'Closed Won') months[key].won += (deal.price || 0) / 100000;
        if (['Open', 'Quote', 'Negotiation', 'Booked'].includes(deal.stage))
          months[key].pipeline += (deal.price || 0) / 100000;
      }
    });
    return Object.values(months);
  }, [filteredDeals]);

  // ── Intent Distribution ───────────────────────────────────────
  const intentData = useMemo(() => {
    const map = {};
    filteredDeals.forEach(d => {
      const intent = d.intent || 'Sell';
      map[intent] = (map[intent] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: INTENT_COLORS[name] || isDark ? 'var(--text-muted)' : '#64748b' }));
  }, [filteredDeals]);

  // ── Price Band Distribution ───────────────────────────────────
  const priceBandData = useMemo(() => {
    return PRICE_BANDS.map(band => ({
      ...band,
      count: filteredDeals.filter(d => (d.price || 0) >= band.min && (d.price || 0) < band.max).length
    })).filter(b => b.count > 0);
  }, [filteredDeals]);

  // ── Deal Type (Hot/Warm/Cold) ─────────────────────────────────
  const dealTypeData = useMemo(() => {
    const map = { Hot: 0, Warm: 0, Cold: 0 };
    filteredDeals.forEach(d => { if (map[d.dealType] !== undefined) map[d.dealType]++; });
    return [
      { name: 'Hot', value: map.Hot, color: '#ef4444' },
      { name: 'Warm', value: map.Warm, color: '#f59e0b' },
      { name: 'Cold', value: map.Cold, color: '#3b82f6' },
    ];
  }, [filteredDeals]);

  // ── Source Performance ────────────────────────────────────────
  const sourceData = useMemo(() => {
    const map = {};
    filteredDeals.forEach(d => {
      const src = d.source || 'Unknown';
      if (!map[src]) map[src] = { source: src, count: 0, won: 0, value: 0 };
      map[src].count++;
      if (d.stage === 'Closed Won') { map[src].won++; map[src].value += d.price || 0; }
    });
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map(s => ({ ...s, winRate: s.count > 0 ? ((s.won / s.count) * 100).toFixed(0) : 0 }));
  }, [filteredDeals]);

  const maxSourceCount = Math.max(...sourceData.map(s => s.count), 1);

  // ── Agent Leaderboard ─────────────────────────────────────────
  const agentData = useMemo(() => {
    const map = {};
    filteredDeals.forEach(d => {
      const name = typeof d.assignedTo === 'object'
        ? (d.assignedTo?.fullName || d.assignedTo?.name || 'Unassigned')
        : (d.assignedTo || 'Unassigned');
      if (!map[name]) map[name] = { name, total: 0, won: 0, pipeline: 0 };
      map[name].total++;
      if (d.stage === 'Closed Won') map[name].won++;
      if (['Open', 'Quote', 'Negotiation', 'Booked'].includes(d.stage))
        map[name].pipeline += d.price || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.won - a.won || b.total - a.total)
      .slice(0, 10)
      .map(a => ({ ...a, winRate: a.total > 0 ? ((a.won / a.total) * 100).toFixed(0) : 0 }));
  }, [filteredDeals]);

  // ── Project Leaderboard ───────────────────────────────────────
  const projectData = useMemo(() => {
    const map = {};
    filteredDeals.forEach(d => {
      const pName = typeof d.projectName === 'object' ? d.projectName?.name : d.projectName;
      if (!pName) return;
      if (!map[pName]) map[pName] = { name: pName, total: 0, won: 0, value: 0 };
      map[pName].total++;
      if (d.stage === 'Closed Won') { map[pName].won++; map[pName].value += d.price || 0; }
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
      .map(p => ({ ...p, winRate: p.total > 0 ? ((p.won / p.total) * 100).toFixed(0) : 0 }));
  }, [filteredDeals]);

  // ── Market Gap Summary ────────────────────────────────────────
  const marketGapData = useMemo(() => {
    const premium = [], fair = [], below = [];
    Object.entries(scores).forEach(([id, s]) => {
      const gap = s?.marketGapPct;
      if (gap == null) return;
      if (gap > 5) premium.push(gap);
      else if (gap < -5) below.push(gap);
      else fair.push(gap);
    });
    return { premium: premium.length, fair: fair.length, below: below.length };
  }, [scores]);

  // ── Stale Days Calc ───────────────────────────────────────────
  const getStaleDays = (deal) => Math.floor((Date.now() - new Date(deal.updatedAt)) / (1000 * 60 * 60 * 24));

  const getStaleBadge = (days) => {
    if (days >= 90) return { cls: 'critical', label: `${days}d Critical` };
    if (days >= 60) return { cls: 'danger', label: `${days}d Danger` };
    return { cls: 'warning', label: `${days}d Warning` };
  };

  // ── Loss Reason Analysis ──────────────────────────────────────
  const lossReasonData = useMemo(() => {
    const map = {};
    filteredDeals.filter(d => d.stage === 'Closed Lost').forEach(d => {
      const reasons = d.closingDetails?.lossReasons || [];
      (Array.isArray(reasons) ? reasons : [reasons]).forEach(r => {
        if (r) map[r] = (map[r] || 0) + 1;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([reason, count]) => ({ reason, count }));
  }, [filteredDeals]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="deal-analytics-page">
      <div className="analytics-scroll-wrapper">

        {/* HEADER */}
        <div className="analytics-header">
          <div className="analytics-header-left">
            <div className="analytics-header-icon">
              <i className="fas fa-chart-line" />
            </div>
            <div className="analytics-header-title">
              <h1>Deal Intelligence Analytics</h1>
              <p>Enterprise-grade performance insights for your real estate pipeline</p>
            </div>
          </div>
          <div className="analytics-header-right">
            <div className="analytics-date-filters">
              {[{ label: '7D', val: '7' }, { label: '30D', val: '30' }, { label: '90D', val: '90' }, { label: 'All Time', val: 'all' }].map(r => (
                <button key={r.val} className={`date-filter-btn ${dateRange === r.val ? 'active' : ''}`} onClick={() => setDateRange(r.val)}>
                  {r.label}
                </button>
              ))}
            </div>
            <button className="analytics-refresh-btn" onClick={() => setRefreshKey(k => k + 1)}>
              <i className="fas fa-sync-alt" /> Refresh
            </button>
            {onNavigate && (
              <button className="analytics-back-btn" onClick={() => onNavigate('deals')}>
                <i className="fas fa-arrow-left" /> Back to Deals
              </button>
            )}
          </div>
        </div>

        {/* ── SECTION 1: KPI Cards ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Key Performance Indicators</div>
          {loading ? (
            <div className="kpi-grid">
              {[...Array(8)].map((_, i) => <Skeleton key={i} height={110} />)}
            </div>
          ) : (
            <div className="kpi-grid">
              <KPICard icon="fa-rupee-sign" iconBg="rgba(59,130,246,0.15)" label="Pipeline Value (Weighted)" value={formatIndianCurrency(kpis.pipelineValue)} sub="Probability-adjusted" color="linear-gradient(90deg, #3b82f6, #6366f1)" />
              <KPICard icon="fa-handshake" iconBg="rgba(16,185,129,0.15)" label="Won This Month" value={`${kpis.wonThisMonth} Deals`} sub={formatIndianCurrency(kpis.wonThisMonthValue)} trendDir="up" color="linear-gradient(90deg, #10b981, #059669)" />
              <KPICard icon="fa-percentage" iconBg="rgba(139,92,246,0.15)" label="Win Rate" value={`${kpis.winRate}%`} sub={`${kpis.wonTotal} won / ${kpis.wonTotal + kpis.lostThisMonth} closed`} color="linear-gradient(90deg, #8b5cf6, #6366f1)" />
              <KPICard icon="fa-clock" iconBg="rgba(245,158,11,0.15)" label="Avg Deal Cycle" value={kpis.avgCycle ? `${kpis.avgCycle} Days` : 'N/A'} sub="Lead to close" color="linear-gradient(90deg, #f59e0b, #d97706)" />
              <KPICard icon="fa-fire" iconBg="rgba(239,68,68,0.15)" label="Hot Deals (Score ≥80)" value={kpis.hotDeals} sub="Immediate action needed" trendDir={kpis.hotDeals > 0 ? 'up' : 'neutral'} color="linear-gradient(90deg, #ef4444, #dc2626)" />
              <KPICard icon="fa-layer-group" iconBg="rgba(59,130,246,0.12)" label="Active Pipeline" value={kpis.activeDeals} sub={`Total: ${kpis.totalDeals} deals`} color="linear-gradient(90deg, #3b82f6, #2563eb)" />
              <KPICard icon="fa-exclamation-triangle" iconBg="rgba(249,115,22,0.15)" label="Stale Deals (>30d)" value={kpis.staleDeals} sub="Need immediate follow-up" trendDir={kpis.staleDeals > 0 ? 'down' : 'up'} color="linear-gradient(90deg, #f97316, #ea580c)" />
              <KPICard icon="fa-times-circle" iconBg="rgba(239,68,68,0.1)" label="Lost This Month" value={kpis.lostThisMonth} sub="Deals not converted" trendDir={kpis.lostThisMonth > 5 ? 'down' : 'neutral'} color="linear-gradient(90deg, #ef4444, #b91c1c)" />
            </div>
          )}
        </div>

        {/* ── SECTION 2: Pipeline Funnel + Monthly Revenue ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Pipeline Funnel & Revenue Trends</div>
          <div className="analytics-charts-grid wide-left">

            {/* Funnel */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-filter" /> Stage Conversion Funnel</div>
                <span className="chart-card-badge">Pipeline</span>
              </div>
              {loading ? <Skeleton height={220} /> : (
                <div className="funnel-container">
                  {stageData.map((s, idx) => (
                    <div key={s.stage}>
                      <div className="funnel-stage-row">
                        <div className="funnel-stage-label">{s.stage}</div>
                        <div className="funnel-bar-wrapper">
                          <div
                            className="funnel-bar-fill"
                            style={{
                              width: `${Math.max((s.count / maxStageCount) * 100, 5)}%`,
                              background: `linear-gradient(90deg, ${s.color}cc, ${s.color}88)`
                            }}
                          >
                            {s.count} deals
                          </div>
                        </div>
                        <div className="funnel-stage-stats">{formatIndianCurrency(s.value)}</div>
                      </div>
                      {idx < stageData.length - 1 && conversionRates[idx] && (
                        <div style={{ display: 'flex', justifyContent: 'center', color: '#10b981', fontSize: '0.65rem', margin: '2px 0' }}>
                          ↓ {conversionRates[idx]}% conversion
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monthly Revenue */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-chart-bar" /> Monthly Revenue (₹ Lakhs)</div>
                <span className="chart-card-badge">12 Months</span>
              </div>
              {loading ? <Skeleton height={220} /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="won" name="Won (₹L)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pipeline" name="Pipeline (₹L)" fill="#3b82f650" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Deal Volume Trend + Price Bands ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Deal Volume & Price Distribution</div>
          <div className="analytics-charts-grid">

            {/* Deal Volume Trend */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-chart-area" /> Deal Volume Trend</div>
              </div>
              {loading ? <Skeleton height={200} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey="new" name="New Deals" stroke="#3b82f6" fill="url(#newGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Price Band Pie */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-rupee-sign" /> Price Band Distribution</div>
              </div>
              {loading ? <Skeleton height={200} /> : (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={priceBandData} dataKey="count" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                        {priceBandData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-legend" style={{ flex: 1 }}>
                    {priceBandData.map((b, i) => {
                      const total = priceBandData.reduce((s, x) => s + x.count, 0);
                      return (
                        <div key={i} className="donut-legend-item">
                          <div className="donut-legend-dot" style={{ background: b.color }} />
                          <span className="donut-legend-label">{b.label}</span>
                          <span className="donut-legend-value">{b.count}</span>
                          <span className="donut-legend-pct">{total > 0 ? ((b.count / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 3.5: Market Unit Price Trend ── */}
        <div className="analytics-section" style={{ marginTop: '20px' }}>
          <MarketPriceTrendChart deals={filteredDeals} sizes={sizes} getLookupValue={getLookupValue} isDark={isDark} />
        </div>

        {/* ── SECTION 4: Intent + Deal Type + Market Gap ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Property Intelligence Matrix</div>
          <div className="analytics-charts-grid three-col">

            {/* Intent Distribution */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-bullseye" /> Deal Intent Split</div>
              </div>
              {loading ? <Skeleton height={200} /> : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={intentData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {intentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-legend">
                    {intentData.map((it, i) => {
                      const total = intentData.reduce((s, x) => s + x.value, 0);
                      return (
                        <div key={i} className="donut-legend-item">
                          <span className={`intent-dot ${it.name.toLowerCase()}`} />
                          <span className="donut-legend-label">{it.name}</span>
                          <span className="donut-legend-value">{it.value}</span>
                          <span className="donut-legend-pct">{total > 0 ? ((it.value / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Deal Type (Hot/Warm/Cold) */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-thermometer-half" /> Deal Temperature</div>
              </div>
              {loading ? <Skeleton height={200} /> : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={dealTypeData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {dealTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-legend">
                    {dealTypeData.map((dt, i) => {
                      const total = dealTypeData.reduce((s, x) => s + x.value, 0);
                      return (
                        <div key={i} className="donut-legend-item">
                          <div className="donut-legend-dot" style={{ background: dt.color }} />
                          <span className="donut-legend-label">{dt.name}</span>
                          <span className="donut-legend-value">{dt.value}</span>
                          <span className="donut-legend-pct">{total > 0 ? ((dt.value / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Market Gap */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-balance-scale" /> Market Price Intelligence</div>
              </div>
              {loading ? <Skeleton height={200} /> : (
                <>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    {[
                      { label: 'Premium Priced', count: marketGapData.premium, cls: 'premium', icon: 'fa-arrow-up' },
                      { label: 'Fair Market', count: marketGapData.fair, cls: 'fair', icon: 'fa-check' },
                      { label: 'Below Market', count: marketGapData.below, cls: 'below', icon: 'fa-arrow-down' },
                    ].map(m => (
                      <div key={m.cls} style={{ flex: 1, textAlign: 'center', padding: '0.75rem 0.5rem', background: 'var(--an-bg-subtle)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--an-text-main)' }}>{m.count}</div>
                        <span className={`market-gap-chip ${m.cls}`}><i className={`fas ${m.icon}`} /> {m.cls}</span>
                        <div style={{ fontSize: '0.65rem', color: 'var(--an-text-faint)', marginTop: 4 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--an-text-faint)', padding: '8px 10px', background: 'var(--an-bg-subtle)', borderRadius: '8px' }}>
                    <i className="fas fa-lightbulb" style={{ color: '#f59e0b', marginRight: 6 }} />
                    <strong style={{ color: 'var(--an-text-muted)' }}>Tip:</strong> Premium-priced + Stalled stage = reduce price or repackage to close faster.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Source + Agent Performance ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Source ROI & Agent Performance</div>
          <div className="analytics-charts-grid">

            {/* Source Performance */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-bullhorn" /> Source Performance</div>
                <span className="chart-card-badge">ROI Analysis</span>
              </div>
              {loading ? <Skeleton height={250} /> : sourceData.length === 0 ? (
                <div className="analytics-empty"><i className="fas fa-chart-bar" /><p>No source data available</p></div>
              ) : (
                <div>
                  {sourceData.map(s => (
                    <div key={s.source} className="source-row">
                      <div className="source-label">{s.source}</div>
                      <div className="source-bar-wrap">
                        <div
                          className="source-bar-fill"
                          style={{
                            width: `${Math.max((s.count / maxSourceCount) * 100, 8)}%`,
                            background: SOURCE_COLORS[s.source] || '#3b82f6'
                          }}
                        >
                          {s.count}
                        </div>
                      </div>
                      <div className="source-stats">
                        <div style={{ color: '#10b981', fontWeight: 700 }}>{s.winRate}% win</div>
                        <div style={{ color: 'var(--an-section-title)', fontSize: '0.65rem' }}>{s.won} won</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent Leaderboard */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-trophy" /> Agent Leaderboard</div>
                <span className="chart-card-badge">Top 10</span>
              </div>
              {loading ? <Skeleton height={250} /> : agentData.length === 0 ? (
                <div className="analytics-empty"><i className="fas fa-users" /><p>No agent data available</p></div>
              ) : (
                <div className="analytics-table-scroll">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Agent</th>
                        <th>Total</th>
                        <th>Won</th>
                        <th>Win Rate</th>
                        <th>Pipeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentData.map((a, i) => (
                        <tr key={a.name}>
                          <td>
                            <div className={`rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}`}>
                              {i + 1}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--an-text-main)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</td>
                          <td>{a.total}</td>
                          <td style={{ color: '#10b981', fontWeight: 700 }}>{a.won}</td>
                          <td>
                            <span style={{ color: parseInt(a.winRate) >= 30 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                              {a.winRate}%
                            </span>
                          </td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--an-text-muted)' }}>{formatIndianCurrency(a.pipeline)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 6: Project Leaderboard + Loss Reasons ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">Project Performance & Loss Analysis</div>
          <div className="analytics-charts-grid">

            {/* Project Leaderboard */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-building" /> Project Performance</div>
              </div>
              {loading ? <Skeleton height={250} /> : projectData.length === 0 ? (
                <div className="analytics-empty"><i className="fas fa-building" /><p>No project data</p></div>
              ) : (
                <div className="analytics-table-scroll">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Project</th>
                        <th>Deals</th>
                        <th>Won</th>
                        <th>Win %</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectData.map((p, i) => (
                        <tr key={p.name}>
                          <td><div className={`rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}`}>{i + 1}</div></td>
                          <td style={{ fontWeight: 600, color: 'var(--an-text-main)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                          <td>{p.total}</td>
                          <td style={{ color: '#10b981', fontWeight: 700 }}>{p.won}</td>
                          <td style={{ color: parseInt(p.winRate) >= 30 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{p.winRate}%</td>
                          <td style={{ fontSize: '0.7rem' }}>{formatIndianCurrency(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Loss Reasons */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-card-title"><i className="fas fa-times-circle" /> Loss Reason Analysis</div>
                <span className="chart-card-badge">{filteredDeals.filter(d => d.stage === 'Closed Lost').length} Lost</span>
              </div>
              {loading ? <Skeleton height={250} /> : lossReasonData.length === 0 ? (
                <div className="analytics-empty"><i className="fas fa-check-circle" /><p>No loss data — great work!</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={lossReasonData} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis type="number" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="reason" width={110} tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="count" name="Count" fill="#ef444480" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 7: Stale Deals Risk Table ── */}
        <div className="analytics-section">
          <div className="analytics-section-title">
            Stale Deal Risk Tracker
            {kpis.staleDeals > 0 && (
              <span style={{ marginLeft: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>
                ⚠️ {kpis.staleDeals} deals need attention
              </span>
            )}
          </div>
          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title"><i className="fas fa-hourglass-half" style={{ color: '#f97316' }} /> Deals Inactive &gt;30 Days</div>
              <span className="chart-card-badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Risk Alert</span>
            </div>
            {loading ? <Skeleton height={200} /> : kpis.staleList.length === 0 ? (
              <div className="analytics-empty">
                <i className="fas fa-check-circle" style={{ color: '#10b981', opacity: 1 }} />
                <p style={{ color: '#10b981' }}>All deals are being actively managed!</p>
              </div>
            ) : (
              <div className="analytics-table-scroll" style={{ maxHeight: 350 }}>
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Property</th>
                      <th>Owner</th>
                      <th>Stage</th>
                      <th>Stale Since</th>
                      <th>Score</th>
                      <th>Assigned</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.staleList.map(deal => {
                      const days = getStaleDays(deal);
                      const badge = getStaleBadge(days);
                      const score = scores[deal._id]?.score;
                      const scoreColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
                      const assignedName = typeof deal.assignedTo === 'object'
                        ? (deal.assignedTo?.fullName || deal.assignedTo?.name || 'Unassigned')
                        : (deal.assignedTo || 'Unassigned');
                      const ownerName = typeof deal.owner === 'object' ? deal.owner?.name : deal.ownerName;
                      const propName = typeof deal.projectName === 'object' ? deal.projectName?.name : deal.projectName;
                      return (
                        <tr key={deal._id}>
                          <td style={{ fontWeight: 700, color: '#60a5fa', fontSize: '0.72rem' }}>
                            {deal.dealNo || deal.dealId || deal._id?.slice(-6)}
                          </td>
                          <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                            {deal.unitNo && <span style={{ color: 'var(--an-text-muted)' }}>{deal.unitNo} · </span>}
                            {propName || 'N/A'}
                          </td>
                          <td style={{ fontSize: '0.72rem', color: 'var(--an-text-muted)' }}>{ownerName || 'N/A'}</td>
                          <td>
                            <span className="stage-chip-mini" style={{
                              background: (STAGE_COLORS[deal.stage] || '#64748b') + '20',
                              color: STAGE_COLORS[deal.stage] || isDark ? 'var(--text-muted)' : '#64748b',
                              border: `1px solid ${(STAGE_COLORS[deal.stage] || '#64748b')}30`
                            }}>{deal.stage || 'Open'}</span>
                          </td>
                          <td><span className={`stale-badge ${badge.cls}`}>{badge.label}</span></td>
                          <td>
                            {score != null ? (
                              <div className="score-circle" style={{ borderColor: scoreColor, color: scoreColor }}>
                                {score}
                              </div>
                            ) : <span style={{ color: 'var(--an-section-title)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: '0.72rem', color: 'var(--an-text-muted)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {assignedName}
                          </td>
                          <td>
                            {onNavigate && (
                              <button className="deal-link-btn" onClick={() => onNavigate('deal-detail', deal._id)}>
                                View →
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', color: isDark ? 'var(--text-main)' : '#334155', fontSize: '0.7rem', paddingBottom: '1rem' }}>
          <i className="fas fa-chart-line" style={{ marginRight: 6 }} />
          Bharat Properties CRM — Deal Intelligence Analytics · Data updates every 5 minutes
        </div>
      </div>
    </div>
  );
};

export default DealAnalyticsPage;
