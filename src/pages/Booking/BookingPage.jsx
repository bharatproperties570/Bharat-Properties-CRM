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
    const [showDocOptions, setShowDocOptions] = useState(false); // Dropdown toggle

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    // Logic to handle specific deal navigation (Drill-down)
    const handleViewLedger = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('ledger');
    };

    const handleViewDeal = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('deals');
    };

    const printSaleAgreement = (booking) => {
        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Sale Agreement - ${booking.id}</title>
                        <style>
                            body { font-family: 'Times New Roman', serif; padding: 60px; line-height: 1.6; color: #000; }
                            .header { text-align: center; margin-bottom: 40px; }
                            .title { font-size: 24px; font-weight: bold; text-decoration: underline; margin-bottom: 20px; text-transform: uppercase; }
                            .section { margin-bottom: 20px; text-align: justify; }
                            .bold { font-weight: bold; }
                            .signature-box { margin-top: 80px; display: flex; justify-content: space-between; }
                            .sign { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 10px; }
                            .footer { margin-top: 50px; font-size: 0.8rem; text-align: center; color: #666; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h2>AGREEMENT TO SELL</h2>
                        </div>
                        <div class="section">
                            This Agreement to Sell is made on this <span class="bold">${new Date().toLocaleDateString()}</span> between:
                        </div>
                        <div class="section">
                            <span class="bold">SELLER:</span> ${booking.customer.seller.name}, R/o [Seller Address Placeholder] (hereinafter called the "FIRST PARTY").
                        </div>
                        <div class="section">
                            AND
                        </div>
                        <div class="section">
                            <span class="bold">BUYER:</span> ${booking.customer.buyer.name}, R/o [Buyer Address Placeholder] (hereinafter called the "SECOND PARTY").
                        </div>
                        <div class="section">
                            WHEREAS the First Party is the absolute owner and in possession of the property bearing Unit <span class="bold">${booking.property.unit}</span> in Project <span class="bold">${booking.property.project}</span> located at ${booking.property.location} (hereinafter called the "SAID PROPERTY").
                        </div>
                        <div class="section">
                            NOW THIS AGREEMENT WITNESSETH AS UNDER:
                            <ol>
                                <li>The First Party has agreed to sell the said property to the Second Party for a total consideration of <span class="bold">${formatCurrency(booking.financials.dealValue)}</span>.</li>
                                <li>The Second Party has paid an amount of <span class="bold">${formatCurrency(booking.financials.dealPaid)}</span> as advance/earnest money.</li>
                                <li>The balance amount shall be paid by the Second Party at the time of registration of the Sale Deed.</li>
                                <li>The First Party assures that the said property is free from all sorts of encumbrances.</li>
                            </ol>
                        </div>
                         <div class="signature-box">
                            <div class="sign">FIRST PARTY (Seller)</div>
                            <div class="sign">SECOND PARTY (Buyer)</div>
                        </div>
                         <div class="signature-box">
                            <div class="sign">WITNESS 1</div>
                            <div class="sign">WITNESS 2</div>
                        </div>
                        <script>window.onload = function() { window.print(); }</script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const printTokenReceipt = (booking) => {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Token Receipt - ${booking.id}</title>
                        <style>
                            body { font-family: sans-serif; padding: 40px; border: 2px solid #333; margin: 20px; }
                            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                            .row { display: flex; margin-bottom: 10px; }
                            .label { width: 150px; font-weight: bold; }
                            .value { flex: 1; border-bottom: 1px dotted #999; }
                            .amount { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; border: 1px solid #333; padding: 10px; background: #f9f9f9; }
                            .footer { margin-top: 40px; text-align: right; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>TOKEN RECEIPT</h1>
                            <h3>BHARAT PROPERTIES</h3>
                        </div>
                        <div class="row">
                            <span class="label">Date:</span>
                            <span class="value">${new Date().toLocaleDateString()}</span>
                        </div>
                        <div class="row">
                            <span class="label">Received with thanks from:</span>
                            <span class="value">${booking.customer.buyer.name}</span>
                        </div>
                         <div class="row">
                            <span class="label">Project/Unit:</span>
                            <span class="value">${booking.property.project} - ${booking.property.unit}</span>
                        </div>
                        <div class="amount">
                            Amount: ${formatCurrency(booking.financials.dealPaid)}
                        </div>
                        <div class="row">
                            <span class="label">Against:</span>
                            <span class="value">Booking Token / Advance for Property Purchase</span>
                        </div>
                        <div class="footer">
                            <br/><br/>
                            Authorised Signatory
                        </div>
                        <script>window.onload = function() { window.print(); }</script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const handleGenerateDoc = (docType) => {
        if (selectedIds.length !== 1) {
            alert("Please select exactly one booking to generate documents.");
            return;
        }
        const booking = filteredData.find(b => b.id === selectedIds[0]);
        if (!booking) return;

        if (docType === 'Sale Agreement') {
            printSaleAgreement(booking);
        } else if (docType === 'Token Receipt') {
            printTokenReceipt(booking);
        }
        setShowDocOptions(false);
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

    // Pagination Helpers
    const totalRecords = filteredData.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const paginatedData = filteredData.slice(
        (currentPage - 1) * recordsPerPage,
        currentPage * recordsPerPage
    );

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

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
                            <i className="fas fa-arrow-left"></i> Back to Bookings
                        </button>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700, color: '#0f172a' }}>Financial Control Center</h2>
                    </div>
                    {/* View Switcher Controls */}
                    <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Bookings</button>
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
                            <button onClick={() => setCurrentView('deals')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Bookings</button>
                            <button onClick={() => setCurrentView('ledger')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Ledger</button>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-export"></i> Reports
                            </button>
                            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(99,102,241, 0.2)' }}>
                                <i className="fas fa-plus"></i> New Booking
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPI Metrics Removed from Header as per request */}
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

                        {/* Documents Dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowDocOptions(!showDocOptions)}
                                className="action-btn"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                <i className="fas fa-file-contract"></i> Documents
                                <i className={`fas fa-chevron-${showDocOptions ? 'up' : 'down'}`} style={{ fontSize: '0.7rem', marginLeft: '4px' }}></i>
                            </button>
                            {/* Dropdown Menu */}
                            {showDocOptions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff',
                                    border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    zIndex: 50, minWidth: '160px', overflow: 'hidden'
                                }}>
                                    <button
                                        onClick={() => handleGenerateDoc('Sale Agreement')}
                                        style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.target.style.background = '#fff'}
                                    >
                                        <i className="fas fa-file-signature" style={{ marginRight: '8px', color: '#6366f1' }}></i> Sale Agreement
                                    </button>
                                    <button
                                        onClick={() => handleGenerateDoc('Token Receipt')}
                                        style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}
                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.target.style.background = '#fff'}
                                    >
                                        <i className="fas fa-receipt" style={{ marginRight: '8px', color: '#10b981' }}></i> Token Receipt
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ marginLeft: 'auto' }}>
                            <button style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                <i className="fas fa-trash-alt" style={{ marginRight: '6px' }}></i> Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    // Default Tab & Search Toolbar
                    // Default Tab & Search Toolbar
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        {/* Left: Search & Tabs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                <input
                                    type="text"
                                    placeholder="Search bookings, clients, properties..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                />
                            </div>

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
                        </div>

                        {/* Right: Pagination */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>
                                Total: <strong>{totalRecords}</strong>
                            </div>

                            {/* Records Per Page */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    fontSize: "0.8rem",
                                    color: "#64748b",
                                }}
                            >
                                <span>Show:</span>
                                <select
                                    value={recordsPerPage}
                                    onChange={handleRecordsPerPageChange}
                                    style={{
                                        padding: "4px 8px",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "6px",
                                        fontSize: "0.8rem",
                                        fontWeight: 600,
                                        color: "#0f172a",
                                        outline: "none",
                                        cursor: "pointer",
                                    }}
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={300}>300</option>
                                </select>
                            </div>

                            {/* Pagination Controls */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                }}
                            >
                                <button
                                    onClick={goToPreviousPage}
                                    disabled={currentPage === 1}
                                    style={{
                                        padding: "6px 12px",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "6px",
                                        background: currentPage === 1 ? "#f8fafc" : "#fff",
                                        color: currentPage === 1 ? "#cbd5e1" : "#0f172a",
                                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                    }}
                                >
                                    <i className="fas fa-chevron-left"></i> Prev
                                </button>
                                <span
                                    style={{
                                        fontSize: "0.8rem",
                                        fontWeight: 600,
                                        color: "#0f172a",
                                        minWidth: "80px",
                                        textAlign: "center",
                                    }}
                                >
                                    {currentPage} / {totalPages || 1}
                                </span>
                                <button
                                    onClick={goToNextPage}
                                    disabled={currentPage >= totalPages}
                                    style={{
                                        padding: "6px 12px",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "6px",
                                        background:
                                            currentPage >= totalPages ? "#f8fafc" : "#fff",
                                        color:
                                            currentPage >= totalPages ? "#cbd5e1" : "#0f172a",
                                        cursor:
                                            currentPage >= totalPages ? "not-allowed" : "pointer",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                    }}
                                >
                                    Next <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Data Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    {/* Table Header - ACTIONS COLUMN REMOVED */}
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredData.length && filteredData.length > 0} /></div>
                        <div>Booking & Status</div>
                        <div>Health</div>
                        <div>Stakeholders (Buyer/Seller)</div>
                        <div>Property</div>
                        <div>Financials</div>
                        <div>Next Action</div>
                    </div>

                    {/* Table Rows */}
                    {paginatedData.map(item => {
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
                                            <span>Booking: {formatCurrency(item.financials.dealValue)}</span>
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
                            <p>No bookings found matching your criteria.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Summary */}
            <SummaryFooter stats={stats} formatCurrency={formatCurrency} />
        </section >
    );
};

// --- Footer Summary Component (Replacing Header Stats) ---
const SummaryFooter = ({ stats, formatCurrency }) => (
    <div style={{
        background: '#fff', borderTop: '1px solid #e2e8f0', padding: '16px 32px',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px',
        position: 'sticky', bottom: 0, zIndex: 10
    }}>
        {[
            { label: 'Total Active Bookings', value: stats.totalDeals, color: '#10b981' },
            { label: 'Active Pipeline Value', value: formatCurrency(stats.totalValue), color: '#0ea5e9' },
            { label: 'Pending Commission', value: formatCurrency(stats.pendingComm), color: '#f59e0b' },
            { label: 'Deals At Risk', value: stats.atRiskDeals, color: '#ef4444' }
        ].map((stat, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{stat.label}</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: stat.color }}>{stat.value}</span>
            </div>
        ))}
    </div>
);

export default BookingPage;
