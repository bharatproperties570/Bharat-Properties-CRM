import React, { useState, useMemo } from 'react';
import { marketingData, calculateGlobalKPIs, generateAIInsights } from '../../data/marketingData';

function MarketingPage({ onNavigate }) {
    const [activeTab, setActiveTab] = useState('online');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [showAIInsights, setShowAIInsights] = useState(true);

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
                    padding: '20px 2rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        gap: '20px'
                    }}>
                        {[
                            { label: 'Total Spend', value: formatINR(globalKPIs.totalSpend), icon: 'fas fa-rupee-sign', color: '#ef4444' },
                            { label: 'Total Leads', value: globalKPIs.totalLeads, icon: 'fas fa-users', color: '#10b981' },
                            { label: 'Avg CPL', value: formatINR(globalKPIs.avgCPL), icon: 'fas fa-chart-line', color: '#f59e0b' },
                            { label: 'Site Visits', value: globalKPIs.totalSiteVisits, icon: 'fas fa-eye', color: '#8b5cf6' },
                            { label: 'Deals Closed', value: globalKPIs.totalDeals, icon: 'fas fa-handshake', color: '#06b6d4' },
                            { label: 'Revenue', value: formatINR(globalKPIs.totalRevenue), icon: 'fas fa-coins', color: '#10b981' },
                            { label: 'ROI', value: `${globalKPIs.roi}%`, icon: 'fas fa-percentage', color: parseFloat(globalKPIs.roi) > 0 ? '#10b981' : '#ef4444' }
                        ].map((kpi, idx) => (
                            <div key={idx} style={{
                                background: 'rgba(255,255,255,0.15)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '12px',
                                padding: '16px',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        background: kpi.color,
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <i className={kpi.icon} style={{ color: '#fff', fontSize: '0.9rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {kpi.label}
                                        </div>
                                        <div style={{ fontSize: '1.4rem', color: '#fff', fontWeight: 900, marginTop: '2px' }}>
                                            {kpi.value}
                                        </div>
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
                                    borderLeft: `4px solid ${
                                        insight.type === 'warning' ? '#f59e0b' :
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

                    {/* Simple Campaign List */}
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
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{c.name}</h3>
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                            {activeTab === 'online' && (
                                                <>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        <i className={getPlatformIcon(c.platform)} style={{ color: getPlatformColor(c.platform), marginRight: '6px' }}></i>
                                                        {c.platform}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>💰 Spend: <strong>{formatINR(c.totalSpend)}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>👥 Leads: <strong>{c.leadsGenerated}</strong></span>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>🤝 Deals: <strong>{c.dealsClosed}</strong></span>
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
