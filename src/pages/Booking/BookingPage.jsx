import React, { useState, useMemo, useEffect, useCallback } from 'react';
import AccountPage from '../Account/AccountPage';
import AddBookingModal from '../../components/AddBookingModal';
import PaymentScheduleDrawer from '../../components/PaymentScheduleDrawer';
import BookingFilterPanel from '../../components/BookingFilterPanel';
import BookingAnalytics from './BookingAnalytics';
import { api } from '../../utils/api';
import ClosingFormModal from '../../components/ClosingFormModal';
import { usePropertyConfig } from '../../context/PropertyConfigContext';

const BookingPage = ({ onNavigate, initialContextId }) => {
    const { getLookupValue } = usePropertyConfig();
    // View State: 'deals' | 'ledger' | 'analytics'
    const [currentView, setCurrentView] = useState('deals');

    // Active server-side filters
    const [activeFilters, setActiveFilters] = useState({});

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
    const [filters, setFilters] = useState({});
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const activeFilterCount = Object.values(activeFilters).filter(v => (Array.isArray(v) ? v.length > 0 : !!v)).length;

    // Payment Schedule Drawer
    const [drawerBooking, setDrawerBooking] = useState(null);

    // Dashboard KPI Stats (from server aggregate — true totals)
    const [dashStats, setDashStats] = useState(null);

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
    const [totalCount, setTotalCount] = useState(0);

    // Sorting State
    const [sortConfig, setSortConfig] = useState({ label: 'Booking Date', by: 'bookingDate', order: -1 });
    const [isSortOpen, setIsSortOpen] = useState(false);

    const fetchBookings = useCallback(async () => {
        setIsLoading(true);
        try {
            const skip = (currentPage - 1) * recordsPerPage;
            // Build query params including active filters
            const params = new URLSearchParams({
                limit: recordsPerPage,
                skip,
                sortBy: sortConfig.by,
                sortOrder: sortConfig.order,
            });
            // Append active filters
            if (activeFilters.status?.length)        activeFilters.status.forEach(s => params.append('status', s));
            if (activeFilters.health?.length)         activeFilters.health.forEach(h => params.append('health', h));
            if (activeFilters.salesAgent)             params.set('salesAgent', activeFilters.salesAgent);
            if (activeFilters.channelPartner)         params.set('channelPartner', activeFilters.channelPartner);
            if (activeFilters.project)               params.set('project', activeFilters.project);
            if (activeFilters.dateFrom)              params.set('dateFrom', activeFilters.dateFrom);
            if (activeFilters.dateTo)                params.set('dateTo', activeFilters.dateTo);
            if (activeFilters.minValue)              params.set('minValue', activeFilters.minValue);
            if (activeFilters.maxValue)              params.set('maxValue', activeFilters.maxValue);

            const response = await api.get(`/bookings?${params.toString()}`);
            if (response.data.success) {
                setTotalCount(response.data.count || 0);
                const mapped = response.data.data.map(b => ({
                    id: b.applicationNo || b._id.substring(b._id.length - 8).toUpperCase(),
                    _id: b._id,
                    dealType: b.type,
                    stage: b.status,
                    health: b.health || 'On Track',
                    healthReason: b.healthReason || null,
                    dealDate: b.bookingDate,
                    nextAction: b.nextAction || null,
                    customer: {
                        seller: {
                            name: b.seller?.name || 'N/A',
                            mobile: b.seller?.phones?.[0]?.number || b.seller?.mobile || '',
                            avatar: b.seller?.name?.substring(0, 2).toUpperCase() || 'S',
                            fatherName: b.seller?.fatherName || '',
                            address: b.seller?.personalAddress || {},
                            raw: b.seller || {}
                        },
                        buyer: {
                            name: b.lead?.name || 'N/A',
                            mobile: b.lead?.phones?.[0]?.number || '',
                            avatar: b.lead?.name?.substring(0, 2).toUpperCase() || 'NA',
                            fatherName: b.lead?.fatherName || '',
                            address: b.lead?.personalAddress || {},
                            raw: b.lead || {}
                        }
                    },
                    property: {
                        project: b.property?.projectName || b.property?.projectId?.name || b.project?.name || 'N/A',
                        unit: b.property?.unitNo || b.property?.unitNumber || 'N/A',
                        location: b.property?.location || b.project?.location || 'N/A',
                        block: b.property?.block || 'N/A',
                        sizeLabel: b.property?.sizeLabel || (b.property?.sizeConfig && typeof b.property.sizeConfig === 'object' ? b.property.sizeConfig.lookup_value : b.property?.sizeConfig) || (b.property?.size ? `${b.property.size} ${b.property.sizeUnit || 'Sq.Yd.'}` : 'N/A'),
                        category: b.property?.category || 'N/A',
                        subCategory: b.property?.subCategory || 'N/A',
                        unitType: b.property?.unitType || 'N/A',
                        builtupType: b.property?.builtupType || b.property?.builtupDetails || 'N/A'
                    },
                    financials: {
                        dealValue: b.totalDealAmount || 0,
                        totalPaidAmount: b.totalPaidAmount || 0,
                        totalBalanceAmount: b.totalBalanceAmount || 0,
                        agreementAmount: b.agreementAmount || 0,
                        agreementDate: b.agreementDate,
                        finalPaymentDate: b.finalPaymentDate,
                        tokenAmount: b.tokenAmount || 0,
                        bookingDate: b.bookingDate,
                        partPaymentAmount: b.partPaymentAmount || 0,
                        partPaymentDate: b.partPaymentDate,
                        commissionTotal: b.totalCommissionAmount || (parseFloat(b.sellerBrokerageAmount || 0) + parseFloat(b.buyerBrokerageAmount || 0)),
                        sellerBrokerageAmount: b.sellerBrokerageAmount || 0,
                        buyerBrokerageAmount: b.buyerBrokerageAmount || 0,
                        commissionReceived: b.commissionReceived || 0,
                        commissionPending: b.commissionPending || 0
                    }
                }));
                setBookings(mapped);
            }
        } catch (error) {
            console.error("Error fetching bookings:", error);
            setBookings([]);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, recordsPerPage, sortConfig, activeFilters]);

    const fetchDashStats = useCallback(async () => {
        try {
            const res = await api.get('/bookings/dashboard/stats');
            if (res.data.success) setDashStats(res.data.data);
        } catch (e) {
            console.warn('Dashboard stats unavailable:', e.message);
        }
    }, []);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    useEffect(() => {
        fetchDashStats();
    }, [fetchDashStats]);

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

    const handleGenerateDoc = async (docType) => {
        if (selectedIds.length !== 1) {
            alert("Please select exactly one booking to generate documents.");
            return;
        }
        const booking = filteredData.find(b => b.id === selectedIds[0]);
        if (!booking) return;

        try {
            // Open window immediately to avoid browser popup blockers
            const printWindow = window.open('', '_blank', 'width=900,height=800');
            if (!printWindow) {
                alert("Please allow popups to print documents.");
                return;
            }
            printWindow.document.write('<div style="font-family:sans-serif; text-align:center; padding: 50px;"><h2>Generating Document... Please wait.</h2></div>');
            
            const res = await api.get(`/bookings/${booking._id}/document?type=${encodeURIComponent(docType)}`);
            
            printWindow.document.open();
            printWindow.document.write(res.data);
            printWindow.document.write('<script>window.onload = function() { setTimeout(function(){ window.print(); window.close(); }, 500); }</script>');
            printWindow.document.close();
        } catch (err) {
            console.error("Error generating document:", err);
            alert("Failed to generate document. Please try again.");
        }
        setShowDocOptions(false);
    };

    // --- Stats: Use real server aggregate when available, fallback to page data ---
    const stats = useMemo(() => {
        if (dashStats) {
            return {
                totalDeals: dashStats.activeBookings,
                totalValue: dashStats.totalPipelineValue,
                pendingComm: dashStats.totalCommissionPending,
                atRiskDeals: dashStats.atRiskCount,
                criticalCount: dashStats.criticalCount,
                statusBreakdown: {
                    pending: dashStats.pendingCount,
                    booked: dashStats.bookedCount,
                    agreement: dashStats.agreementCount,
                    registry: dashStats.registryCount,
                    cancelled: dashStats.cancelledCount,
                }
            };
        }
        // Fallback to page-local computation
        const data = bookings;
        const totalDeals = data.filter(b => b.stage !== 'Cancelled').length;
        const totalValue = data.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.dealValue : sum, 0);
        const pendingComm = data.reduce((sum, b) => b.stage !== 'Cancelled' ? sum + b.financials.commissionPending : sum, 0);
        const atRiskDeals = data.filter(b => ['At Risk', 'Delayed', 'Critical'].includes(b.health)).length;
        return { totalDeals, totalValue, pendingComm, atRiskDeals, criticalCount: 0 };
    }, [bookings, dashStats]);

    // --- Filtering ---
    const filteredData = useMemo(() => {
        const data = bookings;
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

    if (currentView === 'analytics') {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <i className="fas fa-arrow-left"></i> Back to Bookings
                        </button>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700, color: '#0f172a' }}>Post-Sale Analytics</h2>
                    </div>
                    <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => setCurrentView('deals')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Bookings</button>
                        <button onClick={() => setCurrentView('analytics')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'default' }}>Analytics</button>
                        <button onClick={() => setCurrentView('ledger')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Ledger</button>
                    </div >
                </div >
                <div style={{ flex: 1, overflow: 'auto', background: '#f8fafc' }}>
                    <BookingAnalytics />
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
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        {/* View Switcher — Bookings | Ledger | Analytics */}
                        <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '10px', display: 'flex', gap: '2px' }}>
                            {[['deals','fa-list','Bookings'],['analytics','fa-chart-bar','Analytics'],['ledger','fa-wallet','Ledger']].map(([view, icon, label]) => (
                                <button key={view} onClick={() => setCurrentView(view)} style={{
                                    padding: '7px 14px', borderRadius: '7px', border: 'none',
                                    background: currentView === view ? '#fff' : 'transparent',
                                    color: currentView === view ? '#4f46e5' : '#64748b',
                                    fontWeight: currentView === view ? 700 : 600,
                                    fontSize: '0.82rem',
                                    boxShadow: currentView === view ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    <i className={`fas ${icon}`} style={{ fontSize: '0.75rem' }} />{label}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-export"></i> Export
                            </button>
                            <button className="btn-outline" onClick={() => setIsFilterPanelOpen(true)} style={{ position: 'relative' }}>
                                <i className="fas fa-filter"></i> Filters
                                {activeFilterCount > 0 && (
                                    <span style={{ 
                                        position: 'absolute', top: '-5px', right: '-5px', 
                                        width: '10px', height: '10px', background: 'red', borderRadius: '50%',
                                        border: '2px solid #fff', boxShadow: '0 0 5px rgba(255,0,0,0.3)' 
                                    }}></span>
                                )}
                            </button>
                        </div>
                    </div>
                </div >

                {/* Active Filter Pills */}
                {activeFilterCount > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>FILTERS:</span>
                        {activeFilters.status?.map(s => (
                            <span key={s} onClick={() => { const nf = { ...activeFilters, status: activeFilters.status.filter(x => x !== s) }; setActiveFilters(nf); }} style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Status: {s} <i className="fas fa-times" style={{ fontSize: '0.6rem' }} /></span>
                        ))}
                        {activeFilters.health?.map(h => (
                            <span key={h} onClick={() => { const nf = { ...activeFilters, health: activeFilters.health.filter(x => x !== h) }; setActiveFilters(nf); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Health: {h} <i className="fas fa-times" style={{ fontSize: '0.6rem' }} /></span>
                        ))}
                        {activeFilters.project && <span onClick={() => setActiveFilters(p => ({...p, project: ''}))} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Project: {activeFilters.project} <i className="fas fa-times" style={{ fontSize: '0.6rem' }} /></span>}
                        {(activeFilters.dateFrom || activeFilters.dateTo) && <span onClick={() => setActiveFilters(p => ({...p, dateFrom: '', dateTo: ''}))} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><i className="fas fa-calendar" /> {activeFilters.dateFrom||'…'} → {activeFilters.dateTo||'…'} <i className="fas fa-times" style={{ fontSize: '0.6rem' }} /></span>}
                        {(activeFilters.minValue || activeFilters.maxValue) && <span onClick={() => setActiveFilters(p => ({...p, minValue: '', maxValue: ''}))} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>₹{activeFilters.minValue||'0'} – ₹{activeFilters.maxValue||'∞'} <i className="fas fa-times" style={{ fontSize: '0.6rem' }} /></span>}
                        <button onClick={() => setActiveFilters({})} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '2px 6px' }}>Clear all</button>
                    </div>
                )}
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
                                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '220px', overflow: 'hidden' }}>
                                    <button onClick={() => handleGenerateDoc('Sale Agreement')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>
                                        <i className="fas fa-file-contract" style={{ marginRight: '8px', color: '#3b82f6' }}></i> Detailed Sale Agreement
                                    </button>
                                    <button onClick={() => handleGenerateDoc('Short Agreement')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-file-signature" style={{ marginRight: '8px', color: '#6366f1' }}></i> Short Agreement
                                    </button>
                                    <button onClick={() => handleGenerateDoc('Token Receipt')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-receipt" style={{ marginRight: '8px', color: '#10b981' }}></i> Token Receipt
                                    </button>
                                    <button onClick={() => handleGenerateDoc('Demand Letter')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-envelope-open-text" style={{ marginRight: '8px', color: '#f59e0b' }}></i> Demand Letter
                                    </button>
                                    <button onClick={() => handleGenerateDoc('Brokerage Invoice')} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
                                        <i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px', color: '#8b5cf6' }}></i> Brokerage Invoice
                                    </button>
                                </div>
                            )}
                        </div >
                        <div style={{ marginLeft: 'auto' }}>
                            <button style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}><i className="fas fa-trash-alt" style={{ marginRight: '6px' }}></i> Delete</button>
                        </div>
                    </div >
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ position: 'relative', width: '350px' }}>
                                <input 
                                    type="text" 
                                    className="search-input-premium"
                                    placeholder="Search bookings by ID, client or project..." 
                                    value={searchTerm} 
                                    onChange={(e) => setSearchTerm(e.target.value)} 
                                />
                                <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                            </div>
                            <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                                {['All', 'Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'].map(tab => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', border: 'none', background: activeTab === tab ? '#fff' : 'transparent', color: activeTab === tab ? '#0f172a' : '#64748b', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{tab}</button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>Total: <strong>{totalRecords}</strong></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                <span>Show:</span>
                                <select value={recordsPerPage} onChange={handleRecordsPerPageChange} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", outline: "none", cursor: "pointer", background: '#f8fafc' }}>
                                    {[10, 25, 50, 100, 300, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <button onClick={goToPreviousPage} disabled={currentPage === 1} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage === 1 ? "#f8fafc" : "#fff", color: currentPage === 1 ? "#cbd5e1" : "#0f172a", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}><i className="fas fa-chevron-left"></i> Prev</button>
                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", minWidth: "80px", textAlign: "center" }}>{currentPage} / {totalPages || 1}</span>
                                <button onClick={goToNextPage} disabled={currentPage >= totalPages} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage >= totalPages ? "#f8fafc" : "#fff", color: currentPage >= totalPages ? "#cbd5e1" : "#0f172a", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}>Next <i className="fas fa-chevron-right"></i></button>
                            </div>

                            {/* Standardized Sort Icon */}
                            <div style={{ position: 'relative' }}>
                                <button 
                                    className="btn-pagination-icon"
                                    style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        background: isSortOpen ? 'var(--primary-color)' : '#fff',
                                        color: isSortOpen ? '#fff' : '#64748b',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                    onClick={() => setIsSortOpen(!isSortOpen)}
                                    title={`Sort: ${sortConfig.label}`}
                                >
                                    <i className="fas fa-sort-amount-down-alt"></i>
                                </button>
                                {isSortOpen && (
                                    <React.Fragment>
                                        <div 
                                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                                            onClick={() => setIsSortOpen(false)} 
                                        />
                                        <ul className="shadow-lg border-0" style={{ 
                                            position: 'absolute', top: '100%', right: 0, zIndex: 999,
                                            backgroundColor: '#fff', borderRadius: '16px', padding: '10px', 
                                            minWidth: '220px', marginTop: '8px', listStyle: 'none',
                                            border: '1px solid #eef2f5'
                                        }}>
                                            <li><h6 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '10px 15px', margin: 0 }}>Advanced Sort</h6></li>
                                            {[
                                                { label: 'Booking Date', by: 'bookingDate', order: -1, icon: 'fa-calendar-alt' },
                                                { label: 'Agreement Date', by: 'agreementDate', order: -1, icon: 'fa-file-contract' },
                                                { label: 'Deal Value (High)', by: 'totalDealAmount', order: -1, icon: 'fa-sort-numeric-up' },
                                                { label: 'Deal Value (Low)', by: 'totalDealAmount', order: 1, icon: 'fa-sort-numeric-down' },
                                                { label: 'Token Amount', by: 'tokenAmount', order: -1, icon: 'fa-coins' },
                                            ].map((opt) => (
                                                <li key={opt.label}>
                                                    <button 
                                                        className={`d-flex align-items-center gap-3`} 
                                                        style={{ 
                                                            width: '100%', border: 'none', textAlign: 'left',
                                                            borderRadius: '10px', 
                                                            padding: '10px 15px', 
                                                            fontSize: '0.85rem',
                                                            fontWeight: sortConfig.label === opt.label ? 700 : 500,
                                                            color: sortConfig.label === opt.label ? '#fff' : '#1e293b',
                                                            background: sortConfig.label === opt.label ? 'var(--primary-color)' : 'transparent',
                                                            cursor: 'pointer',
                                                            marginBottom: '2px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onClick={() => {
                                                            setSortConfig(opt);
                                                            setIsSortOpen(false);
                                                            setCurrentPage(1);
                                                        }}
                                                    >
                                                        <i className={`fas ${opt.icon}`} style={{ width: '18px', opacity: sortConfig.label === opt.label ? 1 : 0.6 }}></i>
                                                        {opt.label}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </React.Fragment>
                                )}
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
                    <div style={{ flex: 1, overflow: 'auto', padding: '0px' }}>
                        <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                {/* Risk Alert Banner */}
                                {stats.atRiskDeals > 0 && (
                                    <div style={{ background: stats.criticalCount > 0 ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : 'linear-gradient(135deg, #fffbeb, #fef3c7)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #fecaca' }}>
                                        <i className={`fas fa-${stats.criticalCount > 0 ? 'fire' : 'exclamation-triangle'}`} style={{ color: stats.criticalCount > 0 ? '#dc2626' : '#d97706', fontSize: '1rem' }} />
                                        <span style={{ fontWeight: 700, color: stats.criticalCount > 0 ? '#991b1b' : '#92400e', fontSize: '0.85rem' }}>
                                            {stats.criticalCount > 0 ? `🚨 ${stats.criticalCount} booking(s) CRITICAL` : `⚠️ ${stats.atRiskDeals} booking(s) at risk`} — review payment timelines
                                        </span>
                                        <button onClick={() => { setActiveTab('All'); setActiveFilters(prev => ({ ...prev, health: ['At Risk', 'Delayed', 'Critical'] })); }} style={{ marginLeft: 'auto', fontSize: '0.78rem', padding: '4px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>
                                            View At Risk <i className="fas fa-arrow-right" />
                                        </button>
                                    </div>
                                )}
                            <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', background: '#f8fafc', padding: '16px 32px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                                const dealPaidPercent = Math.min(((item.financials.totalPaidAmount || 0) / (item.financials.dealValue || 1)) * 100, 100);
                                const commPaidPercent = item.financials.commissionTotal > 0 ? Math.min(((item.financials.commissionReceived || 0) / item.financials.commissionTotal) * 100, 100) : 0;
                                const urgencyColor = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Critical: '#dc2626' };

                                return (
                                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1.2fr 2fr 1.5fr 2fr 1.2fr', padding: '20px 32px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem', background: isSelected ? '#f0f9ff' : '#fff', transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => toggleSelect(item.id)}>
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
                                        <div onClick={e => { e.stopPropagation(); setDrawerBooking(item); }} style={{ cursor: 'pointer' }}>
                                            {item.nextAction?.label ? (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: urgencyColor[item.nextAction.urgency] || '#f59e0b', flexShrink: 0 }} />
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', lineHeight: 1.3 }}>{item.nextAction.label}</span>
                                                    </div>
                                                    {item.nextAction.dueDate && (
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '6px' }}>
                                                            <i className="fas fa-calendar" style={{ marginRight: '4px' }} />
                                                            {new Date(item.nextAction.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                        </div>
                                                    )}
                                                    <button style={{ fontSize: '0.72rem', padding: '3px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <i className="fas fa-wallet" style={{ marginRight: '4px' }} /> View Payments
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                    <br />
                                                    <button style={{ marginTop: '4px', fontSize: '0.72rem', padding: '3px 8px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <i className="fas fa-wallet" style={{ marginRight: '4px' }} /> Payments
                                                    </button>
                                                </div>
                                            )}
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
                onSave={() => { fetchBookings(); fetchDashStats(); }}
            />

            {drawerBooking && (
                <PaymentScheduleDrawer
                    booking={drawerBooking}
                    onClose={() => setDrawerBooking(null)}
                    onUpdate={() => { fetchBookings(); fetchDashStats(); }}
                />
            )}

            <BookingFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                currentFilters={activeFilters}
                onApply={(newFilters) => {
                    setActiveFilters(newFilters);
                    setCurrentPage(1);
                    fetchDashStats();
                }}
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
    <div style={{ background: '#fff', borderTop: '2px solid #e2e8f0', padding: '14px 32px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', position: 'sticky', bottom: 0, zIndex: 10 }}>
        {[
            { label: 'Total Active Bookings', value: stats.totalDeals, subValue: null, color: '#10b981', icon: 'fa-home' },
            { label: 'Active Pipeline Value', value: formatCurrency(stats.totalValue), subValue: null, color: '#0ea5e9', icon: 'fa-rupee-sign' },
            { label: 'Pending Commission', value: formatCurrency(stats.pendingComm), subValue: null, color: '#f59e0b', icon: 'fa-percentage' },
            { label: 'Deals At Risk', value: stats.atRiskDeals, subValue: stats.criticalCount > 0 ? `${stats.criticalCount} Critical` : null, color: stats.atRiskDeals > 0 ? '#ef4444' : '#10b981', icon: 'fa-exclamation-triangle' }
        ].map((stat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', background: `${stat.color}15`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`fas ${stat.icon}`} style={{ color: stat.color, fontSize: '0.9rem' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: stat.color, lineHeight: 1.2 }}>{stat.value}</span>
                    {stat.subValue && <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>{stat.subValue}</span>}
                </div>
            </div>
        ))}
    </div>
);

export default BookingPage;
