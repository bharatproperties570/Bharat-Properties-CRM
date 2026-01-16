import React, { useState } from 'react';
import Chart from 'react-apexcharts';
import { reportsData } from '../data/reportsData';

const ReportsView = () => {
    const [activeTab, setActiveTab] = useState('insights');
    const sections = [
        { id: 'insights', label: 'Strategic Insights', icon: 'fa-brain' },
        { id: 'matrix', label: 'Executive Matrix', icon: 'fa-shield-alt' },
        { id: 'market', label: 'Market Hotspots', icon: 'fa-map-marked-alt' },
        { id: 'revenue', label: 'Debt Dynamics', icon: 'fa-coins' },
        { id: 'activity', label: 'Activity Reports', icon: 'fa-tasks' },
        { id: 'leads', label: 'Lead Analysis', icon: 'fa-filter' },
        { id: 'voice', label: 'Call & Voice', icon: 'fa-phone-alt' },
        { id: 'marketing', label: 'Marketing ROI', icon: 'fa-bullhorn' },
        { id: 'funnel', label: 'Pipeline Funnel', icon: 'fa-funnel-dollar' },
        { id: 'sales', label: 'Sales Performance', icon: 'fa-award' },
    ];

    const renderHeader = () => (
        <div className="page-header" style={{ padding: '20px 2rem', background: '#fff', borderBottom: '1px solid #eef2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ background: 'var(--primary-color)', color: '#fff', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 4px 12px rgba(8, 145, 178, 0.2)' }}>
                    <i className="fas fa-chart-line"></i>
                </div>
                <div>
                    <span className="working-list-label" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>High-Resolution Analytics</span>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Bharat Properties Intelligence Hub</h1>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ marginRight: '15px', padding: '5px 15px', background: '#f8fafc', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                    <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></span>
                    Live Data Refreshed
                </div>
                <button className="btn-outline" style={{ borderRadius: '8px', fontWeight: 600 }}>
                    <i className="fas fa-file-pdf" style={{ marginRight: '8px' }}></i> Export PDF
                </button>
                <button className="btn-outline" style={{ borderRadius: '8px', fontWeight: 600 }}>
                    <i className="fas fa-file-excel" style={{ marginRight: '8px' }}></i> Export Excel
                </button>
            </div>
        </div>
    );

    const renderTabs = () => (
        <div className="report-tabs" style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 2rem',
            background: '#fff',
            borderBottom: '1px solid #eef2f5',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            position: 'sticky',
            top: 0,
            zIndex: 10
        }}>
            {sections.map(section => (
                <button
                    key={section.id}
                    onClick={() => setActiveTab(section.id)}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: activeTab === section.id ? '#f0f9ff' : 'transparent',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        fontWeight: activeTab === section.id ? 700 : 500,
                        color: activeTab === section.id ? 'var(--primary-color)' : '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                        borderBottom: activeTab === section.id ? '2px solid var(--primary-color)' : '2px solid transparent'
                    }}
                >
                    <i className={`fas ${section.icon}`} style={{ fontSize: '1rem' }}></i>
                    {section.label}
                </button>
            ))}
        </div>
    );

    return (
        <section id="reportsView" className="view-section active" style={{ background: '#f8fafc', minHeight: '100vh' }}>
            <div className="view-scroll-wrapper">
                {renderHeader()}
                {renderTabs()}
                <div className="report-content" style={{ padding: '24px 2rem' }}>
                    <div className="report-container">
                        <StrategicInsightsSection active={activeTab === 'insights'} data={reportsData} />
                        <ExecutiveMatrixSection active={activeTab === 'matrix'} data={reportsData} />
                        <MarketHotspotsSection active={activeTab === 'market'} data={reportsData} />
                        <DebtDynamicsSection active={activeTab === 'revenue'} data={reportsData} />

                        <ActivitySection active={activeTab === 'activity'} data={reportsData.activity} />
                        <LeadStageSection active={activeTab === 'leads'} data={reportsData.leadStage} />
                        <VoiceSection active={activeTab === 'voice'} data={reportsData.voice} />
                        <MarketingSection active={activeTab === 'marketing'} data={reportsData.marketing} />
                        <FunnelSection active={activeTab === 'funnel'} data={reportsData.funnel} />
                        <SalesSection active={activeTab === 'sales'} data={reportsData.sales} />
                    </div>
                </div>
            </div>
        </section>
    );
};

// Strategic Insights Section
const StrategicInsightsSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <h2 style={{ marginBottom: '24px', fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-brain" style={{ color: 'var(--primary-color)' }}></i> AI-Driven Next Actions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                {data.smartActions.map((action, i) => (
                    <div key={i} className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', borderLeft: `6px solid ${action.priority === 'high' ? '#f59e0b' : action.priority === 'critical' ? '#ef4444' : '#3b82f6'}`, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px', background: action.priority === 'high' ? '#fef3c7' : action.priority === 'critical' ? '#fee2e2' : '#dbeafe', color: action.priority === 'high' ? '#92400e' : action.priority === 'critical' ? '#991b1b' : '#1e40af', textTransform: 'uppercase' }}>{action.priority}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>Impact: {action.impact}</span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#0f172a' }}>{action.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>{action.desc}</p>
                        <button style={{ marginTop: '15px', color: 'var(--primary-color)', border: 'none', background: 'transparent', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Execute Action <i className="fas fa-arrow-right" style={{ marginLeft: '5px' }}></i></button>
                    </div>
                ))}
            </div>

            <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-fire" style={{ marginRight: '10px', color: '#ef4444' }}></i>Financial Cash-Flow Forecast (Heatmap)</h3>
                <Chart
                    options={{
                        chart: { type: 'heatmap', toolbar: { show: false } },
                        dataLabels: { enabled: true },
                        colors: ["#008FFB"],
                        title: { text: 'Monthly Expected Collections Intensity' }
                    }}
                    series={data.revenueForecast.heatmap}
                    type="heatmap"
                    height={350}
                />
            </div>
        </div>
    );
};

// Executive Matrix Section
const ExecutiveMatrixSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-user-shield" style={{ marginRight: '10px', color: '#0891b2' }}></i>Agent Skill Matrix & Performance Radar</h3>
                    <Chart
                        options={{
                            chart: { type: 'radar', toolbar: { show: false } },
                            xaxis: { categories: data.radar.labels },
                            stroke: { width: 2 },
                            fill: { opacity: 0.2 },
                            markers: { size: 4 },
                            colors: ['#0891b2', '#f59e0b']
                        }}
                        series={data.radar.series}
                        type="radar"
                        height={400}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}>Buyer Persona</h3>
                        <Chart
                            options={{
                                labels: data.persona.labels,
                                colors: ['#3b82f6', '#10b981'],
                                legend: { position: 'bottom' }
                            }}
                            series={data.persona.series}
                            type="donut"
                            height={250}
                        />
                    </div>
                    <div className="chart-card" style={{ padding: '24px', background: '#0f172a', color: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                        <h4 style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '10px' }}>Matrix Recommendation</h4>
                        <p style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 }}>
                            "Agent Suraj is outperforming in follow-ups but show leakage in communication. Strategy: Pair Suraj with Varun for investor-led closing sessions."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Market Hotspots Section
const MarketHotspotsSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-map-marker-alt" style={{ marginRight: '10px', color: '#ef4444' }}></i>Sector Demand Density</h3>
                    <Chart
                        options={{
                            legend: { show: false },
                            chart: { type: 'treemap', toolbar: { show: false } },
                            colors: ['#0891b2', '#10b981', '#f59e0b', '#ef4444', '#6366f1']
                        }}
                        series={[data.hotspots.treemap]}
                        type="treemap"
                        height={400}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-comment-dots" style={{ marginRight: '10px', color: '#0891b2' }}></i>Omni-Channel Engagement (Response Intelligence)</h3>
                    <Chart
                        options={{
                            chart: { type: 'bubble', toolbar: { show: false } },
                            dataLabels: { enabled: false },
                            fill: { opacity: 0.8 },
                            xaxis: { tickAmount: 12, type: 'category', title: { text: 'Time of Day (Hour)' } },
                            yaxis: { max: 100, title: { text: 'Response Rate (%)' } }
                        }}
                        series={data.engagement.bubble}
                        type="bubble"
                        height={400}
                    />
                </div>
            </div>
        </div>
    );
};

// Debt Dynamics Section
const DebtDynamicsSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-stopwatch" style={{ marginRight: '10px', color: '#ef4444' }}></i>"Stuck Money" Aging Buckets</h3>
                    <Chart
                        options={{
                            plotOptions: { bar: { columnWidth: '50%', borderRadius: 8 } },
                            colors: ['#ef4444'],
                            xaxis: { categories: data.aging.categories }
                        }}
                        series={data.aging.series}
                        type="bar"
                        height={350}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-tachometer-alt" style={{ marginRight: '10px', color: '#10b981' }}></i>Conversion Velocity Dashboard</h3>
                    <Chart
                        options={{
                            chart: { type: 'radar', toolbar: { show: false } },
                            labels: data.velocity.labels,
                            fill: { opacity: 0.3, colors: ['#10b981'] },
                            xaxis: { categories: data.velocity.labels },
                            colors: ['#10b981']
                        }}
                        series={[{ name: 'Velocity %', data: data.velocity.series }]}
                        type="radar"
                        height={350}
                    />
                </div>
            </div>
        </div>
    );
};

// Activity Section
const ActivitySection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
                {data.kpis.map((kpi, i) => (
                    <div key={i} className="kpi-card" style={{ padding: '20px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>{kpi.label}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>{kpi.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-layer-group" style={{ marginRight: '10px', color: '#0891b2' }}></i>Daily Productivity</h3>
                    <Chart
                        options={{
                            chart: { stacked: true, toolbar: { show: false }, animations: { enabled: true } },
                            colors: ['#0891b2', '#10b981', '#f59e0b', '#ef4444'],
                            xaxis: { categories: data.stackedBar.categories },
                            legend: { position: 'top' },
                            plotOptions: { bar: { borderRadius: 4 } }
                        }}
                        series={data.stackedBar.series}
                        type="bar"
                        height={350}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-chart-line" style={{ marginRight: '10px', color: '#0891b2' }}></i>Activity Trend</h3>
                    <Chart
                        options={{
                            stroke: { curve: 'smooth', width: 3 },
                            colors: ['#0891b2'],
                            xaxis: { categories: data.lineTrend.categories },
                            markers: { size: 4 }
                        }}
                        series={data.lineTrend.series}
                        type="line"
                        height={350}
                    />
                </div>
            </div>
        </div>
    );
};

// Lead Stage Section
const LeadStageSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
                {data.alerts.map((alert, i) => (
                    <div key={i} style={{
                        padding: '20px',
                        background: '#fff',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: `4px solid ${alert.color === 'red' ? '#ef4444' : alert.color === 'green' ? '#10b981' : alert.color === 'orange' ? '#f59e0b' : '#3b82f6'}`
                    }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>{alert.label}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>{alert.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-chart-pie" style={{ marginRight: '10px', color: '#0891b2' }}></i>Lead Lifecycle</h3>
                    <Chart
                        options={{
                            labels: data.donut.labels,
                            colors: ['#3b82f6', '#10b981', '#f59e0b', '#064e3b'],
                            legend: { position: 'bottom' },
                            plotOptions: { pie: { donut: { size: '70%' } } }
                        }}
                        series={data.donut.series}
                        type="donut"
                        height={350}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-align-left" style={{ marginRight: '10px', color: '#0891b2' }}></i>Leads by Stage</h3>
                    <Chart
                        options={{
                            plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
                            colors: ['#0891b2'],
                            xaxis: { categories: data.bar.categories }
                        }}
                        series={data.bar.series}
                        type="bar"
                        height={350}
                    />
                </div>
            </div>
        </div>
    );
};

// Voice Section
const VoiceSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-users" style={{ marginRight: '10px', color: '#0891b2' }}></i>Call Count Per Agent</h3>
                    <Chart
                        options={{
                            colors: ['#0891b2'],
                            xaxis: { categories: data.bar.categories },
                            plotOptions: { bar: { borderRadius: 4, columnWidth: '40%' } }
                        }}
                        series={data.bar.series}
                        type="bar"
                        height={300}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}>Avg Call Duration</h3>
                    <Chart
                        options={{
                            plotOptions: {
                                radialBar: {
                                    startAngle: -135,
                                    endAngle: 135,
                                    hollow: { size: '70%' },
                                    dataLabels: { name: { show: false }, value: { fontSize: '2rem', fontWeight: 800 } }
                                }
                            },
                            colors: ['#10b981'],
                            labels: ['Duration']
                        }}
                        series={[data.gauge]}
                        type="radialBar"
                        height={300}
                    />
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Above Average by 12%</div>
                </div>
            </div>
        </div>
    );
};

// Marketing Section
const MarketingSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-bullhorn" style={{ marginRight: '10px', color: '#0891b2' }}></i>Leads by Source</h3>
                    <Chart
                        options={{
                            colors: ['#0891b2', '#10b981', '#f59e0b', '#ef4444'],
                            xaxis: { categories: data.bar.categories },
                            plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } }
                        }}
                        series={data.bar.series}
                        type="bar"
                        height={300}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-percentage" style={{ marginRight: '10px', color: '#0891b2' }}></i>Conversion %</h3>
                    <Chart
                        options={{
                            labels: data.donut.labels,
                            colors: ['#0891b2', '#10b981', '#f59e0b', '#ef4444', '#64748b'],
                            legend: { position: 'bottom' }
                        }}
                        series={data.donut.series}
                        type="donut"
                        height={300}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-chart-line" style={{ marginRight: '10px', color: '#0891b2' }}></i>Lead Trend</h3>
                    <Chart
                        options={{
                            stroke: { curve: 'smooth', width: 3 },
                            colors: ['#0891b2'],
                            xaxis: { categories: data.trend.categories }
                        }}
                        series={data.trend.series}
                        type="line"
                        height={300}
                    />
                </div>
            </div>
        </div>
    );
};

// Funnel Section
const FunnelSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
                {data.kpis.map((kpi, i) => (
                    <div key={i} className="kpi-card" style={{ padding: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>{kpi.label}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: i === 2 ? '#ef4444' : '#1e293b' }}>{kpi.value}</div>
                    </div>
                ))}
            </div>

            <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-filter" style={{ marginRight: '10px', color: '#0891b2' }}></i>Pipeline Funnel</h3>
                <Chart
                    options={{
                        plotOptions: { bar: { horizontal: true, barHeight: '80%', borderRadius: 4 } },
                        colors: ['#0891b2'],
                        xaxis: { categories: data.categories },
                        dataLabels: { enabled: true }
                    }}
                    series={data.series}
                    type="bar"
                    height={400}
                />
            </div>
        </div>
    );
};

// Sales Section
const SalesSection = ({ active, data }) => {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-chart-line" style={{ marginRight: '10px', color: '#0891b2' }}></i>Actual vs Forecasted Sales</h3>
                    <Chart
                        options={{
                            stroke: { width: [3, 3], dashArray: [0, 8] },
                            colors: ['#10b981', '#94a3b8'],
                            xaxis: { categories: data.line.categories },
                            legend: { position: 'top' }
                        }}
                        series={data.line.series}
                        type="line"
                        height={350}
                    />
                </div>
                <div className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}><i className="fas fa-user-tie" style={{ marginRight: '10px', color: '#0891b2' }}></i>Sales by Agent (₹ Cr)</h3>
                    <Chart
                        options={{
                            plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
                            colors: ['#0891b2'],
                            xaxis: { categories: data.bar.categories }
                        }}
                        series={data.bar.series}
                        type="bar"
                        height={350}
                    />
                </div>
            </div>
        </div>
    );
};

export default ReportsView;
