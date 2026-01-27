import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';

// --- Helper: Reusable MultiSelect Dropdown (Extracted for potential reuse/consistency) ---
// Note: While not used directly in this simplified Price Modal if not needed, 
// keeping consistent styling variables is key.

export default function AddProjectPriceModal({ isOpen, onClose, onSave, project }) {
    const { sizes } = usePropertyConfig();
    const [formData, setFormData] = useState({});

    // Initialize form data when project changes or modal opens
    useEffect(() => {
        if (project) {
            // Normalize Blocks: Ensure they are objects { name: '...' }
            let normalizedBlocks = project.blocks || [];
            if (normalizedBlocks.length > 0 && typeof normalizedBlocks[0] === 'string') {
                normalizedBlocks = normalizedBlocks.map(b => ({ name: b }));
            }

            // Normalize SubCategory: Fallback to 'category' if 'subCategory' is missing
            let normalizedSubCategory = project.subCategory || [];
            if ((!normalizedSubCategory || normalizedSubCategory.length === 0) && project.category) {
                // Filter out main categories to get potential subcategories
                const mainCategories = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Institutional'];
                normalizedSubCategory = project.category.filter(c => !mainCategories.includes(c));
            }

            // Ensure deep copy of pricing to avoid direct mutation of props
            setFormData({
                ...project,
                blocks: normalizedBlocks,
                subCategory: normalizedSubCategory,
                pricing: project.pricing ? JSON.parse(JSON.stringify(project.pricing)) : {
                    pricingType: 'Standard',
                    unitPrices: [],
                    basePrice: { amount: '', unit: 'sqft' },
                    masterCharges: [],
                    paymentPlans: []
                }
            });
        }
    }, [project, isOpen]);

    const [newPriceRow, setNewPriceRow] = useState({
        block: '',
        subCategory: '',
        areaType: '',
        size: '',
        price: ''
    });

    // Helper to get Area Types (Copied from AddProjectModal)
    const getAreaTypes = (subCat) => {
        if (!subCat) return [];
        const lower = subCat.toLowerCase();
        if (lower.includes('plot') || lower.includes('land') || lower.includes('sco') || lower.includes('agricultural')) {
            return ['Total Area', 'Plot Area', 'Gaj'];
        }
        if (lower.includes('flat') || lower.includes('apartment') || lower.includes('floor') || lower.includes('penthouse')) {
            return ['Super Area', 'Carpet Area', 'Built-up Area'];
        }
        if (lower.includes('villa') || lower.includes('house')) {
            return ['Plot Area', 'Built-up Area', 'Carpet Area'];
        }
        if (lower.includes('shop') || lower.includes('office')) {
            return ['Super Area', 'Carpet Area'];
        }
        return ['Area', 'Super Area', 'Carpet Area'];
    };

    const handleAddPriceRow = () => {
        if (newPriceRow.subCategory && newPriceRow.size && newPriceRow.price) {
            const newRow = { ...newPriceRow, id: Date.now() };
            const currentUnitPrices = formData.pricing?.unitPrices || [];

            setFormData(prev => ({
                ...prev,
                pricing: { ...prev.pricing, unitPrices: [...currentUnitPrices, newRow] }
            }));

            setNewPriceRow({ block: '', subCategory: '', areaType: '', size: '', price: '' });
        }
    };

    const removePriceRow = (id) => {
        const currentUnitPrices = formData.pricing?.unitPrices || [];
        const newRows = currentUnitPrices.filter(r => r.id !== id);
        setFormData(prev => ({
            ...prev,
            pricing: { ...prev.pricing, unitPrices: newRows }
        }));
    };

    // --- Pricing Logic Helpers ---
    const updatePricing = (key, value) => {
        setFormData(prev => ({
            ...prev,
            pricing: { ...prev.pricing, [key]: value }
        }));
    };

    const addMasterCharge = (preset = null) => {
        const defaults = {
            'EDC': { name: 'EDC (External Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
            'IDC': { name: 'IDC (Infrastructure Development Charges)', category: 'Development', basis: 'Per SqFt', amount: '', gstEnabled: true },
            'PLC': { name: 'Corner/Park Facing PLC', category: 'PLC', basis: 'Per SqFt', amount: '', gstEnabled: true },
            'STAMP': { name: 'Stamp Duty', category: 'Statutory', basis: '% of Total', amount: '5', gstEnabled: false },
            'REG': { name: 'Registration Charges', category: 'Statutory', basis: '% of Total', amount: '1', gstEnabled: false },
            'IFMS': { name: 'IFMS (Maintenance Security)', category: 'Per SqFt', amount: '', gstEnabled: false }
        };

        const currentCharges = formData.pricing?.masterCharges || [];
        const newCharge = preset ? { ...defaults[preset], id: Date.now() } : { id: Date.now(), name: '', category: 'Other', basis: 'Fixed', amount: '', gstEnabled: true };
        updatePricing('masterCharges', [...currentCharges, newCharge]);
    };

    const removeMasterCharge = (id) => {
        const currentCharges = formData.pricing?.masterCharges || [];
        const newCharges = currentCharges.filter(c => c.id !== id);
        updatePricing('masterCharges', newCharges);
    };

    const updateMasterCharge = (id, field, value) => {
        const currentCharges = formData.pricing?.masterCharges || [];
        const newCharges = currentCharges.map(c => c.id === id ? { ...c, [field]: value } : c);
        updatePricing('masterCharges', newCharges);
    };

    const applyPlanPreset = (type) => {
        let milestones = [];
        if (type === 'CLP') {
            milestones = [
                { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                { name: 'Within 30 days of Booking', percentage: '10', stage: 'Allotment' },
                { name: 'On start of Foundation', percentage: '10', stage: 'Excavation' },
                { name: 'On casting of Ground Floor Slab', percentage: '10', stage: 'Slab' },
                { name: 'On casting of 2nd Floor Slab', percentage: '10', stage: 'Slab' },
                { name: 'On casting of Top Floor Slab', percentage: '10', stage: 'Slab' },
                { name: 'On completion of Internal Plaster', percentage: '10', stage: 'Finishing' },
                { name: 'On completion of External Plaster', percentage: '10', stage: 'Finishing' },
                { name: 'On offer of Possession', percentage: '20', stage: 'Possession' }
            ];
        } else if (type === 'DPP') {
            milestones = [
                { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                { name: 'Within 45 days of Booking', percentage: '85', stage: 'Allotment' },
                { name: 'On offer of Possession', percentage: '5', stage: 'Possession' }
            ];
        } else if (type === 'PLP') {
            milestones = [
                { name: 'At the time of Booking', percentage: '10', stage: 'Booking' },
                { name: 'Within 60 days of Booking', percentage: '20', stage: 'Allotment' },
                { name: 'On completion of Super Structure', percentage: '30', stage: 'Slab' },
                { name: 'On offer of Possession', percentage: '40', stage: 'Possession' }
            ];
        }

        const currentPlans = formData.pricing?.paymentPlans || [];
        const newPlans = [...currentPlans];

        const newPlan = {
            type,
            milestones,
            name: type === 'CLP' ? 'Construction Linked Plan' : type === 'DPP' ? 'Down Payment Plan' : 'Possession Linked Plan'
        };

        if (newPlans.length > 0) {
            newPlans[0] = { ...newPlans[0], ...newPlan };
        } else {
            newPlans.push(newPlan);
        }

        updatePricing('paymentPlans', newPlans);
    };


    const handleSave = () => {
        onSave(formData);
    };

    if (!isOpen) return null;

    // --- Styles (Copied for consistency) ---
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block'
    };
    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s',
        backgroundColor: '#fff', height: '42px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px'
    };
    const customSelectStyleDisabled = { ...customSelectStyle, background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' };
    const sectionStyle = {
        background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px'
    };


    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
        }}>
            <div className="modal-content fade-in" style={{
                background: '#fff', width: '95%', maxWidth: '1200px',
                height: '90vh', borderRadius: '16px', position: 'relative', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255,255,255,0.1)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fff', borderRadius: '20px 20px 0 0'
                }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                            Manage Pricing
                        </h2>
                        <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fas fa-building" style={{ fontSize: '0.8rem' }}></i>
                            {project?.name || 'New Project'}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '12px',
                        color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s'
                    }} onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}>
                        <i className="fas fa-times" style={{ fontSize: '1.1rem' }}></i>
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#f8fafc' }}>

                    {/* Section 1: Unit Base Price Configuration */}
                    <div style={sectionStyle}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: '#eff6ff', borderRadius: '8px' }}>
                                <i className="fas fa-tags" style={{ color: '#2563eb', fontSize: '0.8rem' }}></i>
                            </span>
                            1. Unit Base Price Configuration
                        </h4>
                        <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                            <div className="grid-5-col mb-24" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '16px', alignItems: 'end' }}>
                                <div>
                                    <label style={labelStyle}>Block</label>
                                    <select
                                        style={customSelectStyle}
                                        value={newPriceRow.block}
                                        onChange={e => setNewPriceRow({ ...newPriceRow, block: e.target.value })}
                                    >
                                        <option value="">All Blocks</option>
                                        {(formData.blocks || []).map((b, i) => <option key={i} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Sub Category</label>
                                    <select
                                        style={customSelectStyle}
                                        value={newPriceRow.subCategory}
                                        onChange={e => setNewPriceRow({ ...newPriceRow, subCategory: e.target.value, areaType: '' })}
                                    >
                                        <option value="">Select</option>
                                        {(formData.subCategory || []).map(sc => <option key={sc} value={sc}>{sc}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Area Type</label>
                                    <select
                                        style={!newPriceRow.subCategory ? customSelectStyleDisabled : customSelectStyle}
                                        value={newPriceRow.areaType}
                                        disabled={!newPriceRow.subCategory}
                                        onChange={e => setNewPriceRow({ ...newPriceRow, areaType: e.target.value })}
                                    >
                                        <option value="">Select Type</option>
                                        {getAreaTypes(newPriceRow.subCategory).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Size</label>
                                    <select
                                        style={!newPriceRow.subCategory ? customSelectStyleDisabled : customSelectStyle}
                                        value={newPriceRow.size}
                                        disabled={!newPriceRow.subCategory}
                                        onChange={e => setNewPriceRow({ ...newPriceRow, size: e.target.value })}
                                    >
                                        <option value="">Select Size</option>
                                        {sizes.filter(s =>
                                            (!s.project || s.project === formData.name) &&
                                            (!newPriceRow.block || s.block === newPriceRow.block) &&
                                            (!newPriceRow.subCategory || s.subCategory === newPriceRow.subCategory)
                                        ).map(s => (
                                            <option key={s.id} value={s.saleableArea || s.totalArea}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Base Price</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>₹</span>
                                        <input
                                            type="number"
                                            style={{ ...inputStyle, paddingLeft: '28px' }}
                                            placeholder="0"
                                            value={newPriceRow.price}
                                            onChange={e => setNewPriceRow({ ...newPriceRow, price: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddPriceRow}
                                    disabled={!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price}
                                    style={{
                                        height: '42px', padding: '0 24px',
                                        background: (!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price) ? '#e2e8f0' : '#3b82f6',
                                        color: (!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price) ? '#94a3b8' : '#fff',
                                        border: 'none', borderRadius: '8px',
                                        cursor: (!newPriceRow.subCategory || !newPriceRow.size || !newPriceRow.price) ? 'not-allowed' : 'pointer',
                                        fontWeight: 600, transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <i className="fas fa-plus"></i> Add
                                </button>
                            </div>

                            <div style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 50px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div>Block</div>
                                    <div>Sub Category</div>
                                    <div>Area Type</div>
                                    <div>Size</div>
                                    <div>Base Price</div>
                                    <div></div>
                                </div>
                                {(formData.pricing?.unitPrices || []).length === 0 ? (
                                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', background: '#fff' }}>
                                        <div style={{ marginBottom: '8px', fontSize: '1.2rem', color: '#cbd5e1' }}><i className="fas fa-inbox"></i></div>
                                        No price configurations added yet.
                                    </div>
                                ) : (
                                    (formData.pricing?.unitPrices || []).map((row, idx) => (
                                        <div key={row.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 50px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem', color: '#334155', background: '#fff', transition: 'background 0.2s' }}>
                                            <div style={{ fontWeight: 500 }}>{row.block || 'All Blocks'}</div>
                                            <div>{row.subCategory}</div>
                                            <div>{row.areaType}</div>
                                            <div>{row.size}</div>
                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>₹ {Number(row.price).toLocaleString('en-IN')}</div>
                                            <button onClick={() => removePriceRow(row.id)} style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#ef4444', background: '#fef2f2', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}><i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Global BSP */}
                    <div style={sectionStyle}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: '#fffbeb', borderRadius: '8px' }}>
                                <i className="fas fa-coins" style={{ color: '#f59e0b', fontSize: '0.8rem' }}></i>
                            </span>
                            2. Global Basic Sales Price (Optional Fallback)
                        </h4>
                        <div style={{ maxWidth: '400px' }}>
                            <label style={labelStyle}>Base Price Amount</label>
                            <div style={{ display: 'flex' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>₹</span>
                                    <input
                                        type="number"
                                        style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px', paddingLeft: '28px' }}
                                        placeholder="Enter Amount"
                                        value={formData.pricing?.basePrice?.amount}
                                        onChange={e => updatePricing('basePrice', { ...formData.pricing.basePrice, amount: e.target.value })}
                                    />
                                </div>
                                <select
                                    style={{ ...customSelectStyle, width: '140px', borderRadius: '0 8px 8px 0', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 500 }}
                                    value={formData.pricing?.basePrice?.unit}
                                    onChange={e => updatePricing('basePrice', { ...formData.pricing.basePrice, unit: e.target.value })}
                                >
                                    <option value="sqft">Per Sq.Ft.</option>
                                    <option value="sqyd">Per Sq.Yd.</option>
                                    <option value="fixed">Fixed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Master Charges */}
                    <div style={sectionStyle}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: '#f3e8ff', borderRadius: '8px' }}>
                                    <i className="fas fa-file-invoice-dollar" style={{ color: '#9333ea', fontSize: '0.8rem' }}></i>
                                </span>
                                3. Master Additional Charges
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => addMasterCharge('EDC')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>+ EDC</button>
                                <button onClick={() => addMasterCharge('IDC')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>+ IDC</button>
                                <button onClick={() => addMasterCharge()} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>+ Custom</button>
                            </div>
                        </h4>

                        {(formData.pricing?.masterCharges || []).length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', border: '1px dashed #cbd5e1', borderRadius: '12px' }}>
                                No additional charges added.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(formData.pricing?.masterCharges || []).map((charge, idx) => (
                                    <div key={charge.id} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'end', gap: '16px' }}>
                                        <div style={{ flex: 2 }}>
                                            <label style={labelStyle}>Charge Name</label>
                                            <input style={inputStyle} value={charge.name} onChange={e => updateMasterCharge(charge.id, 'name', e.target.value)} placeholder="e.g. Club Membership" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Category</label>
                                            <select style={customSelectStyle} value={charge.category} onChange={e => updateMasterCharge(charge.id, 'category', e.target.value)}>
                                                <option>Development</option>
                                                <option>PLC</option>
                                                <option>Statutory</option>
                                                <option>Maintenance</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Basis</label>
                                            <select style={customSelectStyle} value={charge.basis} onChange={e => updateMasterCharge(charge.id, 'basis', e.target.value)}>
                                                <option>Per SqFt</option>
                                                <option>Fixed</option>
                                                <option>% of Total</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Amount/Rate</label>
                                            <input type="number" style={inputStyle} value={charge.amount} onChange={e => updateMasterCharge(charge.id, 'amount', e.target.value)} placeholder="0.00" />
                                        </div>
                                        <button onClick={() => removeMasterCharge(charge.id)} style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: '#ef4444', background: '#fff', border: '1px solid #fecaca', cursor: 'pointer', transition: 'all 0.2s' }}><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 4: Payment Plan Strategy */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-calendar-alt" style={{ color: '#ec4899' }}></i> 4. Payment Plan Strategy
                            </h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => applyPlanPreset('CLP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Standard CLP</button>
                                <button onClick={() => applyPlanPreset('DPP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Down Payment</button>
                                <button onClick={() => applyPlanPreset('PLP')} style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>PLP Preset</button>
                            </div>
                        </div>

                        {(formData.pricing?.paymentPlans || []).map((plan, pIdx) => (
                            <div key={pIdx} style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
                                    <input
                                        style={{ ...inputStyle, background: 'transparent', border: 'none', borderBottom: '2px solid #6366f1', borderRadius: 0, width: '300px', fontWeight: 700, fontSize: '1.1rem' }}
                                        value={plan.name}
                                        onChange={e => {
                                            const newPlans = [...formData.pricing.paymentPlans];
                                            newPlans[pIdx].name = e.target.value;
                                            updatePricing('paymentPlans', newPlans);
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const newPlans = [...formData.pricing.paymentPlans];
                                            newPlans[pIdx].milestones.push({ name: '', percentage: '', stage: 'Slab' });
                                            updatePricing('paymentPlans', newPlans);
                                        }}
                                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    >
                                        + Milestone
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 40px', gap: '16px', marginBottom: '12px', padding: '0 8px', fontWeight: 700, fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                                    <span>Milestone Description</span>
                                    <span>Pay %</span>
                                    <span>Construction Stage</span>
                                    <span></span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {plan.milestones.map((m, mIdx) => (
                                        <div key={mIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 40px', gap: '16px', alignItems: 'center' }}>
                                            <input
                                                style={inputStyle}
                                                value={m.name}
                                                placeholder="e.g. On start of Foundation"
                                                onChange={e => {
                                                    const newPlans = [...formData.pricing.paymentPlans];
                                                    newPlans[pIdx].milestones[mIdx].name = e.target.value;
                                                    updatePricing('paymentPlans', newPlans);
                                                }}
                                            />
                                            <div style={{ display: 'flex' }}>
                                                <input
                                                    type="number"
                                                    style={{ ...inputStyle, borderRight: 'none', borderRadius: '8px 0 0 8px' }}
                                                    value={m.percentage}
                                                    placeholder="0"
                                                    onChange={e => {
                                                        const newPlans = [...formData.pricing.paymentPlans];
                                                        newPlans[pIdx].milestones[mIdx].percentage = e.target.value;
                                                        updatePricing('paymentPlans', newPlans);
                                                    }}
                                                />
                                                <div style={{ width: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: 'none', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b' }}>%</div>
                                            </div>
                                            <select
                                                style={customSelectStyle}
                                                value={m.stage}
                                                onChange={e => {
                                                    const newPlans = [...formData.pricing.paymentPlans];
                                                    newPlans[pIdx].milestones[mIdx].stage = e.target.value;
                                                    updatePricing('paymentPlans', newPlans);
                                                }}
                                            >
                                                <option value="Booking">Booking</option>
                                                <option value="Allotment">Allotment</option>
                                                <option value="Excavation">Excavation</option>
                                                <option value="Slab">Slab Casting</option>
                                                <option value="Finishing">Finishing</option>
                                                <option value="Possession">Possession</option>
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const newPlans = [...formData.pricing.paymentPlans];
                                                    newPlans[pIdx].milestones = newPlans[pIdx].milestones.filter((_, i) => i !== mIdx);
                                                    updatePricing('paymentPlans', newPlans);
                                                }}
                                                style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                                                onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                                onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginTop: '20px', padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Total Percentage Distributed:</span>
                                    <span style={{
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        color: plan.milestones.reduce((acc, m) => acc + (parseFloat(m.percentage) || 0), 0) === 100 ? '#22c55e' : '#ef4444'
                                    }}>
                                        {plan.milestones.reduce((acc, m) => acc + (parseFloat(m.percentage) || 0), 0)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px 32px', borderTop: '1px solid #e2e8f0', background: '#fff', borderRadius: '0 0 20px 20px',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px'
                }}>
                    <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                        Cancel
                    </button>
                    <button onClick={handleSave} style={{ padding: '12px 32px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                        <i className="fas fa-save"></i> Save Pricing
                    </button>
                </div>
            </div>
        </div>
    );
}
