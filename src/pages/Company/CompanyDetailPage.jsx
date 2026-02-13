import React, { useState, useEffect, useCallback } from 'react';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';
import { getInitials } from '../../utils/helpers';
import Chart from 'react-apexcharts';

const CompanyDetailPage = ({ companyId, onBack, onNavigate, onAddActivity, onAddProject, onAddInventory, onAddDeal, onAddContact }) => {
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activity');
    const [projectsData, setProjectsData] = useState([]);
    const [dealsData, setDealsData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const [stats, setStats] = useState({
        totalProjects: 0,
        totalInventory: 0,
        totalDeals: 0,
        closedRevenue: 0
    });

    const fetchCompanyDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`companies/${companyId}`);
            if (response.data && response.data.success) {
                const data = response.data.data;
                setCompany(data);

                // Fetch associated data in parallel
                fetchAssociatedData(data);
            } else {
                toast.error("Failed to load company details");
            }
        } catch (error) {
            console.error("Error fetching company:", error);
            toast.error("Error loading company profile");
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const fetchAssociatedData = async (companyData) => {
        try {
            // 1. Fetch Projects (where this company is the developer)
            const projRes = await api.get(`projects?developerId=${companyId}`);
            const projects = projRes.data?.data || [];
            setProjectsData(projects);

            // 2. Fetch Deals (where company is CP or linked via project)
            // For now, let's fetch deals related to these projects
            let deals = [];
            if (projects.length > 0) {
                const projectIds = projects.map(p => p._id).join(',');
                const dealsRes = await api.get(`deals?projectIds=${projectIds}`);
                deals = dealsRes.data?.records || [];
            }
            setDealsData(deals);

            // 3. Fetch Inventory for these projects
            let inventory = [];
            if (projects.length > 0) {
                const projectIds = projects.map(p => p._id).join(',');
                const invRes = await api.get(`inventory?projectIds=${projectIds}`);
                inventory = invRes.data?.data || [];
            }
            setInventoryData(inventory);

            // Calculate Stats
            const closedRevenue = deals
                .filter(d => d.stage === 'Closed')
                .reduce((acc, d) => acc + (d.price || 0), 0);

            setStats({
                totalProjects: projects.length,
                totalInventory: inventory.length,
                totalDeals: deals.length,
                closedRevenue
            });

        } catch (err) {
            console.error("Error fetching associated company data:", err);
        }
    };

    useEffect(() => {
        fetchCompanyDetails();
    }, [fetchCompanyDetails]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>Syncing Enterprise Profile...</span>
        </div>
    );

    if (!company) return <div className="error-state">Company record not found</div>;

    const cardStyle = {
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff'
    };

    const sectionTitleStyle = {
        fontSize: '0.9rem',
        fontWeight: 800,
        color: '#1e293b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    };

    const metricStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '0 20px',
        borderRight: '1px solid #e2e8f0'
    };

    return (
        <div className="company-detail-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '60px' }}>
            {/* 1️⃣ STICKY COMPANY HEADER */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 1000,
                background: '#fff', borderBottom: '1px solid #e2e8f0',
                padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', backdropFilter: 'blur(8px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: '1px solid #e2e8f0',
                        borderRadius: '10px', width: '40px', height: '40px',
                        cursor: 'pointer', color: '#64748b'
                    }}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>{company.name}</h1>
                            <span style={{
                                background: '#f1f5f9', color: '#475569',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase'
                            }}>
                                {renderValue(company.companyType)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#64748b', fontSize: '0.75rem' }}>
                            <span><i className="fas fa-industry" style={{ marginRight: '6px' }}></i>{renderValue(company.industry)}</span>
                            {company.gstNumber && <span><i className="fas fa-file-invoice" style={{ marginRight: '6px' }}></i>GST: {company.gstNumber}</span>}
                            <span><i className="fas fa-bullhorn" style={{ marginRight: '6px' }}></i>{renderValue(company.source)}</span>
                        </div>
                    </div>
                </div>

                {/* Metrics Row */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={metricStyle}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Projects</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{stats.totalProjects}</span>
                    </div>
                    <div style={metricStyle}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Inventory</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{stats.totalInventory}</span>
                    </div>
                    <div style={metricStyle}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Deals</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{stats.totalDeals}</span>
                    </div>
                    <div style={{ ...metricStyle, borderRight: 'none' }}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Closed Revenue</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>{formatIndianCurrency(stats.closedRevenue)}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.75rem' }}>Action <i className="fas fa-chevron-down" style={{ marginLeft: '8px' }}></i></button>
                </div>
            </header>

            <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
                {/* 2️⃣ MAIN CONTENT */}
                <div>
                    {/* Card 1: Company Overview */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-info-circle" style={{ color: '#3b82f6' }}></i> Company Overview</h2>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            <div>
                                <DetailItem label="Company Type" value={renderValue(company.companyType)} />
                                <DetailItem label="Industry" value={renderValue(company.industry)} />
                                <DetailItem label="Description" value={company.description || "No description provided."} />
                                <DetailItem label="GST Number" value={company.gstNumber || 'N/A'} />
                            </div>
                            <div>
                                <DetailItem label="Primary Phone" value={company.phones?.[0] ? `${company.phones[0].phoneCode} ${company.phones[0].phoneNumber}` : 'N/A'} />
                                <DetailItem label="Primary Email" value={company.emails?.[0]?.address || 'N/A'} />
                                <DetailItem label="Assigned Owner" value={renderValue(company.owner)} />
                                <DetailItem label="Team" value={company.team || 'Sales'} />
                                <DetailItem label="Visibility" value={company.visibleTo || 'Everyone'} />
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Office Locations */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-map-marked-alt" style={{ color: '#ef4444' }}></i> Office Locations</h2>
                        </div>
                        <div style={{ padding: '0 20px' }}>
                            <OfficeLocations addresses={company.addresses} />
                        </div>
                    </div>

                    {/* Card 3: Employees */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-users" style={{ color: '#8e44ad' }}></i> Employees & Authorized Signatories</h2>
                            <button className="btn-outline" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Add New</button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {company.employees?.length > 0 ? company.employees.map((emp, i) => (
                                    <EmployeeCard key={i} employee={emp} />
                                )) : (
                                    <div style={{ textAlign: 'center', gridColumn: '1/-1', padding: '20px', color: '#94a3b8' }}>No linked employees found.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Linked Projects */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-city" style={{ color: '#f59e0b' }}></i> Linked Projects</h2>
                            <button className="btn-outline" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => onAddProject()}>Add Project</button>
                        </div>
                        <div style={{ padding: '0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={tableHeaderStyle}>Project Name</th>
                                        <th style={tableHeaderStyle}>Location</th>
                                        <th style={tableHeaderStyle}>Launch Status</th>
                                        <th style={tableHeaderStyle}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projectsData.length > 0 ? projectsData.slice(0, 5).map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={tableCellStyle}><strong>{p.name}</strong></td>
                                            <td style={tableCellStyle}>{p.address?.locality || p.address?.area || 'N/A'}</td>
                                            <td style={tableCellStyle}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#ecfdf5', color: '#065f46', fontSize: '0.65rem', fontWeight: 700 }}>{p.status || 'Active'}</span>
                                            </td>
                                            <td style={tableCellStyle}>
                                                <button onClick={() => onNavigate('project-detail', p._id)} style={{ border: 'none', background: 'none', color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>View</button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No projects registered under this developer.</td></tr>
                                    )}
                                </tbody>
                            </table>
                            {projectsData.length > 5 && (
                                <div style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                                    <button className="btn-ghost" style={{ fontSize: '0.75rem', fontWeight: 700 }}>View All {projectsData.length} Projects</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card 5: Linked Inventory */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-boxes" style={{ color: '#6366f1' }}></i> Linked Inventory</h2>
                        </div>
                        <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '30px' }}>
                            <InventoryMetric label="Total Units" value={stats.totalInventory} />
                            <InventoryMetric label="Available" value={inventoryData.filter(i => i.status === 'Available').length} color="#3b82f6" />
                            <InventoryMetric label="Sold" value={inventoryData.filter(i => i.status === 'Sold Out').length} color="#10b981" />
                            <InventoryMetric label="Under Offer" value={inventoryData.filter(i => i.status === 'Booked').length} color="#f59e0b" />
                        </div>
                        <div style={{ padding: '0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                                    <tr>
                                        <th style={tableHeaderStyle}>Unit</th>
                                        <th style={tableHeaderStyle}>Project</th>
                                        <th style={tableHeaderStyle}>Status</th>
                                        <th style={tableHeaderStyle}>Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventoryData.slice(0, 5).map((inv, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={tableCellStyle}><strong>{inv.unitNo || inv.unitNumber}</strong></td>
                                            <td style={tableCellStyle}>{inv.projectName}</td>
                                            <td style={tableCellStyle}>
                                                <span style={{
                                                    padding: '2px 6px', borderRadius: '4px',
                                                    background: inv.status === 'Available' ? '#dcfce7' : '#fee2e2',
                                                    color: inv.status === 'Available' ? '#166534' : '#991b1b',
                                                    fontWeight: 700, fontSize: '0.6rem'
                                                }}>{inv.status}</span>
                                            </td>
                                            <td style={tableCellStyle}><strong>{formatIndianCurrency(inv.price)}</strong></td>
                                        </tr>
                                    ))}
                                    {inventoryData.length === 0 && (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No linked inventory.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Card 6: Deal Performance */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-handshake" style={{ color: '#10b981' }}></i> Deal Performance</h2>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
                                <MetricBox label="Total Deals" value={stats.totalDeals} color="#3b82f6" />
                                <MetricBox label="Active Deals" value={dealsData.filter(d => d.stage !== 'Closed' && d.stage !== 'Cancelled').length} color="#6366f1" />
                                <MetricBox label="Closed Deals" value={dealsData.filter(d => d.stage === 'Closed').length} color="#10b981" />
                                <MetricBox label="Total Revenue" value={formatIndianCurrency(stats.closedRevenue)} color="#059669" />
                            </div>
                            {/* Pipeline Summary */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>
                                    <span>PIPELINE HEALTH</span>
                                    <span>CONVERSION: {stats.totalDeals > 0 ? Math.round((dealsData.filter(d => d.stage === 'Closed').length / stats.totalDeals) * 100) : 0}%</span>
                                </div>
                                <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', overflow: 'hidden' }}>
                                    <div style={{ width: '40%', background: '#3b82f6' }} title="Negotiation"></div>
                                    <div style={{ width: '20%', background: '#6366f1' }} title="Booked"></div>
                                    <div style={{ width: '30%', background: '#10b981' }} title="Closed"></div>
                                    <div style={{ width: '10%', background: '#f43f5e' }} title="Cancelled"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 7: Relationship Intelligence */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h2 style={sectionTitleStyle}><i className="fas fa-brain" style={{ color: '#3b82f6' }}></i> Relationship Intelligence</h2>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' }}>
                            <DetailItem label="Relationship Type" value={<span style={{ fontWeight: 800, color: '#3b82f6' }}>{company.relationshipType || 'Developer'}</span>} />
                            <DetailItem label="Commission Agreement" value={company.commissionAgreementStatus || 'Active'} />
                            <DetailItem label="Preferred Partner" value={company.isPreferredPartner ? 'Yes ✅' : 'No'} />
                            <DetailItem label="Credit Limit" value={formatIndianCurrency(company.creditLimit || 0)} />
                            <DetailItem label="Outstanding Amount" value={<span style={{ color: '#ef4444' }}>{formatIndianCurrency(company.outstandingAmount || 0)}</span>} />
                            <DetailItem label="Partner Score" value="92/100" />
                        </div>
                    </div>
                </div>

                {/* 3️⃣ RIGHT SIDEBAR */}
                <aside>
                    <div style={{ position: 'sticky', top: '90px' }}>
                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h2 style={sectionTitleStyle}>System Details</h2>
                            </div>
                            <div style={{ padding: '20px' }}>
                                <SidebarItem label="Created Date" value={new Date(company.createdAt).toLocaleDateString()} />
                                <SidebarItem label="Last Updated" value={new Date(company.updatedAt).toLocaleDateString()} />
                                <SidebarItem label="Created By" value={renderValue(company.owner)} />
                                <SidebarItem label="Sync Status" value="Online" color="#10b981" />
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h2 style={sectionTitleStyle}>Business Summary</h2>
                            </div>
                            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <SummaryBlock label="Projects" value={stats.totalProjects} />
                                <SummaryBlock label="Units" value={stats.totalInventory} />
                                <SummaryBlock label="Deals" value={stats.totalDeals} />
                                <SummaryBlock label="Rev (₹)" value={stats.closedRevenue > 10000000 ? (stats.closedRevenue / 10000000).toFixed(2) + 'Cr' : stats.closedRevenue} />
                            </div>
                        </div>

                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h2 style={sectionTitleStyle}>Quick Actions</h2>
                            </div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <QuickActionBtn icon="plus" label="Add Project" onClick={() => onAddProject()} />
                                <QuickActionBtn icon="key" label="Add Inventory" onClick={() => onAddInventory()} />
                                <QuickActionBtn icon="hand-holding-usd" label="Add Deal" onClick={() => onAddDeal()} />
                                <QuickActionBtn icon="user-plus" label="Add Contact" onClick={() => onAddContact()} />
                                <QuickActionBtn icon="file-upload" label="Upload Doc" />
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            {/* 4️⃣ TABS SECTION */}
            <div style={{ padding: '0 32px' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', gap: '40px' }}>
                    <TabBtn active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} label="Activity Timeline" icon="history" />
                    <TabBtn active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} label="Projects" icon="city" />
                    <TabBtn active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Inventory" icon="boxes" />
                    <TabBtn active={activeTab === 'deals'} onClick={() => setActiveTab('deals')} label="Deals" icon="agreement" />
                    <TabBtn active={activeTab === 'financials'} onClick={() => setActiveTab('financials')} label="Financial Overview" icon="chart-line" />
                </div>

                <div style={{ minHeight: '300px' }}>
                    {activeTab === 'activity' && <ActivityTimeline />}
                    {activeTab === 'projects' && <DataList items={projectsData} type="project" onNavigate={onNavigate} />}
                    {activeTab === 'inventory' && <DataList items={inventoryData} type="inventory" onNavigate={onNavigate} />}
                    {activeTab === 'deals' && <DataList items={dealsData} type="deal" onNavigate={onNavigate} />}
                    {activeTab === 'financials' && <FinancialOverview deals={dealsData} inventory={inventoryData} />}
                </div>
            </div>
        </div>
    );
};

// Sub-components
const InventoryMetric = ({ label, value, color = '#1e293b' }) => (
    <div>
        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: color }}>{value}</div>
    </div>
);
const DetailItem = ({ label, value }) => (
    <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 600 }}>{value}</div>
    </div>
);

const OfficeLocations = ({ addresses }) => {
    const [activeLocation, setActiveLocation] = useState('Registered Office');
    const availableTypes = Object.keys(addresses || {}).filter(k => addresses[k]);

    if (!availableTypes.length) return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No address information registered.</div>;

    const currentAddr = addresses[activeLocation];

    return (
        <div>
            <div style={{ display: 'flex', gap: '15px', borderBottom: '1px solid #f1f5f9', marginBottom: '20px' }}>
                {availableTypes.map(type => (
                    <button
                        key={type}
                        onClick={() => setActiveLocation(type)}
                        style={{
                            padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: '0.75rem', fontWeight: 700, color: activeLocation === type ? '#3b82f6' : '#64748b',
                            borderBottom: activeLocation === type ? '2px solid #3b82f6' : 'none'
                        }}
                    >
                        {type}
                    </button>
                ))}
            </div>
            {currentAddr && (
                <div style={{ paddingBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', flex: 1 }}>
                        <DetailItem label="Address" value={`${currentAddr.hNo || ''} ${currentAddr.street || ''}`} />
                        <DetailItem label="Tehsil" value={renderValue(currentAddr.tehsil)} />
                        <DetailItem label="City" value={renderValue(currentAddr.city)} />
                        <DetailItem label="State" value={renderValue(currentAddr.state)} />
                        <DetailItem label="Pin Code" value={currentAddr.pinCode || 'N/A'} />
                        <DetailItem label="Country" value={renderValue(currentAddr.country)} />
                    </div>
                    <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem' }}>
                        <i className="fas fa-external-link-alt"></i> View on Map
                    </button>
                </div>
            )}
        </div>
    );
};

const EmployeeCard = ({ employee }) => (
    <div style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="avatar-circle" style={{ width: '40px', height: '40px', background: '#e2e8f0', color: '#475569', fontSize: '0.8rem' }}>
            {getInitials(employee.name)}
        </div>
        <div>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.85rem' }}>{employee.name} {employee.surname}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{employee.phones?.[0]?.phoneNumber || 'No Phone'}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '0.6rem', color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>View Contact</span>
            </div>
        </div>
    </div>
);

const MetricBox = ({ label, value, color }) => (
    <div style={{ padding: '16px', background: `${color}08`, border: `1px solid ${color}20`, borderRadius: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: color }}>{value}</div>
    </div>
);

const SidebarItem = ({ label, value, color = '#1e293b' }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.75rem' }}>
        <span style={{ color: '#64748b', fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 800 }}>{value}</span>
    </div>
);

const SummaryBlock = ({ label, value }) => (
    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#1e293b' }}>{value}</div>
    </div>
);

const QuickActionBtn = ({ icon, label, onClick }) => (
    <button onClick={onClick} style={{
        width: '100%', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px',
        border: '1px solid #e2e8f0', background: '#fff', borderRadius: '8px', cursor: 'pointer',
        fontSize: '0.75rem', fontWeight: 700, color: '#475569', transition: 'all 0.2s'
    }} className="hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600">
        <i className={`fas fa-${icon}`} style={{ width: '16px', textAlign: 'center' }}></i> {label}
    </button>
);

const TabBtn = ({ active, onClick, label, icon }) => (
    <button
        onClick={onClick}
        style={{
            padding: '16px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 800, color: active ? '#1e293b' : '#94a3b8',
            borderBottom: active ? '3px solid #3b82f6' : '3px solid transparent',
            display: 'flex', alignItems: 'center', gap: '8px'
        }}
    >
        <i className={`fas fa-${icon}`}></i> {label}
    </button>
);

const ActivityTimeline = () => (
    <div style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
        <i className="fas fa-stream" style={{ fontSize: '2rem', color: '#e2e8f0', marginBottom: '12px' }}></i>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Activity history and audit logs from CRM system...</div>
    </div>
);

const FinancialOverview = ({ deals, inventory }) => {
    const cashFlowSeries = [
        { name: 'Projected Cash Inflow', data: [30, 40, 35, 50, 49, 60, 70, 91, 125] }
    ];
    const cashFlowOptions = {
        chart: { type: 'area', toolbar: { show: false } },
        stroke: { curve: 'smooth' },
        xaxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] },
        colors: ['#3b82f6'],
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } }
    };

    const portfolioSeries = [44, 55, 13, 33];
    const portfolioOptions = {
        labels: ['Residential', 'Commercial', 'Industrial', 'Plots'],
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8e44ad'],
        legend: { position: 'bottom' }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '20px' }}>CASH FLOW PROJECTION (₹ Cr)</h3>
                <Chart options={cashFlowOptions} series={cashFlowSeries} type="area" height={250} />
            </div>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '20px' }}>PORTFOLIO MIX</h3>
                <Chart options={portfolioOptions} series={portfolioSeries} type="donut" height={250} />
            </div>
        </div>
    );
};

const DataList = ({ items, type, onNavigate }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {items.length > 0 ? items.map((item, i) => (
            <div key={i} style={{ padding: '20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '8px' }}>
                    {type === 'project' ? item.name : type === 'inventory' ? `Unit ${item.unitNo || item.unitNumber}` : `Deal #${item._id.substring(item._id.length - 6).toUpperCase()}`}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {type === 'project' ? item.status : type === 'inventory' ? item.projectName : item.projectName}
                </div>
                <button
                    onClick={() => onNavigate(`${type}-detail`, item._id)}
                    style={{ marginTop: '12px', border: 'none', background: 'none', color: '#3b82f6', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}
                >
                    View Details
                </button>
            </div>
        )) : (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: '#94a3b8' }}>No {type} linked to this company yet.</div>
        )}
    </div>
);

const tableHeaderStyle = { textAlign: 'left', padding: '12px 20px', color: '#64748b', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase' };
const tableCellStyle = { padding: '14px 20px', color: '#1e293b' };

export default CompanyDetailPage;
