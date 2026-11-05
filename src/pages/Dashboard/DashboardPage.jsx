import { memo, useState, useEffect } from 'react';
import logo from '../../assets/logo.png';

// Modular Components
import DashboardKPIs from './components/DashboardKPIs';
import LeadAcquisitionPanel from './components/LeadAcquisitionPanel';
import RevenuePanel from './components/RevenuePanel';
import DashboardSidebar from './components/DashboardSidebar';

import AIIntelligenceWidget from '../../components/AIIntelligenceWidget';
import MarketPulseWidget from '../../components/MarketPulseWidget';
import MarketPriceTrendChart from '../../components/charts/MarketPriceTrendChart';
import { useDashboardData } from '../../hooks/useDashboardData';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useTheme } from '../../context/ThemeContext';

const DashboardPage = ({ onNavigate }) => {
    const { isDark } = useTheme();
    const { sizes, projects, getLookupValue } = usePropertyConfig();
    const {
        selectedFilter,
        setSelectedFilter,
        loading,
        lastRefresh,
        fetchData,
        users,
        teams,
        metrics,
        charts,
        formatters
    } = useDashboardData();

    // Live Clock & Date
    const [currentDateTime, setCurrentDateTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (loading && !metrics.leads.length) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#fff' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="futuristic-spinner"></div>
                    <p style={{ marginTop: '24px', fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.05em', color: '#94a3b8' }}>INITIALIZING COMMAND CENTER</p>
                </div>
            </div>
        );
    }

    return (
        <section className="dashboard-container" style={{ flex: 1, height: '100vh', overflowY: 'auto', background: 'var(--bg-dark)', color: 'var(--text-main)', padding: '0 1.25rem 1.25rem 1.25rem' }}>
            <style>{`
                :root {
                    --bg-dark: ${isDark ? '#020617' : '#f1f5f9'};
                    --card-bg: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.8)'};
                    --panel-bg: ${isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.8)'};
                    --border-light: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
                    --gradient-dark: ${isDark ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.5))' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(241, 245, 249, 0.8))'};
                    --accent-primary: #6366f1;
                    --accent-success: #10b981;
                    --accent-warning: #f59e0b;
                    --text-main: ${isDark ? '#f8fafc' : '#0f172a'};
                    --text-muted: ${isDark ? '#94a3b8' : '#64748b'};
                    --border-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)'};
                    --glass-glow: ${isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)' : '0 8px 32px 0 rgba(0, 0, 0, 0.05)'};
                }

                .dashboard-container::-webkit-scrollbar { width: 6px; }
                .dashboard-container::-webkit-scrollbar-track { background: var(--bg-dark); }
                .dashboard-container::-webkit-scrollbar-thumb { background: #1e293b; borderRadius: 4px; }

                .glass-card {
                    background: var(--card-bg);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    box-shadow: var(--glass-glow);
                    transition: transform 0.3s ease, border-color 0.3s ease;
                }

                .glass-card:hover {
                    border-color: rgba(99, 102, 241, 0.3);
                }

                .futuristic-spinner {
                    width: 60px;
                    height: 60px;
                    border: 3px solid transparent;
                    border-top: 3px solid var(--accent-primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    position: relative;
                }
                .futuristic-spinner:before {
                    content: '';
                    position: absolute;
                    top: 5px; left: 5px; right: 5px; bottom: 5px;
                    border: 3px solid transparent;
                    border-top: 3px solid var(--accent-success);
                    border-radius: 50%;
                    animation: spin 2s linear infinite;
                }

                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

                .control-select {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid var(--border-color);
                    color: white;
                    padding: 8px 32px 8px 16px;
                    border-radius: 12px;
                    outline: none;
                    cursor: pointer;
                    font-weight: 600;
                    appearance: none;
                }

                @media (max-width: 1200px) {
                    .dashboard-grid-root {
                        grid-template-columns: 1fr !important;
                    }
                    .dashboard-panel-grid {
                        grid-template-columns: 1fr !important;
                    }
                    .acq-metric-grid, .perf-metric-grid {
                        grid-template-columns: 1fr !important;
                    }
                }

                @media (max-width: 900px) {
                    .acq-metric-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                }

                @media (max-width: 768px) {
                    .dashboard-container {
                        padding: 0 1rem 1rem 1rem !important;
                    }
                    .kpi-grid {
                        grid-template-columns: 1fr !important;
                    }
                    .neural-header {
                        flex-direction: column;
                        align-items: flex-start !important;
                        gap: 16px;
                        padding: 16px 0 !important;
                    }
                }
            `}</style>

            {/* Dashboard Header */}
            <div className="neural-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: isDark ? 'rgba(2, 6, 23, 0.85)' : 'rgba(241, 245, 249, 0.85)', backdropFilter: 'blur(12px)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img 
                            src={logo} 
                            alt="Bharat Properties Logo" 
                            style={{ 
                                width: '32px', 
                                height: '32px', 
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.35))'
                            }} 
                        />
                        <div>
                            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.02em', margin: 0, background: isDark ? 'linear-gradient(to right, #fff, #94a3b8)' : 'linear-gradient(to right, #0f172a, #475569)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>
                                Dashboard
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                                <span style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 700, letterSpacing: '0.04em' }}>SYSTEMS ONLINE</span>
                                <span style={{ color: 'var(--border-color, rgba(255,255,255,0.15))' }}>|</span>
                                <span style={{ fontSize: '0.70rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <i className="far fa-calendar-alt" style={{ opacity: 0.8 }}></i>
                                    {currentDateTime.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                    <span style={{ margin: '0 3px', opacity: 0.4 }}>•</span>
                                    <i className="far fa-clock" style={{ opacity: 0.8 }}></i>
                                    {currentDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                                {lastRefresh && (
                                    <>
                                        <span style={{ color: 'var(--border-color, rgba(255,255,255,0.15))' }}>|</span>
                                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                            SYNC: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={selectedFilter}
                            onChange={(e) => setSelectedFilter(e.target.value)}
                            className="control-select"
                            style={{ padding: '6px 28px 6px 12px', fontSize: '0.8rem', height: '34px' }}
                        >
                            <option value="all">Enterprise Analytics</option>
                            <optgroup label="Teams">
                                {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </optgroup>
                            <optgroup label="Operators">
                                {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
                            </optgroup>
                        </select>
                        <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                    </div>
                    <button onClick={fetchData} style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid var(--border-color)', background: isDark ? 'rgba(99, 102, 241, 0.1)' : '#fff', color: isDark ? '#fff' : '#6366f1', cursor: 'pointer', boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Refresh Dashboard">
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} style={{ fontSize: '0.75rem' }}></i>
                    </button>
                </div>
            </div>

            <div className="dashboard-grid-root" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '14px' }}>
                <div style={{ minWidth: 0 }}>
                    {/* Compact KPI Tiles (aligned at top with Mission Agenda) */}
                    <div style={{ marginBottom: '12px' }}>
                        <DashboardKPIs metrics={metrics} formatters={formatters} />
                    </div>

                    {/* Market Price Trend Chart below KPIs */}
                    <div style={{ marginBottom: '12px' }}>
                        <MarketPriceTrendChart 
                            deals={metrics.priceTrendDeals} 
                            sizes={sizes} 
                            projects={projects}
                            getLookupValue={getLookupValue} 
                            isDark={isDark} 
                        />
                    </div>
                    
                    {/* Acquisition & Revenue */}
                    <LeadAcquisitionPanel charts={charts} metrics={metrics} formatters={formatters} />
                    <RevenuePanel charts={charts} metrics={metrics} formatters={formatters} />
                    
                    {/* Intelligence & Pulse */}
                    <div style={{ marginTop: '12px' }}>
                        <AIIntelligenceWidget />
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <MarketPulseWidget />
                    </div>
                </div>

                <DashboardSidebar metrics={metrics} users={users} onNavigate={onNavigate} />
            </div>
        </section>
    );
};

export default memo(DashboardPage);
