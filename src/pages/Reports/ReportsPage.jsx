import React, { useState, useEffect, useMemo } from 'react';
import Chart from 'react-apexcharts';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { pricingAPI, POSITIONING_CONFIG, TREND_CONFIG, formatINRFull } from '../../utils/pricingAPI';

const ReportsPage = () => {
    const [activeTab, setActiveTab] = useState('insights');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const response = await api.get('/dashboard/stats');
            if (response.data && response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching reports data:', error);
            toast.error('Failed to load report data');
        } finally {
            setLoading(false);
        }
    };


    // Mapping live stats to expected reportsData structure
    const reportsData = useMemo(() => ({
        smartActions: [
            { title: 'Project Health Alert', desc: `Inventory health is at ${stats?.inventoryHealth?.healthScore || 0}%`, priority: 'high', impact: 'Medium' },
            { title: 'Sales Performance', desc: `${stats?.performance?.salesPerformance?.length || 0} agents active this period`, priority: 'normal', impact: 'High' }
        ],
        revenueForecast: { heatmap: [] },
        radar: { labels: ['Follow-ups', 'Closings', 'Prospecting', 'Communication', 'Technical'], series: stats?.performance?.salesPerformance?.slice(0, 2).map(s => ({ name: s.agent, data: [80, 70, 90, 60, 75] })) || [] },
        persona: { labels: ['Investor', 'End User'], series: [65, 35] },
        hotspots: { treemap: { data: stats?.inventoryHealth?.statusStats?.map(s => ({ x: s.status, y: s.count })) || [] } },
        engagement: { bubble: [] },
        aging: { categories: ['0-15 Days', '16-30 Days', '31-60 Days', '60+ Days'], series: [{ name: 'Leads', data: [30, 40, 45, 50] }] },
        velocity: { labels: ['Discovery', 'Qualification', 'Proposal', 'Negotiation', 'Closing'], series: [80, 70, 60, 50, 40] },
        activity: {
            kpis: [
                { label: 'Total Calls', value: stats?.activityCounts?.Calls || 0 },
                { label: 'Meetings', value: stats?.activityCounts?.Meetings || 0 },
                { label: 'Site Visits', value: stats?.activityCounts?.SiteVisits || 0 },
                { label: 'Proposals', value: stats?.activityCounts?.Proposals || 0 }
            ],
            stackedBar: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], series: [] },
            lineTrend: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], series: [] }
        },
        leadStage: {
            alerts: [
                { label: 'Hot Leads', value: stats?.leads?.leadsByStage?.find(s => s.stage === 'Hot')?.count || 0, color: 'red' },
                { label: 'Active Pipeline', value: stats?.leads?.totalLeads || 0, color: 'blue' },
                { label: 'Trial Closings', value: 12, color: 'orange' },
                { label: 'Won Deals', value: stats?.deals?.totalDeals || 0, color: 'green' }
            ],
            donut: {
                labels: stats?.leads?.leadsByStage?.map(s => s.stage) || [],
                series: stats?.leads?.leadsByStage?.map(s => s.count) || []
            },
            bar: {
                categories: stats?.leads?.leadsByStage?.map(s => s.stage) || [],
                series: [{ name: 'Leads', data: stats?.leads?.leadsByStage?.map(s => s.count) || [] }]
            }
        },
        voice: {
            bar: {
                categories: stats?.performance?.salesPerformance?.map(p => p.agent) || [],
                series: [{ name: 'Calls', data: stats?.performance?.salesPerformance?.map(p => p.agent) ? stats?.performance?.salesPerformance?.map(p => p.count) : [] }]
            },
            gauge: 75
        },
        marketing: {
            bar: { categories: [], series: [] },
            donut: { labels: [], series: [] },
            trend: { categories: [], series: [] }
        },
        funnel: {
            kpis: [
                { label: 'Lead to Visit', value: '24%' },
                { label: 'Visit to Booking', value: '18%' },
                { label: 'Avg Closing Time', value: '14 Days' }
            ],
            categories: stats?.leads?.leadsByStage?.map(s => s.stage) || [],
            series: [{ name: 'Count', data: stats?.leads?.leadsByStage?.map(s => s.count) || [] }]
        },
        sales: {
            line: { categories: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Actual', data: stats?.performance?.salesPerformance?.map(p => p.totalValue) || [] }] },
            bar: {
                categories: stats?.performance?.salesPerformance?.map(p => p.agent) || [],
                series: [{ name: 'Value', data: stats?.performance?.salesPerformance?.map(p => p.totalValue) || [] }]
            }
        }
    }), [stats]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
                <p style={{ fontWeight: 600 }}>Synthesizing Business Analytics...</p>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }


    const sections = [
        { id: 'insights', label: 'Strategic Insights', icon: 'fa-brain' },
        { id: 'matrix', label: 'Executive Matrix', icon: 'fa-shield-alt' },
        { id: 'market', label: 'Market Hotspots', icon: 'fa-map-marked-alt' },
        { id: 'price_intel', label: 'Price Intelligence', icon: 'fa-chart-bar' },
        { id: 'revenue', label: 'Debt Dynamics', icon: 'fa-coins' },
        { id: 'activity', label: 'Activity Reports', icon: 'fa-tasks' },
        { id: 'leads', label: 'Lead Analysis', icon: 'fa-filter' },
        { id: 'voice', label: 'Call & Voice', icon: 'fa-phone-alt' },
        { id: 'marketing', label: 'Marketing ROI', icon: 'fa-bullhorn' },
        { id: 'funnel', label: 'Pipeline Funnel', icon: 'fa-funnel-dollar' },
        { id: 'sales', label: 'Sales Performance', icon: 'fa-award' },
    ];

    return (
        <section id="reportsView" className="view-section active" style={{ background: '#f8fafc', minHeight: '100vh' }}>
            <div className="view-scroll-wrapper">
                <HeaderSection />
                <TabsSection activeTab={activeTab} onTabChange={setActiveTab} sections={sections} />
                <div className="report-content" style={{ padding: '24px 2rem' }}>
                    <div className="report-container">
                        <StrategicInsightsSection active={activeTab === 'insights'} data={reportsData} />
                        <ExecutiveMatrixSection active={activeTab === 'matrix'} data={reportsData} />
                        <MarketHotspotsSection active={activeTab === 'market'} data={reportsData} />
                        <MarketAnalyticsSection active={activeTab === 'price_intel'} />
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

const HeaderSection = React.memo(function HeaderSection() {
    return (
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
});
HeaderSection.displayName = 'HeaderSection';


const TabsSection = React.memo(function TabsSection({ activeTab, onTabChange, sections }) {
    return (
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
                onClick={() => onTabChange(section.id)}
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
});
TabsSection.displayName = 'TabsSection';


// Strategic Insights Section
const StrategicInsightsSection = React.memo(function StrategicInsightsSection({ active, data }) {
    if (!active) return null;
    return (
        <div className="report-grid animate-in">
            <h2 style={{ marginBottom: '24px', fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-brain" style={{ color: 'var(--primary-color)' }}></i> AI-Driven Next Actions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                {data.smartActions.length > 0 ? data.smartActions.map((action, i) => (
                    <div key={i} className="chart-card" style={{ padding: '24px', background: '#fff', borderRadius: '16px', borderLeft: `6px solid ${action.priority === 'high' ? '#f59e0b' : action.priority === 'critical' ? '#ef4444' : '#3b82f6'}`, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px', background: action.priority === 'high' ? '#fef3c7' : action.priority === 'critical' ? '#fee2e2' : '#dbeafe', color: action.priority === 'high' ? '#92400e' : action.priority === 'critical' ? '#991b1b' : '#1e40af', textTransform: 'uppercase' }}>{action.priority}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>Impact: {action.impact}</span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#0f172a' }}>{action.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>{action.desc}</p>
                        <button style={{ marginTop: '15px', color: 'var(--primary-color)', border: 'none', background: 'transparent', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Execute Action <i className="fas fa-arrow-right" style={{ marginLeft: '5px' }}></i></button>
                    </div>
                )) : (
                    <div style={{ gridColumn: 'span 3', padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '16px', color: '#64748b' }}>
                        No AI-driven actions available at this time.
                    </div>
                )}
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
});
StrategicInsightsSection.displayName = 'StrategicInsightsSection';


// Executive Matrix Section
const ExecutiveMatrixSection = React.memo(function ExecutiveMatrixSection({ active, data }) {
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
});
ExecutiveMatrixSection.displayName = 'ExecutiveMatrixSection';


// Market Hotspots Section
const MarketHotspotsSection = React.memo(function MarketHotspotsSection({ active, data }) {
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
});
MarketHotspotsSection.displayName = 'MarketHotspotsSection';


// Debt Dynamics Section
const DebtDynamicsSection = React.memo(function DebtDynamicsSection({ active, data }) {
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
});
DebtDynamicsSection.displayName = 'DebtDynamicsSection';


// Activity Section
const ActivitySection = React.memo(function ActivitySection({ active, data }) {
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
});
ActivitySection.displayName = 'ActivitySection';


// Lead Stage Section
const LeadStageSection = React.memo(function LeadStageSection({ active, data }) {
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
});
LeadStageSection.displayName = 'LeadStageSection';


// Voice Section
const VoiceSection = React.memo(function VoiceSection({ active, data }) {
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
});
VoiceSection.displayName = 'VoiceSection';


// Marketing Section
const MarketingSection = React.memo(function MarketingSection({ active, data }) {
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
});
MarketingSection.displayName = 'MarketingSection';


// Funnel Section
const FunnelSection = React.memo(function FunnelSection({ active, data }) {
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
});
FunnelSection.displayName = 'FunnelSection';


// Sales Section
const SalesSection = React.memo(function SalesSection({ active, data }) {
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
});
SalesSection.displayName = 'SalesSection';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARKET ANALYTICS SECTION — Price Intelligence Reports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const AREA_UNIT_LABELS = {
    PER_SQ_FT:  'per Sq.Ft.',
    PER_SQ_YD:  'per Sq.Yd.',
    PER_KANAL:  'per Kanal',
    PER_ACRE:   'per Acre',
    PER_MARLA:  'per Marla',
};

const MarketAnalyticsSection = React.memo(function MarketAnalyticsSection({ active }) {
    const [pulse, setPulse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [aggregating, setAggregating] = useState(false);
    const [activeView, setActiveView] = useState('hot');

    useEffect(() => {
        if (!active) return;
        setLoading(true);
        pricingAPI.getMarketPulse({ limit: 10 })
            .then(res => { if (res.status === 'success') setPulse(res.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [active]);

    if (!active) return null;

    const handleAggregate = () => {
        setAggregating(true);
        toast.promise(
            pricingAPI.aggregate({ trailingDays: 90 })
                .then(res => {
                    return pricingAPI.getMarketPulse({ limit: 10 });
                })
                .then(res => {
                    if (res.status === 'success') setPulse(res.data);
                }),
            {
                loading: 'Running market benchmark aggregation (90 days)…',
                success: 'Benchmarks updated! Market pulse is fresh.',
                error: 'Aggregation failed. Check backend logs.'
            }
        ).finally(() => setAggregating(false));
    };

    // Build chart series from pulse data
    const hotLocations = pulse?.hotMarkets || [];
    const stableLocations = pulse?.stableMarkets || [];
    const downLocations = pulse?.downMarkets || [];

    const allLocations = [...hotLocations, ...stableLocations, ...downLocations];
    const trendChartOptions = {
        chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '60%' } },
        colors: allLocations.map(m => m.trend === 'upward' ? '#16a34a' : m.trend === 'downward' ? '#dc2626' : '#d97706'),
        xaxis: { categories: allLocations.map(m => `${m.location} (${m.subCategory})`), labels: { style: { fontSize: '0.7rem' } } },
        dataLabels: { enabled: true, formatter: (v) => `${v >= 0 ? '+' : ''}${v?.toFixed(1)}%` },
        tooltip: { y: { formatter: (v) => `${v >= 0 ? '+' : ''}${v?.toFixed(1)}% trend` } },
        legend: { show: false },
        grid: { borderColor: '#f1f5f9' },
    };

    const rateChartOptions = {
        chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
        colors: ['#4f46e5'],
        xaxis: { categories: allLocations.slice(0, 8).map(m => m.location.split(',')[0]), labels: { style: { fontSize: '0.7rem' } } },
        yaxis: { labels: { formatter: (v) => `₹${(v / 1000).toFixed(0)}K` } },
        dataLabels: { enabled: false },
        grid: { borderColor: '#f1f5f9' },
    };

    const positioningDonutOptions = {
        labels: ['Undervalued', 'Fair Value', 'Overpriced', 'No Data'],
        colors: ['#2563eb', '#16a34a', '#dc2626', '#cbd5e1'],
        chart: { type: 'donut', fontFamily: 'Inter, sans-serif' },
        legend: { position: 'bottom', fontSize: '12px' },
        plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Properties Analyzed', fontSize: '12px' } } } } },
        dataLabels: { enabled: false },
    };

    return (
        <div className="report-grid animate-in">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-brain" style={{ color: '#fff', fontSize: '1rem' }} />
                        </span>
                        Price Intelligence Analytics
                    </h2>
                    <p style={{ margin: '6px 0 0 52px', fontSize: '0.8rem', color: '#64748b' }}>
                        Market-level price benchmarks · Orientation premium analysis · Deal price journey insights
                    </p>
                </div>
                <button
                    onClick={handleAggregate}
                    disabled={aggregating}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                        background: aggregating ? '#e2e8f0' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                        color: aggregating ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: '0.82rem',
                    }}
                >
                    <i className={`fas fa-sync-alt ${aggregating ? 'fa-spin' : ''}`} />
                    {aggregating ? 'Aggregating…' : 'Refresh Benchmarks (90d)'}
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <div>Loading market intelligence…</div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            ) : !pulse || allLocations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: '20px', border: '1px dashed #e2e8f0' }}>
                    <i className="fas fa-chart-bar" style={{ fontSize: '3rem', color: '#e2e8f0', display: 'block', marginBottom: '16px' }} />
                    <h3 style={{ color: '#374151', margin: '0 0 8px' }}>No Market Benchmarks Yet</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px' }}>
                        Click "Refresh Benchmarks" to aggregate closed deals (minimum 3 closed deals per location required).
                    </p>
                </div>
            ) : (
                <>
                    {/* KPI Summary Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
                        {[
                            { label: 'Hot Markets', value: hotLocations.length, icon: 'fa-fire', color: '#16a34a', bg: '#f0fdf4' },
                            { label: 'Stable Markets', value: stableLocations.length, icon: 'fa-minus', color: '#d97706', bg: '#fffbeb' },
                            { label: 'Declining Markets', value: downLocations.length, icon: 'fa-arrow-trend-down', color: '#dc2626', bg: '#fef2f2' },
                            { label: 'Total Benchmarks', value: allLocations.length, icon: 'fa-database', color: '#4f46e5', bg: '#f0f0ff' },
                        ].map((kpi, i) => (
                            <div key={i} style={{ padding: '20px', background: kpi.bg, borderRadius: '14px', border: `1px solid ${kpi.color}20` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <i className={`fas ${kpi.icon}`} style={{ color: kpi.color }} />
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{kpi.label}</span>
                                </div>
                                <div style={{ fontSize: '2rem', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Charts Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
                        {/* Trend Chart */}
                        <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-chart-line" style={{ color: '#4f46e5' }} />
                                Market Trend by Location
                            </h3>
                            {allLocations.length > 0 ? (
                                <Chart
                                    options={trendChartOptions}
                                    series={[{ name: 'Trend %', data: allLocations.map(m => m.trendPct || 0) }]}
                                    type="bar"
                                    height={Math.max(300, allLocations.length * 35)}
                                />
                            ) : (
                                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data</div>
                            )}
                        </div>

                        {/* Rate Per Unit Chart */}
                        <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-rupee-sign" style={{ color: '#4f46e5' }} />
                                Avg Closed Rate per Unit (Top 8)
                            </h3>
                            {allLocations.length > 0 ? (
                                <Chart
                                    options={rateChartOptions}
                                    series={[{ name: 'Avg Rate', data: allLocations.slice(0, 8).map(m => m.avgClosedRPU || 0) }]}
                                    type="bar"
                                    height={300}
                                />
                            ) : (
                                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data</div>
                            )}
                        </div>
                    </div>

                    {/* Benchmark Table */}
                    <div style={{ background: '#fff', borderRadius: '18px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        {/* Tab switcher */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 24px', background: '#fafbff' }}>
                            {['hot', 'stable', 'down'].map(t => (
                                <button key={t} onClick={() => setActiveView(t)} style={{
                                    padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize',
                                    color: activeView === t ? '#4f46e5' : '#94a3b8',
                                    borderBottom: activeView === t ? '2px solid #4f46e5' : '2px solid transparent',
                                }}>
                                    {t === 'hot' ? '🔥 Hot Markets' : t === 'stable' ? '➡️ Stable' : '📉 Declining'}
                                    <span style={{ marginLeft: '8px', fontSize: '0.65rem', color: '#94a3b8' }}>
                                        ({(t === 'hot' ? hotLocations : t === 'stable' ? stableLocations : downLocations).length})
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div style={{ padding: '0 24px 20px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        {['Location', 'Sub-Category', 'Avg Rate', 'Unit', 'Trend', 'Deals', 'Negotiation Gap'].map(h => (
                                            <th key={h} style={{ padding: '12px 0', textAlign: 'left', fontWeight: 700, fontSize: '0.67rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(activeView === 'hot' ? hotLocations : activeView === 'stable' ? stableLocations : downLocations).map((m, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                            <td style={{ padding: '12px 0', fontWeight: 700, color: '#1e293b' }}>{m.location}</td>
                                            <td style={{ padding: '12px 0', color: '#64748b' }}>{m.subCategory}</td>
                                            <td style={{ padding: '12px 0', fontWeight: 800, color: '#0f172a' }}>{formatINRFull(m.avgClosedRPU)}</td>
                                            <td style={{ padding: '12px 0', color: '#94a3b8', fontSize: '0.72rem' }}>{AREA_UNIT_LABELS[m.areaUnit] || ''}</td>
                                            <td style={{ padding: '12px 0' }}>
                                                <span style={{
                                                    padding: '3px 9px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800,
                                                    background: m.trend === 'upward' ? '#f0fdf4' : m.trend === 'downward' ? '#fef2f2' : '#fffbeb',
                                                    color: m.trend === 'upward' ? '#16a34a' : m.trend === 'downward' ? '#dc2626' : '#d97706',
                                                }}>
                                                    {m.trendPct >= 0 ? '+' : ''}{m.trendPct?.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 0', color: '#64748b' }}>{m.dealCount}</td>
                                            <td style={{ padding: '12px 0', color: m.avgNegotiationGapPct > 5 ? '#dc2626' : '#64748b', fontWeight: m.avgNegotiationGapPct > 5 ? 700 : 400 }}>
                                                {m.avgNegotiationGapPct !== null && m.avgNegotiationGapPct !== undefined
                                                    ? `${m.avgNegotiationGapPct.toFixed(1)}%`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    {(activeView === 'hot' ? hotLocations : activeView === 'stable' ? stableLocations : downLocations).length === 0 && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                No data for this category. Run "Refresh Benchmarks" first.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});
MarketAnalyticsSection.displayName = 'MarketAnalyticsSection';


export default ReportsPage;

