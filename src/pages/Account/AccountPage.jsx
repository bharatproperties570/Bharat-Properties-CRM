import React, { useState, useMemo } from 'react';
import { accountData, accountStats } from '../../data/accountData';

const AccountPage = ({ onNavigate, initialContextId, isEmbedded }) => {
    const [activeTab, setActiveTab] = useState('All Payments');
    const [searchTerm, setSearchTerm] = useState(initialContextId || '');
    const [selectedIds, setSelectedIds] = useState([]);

    // --- Filtering ---
    const filteredData = useMemo(() => {
        if (!accountData) return [];
        return accountData.filter(item => {
            const matchesSearch =
                item.bookingSnapshot.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.receiptId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.bookingSnapshot.id.toLowerCase().includes(searchTerm.toLowerCase());

            if (activeTab === 'Overdue') return item.health.status !== 'On Track' && matchesSearch;
            if (activeTab === 'Commission Pending') return item.liabilityType === 'Commission' && item.health.status !== 'On Track' && matchesSearch;
            if (activeTab === 'High Value Pending') return item.financials.pending > 1000000 && matchesSearch;

            return matchesSearch;
        });
    }, [activeTab, searchTerm]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredData.length) setSelectedIds([]);
        else setSelectedIds(filteredData.map(d => d.receiptId));
    };

    const selectedCount = selectedIds.length;

    // --- Helpers ---
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    const getHealthColor = (status) => {
        switch (status) {
            case 'On Track': return '#10b981'; // Green
            case 'Warning': return '#f59e0b'; // Yellow
            case 'Critical': return '#ef4444'; // Red
            default: return '#cbd5e1';
        }
    };

    const getLiabilityBadge = (type) => {
        switch (type) {
            case 'Deal Amount': return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }; // Blue
            case 'Commission': return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }; // Green
            case 'Government Charges': return { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' }; // Purple
            default: return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
        }
    };

    return (
        <section className="main-content" style={{ background: '#f8fafc', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header: Hide if embedded, only show KPIs optionally or simpler view */}
            {!isEmbedded && (
                <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <i className="fas fa-wallet" style={{ color: '#0ea5e9', fontSize: '1.2rem' }}></i>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Financial Control Center</h1>
                            </div>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Cash-flow monitoring, liability tracking & commission control.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Smart Tabs Toolbar / Bulk Action Bar */}
            <div style={{ padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '72px' }}>
                {selectedCount > 0 ? (
                    // Bulk Action Mode
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', animation: 'fadeIn 0.2s ease-in-out' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                            <input type="checkbox" checked={selectedCount > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.9rem' }}>{selectedCount} Selected</span>
                        </div>
                        <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>

                        {/* Specific Actions */}
                        {selectedCount === 1 && (
                            <button
                                onClick={() => {
                                    const item = filteredData.find(d => d.receiptId === selectedIds[0]);
                                    if (item) onNavigate('booking', item.bookingSnapshot.id);
                                }}
                                className="action-btn"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                <i className="fas fa-external-link-alt"></i> View Deal
                            </button>
                        )}
                        <button title="Receipt" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <i className="fas fa-print"></i> Receipt
                        </button>
                        <button title="Reminder" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <i className="fas fa-bell"></i> Reminder
                        </button>
                    </div>
                ) : (
                    // Default Search Mode
                    <>
                        <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                            {['All Payments', 'Overdue', 'Due This Week', 'High Value Pending', 'Commission Pending'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        background: activeTab === tab ? '#fff' : 'transparent',
                                        color: activeTab === tab ? (tab === 'Overdue' ? '#ef4444' : '#0f172a') : '#64748b',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    {tab === 'Overdue' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>}
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div style={{ position: 'relative', width: '280px' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                            <input
                                type="text"
                                placeholder="Search receipt, customer..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Advanced Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    {/* Header - ACTIONS COLUMN REMOVED */}
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.8fr 1.2fr 1.2fr 1.5fr 1.2fr', background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredData.length && filteredData.length > 0} /></div>
                        <div>Receipt & Date</div>
                        <div>Booking Context</div>
                        <div>Liability Type</div>
                        <div>Payment</div>
                        <div>Amount & Status</div>
                        <div>Health / Due</div>
                    </div>

                    {/* Rows */}
                    {filteredData.map(item => {
                        const healthColor = getHealthColor(item.health.status);
                        const liabilityStyle = getLiabilityBadge(item.liabilityType);
                        const isSelected = selectedIds.includes(item.receiptId);

                        return (
                            <div key={item.receiptId} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1.5fr 1.8fr 1.2fr 1.2fr 1.5fr 1.2fr',
                                padding: '18px 20px',
                                borderBottom: '1px solid #f1f5f9',
                                alignItems: 'center', // Align items to center vertically
                                fontSize: '0.9rem',
                                background: isSelected ? '#f0f9ff' : '#fff',
                                transition: 'background 0.2s',
                                cursor: 'pointer'
                            }}
                                onClick={(e) => {
                                    if (e.target.type !== 'checkbox') toggleSelect(item.receiptId);
                                }}
                            >
                                <div onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.receiptId)} /></div>

                                {/* Receipt & Date */}
                                <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', marginBottom: '2px' }}>{item.receiptId}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}><i className="far fa-calendar-alt" style={{ marginRight: '4px' }}></i>{item.paymentDate}</div>
                                </div>

                                {/* Booking Context */}
                                <div>
                                    <div style={{ fontWeight: 700, color: '#334155' }}>To: {item.bookingSnapshot.customer}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#0ea5e9', fontWeight: 500, margin: '2px 0' }}>{item.bookingSnapshot.id}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.bookingSnapshot.property}</div>
                                </div>

                                {/* Liability Type */}
                                <div>
                                    <span style={{
                                        background: liabilityStyle.bg, color: liabilityStyle.color, border: `1px solid ${liabilityStyle.border}`,
                                        fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 700
                                    }}>
                                        {item.liabilityType}
                                    </span>
                                </div>

                                {/* Payment */}
                                <div>
                                    <div style={{ fontWeight: 600, color: '#475569' }}>{item.paymentCategory}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Via {item.paymentMode}</div>
                                </div>

                                {/* Amount & Status */}
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: item.amount > 0 ? '#10b981' : '#ef4444' }}>
                                        {formatCurrency(Math.max(item.amount, item.commission.pending))}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                        {item.amount > 0 ? 'Received' : 'Pending'} • Bal: {formatCurrency(item.financials.pending || item.commission.pending)}
                                    </div>
                                    {/* Mini Logic for Comm Breakdown if Applicable */}
                                    {item.liabilityType === 'Commission' && (
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                            <div style={{ height: '4px', width: '50%', background: '#bfdbfe', borderRadius: '2px' }} title="Company"></div>
                                            <div style={{ height: '4px', width: '30%', background: '#bbf7d0', borderRadius: '2px' }} title="Exec"></div>
                                            <div style={{ height: '4px', width: '20%', background: '#fde047', borderRadius: '2px' }} title="Partner"></div>
                                        </div>
                                    )}
                                </div>

                                {/* Health */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthColor }}></div>
                                        <span style={{ fontWeight: 600, color: healthColor, fontSize: '0.8rem' }}>{item.health.status}</span>
                                    </div>
                                    {item.health.daysOverdue > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>
                                            {item.health.daysOverdue} Days Late
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Due: {item.health.dueDate}</div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredData.length === 0 && (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                            <i className="fas fa-search-dollar" style={{ fontSize: '2.5rem', marginBottom: '16px', color: '#cbd5e1' }}></i>
                            <p style={{ margin: 0 }}>No payments found matching your criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default AccountPage;
