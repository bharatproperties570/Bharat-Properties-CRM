import { memo } from 'react';

// Modular Components
import DashboardKPIs from './components/DashboardKPIs';
import LeadAcquisitionPanel from './components/LeadAcquisitionPanel';
import RevenuePanel from './components/RevenuePanel';
import DashboardSidebar from './components/DashboardSidebar';

// Hooks
import { useDashboardData } from '../../hooks/useDashboardData';

const DashboardPage = ({ onNavigate }) => {
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
        <section className="dashboard-container" style={{ flex: 1, height: '100vh', overflowY: 'auto', background: '#020617', color: '#f8fafc', padding: '0 2rem 2rem 2rem' }}>
            <style>{`
                :root {
                    --bg-dark: #020617;
                    --card-bg: rgba(30, 41, 59, 0.5);
                    --accent-primary: #6366f1;
                    --accent-success: #10b981;
                    --accent-warning: #f59e0b;
                    --text-main: #f8fafc;
                    --text-muted: #94a3b8;
                    --border-color: rgba(255, 255, 255, 0.05);
                    --glass-glow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
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
            `}</style>

            {/* Futuristic Header */}
            <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(12px)', padding: '24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Neural Command Dashboard
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }}></div>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>SYSTEMS ONLINE</span>
                        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>LAST SYNC: {lastRefresh ? lastRefresh.toLocaleTimeString() : '--:--'}</span>
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
                        <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#94a3b8' }}></i>
                    </div>
                    <button onClick={fetchData} style={{ width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(99, 102, 241, 0.1)', color: '#fff', cursor: 'pointer' }}>
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }}>
                <div style={{ minWidth: 0 }}>
                    <DashboardKPIs metrics={metrics} formatters={formatters} />
                    <LeadAcquisitionPanel charts={charts} metrics={metrics} formatters={formatters} />
                    <RevenuePanel charts={charts} metrics={metrics} formatters={formatters} />
                </div>

                <DashboardSidebar metrics={metrics} onNavigate={onNavigate} />
            </div>
        </section>
    );
};

export default memo(DashboardPage);
