import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, LineChart, Line
} from 'recharts';
import './LeadAnalyticsPage.css';

// ── Constants ─────────────────────────────────────────────────
const STAGE_CONFIG = [
  { key: 'incoming',    label: 'Incoming',    color: '#64748b', prob: 10 },
  { key: 'prospect',    label: 'Prospect',    color: '#3b82f6', prob: 20 },
  { key: 'opportunity', label: 'Opportunity', color: '#f59e0b', prob: 40 },
  { key: 'negotiation', label: 'Negotiation', color: '#f97316', prob: 65 },
  { key: 'closed',      label: 'Closed',      color: '#10b981', prob: 100 },
];

const TEMP_CONFIG = [
  { key: 'super-hot', label: 'SUPER HOT', min: 81, max: 100, color: '#7c3aed', bg: 'rgba(124,58,237,0.15)' },
  { key: 'hot',       label: 'HOT',       min: 61, max: 80,  color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  { key: 'warm',      label: 'WARM',      min: 31, max: 60,  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { key: 'cold',      label: 'COLD',      min: 0,  max: 30,  color: '#64748b', bg: 'rgba(100,116,139,0.15)'},
];

const SOURCE_COLORS = [
  '#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444','#f97316','#6366f1','#84cc16'
];

// ── Helpers ──────────────────────────────────────────────────
const daysAgo = (date) =>
  Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));

const getStage = (lead) => {
  const s = lead.stage;
  if (!s) return 'incoming';
  if (typeof s === 'object') return (s.lookup_value || s.name || '').toLowerCase();
  return String(s).toLowerCase();
};

const getStatus = (lead) => {
  const s = lead.status || lead.statusLabel;
  if (!s) return 'Unknown';
  if (typeof s === 'object') return s.lookup_value || s.name || 'Unknown';
  return s;
};

const getSource = (lead) => {
  const s = lead.source || lead.sourceLabel;
  if (!s) return 'Direct';
  if (typeof s === 'object') return s.lookup_value || s.name || 'Direct';
  return s;
};

const getAssigned = (lead) => {
  const a = lead.assignment?.assignedTo || lead.owner;
  if (!a) return 'Unassigned';
  if (typeof a === 'object') return a.fullName || a.name || 'Unassigned';
  return a;
};

const getIntent = (lead) => {
  const r = lead.requirement || lead.requirementLabel;
  if (!r) return 'Unknown';
  if (typeof r === 'object') return r.lookup_value || r.name || 'Unknown';
  const s = String(r).toLowerCase();
  if (s.includes('rent')) return 'Rent';
  if (s.includes('buy') || s.includes('sell') || s.includes('purchase')) return 'Buy';
  return r;
};

const getCategory = (lead) => {
  const c = lead.propertyType || lead.reqDisplay?.category || lead.category;
  if (!c) return null;
  if (typeof c === 'object') return c.lookup_value || c.name || null;
  return c;
};

const getScore = (lead) => {
  const s = parseInt(lead.leadScore ?? lead.score ?? 0);
  return isNaN(s) ? 0 : Math.min(100, Math.max(0, s));
};

const getTemp = (score) => {
  if (score >= 81) return TEMP_CONFIG[0];
  if (score >= 61) return TEMP_CONFIG[1];
  if (score >= 31) return TEMP_CONFIG[2];
  return TEMP_CONFIG[3];
};

const getStageConfig = (stageKey) => {
  const k = String(stageKey).toLowerCase();
  return STAGE_CONFIG.find(s =>
    k.includes(s.key) || s.key.includes(k)
  ) || STAGE_CONFIG[0];
};

// ── Custom Tooltip ────────────────────────────────────────────
const Tip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: isDark ? '#12101e' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.1)'}`,
      boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.12)',
      borderRadius: 10, padding: '10px 14px', fontSize: '0.75rem',
      color: isDark ? '#e2e8f0' : '#1e293b'
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 4, color: isDark ? '#94a3b8' : '#64748b' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || (isDark ? '#e2e8f0' : '#1e293b'), fontWeight: 600 }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

const Skel = ({ h = 120 }) => <div className="la-skeleton" style={{ height: h }} />;

// ── KPI Card ──────────────────────────────────────────────────
const KPI = ({ icon, iconBg, iconColor, label, value, sub, trend, trendDir, color }) => (
  <div className="la-kpi-card" style={{ '--la-kpi-color': color }}>
    <div className="la-kpi-header">
      <div className="la-kpi-icon" style={{ background: iconBg, color: iconColor }}>
        <i className={`fas ${icon}`} />
      </div>
      {trend != null && (
        <span className={`la-kpi-trend ${trendDir || 'neutral'}`}>
          <i className={`fas fa-arrow-${trendDir === 'up' ? 'up' : trendDir === 'down' ? 'down' : 'right'}`} />
          {trend}
        </span>
      )}
    </div>
    <div className="la-kpi-value">{value}</div>
    <div className="la-kpi-label">{label}</div>
    {sub && <div className="la-kpi-sub">{sub}</div>}
  </div>
);

// ── MAIN PAGE ────────────────────────────────────────────────
const LeadAnalyticsPage = ({ onNavigate }) => {
  const { isDark } = useTheme();
  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const TipWithTheme = (props) => <Tip {...props} isDark={isDark} />;

  const [leads, setLeads]       = useState([]);
  const [scores, setScores]     = useState({});
  const [loading, setLoading]   = useState(true);
  const [dateRange, setDateRange] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, scoresRes] = await Promise.allSettled([
        api.get('leads?limit=2000&sortBy=createdAt&sortOrder=-1'),
        api.get('stage-engine/leads/scores')
      ]);

      if (leadsRes.status === 'fulfilled') {
        const d = leadsRes.value?.data;
        setLeads(d?.records || d?.data || d?.leads || []);
      }

      if (scoresRes.status === 'fulfilled') {
        const d = scoresRes.value?.data;
        const scoresArr = Array.isArray(d) ? d : (d?.data || d?.scores || []);
        const scoreMap = {};
        scoresArr.forEach(s => {
          if (s.leadId || s._id) scoreMap[s.leadId || s._id] = s;
        });
        setScores(scoreMap);
      }
    } catch (e) {
      console.error('Lead analytics fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // Merge scores
  const enriched = useMemo(() =>
    leads.map(l => ({
      ...l,
      _score: getScore({ ...l, ...(scores[l._id] || {}) }),
    })), [leads, scores]);

  // Date filter
  const filtered = useMemo(() => {
    if (dateRange === 'all') return enriched;
    const days = parseInt(dateRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return enriched.filter(l => new Date(l.createdAt) >= cutoff);
  }, [enriched, dateRange]);

  // ── KPIs ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filtered.length;
    const hot = filtered.filter(l => l._score >= 61);
    const superHot = filtered.filter(l => l._score >= 81);
    const warm = filtered.filter(l => l._score >= 31 && l._score < 61);
    const cold = filtered.filter(l => l._score < 31);

    const avgScore = total > 0
      ? Math.round(filtered.reduce((s, l) => s + l._score, 0) / total)
      : 0;

    const buyLeads = filtered.filter(l => {
      const i = getIntent(l);
      return i === 'Buy' || i.toLowerCase().includes('buy');
    });
    const rentLeads = filtered.filter(l => {
      const i = getIntent(l);
      return i === 'Rent' || i.toLowerCase().includes('rent');
    });

    const unassigned = filtered.filter(l => !l.assignment?.assignedTo && !l.owner);

    // Dormant = active + no update in 14+ days
    const dormant = filtered.filter(l => daysAgo(l.updatedAt) >= 14);

    // AI high probability
    const aiHigh = filtered.filter(l =>
      (l.aiClosingProbability || l.ai_closing_probability || 0) >= 75
    );

    // Stage counts
    const stageCounts = {};
    STAGE_CONFIG.forEach(s => { stageCounts[s.key] = 0; });
    filtered.forEach(l => {
      const sk = getStage(l);
      const cfg = getStageConfig(sk);
      stageCounts[cfg.key] = (stageCounts[cfg.key] || 0) + 1;
    });

    // Avg days on pipeline
    const avgDays = total > 0
      ? Math.round(filtered.reduce((s, l) => s + daysAgo(l.createdAt), 0) / total)
      : 0;

    return {
      total, hot: hot.length, superHot: superHot.length,
      warm: warm.length, cold: cold.length,
      avgScore, buyLeads: buyLeads.length, rentLeads: rentLeads.length,
      unassigned: unassigned.length, dormant: dormant.length,
      aiHigh: aiHigh.length, stageCounts, avgDays,
      hotRate: total > 0 ? ((hot.length / total) * 100).toFixed(1) : 0,
    };
  }, [filtered]);

  // ── Stage Funnel ─────────────────────────────────────────────
  const stageFunnelData = useMemo(() => {
    return STAGE_CONFIG.map(cfg => ({
      ...cfg,
      count: kpis.stageCounts[cfg.key] || 0,
    }));
  }, [kpis.stageCounts]);
  const maxStageCount = Math.max(...stageFunnelData.map(s => s.count), 1);

  // ── Temperature Distribution ──────────────────────────────────
  const tempData = useMemo(() => [
    { name: 'SUPER HOT', value: kpis.superHot, color: '#7c3aed' },
    { name: 'HOT',       value: kpis.hot - kpis.superHot, color: '#ef4444' },
    { name: 'WARM',      value: kpis.warm, color: '#f59e0b' },
    { name: 'COLD',      value: kpis.cold, color: '#64748b' },
  ].filter(x => x.value > 0), [kpis]);

  // ── Source Analysis ───────────────────────────────────────────
  const sourceData = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const src = getSource(l);
      if (!map[src]) map[src] = { name: src, count: 0, totalScore: 0, hot: 0 };
      map[src].count++;
      map[src].totalScore += l._score;
      if (l._score >= 61) map[src].hot++;
    });
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((s, i) => ({
        ...s,
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
        avgScore: s.count > 0 ? Math.round(s.totalScore / s.count) : 0,
        hotRate: s.count > 0 ? ((s.hot / s.count) * 100).toFixed(0) : 0,
      }));
  }, [filtered]);
  const maxSourceCount = Math.max(...sourceData.map(s => s.count), 1);

  // ── Monthly Trend ─────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, total: 0, hot: 0, converted: 0 };
    }
    filtered.forEach(l => {
      const d = new Date(l.createdAt);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) {
        months[key].total++;
        if (l._score >= 61) months[key].hot++;
        if (l.isConverted) months[key].converted++;
      }
    });
    return Object.values(months);
  }, [filtered]);

  // ── Score Histogram ───────────────────────────────────────────
  const scoreHistogram = useMemo(() => {
    const bands = [
      { label: '0–10', min: 0, max: 10 }, { label: '11–20', min: 10, max: 20 },
      { label: '21–30', min: 20, max: 30 }, { label: '31–40', min: 30, max: 40 },
      { label: '41–50', min: 40, max: 50 }, { label: '51–60', min: 50, max: 60 },
      { label: '61–70', min: 60, max: 70 }, { label: '71–80', min: 70, max: 80 },
      { label: '81–90', min: 80, max: 90 }, { label: '91–100', min: 90, max: 101 },
    ];
    return bands.map(b => ({
      label: b.label,
      count: filtered.filter(l => l._score >= b.min && l._score < b.max).length,
      color: b.min >= 80 ? '#7c3aed' : b.min >= 60 ? '#ef4444' : b.min >= 30 ? '#f59e0b' : '#64748b',
    }));
  }, [filtered]);

  // ── Property Demand ───────────────────────────────────────────
  const categoryData = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const cat = getCategory(l) || 'Unknown';
      map[cat] = (map[cat] || 0) + 1;
    });
    const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444'];
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [filtered]);

  // ── Intent Split ──────────────────────────────────────────────
  const intentData = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const intent = getIntent(l);
      map[intent] = (map[intent] || 0) + 1;
    });
    const colors = { 'Buy': '#8b5cf6', 'Rent': '#f59e0b', 'Unknown': '#64748b' };
    return Object.entries(map).map(([name, value]) => ({
      name, value, color: colors[name] || '#94a3b8'
    }));
  }, [filtered]);

  // ── Agent Leaderboard ─────────────────────────────────────────
  const agentData = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const name = getAssigned(l);
      if (!map[name]) map[name] = { name, total: 0, hot: 0, totalScore: 0, converted: 0 };
      map[name].total++;
      if (l._score >= 61) map[name].hot++;
      map[name].totalScore += l._score;
      if (l.isConverted) map[name].converted++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
      .map(a => ({
        ...a,
        avgScore: a.total > 0 ? Math.round(a.totalScore / a.total) : 0,
        hotRate: a.total > 0 ? ((a.hot / a.total) * 100).toFixed(0) : 0,
      }));
  }, [filtered]);

  // ── Status Distribution ────────────────────────────────────────
  const statusData = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const s = getStatus(l);
      map[s] = (map[s] || 0) + 1;
    });
    const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444','#f97316'];
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: colors[i % colors.length] }));
  }, [filtered]);
  const maxStatusCount = Math.max(...statusData.map(s => s.count), 1);

  // ── Dormant / Stale Leads ─────────────────────────────────────
  const dormantLeads = useMemo(() =>
    filtered
      .filter(l => daysAgo(l.updatedAt) >= 14)
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
      .slice(0, 20),
    [filtered]
  );

  const getDormantBadge = (days) => {
    if (days >= 30) return { cls: 'dormant', label: `${days}d Dormant` };
    if (days >= 21) return { cls: 'stale',   label: `${days}d Stale` };
    return              { cls: 'aging',   label: `${days}d Aging` };
  };

  // ── Budget Bands ──────────────────────────────────────────────
  const budgetData = useMemo(() => {
    const bands = [
      { label: 'Under 25L',    min: 0,         max: 2500000   },
      { label: '25L–50L',      min: 2500000,   max: 5000000   },
      { label: '50L–1Cr',      min: 5000000,   max: 10000000  },
      { label: '1Cr–2Cr',      min: 10000000,  max: 20000000  },
      { label: '2Cr–5Cr',      min: 20000000,  max: 50000000  },
      { label: 'Above 5Cr',    min: 50000000,  max: Infinity  },
    ];
    const colors = ['#64748b','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#7c3aed'];
    return bands.map((b, i) => ({
      ...b, color: colors[i],
      count: filtered.filter(l => {
        const bMin = l.budgetMin || l.budget?.min || 0;
        const bMax = l.budgetMax || l.budget?.max || bMin;
        const mid = bMax > 0 ? (bMin + bMax) / 2 : bMin;
        return mid >= b.min && mid < b.max;
      }).length,
    })).filter(b => b.count > 0);
  }, [filtered]);

  return (
    <div className="lead-analytics-page">
      <div className="la-scroll">

        {/* HEADER */}
        <div className="la-header">
          <div className="la-header-left">
            <div className="la-header-icon"><i className="fas fa-users" /></div>
            <div className="la-header-title">
              <h1>Lead Intelligence Analytics</h1>
              <p>Enterprise pipeline insights — scores, source ROI, agent performance & dormancy alerts</p>
            </div>
          </div>
          <div className="la-header-right">
            <div className="la-date-filters">
              {[{l:'7D',v:'7'},{l:'30D',v:'30'},{l:'90D',v:'90'},{l:'All Time',v:'all'}].map(r => (
                <button key={r.v} className={`la-date-btn ${dateRange===r.v?'active':''}`} onClick={() => setDateRange(r.v)}>{r.l}</button>
              ))}
            </div>
            <button className="la-ctrl-btn" onClick={() => setRefreshKey(k => k + 1)}>
              <i className="fas fa-sync-alt" /> Refresh
            </button>
            {onNavigate && (
              <button className="la-ctrl-btn" onClick={() => onNavigate('leads')}>
                <i className="fas fa-arrow-left" /> Back
              </button>
            )}
          </div>
        </div>

        {/* ── SECTION 1: KPI Cards ── */}
        <div className="la-section">
          <div className="la-section-title">Pipeline Key Performance Indicators</div>
          {loading ? (
            <div className="la-kpi-grid">{[...Array(8)].map((_,i) => <Skel key={i} h={110} />)}</div>
          ) : (
            <div className="la-kpi-grid">
              <KPI icon="fa-users" iconBg="rgba(139,92,246,0.15)" iconColor="#8b5cf6" label="Total Leads" value={kpis.total} sub={`Avg ${kpis.avgDays} days on pipeline`} color="linear-gradient(90deg,#8b5cf6,#6d28d9)" />
              <KPI icon="fa-fire" iconBg="rgba(239,68,68,0.15)" iconColor="#ef4444" label="Hot Leads (Score ≥61)" value={kpis.hot} sub={`${kpis.hotRate}% of pipeline`} trendDir="up" trend={`${kpis.superHot} Super Hot`} color="linear-gradient(90deg,#ef4444,#dc2626)" />
              <KPI icon="fa-star" iconBg="rgba(139,92,246,0.15)" iconColor="#a78bfa" label="Avg Lead Score" value={`${kpis.avgScore}/100`} sub="Backend ML score" color="linear-gradient(90deg,#8b5cf6,#4f46e5)" />
              <KPI icon="fa-robot" iconBg="rgba(124,58,237,0.15)" iconColor="#7c3aed" label="AI High Probability" value={kpis.aiHigh} sub="Closing prob ≥75%" trendDir="up" color="linear-gradient(90deg,#7c3aed,#5b21b6)" />
              <KPI icon="fa-home" iconBg="rgba(139,92,246,0.15)" iconColor="#8b5cf6" label="Buy Intent" value={kpis.buyLeads} sub={`${kpis.rentLeads} Rent intent`} color="linear-gradient(90deg,#8b5cf6,#6d28d9)" />
              <KPI icon="fa-user-slash" iconBg="rgba(239,68,68,0.15)" iconColor="#ef4444" label="Unassigned Leads" value={kpis.unassigned} sub="No agent assigned" trendDir={kpis.unassigned > 0 ? 'down' : 'neutral'} color="linear-gradient(90deg,#ef4444,#dc2626)" />
              <KPI icon="fa-moon" iconBg="rgba(245,158,11,0.15)" iconColor="#f59e0b" label="Dormant (>14 days)" value={kpis.dormant} sub="No activity" trendDir={kpis.dormant > 0 ? 'down' : 'neutral'} color="linear-gradient(90deg,#f59e0b,#d97706)" />
              <KPI icon="fa-snowflake" iconBg="rgba(100,116,139,0.15)" iconColor="#64748b" label="Cold Leads" value={kpis.cold} sub="Score < 31" trendDir={kpis.cold > 0 ? 'down' : 'neutral'} color="linear-gradient(90deg,#64748b,#475569)" />
            </div>
          )}
        </div>

        {/* ── SECTION 2: Stage Funnel + Monthly Trend ── */}
        <div className="la-section">
          <div className="la-section-title">Pipeline Stage Funnel & Lead Volume Trend</div>
          <div className="la-charts-grid wide-left">

            {/* Stage Funnel */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-filter" /> Stage-wise Pipeline</div>
                <span className="la-chart-badge">{STAGE_CONFIG.length} Stages</span>
              </div>
              {loading ? <Skel h={240} /> : (
                <div>
                  {stageFunnelData.map((s, i) => {
                    const nextCount = stageFunnelData[i + 1]?.count;
                    const conv = s.count > 0 && nextCount != null
                      ? ((nextCount / s.count) * 100).toFixed(0) + '%'
                      : null;
                    return (
                      <div key={s.key}>
                        <div className="la-funnel-row">
                          <div className="la-funnel-label">{s.label}</div>
                          <div className="la-funnel-bar-wrap">
                            <div className="la-funnel-bar-fill" style={{
                              width: `${Math.max((s.count / maxStageCount) * 100, 5)}%`,
                              background: s.color
                            }}>{s.count}</div>
                          </div>
                          <div className="la-funnel-stat">
                            {kpis.total > 0 ? ((s.count / kpis.total) * 100).toFixed(1) : 0}%
                          </div>
                        </div>
                        {conv && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, marginRight: 2 }}>
                            <span className="la-conversion-pill">↓ {conv} conversion</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Monthly Trend */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-chart-area" /> Monthly Lead Inflow</div>
              </div>
              {loading ? <Skel h={240} /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={monthlyTrend}>
                    <defs>
                      <linearGradient id="laGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TipWithTheme />} />
                    <Area type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" fill="url(#laGrad)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="hot" name="Hot (≥61)" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Temperature + Score Histogram + Intent ── */}
        <div className="la-section">
          <div className="la-section-title">Lead Quality & Scoring Intelligence</div>
          <div className="la-charts-grid three">

            {/* Temperature Donut */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-thermometer-half" /> Temperature Distribution</div>
              </div>
              {loading ? <Skel h={200} /> : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={tempData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {tempData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<TipWithTheme />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="la-donut-legend">
                    {tempData.map((t, i) => {
                      const total = tempData.reduce((s, x) => s + x.value, 0);
                      return (
                        <div key={i} className="la-donut-item">
                          <div className="la-donut-dot" style={{ background: t.color }} />
                          <span className="la-donut-label">{t.name}</span>
                          <span className="la-donut-value">{t.value}</span>
                          <span className="la-donut-pct">{total > 0 ? ((t.value / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Score Histogram */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-chart-bar" /> Score Histogram</div>
                <span className="la-chart-badge">Avg {kpis.avgScore}</span>
              </div>
              {loading ? <Skel h={200} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={scoreHistogram} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TipWithTheme />} />
                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                      {scoreHistogram.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Buy vs Rent Intent */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-exchange-alt" /> Buy vs Rent Intent</div>
              </div>
              {loading ? <Skel h={200} /> : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={intentData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {intentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<TipWithTheme />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="la-donut-legend">
                    {intentData.map((t, i) => {
                      const total = intentData.reduce((s, x) => s + x.value, 0);
                      return (
                        <div key={i} className="la-donut-item">
                          <div className="la-donut-dot" style={{ background: t.color }} />
                          <span className="la-donut-label">{t.name}</span>
                          <span className="la-donut-value">{t.value}</span>
                          <span className="la-donut-pct">{total > 0 ? ((t.value / total) * 100).toFixed(0) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Source ROI + Status Distribution ── */}
        <div className="la-section">
          <div className="la-section-title">Source Performance & Status Distribution</div>
          <div className="la-charts-grid wide-right">

            {/* Status bars */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-layer-group" /> Status Distribution</div>
                <span className="la-chart-badge">{statusData.length} Statuses</span>
              </div>
              {loading ? <Skel h={220} /> : (
                <div>
                  {statusData.map(s => (
                    <div key={s.name} className="la-bar-row">
                      <div className="la-bar-label">{s.name}</div>
                      <div className="la-bar-wrap">
                        <div className="la-bar-fill" style={{
                          width: `${Math.max((s.count / maxStatusCount) * 100, 6)}%`,
                          background: s.color
                        }}>{s.count}</div>
                      </div>
                      <div className="la-bar-stat">
                        {kpis.total > 0 ? ((s.count / kpis.total) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Source Performance Chart */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-satellite-dish" /> Source ROI & Volume</div>
                <span className="la-chart-badge">Top 10 Sources</span>
              </div>
              {loading ? <Skel h={220} /> : sourceData.length === 0 ? (
                <div className="la-empty"><i className="fas fa-satellite-dish" /><p>No source data</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sourceData} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fill: tickColor, fontSize: 9 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TipWithTheme />} />
                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                      {sourceData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Source Quality Table + Category Demand ── */}
        <div className="la-section">
          <div className="la-section-title">Source Quality Analysis & Property Demand</div>
          <div className="la-charts-grid">

            {/* Source Quality Table */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-trophy" /> Source Quality Leaderboard</div>
                <span className="la-chart-badge">Avg Score & Hot %</span>
              </div>
              {loading ? <Skel h={250} /> : sourceData.length === 0 ? (
                <div className="la-empty"><i className="fas fa-satellite-dish" /><p>No source data</p></div>
              ) : (
                <div className="la-table-scroll">
                  <table className="la-table">
                    <thead><tr>
                      <th>#</th><th>Source</th><th>Leads</th><th>Avg Score</th><th>Hot %</th>
                    </tr></thead>
                    <tbody>
                      {sourceData.map((s, i) => (
                        <tr key={s.name}>
                          <td><div className={`la-rank-badge ${i===0?'r1':i===1?'r2':i===2?'r3':'rn'}`}>{i+1}</div></td>
                          <td style={{ fontWeight: 600, color: s.color }}>{s.name}</td>
                          <td>{s.count}</td>
                          <td>
                            <span style={{ color: s.avgScore >= 61 ? '#ef4444' : s.avgScore >= 31 ? '#f59e0b' : '#64748b', fontWeight: 700 }}>
                              {s.avgScore}
                            </span>
                          </td>
                          <td style={{ color: parseInt(s.hotRate) >= 30 ? '#ef4444' : '#64748b', fontWeight: 700 }}>
                            {s.hotRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Category Demand */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-th-large" /> Property Demand Matrix</div>
              </div>
              {loading ? <Skel h={250} /> : categoryData.length === 0 ? (
                <div className="la-empty"><i className="fas fa-home" /><p>No category data available</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={categoryData} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis type="number" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TipWithTheme />} />
                    <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]}>
                      {categoryData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 6: Budget Distribution + Agent Leaderboard ── */}
        <div className="la-section">
          <div className="la-section-title">Budget Intelligence & Agent Performance</div>
          <div className="la-charts-grid">

            {/* Budget Distribution */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-rupee-sign" /> Budget Range Distribution</div>
              </div>
              {loading ? <Skel h={240} /> : budgetData.length === 0 ? (
                <div className="la-empty"><i className="fas fa-rupee-sign" /><p>No budget data filled in leads</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={budgetData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TipWithTheme />} />
                    <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
                      {budgetData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Agent Leaderboard */}
            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-user-tie" /> Agent Leaderboard</div>
                <span className="la-chart-badge">Top 10</span>
              </div>
              {loading ? <Skel h={240} /> : agentData.length === 0 ? (
                <div className="la-empty"><i className="fas fa-users" /><p>No agent data</p></div>
              ) : (
                <div className="la-table-scroll">
                  <table className="la-table">
                    <thead><tr>
                      <th>#</th><th>Agent</th><th>Leads</th><th>Hot</th><th>Avg Score</th><th>Hot %</th>
                    </tr></thead>
                    <tbody>
                      {agentData.map((a, i) => (
                        <tr key={a.name}>
                          <td><div className={`la-rank-badge ${i===0?'r1':i===1?'r2':i===2?'r3':'rn'}`}>{i+1}</div></td>
                          <td style={{ fontWeight: 600, color: 'var(--an-text-main)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</td>
                          <td>{a.total}</td>
                          <td style={{ color: '#ef4444', fontWeight: 700 }}>{a.hot}</td>
                          <td>
                            <span style={{ color: a.avgScore >= 61 ? '#ef4444' : a.avgScore >= 31 ? '#f59e0b' : '#64748b', fontWeight: 700 }}>
                              {a.avgScore}
                            </span>
                          </td>
                          <td style={{ color: parseInt(a.hotRate) >= 30 ? '#ef4444' : '#64748b', fontWeight: 700 }}>
                            {a.hotRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 7: Dormant Lead Risk Tracker ── */}
        <div className="la-section">
          <div className="la-section-title">
            Dormant Lead Risk Tracker
            {kpis.dormant > 0 && (
              <span style={{ marginLeft: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>
                ⚠️ {kpis.dormant} leads need re-engagement
              </span>
            )}
          </div>
          <div className="la-chart-card">
            <div className="la-chart-header">
              <div className="la-chart-title">
                <i className="fas fa-moon" style={{ color: '#f59e0b' }} /> Active Leads — No Update in 14+ Days
              </div>
              <span className="la-chart-badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Re-engagement Alert</span>
            </div>
            {loading ? <Skel h={200} /> : dormantLeads.length === 0 ? (
              <div className="la-empty">
                <i className="fas fa-check-circle" style={{ color: '#10b981', opacity: 1, display: 'block', fontSize: '2rem', marginBottom: '0.5rem' }} />
                <p style={{ color: '#10b981' }}>All leads are being regularly followed up! Great work 🎉</p>
              </div>
            ) : (
              <div className="la-table-scroll" style={{ maxHeight: 360 }}>
                <table className="la-table">
                  <thead><tr>
                    <th>Name</th><th>Score</th><th>Stage</th><th>Status</th>
                    <th>Intent</th><th>Source</th><th>Days Inactive</th><th>Assigned To</th>
                  </tr></thead>
                  <tbody>
                    {dormantLeads.map(lead => {
                      const days = daysAgo(lead.updatedAt);
                      const badge = getDormantBadge(days);
                      const score = lead._score;
                      const temp = getTemp(score);
                      const stageKey = getStage(lead);
                      const stageCfg = getStageConfig(stageKey);
                      return (
                        <tr key={lead._id}>
                          <td style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.75rem' }}>
                            {lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || '—'}
                          </td>
                          <td>
                            <div className="la-score-ring" style={{
                              borderColor: temp.color, color: temp.color,
                              background: temp.bg
                            }}>{score}</div>
                          </td>
                          <td>
                            <span className="la-stage-chip" style={{
                              background: stageCfg.color + '20', color: stageCfg.color,
                              border: `1px solid ${stageCfg.color}30`
                            }}>{stageCfg.label}</span>
                          </td>
                          <td style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{getStatus(lead)}</td>
                          <td style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 600 }}>{getIntent(lead)}</td>
                          <td style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{getSource(lead)}</td>
                          <td><span className={`la-age-badge ${badge.cls}`}>{badge.label}</span></td>
                          <td style={{ fontSize: '0.72rem', color: '#94a3b8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getAssigned(lead)}
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

        {/* ── SECTION 8: Health Summary ── */}
        <div className="la-section">
          <div className="la-section-title">Pipeline Health Summary</div>
          <div className="la-charts-grid three">

            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-heartbeat" /> Overall Health</div>
              </div>
              {[
                { label: 'Hot + Super Hot Leads',   value: kpis.hot,        cls: kpis.hot > 0 ? 'purple' : 'neutral' },
                { label: 'Avg Pipeline Score',       value: `${kpis.avgScore}/100`, cls: kpis.avgScore >= 50 ? 'pos' : kpis.avgScore >= 30 ? 'warn' : 'neg' },
                { label: 'Unassigned Leads',         value: kpis.unassigned, cls: kpis.unassigned === 0 ? 'pos' : kpis.unassigned < 5 ? 'warn' : 'neg' },
                { label: 'AI High Prob (≥75%)',      value: kpis.aiHigh,     cls: 'purple' },
                { label: 'Dormant (>14 days)',       value: kpis.dormant,    cls: kpis.dormant === 0 ? 'pos' : kpis.dormant < 10 ? 'warn' : 'neg' },
              ].map((s, i) => (
                <div key={i} className="la-mini-stat">
                  <span className="la-mini-label">{s.label}</span>
                  <span className={`la-mini-value ${s.cls}`}>{s.value}</span>
                </div>
              ))}
            </div>

            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-thermometer-full" /> Temperature Bands</div>
              </div>
              {[
                { label: '🔮 SUPER HOT (81-100)', value: kpis.superHot, cls: 'purple' },
                { label: '🔥 HOT (61-80)',         value: kpis.hot - kpis.superHot, cls: 'neg' },
                { label: '☀️ WARM (31-60)',        value: kpis.warm, cls: 'warn' },
                { label: '❄️ COLD (0-30)',         value: kpis.cold, cls: 'neutral' },
              ].map((s, i) => (
                <div key={i} className="la-mini-stat">
                  <span className="la-mini-label">{s.label}</span>
                  <span className={`la-mini-value ${s.cls}`}>{s.value}</span>
                </div>
              ))}
            </div>

            <div className="la-chart-card">
              <div className="la-chart-header">
                <div className="la-chart-title"><i className="fas fa-filter" /> Stage Breakdown</div>
              </div>
              {stageFunnelData.map((s, i) => (
                <div key={i} className="la-mini-stat">
                  <span className="la-mini-label" style={{ color: s.color }}>{s.label}</span>
                  <span className="la-mini-value">
                    {s.count}
                    <span style={{ color: '#475569', fontWeight: 400, fontSize: '0.7rem', marginLeft: 4 }}>
                      ({kpis.total > 0 ? ((s.count / kpis.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', color: '#1a1230', fontSize: '0.7rem', paddingBottom: '1rem' }}>
          <i className="fas fa-users" style={{ marginRight: 6 }} />
          Bharat Properties CRM — Lead Intelligence Analytics · Real ML scores from your pipeline
        </div>

      </div>
    </div>
  );
};

export default LeadAnalyticsPage;
