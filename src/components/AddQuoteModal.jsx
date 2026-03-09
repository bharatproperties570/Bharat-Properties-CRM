import React, { useState, useEffect, useMemo } from 'react';
import { X, Calculator, CircleDollarSign, Percent, FileText, User, ChevronDown, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { formatIndianCurrency } from '../utils/numberToWords';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { renderValue } from '../utils/renderUtils';

const AddQuoteModal = ({ isOpen, onClose, deal, onSave }) => {
    const { dealMasterFields } = usePropertyConfig();
    const [loading, setLoading] = useState(false);
    const [collectorRates, setCollectorRates] = useState([]);
    const [globalConfigs, setGlobalConfigs] = useState([]);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [leads, setLeads] = useState([]);
    const [leadSearch, setLeadSearch] = useState('');
    const [isSearchingLeads, setIsSearchingLeads] = useState(false);
    const [showLeadResults, setShowLeadResults] = useState(false);
    const [selectedLead, setSelectedLead] = useState(null);

    const [formData, setFormData] = useState({
        buyerType: 'Male',
        collectorRateId: '',
        revenueRuleId: '',
        customPrice: 0,
        gstPercent: 18,
        tdsPercent: 1,
        includeBrokerage: true,
        brokeragePercent: 1
    });

    // Initialize form with deal data
    useEffect(() => {
        if (deal) {
            setFormData(prev => ({
                ...prev,
                customPrice: deal.price || 0,
                buyerType: deal.buyerType || 'Male'
            }));
            if (deal.associatedContact) {
                setSelectedLead({
                    _id: deal.associatedContact._id,
                    name: deal.associatedContact.name,
                    mobile: deal.associatedContact.phone
                });
            }
        }
    }, [deal, isOpen]);

    // Fetch settings data
    useEffect(() => {
        if (!isOpen) return;

        const fetchSettings = async () => {
            setLoadingSettings(true);
            try {
                // Fetch collector rates with specific filters
                const rateParams = new URLSearchParams();
                const categoryStr = renderValue(deal?.category, '');
                const subCategoryStr = renderValue(deal?.subCategory, '');

                if (categoryStr) rateParams.append('category', categoryStr);
                if (subCategoryStr) rateParams.append('subCategory', subCategoryStr);

                // Location filtering if available in deal or inventory
                const inventory = deal?.inventoryId || {};
                const stateId = deal?.projectId?.address?.state?._id || inventory.state?._id;
                const districtId = deal?.projectId?.address?.district?._id || inventory.district?._id;

                if (stateId) rateParams.append('state', stateId);
                if (districtId) rateParams.append('district', districtId);

                let ratesRes = await api.get(`/collector-rates?${rateParams.toString()}&limit=50`);

                // Fallback: If no specific match, try fetching more general rates
                if (ratesRes.data?.status === 'success' && (!ratesRes.data.data.docs || ratesRes.data.data.docs.length === 0)) {
                    // Try without category/subcategory or just fetch all available
                    ratesRes = await api.get(`/collector-rates?limit=100`);
                }

                if (ratesRes.data?.status === 'success') {
                    const rates = ratesRes.data.data.docs || [];
                    setCollectorRates(rates);
                    if (rates.length > 0) {
                        setFormData(prev => ({ ...prev, collectorRateId: rates[0]._id }));
                    }
                }

                // Fetch global configs (revenue rules)
                const configRes = await api.get('/system-settings?category=govt_charges_config');
                if (configRes.data?.status === 'success') {
                    const docs = Array.isArray(configRes.data.data) ? configRes.data.data : (configRes.data.data.docs || []);
                    setGlobalConfigs(docs);
                    if (docs.length > 0) {
                        setFormData(prev => ({ ...prev, revenueRuleId: docs[0]._id }));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch settings for quote:", error);
                toast.error("Failed to load some settings");
            } finally {
                setLoadingSettings(false);
            }
        };

        fetchSettings();
    }, [isOpen, deal]);

    // Debounced lead search
    useEffect(() => {
        if (!leadSearch.trim()) {
            setLeads([]);
            return;
        }

        const fetchLeads = async () => {
            setIsSearchingLeads(true);
            try {
                const response = await api.get(`leads`, {
                    params: { search: leadSearch, limit: 10 }
                });
                if (response.data?.success) {
                    setLeads(response.data.records || []);
                }
            } catch (error) {
                console.error("Lead search failed:", error);
            } finally {
                setIsSearchingLeads(false);
            }
        };

        const timer = setTimeout(fetchLeads, 500);
        return () => clearTimeout(timer);
    }, [leadSearch]);

    const selectedCollectorRate = useMemo(() =>
        collectorRates.find(r => r._id === formData.collectorRateId),
        [collectorRates, formData.collectorRateId]);

    const selectedRevenueRule = useMemo(() =>
        globalConfigs.find(c => c._id === formData.revenueRuleId)?.value,
        [globalConfigs, formData.revenueRuleId]);

    // Calculations logic similar to DealDetailPage
    const quoteCalculations = useMemo(() => {
        if (!deal) return null;

        const basePrice = parseFloat(formData.customPrice) || 0;
        let collectorValue = 0;
        let stampDutyPercent = 7;
        let registrationPercent = 1;
        let legalFees = 15000;

        // Apply Revenue Rule (Global Config)
        if (selectedRevenueRule) {
            if (formData.buyerType === 'Female') stampDutyPercent = selectedRevenueRule.stampDutyFemale || 5;
            else if (formData.buyerType === 'Joint') stampDutyPercent = selectedRevenueRule.stampDutyJoint || 6;
            else stampDutyPercent = selectedRevenueRule.stampDutyMale || 7;

            registrationPercent = selectedRevenueRule.registrationPercent || 1;
            legalFees = selectedRevenueRule.legalFees || 15000;
        }

        // Apply Collector Rate
        if (selectedCollectorRate) {
            const inventory = deal.inventoryId || {};
            const area = selectedCollectorRate.rateApplyOn === 'Built-up Area'
                ? (inventory.builtUpArea?.value || inventory.builtUpArea || 0)
                : (inventory.totalArea || inventory.area || 0);

            // Basic multiplier logic (simplified for modal, could be expanded)
            let multiplier = 1;
            // Add road/floor multiplier logic if needed

            collectorValue = selectedCollectorRate.rate * area * multiplier;
        }

        const applicableValue = Math.max(basePrice, collectorValue) || 0;
        const stampDutyAmount = (applicableValue * (stampDutyPercent / 100)) || 0;
        const registrationAmount = (applicableValue * (registrationPercent / 100)) || 0;
        const gstAmount = (basePrice * (formData.gstPercent / 100)) || 0;
        const tdsAmount = (basePrice * (formData.tdsPercent / 100)) || 0;
        const brokerageAmount = formData.includeBrokerage ? ((basePrice * (formData.brokeragePercent / 100)) || 0) : 0;

        const totalGovtCharges = (stampDutyAmount + registrationAmount + (legalFees || 0)) || 0;
        const netPayable = (basePrice + totalGovtCharges + gstAmount + brokerageAmount - tdsAmount) || 0;

        return {
            basePrice,
            collectorValue,
            applicableValue,
            stampDutyPercent,
            stampDutyAmount,
            registrationAmount,
            gstAmount,
            tdsAmount,
            brokerageAmount,
            totalGovtCharges,
            netPayable,
            legalFees
        };
    }, [deal, formData, selectedCollectorRate, selectedRevenueRule]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const payload = {
                dealId: deal._id,
                ...formData,
                associatedContact: selectedLead?._id,
                calculations: quoteCalculations
            };
            // In a real app, we'd save this to a 'quotes' collection
            // For now, we update the deal stage to 'Quote' and store basic info
            const res = await api.put(`deals/${deal._id}`, {
                stage: 'Quote',
                associatedContact: selectedLead?._id,
                quotePrice: quoteCalculations.basePrice || 0,
                calculations: quoteCalculations
            });

            if (res.data?.success) {
                toast.success("Quote generated successfully!");
                onSave && onSave(res.data.data);
                onClose();
            }
        } catch (error) {
            console.error("Quote save failed:", error);
            toast.error("Failed to save quote");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    if (!isOpen) return null;

    // --- Premium Styles System ---
    const styles = {
        overlay: {
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '24px',
            animation: 'fadeIn 0.3s ease-out'
        },
        container: {
            backgroundColor: '#ffffff',
            width: '100%',
            maxWidth: '1100px',
            height: '92vh',
            borderRadius: '40px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            position: 'relative',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        },
        header: {
            padding: '32px 48px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)'
        },
        headerIconBox: {
            width: '56px',
            height: '56px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.25)'
        },
        closeBtn: {
            padding: '12px',
            borderRadius: '50%',
            border: 'none',
            background: '#f1f5f9',
            color: '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
        },
        body: {
            flex: 1,
            overflowY: 'auto',
            padding: '48px',
            background: '#ffffff',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 400px',
            gap: '48px'
        },
        sectionTitle: {
            fontSize: '0.65rem',
            fontWeight: 900,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        },
        inputGroup: {
            marginBottom: '28px'
        },
        label: {
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 800,
            color: '#64748b',
            marginBottom: '10px',
            marginLeft: '4px'
        },
        input: {
            width: '100%',
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            border: '2px solid #f1f5f9',
            borderRadius: '16px',
            fontSize: '1rem',
            fontWeight: 600,
            color: '#1e293b',
            outline: 'none',
            transition: 'all 0.2s',
            boxSizing: 'border-box'
        },
        select: {
            width: '100%',
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            border: '2px solid #f1f5f9',
            borderRadius: '16px',
            fontSize: '1rem',
            fontWeight: 600,
            color: '#1e293b',
            outline: 'none',
            appearance: 'none',
            cursor: 'pointer',
            background: '#f8fafc url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E") no-repeat right 20px center',
            backgroundSize: '16px',
            boxSizing: 'border-box'
        },
        pillContainer: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px'
        },
        pill: (active) => ({
            padding: '14px',
            borderRadius: '16px',
            border: `2px solid ${active ? '#2563eb' : '#f1f5f9'}`,
            backgroundColor: active ? '#eff6ff' : '#f8fafc',
            color: active ? '#1e40af' : '#64748b',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'center'
        }),
        summaryCard: {
            backgroundColor: '#f8fafc',
            borderRadius: '32px',
            padding: '40px',
            border: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            height: 'fit-content',
            position: 'sticky',
            top: 0
        },
        summaryRow: (isTotal = false, isGst = false, isTds = false) => ({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: isTotal ? '24px 0 0 0' : '16px 0',
            borderBottom: isTotal ? 'none' : '1px solid #e2e8f080',
            marginTop: isTotal ? '24px' : '0',
            borderTop: isTotal ? '2px dashed #cbd5e1' : 'none',
            color: isTotal ? '#1e293b' : (isGst ? '#059669' : (isTds ? '#e11d48' : '#475569'))
        }),
        footer: {
            padding: '32px 48px',
            borderTop: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        primaryBtn: {
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '18px 36px',
            borderRadius: '20px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.2s'
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <div style={styles.headerIconBox}>
                            <Calculator size={28} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: 0, tracking: '-0.02em' }}>
                                Professional Quotation
                            </h2>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                                {renderValue(deal?.category)} • {renderValue(deal?.unitNo, 'Unit Details')} • {renderValue(deal?.projectName, 'Project')}
                            </p>
                        </div>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    {/* Form Left Side */}
                    <div>
                        <div style={{ marginBottom: '48px' }}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                                Buyer Profile Mapping
                            </h3>

                            {/* Lead Selection Section */}
                            <div style={styles.searchContainer}>
                                <label style={styles.label}>Associated Lead / Contact</label>

                                {selectedLead ? (
                                    <div style={styles.selectedLeadBadge}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                            <User size={20} color="#0369a1" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0369a1' }}>{selectedLead.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: 600 }}>{selectedLead.mobile || 'No Mobile'}</div>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedLead(null); setLeadSearch(''); }}
                                            style={{ border: 'none', background: 'transparent', color: '#0ea5e9', cursor: 'pointer', padding: '8px' }}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={leadSearch}
                                            onChange={(e) => { setLeadSearch(e.target.value); setShowLeadResults(true); }}
                                            onFocus={() => setShowLeadResults(true)}
                                            style={styles.input}
                                            placeholder="Search by name or mobile..."
                                        />
                                        {isSearchingLeads && (
                                            <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)' }}>
                                                <div className="spinner-small" />
                                            </div>
                                        )}

                                        {showLeadResults && leadSearch.length > 0 && (
                                            <div style={styles.searchResults}>
                                                {leads.length > 0 ? leads.map(lead => {
                                                    const name = lead.firstName ? `${lead.salutation || ""} ${lead.firstName} ${lead.lastName || ""}`.trim() : renderValue(lead.name, "Unknown");
                                                    return (
                                                        <div
                                                            key={lead._id}
                                                            style={styles.resultItem}
                                                            onClick={() => {
                                                                setSelectedLead({ _id: lead._id, name, mobile: lead.mobile });
                                                                setShowLeadResults(false);
                                                                setLeadSearch('');
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{name}</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{lead.mobile || 'N/A'} • {renderValue(lead.stage, 'New')}</span>
                                                        </div>
                                                    );
                                                }) : !isSearchingLeads && (
                                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                        No leads found for "{leadSearch}"
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div style={styles.pillContainer}>
                                {['Male', 'Female', 'Joint'].map((type) => (
                                    <div
                                        key={type}
                                        onClick={() => setFormData(prev => ({ ...prev, buyerType: type }))}
                                        style={styles.pill(formData.buyerType === type)}
                                    >
                                        {type}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '48px' }}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }} />
                                Valuation & Taxation
                            </h3>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Deal Base Price (₹)</label>
                                <input
                                    type="number"
                                    value={formData.customPrice}
                                    onChange={(e) => setFormData(prev => ({ ...prev, customPrice: e.target.value }))}
                                    style={styles.input}
                                    placeholder="Enter deal amount"
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>GST Calculation (%)</label>
                                    <input
                                        type="number"
                                        value={formData.gstPercent}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstPercent: e.target.value }))}
                                        style={styles.input}
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <label style={styles.label}>TDS Withholding (%)</label>
                                    <input
                                        type="number"
                                        value={formData.tdsPercent}
                                        onChange={(e) => setFormData(prev => ({ ...prev, tdsPercent: e.target.value }))}
                                        style={styles.input}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                                Regulatory Framework
                            </h3>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Revenue Policy (Global Config)</label>
                                <select
                                    value={formData.revenueRuleId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, revenueRuleId: e.target.value }))}
                                    style={styles.select}
                                >
                                    <option value="">Select Revenue Rule</option>
                                    {globalConfigs.map(c => (
                                        <option key={c._id} value={c._id}>{c.value?.configName || c.key}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Collector / Circle Rate</label>
                                <select
                                    value={formData.collectorRateId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, collectorRateId: e.target.value }))}
                                    style={styles.select}
                                >
                                    <option value="">Choose Local Circle Rate</option>
                                    {collectorRates.map(r => (
                                        <option key={r._id} value={r._id}>{renderValue(r.category)} - {renderValue(r.subCategory)} (₹{r.rate})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Summary Right Side */}
                    <div style={styles.summaryCard}>
                        <h3 style={styles.sectionTitle}>
                            <FileText size={14} /> Economic Breakdown
                        </h3>

                        <div style={{ flex: 1 }}>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Quoted Price</span>
                                <span style={{ fontSize: '1rem', fontWeight: 900 }}>{formatIndianCurrency(quoteCalculations?.basePrice)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Stamp Duty ({quoteCalculations?.stampDutyPercent}%)</span>
                                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.stampDutyAmount)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Registration</span>
                                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.registrationAmount)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: '#94a3b8' }}>Legal & Admin Fees</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>+{formatIndianCurrency(quoteCalculations?.legalFees)}</span>
                            </div>

                            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                    <span>Taxes & Levies</span>
                                </div>
                                <div style={styles.summaryRow(false, true)}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>GST ({formData.gstPercent}%)</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.gstAmount)}</span>
                                </div>
                                <div style={styles.summaryRow(false, false, true)}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TDS Reserve</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>-{formatIndianCurrency(quoteCalculations?.tdsAmount)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Total Footer */}
                        <div style={styles.summaryRow(true)}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '4px' }}>
                                    Final Payable Value
                                </div>
                                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1e293b', tracking: '-0.04em' }}>
                                    {formatIndianCurrency(quoteCalculations?.netPayable)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ width: '48px', height: '48px', backgroundColor: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', marginLeft: 'auto', marginBottom: '8px' }}>
                                    <CheckCircle2 size={28} />
                                </div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase' }}>Valid Quote</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Footer */}
                <div style={styles.footer}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                        <Calculator size={18} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                            Advanced Quoting Engine v2.5.0
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', cursor: 'pointer', tracking: '0.05em' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || loadingSettings}
                            style={styles.primaryBtn}
                        >
                            {loading ? 'Processing...' : (
                                <>
                                    <FileText size={18} />
                                    Generate & Save Quote
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.98) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .spinner-small {
                    width: 20px;
                    height: 20px;
                    border: 2px solid #e2e8f0;
                    border-top-color: #2563eb;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; borderRadius: 10px; }
                `}
            </style>
        </div >
    );
};

export default AddQuoteModal;
