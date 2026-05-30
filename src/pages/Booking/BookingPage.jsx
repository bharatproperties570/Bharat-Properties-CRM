import React, { useState, useMemo, useEffect, useCallback } from 'react';
import AccountPage from '../Account/AccountPage';
import AddBookingModal from '../../components/AddBookingModal';
import PaymentScheduleDrawer from '../../components/PaymentScheduleDrawer';
import BookingFilterPanel from '../../components/BookingFilterPanel';
import BookingAnalytics from './BookingAnalytics';
import { api } from '../../utils/api';
import ClosingFormModal from '../../components/ClosingFormModal';

const BookingPage = ({ onNavigate, initialContextId }) => {
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
                        sizeLabel: b.property?.sizeLabel || (b.property?.sizeConfig && typeof b.property.sizeConfig === 'object' ? b.property.sizeConfig.lookup_value : b.property?.sizeConfig) || (b.property?.size ? `${b.property.size} ${b.property.sizeUnit || 'Sq.Yd.'}` : 'N/A')
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

    const handleGenerateDoc = (docType) => {
        if (selectedIds.length !== 1) {
            alert("Please select exactly one booking to generate documents.");
            return;
        }
        const booking = filteredData.find(b => b.id === selectedIds[0]);
        if (!booking) return;

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (printWindow) {
            const buyerRaw = booking.customer?.buyer?.raw || {};
            const sellerRaw = booking.customer?.seller?.raw || {};

            const getContactFullName = (c) => {
                if (!c) return '___________________________';
                const titleVal = c.title ? (typeof c.title === 'object' ? c.title.lookup_value : c.title) : '';
                const first = c.name || '';
                const last = c.surname || '';
                return `${titleVal ? titleVal + ' ' : ''}${first} ${last}`.trim() || '___________________________';
            };

            const formatAddress = (addr) => {
                if (!addr) return '';
                const resolveVal = (field) => {
                    if (!field) return '';
                    if (typeof field === 'object') return field.lookup_value || field.name || '';
                    return field;
                };
                const parts = [
                    addr.hNo ? `H.No. ${addr.hNo}` : '',
                    addr.street ? `Street: ${addr.street}` : '',
                    resolveVal(addr.location) || resolveVal(addr.area) || '',
                    resolveVal(addr.tehsil) ? `Tehsil: ${resolveVal(addr.tehsil)}` : '',
                    resolveVal(addr.postOffice) ? `P.O.: ${resolveVal(addr.postOffice)}` : '',
                    resolveVal(addr.city) || '',
                    resolveVal(addr.state) || '',
                    resolveVal(addr.pincode) ? `Pincode: ${resolveVal(addr.pincode)}` : '',
                    resolveVal(addr.country) || ''
                ].filter(Boolean);
                return parts.join(', ') || '';
            };

            const buyerFullName = getContactFullName(buyerRaw);
            const buyerMobile = booking.customer?.buyer?.mobile || buyerRaw.phones?.[0]?.number || '___________________________';
            const buyerEmail = buyerRaw.emails?.[0]?.address || '___________________________';
            const buyerFatherName = buyerRaw.fatherName || '';
            const buyerAddress = formatAddress(buyerRaw.personalAddress) || '';

            const sellerFullName = getContactFullName(sellerRaw);
            const sellerMobile = booking.customer?.seller?.mobile || sellerRaw.phones?.[0]?.number || '___________________________';
            const sellerEmail = sellerRaw.emails?.[0]?.address || '___________________________';
            const sellerFatherName = sellerRaw.fatherName || '';
            const sellerAddress = formatAddress(sellerRaw.personalAddress) || '';

            const propertyDetails = {
                project: booking.property?.project || '___________________________',
                unit: booking.property?.unit || '___________________________',
                location: booking.property?.location || '___________________________',
                block: booking.property?.block || '___________________________',
                sizeLabel: booking.property?.sizeLabel || '___________________________'
            };

            const totalValue = booking.financials?.dealValue || 0;

            if (docType === 'Short Agreement') {
                printWindow.document.write(`
                <html>
                    <head>
                        <title>Short Agreement - ${booking.id}</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; line-height: 1.5; color: #334155; }
                            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
                            .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
                            .doc-title { font-size: 20px; font-weight: 600; color: #64748b; margin-top: 15px; }
                            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
                            .box { border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; background: #f8fafc; }
                            .box-title { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
                            .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dotted #e2e8f0; padding-bottom: 4px; }
                            .label { font-weight: 600; color: #475569; }
                            .val { font-weight: 700; color: #0f172a; }
                            .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
                            .sig-box { border-top: 1px solid #94a3b8; padding-top: 10px; text-align: center; font-weight: 600; }
                            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="company-name">Bharat Properties</div>
                            <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                            <div class="doc-title">BOOKING AGREEMENT (SHORT FORM)</div>
                        </div>

                        <div style="text-align: right; margin-bottom: 20px; font-weight: 600;">
                            Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
                            Ref: ${booking.id}
                        </div>

                        <div class="grid-2">
                            <div class="box">
                                <div class="box-title">Buyer Details (First Party)</div>
                                <div class="row"><span class="label">Name:</span> <span class="val">${buyerFullName}</span></div>
                                ${buyerFatherName ? `<div class="row"><span class="label">Father's Name:</span> <span class="val">${buyerFatherName}</span></div>` : ''}
                                <div class="row"><span class="label">Mobile:</span> <span class="val">${buyerMobile}</span></div>
                                <div class="row"><span class="label">Email:</span> <span class="val">${buyerEmail}</span></div>
                                ${buyerAddress ? `<div class="row"><span class="label">Address:</span> <span class="val">${buyerAddress}</span></div>` : ''}
                            </div>
                            <div class="box">
                                <div class="box-title">Seller Details (Second Party)</div>
                                <div class="row"><span class="label">Name:</span> <span class="val">${sellerFullName}</span></div>
                                ${sellerFatherName ? `<div class="row"><span class="label">Father's Name:</span> <span class="val">${sellerFatherName}</span></div>` : ''}
                                <div class="row"><span class="label">Mobile:</span> <span class="val">${sellerMobile}</span></div>
                                <div class="row"><span class="label">Email:</span> <span class="val">${sellerEmail}</span></div>
                                ${sellerAddress ? `<div class="row"><span class="label">Address:</span> <span class="val">${sellerAddress}</span></div>` : ''}
                            </div>
                        </div>

                        <div class="box" style="margin-bottom: 30px;">
                            <div class="box-title">Property Schedule</div>
                            <div class="grid-2" style="margin-bottom: 0;">
                                <div>
                                    <div class="row"><span class="label">Project/Society:</span> <span class="val">${propertyDetails.project}</span></div>
                                    <div class="row"><span class="label">Unit No:</span> <span class="val">${propertyDetails.unit}</span></div>
                                    <div class="row"><span class="label">Block/Tower:</span> <span class="val">${propertyDetails.block}</span></div>
                                </div>
                                <div>
                                    <div class="row"><span class="label">Location:</span> <span class="val">${propertyDetails.location}</span></div>
                                    <div class="row"><span class="label">Size Label:</span> <span class="val">${propertyDetails.sizeLabel}</span></div>
                                </div>
                            </div>
                        </div>

                        <div class="box" style="margin-bottom: 30px; background: #fffbeb; border-color: #fcd34d;">
                            <div class="box-title" style="color: #b45309; border-bottom-color: #fde68a;">Financial Summary</div>
                            <div class="row">
                                <span class="label">Total Consideration Value:</span> 
                                <span class="val" style="font-size: 16px; color: #b45309;">${formatCurrency(totalValue)} ${booking.financials.bookingDate ? `(Booking Date: ${new Date(booking.financials.bookingDate).toLocaleDateString('en-IN')})` : ''}</span>
                            </div>
                            <div class="row">
                                <span class="label">Earnest Money (Bayana):</span> 
                                <span class="val">${formatCurrency(booking.financials.tokenAmount || 0)} ${booking.financials.bookingDate ? `(Bayana Date: ${new Date(booking.financials.bookingDate).toLocaleDateString('en-IN')})` : ''}</span>
                            </div>
                            <div class="row">
                                <span class="label">Part Payment Amount:</span> 
                                <span class="val">${formatCurrency(booking.financials.partPaymentAmount || 0)} ${booking.financials.partPaymentDate ? `(Date: ${new Date(booking.financials.partPaymentDate).toLocaleDateString('en-IN')})` : ''}</span>
                            </div>
                            <div class="row">
                                <span class="label">Rest (Balance) Payment Due:</span> 
                                <span class="val" style="color: #ef4444;">${formatCurrency(booking.financials.totalBalanceAmount || 0)}</span>
                            </div>
                            ${booking.financials.finalPaymentDate ? `<div class="row"><span class="label">Full & Final Payment Due Date:</span> <span class="val">${new Date(booking.financials.finalPaymentDate).toLocaleDateString('en-IN')}</span></div>` : ''}
                        </div>

                        <div style="font-size: 13px; color: #475569; margin-bottom: 40px; text-align: justify;">
                            <strong>Terms & Conditions:</strong><br/>
                            1. This is a preliminary short agreement acknowledging the token amount received against the property mentioned above.<br/>
                            2. A detailed and registered Agreement to Sell will be executed upon receipt of the mutually agreed milestone payment.<br/>
                            3. In case of cancellation by the buyer, the token amount shall be forfeited as per standard market practice, unless agreed otherwise in writing.<br/>
                            4. Bharat Properties acts solely as a facilitator/broker in this transaction.
                        </div>

                        <div class="signature-section">
                            <div class="sig-box">Signature of First Party (Buyer)</div>
                            <div class="sig-box">Signature of Second Party (Seller)</div>
                        </div>

                        <div class="witness-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 45px; border-top: 1px dashed #cbd5e1; padding-top: 20px;">
                            <div>
                                <strong style="font-size: 13px; color: #475569;">Witness No. 1:</strong>
                                <div style="margin-top: 10px; border-bottom: 1px dotted #94a3b8; height: 20px;">Name: </div>
                                <div style="margin-top: 10px; border-bottom: 1px dotted #94a3b8; height: 20px;">Signature: </div>
                            </div>
                            <div>
                                <strong style="font-size: 13px; color: #475569;">Witness No. 2:</strong>
                                <div style="margin-top: 10px; border-bottom: 1px dotted #94a3b8; height: 20px;">Name: </div>
                                <div style="margin-top: 10px; border-bottom: 1px dotted #94a3b8; height: 20px;">Signature: </div>
                            </div>
                        </div>

                        <div class="footer" style="margin-top: 40px;">
                            Generated by Bharat Properties Enterprise CRM on ${new Date().toLocaleString('en-IN')}<br/>
                            This is a system generated document.
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Sale Agreement') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Agreement for Sale - ${booking.id}</title>
                        <style>
                            body { font-family: 'Times New Roman', serif; margin: 60px; color: #000; line-height: 1.6; font-size: 15px; }
                            .header { text-align: center; margin-bottom: 40px; }
                            .doc-title { font-size: 24px; font-weight: 900; text-decoration: underline; margin-bottom: 5px; }
                            .sub-title { font-size: 16px; font-weight: bold; }
                            .section-heading { font-weight: bold; text-transform: uppercase; margin-top: 25px; margin-bottom: 10px; font-size: 16px; }
                            .text-justify { text-align: justify; margin-bottom: 15px; }
                            .bold { font-weight: bold; }
                            .highlight { color: #b91c1c; font-weight: bold; } /* Based on the red highlights in user doc */
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="doc-title">AGREEMENT FOR SALE</div>
                            <div class="sub-title">(SALE AGREEMENT / IKRARNAMA)</div>
                        </div>
                        
                        <div class="text-justify">
                            THIS AGREEMENT FOR SALE is executed on the <span class="bold">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span> by and between the following parties:
                        </div>

                        <div class="section-heading">FIRST PARTY (SELLER/VENDOR):</div>
                        <div class="text-justify">
                            <span class="bold">Sh. ${sellerName}</span>, son of Sh. _________________, resident of ${booking.customer?.seller?.address || '___________________________'}, 
                            <span class="highlight">PAN: ${booking.customer?.seller?.pan || '___________'} | Aadhaar No.: ${booking.customer?.seller?.aadhaar || '___________'}</span>, 
                            hereinafter referred to as the <span class="bold">"FIRST PARTY"</span> or <span class="bold">"SELLER"</span>, who is the owner and vendor of the plot described herein, and is represented by/in association with Sh. Praveen Kumar, son of Sh. Jai Bhagwan, resident of House No. 32, Sonkra Road, Taraori, District Karnal. 
                            <span class="highlight">The First Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
                        </div>

                        <div class="section-heading">SECOND PARTY (PURCHASER/BUYER):</div>
                        <div class="text-justify">
                            <span class="bold">Sh. ${buyerName}</span>, son of Sh. _________________, resident of ${booking.customer?.buyer?.address || '___________________________'}, 
                            <span class="highlight">PAN: ${booking.customer?.buyer?.pan || '___________'} | Aadhaar No.: ${booking.customer?.buyer?.aadhaar || '___________'}</span>, 
                            hereinafter referred to as the <span class="bold">"SECOND PARTY"</span> or <span class="bold">"PURCHASER"</span>. 
                            <span class="highlight">The Second Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
                        </div>

                        <div class="section-heading">WHEREAS:</div>
                        <div class="text-justify">
                            The First Party has agreed to sell and the Second Party has agreed to purchase <span class="bold">Plot No. ${propertyDetails.unit}, measuring _________</span>, 
                            situated in <span class="bold">${propertyDetails.project}, ${propertyDetails.location}</span>, 
                            for a total consideration of <span class="bold">${formatCurrency(totalValue)} (${numberToIndianWords(totalValue)} Only)</span>, 
                            minus any outstanding dues payable to HUDA (if any), subject to the following terms and conditions:
                        </div>

                        <div class="section-heading">NOW, THEREFORE, IN CONSIDERATION OF THE MUTUAL COVENANTS AND AGREEMENTS, THE PARTIES AGREE AS FOLLOWS:</div>
                        
                        <div class="text-justify">
                            <span class="bold">1. Title & Encumbrances:</span> The above-mentioned Plot No. ${propertyDetails.unit}, measuring _________, situated in ${propertyDetails.project}, ${propertyDetails.location}, was re-allotted to the First Party vide HUDA Letter No. 4033 dated 03/04/2006. The said plot is presently free and clear of all encumbrances, charges, liens, and liabilities of any kind with respect to HUDA. 
                            <span class="highlight">The First Party further confirms that the said plot is free from any benami claim, court attachment, or government acquisition proceeding, and that the First Party holds clear and marketable title with full authority to sell.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">2. Token/Earnest Money Received:</span> The First Party acknowledges receipt of <span class="bold">${formatCurrency(booking.financials.totalPaidAmount || 0)} (${numberToIndianWords(booking.financials.totalPaidAmount || 0)} Only)</span> as earnest money/token amount from the Second Party, comprising: (a) <span class="bold">${formatCurrency(booking.financials.totalPaidAmount || 0)} (${numberToIndianWords(booking.financials.totalPaidAmount || 0)} Only)</span> via Transaction Nos. ________________ dated __________; and (b) <span class="bold">Rs. ______________/- (Rupees ___________________ Only)</span> in cash on ______________. 
                            <span class="highlight">Both parties confirm that all payments have been made through legitimate and disclosed sources of funds, and both parties shall duly declare this amount in their respective Income Tax Returns for the relevant financial year.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">3. Tax Deduction at Source (TDS):</span> <span class="highlight">Since the total sale deed consideration amount exceeds Rs. 50,00,000/-, the Second Party (Purchaser) is required to deduct 1% TDS from the total sale deed consideration amount at the time of each payment, and deposit the same with the Government within the prescribed timeline using the applicable online form. The Second Party shall provide the TDS certificate to the First Party after such deposit. Both parties shall provide their respective PAN details, which are mandatory for this purpose. If the First Party fails to provide PAN, TDS shall be deducted at a higher rate as applicable under law.</span>
                        </div>
                        <div class="text-justify">
                            <span class="bold">4. Payment of Balance Amount & Execution of Sale Deed:</span> The First Party shall receive the balance sale consideration from the Second Party within <span class="bold">${booking.financials?.finalPaymentDate ? new Date(booking.financials.finalPaymentDate).toLocaleDateString('en-IN', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '________________'}</span>, upon receiving intimation of transfer approval from the concerned office. Upon receipt of the balance amount, the First Party shall simultaneously hand over all documents relating to the said plot to the Second Party and shall get the said plot registered in the office of the Sub-Registrar/Tehsil office. <span class="highlight">The Sale Deed shall be executed on non-judicial stamp paper of appropriate value and presented for registration within four months of execution. It is agreed that this Agreement to Sell does not transfer ownership of the said plot; title shall pass only upon execution and registration of the formal Sale Deed.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">5. Right to Transfer:</span> The Second Party shall have the absolute right to get the above-mentioned plot transferred and registered in his/her own name or in the name of any person of his/her choice, either by way of Transfer Deed, Sale Deed, or Power of Attorney. The First Party shall have no objection whatsoever in this regard. <span class="highlight">However, both parties acknowledge that transfer of ownership in immovable property is legally effective only upon registration of a duly executed Sale Deed; a Power of Attorney alone does not confer title.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">6. Liability for Dues Prior to Transfer:</span> Any amount outstanding or payable to HUDA, or to any other government or non-government authority or individual, with respect to the above-mentioned plot, up to the date of grant of transfer permission by the HUDA office, shall be the sole responsibility of the First Party. All dues arising after such date of transfer permission shall be the responsibility of the Second Party. <span class="highlight">This shall include, but not be limited to, property tax, development charges, maintenance dues, and any other statutory levies outstanding as of the transfer date.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">7. Interest on Delayed Payment:</span> In the event of any default or delay in payment of any instalment by the First Party, the First Party shall be liable to pay interest on the delayed amount. <span class="highlight">The rate of interest shall be calculated at SBI's prevailing Marginal Cost of Lending Rate (MCLR) plus 2% per annum, computed on a daily basis from the due date until the date of actual payment.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">8. Consequences of Non-Performance by First Party:</span> If the First Party fails to get the plot transferred and registered in the name of the Second Party by <span class="bold">${booking.financials?.finalPaymentDate ? new Date(booking.financials.finalPaymentDate).toLocaleDateString('en-IN', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '________________'}</span> or before, after receipt of the transfer order, the First Party shall be bound to refund double the above-mentioned amount, i.e., <span class="bold">${formatCurrency((booking.financials.totalPaidAmount || 0) * 2)} (${numberToIndianWords((booking.financials.totalPaidAmount || 0) * 2)} Only)</span>, within 10 days. However, if the Second Party does not wish to accept double the amount and instead insists on taking possession of the said plot, then the Second Party/Purchaser shall have the right to get the said plot transferred in his/her own name or in the name of any person of his/her choice through a court of law, and shall also be entitled to recover all costs and litigation expenses from the First Party. The First Party shall have no objection in this regard. <span class="highlight">The Second Party shall also be entitled to seek specific performance of this Agreement through a competent court, and the First Party shall have no defence to such a claim.</span>
                            <br/><br/>
                            Conversely, if the Second Party fails to take possession of the plot by the specified date, the earnest money paid today shall stand forfeited in favour of the First Party, and the sale transaction shall stand cancelled.
                        </div>

                        <div class="text-justify">
                            <span class="bold">9. Refund on Legal Impediment:</span> If the HUDA office refuses to grant transfer permission due to any legal impediment or restriction, the First Party shall be bound to refund the entire amount received from the Second Party within 7 (seven) days. <span class="highlight">In the event of such refund, interest at the applicable rate shall also be payable on the refund amount for each day of delay beyond the said 7-day period.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">10. Exclusive Agreement:</span> The First Party hereby assures the Second Party that no other agreement, sale deed, or any other document has been executed by the First Party with respect to this plot till date. The First Party further undertakes that during the validity/tenure of this Agreement, no other agreement shall be executed with any other person in respect of the said plot. <span class="highlight">Any breach of this undertaking shall entitle the Second Party to seek immediate relief from a court of law in addition to all other remedies available under this Agreement.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">11. Conveyance Deed Expenses:</span> In the event that HUDA issues orders for execution of a Conveyance Deed in favour of the First Party as a condition for transfer permission, the cost/stamp duty for the Conveyance Deed shall be borne by the First Party, and the cost of the Sale Deed shall be borne by the Second Party.
                        </div>

                        <div class="text-justify">
                            <span class="bold">12. Transfer & Stamp Duty Expenses:</span> All expenses incurred in connection with the transfer of the said plot shall be borne by the Second Party. However, the First Party shall be bound to sign all documents required/demanded by the HUDA office in connection therewith. <span class="highlight">Stamp duty shall be paid on the higher of the actual sale consideration or the applicable circle rate, whichever is greater, as per the prevailing rates in Haryana. Registration charges shall be paid in addition to stamp duty and shall also be borne by the Second Party.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">13. Right of Second Party to Re-Sell:</span> If the Second Party wishes to further sell the above-mentioned plot to any other person, the Second Party shall have the full right to execute an agreement in writing with any third party in respect of the said plot. The First Party shall be bound to honour/abide by such agreement executed by the Second Party.
                        </div>

                        <div class="text-justify">
                            <span class="bold">14. Brokerage/Commission:</span> This sale transaction has been facilitated by <span class="bold">Bharat Properties, Kurukshetra</span>. Both parties, i.e., the Buyer and Seller, shall be bound to pay commission at the rate of <span class="bold">1% (one percent)</span> of the total sale value to Bharat Properties. If either party fails to pay the commission, Bharat Properties, 166, Sector 3, HUDA Market, Kurukshetra, shall have the right to recover its commission amount along with costs of litigation through a court of law. Both parties have no objection in this regard. <span class="highlight">Both parties also confirm that they have provided the necessary identity and address proof documents to the real estate agent as part of the transaction process.</span>
                        </div>

                        <div class="text-justify">
                            IN WITNESS WHEREOF, both parties have read, heard, and understood this Agreement and have signed the same of their own free will and volition, without any coercion or undue influence, so that it may serve as evidence at the appropriate time. The legal heirs and representatives/nominees of both parties shall also be legally bound by this Agreement. Any dispute arising in connection with this Agreement shall be subject to the jurisdiction of the Courts at <span class="bold">Kurukshetra</span>. <span class="highlight">Both parties further confirm that the transaction has been entered into with full disclosure of all material facts and that no misrepresentation has been made by either side.</span>
                        </div>

                        <div class="bold" style="text-transform: uppercase; margin-top: 40px; margin-bottom: 60px;">
                            IN WITNESS WHEREOF BOTH THE PARTIES HAVE SIGNED THIS AGREEMENT ON THE ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}, AT KURUKSHETRA.
                        </div>

                        <div style="display: flex; justify-content: space-between; margin-bottom: 80px;">
                            <div style="text-align: left;">
                                <span class="bold">Signature of First Party</span><br/><br/><br/><br/>
                                (${sellerName})
                            </div>
                            <div style="text-align: right;">
                                <span class="bold">Signature of Second Party</span><br/><br/><br/><br/>
                                (${buyerName})
                            </div>
                        </div>

                        <div style="display: flex; justify-content: space-between;">
                            <div style="text-align: left;">
                                Witness No. 1: _______________________________<br/><br/>
                                ________________________________________
                            </div>
                            <div style="text-align: left; padding-right: 150px;">
                                Witness No. 2: 
                            </div>
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Demand Letter') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Demand Letter - ${booking.id}</title>
                        <style>
                            body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 50px; color: #1e293b; line-height: 1.6; }
                            .header { text-align: center; border-bottom: 3px solid #334155; padding-bottom: 20px; margin-bottom: 40px; }
                            .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="company-name">Bharat Properties</div>
                            <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 40px; font-weight: 600;">
                            <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                            <div>Ref: DL/${booking.id}</div>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <strong>To,</strong><br/>
                            <strong>${buyerName}</strong><br/>
                            Ph: ${buyerPhone}
                        </div>
                        <div style="text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 30px; text-decoration: underline;">
                            PAYMENT DEMAND LETTER
                        </div>
                        <div style="margin-bottom: 20px;">
                            Dear Sir/Madam,<br/><br/>
                            Greetings from Bharat Properties.<br/><br/>
                            This is with reference to your booking of <strong>Unit No. ${propertyDetails.unit}</strong> in <strong>${propertyDetails.project}</strong>.<br/>
                            As per the agreed payment schedule, your next installment is now due for payment.
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: left;">
                            <tr style="background: #f1f5f9; border: 1px solid #cbd5e1;">
                                <th style="padding: 10px; border: 1px solid #cbd5e1;">Description</th>
                                <th style="padding: 10px; border: 1px solid #cbd5e1;">Amount Due</th>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #cbd5e1;">Balance Consideration / Installment</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${formatCurrency(booking.financials.totalBalanceAmount || 0)}</td>
                            </tr>
                        </table>
                        <div style="margin-bottom: 50px;">
                            Kindly remit the payment at the earliest to avoid any delays in the registry/possession process.<br/>
                            If the payment has already been made, please ignore this letter and share the transaction details with your relationship manager.<br/><br/>
                            Thanking you,<br/><br/>
                            <strong>For Bharat Properties</strong><br/><br/><br/>
                            Authorized Signatory
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Brokerage Invoice') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Tax Invoice - ${booking.id}</title>
                        <style>
                            body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 50px; color: #1e293b; line-height: 1.6; }
                            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #334155; padding-bottom: 20px; margin-bottom: 40px; }
                            .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div>
                                <div class="company-name">Bharat Properties</div>
                                <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                            </div>
                            <div style="text-align: right;">
                                <h2 style="margin:0; color:#334155;">TAX INVOICE</h2>
                                <div>Invoice No: INV/${booking.id}</div>
                                <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                            <div>
                                <strong>Billed To:</strong><br/>
                                ${buyerName} (Buyer)<br/>
                                ${sellerName} (Seller)<br/>
                                Ref Property: ${propertyDetails.unit}, ${propertyDetails.project}
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: left;">Description of Services</th>
                                <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: right;">Amount (INR)</th>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #cbd5e1;">Professional Real Estate Brokerage / Consultancy Fees<br/><small style="color:#64748b;">(Against sale/purchase of property unit ${propertyDetails.unit})</small></td>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${formatCurrency(booking.financials.commissionTotal || 0)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">Total Amount Payable</td>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 18px;">${formatCurrency(booking.financials.commissionTotal || 0)}</td>
                            </tr>
                        </table>
                        <div style="margin-top: 60px;">
                            <strong>Authorized Signatory</strong><br/><br/><br/>
                            Bharat Properties
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Token Receipt') {
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
        }
    }
    printWindow.document.close();
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
