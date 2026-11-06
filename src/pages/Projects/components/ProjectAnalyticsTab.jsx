import React, { useState, useEffect, useMemo } from 'react';
import Chart from 'react-apexcharts';
import { api } from '../../../utils/api';
import { formatIndianCurrency } from '../../../utils/numberToWords';

const ProjectAnalyticsTab = ({ projectId, inventoryData = [], dealsData = [] }) => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!projectId) return;
            setLoading(true);
            try {
                const res = await api.get(`projects/${projectId}/analytics`);
                if (res.data?.success) {
                    setAnalytics(res.data.data);
                }
            } catch (err) {
                console.error("Failed to load project analytics:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [projectId]);

    const cardStyle = {
        background: 'var(--bg-card)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)'
    };

    const sectionTitleStyle = {
        fontSize: '0.78rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    // 1. Sales Velocity Data
    const velocityChartData = useMemo(() => {
        const velocity = analytics?.salesVelocity || [];
        if (velocity.length > 0) {
            return {
                categories: velocity.map(v => v.month),
                series: [{ name: 'Units Closed', data: velocity.map(v => v.count) }]
            };
        }
        // Fallback: group closed deals from dealsData by month
        const monthlyCounts = {};
        dealsData.filter(d => d.stage === 'Closed' || d.stage === 'Closed Won').forEach(d => {
            const dateStr = d.stageChangedAt || d.updatedAt || d.createdAt;
            if (dateStr) {
                const m = dateStr.substring(0, 7);
                monthlyCounts[m] = (monthlyCounts[m] || 0) + 1;
            }
        });

        const sortedMonths = Object.keys(monthlyCounts).sort().slice(-6);
        if (sortedMonths.length > 0) {
            return {
                categories: sortedMonths,
                series: [{ name: 'Units Closed', data: sortedMonths.map(m => monthlyCounts[m]) }]
            };
        }

        return {
            categories: ['Recent'],
            series: [{ name: 'Units Closed', data: [dealsData.filter(d => d.stage === 'Closed' || d.stage === 'Closed Won').length] }]
        };
    }, [analytics, dealsData]);

    // 2. Price Trend Data
    const priceTrendData = useMemo(() => {
        const trend = analytics?.priceTrend || [];
        if (trend.length > 0) {
            return {
                categories: trend.map(t => t.month),
                series: [{ name: 'Avg Rate (₹)', data: trend.map(t => t.avgRate) }]
            };
        }
        return {
            categories: ['Current Benchmark'],
            series: [{ name: 'Avg Rate (₹)', data: [analytics?.deals?.avgRatePerUnit || 3500] }]
        };
    }, [analytics]);

    // 3. Stage Distribution
    const stageDistData = useMemo(() => {
        const stages = analytics?.stageDistribution || [];
        if (stages.length > 0) {
            return {
                labels: stages.map(s => s.stage || 'Unspecified'),
                series: stages.map(s => s.count || 0)
            };
        }
        const stageCounts = {};
        dealsData.forEach(d => {
            const st = d.stage || 'Open';
            stageCounts[st] = (stageCounts[st] || 0) + 1;
        });
        const labels = Object.keys(stageCounts);
        return {
            labels: labels.length > 0 ? labels : ['Open'],
            series: labels.length > 0 ? labels.map(l => stageCounts[l]) : [0]
        };
    }, [analytics, dealsData]);

    // 4. Inventory Allocation
    const inventoryDonutData = useMemo(() => {
        if (analytics?.inventory) {
            const { available, sold, hold, booked } = analytics.inventory;
            return {
                labels: ['Available Stock', 'Sold Out', 'Hold / Booking'],
                series: [available || 0, sold || 0, (hold || 0) + (booked || 0)],
                colors: ['#10b981', '#ef4444', '#f59e0b']
            };
        }

        let avail = 0, sld = 0, hld = 0;
        inventoryData.forEach(item => {
            const rawStatus = (item.status && typeof item.status === 'object' && item.status.lookup_value)
                ? item.status.lookup_value
                : (typeof item.status === 'string' ? item.status : '');
            const lower = rawStatus.toLowerCase();
            if (lower.includes('available')) avail++;
            else if (lower.includes('sold')) sld++;
            else hld++;
        });

        return {
            labels: ['Available Stock', 'Sold Out', 'Hold / Other'],
            series: [avail, sld, hld],
            colors: ['#10b981', '#ef4444', '#f59e0b']
        };
    }, [analytics, inventoryData]);

    return (
        <div className="project-analytics-tab" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Revenue Summary Card */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px'
            }}>
                <div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Total Realized Revenue
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                        {formatIndianCurrency(analytics?.deals?.totalRealizedRevenue || 0)}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>From closed deal registrations</span>
                </div>

                <div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Weighted Pipeline Value
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0284c7', marginTop: '2px' }}>
                        {formatIndianCurrency(analytics?.deals?.totalPipelineValue || 0)}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>From {analytics?.deals?.active || 0} active negotiations</span>
                </div>

                <div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Average Ticket Size
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '2px' }}>
                        {formatIndianCurrency(analytics?.deals?.avgDealValue || 0)}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Per deal transaction average</span>
                </div>

                <div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Average Rate Realized
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#7c3aed', marginTop: '2px' }}>
                        {analytics?.deals?.avgRatePerUnit ? `₹${analytics.deals.avgRatePerUnit.toLocaleString('en-IN')}` : '--'}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Per sq.unit indexed value</span>
                </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '10px' }}>
                {/* 1. Sales Velocity */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <h4 style={sectionTitleStyle}>
                            <i className="fas fa-chart-line text-emerald-500"></i> Sales Velocity Trend (Monthly Closures)
                        </h4>
                    </div>
                    <div style={{ height: '240px', padding: '16px' }}>
                        <Chart
                            options={{
                                chart: { toolbar: { show: false } },
                                stroke: { curve: 'smooth', width: 3 },
                                colors: ['#10b981'],
                                xaxis: {
                                    categories: velocityChartData.categories,
                                    labels: { style: { fontSize: '10px', colors: 'var(--text-muted)' } }
                                },
                                yaxis: {
                                    labels: { style: { fontSize: '10px', colors: 'var(--text-muted)' } }
                                },
                                tooltip: { theme: 'dark' },
                                grid: { borderColor: 'var(--border-color)', strokeDashArray: 3 }
                            }}
                            series={velocityChartData.series}
                            type="line"
                            height="100%"
                        />
                    </div>
                </div>

                {/* 2. Price Trend */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <h4 style={sectionTitleStyle}>
                            <i className="fas fa-arrow-trend-up text-blue-500"></i> Benchmark Rate Movement (₹ / Sq.Unit)
                        </h4>
                    </div>
                    <div style={{ height: '240px', padding: '16px' }}>
                        <Chart
                            options={{
                                chart: { toolbar: { show: false } },
                                stroke: { curve: 'stepline', width: 3 },
                                colors: ['#3b82f6'],
                                xaxis: {
                                    categories: priceTrendData.categories,
                                    labels: { style: { fontSize: '10px', colors: 'var(--text-muted)' } }
                                },
                                yaxis: {
                                    labels: { style: { fontSize: '10px', colors: 'var(--text-muted)' } }
                                },
                                tooltip: { theme: 'dark' },
                                grid: { borderColor: 'var(--border-color)', strokeDashArray: 3 }
                            }}
                            series={priceTrendData.series}
                            type="line"
                            height="100%"
                        />
                    </div>
                </div>

                {/* 3. Stage Distribution */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <h4 style={sectionTitleStyle}>
                            <i className="fas fa-pie-chart text-indigo-500"></i> Deal Pipeline Stages
                        </h4>
                    </div>
                    <div style={{ height: '240px', padding: '16px' }}>
                        <Chart
                            options={{
                                labels: stageDistData.labels,
                                colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'],
                                legend: { position: 'bottom', fontSize: '11px', labels: { colors: 'var(--text-main)' } },
                                plotOptions: { pie: { donut: { size: '65%' } } }
                            }}
                            series={stageDistData.series}
                            type="donut"
                            height="100%"
                        />
                    </div>
                </div>

                {/* 4. Inventory Status Allocation */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <h4 style={sectionTitleStyle}>
                            <i className="fas fa-boxes-stacked text-purple-500"></i> Inventory Allocation Mix
                        </h4>
                    </div>
                    <div style={{ height: '240px', padding: '16px' }}>
                        <Chart
                            options={{
                                labels: inventoryDonutData.labels,
                                colors: inventoryDonutData.colors,
                                legend: { position: 'bottom', fontSize: '11px', labels: { colors: 'var(--text-main)' } },
                                plotOptions: { pie: { donut: { size: '65%' } } }
                            }}
                            series={inventoryDonutData.series}
                            type="donut"
                            height="100%"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectAnalyticsTab;
