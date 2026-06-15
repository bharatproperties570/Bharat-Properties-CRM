import { memo } from 'react';
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
    const { sizes, getLookupValue } = usePropertyConfig();
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
        <section className="dashboard-container" style={{ flex: 1, height: '100vh', overflowY: 'auto', background: 'var(--bg-dark)', color: 'var(--text-main)', padding: '0 2rem 2rem 2rem' }}>
            <style>{`
                :root {
                    --bg-dark: ${isDark ? '#020617' : '#f1f5f9'};
                    --card-bg: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.8)'};
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

            {/* Futuristic Header */}
            <div className="neural-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: isDark ? 'rgba(2, 6, 23, 0.8)' : 'rgba(241, 245, 249, 0.8)', backdropFilter: 'blur(12px)', padding: '24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <img 
                            src={logo} 
                            alt="Bharat Properties Logo" 
                            style={{ 
                                width: '42px', 
                                height: '42px', 
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.4))'
                            }} 
                        />
                        <div>
                            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, background: isDark ? 'linear-gradient(to right, #fff, #94a3b8)' : 'linear-gradient(to right, #0f172a, #475569)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Neural Command Dashboard
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }}></div>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>SYSTEMS ONLINE</span>
                                <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>LAST SYNC: {lastRefresh ? lastRefresh.toLocaleTimeString() : '--:--'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={selectedFilter}
                            onChange={(e) => setSelectedFilter(e.target.value)}
                            className="control-select"
                        >
                            <option value="all">Enterprise Analytics</option>
                            <optgroup label="Teams">
                                {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </optgroup>
                            <optgroup label="Operators">
                                {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
                            </optgroup>
                        </select>
                        <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: 'var(--text-muted)' }}></i>
                    </div>
                    <button onClick={fetchData} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border-color)', background: isDark ? 'rgba(99, 102, 241, 0.1)' : '#fff', color: isDark ? '#fff' : '#6366f1', cursor: 'pointer', boxShadow: isDark ? 'none' : '0 2px 10px rgba(0,0,0,0.05)' }}>
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Dashboard KPIs (Full Width Row) */}
            <DashboardKPIs metrics={metrics} formatters={formatters} />

            <div className="dashboard-grid-root" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }}>
                <div style={{ minWidth: 0 }}>
                    {/* Market Price Trend Chart at the top of left column */}
                    <div style={{ marginBottom: '32px' }}>
                        <MarketPriceTrendChart 
                            deals={metrics.priceTrendDeals} 
                            sizes={sizes} 
                            getLookupValue={getLookupValue} 
                            isDark={isDark} 
                        />
                    </div>
                    
                    {/* Acquisition & Revenue */}
                    <LeadAcquisitionPanel charts={charts} metrics={metrics} formatters={formatters} />
                    <RevenuePanel charts={charts} metrics={metrics} formatters={formatters} />
                    
                    {/* Intelligence & Pulse */}
                    <div style={{ marginTop: '32px' }}>
                        <AIIntelligenceWidget />
                    </div>
                    <div style={{ marginTop: '32px' }}>
                        <MarketPulseWidget />
                    </div>
                </div>

                <DashboardSidebar metrics={metrics} users={users} onNavigate={onNavigate} />
            </div>
        </section>
    );
};

export default memo(DashboardPage);
