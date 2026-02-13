import React, { useState, useEffect, useCallback } from 'react';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';
import Chart from 'react-apexcharts';

const ProjectDetailPage = ({ projectId, onBack, onNavigate, onAddActivity }) => {
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activity');
    const [inventoryData, setInventoryData] = useState([]);
    const [dealsData, setDealsData] = useState([]);
    const [blocksData, setBlocksData] = useState([]);

    const fetchProjectDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`projects/${projectId}`);
            if (response.data && response.data.success) {
                const data = response.data.data;
                setProject(data);
                setBlocksData(data.blocks || []);

                // Fetch associated data
                fetchInventory(projectId);
                fetchDeals(projectId);
            } else {
                toast.error("Failed to load project details");
            }
        } catch (error) {
            console.error("Error fetching project:", error);
            toast.error("Error loading project");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const fetchInventory = async (pid) => {
        try {
            const response = await api.get(`inventory?projectId=${pid}`);
            if (response.data && response.data.success) {
                setInventoryData(response.data.data || []);
            }
        } catch (err) {
            console.error("Error fetching project inventory:", err);
        }
    };

    const fetchDeals = async (pid) => {
        try {
            const response = await api.get(`deals?projectId=${pid}`);
            if (response.data && response.data.success) {
                setDealsData(response.data.records || []);
            }
        } catch (err) {
            console.error("Error fetching project deals:", err);
        }
    };

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>Initializing Project Command Center...</span>
        </div>
    );
    if (!project) return <div className="error-state">Project not found</div>;

    const totalDealValue = dealsData.reduce((acc, deal) => acc + (deal.price || 0), 0);
    const activeDealsCount = dealsData.filter(d => d.stage !== 'Closed' && d.stage !== 'Cancelled').length;
    const closedDealsCount = dealsData.filter(d => d.stage === 'Closed').length;

    const totalInventoryCount = inventoryData.length;
    const soldInventory = inventoryData.filter(i => i.status === 'Sold Out').length;
    const availableInventory = inventoryData.filter(i => i.status === 'Available').length;

    // Advanced Metrics
    const avgPricePerUnit = totalInventoryCount > 0 ? (dealsData.reduce((acc, d) => acc + (d.price || 0), 0) / (dealsData.length || 1)) : 0;
    const absorptionRate = totalInventoryCount > 0 ? Math.round((soldInventory / totalInventoryCount) * 100) : 0;
    const revenuePotential = availableInventory * (avgPricePerUnit || 4500000);

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

    return (
        <div className="project-detail-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '60px' }}>
            {/* 3️⃣ STICKY PROJECT SUMMARY HEADER */}
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
                        cursor: 'pointer', color: '#64748b', transition: 'all 0.2s'
                    }} className="hover:bg-slate-50">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
                                {project.name}
                            </h1>
                            <span style={{
                                backgroundColor: '#f1f5f9', color: '#475569',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #e2e8f0'
                            }}>
                                PRJ-{project._id.substring(project._id.length - 6).toUpperCase()}
                            </span>
                            <span style={{
                                backgroundColor: '#ecfdf5', color: '#065f46',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', border: '1px solid #10b98133'
                            }}>
                                {project.status || 'Active'}
                            </span>
                            {project.reraNumber && (
                                <span style={{
                                    backgroundColor: '#eff6ff', color: '#1e40af',
                                    padding: '4px 12px', borderRadius: '20px',
                                    fontSize: '0.7rem', fontWeight: 800,
                                    textTransform: 'uppercase', border: '1px solid #3b82f633'
                                }}>
                                    RERA: {project.reraNumber}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                            <i className="fas fa-map-marker-alt text-red-500"></i>
                            {project.address?.location || project.locationSearch || 'No location set'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '32px', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 40px' }}>
                    <HeaderMetric label="Blocks" value={project.totalBlocks || blocksData.length} />
                    <HeaderMetric label="Total Units" value={project.totalUnits || totalInventoryCount} />
                    <HeaderMetric label="Inventory Active" value={availableInventory} color="#10b981" />
                    <HeaderMetric label="Deals Running" value={activeDealsCount} color="#6366f1" />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <ActionButton icon="edit" label="Edit" />
                    <ActionButton icon="plus-square" label="Add Block" />
                    <ActionButton icon="plus" label="Inventory" primary />
                </div>
            </header>

            {/* MAIN CONTENT SPLIT */}
            <div style={{ maxWidth: '1600px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '24px' }}>

                {/* 70% LEFT SECTION */}
                <div style={{ flex: '0 0 70%', display: 'flex', flexDirection: 'column' }}>

                    {/* Card 1: Project Overview */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-info-circle text-blue-500"></i> Project Overview</h3>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <DetailItem label="Category" value={project.category} />
                                <DetailItem label="Sub Category" value={project.subCategory} />
                                <DetailItem
                                    label="Developer"
                                    value={project.developerName}
                                    boldValue
                                    onClick={project.developerId ? () => onNavigate('company-detail', project.developerId) : undefined}
                                />
                                <DetailItem label="Joint Venture" value={project.isJointVenture ? 'YES' : 'NO'} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <DetailItem label="Land Area" value={`${project.landArea || '--'} ${project.landAreaUnit || ''}`} />
                                <DetailItem label="Total Blocks" value={project.totalBlocks} />
                                <DetailItem label="Parking Type" value={project.parkingType || 'Covered'} />
                                <DetailItem label="Current Status" value={project.status} color="#10b981" boldValue />
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Location & Map */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-map-marked-alt text-red-500"></i> Location & Map</h3>
                            <button style={{ color: '#2563eb', fontSize: '0.8rem', fontWeight: 800, background: 'none', border: 'none', cursor: 'pointer' }}>
                                Open in Google Maps <i className="fas fa-external-link-alt ml-1"></i>
                            </button>
                        </div>
                        <div style={{ height: '300px', background: '#f1f5f9' }}>
                            <iframe
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://www.google.com/maps/embed/v1/place?key=PLACEHOLDER&q=${encodeURIComponent(project.address?.location || project.name)}`}
                                allowFullScreen
                            ></iframe>
                        </div>
                        <div style={{ padding: '20px', background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <DetailItem label="City" value={project.address?.city} />
                            <DetailItem label="State" value={project.address?.state} />
                            <DetailItem label="Pincode" value={project.address?.pincode} />
                            <DetailItem label="Address" value={project.address?.street || project.address?.location} />
                        </div>
                    </div>

                    {/* Card 3: Blocks & Phases */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-th text-indigo-500"></i> Blocks & Phases</h3>
                            <button style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>
                                + Add New Block
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                            {blocksData.length > 0 ? blocksData.map((block, idx) => (
                                <BlockMiniCard key={idx} block={block} />
                            )) : (
                                <div style={{ gridColumn: 'span 3', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No blocks defined yet.</div>
                            )}
                        </div>
                    </div>

                    {/* Two Column Cards split */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Card 4: Inventory Summary */}
                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h3 style={sectionTitleStyle}><i className="fas fa-warehouse text-emerald-500"></i> Inventory Summary</h3>
                            </div>
                            <div style={{ padding: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                                    <StatBox label="Total" value={totalInventoryCount} color="#1e293b" />
                                    <StatBox label="Available" value={availableInventory} color="#10b981" />
                                    <StatBox label="Booked/Sold" value={soldInventory} color="#ef4444" />
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <tr>
                                            <th style={{ padding: '10px', textAlign: 'left' }}>Unit</th>
                                            <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
                                            <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventoryData.slice(0, 5).map((unit, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '10px', fontWeight: 700 }}>{unit.unitNo}</td>
                                                <td style={{ padding: '10px' }}>{renderValue(unit.unitType)}</td>
                                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9' }}>
                                                        {renderValue(unit.status) || 'Available'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button
                                    style={{ width: '100%', marginTop: '16px', padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                                    onClick={() => setActiveTab('inventory')}
                                >
                                    View All Inventory
                                </button>
                            </div>
                        </div>

                        {/* Card 5: Deal Performance */}
                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h3 style={sectionTitleStyle}><i className="fas fa-chart-line text-amber-500"></i> Deal Performance</h3>
                            </div>
                            <div style={{ padding: '20px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Total Pipeline Value</p>
                                    <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b', margin: 0 }}>{formatIndianCurrency(totalDealValue)}</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                    <div>
                                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, margin: '0 0 4px 0' }}>Conversion Rate</p>
                                        <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981', margin: 0 }}>24.5%</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, margin: '0 0 4px 0' }}>Active Deals</p>
                                        <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#6366f1', margin: 0 }}>{activeDealsCount}</p>
                                    </div>
                                </div>
                                <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <p style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 800, marginBottom: '8px' }}>Pipeline Health</p>
                                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                                        <div style={{ width: '40%', background: '#6366f1' }}></div>
                                        <div style={{ width: '30%', background: '#fbbf24' }}></div>
                                        <div style={{ width: '30%', background: '#10b981' }}></div>
                                    </div>
                                </div>
                                <button
                                    style={{ width: '100%', marginTop: '16px', padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                                    onClick={() => setActiveTab('deals')}
                                >
                                    View Project Deals
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Card 6: Amenities */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-swimming-pool text-cyan-500"></i> Project Amenities</h3>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                {project.amenities && Object.keys(project.amenities).length > 0 ? Object.entries(project.amenities).map(([key, val], idx) => val && (
                                    <span key={idx} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-check-circle text-emerald-500"></i> {key}
                                    </span>
                                )) : (
                                    <div style={{ width: '100%', padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No specific amenities listed.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Card 7: Sales Insights */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-atom text-purple-500"></i> Sales & Marketing Insights</h3>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                            <InsightMetric label="Avg Price / Unit" value={formatIndianCurrency(avgPricePerUnit || 4500000)} />
                            <InsightMetric label="Absorption Rate" value={`${absorptionRate}% Total`} color="#3b82f6" />
                            <InsightMetric label="Closed Deals" value={closedDealsCount} />
                            <InsightMetric label="Rev. Potential" value={formatIndianCurrency(revenuePotential)} color="#10b981" />
                        </div>
                    </div>

                    {/* Tabs Section */}
                    <div style={{ marginTop: '24px' }}>
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
                            <TabItem id="activity" label="Activity Timeline" active={activeTab === 'activity'} onClick={setActiveTab} />
                            <TabItem id="inventory" label="Inventory" active={activeTab === 'inventory'} onClick={setActiveTab} />
                            <TabItem id="deals" label="Deals" active={activeTab === 'deals'} onClick={setActiveTab} />
                            <TabItem id="documents" label="Documents" active={activeTab === 'documents'} onClick={setActiveTab} />
                            <TabItem id="financials" label="Financial Overview" active={activeTab === 'financials'} onClick={setActiveTab} />
                        </div>
                        <div style={{ minHeight: '400px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
                            {activeTab === 'activity' && <p style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '40px' }}>Activity history and audit logs from CRM system...</p>}

                            {activeTab === 'inventory' && (
                                <div className="inventory-tab">
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '20px', color: '#1e293b' }}>Project Inventory Units</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                        {inventoryData.map((unit, idx) => (
                                            <div key={idx} style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#f8fafc' }}>
                                                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.1rem', marginBottom: '4px' }}>Unit {unit.unitNo}</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{renderValue(unit.unitType)}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', background: unit.status === 'Available' ? '#dcfce7' : '#fee2e2', color: unit.status === 'Available' ? '#166534' : '#991b1b', fontWeight: 800 }}>
                                                        {renderValue(unit.status)}
                                                    </span>
                                                    <button onClick={() => onNavigate('inventory-detail', unit._id)} style={{ border: 'none', background: 'none', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>View Details</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'deals' && (
                                <div className="deals-tab">
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '20px', color: '#1e293b' }}>Active & Closed Deals</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {dealsData.length > 0 ? dealsData.map((deal, idx) => (
                                            <div key={idx} style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#1e293b' }}>Deal #{deal.dealId || deal._id.substring(deal._id.length - 6).toUpperCase()}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Unit: {deal.unitNo} • {deal.intent}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 800, color: '#10b981' }}>{formatIndianCurrency(deal.price)}</div>
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 700 }}>{deal.stage}</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No deals recorded for this project yet.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'financials' && (
                                <div className="financials-tab">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '16px', color: '#1e293b' }}>CASH FLOW PROJECTION</h4>
                                            <div style={{ height: '250px' }}>
                                                <Chart
                                                    options={{
                                                        chart: { toolbar: { show: false } },
                                                        stroke: { curve: 'smooth', width: 3 },
                                                        colors: ['#10b981'],
                                                        xaxis: { categories: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] }
                                                    }}
                                                    series={[{ name: 'Inflow (₹ Cr)', data: [1.2, 2.5, 3.8, 1.9, 4.2, 3.5] }]}
                                                    type="line"
                                                    height="100%"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '16px', color: '#1e293b' }}>PORTFOLIO MIX</h4>
                                            <div style={{ height: '250px' }}>
                                                <Chart
                                                    options={{
                                                        labels: ['Sold', 'Booked', 'Available'],
                                                        colors: ['#10b981', '#f59e0b', '#3b82f6'],
                                                        legend: { position: 'bottom' }
                                                    }}
                                                    series={[soldInventory, dealsData.filter(d => d.stage === 'Booked').length, availableInventory]}
                                                    type="donut"
                                                    height="100%"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* 30% SIDEBAR */}
                <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Launch Timeline Card */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>Project Timeline</h3>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid #e2e8f0' }}>
                                <TimelinePoint label="Launched" date={project.launchDate} active />
                                <TimelinePoint label="Mid Construction" date="Aug 2026" />
                                <TimelinePoint label="Completion" date={project.expectedCompletionDate} />
                                <TimelinePoint label="Possession" date={project.possessionDate} />
                            </div>
                        </div>
                    </div>

                    {/* System Details Card */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>System Details</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <HealthRow label="Assigned Team" value={project.team?.join(', ') || 'Corporate Sales'} />
                            <HealthRow label="Visibility" value={project.visibleTo || 'Public'} />
                            <HealthRow label="Created By" value="Admin" />
                            <HealthRow label="Last Updated" value={new Date(project.updatedAt).toLocaleDateString()} />
                        </div>
                    </div>

                    {/* Quick Actions Card */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>Quick Actions</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gap: '10px' }}>
                            <ActionButton icon="plus" label="Add Inventory" full />
                            <ActionButton icon="handshake" label="Create New Deal" full />
                            <ActionButton icon="file-pdf" label="Upload Brochure" full />
                            <ActionButton icon="cloud-upload-alt" label="Add Document" full />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const HeaderMetric = ({ label, value, color }) => (
    <div style={{ textAlign: 'center', minWidth: '100px' }}>
        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 900, color: color || '#1e293b', margin: 0 }}>{value}</p>
    </div>
);

const ActionButton = ({ icon, label, primary, full }) => (
    <button style={{
        background: primary ? '#10b981' : '#fff',
        color: primary ? '#fff' : '#475569',
        border: primary ? 'none' : '1px solid #e2e8f0',
        padding: '10px 18px',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        cursor: 'pointer',
        boxShadow: primary ? '0 4px 10px rgba(16, 185, 129, 0.2)' : 'none',
        width: full ? '100%' : 'auto'
    }} className="hover:opacity-90 transition-all">
        <i className={`fas fa-${icon}`}></i> {label}
    </button>
);

const DetailItem = ({ label, value, boldValue, color, onClick }) => (
    <div
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 4px 0' }}>{label}</p>
        <p style={{
            fontSize: '0.85rem', fontWeight: boldValue ? 800 : 700,
            color: color || (onClick ? '#2563eb' : '#1e293b'), margin: 0,
            textDecoration: onClick ? 'underline' : 'none',
            textDecorationColor: '#2563eb33'
        }}>{Array.isArray(value) ? value.join(', ') : (renderValue(value) || '--')}</p>
    </div>
);

const BlockMiniCard = ({ block }) => (
    <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{block.name}</span>
            <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 800 }}>
                {block.status || 'Active'}
            </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
                <p style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, margin: 0 }}>Floors</p>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: 0 }}>{block.floors || '--'}</p>
            </div>
            <div>
                <p style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, margin: 0 }}>Units</p>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: 0 }}>{block.units || '--'}</p>
            </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button style={{ flex: 1, padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#2563eb' }}>View Units</button>
            <button style={{ flex: 1, padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#475569' }}>Edit</button>
        </div>
    </div>
);

const StatBox = ({ label, value, color }) => (
    <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
    </div>
);

const InsightMetric = ({ label, value, color }) => (
    <div style={{ padding: '16px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <p style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</p>
        <p style={{ fontSize: '1rem', fontWeight: 900, color: color || '#1e293b', margin: 0 }}>{value}</p>
    </div>
);

const TabItem = ({ id, label, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '12px 20px', background: 'transparent', border: 'none',
            borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
            color: active ? '#2563eb' : '#64748b', fontSize: '0.85rem',
            fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all 0.2s'
        }}
    >
        {label}
    </button>
);

const TimelinePoint = ({ label, date, active }) => (
    <div style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{
            position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px',
            borderRadius: '50%', background: active ? '#3b82f6' : '#fff',
            border: active ? '3px solid #dbeafe' : '2px solid #e2e8f0'
        }}></div>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: active ? '#1e293b' : '#64748b', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0 }}>{date ? new Date(date).toLocaleDateString() : 'TBD'}</p>
    </div>
);

const HealthRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '0.75rem', color: '#1e293b', fontWeight: 900 }}>{value}</span>
    </div>
);

export default ProjectDetailPage;
