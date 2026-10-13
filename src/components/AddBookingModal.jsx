import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { useDeal, useCreateBookingMutation } from '../utils/crmHooks';
import toast from 'react-hot-toast';
import { numberToIndianWords } from '../utils/numberToWords';
import { useTheme } from '../context/ThemeContext';

const AddBookingModal = ({ isOpen, onClose, onSave, dealId = null }) => {
    const { isDark } = useTheme();
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const [currentTab, setCurrentTab] = useState('unit');
    const [isSaving, setIsSaving] = useState(false);
    const [projects, setProjects] = useState([]);
    const [units, setUnits] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [users, setUsers] = useState([]);
    const createBookingMutation = useCreateBookingMutation();

    const [formData, setFormData] = useState({
        type: 'Sale', // Sale, Rent, Lease
        project: '',  // Used for filtering units
        property: '', // This is the inventory ObjectId
        lead: '',     // This is the Contact ObjectId
        bookingDate: new Date().toISOString().split('T')[0],
        applicationNo: '', // Will be auto-generated

        // New fields for specific unit details
        unitNumber: '',

        // Financials
        totalDealAmount: '',
        tokenAmount: '',
        agreementAmount: '',
        agreementDate: '',
        isPartPaymentEnabled: false,
        partPayments: [{ amount: '', date: '' }],
        finalPaymentDate: '',

        // Stakeholders
        salesAgent: '',
        executiveIncentivePercent: '',
        executiveIncentiveAmount: '',
        isChannelPartnerEnabled: false,
        channelPartner: '',
        partnerSide: 'Buyer Side', // Buyer Side, Seller Side

        // Commissions
        sellerBrokeragePercent: '',
        sellerBrokerageAmount: '',
        buyerBrokeragePercent: '',
        buyerBrokerageAmount: '',

        seller: '', // Tracked internally, populated from unit selection

        dealId: '',
        remarks: '',
        size: '',
        sizeLabel: ''
    });

    // Auto-generate Form ID (Application No)
    const generatedAppNo = useMemo(() => {
        const projectObj = projects.find(p => p._id === formData.project);
        const projPart = projectObj ? projectObj.name.substring(0, 3).toUpperCase() : 'PRJ';
        const unitPart = formData.unitNumber || '000';
        const datePart = formData.bookingDate ? formData.bookingDate.split('-').slice(1).reverse().join('') : '0000';

        return `${unitPart}/${projPart}/${datePart}`.replace(/\s+/g, '');
    }, [formData.project, formData.unitNumber, formData.bookingDate, projects]);

    useEffect(() => {
        setFormData(prev => ({ ...prev, applicationNo: generatedAppNo }));
    }, [generatedAppNo]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [projRes, contactRes, userRes] = await Promise.all([
                    api.get('/projects'),
                    api.get('/contacts?limit=500'),
                    api.get('/users')
                ]);
                setProjects(projRes.data.data || []);
                setContacts(contactRes.data.records || contactRes.data.data || []);
                setUsers(userRes.data.data || []);
            } catch (error) {
                console.error('[AddBookingModal] Error fetching modal data:', error);
                toast.error('Failed to load form data');
            }
        };

        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const { data: dealPayload } = useDeal(isOpen && dealId ? dealId : null);

    // Pre-populate if dealId is provided
    useEffect(() => {
        if (isOpen && dealPayload?.data) {
            const deal = dealPayload.data;
            setFormData(prev => ({
                ...prev,
                project: deal.projectId?._id || deal.projectId || '',
                property: deal.inventoryId?._id || deal.inventoryId || '',
                lead: deal.partyStructure?.buyer?._id || deal.partyStructure?.buyer || '',
                totalDealAmount: deal.price || '',
                dealId: deal._id || deal.id
            }));
        }
    }, [isOpen, dealPayload]);

    // Auto-calculate Balance
    const balanceAmount = useMemo(() => {
        const total = parseFloat(formData.totalDealAmount || 0);
        const agreement = parseFloat(formData.agreementAmount || 0);
        const partsSum = formData.isPartPaymentEnabled
            ? formData.partPayments.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0)
            : 0;
        return total - agreement - partsSum;
    }, [formData.totalDealAmount, formData.agreementAmount, formData.partPayments, formData.isPartPaymentEnabled]);

    // Auto-calculate Total Commission (Seller + Buyer)
    // Total Commission (excludes side assigned to CP if enabled)
    const totalCommissionAmount = useMemo(() => {
        const sellerAmt = parseFloat(formData.sellerBrokerageAmount || 0);
        const buyerAmt = parseFloat(formData.buyerBrokerageAmount || 0);

        if (!formData.isChannelPartnerEnabled) return sellerAmt + buyerAmt;

        // If CP is on Buyer Side, only Seller side counts for total commission and incentive
        if (formData.partnerSide === 'Buyer Side') return sellerAmt;
        if (formData.partnerSide === 'Seller Side') return buyerAmt;

        return sellerAmt + buyerAmt;
    }, [formData.isChannelPartnerEnabled, formData.partnerSide, formData.sellerBrokerageAmount, formData.buyerBrokerageAmount]);

    // Auto-calculate Brokerage & Incentive
    useEffect(() => {
        const total = parseFloat(formData.totalDealAmount || 0);
        const sPercent = parseFloat(formData.sellerBrokeragePercent || 0);
        const bPercent = parseFloat(formData.buyerBrokeragePercent || 0);
        const ePercent = parseFloat(formData.executiveIncentivePercent || 0);

        const sAmt = (total * sPercent) / 100;
        const bAmt = (total * bPercent) / 100;

        // Incentive is calculated on the total commission (which already handles CP exclusions)
        const eAmt = (totalCommissionAmount * ePercent) / 100;

        setFormData(prev => {
            if (prev.sellerBrokerageAmount === sAmt &&
                prev.buyerBrokerageAmount === bAmt &&
                prev.executiveIncentiveAmount === eAmt) return prev;

            return {
                ...prev,
                sellerBrokerageAmount: sAmt,
                buyerBrokerageAmount: bAmt,
                executiveIncentiveAmount: eAmt
            };
        });
    }, [formData.totalDealAmount, formData.sellerBrokeragePercent, formData.buyerBrokeragePercent, formData.executiveIncentivePercent, totalCommissionAmount]);

    useEffect(() => {
        const fetchUnits = async () => {
            if (!formData.project) {
                setUnits([]);
                return;
            }
            const project = projects.find(p => p._id === formData.project);
            if (!project) return;
            try {
                const res = await api.get(`/inventory?project=${encodeURIComponent(project.name)}&limit=1000`);
                setUnits(res.data.records || res.data.data || []);
            } catch (error) {
                console.error('[AddBookingModal] Error fetching units:', error);
                toast.error('Failed to load units');
            }
        };
        fetchUnits();
    }, [formData.project, projects]);

    const handleProjectChange = (e) => {
        setFormData({ ...formData, project: e.target.value, property: '', unitNumber: '' });
    };

    const handlePropertyChange = (e) => {
        const propId = e.target.value;
        const unit = units.find(u => u._id === propId);
        if (unit) {
            setFormData({
                ...formData,
                property: propId,
                unitNumber: unit.unitNumber || unit.unitNo || '',
                seller: unit.owners?.[0]?._id || unit.owners?.[0] || '',
                size: unit.size?.value || unit.size || '',
                sizeLabel: (unit.sizeLabel && typeof unit.sizeLabel === 'object') ? (unit.sizeLabel._id || unit.sizeLabel.id) : unit.sizeLabel || ''
            });
        } else {
            setFormData({ ...formData, property: propId, seller: '', size: '', sizeLabel: '' });
        }
    };

    const addPartPayment = () => {
        setFormData({
            ...formData,
            partPayments: [...formData.partPayments, { amount: '', date: '' }]
        });
    };

    const removePartPayment = (index) => {
        const updated = formData.partPayments.filter((_, i) => i !== index);
        setFormData({ ...formData, partPayments: updated.length ? updated : [{ amount: '', date: '' }] });
    };

    const handlePartPaymentChange = (index, field, value) => {
        const updated = [...formData.partPayments];
        updated[index][field] = value;
        setFormData({ ...formData, partPayments: updated });
    };

    const handleSave = async () => {
        // Professional Validation with specific feedback
        if (!formData.property) {
            toast.error('Please select a Property / Unit');
            return;
        }
        if (!formData.lead) {
            toast.error('Please select a Lead / Buyer');
            return;
        }
        if (!formData.salesAgent) {
            toast.error('Please select a Sales Agent');
            return;
        }

        console.log('[AddBookingModal] Attempting save with data:', formData);

        setIsSaving(true);
        const submissionData = { ...formData };

        // Ensure IDs are properly formatted strings if they come as objects
        ['salesAgent', 'channelPartner', 'lead', 'property', 'project', 'dealId', 'seller'].forEach(key => {
            if (submissionData[key] && typeof submissionData[key] === 'object') {
                submissionData[key] = submissionData[key]._id || submissionData[key].id || submissionData[key];
            }
            if (!submissionData[key]) delete submissionData[key];
        });
        try {
            const response = await createBookingMutation.mutateAsync(submissionData);
            if (response.success) {
                toast.success('Booking created successfully!');
                onSave();
                onClose();
            } else {
                toast.error(response.message || 'Failed to save booking');
            }
        } catch (error) {
            console.error('[AddBookingModal] Save error:', error);
            toast.error(error.response?.data?.message || error.message || 'Error saving booking');
        } finally {
            setIsSaving(false);
        }
    };

    const TABS = [
        { id: 'unit', label: 'Unit & Buyer', icon: 'fas fa-home', color: '#059669' },
        { id: 'financials', label: 'Financials & Schedule', icon: 'fas fa-receipt', color: '#6366f1' },
        { id: 'commissions', label: 'Brokerage & Commission', icon: 'fas fa-hand-holding-usd', color: '#10b981' },
        { id: 'stakeholders', label: 'Agent & Partner', icon: 'fas fa-user-tie', color: '#8b5cf6' },
        { id: 'remarks', label: 'Remarks & Notes', icon: 'fas fa-clipboard-list', color: '#f59e0b' },
        { id: 'all', label: 'All Details', icon: 'fas fa-layer-group', color: '#64748b' },
    ];

    const handleNextTab = () => {
        const idx = TABS.findIndex(t => t.id === currentTab);
        if (idx >= 0 && idx < TABS.length - 2) {
            setCurrentTab(TABS[idx + 1].id);
        } else if (idx === TABS.length - 2) {
            setCurrentTab(TABS[0].id);
        }
    };

    const handlePrevTab = () => {
        const idx = TABS.findIndex(t => t.id === currentTab);
        if (idx > 0) {
            setCurrentTab(TABS[idx - 1].id);
        }
    };

    if (!isOpen) return null;

    const ent = {
        card: {
            background: isDark ? '#1e293b' : '#ffffff',
            padding: '22px 24px',
            borderRadius: '16px',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #e2e8f0',
            boxShadow: isDark ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.03)',
            marginBottom: '18px'
        },
        sectionHeader: (color) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: isDark ? `1px solid ${color}25` : '1px solid #f1f5f9'
        }),
        iconBadge: (color) => ({
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: color + (isDark ? '25' : '15'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            flexShrink: 0,
            fontSize: '14px'
        }),
        sectionTitle: {
            margin: 0,
            fontSize: '0.9rem',
            fontWeight: 800,
            color: isDark ? '#f1f5f9' : '#0f172a',
            letterSpacing: '-0.01em'
        },
        sectionSubtitle: {
            margin: '2px 0 0 0',
            fontSize: '0.74rem',
            color: isDark ? '#94a3b8' : '#64748b',
            fontWeight: 500
        },
        label: {
            display: 'block',
            fontSize: '0.71rem',
            fontWeight: 800,
            color: isDark ? '#94a3b8' : '#64748b',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.45px'
        },
        input: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#f1f5f9' : '#1e293b',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
            height: '40px',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease'
        },
        select: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#f1f5f9' : '#1e293b',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            height: '40px',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '10px',
            paddingRight: '32px',
            cursor: 'pointer'
        },
        selectDisabled: {
            width: '100%',
            padding: '9px 12px',
            borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255, 255, 255, 0.05)' : '1.5px solid #f1f5f9',
            fontSize: '0.84rem',
            fontWeight: 500,
            outline: 'none',
            color: isDark ? '#64748b' : '#94a3b8',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
            height: '40px',
            boxSizing: 'border-box',
            cursor: 'not-allowed',
            backgroundImage: 'none'
        }
    };

    const agentContacts = contacts.filter(c =>
        c.professionSubCategory === 'Real Estate Agent' ||
        (typeof c.professionSubCategory === 'object' && c.professionSubCategory?.lookup_value === 'Real Estate Agent')
    );

    const types = [
        { id: 'Sale', label: 'Sale', icon: 'fas fa-tag' },
        { id: 'Rent', label: 'Rent', icon: 'fas fa-key' },
        { id: 'Lease', label: 'Lease', icon: 'fas fa-file-contract' }
    ];

    // Sub-renderer: Unit Information
    const renderUnitSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#059669')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#059669')}>
                        <i className="fas fa-home"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Unit & Buyer Information</h4>
                        <p style={ent.sectionSubtitle}>Select transaction type, project hierarchy, registered inventory, and lead</p>
                    </div>
                </div>
                {formData.applicationNo && (
                    <span style={{
                        fontSize: '0.73rem', fontWeight: 800, padding: '3px 10px', borderRadius: '6px',
                        background: isDark ? 'rgba(5,150,105,0.2)' : '#ecfdf5',
                        color: '#059669', border: '1px solid #a7f3d0', fontFamily: 'monospace'
                    }}>
                        REF: {formData.applicationNo}
                    </span>
                )}
            </div>

            {/* Segmented Booking Intent Control */}
            <div style={{ marginBottom: '20px' }}>
                <label style={ent.label}>Booking Type</label>
                <div style={{
                    display: 'flex',
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                    padding: '4px',
                    borderRadius: '12px',
                    gap: '4px'
                }}>
                    {types.map(t => {
                        const active = formData.type === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setFormData({ ...formData, type: t.id })}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: active ? (isDark ? '#059669' : '#ffffff') : 'transparent',
                                    color: active ? (isDark ? '#ffffff' : '#059669') : (isDark ? '#94a3b8' : '#64748b'),
                                    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                                    fontWeight: active ? 800 : 600,
                                    fontSize: '0.84rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={t.icon} style={{ fontSize: '13px' }}></i>
                                <span>{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                    <label style={ent.label}>Project Name *</label>
                    <select value={formData.project} onChange={handleProjectChange} style={ent.select}>
                        <option value="">Select Project</option>
                        {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Property / Unit *</label>
                    <select
                        value={formData.property}
                        onChange={handlePropertyChange}
                        style={units.length === 0 ? ent.selectDisabled : ent.select}
                        disabled={!units.length}
                    >
                        <option value="">{units.length === 0 ? 'Select Project First' : 'Select Unit'}</option>
                        {units.map(u => {
                            const uNo = typeof (u.unitNo || u.unitNumber) === 'object' ? (u.unitNo?.lookup_value || u.unitNumber?.lookup_value || '') : (u.unitNo || u.unitNumber || '');
                            const bVal = typeof u.block === 'object' ? (u.block?.lookup_value || u.block?.name || '') : (u.block || '');
                            return <option key={u._id} value={u._id}>{uNo} {bVal ? `(${bVal})` : ''}</option>;
                        })}
                    </select>
                </div>
            </div>

            {/* Unit Owner Information Card */}
            {formData.property && units.find(u => u._id === formData.property) && (
                <div style={{
                    background: isDark ? 'rgba(14, 165, 233, 0.08)' : '#f0f9ff',
                    border: isDark ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid #bae6fd',
                    borderLeft: '4px solid #0ea5e9',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '24px',
                    animation: 'fadeIn 0.3s ease-in-out'
                }}>
                    {(() => {
                        const unit = units.find(u => u._id === formData.property);
                        const owner = unit.owners?.[0];
                        if (!owner) return (
                            <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.84rem' }}>
                                <i className="fas fa-info-circle mr-1 text-sky-500"></i> No registered owner information linked to this unit.
                            </div>
                        );

                        const safeStr = (v) => {
                            if (!v) return '';
                            if (typeof v === 'object') return v.lookup_value || v.name || v.label || v.value || '';
                            return String(v);
                        };

                        const name = safeStr(owner.name) || 'N/A';
                        const fatherName = safeStr(owner.fatherName || owner.guardian) || 'N/A';

                        const formatAddr = (addr) => {
                            if (!addr) return null;
                            if (typeof addr === 'string') return addr;
                            return [safeStr(addr.hNo), safeStr(addr.street), safeStr(addr.locality), safeStr(addr.city)].filter(Boolean).join(', ') || null;
                        };
                        const address = formatAddr(owner.personalAddress) || safeStr(owner.address?.locality) || safeStr(owner.address?.city) || 'N/A';

                        return (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '3px' }}>Unit Owner</span>
                                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>{name}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '3px' }}>Father's Name</span>
                                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>{fatherName}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '180px' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '3px' }}>Registered Address</span>
                                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>{address}</span>
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div>
                    <label style={ent.label}>Booked Lead / Buyer *</label>
                    <select value={formData.lead} onChange={(e) => setFormData({ ...formData, lead: e.target.value })} style={ent.select}>
                        <option value="">Select Buyer</option>
                        {contacts.map(c => <option key={c._id} value={c._id}>{c.name} {c.phones?.[0]?.number ? `(${c.phones[0].number})` : ''}</option>)}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Booking Date *</label>
                    <input type="date" value={formData.bookingDate} onChange={(e) => setFormData({ ...formData, bookingDate: e.target.value })} style={ent.input} />
                </div>
            </div>
        </div>
    );

    // Sub-renderer: Financials & Schedule
    const renderFinancialsSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#6366f1')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#6366f1')}>
                        <i className="fas fa-receipt"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Financial Commitments & Milestones</h4>
                        <p style={ent.sectionSubtitle}>Deal value, token amount, agreement milestones, and payment schedule</p>
                    </div>
                </div>
                {formData.totalDealAmount && (
                    <span style={{
                        fontSize: '0.8rem', fontWeight: 800, padding: '3px 12px', borderRadius: '6px',
                        background: isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff',
                        color: '#6366f1', border: '1px solid #c7d2fe'
                    }}>
                        ₹ {parseFloat(formData.totalDealAmount || 0).toLocaleString('en-IN')}
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <label style={ent.label}>Total Deal Amount *</label>
                    <input
                        type="number"
                        value={formData.totalDealAmount}
                        onChange={(e) => setFormData({ ...formData, totalDealAmount: e.target.value })}
                        style={{ ...ent.input, fontWeight: 700, fontSize: '0.98rem' }}
                        placeholder="0"
                    />
                    {formData.totalDealAmount && (
                        <div style={{ fontSize: '0.73rem', color: '#6366f1', fontWeight: 600, marginTop: '4px' }}>
                            {numberToIndianWords(formData.totalDealAmount)}
                        </div>
                    )}
                </div>
                <div>
                    <label style={ent.label}>Token Amount</label>
                    <input
                        type="number"
                        value={formData.tokenAmount}
                        onChange={(e) => setFormData({ ...formData, tokenAmount: e.target.value })}
                        style={ent.input}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label style={ent.label}>Agreement Amount</label>
                    <input
                        type="number"
                        value={formData.agreementAmount}
                        onChange={(e) => setFormData({ ...formData, agreementAmount: e.target.value })}
                        style={ent.input}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label style={ent.label}>Agreement Date</label>
                    <input
                        type="date"
                        value={formData.agreementDate}
                        onChange={(e) => setFormData({ ...formData, agreementDate: e.target.value })}
                        style={ent.input}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', alignItems: 'flex-start' }}>
                <div>
                    <label style={ent.label}>Part Payments Option</label>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px', height: '40px',
                        padding: '0 12px', borderRadius: '10px',
                        background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                        border: isDark ? '1.5px solid rgba(255,255,255,0.08)' : '1.5px solid #e2e8f0'
                    }}>
                        <div
                            onClick={() => setFormData({ ...formData, isPartPaymentEnabled: !formData.isPartPaymentEnabled })}
                            style={{
                                width: '42px', height: '22px', borderRadius: '11px',
                                background: formData.isPartPaymentEnabled ? '#6366f1' : (isDark ? '#475569' : '#cbd5e1'),
                                position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                            }}
                        >
                            <div style={{
                                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: '2px',
                                left: formData.isPartPaymentEnabled ? '22px' : '2px',
                                transition: 'left 0.3s'
                            }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: formData.isPartPaymentEnabled ? '#6366f1' : (isDark ? '#94a3b8' : '#64748b') }}>
                            {formData.isPartPaymentEnabled ? 'Installments Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>

                <div>
                    <label style={ent.label}>Remaining Balance</label>
                    <input
                        readOnly
                        value={`₹ ${balanceAmount.toLocaleString('en-IN')}`}
                        style={{
                            ...ent.input,
                            fontWeight: 800,
                            color: balanceAmount < 0 ? '#ef4444' : '#10b981',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'
                        }}
                    />
                </div>

                <div>
                    <label style={ent.label}>Full & Final Date</label>
                    <input
                        type="date"
                        value={formData.finalPaymentDate}
                        onChange={(e) => setFormData({ ...formData, finalPaymentDate: e.target.value })}
                        style={ent.input}
                    />
                </div>
            </div>

            {formData.isPartPaymentEnabled && (
                <div style={{
                    marginTop: '20px', padding: '18px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    borderRadius: '12px',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                    animation: 'fadeIn 0.3s ease-in-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isDark ? '#e2e8f0' : '#1e293b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            <i className="fas fa-calendar-alt text-indigo-500 mr-1.5"></i> Scheduled Installments
                        </span>
                        <button
                            type="button"
                            onClick={addPartPayment}
                            style={{
                                background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px',
                                padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <i className="fas fa-plus"></i> Add Installment
                        </button>
                    </div>

                    {formData.partPayments.map((p, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '12px', marginBottom: '10px', alignItems: 'center' }}>
                            <input
                                type="number"
                                placeholder={`Installment ${i + 1} Amount`}
                                value={p.amount}
                                onChange={(e) => handlePartPaymentChange(i, 'amount', e.target.value)}
                                style={ent.input}
                            />
                            <input
                                type="date"
                                value={p.date}
                                onChange={(e) => handlePartPaymentChange(i, 'date', e.target.value)}
                                style={ent.input}
                            />
                            <button
                                type="button"
                                onClick={() => removePartPayment(i)}
                                style={{
                                    height: '40px', borderRadius: '8px', border: 'none',
                                    background: isDark ? 'rgba(239,68,68,0.1)' : '#fee2e2',
                                    color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                title="Remove payment"
                            >
                                <i className="fas fa-trash-alt" style={{ fontSize: '13px' }}></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // Sub-renderer: Brokerage & Commissions
    const renderCommissionsSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#10b981')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#10b981')}>
                        <i className="fas fa-hand-holding-usd"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Brokerage & Commissions Structure</h4>
                        <p style={ent.sectionSubtitle}>Seller side, buyer side, and channel partner brokerage calculations</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
                {/* Seller Side Brokerage */}
                <div style={{
                    padding: '16px 18px',
                    background: isDark ? 'rgba(16, 185, 129, 0.08)' : '#f0fdf4',
                    borderRadius: '12px',
                    border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #dcfce7'
                }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-building"></i> Seller Side Brokerage
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                        <div>
                            <label style={ent.label}>Rate (%)</label>
                            <input
                                type="number"
                                value={formData.sellerBrokeragePercent}
                                onChange={(e) => setFormData({ ...formData, sellerBrokeragePercent: e.target.value })}
                                style={ent.input}
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label style={ent.label}>Calculated Amount</label>
                            <input
                                type="number"
                                readOnly
                                value={formData.sellerBrokerageAmount}
                                style={{ ...ent.input, fontWeight: 800, color: '#10b981', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Buyer Side Brokerage */}
                <div style={{
                    padding: '16px 18px',
                    background: isDark ? 'rgba(59, 130, 246, 0.08)' : '#eff6ff',
                    borderRadius: '12px',
                    border: isDark ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid #dbeafe'
                }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-user-check"></i> Buyer Side Brokerage
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                        <div>
                            <label style={ent.label}>Rate (%)</label>
                            <input
                                type="number"
                                value={formData.buyerBrokeragePercent}
                                onChange={(e) => setFormData({ ...formData, buyerBrokeragePercent: e.target.value })}
                                style={ent.input}
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label style={ent.label}>Calculated Amount</label>
                            <input
                                type="number"
                                readOnly
                                value={formData.buyerBrokerageAmount}
                                style={{ ...ent.input, fontWeight: 800, color: '#3b82f6', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Total Commission Banner */}
            <div style={{
                padding: '16px 22px',
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                borderRadius: '12px',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div>
                    <div style={{ ...ent.label, marginBottom: '2px' }}>
                        Net CRM Commission {formData.isChannelPartnerEnabled ? `(Excluding ${formData.partnerSide})` : ''}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>
                        ₹ {totalCommissionAmount.toLocaleString('en-IN')}
                    </div>
                </div>
                <div style={{ textAlign: 'right', flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 600 }}>
                        {totalCommissionAmount > 0 ? `${numberToIndianWords(totalCommissionAmount)} Only` : 'Zero Commission'}
                    </div>
                </div>
            </div>
        </div>
    );

    // Sub-renderer: Stakeholders (Agent & Partner)
    const renderStakeholdersSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#8b5cf6')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#8b5cf6')}>
                        <i className="fas fa-user-tie"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Sales Agent & Channel Partner</h4>
                        <p style={ent.sectionSubtitle}>Executive incentives allocation and external channel partner integration</p>
                    </div>
                </div>
            </div>

            {/* Sales Agent & Incentive */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginBottom: '22px' }}>
                <div>
                    <label style={ent.label}>Sales Agent *</label>
                    <select value={formData.salesAgent} onChange={(e) => setFormData({ ...formData, salesAgent: e.target.value })} style={ent.select}>
                        <option value="">Select Agent</option>
                        {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
                    </select>
                </div>
                <div>
                    <label style={ent.label}>Incentive (%)</label>
                    <input
                        type="number"
                        value={formData.executiveIncentivePercent}
                        onChange={(e) => setFormData({ ...formData, executiveIncentivePercent: e.target.value })}
                        style={ent.input}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label style={ent.label}>Incentive (₹)</label>
                    <input
                        type="number"
                        readOnly
                        value={formData.executiveIncentiveAmount}
                        style={{ ...ent.input, fontWeight: 700, color: '#8b5cf6', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff' }}
                    />
                </div>
            </div>

            {/* Channel Partner Card */}
            <div style={{
                padding: '16px 18px',
                background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                borderRadius: '12px',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: formData.isChannelPartnerEnabled ? '16px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            onClick={() => setFormData({ ...formData, isChannelPartnerEnabled: !formData.isChannelPartnerEnabled })}
                            style={{
                                width: '42px', height: '22px', borderRadius: '11px',
                                background: formData.isChannelPartnerEnabled ? '#8b5cf6' : (isDark ? '#475569' : '#cbd5e1'),
                                position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                            }}
                        >
                            <div style={{
                                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: '2px',
                                left: formData.isChannelPartnerEnabled ? '22px' : '2px',
                                transition: 'left 0.3s'
                            }} />
                        </div>
                        <div>
                            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>External Channel Partner</span>
                            <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>Involves third-party real estate broker / partner</div>
                        </div>
                    </div>
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '6px',
                        background: formData.isChannelPartnerEnabled ? (isDark ? 'rgba(139,92,246,0.2)' : '#ede9fe') : (isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'),
                        color: formData.isChannelPartnerEnabled ? '#8b5cf6' : (isDark ? '#94a3b8' : '#64748b')
                    }}>
                        {formData.isChannelPartnerEnabled ? 'ACTIVE' : 'NONE'}
                    </span>
                </div>

                {formData.isChannelPartnerEnabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', animation: 'fadeIn 0.3s ease-in-out' }}>
                        <div>
                            <label style={ent.label}>Select Partner (Real Estate Agent)</label>
                            <select value={formData.channelPartner} onChange={(e) => setFormData({ ...formData, channelPartner: e.target.value })} style={ent.select}>
                                <option value="">Select Channel Partner</option>
                                {agentContacts.map(c => <option key={c._id} value={c._id}>{c.name} {c.phones?.[0]?.number ? `(${c.phones[0].number})` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={ent.label}>Partner Side Assignment</label>
                            <div style={{
                                display: 'flex',
                                background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                padding: '3px',
                                borderRadius: '10px'
                            }}>
                                {['Buyer Side', 'Seller Side'].map(s => {
                                    const active = formData.partnerSide === s;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, partnerSide: s })}
                                            style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                fontSize: '0.78rem',
                                                fontWeight: active ? 800 : 600,
                                                padding: '7px',
                                                cursor: 'pointer',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: active ? '#8b5cf6' : 'transparent',
                                                color: active ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                                                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Sub-renderer: Remarks
    const renderRemarksSection = () => (
        <div style={ent.card}>
            <div style={ent.sectionHeader('#f59e0b')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={ent.iconBadge('#f59e0b')}>
                        <i className="fas fa-clipboard-list"></i>
                    </div>
                    <div>
                        <h4 style={ent.sectionTitle}>Remarks & Special Conditions</h4>
                        <p style={ent.sectionSubtitle}>Booking stipulations, special payment clauses, and internal notes</p>
                    </div>
                </div>
            </div>

            <div>
                <label style={ent.label}>Booking Remarks / Notes</label>
                <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    style={{
                        ...ent.input,
                        minHeight: '100px',
                        resize: 'vertical',
                        lineHeight: '1.4',
                        height: 'auto'
                    }}
                    placeholder="Add specific payment terms, possession commitments, or audit notes..."
                />
            </div>
        </div>
    );

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.65)',
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backdropFilter: 'blur(8px)',
                padding: '16px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    width: '980px',
                    maxWidth: '96vw',
                    maxHeight: 'min(92vh, 920px)',
                    height: 'min(92vh, 920px)',
                    borderRadius: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                    color: isDark ? '#f1f5f9' : '#0f172a'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Enterprise Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)', color: '#fff',
                            flexShrink: 0, fontSize: '18px'
                        }}>
                            <i className="fas fa-file-signature"></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                                    Create New Booking
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                    background: dealId ? (isDark ? 'rgba(245,158,11,0.2)' : '#fef3c7') : (isDark ? 'rgba(5,150,105,0.2)' : '#ecfdf5'),
                                    color: dealId ? '#d97706' : '#059669',
                                    border: dealId ? '1px solid #fde68a' : '1px solid #a7f3d0'
                                }}>
                                    {dealId ? 'DEAL LINKED' : 'NEW RECORD'}
                                </span>
                                {formData.unitNumber && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#6ee7b7' : '#059669',
                                        background: isDark ? 'rgba(5,150,105,0.15)' : '#ecfdf5',
                                        padding: '2px 8px', borderRadius: '6px', border: '1px solid #a7f3d0'
                                    }}>
                                        Unit {formData.unitNumber}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginTop: '3px' }}>
                                <i className="far fa-clock" style={{ color: '#059669', fontSize: '11px' }}></i>
                                <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {formData.applicationNo && (
                            <div style={{
                                background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                                color: isDark ? '#93c5fd' : '#2563eb',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                border: isDark ? '1px solid rgba(37,99,235,0.3)' : '1px solid #dbeafe',
                                fontFamily: 'monospace'
                            }}>
                                ID: {formData.applicationNo}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                                color: isDark ? '#cbd5e1' : '#64748b',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                            title="Close"
                        >
                            <i className="fas fa-times" style={{ fontSize: '14px' }}></i>
                        </button>
                    </div>
                </div>

                {/* Tab Navigation Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 24px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
                    overflowX: 'auto',
                    flexShrink: 0
                }} className="no-scrollbar">
                    {TABS.map(tab => {
                        const active = currentTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: active ? (isDark ? 'rgba(5,150,105,0.2)' : '#ffffff') : 'transparent',
                                    color: active ? (isDark ? '#34d399' : '#059669') : (isDark ? '#94a3b8' : '#64748b'),
                                    boxShadow: active ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                                    fontWeight: active ? 800 : 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={tab.icon} style={{ color: active ? tab.color : 'inherit', fontSize: '13px' }}></i>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Modal Body */}
                <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {(currentTab === 'unit' || currentTab === 'all') && renderUnitSection()}
                    {(currentTab === 'financials' || currentTab === 'all') && renderFinancialsSection()}
                    {(currentTab === 'commissions' || currentTab === 'all') && renderCommissionsSection()}
                    {(currentTab === 'stakeholders' || currentTab === 'all') && renderStakeholdersSection()}
                    {(currentTab === 'remarks' || currentTab === 'all') && renderRemarksSection()}
                </div>

                {/* Enterprise Sticky Footer */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isDark ? '#1e293b' : '#f8fafc',
                    flexShrink: 0
                }}>
                    {/* Left: Summary Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                            padding: '6px 14px', borderRadius: '10px',
                            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                            fontSize: '0.76rem', fontWeight: 700
                        }}>
                            <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Deal:</span>
                            <span style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>
                                ₹ {parseFloat(formData.totalDealAmount || 0).toLocaleString('en-IN')}
                            </span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Token:</span>
                            <span style={{ color: '#6366f1' }}>
                                ₹ {parseFloat(formData.tokenAmount || 0).toLocaleString('en-IN')}
                            </span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Balance:</span>
                            <span style={{ color: balanceAmount < 0 ? '#ef4444' : '#10b981' }}>
                                ₹ {balanceAmount.toLocaleString('en-IN')}
                            </span>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 20px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                color: isDark ? '#cbd5e1' : '#475569',
                                fontWeight: 700, fontSize: '0.82rem',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                        >
                            Cancel
                        </button>

                        {currentTab !== 'unit' && currentTab !== 'all' && (
                            <button
                                type="button"
                                onClick={handlePrevTab}
                                style={{
                                    padding: '9px 18px', borderRadius: '10px',
                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                    background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                    color: isDark ? '#cbd5e1' : '#475569',
                                    fontWeight: 700, fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <i className="fas fa-arrow-left"></i>
                                <span>Previous</span>
                            </button>
                        )}

                        {currentTab !== 'remarks' && currentTab !== 'all' && (
                            <button
                                type="button"
                                onClick={handleNextTab}
                                style={{
                                    padding: '9px 20px', borderRadius: '10px',
                                    border: 'none',
                                    background: isDark ? 'rgba(5,150,105,0.2)' : '#ecfdf5',
                                    color: '#059669',
                                    fontWeight: 800, fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span>Next</span>
                                <i className="fas fa-arrow-right"></i>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{
                                padding: '9px 26px', borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                                color: '#ffffff', fontWeight: 800, fontSize: '0.84rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
                                transition: 'all 0.15s ease',
                                opacity: isSaving ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            {isSaving && <i className="fas fa-spinner fa-spin"></i>}
                            <span>{isSaving ? 'Saving...' : 'Confirm Booking'}</span>
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default AddBookingModal;
