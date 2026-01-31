import React, { useState, useEffect, useRef } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { useTriggers } from '../context/TriggersContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { PROJECTS_LIST } from '../data/projectData';
import { inventoryData } from '../data/mockData';
import toast from 'react-hot-toast';

const AddDealModal = ({ isOpen, onClose, onSave, deal = null }) => {
    const { propertyConfig } = usePropertyConfig();
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const { evaluateAndEnroll } = useSequences();

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
        price: '',
        priceWord: '',
        status: 'Open', // Open, Quote, Negotiation, Booked, Won, Lost

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
            setFormData(prev => ({
                ...prev,
                unitNo,
                propertyType: unit.type || prev.propertyType,
                size: unit.size || prev.size,
                owner: {
                    name: unit.ownerName || '',
                    phone: unit.ownerPhone || '',
                    email: unit.ownerEmail || ''
                },
                associatedContact: {
                    name: unit.associatedContact || '',
                    phone: unit.associatedPhone || '',
                    email: unit.associatedEmail || ''
                }
            }));
            toast.success(`Inherited owner details for Unit ${unitNo}`);
        } else {
            handleInputChange('unitNo', unitNo);
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
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-handshake" style={{ color: '#2563eb' }}></i>
                            {deal ? 'Update Deal' : 'Add New Deal'}
                        </h2>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 32px' }}>
                            {currentTime.toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Property & Intent</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                                            i.location === formData.block
                                        )
                                        .map(i => <option key={i.id} value={i.unitNo}>{i.unitNo} ({i.type})</option>)
                                    }
                                </select>
                                {formData.unitNo && (
                                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#0284c7', background: '#f0f9ff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bae6fd', display: 'flex', gap: '15px' }}>
                                        <span><i className="fas fa-info-circle mr-1"></i> <b>Type:</b> {formData.propertyType}</span>
                                        <span><b>Size:</b> {formData.size}</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>Intent</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    {['Sell', 'Rent', 'Lease'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => handleInputChange('intent', type)}
                                            style={{
                                                flex: 1, padding: '8px', borderRadius: '6px', border: `1px solid ${formData.intent === type ? '#2563eb' : '#cbd5e1'}`,
                                                background: formData.intent === type ? '#eff6ff' : '#fff', color: formData.intent === type ? '#2563eb' : '#64748b',
                                                fontWeight: 600, cursor: 'pointer'
                                            }}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Pricing & Status</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Expected Price (₹)</label>
                                <input
                                    style={inputStyle}
                                    value={formData.price}
                                    onChange={e => handleInputChange('price', e.target.value)}
                                    placeholder="Enter amount"
                                />
                            </div>
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
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700 }}>Linked Contacts</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Property Owner (Inherited)</label>
                                <div style={{ ...inputStyle, background: '#f8fafc', minHeight: '42px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ fontWeight: 600 }}>{formData.owner.name || 'No Owner Assigned'}</div>
                                    {formData.owner.phone && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formData.owner.phone}</div>}
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Associate/Contact (Inherited)</label>
                                <div style={{ ...inputStyle, background: '#f8fafc', minHeight: '42px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ fontWeight: 600 }}>{formData.associatedContact.name || 'No Associate Assigned'}</div>
                                    {formData.associatedContact.phone && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formData.associatedContact.phone}</div>}
                                </div>
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
                        {isSaving ? 'Saving...' : 'Save Deal'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddDealModal;
