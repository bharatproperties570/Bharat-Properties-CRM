import React, { useState } from 'react';
import Chart from 'react-apexcharts';
import { reportsData } from '../data/reportsData';

const DashboardView = () => {
    const [role, setRole] = useState('owner'); // owner | agent | investor
    const [activeSector, setActiveSector] = useState('All Sectors');
    const data = reportsData;

    // Filter Logic for Role-Based View
    const getFilteredAlerts = () => {
        const allAlerts = [...data.aiAlertHub.followupFailure, ...data.aiAlertHub.hotLeads, ...data.aiAlertHub.stuckDeals, ...data.aiAlertHub.communication, ...data.aiAlertHub.inventory];
        if (role === 'agent') return allAlerts.filter(a => a.type !== 'financial' && a.id !== 9);
        if (role === 'investor') return allAlerts.filter(a => a.type === 'financial' || a.id === 9 || a.type === 'hot');
        return allAlerts;
    };

    const getFilteredSuggestions = () => {
        if (role === 'agent') return [...data.autoSuggestions.leads, ...data.autoSuggestions.pipeline];
        if (role === 'investor') return [...data.autoSuggestions.leads, ...data.autoSuggestions.strategy];
        return [...data.autoSuggestions.performance, ...data.autoSuggestions.pipeline, ...data.autoSuggestions.strategy];
    };

    return (
        <section id="dashboardView" className="view-section active" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
            <div className="view-scroll-wrapper" style={{ flex: 1, overflowY: 'auto', padding: '32px 2rem' }}>

                {/* GLOBAL CONTROL BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: '#fff', padding: '16px 24px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ padding: '8px 16px', borderRadius: '12px', background: '#f1f5f9', fontSize: '0.85rem', fontWeight: 700, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <i className="fas fa-filter" style={{ color: '#64748b' }}></i>
                            <select value={activeSector} onChange={(e) => setActiveSector(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 700, color: '#0f172a', outline: 'none' }}>
                                {data.filterOptions.sectors.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={{ padding: '8px 16px', borderRadius: '12px', background: '#f1f5f9', fontSize: '0.85rem', fontWeight: 700, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <i className="fas fa-calendar-alt" style={{ color: '#64748b' }}></i>
                            <span style={{ color: '#0f172a' }}>Last 30 Days</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginRight: '8px' }}>SWITCH PERSPECTIVE:</span>
                        <div className="role-switcher" style={{ background: '#f1f5f9' }}>
                            <button className={`role-btn ${role === 'owner' ? 'active' : ''}`} onClick={() => setRole('owner')}>Owner</button>
                            <button className={`role-btn ${role === 'agent' ? 'active' : ''}`} onClick={() => setRole('agent')}>Agent</button>
                            <button className={`role-btn ${role === 'investor' ? 'active' : ''}`} onClick={() => setRole('investor')}>Investor</button>
                        </div>
                    </div>
                </div>

                {/* 1. TOP PRIORITY ACTION STRIP */}
                <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
                        {data.priorityAlerts.map((alert, i) => (
                            <div key={i} className={`dashboard-card priority-card ${alert.blink ? 'blink' : ''}`} style={{
                                padding: '16px',
                                borderBottom: `4px solid ${alert.color === 'red' ? '#ef4444' : alert.color === 'orange' ? '#f59e0b' : alert.color === 'blue' ? '#3b82f6' : '#10b981'}`,
                                textAlign: 'center'
                            }}>
                                <i className={`fas ${alert.icon}`} style={{ fontSize: '1.2rem', color: alert.color === 'red' ? '#ef4444' : alert.color === 'orange' ? '#f59e0b' : alert.color === 'blue' ? '#3b82f6' : '#10b981', marginBottom: '8px' }}></i>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{alert.value}</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{alert.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="dashboard-layout">
                    {/* LEFT COLUMN - THE ENGINE */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                        {/* 2. AI INTELLIGENCE & SUGGESTIONS */}
                        <div>
                            <span className="section-label" style={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-sparkles"></i> AI High-Intent Hub
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
                                {getFilteredAlerts().slice(0, 4).map((alert, i) => (
                                    <div key={i} className={`dashboard-card ai-alert-card ai-alert-${alert.type} animate-in`} style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 800 }}>{alert.title}</h4>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 900, background: 'rgba(0,0,0,0.04)', padding: '2px 8px', borderRadius: '8px' }}>{alert.type.toUpperCase()}</span>
                                        </div>
                                        <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px' }}>{alert.message}</p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {alert.actions.map((act, j) => (
                                                <button key={j} className={j === 0 ? "btn-primary" : "btn-outline"} style={{ padding: '6px 12px', fontSize: '0.65rem', borderRadius: '8px', fontWeight: 700 }}>{act}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. FINANCIAL INTELLIGENCE (₹ Cr) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Cash Flow Forecast (Next 120 Days)</span>
                                <Chart
                                    options={{
                                        chart: { toolbar: { show: false } },
                                        stroke: { curve: 'smooth', width: 4 },
                                        colors: ['#10b981'],
                                        xaxis: { categories: data.financialIntelligence.cashFlowProjection.categories },
                                        dataLabels: { enabled: true, formatter: (v) => "₹" + v + " Cr", style: { fontSize: '10px' } },
                                        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } }
                                    }}
                                    series={data.financialIntelligence.cashFlowProjection.series}
                                    type="area"
                                    height={300}
                                />
                                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '10px', textAlign: 'center' }}>* Projections based on Post-Sale payment schedules and collection history.</p>
                            </div>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Portfolio Mix</span>
                                <Chart
                                    options={{
                                        labels: data.financialIntelligence.portfolioMix.labels,
                                        colors: ['#0891b2', '#10b981', '#f59e0b', '#8b5cf6'],
                                        legend: { position: 'bottom', horizontalAlign: 'center', fontSize: '11px' },
                                        plotOptions: { pie: { donut: { size: '75%' } } }
                                    }}
                                    series={data.financialIntelligence.portfolioMix.series}
                                    type="donut"
                                    height={300}
                                />
                            </div>
                        </div>

                        {/* 4. GEOGRAPHIC & VELOCITY INTELLIGENCE */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Sector Hotspots (Revenue Density)</span>
                                <Chart
                                    options={{
                                        legend: { show: false },
                                        chart: { toolbar: { show: false } },
                                        colors: ['#0891b2'],
                                        plotOptions: { treemap: { distributed: true, enableShades: true } }
                                    }}
                                    series={data.operationalIntelligence.sectorHotspots.series}
                                    type="treemap"
                                    height={300}
                                />
                            </div>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Lead Velocity Index (Speed to Closure)</span>
                                <Chart
                                    options={{
                                        plotOptions: { bar: { horizontal: true, borderRadius: 8, barHeight: '60%' } },
                                        colors: ['#f59e0b'],
                                        xaxis: { categories: data.operationalIntelligence.leadVelocityIndex.categories },
                                        dataLabels: { enabled: true, formatter: (v) => v + " Days" }
                                    }}
                                    series={data.operationalIntelligence.leadVelocityIndex.series}
                                    type="bar"
                                    height={300}
                                />
                            </div>
                        </div>

                        {/* 5. TEAM & ROI ANALYTICS */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Marketing ROI by Revenue (₹ Cr)</span>
                                <Chart
                                    options={{
                                        plotOptions: { bar: { columnWidth: '50%', borderRadius: 10 } },
                                        colors: ['#0ea5e9'],
                                        xaxis: { categories: data.financialIntelligence.revenueBySource.categories },
                                        dataLabels: { enabled: true, formatter: (v) => "₹" + v + " Cr" }
                                    }}
                                    series={data.financialIntelligence.revenueBySource.series}
                                    type="bar"
                                    height={250}
                                />
                            </div>
                            <div className="dashboard-card animate-in">
                                <span className="section-label">Top Agents (Conv. Rate)</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                                    {data.teamPerformance.leaderboard.map((agent, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: i === 0 ? '#0ea5e9' : '#e2e8f0', color: i === 0 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>{i + 1}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>{agent.agent}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{agent.deals} won | {agent.conversion} conversion</div>
                                            </div>
                                            <div style={{ width: '40px', height: '6px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{ width: agent.conversion, height: '100%', background: '#10b981' }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN - THE DYNAMIC LEDGER */}
                    <div className="sticky-agenda">
                        <div className="dashboard-card" style={{ height: '100%', padding: '24px 16px' }}>
                            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '15px', marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Daily Action Ledger</h3>
                            </div>

                            {/* DYNAMIC SUGGESTIONS ENGINE */}
                            <div style={{ marginBottom: '32px' }}>
                                {getFilteredSuggestions().slice(0, 3).map((sug, i) => (
                                    <div key={i} style={{
                                        padding: '12px 16px',
                                        borderRadius: '16px',
                                        background: '#fffbeb',
                                        border: '1px solid #fef3c7',
                                        marginBottom: '12px',
                                        display: 'flex',
                                        gap: '12px',
                                        alignItems: 'center'
                                    }}>
                                        <i className="fas fa-lightbulb" style={{ color: '#f59e0b' }}></i>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>{sug.text}</span>
                                    </div>
                                ))}
                            </div>

                            {/* TASKS */}
                            <div style={{ marginBottom: '32px' }}>
                                <span className="section-label">Priority Tasks</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                                    {data.agenda.tasks.map((task) => (
                                        <div key={task.id} className="agenda-item" style={{
                                            padding: '16px',
                                            background: '#fcfcfd',
                                            borderRadius: '16px',
                                            borderLeft: `5px solid ${task.status === 'overdue' ? '#ef4444' : '#f59e0b'}`
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{task.title}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{task.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{task.target}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                                <button className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.6rem' }}><i className="fas fa-phone-alt"></i></button>
                                                <button className="btn-outline" style={{ padding: '6px 10px', fontSize: '0.6rem' }}><i className="fab fa-whatsapp"></i></button>
                                                <button className="btn-outline" style={{ padding: '6px 10px', fontSize: '0.6rem', marginLeft: 'auto' }}><i className="fas fa-check"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* SITE VISITS */}
                            <div style={{ marginBottom: '32px' }}>
                                <span className="section-label">Site Visits</span>
                                {data.agenda.siteVisits.map((visit) => (
                                    <div key={visit.id} style={{ padding: '20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', color: '#fff', marginTop: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>{visit.target}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#0ea5e9', fontWeight: 700 }}>{visit.time}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Client: {visit.client}</div>
                                        <button style={{ width: '100%', marginTop: '16px', padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                                            Open Map & Details
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* SCHEDULED MEETINGS */}
                            <div style={{ marginBottom: '32px' }}>
                                <span className="section-label">Scheduled Meetings</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                                    {data.agenda.meetings.map((meet) => (
                                        <div key={meet.id} style={{
                                            padding: '16px',
                                            background: '#fff',
                                            borderRadius: '16px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ padding: '4px 8px', borderRadius: '6px', background: `${meet.color}15`, color: meet.color, fontSize: '0.65rem', fontWeight: 800 }}>
                                                    {meet.platform}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{meet.time}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{meet.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{meet.client}</div>

                                            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                                                <button className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '0.7rem', borderRadius: '8px' }}>Join Meet</button>
                                                <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '0.7rem', borderRadius: '8px' }}>Details</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* RECENT FEED */}
                            <div>
                                <span className="section-label">Real-time Logs</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                                    {data.agenda.recentActivity.map((log) => (
                                        <div key={log.id} style={{ display: 'flex', gap: '12px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', marginTop: '4px' }}></div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                                                    {log.user} <span style={{ fontWeight: 500, color: '#64748b' }}>{log.action}</span> {log.target}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Just Now</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default DashboardView;
