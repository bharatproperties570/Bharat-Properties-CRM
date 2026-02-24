import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, Home, Building2, User, FileText, Calendar, Wallet, CheckCircle, Clock, Search, Filter, Plus, Phone, Mail, MoreVertical, Edit, Trash2, X, AlertCircle, FileCheck, DollarSign, Percent, Calculator, Printer, Settings } from 'lucide-react';
import { api, lookupsAPI, dealsAPI, contactsAPI, usersAPI, enrichmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import { formatIndianCurrency, numberToIndianWords } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';
import AddOfferModal from '../../components/AddOfferModal';

const DealDetailPage = ({ dealId, onBack, onNavigate, onAddActivity }) => {
    const [deal, setDeal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activity');
    const [matchingLeads, setMatchingLeads] = useState([]);
    const [allLeads, setAllLeads] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
    const [valuationData, setValuationData] = useState(null);
    const [valuationLoading, setValuationLoading] = useState(false);
    const [valuationError, setValuationError] = useState(null);

    // State for calculator inputs
    const [govtCharges, setGovtCharges] = useState({
        collectorRate: '',
        unitArea: '',
        unitType: 'Sq Ft', // Added to handle conversion
        roadMultiplier: 0, // Added
        floorMultiplier: 0, // Added
        stampDutyPercent: 7,
        registrationPercent: 1,
        miscCharges: 0,
        legalCharges: 15000,
        brokeragePercent: 1,
        useCollectorRate: true,
        buyerGender: 'male'
    });

    // Store config for gender switching logic
    const [govtChargesConfig, setGovtChargesConfig] = useState(null);

    // Fetch dynamic settings for Government Charges
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await api.get('system-settings/govt_charges_config');
                if (response.data && (response.data.success || response.data.status === 'success') && response.data.data) {
                    const settings = response.data.data.value;
                    setGovtChargesConfig(settings);

                    let initialStampDuty = settings.stampDutyMale || 7;
                    if (govtCharges.buyerGender === 'female') initialStampDuty = settings.stampDutyFemale || 5;
                    else if (govtCharges.buyerGender === 'joint') initialStampDuty = settings.stampDutyJoint || 6;

                    setGovtCharges(prev => ({
                        ...prev,
                        stampDutyPercent: initialStampDuty,
                        registrationPercent: settings.registrationPercent || 1,
                        legalCharges: settings.legalFees || 15000,
                        brokeragePercent: settings.brokeragePercent || 1,
                        useCollectorRate: settings.useCollectorRateDefault !== undefined ? settings.useCollectorRateDefault : true
                    }));
                }
            } catch (error) {
                console.error("Failed to fetch govt charges settings:", error);
            }
        };
        fetchConfig();
    }, []);

    // Update stamp duty when gender changes using fetched config
    useEffect(() => {
        if (govtChargesConfig && govtCharges.buyerGender) {
            let rate = 7;
            if (govtCharges.buyerGender === 'female') rate = govtChargesConfig.stampDutyFemale || 5;
            else if (govtCharges.buyerGender === 'joint') rate = govtChargesConfig.stampDutyJoint || 6;
            else rate = govtChargesConfig.stampDutyMale || 7;

            setGovtCharges(prev => ({ ...prev, stampDutyPercent: rate }));
        }
    }, [govtCharges.buyerGender, govtChargesConfig]);

    // Effect to populate defaults from Deal/Inventory
    useEffect(() => {
        if (deal && deal.inventoryId && !govtCharges.unitArea) {
            setGovtCharges(prev => ({
                ...prev,
                unitArea: deal.inventoryId.superArea || deal.inventoryId.area || 0,
                // In a real app, we'd fetch collector rate based on location here
            }));
        }
    }, [deal]);

    // 🚀 Backend Valuation Logic Integration
    useEffect(() => {
        if (!deal?._id) return;

        const timer = setTimeout(async () => {
            setValuationLoading(true);
            try {
                const response = await api.post('/valuation/calculate', {
                    dealId: deal._id,
                    buyerGender: govtCharges.buyerGender,
                    customMarketPrice: parseFloat(deal.price) || 0
                });
                console.log("Valuation Response:", response.data);
                if (response.data.status === 'success') {
                    setValuationData(response.data.data);
                    setValuationError(null);
                }
            } catch (error) {
                console.error("Valuation calculation failed:", error);
                setValuationData(null);
                setValuationError(error.response?.data?.message || "Valuation calculation failed");
            } finally {
                setValuationLoading(false);
            }
        }, 500); // Debounce

        return () => clearTimeout(timer);
    }, [deal?._id, deal?.price, govtCharges.buyerGender]);

    // 🧮 Calculation Logic (Enhanced with Backend Data)
    const financials = useMemo(() => {
        if (!deal) return {};

        // Use backend valuation data if available, otherwise fallback to local basic calculation
        if (valuationData) {
            return {
                dealValue: valuationData.marketPrice,
                collectorValue: valuationData.collectorValue,
                effectiveRate: valuationData.breakdown.baseRate,
                applicableValue: valuationData.stampDutyBase,
                effectiveStampDutyPercent: (valuationData.stampDutyAmount / valuationData.stampDutyBase) * 100,
                stampDutyAmount: valuationData.stampDutyAmount,
                registrationAmount: valuationData.registrationAmount,
                brokerageAmount: (deal.price || 0) * (govtCharges.brokeragePercent / 100),
                totalGovtCharges: valuationData.totalCharges,
                grandTotal: (deal.price || 0) + valuationData.totalCharges + ((deal.price || 0) * (govtCharges.brokeragePercent / 100)),
                valuationData // Store full object for UI
            };
        }

        // Fallback (for offline or initial load)
        const dealValue = deal.price || 0;
        const baseRate = parseFloat(govtCharges.collectorRate) || 0;
        const roadMult = parseFloat(govtCharges.roadMultiplier) || 0;
        const floorMult = parseFloat(govtCharges.floorMultiplier) || 0;
        const effectiveRate = baseRate * (1 + (roadMult / 100) + (floorMult / 100));
        const collectorValue = (effectiveRate * govtCharges.unitArea) || 0;
        const applicableValue = govtCharges.useCollectorRate ? Math.max(dealValue, collectorValue) : dealValue;
        const stampDutyAmount = applicableValue * (govtCharges.stampDutyPercent / 100);
        const registrationAmount = applicableValue * (govtCharges.registrationPercent / 100);
        const brokerageAmount = dealValue * (govtCharges.brokeragePercent / 100);
        const totalGovtCharges = stampDutyAmount + registrationAmount + govtCharges.miscCharges + (parseFloat(govtCharges.legalCharges) || 0);

        return {
            dealValue,
            collectorValue,
            effectiveRate,
            applicableValue,
            stampDutyAmount,
            registrationAmount,
            brokerageAmount,
            totalGovtCharges,
            grandTotal: dealValue + totalGovtCharges + brokerageAmount
        };
    }, [deal, govtCharges, valuationData]);

    const handleAddOffer = (newOffer) => {
        // Optimistic update for demo purposes
        setDeal(prev => ({
            ...prev,
            negotiationRounds: [
                ...(prev.negotiationRounds || []),
                {
                    date: newOffer.date,
                    offerBy: newOffer.leadName,
                    buyerOffer: newOffer.amount,
                    ownerCounter: newOffer.counterAmount || 0,
                    status: newOffer.status,
                    notes: newOffer.conditions
                }
            ]
        }));
        toast.success("Offer recorded successfully!");
    };

    const fetchDealDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`deals/${dealId}`);
            if (response.data && response.data.success) {
                setDeal(response.data.deal);
            } else {
                toast.error("Failed to load deal details");
            }
        } catch (error) {
            console.error("Error fetching deal:", error);
            toast.error("Error loading deal");
        } finally {
            setLoading(false);
        }
    }, [dealId]);

    const fetchMatchingLeads = useCallback(async (inventoryId) => {
        try {
            const response = await api.get(`inventory/match?inventoryId=${inventoryId}`);
            if (response.data && response.data.success) {
                setMatchingLeads(response.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching matching leads:", error);
        }
    }, []);

    const fetchAllLeads = useCallback(async () => {
        try {
            const response = await api.get('leads', { params: { limit: 200 } });
            if (response.data && response.data.success) {
                const mappedLeads = (response.data.records || []).map(l => ({
                    _id: l._id,
                    name: l.firstName ? `${l.salutation || ""} ${l.firstName} ${l.lastName || ""}`.trim() : (l.name || "Unknown"),
                    phone: l.mobile || (l.contactDetails?.phones?.[0]?.number) || ""
                }));
                setAllLeads(mappedLeads);
            }
        } catch (error) {
            console.error("Error fetching all leads:", error);
        }
    }, []);

    const fetchAuditLogs = useCallback(async () => {
        setAuditLoading(true);
        try {
            // Assuming endpoint exists based on KI/research
            const response = await api.get(`audit-logs?entityId=${dealId}&entityType=Deal`);
            if (response.data && response.data.success) {
                setAuditLogs(response.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setAuditLoading(false);
        }
    }, [dealId]);

    useEffect(() => {
        fetchDealDetails();
    }, [fetchDealDetails]);

    useEffect(() => {
        if (deal?.inventoryId?._id || deal?.inventoryId) {
            fetchMatchingLeads(deal.inventoryId?._id || deal.inventoryId);
        }
        fetchAllLeads();
        fetchAuditLogs();
    }, [deal, fetchMatchingLeads, fetchAllLeads, fetchAuditLogs]);

    // Phase 5: Inventory Sync Logic
    useEffect(() => {
        if (deal && (deal.stage === 'Booked' || deal.stage === 'Closed')) {
            const syncInventory = async () => {
                const targetStatus = deal.stage === 'Booked' ? 'Blocked' : 'Sold Out';
                console.log(`[SYNC] Triggering Inventory status change to ${targetStatus} for unit ${deal.unitNo}`);
                // In a real system, we'd call an API here. For now, we simulate the 'bridge'.
                // api.patch(`inventory/${deal.inventoryId}`, { status: targetStatus });
            };
            syncInventory();
        }
    }, [deal?.stage]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>Loading Transaction Command Center...</span>
        </div>
    );
    if (!deal) return <div className="error-state">Deal not found</div>;

    const stageColors = {
        'Open': { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
        'Quote': { bg: '#fff7ed', text: '#9a3412', dot: '#f97316' },
        'Negotiation': { bg: '#f5f3ff', text: '#5b21b6', dot: '#8b5cf6' },
        'Booked': { bg: '#ecfdf5', text: '#065f46', dot: '#10b981' },
        'Closed': { bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
        'Cancelled': { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' }
    };

    const currentStage = deal.stage || 'Open';
    const stageStyle = stageColors[currentStage] || stageColors['Open'];

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
        <div className="deal-detail-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '60px', fontFamily: '"Inter", sans-serif' }}>
            {/* 🛡️ PROFESSIONAL TRANSACTION HEADER */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 1000,
                background: 'rgba(255, 255, 255, 0.9)', borderBottom: '1px solid #e2e8f0',
                padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)', backdropFilter: 'blur(12px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <button onClick={onBack} style={{
                        background: '#fff', border: '1px solid #e2e8f0',
                        borderRadius: '12px', width: '40px', height: '40px',
                        cursor: 'pointer', color: '#64748b', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} className="hover:border-blue-400 hover:text-blue-500">
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                {renderValue(deal.unitNo)}
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>
                                    ({renderValue(deal.unitType) || 'Unit'})
                                </span>
                            </h1>
                            <span style={{
                                backgroundColor: stageStyle.bg, color: stageStyle.text,
                                padding: '4px 12px', borderRadius: '6px',
                                fontSize: '0.7rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid ${stageStyle.dot}33`
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stageStyle.dot }}></span>
                                {currentStage}
                            </span>
                            {deal.negotiation_window && (
                                <span style={{
                                    backgroundColor: '#fef3c7', color: '#92400e',
                                    padding: '4px 12px', borderRadius: '6px',
                                    fontSize: '0.7rem', fontWeight: 900,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fcd34d',
                                    boxShadow: '0 2px 4px rgba(251, 191, 36, 0.2)'
                                }}>
                                    <i className="fas fa-bolt" style={{ color: '#f59e0b' }}></i> High Margin
                                </span>
                            )}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, margin: 0 }}>
                            {renderValue(deal.projectName)} • {renderValue(deal.block)}
                            <span className="mx-2 opacity-30">|</span>
                            <i className="fas fa-calendar-alt mr-1 opacity-50"></i> Created on {new Date(deal.createdAt || deal.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <span className="mx-2 opacity-30">|</span>
                            Source: <span style={{ color: '#1e293b', fontWeight: 700 }}>{deal.source || 'Walk-in'}</span>
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                        <button style={{
                            background: 'transparent', border: 'none', padding: '8px 14px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer'
                        }} className="hover:bg-white hover:text-blue-600 transition-all">
                            <i className="fas fa-share-alt mr-2"></i>Share
                        </button>
                        <button style={{
                            background: 'transparent', border: 'none', padding: '8px 14px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer'
                        }} className="hover:bg-white hover:text-blue-600 transition-all">
                            <i className="fas fa-file-invoice-dollar mr-2"></i>Invoice
                        </button>
                    </div>
                    <button
                        onClick={() => onAddActivity([{ type: 'Deal', id: deal._id, name: deal.dealId || 'Deal', model: 'Deal' }], { deal })}
                        style={{
                            background: '#2563eb', color: '#fff', border: 'none',
                            padding: '10px 20px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 800,
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }} className="hover:bg-blue-700 transition-all"
                    >
                        <i className="fas fa-plus"></i> NEW ACTIVITY
                    </button>
                    <button style={{
                        background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0',
                        width: '44px', height: '44px', borderRadius: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }} className="hover:bg-slate-50">
                        <i className="fas fa-ellipsis-v"></i>
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const res = await enrichmentAPI.runDeal(dealId);
                                if (res.success) {
                                    toast.success('Deal Intelligence Enriched!');
                                    fetchDealDetails();
                                }
                            } catch (e) {
                                toast.error('Enrichment failed');
                            }
                        }}
                        style={{
                            background: '#fff', color: '#16a34a', border: '1px solid #dcfce7',
                            width: '44px', height: '44px', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                        title="Run Enrichment Intelligence"
                        className="hover:bg-green-50"
                    >
                        <i className="fas fa-magic"></i>
                    </button>
                </div>
            </header>

            {/* 2️⃣ MAIN CONTENT SPLIT */}
            <div style={{ maxWidth: '1600px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '32px' }}>

                {/* LEFT MAIN TRANSACTION SECTION - Flexible Width */}
                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                    {/* 💰 PRICING & FINANCIAL INTELLIGENCE */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <div style={{ width: '32px', height: '32px', background: '#ecfdf5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
                                    <i className="fas fa-hand-holding-usd text-emerald-500" style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                Pricing & Negotiation
                            </h3>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>
                                    MODE: {deal.pricingMode?.toUpperCase() || 'TOTAL'}
                                </span>
                            </div>
                        </div>
                        <div style={{ padding: '24px' }}>
                            {/* High Level Price Matrix */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                <PriceCard label="Target Price" value={deal.price} subValue={numberToIndianWords(deal.price)} theme="gray" />
                                <PriceCard label="Current Quote" value={deal.quotePrice || 0} subValue={numberToIndianWords(deal.quotePrice || 0)} theme="blue" />
                                <PriceCard
                                    label="Spread"
                                    value={(deal.quotePrice || 0) - deal.price}
                                    theme={(deal.quotePrice || 0) >= deal.price ? 'green' : 'red'}
                                    isDiff
                                />
                                <PriceCard label="Negotiability" value={deal.pricingNature?.negotiable ? 'FLEXIBLE' : 'FIXED'} theme="orange" isStatus />
                            </div>

                            {/* 🤝 OFFER HISTORY TABLE */}
                            <div style={cardStyle}>
                                <div style={sectionHeaderStyle}>
                                    <h3 style={sectionTitleStyle}>
                                        <i className="fas fa-history text-indigo-500 mr-2"></i> Offer History
                                    </h3>
                                    <button
                                        onClick={() => setIsOfferModalOpen(true)}
                                        style={{
                                            background: '#eff6ff', color: '#2563eb', border: 'none',
                                            padding: '8px 16px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                                        }} className="hover:bg-blue-100">
                                        <i className="fas fa-plus"></i> ADD OFFER
                                    </button>
                                </div>
                                <div style={{ padding: '0' }}>
                                    {(deal.negotiationRounds || []).length > 0 ? (
                                        <TableContainer>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={thStyle}>Date</th>
                                                        <th style={thStyle}>Offer By</th>
                                                        <th style={thStyle}>Amount</th>
                                                        <th style={thStyle}>Counter</th>
                                                        <th style={thStyle}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {deal.negotiationRounds.map((round, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={tdStyle}>{new Date(round.date || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{ fontWeight: 600, color: '#475569' }}>{round.offerBy || 'Buyer'}</span>
                                                                {round.notes && <div style={{ fontSize: '0.65rem', color: '#94a3b8', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round.notes}</div>}
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatIndianCurrency(round.buyerOffer)}</span>
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <span style={{ fontWeight: 800, color: '#64748b' }}>{formatIndianCurrency(round.ownerCounter)}</span>
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                                                                    background: '#f0fdf4', color: '#166534', border: '1px solid #dcfce7', textTransform: 'uppercase'
                                                                }}>
                                                                    {round.status || 'Active'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </TableContainer>
                                    ) : (
                                        <div style={{ padding: '40px', textAlign: 'center' }}>
                                            <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                                <i className="fas fa-inbox text-slate-400" style={{ fontSize: '1.2rem' }}></i>
                                            </div>
                                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>No Offers Yet</p>
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Start the negotiation by adding the first offer.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* 🏛️ GOVERNMENT CHARGES & REGISTRATION BREAKDOWN (New) */}
                            <GovernmentChargesCard
                                deal={deal}
                                charges={govtCharges}
                                setCharges={setGovtCharges}
                                financials={financials}
                                loading={valuationLoading}
                                error={valuationError}
                            />

                            {/* Professional Financial Insights */}
                            <div style={{ background: '#f8fafc', borderRadius: '20px', padding: '24px', border: '1px solid #f1f5f9' }}>
                                <h4 style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-calculator text-blue-400"></i> Closing Estimates & Compliance
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>GST Liability (18%)</span>
                                            <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 800 }}>{formatIndianCurrency(deal.price * 0.18)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TDS Deduction (1%)</span>
                                            <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 800 }}>-{formatIndianCurrency(deal.price * 0.01)}</span>
                                        </div>
                                    </div>
                                    <div style={{ width: '1px', background: '#e2e8f0' }}></div>
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <p style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Net Fulfillment Value</p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#10b981', margin: 0 }}>{formatIndianCurrency(deal.price * 1.17)}</p>
                                        <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>Includes GST - TDS</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* UNIT SPECIFICATIONS */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <div style={{ width: '32px', height: '32px', background: '#f0f9ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
                                    <i className="fas fa-th-list text-blue-500" style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                Unit Specifications
                            </h3>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            {/* Basic Details */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-home" style={{ marginRight: '8px', fontSize: '0.8rem', color: '#2563eb' }}></i> Basic Details
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Category" value={deal.inventoryId?.category || deal.category} />
                                    <DetailField label="Subcategory" value={deal.inventoryId?.subCategory || deal.subCategory} />
                                    <div style={{
                                        gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px',
                                        background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9'
                                    }}>
                                        <DetailField label="Size / Area" value={`${renderValue(deal.size || deal.inventoryId?.size)} ${renderValue(deal.sizeUnit || deal.inventoryId?.sizeUnit)}`} />
                                        <DetailField label="Length" value={deal.inventoryId?.length} />
                                        <DetailField label="Width" value={deal.inventoryId?.width} />
                                    </div>
                                </div>
                            </div>
                            {/* Orientation */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-compass" style={{ marginRight: '8px', fontSize: '0.8rem', color: '#f59e0b' }}></i> Orientation
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Direction" value={deal.inventoryId?.direction} />
                                    <DetailField label="Facing" value={deal.facing || deal.inventoryId?.facing} />
                                    <DetailField label="Road Width" value={deal.roadWidth || deal.inventoryId?.roadWidth} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* LOCATION DETAILS */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <div style={{ width: '32px', height: '32px', background: '#fffbeb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
                                    <i className="fas fa-map-marker-alt text-amber-500" style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                Location Details
                            </h3>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailField label="City" value={deal.inventoryId?.address?.city} />
                                <DetailField label="Locality" value={deal.inventoryId?.address?.locality || deal.location?.lookup_value} />
                                <DetailField label="Post Office / Pincode" value={`${renderValue(deal.inventoryId?.address?.postOffice)} - ${renderValue(deal.inventoryId?.address?.pinCode)}`} />
                                <DetailField label="Landmark" value={deal.inventoryId?.address?.landmark} />
                                <div style={{ gridColumn: 'span 2' }}>
                                    <DetailField label="Full Address" value={`${renderValue(deal.inventoryId?.address?.hNo)} ${renderValue(deal.inventoryId?.address?.street)} ${renderValue(deal.inventoryId?.address?.locality)}`} />
                                </div>
                            </div>
                            {/* Map placeholder */}
                            <div style={{ background: '#f8fafc', borderRadius: '10px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                                    <i className="fas fa-map" style={{ fontSize: '2rem', marginBottom: '8px' }}></i>
                                    <span style={{ display: 'block', fontSize: '0.8rem' }}>Map View</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BUILTUP DETAILS */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <div style={{ width: '32px', height: '32px', background: '#f3e8ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
                                    <i className="fas fa-layer-group text-purple-500" style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                Built-up & Furnishing
                            </h3>
                        </div>
                        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                            <DetailField label="Built-up Type" value={deal.inventoryId?.builtupType} />
                            <DetailField label="Possession" value={deal.inventoryId?.possessionStatus} />
                            <DetailField label="Construction Age" value={deal.inventoryId?.ageOfConstruction} />
                            <DetailField label="Furnish Status" value={deal.inventoryId?.furnishType} />
                            <div style={{ gridColumn: 'span 2' }}>
                                <DetailField label="Furnished Items" value={deal.inventoryId?.furnishedItems} />
                            </div>
                        </div>
                    </div>

                    {/* 🔟 Tabs Section (Without Documents) */}
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px', padding: '0 4px' }}>
                            <TabItem id="activity" label="Activity Timeline" active={activeTab === 'activity'} onClick={setActiveTab} />
                            <TabItem id="negotiation" label="Negotiation Tracker" active={activeTab === 'negotiation'} onClick={setActiveTab} />
                            <TabItem id="financials" label="Financial Breakdown" active={activeTab === 'financials'} onClick={setActiveTab} />
                            <TabItem id="costsheet" label="Cost Sheet" active={activeTab === 'costsheet'} onClick={setActiveTab} />
                            <TabItem id="commission" label="Commission" active={activeTab === 'commission'} onClick={setActiveTab} />
                        </div>
                        <div style={{ minHeight: '300px' }}>
                            {activeTab === 'activity' && <ActivityTimeline dealId={deal._id} logs={auditLogs} loading={auditLoading} />}
                            {activeTab === 'negotiation' && <NegotiationTracker rounds={deal.negotiationRounds} />}
                            {activeTab === 'financials' && <FinancialBreakdown details={deal.financialDetails} type={deal.intent?.lookup_value} />}
                            {activeTab === 'costsheet' && <CostSheet financials={financials} deal={deal} />}
                            {activeTab === 'commission' && <CommissionDetails commission={deal.commission} />}
                        </div>
                    </div>

                </div>



                {/* 🛡️ MISSION CONTROL SIDEBAR (Fixed 400px) */}
                <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* 🎯 MATCHED LEADS - TOP PRIORITY */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                            <h3 style={sectionTitleStyle}>
                                <div style={{ width: '32px', height: '32px', background: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    <i className="fas fa-bullseye text-emerald-600" style={{ fontSize: '0.9rem' }}></i>
                                </div>
                                <span style={{ color: '#166534' }}>Top Matched Leads</span>
                            </h3>
                            <button className="text-btn" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                View All
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {matchingLeads.length > 0 ? matchingLeads.slice(0, 3).map((lead, idx) => (
                                <div key={idx} style={{
                                    padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #f0fdf4',
                                    boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.02)', transition: 'all 0.2s',
                                    cursor: 'pointer', position: 'relative', overflow: 'hidden'
                                }} className="hover:shadow-md hover:border-emerald-200 group">
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: lead.score >= 80 ? '#10b981' : lead.score >= 50 ? '#f59e0b' : '#64748b' }}></div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingLeft: '8px' }}>
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>{lead.name}</h4>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="fas fa-phone-alt" style={{ fontSize: '0.6rem', opacity: 0.7 }}></i> {lead.phone || lead.mobile}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: '1rem', fontWeight: 900, color: lead.score >= 80 ? '#059669' : '#d97706',
                                                display: 'block', lineHeight: 1
                                            }}>{lead.score}%</span>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Match</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px', paddingTop: '8px', borderTop: '1px dashed #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                background: '#f1f5f9', color: '#475569', textTransform: 'uppercase'
                                            }}>
                                                {lead.leadScore || 'WARM'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                                • {Math.floor((new Date() - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24))}d ago
                                            </span>
                                        </div>
                                        <button style={{
                                            background: '#ecfdf5', color: '#059669', border: 'none', borderRadius: '50%',
                                            width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', fontSize: '0.7rem'
                                        }}>
                                            <i className="fas fa-arrow-right"></i>
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                                    <i className="fas fa-search" style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.5 }}></i>
                                    <p style={{ fontSize: '0.85rem', margin: 0 }}>Finding best matches...</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CONTACT INFORMATION */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <i className="fas fa-user-tie text-blue-500 mr-2"></i> Contact Info
                            </h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Owner */}
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Property Owner</p>
                                <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{deal.owner?.name || deal.inventoryId?.ownerName}</p>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{deal.owner?.phone || deal.inventoryId?.ownerPhone}</p>
                            </div>
                            {/* Buyer */}
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Buyer / Lead</p>
                                <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{deal.associatedContact?.name || 'Not assigned'}</p>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{deal.associatedContact?.phone}</p>
                            </div>
                        </div>
                    </div>

                    {/* PROPERTY DOCUMENTS */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <i className="fas fa-file-alt text-orange-500 mr-2"></i> Documents
                            </h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {(deal.documents || deal.inventoryId?.inventoryDocuments || []).length > 0 ? (
                                (deal.documents || deal.inventoryId?.inventoryDocuments).slice(0, 5).map((doc, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <i className="fas fa-file-pdf text-red-400"></i>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name || doc.documentName}</span>
                                        </div>
                                        <button style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer' }}>
                                            <i className="fas fa-download"></i>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>No documents attached.</p>
                            )}
                        </div>
                    </div>

                    {/* DEAL LIFECYCLE (Pipeline Status) */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>
                                <i className="fas fa-route text-blue-500 mr-2"></i> Deal Lifecycle
                            </h3>
                        </div>
                        <div style={{ padding: '24px 16px' }}>
                            <HorizontalStepper currentStage={deal.stage} />
                        </div>
                    </div>


                    {/* ASSIGNMENT */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <i className="fas fa-user-shield text-emerald-500 mr-2"></i> Assignment
                            </h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <SidebarStat label="Assigned To" value={deal.assignedTo?.name || 'Unassigned'} />
                            <SidebarStat label="Visible To" value={deal.visibleTo || 'Public'} />
                            <SidebarStat label="Team" value={deal.assignedTo?.team || 'Sales'} />
                        </div>
                    </div>

                    {/* 🏗️ STAKEHOLDER ARCHITECTURE (Removed) */}

                    {/* 🛡️ TRANSACTION INTELLIGENCE & COMPLIANCE (Removed) */}

                    {/* ❤️ OPERATIONAL HEALTH */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>
                                <i className="fas fa-heartbeat text-rose-500 mr-2"></i> Operational Health
                            </h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <HealthRow label="Deal Age" value={`${Math.floor((new Date() - new Date(deal.createdAt || Date.now())) / (1000 * 60 * 60 * 24))} Days`} />
                            <HealthRow label="Interaction Count" value={deal.activities?.length || 0} />
                            <HealthRow label="Last Activity" value="2 Days Ago" />
                            <HealthRow label="Next Action" value="Follow-up Call" />
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                <p style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-exclamation-circle text-amber-500 mr-2"></i> Requires follow-up in 24h
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* MODALS */}
            <AddOfferModal
                isOpen={isOfferModalOpen}
                onClose={() => setIsOfferModalOpen(false)}
                onSave={handleAddOffer}
                leads={(() => {
                    const combined = [...matchingLeads];
                    allLeads.forEach(al => {
                        if (!combined.find(ml => ml._id === al._id)) {
                            combined.push(al);
                        }
                    });
                    return combined;
                })()}
            />

        </div>
    );
};

// --- SUB COMPONENTS ---

const DetailItem = ({ label, value, boldValue, color }) => (
    <div>
        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 2px 0' }}>{label}</p>
        <p style={{
            fontSize: '0.85rem', fontWeight: boldValue ? 800 : 600,
            color: color || '#1e293b', margin: 0
        }}>{renderValue(value)}</p>
    </div>
);

const DetailField = ({ label, value }) => {
    const renderValueInternal = (val) => {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'object') {
            return val.lookup_value || val.name || val.label || val.value || '-';
        }
        return val;
    };

    return (
        <div>
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600, margin: 0 }}>
                {renderValueInternal(value)}
            </p>
        </div>
    );
};

const SidebarStat = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700 }}>{renderValue(value)}</span>
    </div>
);

const PriceCard = ({ label, value, subValue, theme, isDiff, isStatus }) => {
    const themes = {
        gray: { bg: '#f8fafc', text: '#64748b', val: '#1e293b' },
        blue: { bg: '#eff6ff', text: '#2563eb', val: '#1d4ed8' },
        green: { bg: '#f0fdf4', text: '#15803d', val: '#166534' },
        red: { bg: '#fef2f2', text: '#dc2626', val: '#991b1b' },
        orange: { bg: '#fff7ed', text: '#ea580c', val: '#c2410c' }
    };
    const t = themes[theme] || themes.gray;

    return (
        <div style={{ background: t.bg, padding: '16px', borderRadius: '12px', border: `1px solid ${t.text}11` }}>
            <p style={{ fontSize: '0.6rem', color: t.text, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 6px 0', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ fontSize: isStatus ? '1.1rem' : '1.3rem', fontWeight: 900, color: t.val, margin: 0 }}>
                {isStatus ? value : (isDiff && value > 0 ? '+' : '') + formatIndianCurrency(value)}
            </p>
            {subValue && <p style={{ fontSize: '0.6rem', color: t.text, fontWeight: 600, marginTop: '4px', opacity: 0.8, fontStyle: 'italic' }}>{subValue}</p>}
        </div>
    );
};

const PartyBlock = ({ role, name, phone, color, isLast }) => {
    const colors = {
        amber: { bg: '#fffbeb', text: '#92400e', icon: '#f59e0b' },
        blue: { bg: '#eff6ff', text: '#1e40af', icon: '#3b82f6' },
        rose: { bg: '#fff1f2', text: '#9f1239', icon: '#f43f5e' },
        slate: { bg: '#f8fafc', text: '#334155', icon: '#64748b' }
    };
    const c = colors[color] || colors.slate;

    return (
        <div style={{
            background: c.bg, padding: '14px', borderRadius: '12px',
            border: `1px solid ${c.icon}22`, transition: 'all 0.2s'
        }} className="hover:shadow-sm">
            <p style={{ fontSize: '0.6rem', color: c.text, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>{role}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>{name || 'Not Assigned'}</p>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: 0 }}>{phone || '--'}</p>
                </div>
                {name && (
                    <button
                        title="Send Deal Summary"
                        style={{ background: '#22c55e', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <i className="fab fa-whatsapp"></i>
                    </button>
                )}
            </div>
        </div>
    );
};

const ComplianceItem = ({ label, status }) => (
    <div style={{
        padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', gap: '10px', background: status === 'done' ? '#f0fdf4' : '#fff'
    }}>
        <div style={{
            width: '18px', height: '18px', borderRadius: '50%', background: status === 'done' ? '#10b981' : '#fff',
            border: status === 'done' ? 'none' : '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', color: '#fff'
        }}>
            {status === 'done' && <i className="fas fa-check"></i>}
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: status === 'done' ? '#166534' : '#64748b' }}>{label}</span>
    </div>
);

const TabItem = ({ id, label, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '12px 20px', background: 'transparent', border: 'none',
            borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
            color: active ? '#2563eb' : '#64748b', fontSize: '0.85rem',
            fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all 0.2s',
            whiteSpace: 'nowrap'
        }}
    >
        {label}
    </button>
);

const HorizontalStepper = ({ currentStage }) => {
    const stages = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed'];
    const currentIndex = stages.indexOf(currentStage);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', padding: '0 4px' }}>
            {/* Background Line */}
            <div style={{ position: 'absolute', top: '12px', left: '12px', right: '12px', height: '2px', background: '#e2e8f0', zIndex: 0 }}></div>

            {stages.map((stage, idx) => {
                const isCompleted = idx < currentIndex;
                const isCurrent = idx === currentIndex;

                return (
                    <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                        <div style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : '#fff',
                            border: isCurrent ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                            color: (isCompleted || isCurrent) ? '#fff' : '#cbd5e1',
                            fontSize: '0.65rem', marginBottom: '8px', boxShadow: isCurrent ? '0 0 0 4px rgba(59, 130, 246, 0.1)' : 'none',
                            transition: 'all 0.3s ease'
                        }}>
                            {isCompleted ? <i className="fas fa-check"></i> : idx + 1}
                        </div>
                        <span style={{
                            fontSize: '0.55rem', fontWeight: (isCurrent || isCompleted) ? 800 : 700,
                            color: isCurrent ? '#2563eb' : isCompleted ? '#64748b' : '#94a3b8',
                            textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center', width: '40px', lineHeight: 1.1
                        }}>
                            {stage}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const HealthRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 900 }}>{value}</span>
    </div>
);

// --- TAB MODULES ---
// --- TAB MODULES ---
const ActivityTimeline = ({ dealId, logs, loading }) => (
    <div className="relative pl-8 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">

        <p className="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest mb-8">Transaction Pulse</p>

        {/* ⚡ ACTIVE PULSE ITEMS */}
        <div className="relative group">
            <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow-md ring-4 ring-blue-50 group-hover:scale-125 transition-transform"></div>
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm max-w-2xl">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[0.65rem] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded">Stage Evolution</span>
                    <span className="text-[0.65rem] text-slate-400 font-bold">Today, 10:45 AM</span>
                </div>
                <p className="text-[0.85rem] font-bold text-slate-800 leading-relaxed">
                    Transaction moved to <span className="text-blue-600">Negotiation Phase</span> following the receipt of a formal counter-proposal.
                </p>
            </div>
        </div>

        <div className="relative group">
            <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-md ring-4 ring-emerald-50 group-hover:scale-125 transition-transform"></div>
            <div className="bg-white p-5 rounded-2xl border border-emerald-50 shadow-sm max-w-2xl">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[0.65rem] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded">Field Engagement</span>
                    <span className="text-[0.65rem] text-slate-400 font-bold">Yesterday, 4:20 PM</span>
                </div>
                <p className="text-[0.85rem] font-bold text-slate-800 leading-relaxed mb-3">
                    Site Visit #2 completed with Buyer and Relationship Manager.
                </p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 italic text-[0.8rem] text-slate-600 leading-snug">
                    "Buyer evaluated the floor plan and natural lighting. Strong interest confirmed; requested a breakdown of park-facing premium charges."
                </div>
            </div>
        </div>

        {/* 🧩 SYSTEM AUDIT LOGS (Condensed) */}
        {logs && logs.slice(0, 5).map((log, idx) => (
            <div key={idx} className="relative group opacity-60 hover:opacity-100 transition-opacity">
                <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-slate-300 border-4 border-white shadow-sm ring-4 ring-slate-50"></div>
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 max-w-2xl">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[0.6rem] font-black text-slate-500 uppercase">Audit: {log.action || 'Data Sync'}</span>
                        <span className="text-[0.6rem] text-slate-400 font-bold">{new Date(log.executedAt || log.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[0.75rem] font-bold text-slate-600">{log.description || `${log.field} parameter adjustment recorded.`}</p>
                </div>
            </div>
        ))}

        <div className="pt-4">
            <button className="text-[0.7rem] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
                View All {logs?.length || 12} Activities <i className="fas fa-chevron-down ml-1"></i>
            </button>
        </div>
    </div>
);

const NegotiationTracker = ({ rounds }) => (
    <div className="space-y-6">
        <div className="flex justify-between items-center mb-4">
            <h4 className="text-[0.7rem] font-black text-slate-400 uppercase tracking-widest">Active Negotiations</h4>
            <div className="text-[0.65rem] font-black text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> LIVE ROUND
            </div>
        </div>
        {(rounds || [{ round: 1 }]).map((round, idx) => (
            <div key={idx} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-lg">
                        R{round.round || idx + 1}
                    </div>
                    <div>
                        <h4 className="text-[0.8rem] font-black text-slate-900 uppercase tracking-tight">Strategy Round {round.round || idx + 1}</h4>
                        <p className="text-[0.65rem] text-slate-400 font-bold uppercase">{new Date().toLocaleDateString('en-IN', { month: 'long', day: '2-digit' })} • PRIMARY OFFER</p>
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-10">
                    <div className="flex flex-col gap-2">
                        <span className="text-[0.6rem] text-slate-500 font-black uppercase tracking-wider">Buyer Intent</span>
                        <span className="text-xl font-black text-rose-600 tracking-tight">{formatIndianCurrency(round.buyerOffer || 4500000)}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[0.6rem] text-slate-500 font-black uppercase tracking-wider">Owner Base</span>
                        <span className="text-xl font-black text-indigo-600 tracking-tight">{formatIndianCurrency(round.ownerCounter || 4800000)}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[0.6rem] text-slate-500 font-black uppercase tracking-wider">Discount Spread</span>
                        <span className="text-xl font-black text-slate-400 tracking-tight">-{formatIndianCurrency(round.adjustment || 50000)}</span>
                    </div>
                    <div className="flex flex-col gap-2 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                        <span className="text-[0.6rem] text-emerald-700 font-black uppercase tracking-wider">Fulfillment Price</span>
                        <span className="text-2xl font-black text-emerald-600 tracking-tight">{formatIndianCurrency(round.final || 4750000)}</span>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

const FinancialBreakdown = ({ details, type }) => (
    <div className="grid grid-cols-2 gap-16">
        <div className="space-y-8">
            <h4 className="text-[0.7rem] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3">Milestone Progression</h4>
            <div className="space-y-4">
                <PaymentRow label="Token Commitment" amount={details?.token?.amount || 500000} date={details?.token?.date} status="COLLECTED" color="emerald" />
                <PaymentRow label="Agreement Closure" amount={details?.agreement?.amount || 1500000} date={details?.agreement?.date} status="UPCOMING" color="amber" />
                <PaymentRow label="Registry Execution" amount={details?.registry?.amount || 1000000} date={details?.registry?.date} status="LOCKED" color="slate" />
                <PaymentRow label="Final Fulfillmet" amount={details?.finalPayment?.amount || 2500000} date={details?.finalPayment?.date} status="LOCKED" color="slate" />
            </div>
        </div>
        <div className="bg-slate-50 p-10 rounded-[40px] border border-slate-100">
            <h4 className="text-[0.7rem] font-black text-slate-400 uppercase tracking-widest mb-10">Transactional Terms</h4>
            {type === 'SELL' ? (
                <div className="space-y-8">
                    <TermItem label="Registry Protocol" value="Stamp Duty & Legal Transfer" />
                    <TermItem label="Administrative Fee" value="1% of Consideration" />
                    <TermItem label="Possession Timeline" value="Post-Registry Effective" />
                </div>
            ) : (
                <div className="space-y-8">
                    <TermItem label="Security Deposit" value={formatIndianCurrency(details?.securityDeposit || 500000)} />
                    <TermItem label="Monthly Periodic Rent" value={formatIndianCurrency(details?.monthlyRent || 150000)} />
                    <TermItem label="Lock-in Commitment" value={`${details?.lockInMonths || 12} Months`} />
                    <TermItem label="Rent Escalation Policy" value={`${details?.escalationPercent || 5}% Annual`} />
                </div>
            )}
        </div>
    </div>
);

const DocumentSection = ({ docs }) => (
    <div className="grid grid-cols-4 gap-6">
        {(docs || []).length > 0 ? docs.map((doc, idx) => (
            <div key={idx} className="bg-white border-2 border-slate-100 p-5 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                    <i className="fas fa-file-pdf text-xl"></i>
                </div>
                <h5 className="text-[0.75rem] font-extrabold text-slate-800 truncate mb-1">{doc.name}</h5>
                <p className="text-[0.6rem] text-slate-500 font-bold uppercase tracking-wider mb-4">{doc.type || 'Document'}</p>
                <button className="w-full py-2 bg-slate-50 text-indigo-600 text-[0.65rem] font-black rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    VIEW DOCUMENT
                </button>
            </div>
        )) : (
            <div className="col-span-4 text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <i className="fas fa-cloud-upload-alt text-4xl text-slate-300 mb-4"></i>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">No Documents Uploaded</p>
                <button className="mt-6 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-100">
                    Upload Transaction Docs
                </button>
            </div>
        )}
    </div>
);

const CommissionDetails = ({ commission }) => (
    <div className="grid grid-cols-3 gap-12">
        <div className="col-span-1 space-y-8">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Direct Revenue</h4>
            <div className="space-y-6">
                <CommissionField label="Brokerage Percentage" value={`${commission?.brokeragePercent || 2}%`} color="indigo" />
                <CommissionField label="Expected Total" value={formatIndianCurrency(commission?.expectedAmount || 0)} color="emerald" bold />
                <CommissionField label="Actual Realized" value={formatIndianCurrency(commission?.actualAmount || 0)} color="slate" />
            </div>
        </div>
        <div className="col-span-2 bg-slate-50 p-8 rounded-3xl border border-slate-200">
            <div className="flex justify-between items-center mb-10">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Internal Distribution Split</h4>
                <span className="px-3 py-1.5 bg-[#1e293b] text-white text-[0.6rem] font-black rounded-lg uppercase tracking-widest">ADMIN ONLY EDIT</span>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                <SplitMeter label="Listing Associate (Share)" value={commission?.internalSplit?.listingRM || 10} suffix="%" color="#6366f1" />
                <SplitMeter label="Closing Associate (Share)" value={commission?.internalSplit?.closingRM || 15} suffix="%" color="#10b981" />
                <SplitMeter label="Company Retainer" value={commission?.internalSplit?.company || 75} suffix="%" color="#1e293b" />
                <SplitMeter label="Channel Partner Share" value={commission?.channelPartnerShare || 0} prefix="₹" color="#ef4444" />
            </div>
        </div>
    </div>
);

const PaymentRow = ({ label, amount, date, status, color }) => {
    const colors = {
        emerald: 'bg-emerald-100 text-emerald-700',
        amber: 'bg-amber-100 text-amber-700',
        slate: 'bg-slate-100 text-slate-400'
    };
    const c = colors[color] || colors.slate;

    return (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 transition-all">
            <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">{label}</span>
                <span className="text-[0.65rem] text-slate-400 font-semibold">{date ? new Date(date).toLocaleDateString() : 'Date TBD'}</span>
            </div>
            <div className="flex items-center gap-6">
                <span className="text-base font-black text-slate-800">{formatIndianCurrency(amount)}</span>
                <span className={`px-3 py-1 rounded-lg text-[0.6rem] font-black tracking-widest ${c}`}>
                    {status}
                </span>
            </div>
        </div>
    );
};

const TermItem = ({ label, value }) => (
    <div className="flex justify-between items-center border-b border-indigo-100/50 pb-3">
        <span className="text-[0.7rem] font-bold text-indigo-800/60 uppercase">{label}</span>
        <span className="text-[0.85rem] font-black text-indigo-900">{value}</span>
    </div>
);

const CommissionField = ({ label, value, color, bold }) => {
    const textClasses = bold ? 'text-lg font-black' : 'text-sm font-bold';
    const colorClasses = {
        indigo: 'text-indigo-600',
        emerald: 'text-emerald-600',
        slate: 'text-slate-800'
    };
    const c = colorClasses[color] || colorClasses.slate;

    return (
        <div className="flex flex-col border-l-3 border-slate-100 pl-4 py-1">
            <span className="text-[0.65rem] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</span>
            <span className={`${textClasses} ${c}`}>{value}</span>
        </div>
    );
};

const SplitMeter = ({ label, value, suffix = '', prefix = '', color }) => (
    <div>
        <div className="flex justify-between items-center mb-3">
            <span className="text-[0.65rem] text-slate-500 font-bold uppercase tracking-tight">{label}</span>
            <span className="text-sm font-black" style={{ color }}>{prefix}{value}{suffix}</span>
        </div>
        <div className="h-2 w-full bg-white rounded-full overflow-hidden border border-slate-200">
            <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${suffix === '%' ? value : 100}%`, backgroundColor: color }}
            ></div>
        </div>
    </div>
);

const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

// 🏛️ Government Charges Card Component
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

// ---------------- GOVERNMENT CHARGES CARD ----------------
const GovernmentChargesCard = ({
    deal,
    charges,
    setCharges,
    financials,
    loading,
    error
}) => {
    // We receive calculated financials from parent
    const [selectedRate, setSelectedRate] = useState(null);
    const [collectorRates, setCollectorRates] = useState([]);
    const [loadingRates, setLoadingRates] = useState(false);
    const [showRateSelector, setShowRateSelector] = useState(false);

    // Fetch Rates on mount or when deal changes
    useEffect(() => {
        if (!deal) return;

        const fetchRates = async () => {
            setLoadingRates(true);
            try {
                // Construct search query based on deal properties
                const params = new URLSearchParams({
                    category: deal.category || '',
                    subCategory: deal.subCategory || '',
                    search: deal.projectId?.address?.city || deal.location || ''
                });

                const res = await api.get(`/collector-rates?${params.toString()}`);
                if (res.data.status === 'success') {
                    const fetchedRates = res.data.data.docs || [];
                    setCollectorRates(fetchedRates);

                    // Auto-select the best match if none selected
                    if (fetchedRates.length > 0 && !selectedRate) {
                        // Look for an exact category/subcategory match first
                        const exactMatch = fetchedRates.find(r =>
                            r.category === deal.category &&
                            r.subCategory === deal.subCategory
                        ) || fetchedRates[0];

                        handleRateSelect(exactMatch);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch matching collector rates:", e);
            }
            finally { setLoadingRates(false); }
        };
        fetchRates();
    }, [deal?.inventoryId, deal?.category, deal?.subCategory, deal?.projectId]);

    // Handle Rate Selection
    const handleRateSelect = (rate) => {
        if (!rate) return;
        setSelectedRate(rate);
        setShowRateSelector(false);

        // Map inventory attributes to multipliers
        const inventory = deal?.inventoryId || {};
        const roadWidth = inventory.roadWidth || '';
        const floor = inventory.floor || '';

        // Find matching multipliers by type or name
        const matchingRoad = rate.roadMultipliers?.find(m =>
            roadWidth.toLowerCase().includes(m.roadType.toLowerCase()) ||
            m.roadType.toLowerCase().includes(roadWidth.toLowerCase())
        );

        const matchingFloor = rate.floorMultipliers?.find(m =>
            floor.toString().toLowerCase() === m.floorType.toLowerCase() ||
            m.floorType.toLowerCase().includes(floor.toString().toLowerCase())
        );

        const roadMult = matchingRoad ? matchingRoad.multiplier : 0;
        const floorMult = matchingFloor ? matchingFloor.multiplier : 0;

        // Auto-select correct Area based on Rate Type
        // If it's Land Area, we usually take plot size
        // If it's Built-up, we take builtUpArea
        let area = inventory.size || 0;
        if (rate.rateApplyOn === 'Built-up Area') {
            area = inventory.builtUpArea || 0;
        }

        // Update parent state
        setCharges(prev => ({
            ...prev,
            collectorRate: rate.rate,
            unitType: rate.rateUnit,
            unitArea: area,
            roadMultiplier: roadMult,
            floorMultiplier: floorMult
        }));

        if (roadMult > 0 || floorMult > 0) {
            toast.success(`Applied ${roadMult > 0 ? 'Road' : ''}${roadMult > 0 && floorMult > 0 ? ' & ' : ''}${floorMult > 0 ? 'Floor' : ''} multipliers automatically!`);
        }
    };

    const handleClearRate = () => {
        setSelectedRate(null);
        setCharges(prev => ({
            ...prev,
            collectorRate: 0
        }));
    };

    const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

    const handleChange = (field, value) => {
        setCharges(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <i className="fas fa-university text-slate-400"></i> Government Charges
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                        value={charges.buyerGender}
                        onChange={(e) => setCharges({ ...charges, buyerGender: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}
                    >
                        <option value="male">Male Buyer</option>
                        <option value="female">Female Buyer</option>
                        <option value="joint">Joint</option>
                    </select>
                </div>
            </div>

            {/* 📊 Backend Valuation Breakdown */}
            {loading && (
                <div style={{ padding: '0 20px 20px 20px', color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-spinner fa-spin"></i> Calculating accurate valuation...
                </div>
            )}

            {error && (
                <div style={{ padding: '0 20px 20px 20px' }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-exclamation-circle text-red-500"></i>
                        <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>{error}</span>
                    </div>
                </div>
            )}

            {financials.valuationData && (
                <div style={{ padding: '0 20px 20px 20px' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <i className="fas fa-calculator text-green-600"></i>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>Valuation Breakdown</span>
                        </div>

                        <div style={{ display: 'grid', gap: '8px', fontSize: '0.8rem', color: '#166534' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Formula:</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{financials.valuationData.breakdown?.formula}</span>
                            </div>
                            {financials.valuationData.breakdown?.multipliers?.map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{m.type} Multiplier ({m.name}):</span>
                                    <span style={{ fontWeight: 600 }}>+{m.percent}%</span>
                                </div>
                            ))}
                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #86efac', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                <span>Collector Value:</span>
                                <span>{formatIndianCurrency(financials.valuationData.collectorValue)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ padding: '20px' }}>

                {/* Connector/Collector Rate Toggle */}
                <div style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#e0e7ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca' }}>
                                <i className="fas fa-gavel"></i>
                            </div>
                            <div>
                                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Collector Rate Check</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Compare Deal Value vs Circle Rate</span>
                            </div>
                        </div>
                        <div
                            onClick={() => setCharges({ ...charges, useCollectorRate: !charges.useCollectorRate })}
                            style={{
                                width: '44px', height: '24px', background: charges.useCollectorRate ? '#4338ca' : '#cbd5e1',
                                borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            <div style={{
                                width: '20px', height: '20px', background: '#fff', borderRadius: '50%',
                                position: 'absolute', top: '2px', left: charges.useCollectorRate ? '22px' : '2px',
                                transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}></div>
                        </div>
                    </div>

                    {charges.useCollectorRate && (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            {!selectedRate ? (
                                <button
                                    onClick={() => setShowRateSelector(true)}
                                    style={{
                                        width: '100%', padding: '10px', border: '1px dashed #6366f1', borderRadius: '8px',
                                        background: '#eef2ff', color: '#4338ca', fontSize: '0.85rem', fontWeight: 700,
                                        cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}
                                >
                                    <i className="fas fa-plus-circle"></i> Select Applicable Circle Rate
                                </button>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e0e7ff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ padding: '8px', background: '#eff6ff', borderRadius: '8px', color: '#2563eb' }}>
                                            <i className="fas fa-check-double"></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {selectedRate.category} - {selectedRate.subCategory}
                                                <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Auto Linked</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {selectedRate.location?.lookup_value && `${selectedRate.location.lookup_value}, `}
                                                {selectedRate.district?.lookup_value} • {selectedRate.rateApplyOn}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div>
                                            <span style={{ display: 'block', fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>₹{selectedRate.rate?.toLocaleString()}</span>
                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>per {selectedRate.rateUnit}</span>
                                        </div>
                                        <button onClick={handleClearRate} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>
                                            <i className="fas fa-times-circle"></i>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Rate Selector Dropdown */}
                            {showRateSelector && (
                                <div style={{ marginTop: '12px', maxHeight: '300px', overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10 }}>
                                    {loadingRates ? <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>Loading rates...</div> :
                                        collectorRates.length > 0 ? collectorRates.map(rate => {
                                            const isMatch = rate.category === (deal.inventoryId?.category || deal.category);
                                            return (
                                                <div
                                                    key={rate._id}
                                                    onClick={() => handleRateSelect(rate)}
                                                    style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid #f1f5f9',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        color: '#334155',
                                                        background: isMatch ? '#f0fdf4' : 'transparent',
                                                        position: 'relative'
                                                    }}
                                                    className="hover:bg-slate-50"
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 700 }}>
                                                                {rate.district?.lookup_value} {rate.location?.lookup_value && `• ${rate.location.lookup_value}`}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                                {rate.category} / {rate.subCategory} • Basis: {rate.rateApplyOn}
                                                            </div>
                                                            {isMatch && (
                                                                <div style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 800, marginTop: '2px' }}>
                                                                    <i className="fas fa-check-circle"></i> CATEGORY MATCH
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontWeight: 800, color: '#2563eb', fontSize: '1rem' }}>₹{rate.rate}</div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>per {rate.rateUnit}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>No rates found. Add in settings.</div>
                                    }
                                </div>
                            )}

                            {/* Manual Override Option */}
                            <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Manual Rate / Unit Area</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <input
                                        type="number"
                                        placeholder="Rate"
                                        value={charges.collectorRate || ''}
                                        onChange={(e) => handleChange('collectorRate', parseFloat(e.target.value) || 0)}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', width: '100%' }}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Area"
                                        value={charges.unitArea || ''}
                                        onChange={(e) => handleChange('unitArea', parseFloat(e.target.value) || 0)}
                                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', width: '100%' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fff', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Effective Rate Base</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2563eb' }}>
                                        ₹{financials.effectiveRate?.toFixed(2)} / {charges.unitType}
                                    </span>
                                </div>
                                {financials.effectiveRate !== parseFloat(charges.collectorRate) && (
                                    <div style={{ fontSize: '0.65rem', color: '#059669', display: 'flex', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                                        <span>Base: ₹{charges.collectorRate}</span>
                                        {financials.roadMult > 0 && <span>• Road: +{financials.roadMult}%</span>}
                                        {financials.floorMult > 0 && <span>• Floor: +{financials.floorMult}%</span>}
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Collector Value</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(financials.collectorValue)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Calculation Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ fontSize: '0.9rem', color: '#475569', display: 'block' }}>Stamp Duty</span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{charges.stampDutyPercent}% ({charges.buyerGender}) on {formatCurrency(financials.applicableValue)}</span>
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                            {formatCurrency(financials.stampDutyAmount)}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ fontSize: '0.9rem', color: '#475569', display: 'block' }}>Registration Fee</span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Slab/Percent-based</span>
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                            {formatCurrency(financials.registrationAmount)}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem', color: '#475569' }}>Legal & Misc</span>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                            {formatCurrency(charges.legalCharges + charges.miscCharges)}
                        </span>
                    </div>

                    <div style={{ height: '1px', background: '#cbd5e1', margin: '4px 0' }}></div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Total Govt Charges</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#2563eb' }}>
                            {formatCurrency(financials.totalGovtCharges)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 📄 Cost Sheet Component (Printable)
const CostSheet = ({ financials, deal }) => (
    <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ background: '#1e293b', color: '#fff', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Cost Sheet</h2>
                <p style={{ opacity: 0.8, fontSize: '0.85rem', marginTop: '4px' }}>Property Purchase Breakdown</p>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{deal.inventoryId?.unitNo}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{deal.projectName}</div>
            </div>
        </div>

        <div style={{ padding: '32px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '12px 0', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Description</th>
                        <th style={{ textAlign: 'right', padding: '12px 0', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colSpan="2" style={{ padding: '8px 0' }}></td></tr>
                    <CostRow label="A. Basic Sale Consideration" value={financials.dealValue} bold />
                    <tr><td colSpan="2" style={{ borderBottom: '1px dashed #e2e8f0', padding: '8px 0' }}></td></tr>

                    <CostRow label="B. Government Charges" value={financials.totalGovtCharges} bold />
                    <CostRow label="- Stamp Duty" value={financials.stampDutyAmount} indent />
                    <CostRow label="- Registration Fees" value={financials.registrationAmount} indent />
                    <CostRow label="- Legal & Documentation" value={financials.totalGovtCharges - financials.stampDutyAmount - financials.registrationAmount} indent />
                    <tr><td colSpan="2" style={{ borderBottom: '1px dashed #e2e8f0', padding: '8px 0' }}></td></tr>

                    <CostRow label="C. Brokerage / Service Fee" value={financials.brokerageAmount} bold />
                    <tr><td colSpan="2" style={{ borderBottom: '2px solid #e2e8f0', padding: '16px 0' }}></td></tr>

                    <tr style={{ fontSize: '1.25rem' }}>
                        <td style={{ padding: '16px 0', fontWeight: 800, color: '#0f172a' }}>Total Landed Cost (A+B+C)</td>
                        <td style={{ padding: '16px 0', fontWeight: 900, color: '#2563eb', textAlign: 'right' }}>{formatIndianCurrency(financials.grandTotal)}</td>
                    </tr>
                </tbody>
            </table>

            <div style={{ marginTop: '40px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#334155', marginBottom: '12px' }}>Payment Schedule</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>As per agreed payment plan.</p>
            </div>
        </div>

        <div style={{ background: '#f1f5f9', padding: '16px 32px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
            Generated by Bharat Properties CRM on {new Date().toLocaleDateString()}
        </div>
    </div>
);

const InputGroup = ({ label, value, onChange, readOnly, highlight, color = '#1e293b', placeholder, tooltip }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {label}
            {tooltip && <i className="fas fa-info-circle" title={tooltip} style={{ cursor: 'help', opacity: 0.6 }}></i>}
        </label>
        <div style={{ position: 'relative' }}>
            {onChange ? (
                <input
                    type="number"
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600, color: '#334155',
                        outline: 'none', transition: 'all 0.2s'
                    }}
                />
            ) : (
                <div style={{
                    padding: '10px 12px', borderRadius: '8px', background: highlight ? '#fdf4ff' : '#f1f5f9',
                    border: highlight ? '1px solid #e879f9' : '1px solid #e2e8f0',
                    color: color, fontWeight: 800, fontSize: '0.95rem'
                }}>
                    {typeof value === 'number' ? formatIndianCurrency(value) : value}
                </div>
            )}
        </div>
    </div>
);

const CostRow = ({ label, value, bold, indent }) => (
    <tr>
        <td style={{
            padding: '8px 0',
            paddingLeft: indent ? '24px' : '0',
            fontWeight: bold ? 700 : 500,
            color: bold ? '#334155' : '#64748b',
            fontSize: indent ? '0.85rem' : '0.9rem'
        }}>
            {label}
        </td>
        <td style={{
            textAlign: 'right', padding: '8px 0',
            fontWeight: bold ? 800 : 600,
            color: bold ? '#1e293b' : '#64748b'
        }}>
            {formatIndianCurrency(value)}
        </td>
    </tr>
);

export default DealDetailPage;
