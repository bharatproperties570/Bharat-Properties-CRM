import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { numberToIndianWords } from '../utils/numberToWords';

const AddBookingModal = ({ isOpen, onClose, onSave, dealId = null }) => {
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [projects, setProjects] = useState([]);
    const [units, setUnits] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [users, setUsers] = useState([]);

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
        remarks: ''
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
            setIsLoadingData(true);
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
            } finally {
                setIsLoadingData(false);
            }
        };

        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    // Pre-populate if dealId is provided
    useEffect(() => {
        const fetchDealData = async () => {
            if (isOpen && dealId) {
                try {
                    const res = await api.get(`/deals/${dealId}`);
                    if (res.data && res.data.success) {
                        const deal = res.data.deal;
                        setFormData(prev => ({
                            ...prev,
                            project: deal.projectId?._id || deal.projectId || '',
                            property: deal.inventoryId?._id || deal.inventoryId || '',
                            lead: deal.partyStructure?.buyer?._id || deal.partyStructure?.buyer || '',
                            totalDealAmount: deal.price || '',
                            dealId: deal._id || deal.id
                        }));
                    }
                } catch (error) {
                    console.error('[AddBookingModal] Error fetching deal for pre-population:', error);
                }
            }
        };
        fetchDealData();
    }, [isOpen, dealId]);

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
                seller: unit.owners?.[0]?._id || unit.owners?.[0] || ''
            });
        } else {
            setFormData({ ...formData, property: propId, seller: '' });
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
        ['salesAgent', 'channelPartner', 'lead', 'property', 'project'].forEach(key => {
            if (submissionData[key] && typeof submissionData[key] === 'object') {
                submissionData[key] = submissionData[key]._id || submissionData[key].id || submissionData[key];
            }
            if (!submissionData[key]) delete submissionData[key];
        });
        try {
            const response = await api.post('/bookings', submissionData);
            if (response.data.success) {
                toast.success('Booking created successfully!');
                onSave();
                onClose();
            } else {
                toast.error(response.data.message || 'Failed to save booking');
            }
        } catch (error) {
            console.error('[AddBookingModal] Save error:', error);
            toast.error(error.response?.data?.message || 'Error saving booking');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        padding: '24px'
    };

    const modalStyle = {
        background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '1000px',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column'
    };

    const headerStyle = {
        padding: '20px 32px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fff', sticky: 'top', zIndex: 10
    };

    const sectionStyle = { padding: '24px 32px' };
    const sectionTitleStyle = {
        fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '8px'
    };

    const gridStyle = { display: 'grid', gap: '20px', marginBottom: '24px' };
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '6px' };
    const labelStyle = { fontSize: '0.85rem', fontWeight: 600, color: '#475569' };
    const inputStyle = {
        padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
        fontSize: '0.95rem', color: '#1e293b', outline: 'none', transition: 'all 0.2s',
        background: '#f8fafc'
    };

    const agentContacts = contacts.filter(c =>
        c.professionSubCategory === 'Real Estate Agent' ||
        (typeof c.professionSubCategory === 'object' && c.professionSubCategory?.lookup_value === 'Real Estate Agent')
    );

    const types = ['Sale', 'Rent', 'Lease'];

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <div><h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>New Booking</h2></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #dbeafe' }}>ID: {formData.applicationNo}</div>
                        <button onClick={onClose} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-times"></i></button>
                    </div>
                </div>

                <div style={{ flex: 1, padding: '32px 0' }}>
                    {/* Booking Type Toggle */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', position: 'relative', width: '320px', margin: '0 auto 24px', cursor: 'pointer' }}>
                        {types.map((t) => (
                            <div key={t} onClick={() => setFormData({ ...formData, type: t })} style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: formData.type === t ? '#6366f1' : '#64748b', zIndex: 2, transition: 'color 0.3s' }}>{t}</div>
                        ))}
                        <div style={{ position: 'absolute', top: '4px', left: `calc(4px + ${types.indexOf(formData.type) * 105.3}px)`, width: '102px', height: 'calc(100% - 8px)', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 1 }} />
                    </div>

                    {/* Unit Information */}
                    <div style={sectionStyle}>
                        <div style={sectionTitleStyle}>Unit Information</div>
                        <div style={{ ...gridStyle, gridTemplateColumns: '1fr 1fr' }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Project</label>
                                <select value={formData.project} onChange={handleProjectChange} style={inputStyle}>
                                    <option value="">Select Project</option>
                                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Property / Unit</label>
                                <select value={formData.property} onChange={handlePropertyChange} style={inputStyle} disabled={!units.length}>
                                    <option value="">{units.length === 0 ? 'Select Project' : 'Select Unit'}</option>
                                    {units.map(u => <option key={u._id} value={u._id}>{u.unitNo || u.unitNumber} {u.block ? `(${u.block})` : ''}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Unit Owner Information Strip */}
                        {formData.property && units.find(u => u._id === formData.property) && (
                            <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0ea5e9', padding: '16px 20px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '32px', animation: 'fadeIn 0.3s ease-in-out' }}>
                                {(() => {
                                    const unit = units.find(u => u._id === formData.property);
                                    const owner = unit.owners?.[0];
                                    if (!owner) return <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No owner information found for this unit.</div>;

                                    const name = owner.name || 'N/A';
                                    const fatherName = owner.fatherName || owner.guardian || 'N/A';
                                    const address = owner.personalAddress || owner.address?.locality || owner.address?.city || 'N/A';

                                    return (
                                        <>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '4px' }}>Unit Owner</span>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{name}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '4px' }}>Father's Name</span>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{fatherName}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: '4px' }}>Address</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{address}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        <div style={{ ...gridStyle, gridTemplateColumns: '2fr 1fr' }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Booked Lead / Buyer</label>
                                <select value={formData.lead} onChange={(e) => setFormData({ ...formData, lead: e.target.value })} style={inputStyle}>
                                    <option value="">Select Buyer</option>
                                    {contacts.map(c => <option key={c._id} value={c._id}>{c.name} {c.phones?.[0]?.number ? `(${c.phones[0].number})` : ''}</option>)}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Booking Date</label>
                                <input type="date" value={formData.bookingDate} onChange={(e) => setFormData({ ...formData, bookingDate: e.target.value })} style={inputStyle} />
                            </div>
                        </div>
                    </div>

                    {/* Financial Commitments */}
                    <div style={{ ...sectionStyle, background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={sectionTitleStyle}>Financial Commitments</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Total Deal Amount</label>
                                <input type="number" value={formData.totalDealAmount} onChange={(e) => setFormData({ ...formData, totalDealAmount: e.target.value })} style={{ ...inputStyle, fontWeight: 700, fontSize: '1.1rem', background: '#fff' }} />
                                {formData.totalDealAmount && <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600 }}>{numberToIndianWords(formData.totalDealAmount)}</span>}
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Token Amount</label>
                                <input type="number" value={formData.tokenAmount} onChange={(e) => setFormData({ ...formData, tokenAmount: e.target.value })} style={{ ...inputStyle, background: '#fff' }} placeholder="0" />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Agreement Amount</label>
                                <input type="number" value={formData.agreementAmount} onChange={(e) => setFormData({ ...formData, agreementAmount: e.target.value })} style={{ ...inputStyle, background: '#fff' }} />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Agreement Date</label>
                                <input type="date" value={formData.agreementDate} onChange={(e) => setFormData({ ...formData, agreementDate: e.target.value })} style={{ ...inputStyle, background: '#fff' }} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'flex-start' }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Part Payments</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '45px' }}>
                                    <div
                                        onClick={() => setFormData({ ...formData, isPartPaymentEnabled: !formData.isPartPaymentEnabled })}
                                        style={{
                                            width: '44px', height: '22px', borderRadius: '11px',
                                            background: formData.isPartPaymentEnabled ? '#6366f1' : '#cbd5e1',
                                            position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                            position: 'absolute', top: '2px',
                                            left: formData.isPartPaymentEnabled ? '24px' : '2px',
                                            transition: 'left 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{formData.isPartPaymentEnabled ? 'Enabled' : 'Disabled'}</span>
                                </div>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Rest Payment (Balance)</label>
                                <input readOnly value={balanceAmount} style={{ ...inputStyle, fontWeight: 800, color: balanceAmount < 0 ? '#ef4444' : '#10b981', background: '#fff' }} />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Full & Final Date</label>
                                <input type="date" value={formData.finalPaymentDate} onChange={(e) => setFormData({ ...formData, finalPaymentDate: e.target.value })} style={{ ...inputStyle, background: '#fff' }} />
                            </div>
                        </div>

                        {formData.isPartPaymentEnabled && (
                            <div style={{ marginTop: '24px', padding: '20px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', animation: 'fadeIn 0.3s ease-in-out' }}>
                                <div style={{ ...labelStyle, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Schedule Part Payments</span>
                                    <button onClick={addPartPayment} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}><i className="fas fa-plus"></i> Add Payment</button>
                                </div>
                                {formData.partPayments.map((p, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                        <input type="number" placeholder="Amount" value={p.amount} onChange={(e) => handlePartPaymentChange(i, 'amount', e.target.value)} style={{ ...inputStyle, border: '1px solid #f1f5f9' }} />
                                        <input type="date" value={p.date} onChange={(e) => handlePartPaymentChange(i, 'date', e.target.value)} style={{ ...inputStyle, border: '1px solid #f1f5f9' }} />
                                        <button onClick={() => removePartPayment(i)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Commissions Section (Now below Financials) */}
                    <div style={sectionStyle}>
                        <div style={sectionTitleStyle}>Brokerage & Commissions</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                            <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ ...fieldStyle, flex: 1 }}>
                                        <label style={labelStyle}>Seller %</label>
                                        <input type="number" value={formData.sellerBrokeragePercent} onChange={(e) => setFormData({ ...formData, sellerBrokeragePercent: e.target.value })} style={{ ...inputStyle, background: '#fff' }} placeholder="0" />
                                    </div>
                                    <div style={{ ...fieldStyle, flex: 2 }}>
                                        <label style={labelStyle}>Seller Amount</label>
                                        <input type="number" readOnly value={formData.sellerBrokerageAmount} style={{ ...inputStyle, fontWeight: 700 }} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ ...fieldStyle, flex: 1 }}>
                                        <label style={labelStyle}>Buyer %</label>
                                        <input type="number" value={formData.buyerBrokeragePercent} onChange={(e) => setFormData({ ...formData, buyerBrokeragePercent: e.target.value })} style={{ ...inputStyle, background: '#fff' }} placeholder="0" />
                                    </div>
                                    <div style={{ ...fieldStyle, flex: 2 }}>
                                        <label style={labelStyle}>Buyer Amount</label>
                                        <input type="number" readOnly value={formData.buyerBrokerageAmount} style={{ ...inputStyle, fontWeight: 700 }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Total Commission Display */}
                        <div style={{ padding: '16px 24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={fieldStyle}>
                                <label style={{ ...labelStyle, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>
                                    Total Commission {formData.isChannelPartnerEnabled ? `(Excluding ${formData.partnerSide})` : ''}
                                </label>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>₹ {totalCommissionAmount.toLocaleString('en-IN')}</div>
                            </div>
                            <div style={{ textAlign: 'right', flex: 1, paddingLeft: '40px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 600, fontStyle: 'italic' }}>
                                    {totalCommissionAmount > 0 ? `${numberToIndianWords(totalCommissionAmount)} Only` : 'Zero'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stakeholders (Now below Commissions) */}
                    <div style={{ ...sectionStyle, background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                        <div style={sectionTitleStyle}>Sales Agent & Incentives</div>
                        <div style={{ ...gridStyle, gridTemplateColumns: '2fr 1fr 1fr' }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Sales Agent</label>
                                <select value={formData.salesAgent} onChange={(e) => setFormData({ ...formData, salesAgent: e.target.value })} style={inputStyle}>
                                    <option value="">Select Agent</option>
                                    {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Incentive %</label>
                                <input type="number" value={formData.executiveIncentivePercent} onChange={(e) => setFormData({ ...formData, executiveIncentivePercent: e.target.value })} style={{ ...inputStyle, background: '#fff' }} placeholder="0" />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Incentive Amount</label>
                                <input type="number" readOnly value={formData.executiveIncentiveAmount} style={{ ...inputStyle, fontWeight: 700 }} />
                            </div>
                        </div>

                        {/* Channel Partner Toggle & Section */}
                        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px dashed #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div onClick={() => setFormData({ ...formData, isChannelPartnerEnabled: !formData.isChannelPartnerEnabled })} style={{ width: '44px', height: '22px', borderRadius: '11px', background: formData.isChannelPartnerEnabled ? '#6366f1' : '#cbd5e1', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}>
                                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: formData.isChannelPartnerEnabled ? '24px' : '2px', transition: 'left 0.3s' }} />
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>Channel Partner</span>
                                </div>
                            </div>

                            {formData.isChannelPartnerEnabled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', animation: 'fadeIn 0.3s ease-in-out' }}>
                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Select Partner (Real Estate Agent)</label>
                                        <select value={formData.channelPartner} onChange={(e) => setFormData({ ...formData, channelPartner: e.target.value })} style={inputStyle}>
                                            <option value="">Select Channel Partner</option>
                                            {agentContacts.map(c => <option key={c._id} value={c._id}>{c.name} {c.phones?.[0]?.number ? `(${c.phones[0].number})` : ''}</option>)}
                                        </select>
                                    </div>
                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Partner Side</label>
                                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                                            {['Buyer Side', 'Seller Side'].map(s => (
                                                <div key={s} onClick={() => setFormData({ ...formData, partnerSide: s })} style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, padding: '6px', cursor: 'pointer', borderRadius: '6px', background: formData.partnerSide === s ? '#fff' : 'transparent', color: formData.partnerSide === s ? '#6366f1' : '#64748b', boxShadow: formData.partnerSide === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{s}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Remarks */}
                    <div style={sectionStyle}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Remarks</label>
                            <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Add specific terms or notes..." />
                        </div>
                    </div>
                </div>

                <div style={{ padding: '24px 32px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fff' }}>
                    <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }} disabled={isSaving}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '12px 40px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)' }} disabled={isSaving}>{isSaving ? 'Saving...' : 'Confirm Booking'}</button>
                </div>
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    );
};

export default AddBookingModal;
