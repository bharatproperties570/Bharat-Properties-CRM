import React, { useState, useMemo } from 'react';
import { marketingData, calculateGlobalKPIs, generateAIInsights } from '../../data/marketingData';

function MarketingPage({ onNavigate }) {
    const [activeTab, setActiveTab] = useState('online');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [showAIInsights, setShowAIInsights] = useState(true);
    const [expandedCampaign, setExpandedCampaign] = useState(null);

    const globalKPIs = useMemo(() =>
        calculateGlobalKPIs(marketingData.online, marketingData.offline, marketingData.organic),
        []
    );

    const aiInsights = useMemo(() =>
        generateAIInsights(marketingData.online, marketingData.offline),
        []
    );

    const getROIColor = (roi) => {
        const roiNum = parseFloat(roi);
        if (roiNum > 50) return { bg: '#dcfce7', color: '#166534' };
        if (roiNum > 0) return { bg: '#fef3c7', color: '#92400e' };
        return { bg: '#fee2e2', color: '#991b1b' };
    };

    const getPlatformIcon = (platform) => {
        const icons = {
            'Google Ads': 'fab fa-google',
            'Facebook': 'fab fa-facebook',
            'Instagram': 'fab fa-instagram',
            'LinkedIn': 'fab fa-linkedin'
        };
        return icons[platform] || 'fas fa-bullhorn';
    };

    const getPlatformColor = (platform) => {
        const colors = {
            'Google Ads': '#EA4335',
            'Facebook': '#1877F2',
            'Instagram': '#E4405F',
            'LinkedIn': '#0A66C2'
        };
        return colors[platform] || '#64748b';
    };

    const tabs = [
        { id: 'online', label: 'ONLINE CAMPAIGN', icon: 'fas fa-globe' },
        { id: 'offline', label: 'OFFLINE CAMPAIGN', icon: 'fas fa-bullhorn' },
        { id: 'organic', label: 'ORGANIC CAMPAIGN', icon: 'fas fa-seedling' }
    ];

    const formatINR = (amount) => `₹${amount.toLocaleString('en-IN')}`;
    const filteredCampaigns = marketingData[activeTab] || [];

    return (
        <section id="marketingView" className="view-section active">
            <div className="view-scroll-wrapper">
                {/* Sticky KPI Summary Bar */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                    background: 'linear-gradient(135deg, #1273eb 0%, #0d5bb9 100%)',
                    padding: '18px 2rem 20px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                    {/* Row 1: Primary Financial Metrics */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '12px',
                        marginBottom: '12px'
                    }}>
                        {[
                            { label: 'Total Spend', value: formatINR(globalKPIs.totalSpend), icon: 'fas fa-rupee-sign', color: '#ef4444', sub: `${globalKPIs.budgetUtilization}% of budget` },
                            { label: 'Revenue', value: formatINR(globalKPIs.totalRevenue), icon: 'fas fa-coins', color: '#10b981', sub: `₹${(globalKPIs.avgDealSize || 0).toLocaleString('en-IN')} avg` },
                            { label: 'ROI', value: `${globalKPIs.roi}%`, icon: 'fas fa-percentage', color: parseFloat(globalKPIs.roi) > 0 ? '#10b981' : '#ef4444', sub: globalKPIs.roi > 100 ? 'Excellent' : 'Good' },
                            { label: 'CAC', value: formatINR(globalKPIs.globalCAC), icon: 'fas fa-user-tag', color: '#f59e0b', sub: 'Cost per customer' },
                            { label: 'LTV:CAC', value: globalKPIs.ltvCacRatio, icon: 'fas fa-balance-scale', color: parseFloat(globalKPIs.ltvCacRatio) >= 3 ? '#10b981' : '#f59e0b', sub: parseFloat(globalKPIs.ltvCacRatio) >= 3 ? 'Healthy' : 'Needs work' }
                        ].map((kpi, idx) => (
                            <div key={idx} style={{
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        background: kpi.color,
                                        borderRadius: '7px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <i className={kpi.icon} style={{ color: '#fff', fontSize: '0.85rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {kpi.label}
                                        </div>
                                        <div style={{ fontSize: '1.3rem', color: '#fff', fontWeight: 900, marginTop: '1px', lineHeight: 1 }}>
                                            {kpi.value}
                                        </div>
                                        {kpi.sub && (
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
                                                {kpi.sub}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Row 2: Lead & Conversion Metrics */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '12px'
                    }}>
                        {[
                            { label: 'Total Leads', value: globalKPIs.totalLeads, icon: 'fas fa-users', color: '#10b981', sub: `${globalKPIs.totalMQL} MQL / ${globalKPIs.totalSQL} SQL` },
                            { label: 'Avg CPL', value: formatINR(globalKPIs.avgCPL), icon: 'fas fa-chart-line', color: '#f59e0b', sub: 'Per lead cost' },
                            { label: 'Site Visits', value: globalKPIs.totalSiteVisits, icon: 'fas fa-eye', color: '#8b5cf6', sub: 'Property visits' },
                            { label: 'Deals Closed', value: globalKPIs.totalDeals, icon: 'fas fa-handshake', color: '#06b6d4', sub: `${globalKPIs.conversionRate}% conversion` },
                            { label: 'Budget Status', value: `₹${(globalKPIs.budgetRemaining || 0).toLocaleString('en-IN')}`, icon: 'fas fa-wallet', color: globalKPIs.budgetRemaining > 0 ? '#10b981' : '#ef4444', sub: 'Remaining' }
                        ].map((kpi, idx) => (
                            <div key={idx} style={{
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        background: kpi.color,
                                        borderRadius: '7px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <i className={kpi.icon} style={{ color: '#fff', fontSize: '0.85rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {kpi.label}
                                        </div>
                                        <div style={{ fontSize: '1.3rem', color: '#fff', fontWeight: 900, marginTop: '1px', lineHeight: 1 }}>
                                            {kpi.value}
                                        </div>
                                        {kpi.sub && (
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
                                                {kpi.sub}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Header with Tabs */}
                <div className="page-header marketing-header" style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <div className="page-title-group">
                        <i className="fas fa-chart-bar" style={{ color: 'var(--primary-color)', fontSize: '1.2rem' }}></i>
                        <div className="tabs-container">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <i className={tab.icon}></i>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="header-actions">
                        <button
                            className="btn-outline"
                            onClick={() => setShowAIInsights(!showAIInsights)}
                            style={{ marginRight: '10px' }}
                        >
                            <i className="fas fa-brain"></i> AI Insights
                        </button>
                        <div className="create-campaign-dropdown">
                            <button
                                className="btn-primary create-campaign-btn"
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                            >
                                CREATE CAMPAIGN <i className="fas fa-caret-down"></i>
                            </button>
                            {dropdownOpen && (
                                <div className="dropdown-menu show" style={{ display: 'block' }}>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-google" style={{ color: '#EA4335' }}></i> Create Google Ads
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-facebook" style={{ color: '#1877F2' }}></i> Create Meta Ads
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-linkedin" style={{ color: '#0A66C2' }}></i> Create LinkedIn Campaign
                                    </a>
                                    <div className="dropdown-divider" style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }}></div>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fas fa-sms"></i> Create SMS Campaign
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fas fa-envelope"></i> Create Email Campaign
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AI Insights Panel */}
                {showAIInsights && aiInsights.length > 0 && (
                    <div style={{ padding: '1.5rem 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <i className="fas fa-brain" style={{ color: '#fff', fontSize: '1.1rem' }}></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>AI Marketing Insights</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Actionable recommendations based on campaign performance</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '12px' }}>
                            {aiInsights.map((insight, idx) => (
                                <div key={idx} style={{
                                    background: '#fff',
                                    borderRadius: '8px',
                                    padding: '14px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderLeft: `4px solid ${insight.type === 'warning' ? '#f59e0b' :
                                        insight.type === 'critical' ? '#ef4444' :
                                            insight.type === 'success' ? '#10b981' : '#3b82f6'
                                        }`
                                }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {insight.campaign}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>
                                        {insight.message}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                                        💡 {insight.action}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Content Body */}
                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Campaign Count */}
                    <div style={{ padding: '16px 2rem', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>
                            Showing {filteredCampaigns.length} campaigns
                        </span>
                    </div>

                    {/* Simple Campaign Cards */}
                    <div style={{ padding: '0 2rem 2rem' }}>
                        {filteredCampaigns.map((c, idx) => (
                            <div key={c.id} style={{
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '16px',
                                marginTop: '12px',
                                transition: 'all 0.2s'
                            }}
                                onMouseOver={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                                onMouseOut={(e) => e.currentTarget.style.boxShadow = 'none'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{c.name}</h3>
                                            {/* Performance Score Badge */}
                                            {activeTab === 'online' && c.performanceScore !== undefined && (
                                                <div style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    background: c.healthStatus.bg,
                                                    border: `1px solid ${c.healthStatus.color}`
                                                }}>
                                                    <i className="fas fa-chart-line" style={{ fontSize: '0.75rem', color: c.healthStatus.color }}></i>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.healthStatus.color }}>
                                                        {c.performanceScore}/100
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: c.healthStatus.color }}>
                                                        {c.healthStatus.label}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                            {activeTab === 'online' && (
                                                <>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        <i className={getPlatformIcon(c.platform)} style={{ color: getPlatformColor(c.platform), marginRight: '6px' }}></i>
                                                        {c.platform}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        💰 Spend: <strong>{formatINR(c.totalSpend)}</strong>
                                                        <span style={{
                                                            marginLeft: '6px',
                                                            fontSize: '0.75rem',
                                                            color: parseFloat(c.budgetUtilization) > 90 ? '#ef4444' : '#10b981'
                                                        }}>
                                                            ({c.budgetUtilization}%)
                                                        </span>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        👥 Leads: <strong>{c.leadsGenerated}</strong>
                                                        <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: '#8b5cf6' }}>
                                                            ({c.qualificationRate}% qual)
                                                        </span>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        📊 MQL/SQL: <strong>{c.mqlCount}/{c.sqlCount}</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        💵 CPL: <strong>{formatINR(c.costPerLead)}</strong>
                                                        <span style={{
                                                            marginLeft: '4px',
                                                            fontSize: '0.75rem',
                                                            color: c.costPerLead > c.benchmarkCPL ? '#ef4444' : '#10b981'
                                                        }}>
                                                            (Benchmark: ₹{c.benchmarkCPL.toLocaleString('en-IN')})
                                                        </span>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        🎯 CAC: <strong>{formatINR(c.cac)}</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        💎 LTV: <strong>{formatINR(c.ltv)}</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem' }}>
                                                        LTV:CAC: <strong style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            background: parseFloat(c.ltvCacRatio) >= 3 ? '#dcfce7' : '#fef3c7',
                                                            color: parseFloat(c.ltvCacRatio) >= 3 ? '#10b981' : '#f59e0b'
                                                        }}>{c.ltvCacRatio}:1</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        🤝 Deals: <strong>{c.dealsClosed}</strong>
                                                        <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: '#06b6d4' }}>
                                                            ({c.conversionRate}% conv)
                                                        </span>
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem' }}>
                                                        ROI: <strong style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            background: getROIColor(c.roi).bg,
                                                            color: getROIColor(c.roi).color
                                                        }}>{c.roi}%</strong>
                                                    </span>
                                                </>
                                            )}
                                            {activeTab === 'offline' && (
                                                <>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>📍 {c.type}</span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>💰 Cost: <strong>{formatINR(c.totalCost)}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>📞 Calls: <strong>{c.incomingCalls}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>👥 Walk-ins: <strong>{c.walkIns}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>🤝 Deals: <strong>{c.dealsClosed}</strong></span>
                                                    <span style={{ fontSize: '0.85rem' }}>
                                                        ROI: <strong style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            background: getROIColor(c.roi()).bg,
                                                            color: getROIColor(c.roi()).color
                                                        }}>{c.roi()}%</strong>
                                                    </span>
                                                </>
                                            )}
                                            {activeTab === 'organic' && (
                                                <>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>📡 {c.source}</span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>👁️ Views: <strong>{c.views.toLocaleString('en-IN')}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>👆 Clicks: <strong>{c.clicks.toLocaleString('en-IN')}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>👥 Leads: <strong>{c.leadsGenerated}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>✅ Assisted: <strong>{c.assistedDeals}</strong></span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <ActionMenu />
                                </div>

                                {/* Property Performance Section - Expandable */}
                                {activeTab === 'online' && c.propertyPerformance && c.propertyPerformance.length > 0 && (
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                        <button
                                            onClick={() => setExpandedCampaign(expandedCampaign === c.id ? null : c.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#1273eb',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: 0
                                            }}>
                                            <i className={`fas fa-chevron-${expandedCampaign === c.id ? 'up' : 'down'}`}></i>
                                            🏢 Property Performance ({c.propertyPerformance.length} properties)
                                        </button>

                                        {expandedCampaign === c.id && (
                                            <div style={{ marginTop: '12px' }}>
                                                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Property</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Leads</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Visits</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Deals</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Revenue</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Conv %</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {c.propertyPerformance.map((prop, pidx) => (
                                                            <tr key={pidx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '10px 8px', color: '#1e293b', fontWeight: 500 }}>
                                                                    {prop.propertyName}
                                                                </td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', color: '#64748b' }}>
                                                                    {prop.leadsGenerated}
                                                                </td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', color: '#64748b' }}>
                                                                    {prop.siteVisits}
                                                                </td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                                                    {prop.dealsClosed}
                                                                </td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>
                                                                    {formatINR(prop.revenue)}
                                                                </td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: prop.dealsClosed > 0 ? '#10b981' : '#94a3b8' }}>
                                                                    {((prop.dealsClosed / prop.leadsGenerated) * 100).toFixed(1)}%
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {/* Real Estate Insights */}
                                                {(c.topPerformingSector || c.competitorActivity || c.seasonalTrend) && (
                                                    <div style={{ marginTop: '12px', display: 'flex', gap: '16px', fontSize: '0.75rem' }}>
                                                        {c.topPerformingSector && (
                                                            <div style={{ background: '#f0fdf4', padding: '6px 12px', borderRadius: '6px', color: '#166534' }}>
                                                                📍 Sector: <strong>{c.topPerformingSector}</strong>
                                                            </div>
                                                        )}
                                                        {c.competitorActivity && (
                                                            <div style={{
                                                                background: c.competitorActivity === 'High' ? '#fef2f2' : c.competitorActivity === 'Medium' ? '#fffbeb' : '#f0f9ff',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                color: c.competitorActivity === 'High' ? '#991b1b' : c.competitorActivity === 'Medium' ? '#92400e' : '#1e40af'
                                                            }}>
                                                                🏁 Competition: <strong>{c.competitorActivity}</strong>
                                                            </div>
                                                        )}
                                                        {c.seasonalTrend && (
                                                            <div style={{ background: '#f5f3ff', padding: '6px 12px', borderRadius: '6px', color: '#5b21b6' }}>
                                                                📈 Trend: <strong>{c.seasonalTrend}</strong>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="summary-footer" style={{
                padding: '16px 2rem',
                background: '#f8fafc',
                borderTop: '2px solid #e2e8f0',
                display: 'flex',
                gap: '2rem'
            }}>
                <div className="summary-label">Summary</div>
                <div className="summary-stats">Campaigns <span className="stat-val">{filteredCampaigns.length}</span></div>
                {activeTab === 'online' && (
                    <>
                        <div className="summary-stats">Total Leads <span className="stat-val" style={{ color: '#10b981' }}>
                            {filteredCampaigns.reduce((sum, c) => sum + c.leadsGenerated, 0)}
                        </span></div>
                        <div className="summary-stats">Total Deals <span className="stat-val" style={{ color: '#3b82f6' }}>
                            {filteredCampaigns.reduce((sum, c) => sum + c.dealsClosed, 0)}
                        </span></div>
                    </>
                )}
            </footer>
        </section>
    );
}

function ActionMenu() {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer'
                }}
            >
                <i className="fas fa-ellipsis-v" style={{ color: '#64748b' }}></i>
            </button>
            {isOpen && (
                <div
                    onMouseLeave={() => setIsOpen(false)}
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        minWidth: '180px',
                        zIndex: 1000,
                        marginTop: '4px',
                        padding: '6px'
                    }}
                >
                    {[
                        { icon: 'fas fa-chart-bar', label: 'View Dashboard', color: '#3b82f6' },
                        { icon: 'fas fa-users', label: 'View Leads', color: '#10b981' },
                        { icon: 'fas fa-edit', label: 'Edit Campaign', color: '#64748b' },
                        { icon: 'fas fa-trash-alt', label: 'Delete', color: '#ef4444' }
                    ].map((item, idx) => (
                        <a
                            key={idx}
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 12px',
                                color: item.color,
                                textDecoration: 'none',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 600
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <i className={item.icon} style={{ width: '16px' }}></i>
                            {item.label}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

export default MarketingPage;
