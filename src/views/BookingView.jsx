import React, { useState } from 'react';

function BookingView({ onNavigate }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeTab, setActiveTab] = useState('All Booking');

    // Sample booking/deals data based on the EXACT image structure
    const bookingData = [
        {
            id: 1,
            sno: 1,
            date: '01-11-2024',
            time: '10:30 AM',
            dealType: 'Sell',
            formNumber: 'Form 1',
            stage: 'Pending',
            seller: {
                name: 'Rajiv Kumar Singhal',
                mobile: '7988275300'
            },
            buyer: {
                name: 'Amit Sharma',
                mobile: '9410535300'
            },
            project: 'Sector 4 Kurukshetra',
            propertyNumber: 'Plot-1550',
            block: 'Second Block',
            executive: 'Rajesh Kumar',
            agentName: 'Amit Sharma',
            agentCompany: 'Amit Realty',
            agreementAmount: '₹ 5,00,000',
            finalDate: '01-12-2024',
            price: '₹ 1,03,50,000',
            brokerage: '₹ 2,07,000',
            brokeragePercent: '1+1',
            paymentReceived: '₹ 5,00,000',
            paymentPending: '₹ 98,50,000',
            paymentPlan: 'Construction Linked Payment Plan (CLPP)',
            followup: '15-11-2024',
            remarks: 'Booking Done, Documents Pending'
        },
        {
            id: 2,
            sno: 2,
            date: '15-10-2024',
            time: '02:15 PM',
            dealType: 'Rent',
            formNumber: 'Form 2',
            stage: 'Booked',
            seller: {
                name: 'Priya Verma',
                mobile: '9876543210'
            },
            buyer: {
                name: 'Rajiv Kumar',
                mobile: '8765432109'
            },
            project: 'Sector 3 Kurukshetra',
            propertyNumber: '1 BHK-10 Marla',
            block: 'Main Block',
            executive: 'Priya Sharma',
            agentName: 'Suresh Verma',
            agentCompany: 'City Properties',
            agreementAmount: '₹ 2,00,000',
            finalDate: '6 Month',
            price: '₹ 45,00,000',
            brokerage: '₹ 90,000',
            brokeragePercent: '1+1',
            paymentReceived: '₹ 2,00,000',
            paymentPending: '₹ 43,00,000',
            paymentPlan: 'Down Payment Plan',
            followup: '20-10-2024',
            remarks: 'Payment Pending, Follow up required'
        },
        {
            id: 3,
            sno: 3,
            date: '20-09-2024',
            time: '11:00 AM',
            dealType: 'Sell',
            formNumber: 'Form 3',
            stage: 'Registry',
            seller: {
                name: 'Sunita Gupta',
                mobile: '9988776655'
            },
            buyer: {
                name: 'Vikram Singh',
                mobile: '8877665544'
            },
            project: 'Sector 8 Kurukshetra',
            propertyNumber: 'Plot-800',
            block: 'First Block',
            executive: 'Vikram Singh',
            agentName: 'Deepak Gupta',
            agentCompany: 'Metro Homes',
            agreementAmount: '₹ 3,50,000',
            finalDate: '20-10-2024',
            price: '₹ 72,00,000',
            brokerage: '₹ 1,44,000',
            brokeragePercent: '1+1',
            paymentReceived: '₹ 3,50,000',
            paymentPending: '₹ 68,50,000',
            paymentPlan: 'Flexi Payment Plan',
            followup: '25-09-2024',
            remarks: 'Documents Verified, Registry in progress'
        },
        {
            id: 4,
            sno: 4,
            date: '05-09-2024',
            time: '04:30 PM',
            dealType: 'Lease',
            formNumber: 'Form 4',
            stage: 'Cancelled',
            seller: {
                name: 'Neha Jain',
                mobile: '7766554433'
            },
            buyer: {
                name: 'Rahul Mehta',
                mobile: '6655443322'
            },
            project: 'Sector 4 Kurukshetra',
            propertyNumber: '2 BHK-15 Marla',
            block: 'East Block',
            executive: 'Neha Gupta',
            agentName: 'Rahul Jain',
            agentCompany: 'Prime Estates',
            agreementAmount: '₹ 0',
            finalDate: 'N/A',
            price: '₹ 85,00,000',
            brokerage: '₹ 0',
            brokeragePercent: 'N/A',
            paymentReceived: '₹ 0',
            paymentPending: '₹ 0',
            paymentPlan: 'N/A',
            followup: 'N/A',
            remarks: 'Cancelled by Customer, Refund Processed'
        },
        {
            id: 5,
            sno: 5,
            date: '12-08-2024',
            time: '09:45 AM',
            dealType: 'Sell',
            formNumber: 'Form 5',
            stage: 'Agreement',
            seller: {
                name: 'Kavita Reddy',
                mobile: '5544332211'
            },
            buyer: {
                name: 'Arun Kumar',
                mobile: '4433221100'
            },
            project: 'Sector 3 Kurukshetra',
            propertyNumber: 'Plot-1200',
            block: 'Third Block',
            executive: 'Arun Mehta',
            agentName: 'Kavita Singh',
            agentCompany: 'Royal Builders',
            agreementAmount: '₹ 4,80,000',
            finalDate: 'Lock in: 12 months',
            price: '₹ 96,00,000',
            brokerage: '₹ 1,92,000',
            brokeragePercent: '1+1',
            paymentReceived: '₹ 4,80,000',
            paymentPending: '₹ 91,20,000',
            paymentPlan: 'Construction Linked Payment Plan (CLPP)',
            followup: '20-08-2024',
            remarks: 'Agreement signed, Registry pending'
        },
        {
            id: 6,
            sno: 6,
            date: '28-07-2024',
            time: '03:00 PM',
            dealType: 'Rent',
            formNumber: 'Form 6',
            stage: 'Pending',
            seller: {
                name: 'Deepak Sharma',
                mobile: '9988112233'
            },
            buyer: {
                name: 'Pooja Singh',
                mobile: '8877001122'
            },
            project: 'Sector 8 Kurukshetra',
            propertyNumber: '3 BHK-20 Marla',
            block: 'West Block',
            executive: 'Kavita Reddy',
            agentName: 'Manoj Kumar',
            agentCompany: 'Dream Homes',
            agreementAmount: '₹ 6,00,000',
            finalDate: '28-08-2024',
            price: '₹ 1,20,00,000',
            brokerage: '₹ 2,40,000',
            brokeragePercent: '1+1',
            paymentReceived: '₹ 6,00,000',
            paymentPending: '₹ 1,14,00,000',
            paymentPlan: 'Subvention Scheme',
            followup: '05-08-2024',
            remarks: 'Awaiting Approval from Bank'
        }
    ];

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.length === bookingData.length ? [] : bookingData.map(b => b.id)
        );
    };

    // Calculate totals
    const totalBookings = bookingData.length;
    const totalPrice = bookingData.reduce((sum, booking) => {
        const price = parseInt(booking.price.replace(/[₹,]/g, ''));
        return sum + price;
    }, 0);
    const totalReceived = bookingData.reduce((sum, booking) => {
        const received = parseInt(booking.paymentReceived.replace(/[₹,]/g, ''));
        return sum + received;
    }, 0);
    const totalPending = bookingData.reduce((sum, booking) => {
        const pending = parseInt(booking.paymentPending.replace(/[₹,]/g, ''));
        return sum + pending;
    }, 0);

    return (
        <section className="main-content">
            <div className="page-container">
                {/* Page Header */}
                <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #eef2f5', padding: '1rem 1.5rem' }}>
                    <div className="page-title-group">
                        <i className="fas fa-file-invoice-dollar" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Post Sale</span>
                            <h1>Deals</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-handshake"></i> Booking
                        </button>
                        <button
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={() => onNavigate && onNavigate('account')}
                        >
                            <i className="fas fa-wallet"></i> Account
                        </button>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-plus"></i> Add Booking
                        </button>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-filter"></i> Filter
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div style={{ padding: '11px 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                        {['All Booking', 'Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '7.5px 0',
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
                                <button className="action-btn"><i className="fas fa-edit"></i> Edit</button>
                                <button className="action-btn"><i className="fas fa-file-invoice"></i> Invoice</button>
                                <button className="action-btn"><i className="fas fa-check-circle"></i> Approve</button>
                                <div style={{ flex: 1 }}></div>
                                <button className="action-btn delete-btn"><i className="fas fa-trash-alt"></i> Delete</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                <div className="search-box" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
                                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search bookings by name, project, or unit..."
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
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Items: {bookingData.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Booking List Header */}
                    <div className="list-header booking-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === bookingData.length} /></div>
                        <div>S.No</div>
                        <div>Date</div>
                        <div>Status</div>
                        <div>Customer</div>
                        <div>Property Details</div>
                        <div>Executive/Agent</div>
                        <div>Terms</div>
                        <div>Amount</div>
                        <div>Commission</div>
                        <div>Followup & Remarks</div>
                    </div>

                    {/* Booking List */}
                    <div className="list-content" style={{ background: '#fafbfc', padding: '1rem 1rem' }}>
                        {bookingData.map((booking) => (
                            <div
                                key={booking.id}
                                className="list-item booking-list-grid"
                                style={{
                                    marginBottom: '10px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(booking.id)}
                                    onChange={() => toggleSelect(booking.id)}
                                />

                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>{booking.sno}</div>

                                {/* Date: Deal Type + Date + Time - Aligned */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        padding: '3px 8px',
                                        borderRadius: '10px',
                                        fontWeight: 800,
                                        width: 'fit-content',
                                        background: booking.dealType === 'Sell' ? '#dbeafe' :
                                            booking.dealType === 'Rent' ? '#fef3c7' : '#e0e7ff',
                                        color: booking.dealType === 'Sell' ? '#1e40af' :
                                            booking.dealType === 'Rent' ? '#92400e' : '#4338ca',
                                        border: booking.dealType === 'Sell' ? '1px solid #93c5fd' :
                                            booking.dealType === 'Rent' ? '1px solid #fcd34d' : '1px solid #a5b4fc'
                                    }}>
                                        {booking.dealType}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{booking.date}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{booking.time}</div>
                                </div>

                                {/* Status: Form Number + Stage - Aligned */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                    <div style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        color: '#fff',
                                        background: '#0891b2',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        textAlign: 'center',
                                        width: 'fit-content'
                                    }}>
                                        {booking.formNumber}
                                    </div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        background: booking.stage === 'Pending' ? '#fef3c7' :
                                            booking.stage === 'Booked' ? '#d1fae5' :
                                                booking.stage === 'Agreement' ? '#dbeafe' :
                                                    booking.stage === 'Registry' ? '#e0e7ff' : '#fee2e2',
                                        color: booking.stage === 'Pending' ? '#92400e' :
                                            booking.stage === 'Booked' ? '#065f46' :
                                                booking.stage === 'Agreement' ? '#1e40af' :
                                                    booking.stage === 'Registry' ? '#4338ca' : '#991b1b',
                                        border: booking.stage === 'Pending' ? '1px solid #fcd34d' :
                                            booking.stage === 'Booked' ? '1px solid #6ee7b7' :
                                                booking.stage === 'Agreement' ? '1px solid #93c5fd' :
                                                    booking.stage === 'Registry' ? '1px solid #a5b4fc' : '1px solid #fca5a5',
                                        textAlign: 'center',
                                        width: 'fit-content'
                                    }}>
                                        {booking.stage}
                                    </span>
                                </div>

                                {/* Customer: Seller + Buyer - Compact with labels */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{booking.seller.name}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#8e44ad', fontWeight: 600 }}>
                                            <i className="fas fa-phone" style={{ marginRight: '3px', fontSize: '0.6rem' }}></i>{booking.seller.mobile}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, marginTop: '-2px' }}>Seller</div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{booking.buyer.name}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#8e44ad', fontWeight: 600 }}>
                                            <i className="fas fa-phone" style={{ marginRight: '3px', fontSize: '0.6rem' }}></i>{booking.buyer.mobile}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, marginTop: '-2px' }}>Buyer</div>
                                </div>

                                {/* Property Details: Property Number (large) + Block + Project (small) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 800 }}>
                                        {booking.propertyNumber}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        {booking.block}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                                        <i className="fas fa-building" style={{ marginRight: '4px' }}></i>{booking.project}
                                    </div>
                                </div>

                                {/* Executive & Agent */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '2px' }}>
                                            Executive
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700 }}>
                                            {booking.executive}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '2px' }}>
                                            {booking.agentName}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
                                            {booking.agentCompany}
                                        </div>
                                    </div>
                                </div>

                                {/* Terms: Agreement Amount + Final Date */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 700 }}>
                                            {booking.agreementAmount}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            {booking.dealType === 'Rent' || booking.dealType === 'Lease' ? 'Security Amount' : 'Agreement Amount'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
                                            {booking.finalDate}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            {booking.dealType === 'Rent' || booking.dealType === 'Lease' ? 'Lock in Period' : 'Full & Final Date'}
                                        </div>
                                    </div>
                                </div>

                                {/* Amount: Deal Value + Brokerage */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 800 }}>
                                            {booking.price}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Deal Value
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 700 }}>
                                            {booking.brokerage}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Brokerage % {booking.brokeragePercent}
                                        </div>
                                    </div>
                                </div>

                                {/* Commission Details: Payment Received + Payment Pending */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 700 }}>
                                            {booking.paymentReceived}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Payment Received
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 700 }}>
                                            {booking.paymentPending}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Payment Pending
                                        </div>
                                    </div>
                                </div>

                                {/* Followup & Remarks */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
                                            {booking.followup}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Followup Date
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>
                                            {booking.remarks}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            Remarks
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Footer */}
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
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0891b2' }}>₹{totalPrice.toLocaleString('en-IN')}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Tot. Recd. Amount</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>₹{totalReceived.toLocaleString('en-IN')}</div>
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
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#dc2626' }}>₹{totalPending.toLocaleString('en-IN')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default BookingView;
