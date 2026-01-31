import React, { useState, useMemo } from 'react';
import { bookingData } from '../../data/bookingData';
import AccountPage from '../Account/AccountPage'; // Import AccountPage as a sub-view

const BookingPage = ({ onNavigate, initialContextId }) => {
    // View State: 'deals' (Command Center) or 'ledger' (Financial Control)
    const [currentView, setCurrentView] = useState('deals');

    // --- Deals State ---
    const [activeTab, setActiveTab] = useState('All');
    const [searchTerm, setSearchTerm] = useState(initialContextId || '');
    const [selectedIds, setSelectedIds] = useState([]);

    // Logic to handle specific deal navigation (Drill-down)
    const handleViewLedger = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('ledger');
    };

    const handleViewDeal = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('deals');
    };

    // --- Stats Calculation ---
    const stats = useMemo(() => {
        const totalDeals = bookingData.length;
        const totalValue = bookingData.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.dealValue : sum, 0);
        const pendingComm = bookingData.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.commissionPending : sum, 0);
        const atRiskDeals = bookingData.filter(b => b.health === 'At Risk' || b.health === 'Delayed').length;
        return { totalDeals, totalValue, pendingComm, atRiskDeals };
    }, []);

    // --- Filtering ---
    const filteredData = useMemo(() => {
        return bookingData.filter(item => {
            const matchesTab = activeTab === 'All' || item.stage === activeTab;
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                item.customer.buyer.name.toLowerCase().includes(searchLower) ||
                item.customer.seller.name.toLowerCase().includes(searchLower) ||
                item.property.project.toLowerCase().includes(searchLower) ||
                item.id.toLowerCase().includes(searchLower);
            return matchesTab && matchesSearch;
        });
    }, [activeTab, searchTerm]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredData.length) setSelectedIds([]);
        else setSelectedIds(filteredData.map(d => d.id));
    };

    const selectedCount = selectedIds.length;

    // --- Helpers ---
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    const getHealthColor = (health) => {
        switch (health) {
            case 'On Track': return '#10b981'; // Green
            case 'At Risk': return '#f59e0b'; // Yellow
            case 'Delayed': return '#ef4444'; // Red
            default: return '#cbd5e1';
        }
    };

    const getStageColor = (stage) => {
        switch (stage) {
            case 'Pending': return { bg: '#fff7ed', text: '#c2410c', border: '#ffedd5' };
            case 'Booked': return { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };
            case 'Agreement': return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
            case 'Registry': return { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' };
            case 'Cancelled': return { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' };
            default: return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
        }
    };

    // If currentView is ledger, render the AccountPage (wrapped or modified)
    if (currentView === 'ledger') {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Unified Header for Switching Back */}
                <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <i className="fas fa-arrow-left"></i> Back to Deals
                        </button>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700, color: '#0f172a' }}>Financial Control Center</h2>
                    </div>
                    {/* View Switcher Controls */}
                    <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Deals</button>
                        <button onClick={() => setCurrentView('ledger')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Ledger</button>
                    </div>
                </div>
                {/* Render AccountPage with embedded props */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <AccountPage
                        onNavigate={(targetView, targetId) => {
                            if (targetView === 'booking') {
                                handleViewDeal(targetId);
                            } else if (onNavigate) {
                                onNavigate(targetView, targetId);
                            }
                        }}
                        initialContextId={searchTerm}
                        isEmbedded={true}
                    />
                </div>
            </div>
        );
    }

    return (
        <section className="main-content" style={{ background: '#f8fafc', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header: Command Center */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <i className="fas fa-chart-line" style={{ color: '#6366f1', fontSize: '1.2rem' }}></i>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Post-Sale Command Center</h1>
                        </div>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Track deals, monitor risks, and ensure timely closings.</p>
                    </div>
                    {/* View Switcher & Global Actions */}
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        {/* Switcher */}
                        <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                            <button onClick={() => setCurrentView('deals')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Deals</button>
                            <button onClick={() => setCurrentView('ledger')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Ledger</button>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-export"></i> Reports
                            </button>
                            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(99,102,241, 0.2)' }}>
                                <i className="fas fa-plus"></i> New Deal
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPI Metrics - Only show in Deals view */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                    {[
                        { label: 'Active Pipeline Value', value: formatCurrency(stats.totalValue), icon: 'fa-coins', color: '#0ea5e9', bg: '#e0f2fe' },
                        { label: 'Pending Commission', value: formatCurrency(stats.pendingComm), icon: 'fa-hand-holding-usd', color: '#f59e0b', bg: '#fef3c7' },
                        { label: 'Deals At Risk', value: stats.atRiskDeals, icon: 'fa-exclamation-triangle', color: '#ef4444', bg: '#fee2e2' },
                        { label: 'Total Active Deals', value: stats.totalDeals, icon: 'fa-file-signature', color: '#10b981', bg: '#dcfce7' },
                    ].map((stat, i) => (
                        <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: stat.bg, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                <i className={`fas ${stat.icon}`}></i>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls / Bulk Actions Toolbar */}
            <div style={{ padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '72px' }}>
                {selectedCount > 0 ? (
                    // Bulk Actions Toolbar
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', animation: 'fadeIn 0.2s ease-in-out' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                            <input type="checkbox" checked={selectedCount > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.9rem' }}>{selectedCount} Selected</span>
                        </div>

                        <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>

                        {/* Contextual Actions based on Selection Count */}
                        {selectedCount === 1 && (
                            <button
                                onClick={() => handleViewLedger(selectedIds[0])}
                                className="action-btn"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                <i className="fas fa-wallet" style={{ color: '#0ea5e9' }}></i> View Ledger
                            </button>
                        )}

                        <button
                            className="action-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            <i className="fas fa-edit"></i> Edit
                        </button>
                        <button
                            className="action-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            <i className="fas fa-calendar-check"></i> Activities
                        </button>

                        <div style={{ marginLeft: 'auto' }}>
                            <button style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                <i className="fas fa-trash-alt" style={{ marginRight: '6px' }}></i> Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    // Default Tab & Search Toolbar
                    <>
                        <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                            {['All', 'Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        background: activeTab === tab ? '#fff' : 'transparent',
                                        color: activeTab === tab ? '#0f172a' : '#64748b',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                            <input
                                type="text"
                                placeholder="Search deals, clients, properties..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Data Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    {/* Table Header - ACTIONS COLUMN REMOVED */}
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredData.length && filteredData.length > 0} /></div>
                        <div>Deal & Status</div>
                        <div>Health</div>
                        <div>Stakeholders (Buyer/Seller)</div>
                        <div>Property</div>
                        <div>Financials</div>
                        <div>Next Action</div>
                    </div>

                    {/* Table Rows */}
                    {filteredData.map(item => {
                        const stageStyle = getStageColor(item.stage);
                        const healthColor = getHealthColor(item.health);
                        const isSelected = selectedIds.includes(item.id);

                        // Progress calculation (mock)
                        const dealPaidPercent = Math.min((item.financials.dealPaid / item.financials.dealValue) * 100, 100);
                        const commPaidPercent = item.financials.commissionTotal > 0 ? Math.min((item.financials.commissionReceived / item.financials.commissionTotal) * 100, 100) : 0;

                        return (
                            <div key={item.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr',
                                padding: '20px',
                                borderBottom: '1px solid #f1f5f9',
                                alignItems: 'center',
                                fontSize: '0.9rem',
                                background: isSelected ? '#f0f9ff' : '#fff',
                                transition: 'background 0.2s',
                                cursor: 'pointer' // Indicate row is selectable
                            }}
                                onClick={(e) => {
                                    // Toggle select on row click if not triggering other interactive elements
                                    // For now, just relying on checkbox or explicit logic
                                    if (e.target.type !== 'checkbox') toggleSelect(item.id);
                                }}
                            >
                                <div onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} />
                                </div>

                                {/* Deal & Status */}
                                <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{item.id}</div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <span style={{
                                            background: item.dealType === 'Sell' ? '#dbeafe' : '#fef3c7',
                                            color: item.dealType === 'Sell' ? '#1e40af' : '#92400e',
                                            fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700
                                        }}>
                                            {item.dealType}
                                        </span>
                                        <span style={{
                                            background: stageStyle.bg, color: stageStyle.text, border: `1px solid ${stageStyle.border}`,
                                            fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 600
                                        }}>
                                            {item.stage}
                                        </span>
                                    </div>
                                </div>

                                {/* Health */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: healthColor }}></div>
                                        <span style={{ fontWeight: 600, color: healthColor, fontSize: '0.85rem' }}>{item.health}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {item.timeline.daysInStage} Days in Stage
                                    </div>
                                </div>

                                {/* Stakeholders */}
                                <div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '24px', height: '24px', background: '#e0e7ff', color: '#4338ca', borderRadius: '50%', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                {item.customer.buyer.avatar}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{item.customer.buyer.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Buyer</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '24px', height: '24px', background: '#fae8ff', color: '#86198f', borderRadius: '50%', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                {item.customer.seller.avatar}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{item.customer.seller.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Seller</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Property */}
                                <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>{item.property.unit}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '2px' }}>{item.property.project}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}><i className="fas fa-map-marker-alt"></i> {item.property.location}</div>
                                </div>

                                {/* Financials */}
                                <div style={{ paddingRight: '20px' }}>
                                    {/* Deal Payment */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}>
                                            <span>Deal: {formatCurrency(item.financials.dealValue)}</span>
                                            <span>{Math.round(dealPaidPercent)}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px' }}>
                                            <div style={{ width: `${dealPaidPercent}%`, height: '100%', background: '#0ea5e9', borderRadius: '3px' }}></div>
                                        </div>
                                    </div>
                                    {/* Comm Payment */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}>
                                            <span>Comm: {formatCurrency(item.financials.commissionTotal)}</span>
                                            <span>{Math.round(commPaidPercent)}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px' }}>
                                            <div style={{ width: `${commPaidPercent}%`, height: '100%', background: '#10b981', borderRadius: '3px' }}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Next Action */}
                                <div>
                                    {item.timeline.nextAction ? (
                                        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '8px 12px' }}>
                                            <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.8rem', marginBottom: '2px' }}>
                                                {item.timeline.nextAction.type}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                                                Due: {item.timeline.nextAction.dueDate}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#d97706', fontStyle: 'italic', marginTop: '2px' }}>
                                                {item.timeline.nextAction.assignedTo}
                                            </div>
                                        </div>
                                    ) : (
                                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No pending actions</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {filteredData.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '10px' }}></i>
                            <p>No deals found matching your criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default BookingPage;
