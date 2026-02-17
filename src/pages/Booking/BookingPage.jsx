import React, { useState, useMemo, useEffect } from 'react';
import { bookingData } from '../../data/bookingData';
import AccountPage from '../Account/AccountPage'; // Import AccountPage as a sub-view
import AddBookingModal from '../../components/AddBookingModal';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import ClosingFormModal from '../../components/ClosingFormModal';

const BookingPage = ({ onNavigate, initialContextId }) => {
    // View State: 'deals' (Command Center) or 'ledger' (Financial Control)
    const [currentView, setCurrentView] = useState('deals');

    // --- Deals State ---
    const [activeTab, setActiveTab] = useState('All');
    const [searchTerm, setSearchTerm] = useState(initialContextId || '');
    const [selectedIds, setSelectedIds] = useState([]);
    const [showDocOptions, setShowDocOptions] = useState(false); // Dropdown toggle
    const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false);
    const [bookings, setBookings] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [bookingToClose, setBookingToClose] = useState(null);

    const handleFeedbackClick = () => {
        const booking = bookings.find(b => b.id === selectedIds[0]);
        if (booking) {
            setBookingToClose(booking);
            setIsClosingModalOpen(true);
        }
    };

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    const fetchBookings = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/bookings');
            if (response.data.success) {
                const mapped = response.data.data.map(b => ({
                    id: b.id || b._id.substring(b._id.length - 8).toUpperCase(),
                    _id: b._id,
                    dealType: b.type,
                    stage: b.status,
                    health: b.health || 'On Track',
                    dealDate: b.bookingDate,
                    customer: {
                        seller: {
                            name: b.seller?.name || 'N/A',
                            mobile: b.seller?.phones?.[0]?.number || b.seller?.mobile || '',
                            avatar: b.seller?.name?.substring(0, 2).toUpperCase() || 'S'
                        },
                        buyer: {
                            name: b.lead?.name || 'N/A',
                            mobile: b.lead?.phones?.[0]?.number || '',
                            avatar: b.lead?.name?.substring(0, 2).toUpperCase() || 'NA'
                        }
                    },
                    property: {
                        project: b.property?.projectName || b.project?.name || 'N/A',
                        unit: b.property?.unitNo || b.property?.unitNumber || 'N/A',
                        location: b.property?.location || b.project?.location || 'N/A',
                        block: b.property?.block || 'N/A'
                    },
                    financials: {
                        dealValue: b.totalDealAmount || 0,
                        agreementAmount: b.agreementAmount || 0,
                        agreementDate: b.agreementDate,
                        finalPaymentDate: b.finalPaymentDate,
                        commissionTotal: b.totalCommissionAmount || (parseFloat(b.sellerBrokerageAmount || 0) + parseFloat(b.buyerBrokerageAmount || 0)),
                        sellerBrokerageAmount: b.sellerBrokerageAmount || 0,
                        buyerBrokerageAmount: b.buyerBrokerageAmount || 0,
                        commissionReceived: b.commissionReceived || 0,
                        commissionPending: b.commissionPending || 0
                    },
                    timeline: {
                        daysInStage: 0,
                        nextAction: null
                    }
                }));
                // We show mock data along with real data for development/visualization if requested, 
                // but usually we should just show real data. For now, let's show real data and fallback to mock if empty.
                setBookings(mapped.length > 0 ? mapped : bookingData);
            }
        } catch (error) {
            console.error("Error fetching bookings:", error);
            setBookings(bookingData); // Fallback
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBookings();
    }, []);

    // Logic to handle specific deal navigation (Drill-down)
    const handleViewLedger = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('ledger');
    };

    const handleViewDeal = (dealId) => {
        setSearchTerm(dealId);
        setCurrentView('deals');
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    const numberToIndianWords = (num) => {
        if (num === 0) return 'Zero';
        const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const double = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const format = (n, suffix) => (n > 0 ? `${wordify(n)} ${suffix} ` : '');
        const wordify = (n) => {
            if (n >= 100) return `${single[Math.floor(n / 100)]} Hundred ${wordify(n % 100)}`;
            if (n >= 20) return `${tens[Math.floor(n / 10)]} ${single[n % 10]}`;
            if (n >= 10) return double[n - 10];
            return single[n];
        };
        let res = '';
        res += format(Math.floor(num / 10000000), 'Crore');
        res += format(Math.floor((num / 100000) % 100), 'Lakh');
        res += format(Math.floor((num / 1000) % 100), 'Thousand');
        res += wordify(num % 1000);
        return res.trim();
    };

    const printShortAgreement = (booking) => {
        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Short Agreement - ${booking.id}</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; line-height: 1.5; color: #334155; }
                            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
                            .title { font-size: 22px; font-weight: bold; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; }
                            .party-info { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; background: #f8fafc; padding: 20px; borderRadius: 12px; }
                            .party-box h4 { margin: 0 0 10px 0; color: #6366f1; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px; }
                            .party-name { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
                            .section { margin-bottom: 25px; }
                            .section-title { font-weight: 800; color: #1e293b; margin-bottom: 10px; border-left: 4px solid #6366f1; padding-left: 10px; }
                            .terms { padding-left: 20px; }
                            .terms li { margin-bottom: 8px; text-align: justify; }
                            .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
                            .sign-box { text-align: center; width: 220px; }
                            .sign-line { border-top: 2px solid #cbd5e1; margin-bottom: 10px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="title">Property Booking Agreement</div>
                            <div style="color: #64748b; font-size: 0.9rem; margin-top: 5px;">Reference ID: ${booking.id} | Date: ${new Date().toLocaleDateString()}</div>
                        </div>

                        <div class="party-info">
                            <div class="party-box">
                                <h4>First Party (Seller)</h4>
                                <div class="party-name">${booking.customer.seller.name}</div>
                                <div style="font-size: 0.85rem;">Mobile: ${booking.customer.seller.mobile}</div>
                            </div>
                            <div class="party-box">
                                <h4>Second Party (Buyer)</h4>
                                <div class="party-name">${booking.customer.buyer.name}</div>
                                <div style="font-size: 0.85rem;">Mobile: ${booking.customer.buyer.mobile}</div>
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-title">Property Details</div>
                            <p>Development/Project: <strong>${booking.property.project}</strong><br/>
                               Unit/Plot No: <strong>${booking.property.unit}</strong> | Block: <strong>${booking.property.block}</strong><br/>
                               Location: <strong>${booking.property.location}</strong>
                            </p>
                        </div>

                        <div class="section">
                            <div class="section-title">Financial Summary</div>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0;">Total Consideration:</td>
                                    <td style="text-align: right; font-weight: 700;">${formatCurrency(booking.financials.dealValue)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;">Booking Token Received:</td>
                                    <td style="text-align: right; font-weight: 700;">${formatCurrency(booking.financials.agreementAmount)}</td>
                                </tr>
                                <tr style="border-top: 1px solid #e2e8f0;">
                                    <td style="padding: 8px 0; font-weight: 700;">Balance Payment:</td>
                                    <td style="text-align: right; font-weight: 800; color: #6366f1;">${formatCurrency(booking.financials.dealValue - booking.financials.agreementAmount)}</td>
                                </tr>
                            </table>
                        </div>

                        <div class="section">
                            <div class="section-title">Agreed Terms & Conditions</div>
                            <ul class="terms">
                                <li>The Second Party has verified the property and title documents and is satisfied with the same.</li>
                                <li>The balance amount shall be paid on or before <strong>${booking.financials.finalPaymentDate ? new Date(booking.financials.finalPaymentDate).toLocaleDateString() : 'the time of registration'}</strong>.</li>
                                <li>The First Party shall be responsible for clear title and handing over possession upon full payment.</li>
                                <li>Transfer charges, registry fees, and other government levies shall be borne by the Second Party.</li>
                                <li>If the Second Party fails to pay the balance within the stipulated time, the token amount may be forfeited.</li>
                            </ul>
                        </div>

                        <div class="footer">
                            <div class="sign-box">
                                <div class="sign-line"></div>
                                <strong>Seller Signature</strong>
                            </div>
                            <div class="sign-box">
                                <div class="sign-line"></div>
                                <strong>Buyer Signature</strong>
                            </div>
                        </div>
                        <script>window.onload = function() { window.print(); window.close(); }</script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const printTokenReceipt = (booking) => {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
            const amountInWords = numberToIndianWords(booking.financials.agreementAmount);
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Token Receipt - ${booking.id}</title>
                        <style>
                            body { font-family: sans-serif; padding: 40px; border: 4px double #333; margin: 20px; }
                            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 30px; }
                            .receipt-no { float: right; font-weight: bold; }
                            .row { display: flex; margin-bottom: 15px; align-items: baseline; }
                            .label { min-width: 180px; font-weight: bold; color: #444; }
                            .value { flex: 1; border-bottom: 1px dotted #666; padding-left: 10px; font-weight: 600; }
                            .amount-box { margin: 30px 0; background: #f8fafc; border: 2px solid #333; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
                            .amount-val { font-size: 24px; font-weight: 800; }
                            .words { font-style: italic; color: #6366f1; font-weight: 600; font-size: 0.9rem; }
                            .footer { margin-top: 60px; display: flex; justify-content: space-between; }
                            .stamp { width: 100px; height: 100px; border: 1px dashed #ccc; display: flex; alignItems: center; justifyContent: center; color: #ccc; font-size: 0.7rem; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="receipt-no">No: ${booking.id}</div>
                            <h1 style="margin: 0; color: #1e293b;">TOKEN RECEIPT</h1>
                            <h2 style="margin: 5px 0; color: #6366f1;">BHARAT PROPERTIES</h2>
                            <p style="margin: 0; font-size: 0.8rem; color: #64748b;">Premium Real Estate Services</p>
                        </div>
                        <div class="row">
                            <span class="label">Date:</span>
                            <span class="value">${booking.dealDate ? new Date(booking.dealDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                        </div>
                        <div class="row">
                            <span class="label">Received with thanks from:</span>
                            <span class="value">${booking.customer.buyer.name}</span>
                        </div>
                         <div class="row">
                            <span class="label">Sum of Rupees:</span>
                            <span class="value">${amountInWords} Only</span>
                        </div>
                         <div class="row">
                            <span class="label">Against Project/Unit:</span>
                            <span class="value">${booking.property.project} (${booking.property.unit})</span>
                        </div>
                        <div class="amount-box">
                            <span class="amount-val">${formatCurrency(booking.financials.agreementAmount)}</span>
                            <span class="words">Payment for Booking Token</span>
                        </div>
                        <div class="footer">
                            <div class="stamp">E-STAMP / SEAL</div>
                            <div style="text-align: center;">
                                <br/><br/>
                                -----------------------------------
                                <br/>
                                <strong>Authorised Signatory</strong>
                            </div>
                        </div>
                        <script>window.onload = function() { window.print(); window.close(); }</script>
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

        if (docType === 'Short Agreement') {
            printShortAgreement(booking);
        } else if (docType === 'Token Receipt') {
            printTokenReceipt(booking);
        }
        setShowDocOptions(false);
    };

    // --- Stats Calculation ---
    const stats = useMemo(() => {
        const data = bookings.length > 0 ? bookings : bookingData;
        const totalDeals = data.length;
        const totalValue = data.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.dealValue : sum, 0);
        const pendingComm = data.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.commissionPending : sum, 0);
        const atRiskDeals = data.filter(b => b.health === 'At Risk' || b.health === 'Delayed').length;
        return { totalDeals, totalValue, pendingComm, atRiskDeals };
    }, [bookings]);

    // --- Filtering ---
    const filteredData = useMemo(() => {
        const data = bookings.length > 0 ? bookings : bookingData;
        return data.filter(item => {
            const matchesTab = activeTab === 'All' || item.stage === activeTab;
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                item.customer.buyer.name.toLowerCase().includes(searchLower) ||
                item.customer.seller.name.toLowerCase().includes(searchLower) ||
                item.property.project.toLowerCase().includes(searchLower) ||
                item.id.toLowerCase().includes(searchLower);
            return matchesTab && matchesSearch;
        });
    }, [activeTab, searchTerm, bookings]);

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
        if (selectedIds.length === filteredData.length && filteredData.length > 0) setSelectedIds([]);
        else setSelectedIds(filteredData.map(d => d.id));
    };

    const selectedCount = selectedIds.length;

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

    if (currentView === 'ledger') {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <i className="fas fa-arrow-left"></i> Back to Bookings
                        </button>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700, color: '#0f172a' }}>Financial Control Center</h2>
                    </div>
                    <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Bookings</button>
                        <button onClick={() => setCurrentView('ledger')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Ledger</button>
                    </div >
                </div >
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
            </div >
        );
    }

    return (
        <section className="main-content" style={{ background: '#f8fafc', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '20px 32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <i className="fas fa-chart-line" style={{ color: '#6366f1', fontSize: '1.2rem' }}></i>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Post-Sale Command Center</h1>
                        </div>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Track deals, monitor risks, and ensure timely closings.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                            <button onClick={() => setCurrentView('deals')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Bookings</button>
                            <button onClick={() => setCurrentView('ledger')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Ledger</button>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-export"></i> Reports
                            </button>
                            <button onClick={() => setIsAddBookingModalOpen(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(99,102,241, 0.2)' }}>
                                <i className="fas fa-plus"></i> New Booking
                            </button>
                        </div>
                    </div>
                </div >
            </div >

            <div style={{ padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '72px' }}>
                {selectedCount > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', animation: 'fadeIn 0.2s ease-in-out' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                            <input type="checkbox" checked={selectedCount > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.9rem' }}>{selectedCount} Selected</span>
                        </div>
                        <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>
                        {selectedCount === 1 && (
                            <button
                                onClick={() => handleViewLedger(selectedIds[0])}
                                className="action-btn"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                <i className="fas fa-wallet" style={{ color: '#0ea5e9' }}></i> View Ledger
                            </button>
                        )}
                        <button className="action-btn" title="Edit"><i className="fas fa-edit"></i> Edit</button>
                        <button
                            className="action-btn"
                            title="Feedback/Close"
                            style={{ background: '#f5f0ff', color: '#7e22ce', borderColor: '#e9d5ff' }}
                            onClick={handleFeedbackClick}
                        >
                            <i className="fas fa-comment-alt"></i> Feedback
                        </button>
                        <button className="action-btn" title="Activities"><i className="fas fa-calendar-check"></i> Activities</button>
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowDocOptions(!showDocOptions)} className="action-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <i className="fas fa-file-contract"></i> Documents
                                <i className={`fas fa-chevron-${showDocOptions ? 'up' : 'down'}`} style={{ fontSize: '0.7rem', marginLeft: '4px' }}></i>
                            </button>
                            {showDocOptions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '160px', overflow: 'hidden' }}>
                                    <button onClick={() => handleGenerateDoc('Short Agreement')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-file-signature" style={{ marginRight: '8px', color: '#6366f1' }}></i> Short Agreement
                                    </button>
                                    <button onClick={() => handleGenerateDoc('Token Receipt')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
                                        <i className="fas fa-receipt" style={{ marginRight: '8px', color: '#10b981' }}></i> Token Receipt
                                    </button>
                                </div >
                            )}
                        </div >
                        <div style={{ marginLeft: 'auto' }}>
                            <button style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}><i className="fas fa-trash-alt" style={{ marginRight: '6px' }}></i> Delete</button>
                        </div>
                    </div >
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                <input type="text" placeholder="Search bookings..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                                {['All', 'Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'].map(tab => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', border: 'none', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#0f172a' : '#64748b', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{tab}</button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>Total: <strong>{totalRecords}</strong></div>
                            <select value={recordsPerPage} onChange={handleRecordsPerPageChange} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", outline: "none", cursor: "pointer" }}>
                                {[10, 25, 50, 100, 300].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <button onClick={goToPreviousPage} disabled={currentPage === 1} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage === 1 ? "#f8fafc" : "#fff", color: currentPage === 1 ? "#cbd5e1" : "#0f172a", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}><i className="fas fa-chevron-left"></i> Prev</button>
                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", minWidth: "80px", textAlign: "center" }}>{currentPage} / {totalPages || 1}</span>
                                <button onClick={goToNextPage} disabled={currentPage >= totalPages} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage >= totalPages ? "#f8fafc" : "#fff", color: currentPage >= totalPages ? "#cbd5e1" : "#0f172a", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Next <i className="fas fa-chevron-right"></i></button>
                            </div>
                        </div >
                    </div >
                )}
            </div >

            {
                isLoading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} >
                        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    </div >
                ) : (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredData.length && filteredData.length > 0} /></div>
                                <div>Booking & Status</div>
                                <div>Health</div>
                                <div>Stakeholders</div>
                                <div>Property</div>
                                <div>Financials</div>
                                <div>Next Action</div>
                            </div>
                            {paginatedData.map(item => {
                                const stageStyle = getStageColor(item.stage);
                                const healthColor = getHealthColor(item.health);
                                const isSelected = selectedIds.includes(item.id);
                                const dealPaidPercent = Math.min(((item.financials.dealPaid || 0) / (item.financials.dealValue || 1)) * 100, 100);
                                const commPaidPercent = item.financials.commissionTotal > 0 ? Math.min(((item.financials.commissionReceived || 0) / item.financials.commissionTotal) * 100, 100) : 0;

                                return (
                                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', padding: '20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem', background: isSelected ? '#f0f9ff' : '#fff', transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => toggleSelect(item.id)}>
                                        <div onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} /></div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{item.id}</div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ background: item.dealType === 'Sell' || item.dealType === 'Sale' ? '#dbeafe' : '#fef3c7', color: item.dealType === 'Sell' || item.dealType === 'Sale' ? '#1e40af' : '#92400e', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{item.dealType}</span>
                                                <span style={{ background: stageStyle.bg, color: stageStyle.text, border: `1px solid ${stageStyle.border}`, fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>{item.stage}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: healthColor }}></div>
                                                <span style={{ fontWeight: 600, color: healthColor, fontSize: '0.85rem' }}>{item.health}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '24px', height: '24px', background: '#e0e7ff', color: '#4338ca', borderRadius: '50%', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{item.customer.buyer.avatar}</div>
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{item.customer.buyer.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Buyer</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                                                    <div style={{ width: '20px', height: '20px', background: '#f1f5f9', color: '#475569', borderRadius: '50%', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{item.customer.seller.avatar}</div>
                                                    <div>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{item.customer.seller.name}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Seller</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>{item.property.unit}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '2px' }}>{item.property.project}</div>
                                        </div>
                                        <div style={{ paddingRight: '20px' }}>
                                            <div style={{ marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}><span>Val: {formatCurrency(item.financials.dealValue)}</span><span>{Math.round(dealPaidPercent)}%</span></div>
                                                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px' }}><div style={{ width: `${dealPaidPercent}%`, height: '100%', background: '#0ea5e9', borderRadius: '3px' }}></div></div>
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}><span>Comm: {formatCurrency(item.financials.commissionTotal)}</span><span>{Math.round(commPaidPercent)}%</span></div>
                                                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px' }}><div style={{ width: `${commPaidPercent}%`, height: '100%', background: '#10b981', borderRadius: '3px' }}></div></div>
                                            </div>
                                        </div>
                                        <div>
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No pending actions</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {
                                filteredData.length === 0 && (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '10px' }}></i>
                                        <p>No bookings found.</p>
                                    </div>
                                )
                            }
                        </div >
                    </div >
                )}

            <AddBookingModal
                isOpen={isAddBookingModalOpen}
                onClose={() => setIsAddBookingModalOpen(false)}
                onSave={() => fetchBookings()}
            />

            < SummaryFooter stats={stats} formatCurrency={formatCurrency} />
            {isClosingModalOpen && bookingToClose && (
                <ClosingFormModal
                    isOpen={isClosingModalOpen}
                    onClose={() => {
                        setIsClosingModalOpen(false);
                        setBookingToClose(null);
                    }}
                    entity={bookingToClose}
                    entityType="Booking"
                    onComplete={() => {
                        fetchBookings();
                        setSelectedIds([]);
                    }}
                />
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section >
    );
};

const SummaryFooter = ({ stats, formatCurrency }) => (
    <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '16px 32px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', position: 'sticky', bottom: 0, zIndex: 10 }}>
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
