import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, LineChart, Line
} from 'recharts';
import './InventoryAnalyticsPage.css';

// ── Constants ────────────────────────────────────────────────
const STATUS_COLORS = {
  'Active':              '#10b981',
  'Available':           '#10b981',
  'Interested / Hot':    '#ef4444',
  'Interested / Warm':   '#f59e0b',
  'Interested':          '#f59e0b',
  'Blocked':             '#8b5cf6',
  'Booked':              '#6366f1',
  'Sold Out':            '#64748b',
  'Hold':                '#f97316',
  'Rented Out':          '#3b82f6',
  'Inactive':            '#475569',
  'Request Call Back':   '#ec4899',
  'Market Feedback':     '#14b8a6',
  'General Inquiry':     '#94a3b8',
};

const ACTIVE_STATUSES = [
  'Available','Active','Interested / Warm','Interested / Hot',
  'Request Call Back','Busy / Driving','Market Feedback',
  'General Inquiry','Blocked','Booked','Interested'
];

const INTENT_COLORS  = { 'Sell': '#ec4899', 'Rent': '#f59e0b', 'Lease': '#3b82f6' };

const AGE_BANDS = [
  { label: '0–30 days',   min: 0,   max: 30,  color: '#10b981', cls: 'fresh'    },
  { label: '31–60 days',  min: 30,  max: 60,  color: '#3b82f6', cls: 'active'   },
  { label: '61–90 days',  min: 60,  max: 90,  color: '#eab308', cls: 'stale'    },
  { label: '91–180 days', min: 90,  max: 180, color: '#f97316', cls: 'old'      },
  { label: '180+ days',   min: 180, max: Infinity, color: '#ef4444', cls: 'very-old' },
];

// ── Helpers ───────────────────────────────────────────────────
const daysAgo = (date) =>
  Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));

const getIntents = (item) => {
  const raw = item.intent;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim());
  return [];
};

const resolveStatus = (item) => {
  const s = item.status;
  if (!s) return 'Unknown';
  if (typeof s === 'object') return s.lookup_value || s.name || 'Unknown';
  return s;
};

const resolveProject = (item) => {
  if (!item.projectName) return null;
  if (typeof item.projectName === 'object') return item.projectName.name || null;
  return item.projectName;
};

const resolveCity = (item) => {
  return item.address?.city || item.address?.locality || item.address?.location || null;
};

const resolveAssigned = (item) => {
  if (!item.assignedTo) return 'Unassigned';
  if (typeof item.assignedTo === 'object')
    return item.assignedTo.fullName || item.assignedTo.name || 'Unassigned';
  return item.assignedTo;
};

// ── Custom Tooltip ────────────────────────────────────────────
const Tip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: isDark ? '#132018' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.1)'}`,
      boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
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

const Skeleton = ({ height = 120 }) => (
  <div className="inv-skeleton" style={{ height, borderRadius: 16 }} />
);

// ── KPI Card ──────────────────────────────────────────────────
const KPI = ({ icon, iconBg, iconColor, label, value, sub, trend, trendDir, color }) => (
  <div className="inv-kpi-card" style={{ '--inv-kpi-color': color }}>
    <div className="inv-kpi-header">
      <div className="inv-kpi-icon" style={{ background: iconBg, color: iconColor }}>
        <i className={`fas ${icon}`} />
      </div>
      {trend != null && (
        <span className={`inv-kpi-trend ${trendDir || 'neutral'}`}>
          <i className={`fas fa-arrow-${trendDir === 'up' ? 'up' : trendDir === 'down' ? 'down' : 'right'}`} />
          {trend}
        </span>
      )}
    </div>
    <div className="inv-kpi-value">{value}</div>
    <div className="inv-kpi-label">{label}</div>
    {sub && <div className="inv-kpi-sub">{sub}</div>}
  </div>
);

// ── Main Page ────────────────────────────────────────────────
const InventoryAnalyticsPage = ({ onNavigate }) => {
  const { isDark } = useTheme();
  const tickColor  = isDark ? '#64748b' : '#94a3b8';
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const TipT = (props) => <Tip {...props} isDark={isDark} />;

  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dateRange, setDateRange] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('inventory?limit=2000&sortBy=createdAt&sortOrder=-1');
      if (res.data?.success || res.data?.records) {
        setInventory(res.data.records || res.data.data || []);
      }
    } catch (e) {
      console.error('Inventory analytics fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // ── Date filter ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (dateRange === 'all') return inventory;
    const days = parseInt(dateRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return inventory.filter(i => new Date(i.createdAt) >= cutoff);
  }, [inventory, dateRange]);

  // ── KPI Computations ──────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter(i => ACTIVE_STATUSES.includes(resolveStatus(i)));
    const inactive = filtered.filter(i => !ACTIVE_STATUSES.includes(resolveStatus(i)));
    const soldOut = filtered.filter(i => resolveStatus(i) === 'Sold Out');
    const rented  = filtered.filter(i => resolveStatus(i) === 'Rented Out');
    const booked  = filtered.filter(i => resolveStatus(i) === 'Booked');
    const hold    = filtered.filter(i => resolveStatus(i) === 'Hold');

    const forSell  = filtered.filter(i => getIntents(i).includes('Sell'));
    const forRent  = filtered.filter(i => getIntents(i).includes('Rent'));
    const forLease = filtered.filter(i => getIntents(i).includes('Lease'));

    // Stale = active + no update in 60+ days
    const stale = filtered.filter(i =>
      ACTIVE_STATUSES.includes(resolveStatus(i)) && daysAgo(i.updatedAt) >= 60
    );

    // Avg days on market
    const avgDays = total > 0
      ? Math.round(filtered.reduce((s, i) => s + daysAgo(i.createdAt), 0) / total)
      : 0;

    // With geo coords
    const withGeo = filtered.filter(i => i.lat && i.lng).length;

    // With feedback
    const withFeedback = filtered.filter(i => i.history?.length > 0).length;

    return {
      total, active: active.length, inactive: inactive.length,
      soldOut: soldOut.length, rented: rented.length,
      booked: booked.length, hold: hold.length,
      forSell: forSell.length, forRent: forRent.length, forLease: forLease.length,
      stale: stale.length, staleList: stale.sort((a,b) => new Date(a.updatedAt) - new Date(b.updatedAt)).slice(0, 20),
      avgDays, withGeo, withFeedback,
      activeRate: total > 0 ? ((active.length / total) * 100).toFixed(1) : 0
    };
  }, [filtered]);

  // ── Status Distribution ───────────────────────────────────
  const statusData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const s = resolveStatus(i);
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a,b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, color: STATUS_COLORS[name] || '#64748b' }));
  }, [filtered]);

  const maxStatusCount = Math.max(...statusData.map(s => s.count), 1);

  // ── Category Distribution ─────────────────────────────────
  const categoryData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const cat = typeof i.category === 'object'
        ? (i.category?.lookup_value || i.category?.name || 'Unknown')
        : (i.category || 'Unknown');
      map[cat] = (map[cat] || 0) + 1;
    });
    const colors = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ec4899','#14b8a6','#ef4444'];
    return Object.entries(map).sort((a,b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [filtered]);

  // ── Sub-Category ──────────────────────────────────────────
  const subCatData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const sc = typeof i.subCategory === 'object'
        ? (i.subCategory?.lookup_value || i.subCategory?.name || 'Unknown')
        : (i.subCategory || 'Unknown');
      map[sc] = (map[sc] || 0) + 1;
    });
    const colors = ['#10b981','#6366f1','#f59e0b','#ec4899','#3b82f6','#14b8a6','#ef4444','#8b5cf6'];
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8)
      .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [filtered]);

  // ── Intent Distribution ───────────────────────────────────
  const intentData = useMemo(() => {
    const map = { Sell: 0, Rent: 0, Lease: 0 };
    filtered.forEach(i => getIntents(i).forEach(intent => {
      if (map[intent] !== undefined) map[intent]++;
    }));
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: INTENT_COLORS[name] }))
      .filter(x => x.value > 0);
  }, [filtered]);

  // ── Monthly Addition Trend ────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, added: 0, active: 0 };
    }
    filtered.forEach(item => {
      const d = new Date(item.createdAt);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (months[key]) {
        months[key].added++;
        if (ACTIVE_STATUSES.includes(resolveStatus(item))) months[key].active++;
      }
    });
    return Object.values(months);
  }, [filtered]);

  // ── Days on Market Bands ──────────────────────────────────
  const ageBandData = useMemo(() => {
    return AGE_BANDS.map(band => ({
      ...band,
      count: filtered.filter(i => {
        const d = daysAgo(i.createdAt);
        return d >= band.min && d < band.max;
      }).length
    })).filter(b => b.count > 0);
  }, [filtered]);

  // ── Project Leaderboard ───────────────────────────────────
  const projectData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const p = resolveProject(i);
      if (!p) return;
      if (!map[p]) map[p] = { name: p, total: 0, active: 0, sold: 0 };
      map[p].total++;
      if (ACTIVE_STATUSES.includes(resolveStatus(i))) map[p].active++;
      if (resolveStatus(i) === 'Sold Out') map[p].sold++;
    });
    return Object.values(map).sort((a,b) => b.total - a.total).slice(0, 10);
  }, [filtered]);

  // ── City / Location Distribution ─────────────────────────
  const cityData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const city = resolveCity(i);
      if (!city) return;
      map[city] = (map[city] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [filtered]);

  // ── Agent Leaderboard ─────────────────────────────────────
  const agentData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const name = resolveAssigned(i);
      if (!map[name]) map[name] = { name, total: 0, active: 0, withFeedback: 0 };
      map[name].total++;
      if (ACTIVE_STATUSES.includes(resolveStatus(i))) map[name].active++;
      if (i.history?.length > 0) map[name].withFeedback++;
    });
    return Object.values(map).sort((a,b) => b.total - a.total).slice(0, 10)
      .map(a => ({ ...a, engagementRate: a.total > 0 ? ((a.withFeedback / a.total) * 100).toFixed(0) : 0 }));
  }, [filtered]);

  // ── Facing / Orientation Analysis ────────────────────────
  const facingData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const f = typeof i.facing === 'object'
        ? (i.facing?.lookup_value || i.facing?.name)
        : i.facing;
      if (!f) return;
      map[f] = (map[f] || 0) + 1;
    });
    const colors = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#ef4444','#f97316'];
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8)
      .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [filtered]);

  // ── Feedback Outcome Analysis ─────────────────────────────
  const feedbackData = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      (i.history || []).forEach(h => {
        const result = h.details?.result;
        if (result) map[result] = (map[result] || 0) + 1;
      });
    });
    const colors = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8)
      .map(([name, count], i) => ({ name, count, color: colors[i % colors.length] }));
  }, [filtered]);

  // ── Stale Alert Badge ─────────────────────────────────────
  const getStaleBadge = (days) => {
    if (days >= 180) return { cls: 'very-old', label: `${days}d Critical` };
    if (days >= 90)  return { cls: 'old',      label: `${days}d Old` };
    return               { cls: 'stale',     label: `${days}d Stale` };
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="inventory-analytics-page">
      <div className="inv-analytics-scroll">

        {/* HEADER */}
        <div className="inv-analytics-header">
          <div className="inv-analytics-header-left">
            <div className="inv-analytics-icon"><i className="fas fa-building" /></div>
            <div className="inv-analytics-title">
              <h1>Inventory Intelligence Analytics</h1>
              <p>Enterprise-grade property portfolio insights for your real estate business</p>
            </div>
          </div>
          <div className="inv-analytics-header-right">
            <div className="inv-date-filters">
              {[{l:'7D',v:'7'},{l:'30D',v:'30'},{l:'90D',v:'90'},{l:'All Time',v:'all'}].map(r => (
                <button key={r.v} className={`inv-date-btn ${dateRange===r.v?'active':''}`} onClick={()=>setDateRange(r.v)}>{r.l}</button>
              ))}
            </div>
            <button className="inv-ctrl-btn" onClick={() => setRefreshKey(k=>k+1)}>
              <i className="fas fa-sync-alt" /> Refresh
            </button>
            {onNavigate && (
              <button className="inv-ctrl-btn" onClick={() => onNavigate('inventory')}>
                <i className="fas fa-arrow-left" /> Back
              </button>
            )}
          </div>
        </div>

        {/* ── SECTION 1: KPI Cards ── */}
        <div className="inv-section">
          <div className="inv-section-title">Portfolio Key Performance Indicators</div>
          {loading ? (
            <div className="inv-kpi-grid">{[...Array(8)].map((_,i)=><Skeleton key={i} height={110}/>)}</div>
          ) : (
            <div className="inv-kpi-grid">
              <KPI icon="fa-building" iconBg="rgba(16,185,129,0.15)" iconColor="#10b981" label="Total Inventory" value={kpis.total} sub={`${kpis.activeRate}% active portfolio`} color="linear-gradient(90deg,#10b981,#059669)" />
              <KPI icon="fa-check-circle" iconBg="rgba(16,185,129,0.15)" iconColor="#10b981" label="Active Properties" value={kpis.active} sub={`${kpis.inactive} inactive`} trendDir="up" color="linear-gradient(90deg,#10b981,#059669)" />
              <KPI icon="fa-tag" iconBg="rgba(236,72,153,0.15)" iconColor="#ec4899" label="For Sale" value={kpis.forSell} sub="Sell intent" color="linear-gradient(90deg,#ec4899,#db2777)" />
              <KPI icon="fa-home" iconBg="rgba(245,158,11,0.15)" iconColor="#f59e0b" label="For Rent" value={kpis.forRent} sub={`${kpis.forLease} for lease`} color="linear-gradient(90deg,#f59e0b,#d97706)" />
              <KPI icon="fa-handshake" iconBg="rgba(99,102,241,0.15)" iconColor="#6366f1" label="Booked" value={kpis.booked} sub={`${kpis.soldOut} sold out`} color="linear-gradient(90deg,#6366f1,#4f46e5)" />
              <KPI icon="fa-pause-circle" iconBg="rgba(249,115,22,0.15)" iconColor="#f97316" label="On Hold" value={kpis.hold} sub={`${kpis.rented} rented out`} trendDir={kpis.hold>0?'down':'neutral'} color="linear-gradient(90deg,#f97316,#ea580c)" />
              <KPI icon="fa-clock" iconBg="rgba(59,130,246,0.15)" iconColor="#60a5fa" label="Avg Days on Market" value={`${kpis.avgDays}d`} sub="Since listing date" color="linear-gradient(90deg,#3b82f6,#2563eb)" />
              <KPI icon="fa-exclamation-triangle" iconBg="rgba(239,68,68,0.15)" iconColor="#ef4444" label="Stale (>60 days)" value={kpis.stale} sub="Active + no update" trendDir={kpis.stale>0?'down':'neutral'} color="linear-gradient(90deg,#ef4444,#dc2626)" />
            </div>
          )}
        </div>

        {/* ── SECTION 2: Status Distribution + Monthly Trend ── */}
        <div className="inv-section">
          <div className="inv-section-title">Status Distribution & Growth Trend</div>
          <div className="inv-charts-grid wide-left">

            {/* Status bars */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-layer-group" /> Inventory by Status</div>
                <span className="inv-chart-badge">{statusData.length} statuses</span>
              </div>
              {loading ? <Skeleton height={240}/> : (
                <div>
                  {statusData.map(s => (
                    <div key={s.name} className="inv-status-row">
                      <div className="inv-status-label">{s.name}</div>
                      <div className="inv-status-bar-wrap">
                        <div className="inv-status-bar-fill" style={{
                          width: `${Math.max((s.count/maxStatusCount)*100, 6)}%`,
                          background: s.color
                        }}>{s.count}</div>
                      </div>
                      <div className="inv-status-stat">
                        {((s.count/filtered.length)*100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monthly trend */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-chart-area" /> Monthly Listings Added</div>
              </div>
              {loading ? <Skeleton height={240}/> : (
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={monthlyTrend}>
                    <defs>
                      <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Area type="monotone" dataKey="added" name="Added" stroke="#10b981" fill="url(#invGrad)" strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="active" name="Active" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Category + Sub-Category + Intent ── */}
        <div className="inv-section">
          <div className="inv-section-title">Property Classification Matrix</div>
          <div className="inv-charts-grid three">

            {/* Category Pie */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-th" /> By Category</div>
              </div>
              {loading ? <Skeleton height={200}/> : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {categoryData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip content={<TipT/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="inv-donut-legend">
                    {categoryData.map((c,i) => {
                      const total = categoryData.reduce((s,x)=>s+x.value,0);
                      return (
                        <div key={i} className="inv-donut-item">
                          <div className="inv-donut-dot" style={{background:c.color}}/>
                          <span className="inv-donut-label">{c.name}</span>
                          <span className="inv-donut-value">{c.value}</span>
                          <span className="inv-donut-pct">{total>0?((c.value/total)*100).toFixed(0):0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sub-Category Bar */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-sitemap" /> Sub-Category</div>
              </div>
              {loading ? <Skeleton height={200}/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={subCatData} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false}/>
                    <XAxis type="number" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={80} tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Bar dataKey="value" name="Count" radius={[0,4,4,0]}>
                      {subCatData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Intent Pie */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-bullseye" /> Sell / Rent / Lease</div>
              </div>
              {loading ? <Skeleton height={200}/> : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={intentData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                        {intentData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip content={<TipT/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="inv-donut-legend">
                    {intentData.map((it,i) => {
                      const total = intentData.reduce((s,x)=>s+x.value,0);
                      return (
                        <div key={i} className="inv-donut-item">
                          <span className={`inv-intent-dot ${it.name.toLowerCase()}`}/>
                          <span className="inv-donut-label">{it.name}</span>
                          <span className="inv-donut-value">{it.value}</span>
                          <span className="inv-donut-pct">{total>0?((it.value/total)*100).toFixed(0):0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Days on Market + Facing Analysis ── */}
        <div className="inv-section">
          <div className="inv-section-title">Aging Analysis & Orientation Intelligence</div>
          <div className="inv-charts-grid">

            {/* Days on Market */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-hourglass-half" /> Days on Market Distribution</div>
                <span className="inv-chart-badge">Avg {kpis.avgDays}d</span>
              </div>
              {loading ? <Skeleton height={220}/> : ageBandData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-check"/><p>No aging data</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ageBandData} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                    <XAxis dataKey="label" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Bar dataKey="count" name="Properties" radius={[6,6,0,0]}>
                      {ageBandData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Facing Analysis */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-compass" /> Facing / Orientation Analysis</div>
              </div>
              {loading ? <Skeleton height={220}/> : facingData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-compass"/><p>No facing data available</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={facingData} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                    <XAxis dataKey="name" tick={{fill:tickColor,fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                      {facingData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Project + City Leaderboard ── */}
        <div className="inv-section">
          <div className="inv-section-title">Project & Location Performance</div>
          <div className="inv-charts-grid">

            {/* Project Leaderboard */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-trophy" /> Project Leaderboard</div>
                <span className="inv-chart-badge">Top 10</span>
              </div>
              {loading ? <Skeleton height={260}/> : projectData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-building"/><p>No project data</p></div>
              ) : (
                <div className="inv-table-scroll">
                  <table className="inv-table">
                    <thead><tr>
                      <th>#</th><th>Project</th><th>Total</th><th>Active</th><th>Sold</th><th>Active %</th>
                    </tr></thead>
                    <tbody>
                      {projectData.map((p,i) => (
                        <tr key={p.name}>
                          <td><div className={`inv-rank-badge ${i===0?'r1':i===1?'r2':i===2?'r3':'rn'}`}>{i+1}</div></td>
                          <td style={{fontWeight:600,color:'var(--an-text-main)',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</td>
                          <td>{p.total}</td>
                          <td style={{color:'#10b981',fontWeight:700}}>{p.active}</td>
                          <td style={{color:'#64748b'}}>{p.sold}</td>
                          <td style={{color: p.total>0&&(p.active/p.total)>0.7?'#10b981':'#f59e0b', fontWeight:700}}>
                            {p.total>0?((p.active/p.total)*100).toFixed(0):0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* City/Location Distribution */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-map-marker-alt" /> City / Location Distribution</div>
              </div>
              {loading ? <Skeleton height={260}/> : cityData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-map"/><p>No location data available</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={cityData} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false}/>
                    <XAxis type="number" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={90} tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Bar dataKey="count" name="Properties" fill="#10b981" radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 6: Agent Performance + Feedback ── */}
        <div className="inv-section">
          <div className="inv-section-title">Agent Performance & Feedback Intelligence</div>
          <div className="inv-charts-grid">

            {/* Agent Table */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-user-tie" /> Agent Portfolio Leaderboard</div>
              </div>
              {loading ? <Skeleton height={250}/> : agentData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-users"/><p>No agent data</p></div>
              ) : (
                <div className="inv-table-scroll">
                  <table className="inv-table">
                    <thead><tr>
                      <th>#</th><th>Agent</th><th>Total</th><th>Active</th><th>Feedback</th><th>Engage %</th>
                    </tr></thead>
                    <tbody>
                      {agentData.map((a,i) => (
                        <tr key={a.name}>
                          <td><div className={`inv-rank-badge ${i===0?'r1':i===1?'r2':i===2?'r3':'rn'}`}>{i+1}</div></td>
                          <td style={{fontWeight:600,color:'var(--an-text-main)',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</td>
                          <td>{a.total}</td>
                          <td style={{color:'#10b981',fontWeight:700}}>{a.active}</td>
                          <td style={{color:'#94a3b8'}}>{a.withFeedback}</td>
                          <td style={{color:parseInt(a.engagementRate)>=50?'#10b981':'#f59e0b',fontWeight:700}}>
                            {a.engagementRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Feedback Outcomes */}
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-comments" /> Owner Feedback Outcomes</div>
                <span className="inv-chart-badge">{kpis.withFeedback} contacted</span>
              </div>
              {loading ? <Skeleton height={250}/> : feedbackData.length === 0 ? (
                <div className="inv-empty"><i className="fas fa-comment-slash"/><p>No feedback data recorded yet</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={feedbackData} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false}/>
                    <XAxis type="number" tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={110} tick={{fill:tickColor,fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TipT/>}/>
                    <Bar dataKey="count" name="Count" radius={[0,4,4,0]}>
                      {feedbackData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 7: Stale Inventory Risk Tracker ── */}
        <div className="inv-section">
          <div className="inv-section-title">
            Stale Inventory Risk Tracker
            {kpis.stale > 0 && (
              <span style={{marginLeft:8,background:'rgba(239,68,68,0.15)',color:'#ef4444',fontSize:'0.65rem',padding:'2px 8px',borderRadius:5,fontWeight:700}}>
                ⚠️ {kpis.stale} properties need follow-up
              </span>
            )}
          </div>
          <div className="inv-chart-card">
            <div className="inv-chart-header">
              <div className="inv-chart-title">
                <i className="fas fa-hourglass-end" style={{color:'#f97316'}} /> Active Inventory — No Update in 60+ Days
              </div>
              <span className="inv-chart-badge" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444'}}>Risk Alert</span>
            </div>
            {loading ? <Skeleton height={200}/> : kpis.staleList.length === 0 ? (
              <div className="inv-empty">
                <i className="fas fa-check-circle" style={{color:'#10b981',opacity:1,display:'block',fontSize:'2rem',marginBottom:'0.5rem'}}/>
                <p style={{color:'#10b981'}}>All active inventory is being regularly updated!</p>
              </div>
            ) : (
              <div className="inv-table-scroll" style={{maxHeight:360}}>
                <table className="inv-table">
                  <thead><tr>
                    <th>Unit</th><th>Project</th><th>Status</th><th>Intent</th>
                    <th>Days Since Update</th><th>Owner</th><th>Assigned To</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {kpis.staleList.map(item => {
                      const days = daysAgo(item.updatedAt);
                      const badge = getStaleBadge(days);
                      const status = resolveStatus(item);
                      const project = resolveProject(item);
                      const ownerName = Array.isArray(item.owners) && item.owners.length > 0
                        ? (item.owners[0]?.name || item.ownerName || '—')
                        : (item.ownerName || '—');
                      const intents = getIntents(item);
                      const assigned = resolveAssigned(item);
                      return (
                        <tr key={item._id}>
                          <td style={{fontWeight:700,color:'var(--an-kpi-value, #34d399)',fontSize:'0.72rem'}}>
                            {item.unitNo || item._id?.slice(-6)}
                          </td>
                          <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'0.72rem'}}>
                            {project || '—'}
                          </td>
                          <td>
                            <span className="inv-status-chip" style={{
                              background: (STATUS_COLORS[status]||'#64748b') + '20',
                              color: STATUS_COLORS[status] || '#64748b',
                              border: `1px solid ${(STATUS_COLORS[status]||'#64748b')}30`
                            }}>{status}</span>
                          </td>
                          <td>
                            {intents.map(it => (
                              <span key={it} className={`inv-intent-dot ${it.toLowerCase()}`} title={it}/>
                            ))}
                            {intents.length === 0 && <span style={{color:'#475569'}}>—</span>}
                          </td>
                          <td><span className={`inv-age-badge ${badge.cls}`}>{badge.label}</span></td>
                          <td style={{fontSize:'0.72rem',color:'#94a3b8',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ownerName}</td>
                          <td style={{fontSize:'0.72rem',color:'#94a3b8',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{assigned}</td>
                          <td>
                            {onNavigate && (
                              <button className="inv-view-btn" onClick={() => onNavigate('inventory-detail', item._id)}>
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

        {/* ── Quick Summary Stats ── */}
        <div className="inv-section">
          <div className="inv-section-title">Portfolio Health Summary</div>
          <div className="inv-charts-grid three">
            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-heartbeat"/> Portfolio Health</div>
              </div>
              {[
                {label:'Properties with Geo-location', value: `${kpis.withGeo} / ${kpis.total}`, cls: kpis.withGeo===kpis.total?'pos':'warn'},
                {label:'Properties with Owner Feedback', value:`${kpis.withFeedback} / ${kpis.total}`, cls: (kpis.withFeedback/Math.max(kpis.total,1))>0.5?'pos':'warn'},
                {label:'Active Portfolio Rate', value:`${kpis.activeRate}%`, cls: parseFloat(kpis.activeRate)>70?'pos':'warn'},
                {label:'Stale Active Properties', value:`${kpis.stale}`, cls: kpis.stale===0?'pos':kpis.stale<10?'warn':'neg'},
                {label:'Booked / Sold Out', value:`${kpis.booked + kpis.soldOut}`, cls:'pos'},
              ].map((s,i) => (
                <div key={i} className="inv-mini-stat">
                  <span className="inv-mini-label">{s.label}</span>
                  <span className={`inv-mini-value ${s.cls||''}`}>{s.value}</span>
                </div>
              ))}
            </div>

            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-chart-pie"/> Intent Breakdown</div>
              </div>
              {[
                {label:'For Sale (Sell)', value: kpis.forSell, pct: ((kpis.forSell/Math.max(kpis.total,1))*100).toFixed(1)},
                {label:'For Rent', value: kpis.forRent, pct: ((kpis.forRent/Math.max(kpis.total,1))*100).toFixed(1)},
                {label:'For Lease', value: kpis.forLease, pct: ((kpis.forLease/Math.max(kpis.total,1))*100).toFixed(1)},
              ].map((s,i) => (
                <div key={i} className="inv-mini-stat">
                  <span className="inv-mini-label">{s.label}</span>
                  <span className="inv-mini-value">{s.value} <span style={{color:'#475569',fontWeight:400}}>({s.pct}%)</span></span>
                </div>
              ))}
            </div>

            <div className="inv-chart-card">
              <div className="inv-chart-header">
                <div className="inv-chart-title"><i className="fas fa-info-circle"/> Availability Status</div>
              </div>
              {[
                {label:'Active / Available', value: kpis.active, cls:'pos'},
                {label:'On Hold', value: kpis.hold, cls:'warn'},
                {label:'Booked', value: kpis.booked, cls:'pos'},
                {label:'Rented Out', value: kpis.rented, cls:'pos'},
                {label:'Sold Out', value: kpis.soldOut, cls:'neutral'},
                {label:'Inactive', value: kpis.inactive, cls:'neg'},
              ].map((s,i) => (
                <div key={i} className="inv-mini-stat">
                  <span className="inv-mini-label">{s.label}</span>
                  <span className={`inv-mini-value ${s.cls||''}`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{textAlign:'center',color:'#1a3325',fontSize:'0.7rem',paddingBottom:'1rem'}}>
          <i className="fas fa-building" style={{marginRight:6}}/>
          Bharat Properties CRM — Inventory Intelligence Analytics · Real data from your portfolio
        </div>

      </div>
    </div>
  );
};

export default InventoryAnalyticsPage;
