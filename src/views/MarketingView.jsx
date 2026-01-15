import React, { useState } from 'react';
import { mockCampaigns } from '../data/mockData';
import { getSourceBadgeClass } from '../utils/helpers';

function MarketingView({ onNavigate }) {
    const [activeTab, setActiveTab] = useState('online');
    const filteredCampaigns = mockCampaigns[activeTab] || [];
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const tabs = [
        { id: 'online', label: 'ONLINE CAMPAIGN' },
        { id: 'offline', label: 'OFFLINE CAMPAIGN' },
        { id: 'organic', label: 'ORGANIC CAMPAIGN' }
    ];

    return (
        <section id="marketingView" className="view-section active">
            <div className="view-scroll-wrapper">
                {/* Header */}
                <div className="page-header marketing-header">
                    <div className="page-title-group">
                        <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                        <div className="tabs-container">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="header-actions">
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
                                        <i className="fas fa-sms"></i> Create SMS Campaign
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fas fa-envelope"></i> Create Email Campaign
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-whatsapp"></i> Create WhatsApp Campaign
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fas fa-comment-dots"></i> Create RCS Campaign
                                    </a>
                                    <div className="dropdown-divider" style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }}></div>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-facebook" style={{ color: '#1877F2' }}></i> Create Meta Ads
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-google" style={{ color: '#EA4335' }}></i> Create Google Ads
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-linkedin" style={{ color: '#0A66C2' }}></i> Create LinkedIn Campaign
                                    </a>
                                    <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); onNavigate('wizard'); }}>
                                        <i className="fab fa-x-twitter"></i> Create X (Twitter) Ad
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    <div className="toolbar-container" style={{ display: 'flex', flexDirection: 'column', gap: '0', background: '#fff', padding: 0 }}>
                        <div className="search-bar-row" style={{ padding: '15px 25px', borderBottom: '1px solid #eef2f5' }}>
                            <div className="search-min">
                                <i className="fas fa-search"></i>
                                <input type="text" placeholder="Search campaign..." />
                            </div>
                            <div className="sort-select">
                                Sort by Name <i className="fas fa-chevron-down"></i>
                            </div>
                        </div>
                    </div>

                    <div id="campaignTableContainer" style={{ padding: '0 25px' }}>
                        <table className="campaign-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: '65px', zIndex: 10, background: '#f8fafc' }}>
                                {activeTab === 'online' && (
                                    <tr>
                                        <th>#</th>
                                        <th>NAME</th>
                                        <th>SOURCE</th>
                                        <th>CAMPAIGNS</th>
                                        <th>LEADS</th>
                                        <th>GENERATED DATE</th>
                                        <th>ACTION</th>
                                    </tr>
                                )}
                                {activeTab === 'offline' && (
                                    <tr>
                                        <th>#</th>
                                        <th>NAME & DESCRIPTION</th>
                                        <th>CONTACT</th>
                                        <th>EVENT TYPE</th>
                                        <th>STATUS</th>
                                        <th>COST</th>
                                        <th>DELIVERED DATE</th>
                                        <th>CREATED DATE</th>
                                        <th>ACTION</th>
                                    </tr>
                                )}
                                {activeTab === 'organic' && (
                                    <tr>
                                        <th>#</th>
                                        <th>CAMPAIGN NAME</th>
                                        <th>SOURCE</th>
                                        <th>CREATED DATE</th>
                                        <th>ACTION</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {filteredCampaigns.length > 0 ? filteredCampaigns.map(c => (
                                    <tr key={c.id}>
                                        {activeTab === 'online' && (
                                            <>
                                                <td>{c.id}</td>
                                                <td><strong>{c.name}</strong></td>
                                                <td><span className={`source-badge ${getSourceBadgeClass(c.source)}`}>{c.source}</span></td>
                                                <td style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{c.campaigns}</td>
                                                <td style={{ fontWeight: 700, color: '#388E3C' }}>{c.leads}</td>
                                                <td>{c.date}</td>
                                                <td><ActionMenu /></td>
                                            </>
                                        )}
                                        {activeTab === 'offline' && (
                                            <>
                                                <td>{c.id}</td>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.desc}</div>
                                                </td>
                                                <td>{c.contact}</td>
                                                <td><span className={`source-badge ${getSourceBadgeClass(c.event)}`}>{c.event}</span></td>
                                                <td><strong>{c.status}</strong></td>
                                                <td style={{ fontWeight: 600 }}>{c.cost}</td>
                                                <td>{c.delivered}</td>
                                                <td>{c.created}</td>
                                                <td><ActionMenu /></td>
                                            </>
                                        )}
                                        {activeTab === 'organic' && (
                                            <>
                                                <td>{c.id}</td>
                                                <td><strong>{c.name}</strong></td>
                                                <td><span className={`source-badge ${getSourceBadgeClass(c.source)}`}>{c.source}</span></td>
                                                <td>{c.date}</td>
                                                <td><ActionMenu /></td>
                                            </>
                                        )}
                                    </tr>
                                )) : (
                                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: '2rem' }}>No campaigns found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="summary-footer">
                <div className="summary-label">Summary</div>
                {activeTab === 'online' ? (
                    <>
                        <div className="summary-stats">Campaigns <span className="stat-val">{filteredCampaigns.length}</span></div>
                        <div className="summary-stats">Leads <span className="stat-val">{filteredCampaigns.reduce((acc, c) => acc + (c.leads || 0), 0)}</span></div>
                    </>
                ) : (
                    <>
                        <div className="summary-stats">List <span className="stat-val">{filteredCampaigns.length}</span></div>
                        <div className="summary-stats">Contact <span className="stat-val">1199</span></div>
                        <div className="summary-stats">Other <span className="stat-val">899</span></div>
                    </>
                )}
            </footer>
        </section>
    );
}

function ActionMenu() {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="row-action-wrapper">
            <button className="row-action-btn" onClick={() => setIsOpen(!isOpen)}><i className="fas fa-ellipsis-v"></i></button>
            <div className={`row-action-menu ${isOpen ? 'show' : ''}`} onMouseLeave={() => setIsOpen(false)}>
                <a href="#"><i className="fas fa-edit"></i> Edit</a>
                <a href="#"><i className="fas fa-eye"></i> View Leads</a>
                <a href="#"><i className="fas fa-pause-circle"></i> Pause</a>
                <a href="#" style={{ color: 'var(--danger-color)' }}><i className="fas fa-trash-alt"></i> Delete</a>
            </div>
        </div>
    )
}

export default MarketingView;
