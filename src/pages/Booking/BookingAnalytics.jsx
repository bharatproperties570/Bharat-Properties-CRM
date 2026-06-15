import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import ReactApexChart from 'react-apexcharts';
import { api } from '../../utils/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
const fmtCurr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function BookingAnalytics() {
    const { isDark } = useTheme();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.get('/bookings/dashboard/stats');
                if (res.data.success) {
                    setStats(res.data.data);
                }
            } catch (e) {
                console.error("Failed to load analytics", e);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analytics...</div>;
    }

    if (!stats) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Failed to load analytics data.</div>;
    }

    // Chart Data Configs
    const funnelSeries = [{
        name: 'Deals',
        data: [stats.pendingCount, stats.bookedCount, stats.agreementCount, stats.registryCount]
    }];
    const funnelOptions = {
        chart: { type: 'bar', toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 4, horizontal: true, distributed: true } },
        colors: ['#cbd5e1', '#60a5fa', '#34d399', '#f59e0b'],
        dataLabels: { enabled: true, formatter: val => val, style: { fontSize: '12px', colors: ['#fff'] } },
        xaxis: { categories: ['Pending', 'Booked', 'Agreement', 'Registry'], labels: { style: { cssClass: 'text-xs text-slate-500' } } },
        yaxis: { labels: { style: { cssClass: 'text-sm font-semibold text-slate-700' } } },
        tooltip: { theme: 'light' },
        legend: { show: false }
    };

    const commSeries = [stats.totalCommissionReceived, stats.totalCommissionPending];
    const commOptions = {
        chart: { type: 'donut' },
        labels: ['Received', 'Pending'],
        colors: ['#10b981', '#f59e0b'],
        dataLabels: { enabled: true, formatter: (val) => Math.round(val) + "%" },
        plotOptions: { pie: { donut: { size: '70%', labels: { show: true, name: { show: true }, value: { show: true, formatter: val => fmtCurr(val) }, total: { show: true, showAlways: true, label: 'Total', formatter: () => fmtCurr(stats.totalCommission) } } } } },
        tooltip: { theme: 'light', y: { formatter: val => fmtCurr(val) } },
        legend: { position: 'bottom' }
    };

    const healthSeries = [
        stats.activeBookings - stats.atRiskCount, 
        stats.atRiskCount - stats.criticalCount, 
        stats.criticalCount
    ];
    const healthOptions = {
        chart: { type: 'pie' },
        labels: ['On Track', 'At Risk', 'Critical'],
        colors: ['#10b981', '#f59e0b', '#dc2626'],
        dataLabels: { enabled: true },
        tooltip: { theme: 'light' },
        legend: { position: 'bottom' }
    };

    return (
        <div style={{ padding: '24px 32px', background: 'var(--bg-gray)', minHeight: '100%' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '24px' }}>Analytics & Intelligence</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '24px' }}>
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Deal Pipeline Funnel</h3>
                    <div style={{ height: '280px' }}>
                        <ReactApexChart options={funnelOptions} series={funnelSeries} type="bar" height="100%" />
                    </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Commission Health</h3>
                    <div style={{ height: '280px' }}>
                        <ReactApexChart options={commOptions} series={commSeries} type="donut" height="100%" />
                    </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Portfolio Risk Profile</h3>
                    <div style={{ height: '280px' }}>
                        <ReactApexChart options={healthOptions} series={healthSeries} type="pie" height="100%" />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Financial Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ padding: '16px', background: 'var(--bg-gray)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Pipeline Value</div>
                            <div style={{ fontSize: '1.25rem', color: 'var(--text-main)', fontWeight: 800 }}>{fmtCurr(stats.totalPipelineValue)}</div>
                        </div>
                        <div style={{ padding: '16px', background: 'var(--bg-gray)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Paid Value</div>
                            <div style={{ fontSize: '1.25rem', color: '#10b981', fontWeight: 800 }}>{fmtCurr(stats.totalPaidValue)}</div>
                        </div>
                        <div style={{ padding: '16px', background: 'var(--bg-gray)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Average Deal Size</div>
                            <div style={{ fontSize: '1.25rem', color: '#0ea5e9', fontWeight: 800 }}>{fmtCurr(stats.totalPipelineValue / (stats.activeBookings || 1))}</div>
                        </div>
                        <div style={{ padding: '16px', background: 'var(--bg-gray)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Commission (Est)</div>
                            <div style={{ fontSize: '1.25rem', color: '#8b5cf6', fontWeight: 800 }}>{fmtCurr(stats.totalCommission)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
