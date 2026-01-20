import React, { useState } from 'react';

function AccountPage({ onNavigate }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeTab, setActiveTab] = useState('All Payment');

    // Sample payment data based on the image
    const paymentData = [
        {
            id: 1,
            date: '01-11-2024',
            receiptId: 'RECEIPT#1-000001',
            paymentDate: '01-11-2024',
            customerName: 'Rajesh Mehta',
            contact: '9876543210',
            paymentFor: 'CASH',
            currentEmi: '',
            balance: '₹ 98,50,000',
            emiAmount: '',
            emiDate: '',
            emiPaidDate: '',
            type: 'Booking',
            remarks: 'Initial booking payment received'
        },
        {
            id: 2,
            date: '05-11-2024',
            receiptId: 'RECEIPT#1-000002',
            paymentDate: '05-11-2024',
            customerName: 'Priya Sharma',
            contact: '8765432109',
            paymentFor: 'CHEQUE',
            currentEmi: '1',
            balance: '₹ 42,00,000',
            emiAmount: '₹ 3,00,000',
            emiDate: '05-11-2024',
            emiPaidDate: '05-11-2024',
            type: 'EMI',
            remarks: 'First EMI cleared'
        },
        {
            id: 3,
            date: '10-11-2024',
            receiptId: 'RECEIPT#1-000003',
            paymentDate: '10-11-2024',
            customerName: 'Amit Kumar',
            contact: '7654321098',
            paymentFor: 'ONLINE',
            currentEmi: '2',
            balance: '₹ 65,00,000',
            emiAmount: '₹ 5,00,000',
            emiDate: '10-11-2024',
            emiPaidDate: '10-11-2024',
            type: 'EMI',
            remarks: 'Second EMI payment done'
        },
        {
            id: 4,
            date: '15-11-2024',
            receiptId: 'RECEIPT#1-000004',
            paymentDate: '15-11-2024',
            customerName: 'Sunita Verma',
            contact: '6543210987',
            paymentFor: 'CASH',
            currentEmi: '',
            balance: '₹ 1,15,00,000',
            emiAmount: '',
            emiDate: '',
            emiPaidDate: '',
            type: 'Booking',
            remarks: 'Booking amount paid in cash'
        },
        {
            id: 5,
            date: '20-11-2024',
            receiptId: 'RECEIPT#1-000005',
            paymentDate: '20-11-2024',
            customerName: 'Vikram Singh',
            contact: '5432109876',
            paymentFor: 'CHEQUE',
            currentEmi: '3',
            balance: '₹ 78,00,000',
            emiAmount: '₹ 4,00,000',
            emiDate: '20-11-2024',
            emiPaidDate: '20-11-2024',
            type: 'EMI',
            remarks: 'Third EMI received via cheque'
        },
        {
            id: 6,
            date: '25-11-2024',
            receiptId: 'RECEIPT#1-000006',
            paymentDate: '25-11-2024',
            customerName: 'Neha Gupta',
            contact: '4321098765',
            paymentFor: 'ONLINE',
            currentEmi: '1',
            balance: '₹ 52,00,000',
            emiAmount: '₹ 2,50,000',
            emiDate: '25-11-2024',
            emiPaidDate: '25-11-2024',
            type: 'EMI',
            remarks: 'Online payment successful'
        },
        {
            id: 7,
            date: '28-11-2024',
            receiptId: 'RECEIPT#1-000007',
            paymentDate: '28-11-2024',
            customerName: 'Rahul Jain',
            contact: '3210987654',
            paymentFor: 'CASH',
            currentEmi: '4',
            balance: '₹ 35,00,000',
            emiAmount: '₹ 3,50,000',
            emiDate: '28-11-2024',
            emiPaidDate: '28-11-2024',
            type: 'EMI',
            remarks: 'Fourth installment paid'
        },
        {
            id: 8,
            date: '30-11-2024',
            receiptId: 'RECEIPT#1-000008',
            paymentDate: '30-11-2024',
            customerName: 'Kavita Reddy',
            contact: '2109876543',
            paymentFor: 'ONLINE',
            currentEmi: '',
            balance: '₹ 88,00,000',
            emiAmount: '',
            emiDate: '',
            emiPaidDate: '',
            type: 'Booking',
            remarks: 'Booking confirmed online'
        }
    ];

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.length === paymentData.length ? [] : paymentData.map(p => p.id)
        );
    };

    // Calculate totals
    const totalPayments = paymentData.length;
    const totalBalance = paymentData.reduce((sum, payment) => {
        const balance = parseInt(payment.balance.replace(/[₹,]/g, ''));
        return sum + balance;
    }, 0);

    return (
        <section className="main-content">
            <div className="page-container">
                {/* Page Header */}
                <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #eef2f5', padding: '20px 2rem' }}>
                    <div className="page-title-group">
                        <i className="fas fa-wallet" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Post Sale</span>
                            <h1>Payment</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={() => onNavigate && onNavigate('booking')}
                        >
                            <i className="fas fa-handshake"></i> Booking
                        </button>
                        <button
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-wallet"></i> Account
                        </button>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-plus"></i> Add Payment
                        </button>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-filter"></i> Filter
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div style={{ padding: '15px 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                        {['All Payment', 'Booking', 'EMI', 'Full Payment'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '10px 0',
                                    border: 'none',
                                    background: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: activeTab === tab ? '#10b981' : '#64748b',
                                    borderBottom: activeTab === tab ? '2px solid #10b981' : '2px solid transparent',
                                    cursor: 'pointer',
                                    marginBottom: '-2px'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Action Bar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedIds.length > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)' }}>
                                    {selectedIds.length} Selected
                                </div>
                                <button className="action-btn"><i className="fas fa-receipt"></i> Generate Receipt</button>
                                <button className="action-btn"><i className="fas fa-download"></i> Export</button>
                                <div style={{ flex: 1 }}></div>
                                <button className="action-btn delete-btn"><i className="fas fa-trash-alt"></i> Delete</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                <div className="search-box" style={{ flex: 1, maxWidth: '400px' }}>
                                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search payments by customer, receipt ID..."
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px 8px 36px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}></div>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Items: {paymentData.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Payment List Header */}
                    <div style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '15px 2rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'grid', gridTemplateColumns: '40px 100px 150px 100px 180px 120px 120px 100px 120px 100px 100px 100px 100px 150px 80px', gap: '0.8rem', alignItems: 'center' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === paymentData.length} /></div>
                        <div>Date</div>
                        <div>Receipt ID</div>
                        <div>Date</div>
                        <div>Customer Name</div>
                        <div>Contact</div>
                        <div>Payment For</div>
                        <div>Current EMI</div>
                        <div>Balance</div>
                        <div>EMI Amount</div>
                        <div>EMI Date</div>
                        <div>EMI Paid Date</div>
                        <div>Type</div>
                        <div>Remarks</div>
                        <div>Actions</div>
                    </div>

                    {/* Payment List */}
                    <div className="list-content" style={{ background: '#fafbfc', padding: '1rem 2rem' }}>
                        {paymentData.map((payment) => (
                            <div
                                key={payment.id}
                                style={{
                                    padding: '18px 20px',
                                    marginBottom: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    display: 'grid',
                                    gridTemplateColumns: '40px 100px 150px 100px 180px 120px 120px 100px 120px 100px 100px 100px 100px 150px 80px',
                                    gap: '0.8rem',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(payment.id)}
                                    onChange={() => toggleSelect(payment.id)}
                                />

                                <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>{payment.date}</div>

                                <div style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 700 }}>{payment.receiptId}</div>

                                <div style={{ fontSize: '0.75rem', color: '#334155' }}>{payment.paymentDate}</div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{payment.customerName}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#8e44ad', fontWeight: 600 }}>
                                        <i className="fas fa-phone" style={{ marginRight: '4px', transform: 'scaleX(-1) rotate(5deg)' }}></i>{payment.contact}
                                    </div>
                                </div>

                                <div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        background: payment.paymentFor === 'CASH' ? '#fef3c7' :
                                            payment.paymentFor === 'ONLINE' ? '#dbeafe' : '#d1fae5',
                                        color: payment.paymentFor === 'CASH' ? '#92400e' :
                                            payment.paymentFor === 'ONLINE' ? '#1e40af' : '#065f46',
                                        border: payment.paymentFor === 'CASH' ? '1px solid #fcd34d' :
                                            payment.paymentFor === 'ONLINE' ? '1px solid #93c5fd' : '1px solid #6ee7b7'
                                    }}>
                                        {payment.paymentFor}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.75rem', color: '#334155', textAlign: 'center' }}>{payment.currentEmi || '--'}</div>

                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#dc2626' }}>{payment.balance}</div>

                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>{payment.emiAmount || '--'}</div>

                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{payment.emiDate || '--'}</div>

                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{payment.emiPaidDate || '--'}</div>

                                <div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        background: payment.type === 'Booking' ? '#e0e7ff' : '#fce7f3',
                                        color: payment.type === 'Booking' ? '#4338ca' : '#be123c',
                                        border: payment.type === 'Booking' ? '1px solid #a5b4fc' : '1px solid #fda4af'
                                    }}>
                                        {payment.type}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic' }}>{payment.remarks}</div>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button style={{ padding: '4px 8px', border: 'none', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                        <i className="fas fa-eye"></i>
                                    </button>
                                    <button style={{ padding: '4px 8px', border: 'none', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                        <i className="fas fa-receipt"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Footer */}
                    <div className="list-footer" style={{
                        padding: '15px 2rem',
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0',
                        display: 'flex',
                        gap: '30px',
                        alignItems: 'center',
                        boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 99
                    }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569' }}>Summary</div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Agent Incc.</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0891b2' }}>₹1,76,950.2</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Brok.</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0891b2' }}>₹{totalBalance.toLocaleString('en-IN')}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Recd. Amount</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>₹{totalPayments.toLocaleString('en-IN')}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Brok. Recd. (Net)</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>₹365,000</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Tax</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#64748b' }}>₹0</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Tax</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#64748b' }}>₹0</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 'auto' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Balance</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#dc2626' }}>₹{totalBalance.toLocaleString('en-IN')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default AccountPage;
