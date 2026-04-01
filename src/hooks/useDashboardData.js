import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../utils/api';
import { useUserContext } from '../context/UserContext';

export const useDashboardData = () => {
    const { users, teams } = useUserContext();
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (selectedFilter !== 'all') {
                const isTeam = teams?.some(t => t.id === selectedFilter || t._id === selectedFilter);
                if (isTeam) params.teamId = selectedFilter;
                else params.userId = selectedFilter;
            }
            const response = await api.get('/dashboard/stats', { params });
            if (response.data.success) {
                setDashboardData(response.data.data);
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Dashboard fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedFilter, teams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Formatters
    const fmtCr = (v) => {
        if (!v || v === 0) return '₹0';
        if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
        if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
        if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
        return `₹${v}`;
    };

    const fmtNum = (v) => new Intl.NumberFormat('en-IN').format(v || 0);

    // Derived Data
    const d = dashboardData || {};
    const perf = d.performance || {};
    const activities = d.activities || {};
    const leads = d.leads || [];
    const deals = d.deals || [];
    const inventory = d.inventoryHealth || [];
    const agenda = d.agenda || { tasks: [], siteVisits: [] };
    const aiAlerts = d.aiAlertHub || {};
    const suggestions = d.autoSuggestions || {};
    const actFeed = d.recentActivityFeed || [];
    const recentDeals = d.recentDeals || [];
    const trends = d.trends || { leads: 0, deals: 0, revenue: 0, inventory: 0 };
    const leadSourceStats = useMemo(() => d.leadSourceStats || [], [d.leadSourceStats]);
    const reengagedCount = d.reengagedCount || 0;
    const nfaCount = d.nfaCount || 0;
    const availability = d.availability || { totalIn: 0, totalNotIn: 0, totalOnLeave: 0 };
    const mtdVisits = d.mtdVisits || [];
    const mtdBookings = d.mtdBookings || [];
    
    const totalLeads = leads.reduce((s, l) => s + l.count, 0);
    const totalDeals = deals.reduce((s, d) => s + d.count, 0);
    const totalInventory = inventory.reduce((s, i) => s + i.count, 0);
    const hotLeads = leads.find(l => l.status === 'PROSPECT')?.count || 0;

    const allAlerts = [
        ...(aiAlerts.followupFailure || []),
        ...(aiAlerts.hotLeads || []),
        ...(aiAlerts.stuckDeals || []),
        ...(aiAlerts.inventory || [])
    ];

    const allSuggestions = [
        ...(suggestions.leads || []),
        ...(suggestions.performance || []),
        ...(suggestions.pipeline || []),
        ...(suggestions.strategy || [])
    ];

    // Chart Memoizations
    const leadTrendChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false }, sparkline: { enabled: false } },
            stroke: { curve: 'smooth', width: 3 },
            colors: ['#6366f1'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] } },
            xaxis: { categories: d.leadTrend?.categories || [], axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
            yaxis: { show: false },
            grid: { show: false },
            markers: { size: 0 },
            tooltip: { theme: 'dark' }
        },
        series: d.leadTrend?.series || [{ name: 'Leads', data: [] }]
    }), [d.leadTrend]);

    const cashFlowChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false } },
            stroke: { curve: 'smooth', width: 2 },
            colors: ['#10b981'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] } },
            xaxis: { categories: d.cashFlowProjection?.categories || [], axisBorder: { show: false }, labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
            yaxis: { labels: { formatter: v => fmtCr(v), style: { colors: '#94a3b8', fontSize: '10px' } } },
            grid: { borderColor: 'rgba(148, 163, 184, 0.1)', strokeDashArray: 4 },
            tooltip: { theme: 'dark', y: { formatter: v => fmtCr(v) } }
        },
        series: d.cashFlowProjection?.series || [{ name: 'Commission', data: [] }]
    }), [d.cashFlowProjection]);

    const sourceChart = useMemo(() => ({
        options: {
            labels: leadSourceStats.map(s => s?.source || 'Other'),
            colors: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'],
            legend: { show: false },
            stroke: { show: false },
            plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, label: 'Total', fontSize: '12px', color: '#94a3b8', formatter: () => totalLeads } } } } },
            dataLabels: { enabled: false },
            tooltip: { theme: 'dark' }
        },
        series: leadSourceStats.map(s => s?.count || 0)
    }), [leadSourceStats, totalLeads]);

    const activityTypeChart = useMemo(() => ({
        options: {
            chart: { toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
            colors: ['#6366f1'],
            xaxis: { categories: (d.activityTypeBreakdown || []).map(a => a._id || 'Other'), labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
            grid: { show: false },
            dataLabels: { enabled: false },
            tooltip: { theme: 'dark' }
        },
        series: [{ name: 'Activities', data: (d.activityTypeBreakdown || []).map(a => a.count) }]
    }), [d.activityTypeBreakdown]);

    return {
        selectedFilter,
        setSelectedFilter,
        loading,
        lastRefresh,
        fetchData,
        users,
        teams,
        metrics: {
            totalLeads, hotLeads, totalDeals, totalInventory,
            perf, activities, reengagedCount, nfaCount,
            availability, mtdVisits, mtdBookings,
            leads, deals, inventory, agenda, allAlerts,
            allSuggestions, actFeed, recentDeals, leadSourceStats,
            trends
        },
        charts: {
            leadTrendChart,
            cashFlowChart,
            sourceChart,
            activityTypeChart
        },
        formatters: {
            fmtCr,
            fmtNum
        }
    };
};
