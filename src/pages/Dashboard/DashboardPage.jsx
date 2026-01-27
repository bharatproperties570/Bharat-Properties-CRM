import React, { useState } from 'react';
import Chart from 'react-apexcharts';
import { reportsData } from '../../data/reportsData';

const DashboardPage = () => {
    const [role, setRole] = useState('owner'); // owner | agent | investor
    const [selectedTeam, setSelectedTeam] = useState('Select Team');
    const [selectedExecutive, setSelectedExecutive] = useState('Select Executive');
    const data = reportsData;

    // Filter Logic for Role-Based View
    const getFilteredAlerts = () => {
        const allAlerts = [
            ...(data.aiAlertHub?.followupFailure || []),
            ...(data.aiAlertHub?.hotLeads || []),
            ...(data.aiAlertHub?.stuckDeals || []),
            ...(data.aiAlertHub?.communication || []),
            ...(data.aiAlertHub?.inventory || [])
        ];
        if (role === 'agent') return allAlerts.filter(a => a.type !== 'financial' && a.id !== 9);
        if (role === 'investor') return allAlerts.filter(a => a.type === 'financial' || a.id === 9 || a.type === 'hot');
        return allAlerts;
    };

    const getFilteredSuggestions = () => {
        if (role === 'agent') return [...(data.autoSuggestions?.leads || []), ...(data.autoSuggestions?.pipeline || [])];
        if (role === 'investor') return [...(data.autoSuggestions?.leads || []), ...(data.autoSuggestions?.strategy || [])];
        return [...(data.autoSuggestions?.performance || []), ...(data.autoSuggestions?.pipeline || []), ...(data.autoSuggestions?.strategy || [])];
    };

    return (
        <section id="dashboardView" className="view-section active" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', overflow: 'hidden' }}>
            <div className="view-scroll-wrapper" style={{ flex: 1, overflowY: 'auto', padding: '24px 2rem' }}>

                {/* PREMIUM HEADER STRIP */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', padding: '12px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className="control-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '6px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                            <i className="fas fa-users" style={{ color: 'var(--primary-color)' }}></i>
                            <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
                                <option>Sales Team</option>
                                <option>Marketing</option>
                            </select>
                        </div>
                        <div className="control-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '6px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                            <i className="fas fa-calendar-alt" style={{ color: 'var(--primary-color)' }}></i>
                            <span style={{ color: 'var(--text-main)' }}>Last 30 Days</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ background: 'rgba(0,0,0,0.03)', padding: '4px', borderRadius: '12px', display: 'flex', gap: '4px' }}>
                            {['owner', 'agent', 'investor'].map(r => (
                                <button
                                    key={r}
                                    onClick={() => setRole(r)}
                                    style={{
                                        padding: '6px 16px', borderRadius: '10px', border: 'none', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                        background: role === r ? '#fff' : 'transparent',
                                        color: role === r ? 'var(--primary-color)' : 'var(--text-muted)',
                                        boxShadow: role === r ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    {r.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* MAIN DASHBOARD CONTENT */}
                <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>

                    {/* LEFT COLUMN: VISUALIZATIONS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                        {/* 1. TOP STATS ROW */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                            {(data.priorityAlerts || []).map((alert, i) => (
                                <div key={i} className="dashboard-card" style={{ padding: '16px', background: '#fff', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: alert.color === 'red' ? 'var(--danger-color)' : alert.color === 'orange' ? 'var(--marketing-orange)' : 'var(--primary-color)' }}></div>
                                    <i className={`fas ${alert.icon}`} style={{ fontSize: '1.2rem', color: alert.color === 'red' ? 'var(--danger-color)' : alert.color === 'orange' ? 'var(--marketing-orange)' : 'var(--primary-color)', marginBottom: '8px' }}></i>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{alert.value}</div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{alert.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* 2. CORE PERFORMANCE WINDOWS */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            {/* Pipeline Money Window */}
                            <div className="dashboard-card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-coins" style={{ color: 'var(--marketing-orange)' }}></i> Pipeline Liquidity
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary-color)', background: 'rgba(0,82,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>LIVE MATRIX</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                    {(data.pipelineMoney?.kpis || []).map((kpi, i) => (
                                        <div key={i} style={{ padding: '12px', background: 'var(--bg-gray)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kpi.label}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: kpi.color === 'red' ? 'var(--danger-color)' : kpi.color === 'green' ? 'var(--success-color)' : 'var(--text-main)' }}>{kpi.value}</div>
                                        </div>
                                    ))}
                                </div>
                                <Chart
                                    options={{
                                        chart: { toolbar: { show: false } },
                                        plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '70%' } },
                                        colors: ['var(--primary-color)'],
                                        xaxis: { categories: data.pipelineMoney?.funnel?.categories || [] },
                                        grid: { borderColor: '#f1f5f9' },
                                        dataLabels: { enabled: false }
                                    }}
                                    series={data.pipelineMoney?.funnel?.series || []}
                                    type="bar" height={200}
                                />
                            </div>

                            {/* Inventory Velocity Window */}
                            <div className="dashboard-card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-warehouse" style={{ color: 'var(--success-color)' }}></i> Inventory Health
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--success-color)', background: 'rgba(16,185,129,0.05)', padding: '4px 10px', borderRadius: '20px' }}>REAL-TIME</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                    {(data.propertyInventory?.kpis || []).map((kpi, i) => (
                                        <div key={i} style={{ padding: '12px', background: 'var(--bg-gray)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kpi.label}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: kpi.color === 'green' ? 'var(--success-color)' : 'var(--text-main)' }}>{kpi.value}</div>
                                        </div>
                                    ))}
                                </div>
                                <Chart
                                    options={{
                                        labels: data.financialIntelligence?.portfolioMix?.labels || [],
                                        colors: ['var(--primary-color)', 'var(--success-color)', 'var(--marketing-orange)', '#8b5cf6'],
                                        legend: { position: 'bottom', fontSize: '11px', fontWeight: 600 },
                                        stroke: { width: 0 },
                                        plotOptions: { pie: { donut: { size: '75%' } } }
                                    }}
                                    series={data.financialIntelligence?.portfolioMix?.series || []}
                                    type="donut" height={200}
                                />
                            </div>
                        </div>

                        {/* 3. AI INTELLIGENCE HUB */}
                        <div className="dashboard-card" style={{ background: '#0f172a', padding: '24px', borderRadius: '20px', color: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <i className="fas fa-microchip" style={{ color: 'var(--primary-color)' }}></i> AI STRATEGIC COMMAND
                                </h3>
                                <div style={{ fontSize: '0.65rem', padding: '4px 12px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>NEURAL ENGINE ACTIVE</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                {getFilteredAlerts().slice(0, 4).map((alert, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '16px', borderRadius: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{alert.title}</span>
                                            <span style={{ fontSize: '0.55rem', fontWeight: 900, color: alert.type === 'critical' ? 'var(--danger-color)' : 'var(--primary-color)', textTransform: 'uppercase' }}>{alert.type}</span>
                                        </div>
                                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, marginBottom: '12px' }}>{alert.message}</p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(alert.actions || []).map((act, j) => (
                                                <button key={j} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: j === 0 ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer' }}>{act}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. REVENUE & FORECAST WINDS */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                            <div className="dashboard-card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                <h3 className="section-label">Cash Flow & Collection Matrix</h3>
                                <Chart
                                    options={{
                                        chart: { toolbar: { show: false } },
                                        stroke: { curve: 'smooth', width: 4 },
                                        colors: ['var(--primary-color)'],
                                        xaxis: { categories: data.financialIntelligence?.cashFlowProjection?.categories || [] },
                                        grid: { borderColor: '#f1f5f9' },
                                        markers: { size: 5, strokeColors: '#fff', strokeWidth: 3, hover: { size: 7 } },
                                        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [20, 100] } }
                                    }}
                                    series={data.financialIntelligence?.cashFlowProjection?.series || []}
                                    type="area" height={280}
                                />
                            </div>
                            <div className="dashboard-card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                <h3 className="section-label">Revenue Origin</h3>
                                <Chart
                                    options={{
                                        chart: { toolbar: { show: false } },
                                        plotOptions: { bar: { columnWidth: '50%', borderRadius: 6 } },
                                        colors: ['var(--success-color)'],
                                        xaxis: { categories: data.financialIntelligence?.revenueBySource?.categories || [] },
                                        grid: { borderColor: '#f1f5f9' }
                                    }}
                                    series={data.financialIntelligence?.revenueBySource?.series || []}
                                    type="bar" height={280}
                                />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: ACTION PANELS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                        {/* 1. DAILY AGENDA LEDGER */}
                        <div className="dashboard-card shadow-premium" style={{ background: '#fff', padding: '20px', borderRadius: '20px', border: '1px solid var(--border-color)', height: '100%', position: 'sticky', top: '0' }}>
                            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <i className="fas fa-calendar-check" style={{ color: 'var(--primary-color)' }}></i> High-Value Agenda
                                </h3>
                            </div>

                            {/* Priority Tasks */}
                            <div style={{ marginBottom: '24px' }}>
                                <span className="section-label" style={{ fontSize: '0.65rem', marginBottom: '12px' }}>CRITICAL ACTIONS</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(data.agenda?.tasks || []).map((task) => (
                                        <div key={task.id} style={{ padding: '12px', background: 'var(--bg-gray)', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{task.title}</span>
                                                <span style={{ fontSize: '0.65rem', color: task.status === 'overdue' ? 'var(--danger-color)' : 'var(--text-muted)', fontWeight: 800 }}>{task.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{task.target}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Site Visits */}
                            <div style={{ marginBottom: '24px' }}>
                                <span className="section-label" style={{ fontSize: '0.65rem', marginBottom: '12px', color: '#8b5cf6' }}>SITE ENGAGEMENTS</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(data.agenda?.siteVisits || []).map((visit) => (
                                        <div key={visit.id} style={{ padding: '12px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.1)', borderRadius: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{visit.target}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#8b5cf6', fontWeight: 800 }}>{visit.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{visit.client}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Suggestions */}
                            <div>
                                <span className="section-label" style={{ fontSize: '0.65rem', marginBottom: '12px', color: 'var(--primary-color)' }}>AI SUGGESTIONS</span>
                                {getFilteredSuggestions().slice(0, 3).map((sug, i) => (
                                    <div key={i} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(0, 82, 255, 0.04)', border: '1px solid rgba(0, 82, 255, 0.1)', marginBottom: '8px', display: 'flex', gap: '10px' }}>
                                        <i className="fas fa-lightbulb" style={{ color: 'var(--primary-color)', marginTop: '2px', fontSize: '0.8rem' }}></i>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>{sug.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .section-label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 20px;
                }
                .dashboard-card {
                    transition: all 0.3s ease;
                }
                .dashboard-card:hover {
                    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                    transform: translateY(-2px);
                }
                .control-pill:hover {
                    border-color: var(--primary-color);
                    background: rgba(0,82,255,0.02);
                }
            `}</style>
        </section>
    );
};

export default DashboardPage;
