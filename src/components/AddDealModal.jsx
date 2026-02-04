import { useState, useEffect } from 'react';
import { useFieldRules } from '../context/FieldRulesContext';
import { useTriggers } from '../context/TriggersContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { PROJECTS_LIST } from '../data/projectData';
import { inventoryData } from '../data/mockData';
import { numberToIndianWords } from '../utils/numberToWords';
import toast from 'react-hot-toast';

const AddDealModal = ({ isOpen, onClose, onSave, deal = null }) => {
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const evaluateAndEnroll = useSequences()?.evaluateAndEnroll || (() => { });


    const [isSaving, setIsSaving] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [formData, setFormData] = useState({
        projectName: '',
        block: '',
        unitNo: '',
        unitType: 'Ordinary',
        propertyType: 'Plot(Residential)',
        size: '',
        location: '',
        intent: 'Sell', // Sell, Rent, Lease

        // Pricing
        price: '',
        quotePrice: '',
        pricingMode: 'Total', // Total, Rate
        ratePrice: '', // Per Sq. Yard/Meter/Feet
        quoteRatePrice: '', // New: For bidirectional quote calc
        priceInWords: '',
        quotePriceInWords: '', // New: Words for quote
        pricingNature: {
            negotiable: false,
            fixed: false
        },

        status: 'Open', // Open, Quote, Negotiation, Booked, Won, Lost

        // New Fields
        dealType: 'Warm', // Hot, Warm, Cold
        transactionType: 'Full White', // Full White, Collector Rate, Flexible
        flexiblePercentage: 50, // Default 50% if Flexible
        source: 'Walk-in', // New paper, 99 acrer, social media, walkin, Cold calling, own website

        // Contact Selection
        isOwnerSelected: false,
        isAssociateSelected: false,

        // Publish On Toggles
        publishOn: {
            website: false,
            facebook: false,
            instagram: false,
            whatsapp: false,
            linkedin: false,
            x: false
        },

        // Send Matched Deal
        sendMatchedDeal: {
            sms: false,
            whatsapp: false,
            email: false,
            rcs: false
        },

        // Contacts
        owner: { name: '', phone: '', email: '' },
        associatedContact: { name: '', phone: '', email: '' },

        // Assignment
        team: '',
        assignedTo: '',
        visibleTo: 'Public',

        remarks: '',
        date: new Date().toISOString().split('T')[0]
    });

    const getUnitLabel = (size) => {
        if (!size) return "Sq Yard";
        const lowerSize = size.toLowerCase();
        if (lowerSize.includes('sq yard')) return 'Sq Yard';
        if (lowerSize.includes('sq meter') || lowerSize.includes('sq mtr')) return 'Sq Meter';
        if (lowerSize.includes('sq feet') || lowerSize.includes('sq ft')) return 'Sq Feet';
        if (lowerSize.includes('marla')) return 'Marla';
        if (lowerSize.includes('kanal')) return 'Kanal';
        return "Sq Yard"; // Default fallback
    };

    const unitLabel = getUnitLabel(formData.size);

    useEffect(() => {
        if (deal) {
            setFormData({ ...deal });
        }
    }, [deal, isOpen]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNestedInputChange = (parent, field, value) => {
        setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    };

    const handleProjectChange = (projectName) => {
        const project = PROJECTS_LIST.find(p => p.name === projectName);
        const availableBlocks = project ? project.blocks || [] : [];
        const defaultBlock = availableBlocks.length === 1 ? availableBlocks[0] : '';

        let assignedTo = formData.assignedTo;
        let team = formData.team;

        const result = executeDistribution('deals', { ...formData, projectName, block: defaultBlock });
        if (result && result.success) {
            assignedTo = result.assignedTo;
            team = result.team || team;
            toast.success(`Deal automatically assigned to ${result.assignedTo}`);
        }

        setFormData(prev => ({
            ...prev,
            projectName,
            block: defaultBlock,
            unitNo: '', // Reset unit when project changes
            assignedTo,
            team
        }));
    };

    const handleUnitChange = (unitNo) => {
        const unit = inventoryData.find(i =>
            i.unitNo === unitNo &&
            (i.area === formData.projectName || i.area?.includes(formData.projectName)) &&
            i.location === formData.block
        );

        if (unit) {
            setFormData(prev => {
                const newSize = unit.size || prev.size;

                // Recalculate prices if size changes and we have rates/totals
                let updates = {
                    unitNo,
                    propertyType: unit.type || prev.propertyType,
                    size: newSize,
                    owner: {
                        name: unit.ownerName || '',
                        phone: unit.ownerPhone || '',
                        email: unit.ownerEmail || ''
                    },
                    associatedContact: {
                        name: unit.associatedContact || '',
                        phone: unit.associatedPhone || '',
                        email: unit.associatedEmail || ''
                    },
                    isOwnerSelected: false,
                    isAssociateSelected: false
                };

                // Trigger Recalculation logic if size changed
                if (newSize && newSize !== prev.size) {
                    const sizeVal = parseFloat(newSize.toString().replace(/[^0-9.]/g, '') || '0');
                    if (sizeVal > 0) {
                        // Recalculate based on current Pricing Mode
                        if (prev.pricingMode === 'Rate') {
                            if (prev.ratePrice) {
                                const total = Math.round(sizeVal * parseFloat(prev.ratePrice || 0));
                                updates.price = total.toString();
                                updates.priceInWords = numberToIndianWords(total);
                            }
                            if (prev.quoteRatePrice) {
                                const totalQuote = Math.round(sizeVal * parseFloat(prev.quoteRatePrice || 0));
                                updates.quotePrice = totalQuote.toString();
                                updates.quotePriceInWords = numberToIndianWords(totalQuote);
                            }
                        } else {
                            // If Mode is Total, Update Rates based on new Size?
                            // Usually if Size changes but Total Price is fixed, Rate changes.
                            if (prev.price) {
                                const rate = Math.round(parseFloat(prev.price) / sizeVal);
                                updates.ratePrice = rate.toString();
                            }
                            if (prev.quotePrice) {
                                const rateQuote = Math.round(parseFloat(prev.quotePrice) / sizeVal);
                                updates.quoteRatePrice = rateQuote.toString();
                            }
                        }
                    }
                }

                return { ...prev, ...updates };
            });
            toast.success(`Inherited details for Unit ${unitNo}`);
        } else {
            handleInputChange('unitNo', unitNo);
        }
    };

    // Pricing Logic Handlers
    const calculatePriceValues = (type, value, currentSize, mode) => {
        const sizeVal = parseFloat(currentSize ? currentSize.toString().replace(/[^0-9.]/g, '') : '0');
        const numValue = parseFloat(value || '0');

        let updates = {};

        if (mode === 'Rate') {
            // User entered RATE
            updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = value;

            if (!isNaN(sizeVal) && sizeVal > 0 && !isNaN(numValue)) {
                const total = Math.round(sizeVal * numValue);
                updates[type === 'expected' ? 'price' : 'quotePrice'] = total.toString();
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(total);
            } else {
                updates[type === 'expected' ? 'price' : 'quotePrice'] = '';
                updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = '';
            }
        } else {
            // User entered TOTAL
            updates[type === 'expected' ? 'price' : 'quotePrice'] = value;
            updates[type === 'expected' ? 'priceInWords' : 'quotePriceInWords'] = numberToIndianWords(value);

            if (!isNaN(sizeVal) && sizeVal > 0 && !isNaN(numValue)) {
                const rate = Math.round(numValue / sizeVal);
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = rate.toString();
            } else {
                updates[type === 'expected' ? 'ratePrice' : 'quoteRatePrice'] = '';
            }
        }
        return updates;
    };

    const handlePriceChange = (field, value) => {
        setFormData(prev => {
            try {
                // Determine context
                const isQuote = field === 'quotePrice' || field === 'quoteRatePrice';
                const type = isQuote ? 'quote' : 'expected';

                // Calculate new values
                const updates = calculatePriceValues(
                    type,
                    value,
                    prev.size,
                    prev.pricingMode
                );

                return { ...prev, ...updates };
            } catch (error) {
                console.error("Error in handlePriceChange:", error);
                return prev;
            }
        });
    };

    const handlePricingNatureChange = (type) => {
        setFormData(prev => ({
            ...prev,
            pricingNature: {
                negotiable: type === 'negotiable' ? !prev.pricingNature.negotiable : false,
                fixed: type === 'fixed' ? !prev.pricingNature.fixed : false
            }
        }));
        // Exclusive Checkbox Logic
        if (type === 'negotiable') {
            setFormData(prev => ({ ...prev, pricingNature: { negotiable: !prev.pricingNature.negotiable, fixed: false } }));
        } else {
            setFormData(prev => ({ ...prev, pricingNature: { fixed: !prev.pricingNature.fixed, negotiable: false } }));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const toastId = toast.loading('Saving deal...');

        try {
            if (validateAsync) {
                const validationResult = await validateAsync('deals', formData);
                if (!validationResult.isValid) {
                    toast.error(`Validation Failed: ${Object.values(validationResult.errors).join(', ')}`, { id: toastId });
                    setIsSaving(false);
                    return;
                }
            }

            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 800));

            // Calculate Score Class based on some logic if not set manually (Mock logic)
            // User mentioned Deal Type is decided by score. For now we save what is selected or default.

            toast.success('Deal Saved!', { id: toastId });

            if (deal) {
                fireEvent('deal_updated', formData, { entityType: 'deals', previousEntity: deal });
            } else {
                fireEvent('deal_created', formData, { entityType: 'deals' });

                // Enroll linked contacts into sequences
                if (formData.owner.phone) {
                    evaluateAndEnroll({ ...formData.owner, mobile: formData.owner.phone }, 'contacts');
                }
                if (formData.associatedContact.phone) {
                    evaluateAndEnroll({ ...formData.associatedContact, mobile: formData.associatedContact.phone }, 'contacts');
                }
            }

            onSave && onSave(formData);
            onClose();
        } catch (error) {
            console.error("Save Error:", error);
            toast.error("Failed to save deal", { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const sectionStyle = {
        background: '#fff',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '24px'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#64748b',
        marginBottom: '8px'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'border-color 0.2s'
    };

    const selectStyle = {
        ...inputStyle,
        appearance: 'none',
        cursor: 'pointer'
    };

    const customSelectStyleDisabled = { ...selectStyle, background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '90%', maxWidth: '900px', height: '85vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '42px', height: '42px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-handshake" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                {deal ? 'Update Lead' : 'Add New Deal'}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    {currentTime.toLocaleString()}
                                </span>
                                {deal && (
                                    <>
                                        <span style={{ color: '#e2e8f0' }}>|</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                                            {String(formData.projectName)} - {String(formData.unitNo)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Property & Intent</h4>
                        {/* Intent Group (Full Width) - Moved to Top */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>I want to</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {[
                                    { label: 'Sell', icon: 'fas fa-tag' },
                                    { label: 'Rent', icon: 'fas fa-key' },
                                    { label: 'Lease', icon: 'fas fa-file-signature' }
                                ].map(option => (
                                    <button
                                        key={option.label}
                                        onClick={() => handleInputChange('intent', option.label)}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: `2px solid ${formData.intent === option.label ? '#2563eb' : '#e2e8f0'}`,
                                            background: formData.intent === option.label ? '#eff6ff' : '#fff',
                                            color: formData.intent === option.label ? '#2563eb' : '#64748b',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <i className={option.icon}></i>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Project Details Group (Inline - 3 Columns) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={labelStyle}>Project Name</label>
                                <select
                                    style={selectStyle}
                                    value={formData.projectName}
                                    onChange={e => handleProjectChange(e.target.value)}
                                >
                                    <option value="">Select Project</option>
                                    {PROJECTS_LIST.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Block</label>
                                <select
                                    style={selectStyle}
                                    value={formData.block}
                                    onChange={e => handleInputChange('block', e.target.value)}
                                    disabled={!formData.projectName}
                                >
                                    <option value="">Select Block</option>
                                    {PROJECTS_LIST.find(p => p.name === formData.projectName)?.blocks?.map(block => (
                                        <option key={block} value={block}>{block}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Unit Number</label>
                                <select
                                    style={!formData.block ? customSelectStyleDisabled : selectStyle}
                                    value={formData.unitNo}
                                    disabled={!formData.block}
                                    onChange={e => handleUnitChange(e.target.value)}
                                >
                                    <option value="">Select Unit</option>
                                    {inventoryData
                                        .filter(i =>
                                            i.status === 'Active' &&
                                            (i.area === formData.projectName || i.area?.includes(formData.projectName)) &&
                                            (!formData.block || i.location === formData.block)
                                        )
                                        .map(unit => (
                                            <option key={unit.unitNo} value={unit.unitNo}>{unit.unitNo}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>

                        {/* Owner & Associate Details (Read-only with Selection) */}
                        {formData.unitNo && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                                {/* Owner Selection Card */}
                                <div
                                    onClick={() => handleInputChange('isOwnerSelected', !formData.isOwnerSelected)}
                                    style={{
                                        padding: '12px 16px', borderRadius: '12px', border: `2px solid ${formData.isOwnerSelected ? '#2563eb' : '#e2e8f0'}`,
                                        background: formData.isOwnerSelected ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                        <input type="checkbox" checked={formData.isOwnerSelected} readOnly style={{ width: '18px', height: '18px', accentColor: '#2563eb' }} />
                                    </div>
                                    <label style={{ ...labelStyle, marginBottom: '12px', color: formData.isOwnerSelected ? '#2563eb' : '#64748b' }}>
                                        <i className="fas fa-user-tie mr-2"></i> Property Owner
                                    </label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{formData.owner.name || 'N/A'}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>{formData.owner.phone || 'N/A'}</div>
                                </div>

                                {/* Associate Selection Card */}
                                <div
                                    onClick={() => handleInputChange('isAssociateSelected', !formData.isAssociateSelected)}
                                    style={{
                                        padding: '12px 16px', borderRadius: '12px', border: `2px solid ${formData.isAssociateSelected ? '#2563eb' : '#e2e8f0'}`,
                                        background: formData.isAssociateSelected ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                        <input type="checkbox" checked={formData.isAssociateSelected} readOnly style={{ width: '18px', height: '18px', accentColor: '#2563eb' }} />
                                    </div>
                                    <label style={{ ...labelStyle, marginBottom: '12px', color: formData.isAssociateSelected ? '#2563eb' : '#64748b' }}>
                                        <i className="fas fa-user-friends mr-2"></i> Associated Contact (Dealer)
                                    </label>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{formData.associatedContact.name || 'N/A'}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>{formData.associatedContact.phone || 'N/A'}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Pricing</h4>
                                {formData.size && (
                                    <span style={{ fontSize: '0.8rem', color: '#6366f1', background: '#eef2ff', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, border: '1px solid #c7d2fe' }}>
                                        <i className="fas fa-expand-arrows-alt mr-1"></i> Size: {formData.size}
                                    </span>
                                )}
                                {formData.propertyType && (
                                    <span style={{ fontSize: '0.8rem', color: '#0284c7', background: '#f0f9ff', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, border: '1px solid #bae6fd' }}>
                                        <i className="fas fa-tag mr-1"></i> Type: {formData.propertyType}
                                    </span>
                                )}
                            </div>
                            {/* Pricing Mode Toggle */}
                            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'Total' }))}
                                    style={{
                                        padding: '6px 16px', borderRadius: '6px', border: 'none', fontSize: '0.85rem', fontWeight: 600,
                                        cursor: 'pointer', backgroundColor: formData.pricingMode === 'Total' ? '#fff' : 'transparent',
                                        color: formData.pricingMode === 'Total' ? '#0f172a' : '#64748b',
                                        boxShadow: formData.pricingMode === 'Total' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    Total Amount
                                </button>
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, pricingMode: 'Rate' }))}
                                    style={{
                                        padding: '6px 16px', borderRadius: '6px', border: 'none', fontSize: '0.85rem', fontWeight: 600,
                                        cursor: 'pointer', backgroundColor: formData.pricingMode === 'Rate' ? '#fff' : 'transparent',
                                        color: formData.pricingMode === 'Rate' ? '#0f172a' : '#64748b',
                                        boxShadow: formData.pricingMode === 'Rate' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    Per Unit Rate
                                </button>
                            </div>
                        </div>

                        {/* Expected Price Row */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '8px' }}>
                                <label style={{ ...labelStyle, marginBottom: 0 }}>Expected Price {formData.pricingMode === 'Rate' ? `(Per ${unitLabel})` : '(Total)'}</label>
                                {formData.priceInWords && (
                                    <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 500, fontStyle: 'italic' }}>
                                        ({formData.priceInWords} Rupees Only)
                                    </span>
                                )}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    style={{ ...inputStyle, paddingRight: (formData.pricingMode === 'Total' && formData.ratePrice) ? '130px' : (formData.pricingMode === 'Rate' && formData.price) ? '160px' : '12px' }}
                                    value={formData.pricingMode === 'Total' ? formData.price : formData.ratePrice}
                                    onChange={e => handlePriceChange(formData.pricingMode === 'Total' ? 'price' : 'ratePrice', e.target.value)}
                                    placeholder={formData.pricingMode === 'Total' ? "Enter total expected amount" : `Enter rate per ${unitLabel}`}
                                />
                                {formData.pricingMode === 'Total' && formData.ratePrice && (
                                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                        ₹{formData.ratePrice}/{unitLabel}
                                    </div>
                                )}
                                {formData.pricingMode === 'Rate' && formData.price && (
                                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#16a34a', fontWeight: 700, background: '#f0fdf4', padding: '4px 10px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                        TOTAL: ₹{new Intl.NumberFormat('en-IN').format(formData.price)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quote Price Row */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '8px' }}>
                                <label style={{ ...labelStyle, marginBottom: 0 }}>Quote Price {formData.pricingMode === 'Rate' ? `(Per ${unitLabel})` : '(Total)'}</label>
                                {formData.quotePriceInWords && (
                                    <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 500, fontStyle: 'italic' }}>
                                        ({formData.quotePriceInWords} Rupees Only)
                                    </span>
                                )}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    style={{ ...inputStyle, paddingRight: (formData.pricingMode === 'Total' && formData.quoteRatePrice) ? '130px' : (formData.pricingMode === 'Rate' && formData.quotePrice) ? '160px' : '12px' }}
                                    value={formData.pricingMode === 'Total' ? formData.quotePrice : formData.quoteRatePrice}
                                    onChange={e => handlePriceChange(formData.pricingMode === 'Total' ? 'quotePrice' : 'quoteRatePrice', e.target.value)}
                                    placeholder={formData.pricingMode === 'Total' ? "Enter total quote amount" : `Enter quote rate per ${unitLabel}`}
                                />
                                {formData.pricingMode === 'Total' && formData.quoteRatePrice && (
                                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                        ₹{formData.quoteRatePrice}/{unitLabel}
                                    </div>
                                )}
                                {formData.pricingMode === 'Rate' && formData.quotePrice && (
                                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '4px 10px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                        TOTAL: ₹{new Intl.NumberFormat('en-IN').format(formData.quotePrice)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Negotiable Checkboxes */}
                        <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.pricingNature.negotiable}
                                    onChange={() => handlePricingNatureChange('negotiable')}
                                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                />
                                Negotiable
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.pricingNature.fixed}
                                    onChange={() => handlePricingNatureChange('fixed')}
                                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                />
                                Fixed Price
                            </label>
                        </div>
                    </div>

                    {/* New Fields Section: Deal Type, Transaction Type, Source */}
                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Deal Details</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Deal Status</label>
                                <select
                                    style={selectStyle}
                                    value={formData.status}
                                    onChange={e => handleInputChange('status', e.target.value)}
                                >
                                    <option value="Open">Open</option>
                                    <option value="Quote">Quote</option>
                                    <option value="Negotiation">Negotiation</option>
                                    <option value="Booked">Booked</option>
                                    <option value="Won">Won</option>
                                    <option value="Lost">Lost</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Deal Type</label>
                                <select
                                    style={selectStyle}
                                    value={formData.dealType}
                                    onChange={e => handleInputChange('dealType', e.target.value)}
                                >
                                    <option value="Hot">Hot</option>
                                    <option value="Warm">Warm</option>
                                    <option value="Cold">Cold</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Source</label>
                                <select
                                    style={selectStyle}
                                    value={formData.source}
                                    onChange={e => handleInputChange('source', e.target.value)}
                                >
                                    <option value="Walk-in">Walk-in</option>
                                    <option value="Newspaper">Newspaper</option>
                                    <option value="99acres">99acres</option>
                                    <option value="Social Media">Social Media</option>
                                    <option value="Cold Calling">Cold Calling</option>
                                    <option value="Own Website">Own Website</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Transaction Type</label>
                                <select
                                    style={selectStyle}
                                    value={formData.transactionType}
                                    onChange={e => handleInputChange('transactionType', e.target.value)}
                                >
                                    <option value="Full White">Full White</option>
                                    <option value="Collector Rate">Collector Rate</option>
                                    <option value="Flexible">Flexible</option>
                                </select>
                            </div>
                        </div>

                        {/* Flexible Percentage Bar */}
                        {formData.transactionType === 'Flexible' && (
                            <div style={{ marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>White Component</label>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb' }}>{formData.flexiblePercentage}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={formData.flexiblePercentage}
                                    onChange={e => handleInputChange('flexiblePercentage', e.target.value)}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.75rem', color: '#64748b' }}>
                                    <span>0% (Full Cash)</span>
                                    <span>100% (Full White)</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Publish On Section */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Publish On</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                                {[
                                    { id: 'website', icon: 'fas fa-globe', label: 'Website', color: '#2563eb' },
                                    { id: 'facebook', icon: 'fab fa-facebook', label: 'Facebook', color: '#1877f2' },
                                    { id: 'instagram', icon: 'fab fa-instagram', label: 'Instagram', color: '#e4405f' },
                                    { id: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp', color: '#25d366' },
                                    { id: 'linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn', color: '#0077b5' },
                                    { id: 'x', icon: 'fab fa-twitter', label: 'X', color: '#000000' }
                                ].map(platform => (
                                    <button
                                        key={platform.id}
                                        onClick={() => handleNestedInputChange('publishOn', platform.id, !formData.publishOn[platform.id])}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px',
                                            borderRadius: '8px', border: `1px solid ${formData.publishOn[platform.id] ? platform.color : '#e2e8f0'}`,
                                            background: formData.publishOn[platform.id] ? `${platform.color}15` : '#fff',
                                            cursor: 'pointer', transition: 'all 0.2s',
                                            color: formData.publishOn[platform.id] ? platform.color : '#64748b',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <i className={platform.icon}></i>
                                        <span style={{ fontWeight: 600 }}>{platform.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Send Matched Deal</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {[
                                    { id: 'sms', icon: 'fas fa-comment-dots', label: 'SMS', color: '#6366f1' },
                                    { id: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp', color: '#25d366' },
                                    { id: 'email', icon: 'fas fa-envelope', label: 'Email', color: '#ef4444' },
                                    { id: 'rcs', icon: 'fas fa-comment-alt', label: 'RCS', color: '#3b82f6' }
                                ].map(option => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleNestedInputChange('sendMatchedDeal', option.id, !formData.sendMatchedDeal[option.id])}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                            borderRadius: '10px', border: `2px solid ${formData.sendMatchedDeal[option.id] ? option.color : '#e2e8f0'}`,
                                            background: formData.sendMatchedDeal[option.id] ? `${option.color}10` : '#fff',
                                            cursor: 'pointer', transition: 'all 0.2s',
                                            color: formData.sendMatchedDeal[option.id] ? option.color : '#64748b'
                                        }}
                                    >
                                        <i className={option.icon}></i>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{option.label}</span>
                                        {formData.sendMatchedDeal[option.id] && <i className="fas fa-check-circle" style={{ marginLeft: 'auto' }}></i>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>System Assignment & Visibility</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Assigned Agent (Auto)</label>
                                <div style={{ ...inputStyle, background: '#f8fafc', fontWeight: 600, color: formData.assignedTo ? '#0f172a' : '#94a3b8' }}>
                                    {formData.assignedTo || 'Select Project to Assign'}
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Team (Auto)</label>
                                <div style={{ ...inputStyle, background: '#f8fafc', fontWeight: 600, color: formData.team ? '#0f172a' : '#94a3b8' }}>
                                    {formData.team || 'Select Project to Assign'}
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Visibility</label>
                                <select style={selectStyle} value={formData.visibleTo} onChange={e => handleInputChange('visibleTo', e.target.value)}>
                                    <option value="Public">Public</option>
                                    <option value="Team">Team</option>
                                    <option value="Private">Private</option>
                                </select>
                            </div>
                        </div>
                    </div>



                    <div style={sectionStyle}>
                        <label style={labelStyle}>Notes / Remarks</label>
                        <textarea
                            style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                            value={formData.remarks}
                            onChange={e => handleInputChange('remarks', e.target.value)}
                            placeholder="Any additional information..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{
                            padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer',
                            opacity: isSaving ? 0.7 : 1
                        }}
                    >
                        {isSaving ? 'Saving...' : (deal ? 'Update Deal' : 'Save Deal')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddDealModal;
