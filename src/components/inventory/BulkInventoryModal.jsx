import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { usePropertyConfig } from '../../context/PropertyConfigContext';

const labelStyle = { fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' };
const selectStyle = { ...inputStyle, appearance: 'none', background: '#fff', cursor: 'pointer' };
const disabledStyle = { ...selectStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' };

const BulkInventoryModal = ({ isOpen, onClose, defaultProjectName, defaultProjectId, onAddSuccess }) => {
    const { sizes } = usePropertyConfig();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    
    const [dynamicBlocks, setDynamicBlocks] = useState([]);
    const [formData, setFormData] = useState({
        projectName: defaultProjectName || '',
        projectId: defaultProjectId || '',
        block: '',
        category: 'Residential',
        subCategory: 'Apartment',
        unitType: '2BHK',
        sizeConfig: '',
        status: 'Available',
        intent: ['For Sale'],
        price: '',
        unitGenMethod: 'range', // 'range' or 'comma'
        prefix: '',
        rangeStart: '',
        rangeEnd: '',
        commaList: ''
    });

    const [previewUnits, setPreviewUnits] = useState([]);

    useEffect(() => {
        if (!isOpen) {
            setStep(1);
            setPreviewUnits([]);
            setFormData(prev => ({
                ...prev,
                projectName: defaultProjectName || '',
                projectId: defaultProjectId || '',
                block: '',
                sizeConfig: '',
                prefix: '',
                rangeStart: '',
                rangeEnd: '',
                commaList: ''
            }));
        }
    }, [isOpen, defaultProjectName, defaultProjectId]);

    useEffect(() => {
        const fetchBlocks = async () => {
            if (!formData.projectName) return;
            try {
                const res = await api.get(`/inventory/blocks`);
                // Use existing endpoint, or we can just fetch projects
                // We'll rely on the global list if needed, or deal-forms public endpoint
                const blocksRes = await api.get(`/deal-forms/public/inventory/blocks?projectName=${encodeURIComponent(formData.projectName)}`);
                if (blocksRes.data?.success) {
                    const data = blocksRes.data.data || [];
                    const safeData = data.map(i => typeof i === 'object' ? i.name || i.block?.name || String(i) : String(i)).filter(Boolean);
                    setDynamicBlocks(safeData);
                }
            } catch (err) {
                console.error("Error fetching blocks", err);
            }
        };
        if (isOpen) fetchBlocks();
    }, [formData.projectName, isOpen]);

    if (!isOpen) return null;

    const handleGeneratePreview = () => {
        let units = [];
        if (formData.unitGenMethod === 'range') {
            const start = parseInt(formData.rangeStart);
            const end = parseInt(formData.rangeEnd);
            if (isNaN(start) || isNaN(end) || start > end || end - start > 500) {
                return toast.error("Invalid range. Ensure start <= end and max 500 units.");
            }
            for (let i = start; i <= end; i++) {
                units.push(`${formData.prefix}${i}`);
            }
        } else {
            if (!formData.commaList.trim()) return toast.error("Please enter unit numbers.");
            units = formData.commaList.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (units.length === 0) return toast.error("No units generated.");

        const preview = units.map(u => ({
            projectName: formData.projectName,
            projectId: formData.projectId,
            block: formData.block,
            unitNo: u,
            unitNumber: u, // Store in both
            category: formData.category,
            subCategory: formData.subCategory,
            unitType: formData.unitType,
            sizeConfig: formData.sizeConfig,
            status: formData.status,
            intent: formData.intent,
            price: { value: Number(formData.price) || 0, currency: 'INR' }
        }));

        setPreviewUnits(preview);
        setStep(2);
    };

    const handleSubmit = async () => {
        if (previewUnits.length === 0) return;
        setLoading(true);
        try {
            const res = await api.post('/inventory/bulk-add', { items: previewUnits });
            if (res.data?.success) {
                toast.success(`Successfully added ${previewUnits.length} units!`);
                onAddSuccess && onAddSuccess();
                onClose();
            } else {
                toast.error(res.data?.message || "Failed to add bulk inventory");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error creating bulk inventory");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '90%', maxWidth: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Bulk Add Inventory</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
                    {step === 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Context Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Project</label>
                                    <input style={disabledStyle} value={formData.projectName} disabled />
                                </div>
                                <div>
                                    <label style={labelStyle}>Block / Tower <span style={{color: 'red'}}>*</span></label>
                                    <select style={selectStyle} value={formData.block} onChange={e => setFormData({...formData, block: e.target.value})}>
                                        <option value="">Select Block</option>
                                        {dynamicBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Details Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Category</label>
                                    <select style={selectStyle} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                        <option value="Residential">Residential</option>
                                        <option value="Commercial">Commercial</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Unit Type</label>
                                    <select style={selectStyle} value={formData.unitType} onChange={e => setFormData({...formData, unitType: e.target.value})}>
                                        <option value="1BHK">1 BHK</option>
                                        <option value="2BHK">2 BHK</option>
                                        <option value="3BHK">3 BHK</option>
                                        <option value="4BHK">4 BHK</option>
                                        <option value="Plot">Plot</option>
                                        <option value="Shop">Shop</option>
                                        <option value="Office">Office</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Size / Config</label>
                                    <select style={selectStyle} value={formData.sizeConfig} onChange={e => setFormData({...formData, sizeConfig: e.target.value})}>
                                        <option value="">Select Size (Optional)</option>
                                        {sizes.filter(s => s.project === formData.projectName && s.block === formData.block).map(s => (
                                            <option key={s.id} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Base Price (₹)</label>
                                    <input type="number" style={inputStyle} value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="e.g. 5000000" />
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />

                            {/* Generator Section */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#1e293b' }}>Unit Numbers</h4>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                        <input type="radio" checked={formData.unitGenMethod === 'range'} onChange={() => setFormData({...formData, unitGenMethod: 'range'})} />
                                        Range Generator
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                        <input type="radio" checked={formData.unitGenMethod === 'comma'} onChange={() => setFormData({...formData, unitGenMethod: 'comma'})} />
                                        Comma Separated
                                    </label>
                                </div>

                                {formData.unitGenMethod === 'range' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div>
                                            <label style={labelStyle}>Prefix (Optional)</label>
                                            <input style={inputStyle} value={formData.prefix} onChange={e => setFormData({...formData, prefix: e.target.value})} placeholder="e.g. A-" />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Start #</label>
                                            <input type="number" style={inputStyle} value={formData.rangeStart} onChange={e => setFormData({...formData, rangeStart: e.target.value})} placeholder="101" />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>End #</label>
                                            <input type="number" style={inputStyle} value={formData.rangeEnd} onChange={e => setFormData({...formData, rangeEnd: e.target.value})} placeholder="110" />
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <label style={labelStyle}>Enter Units (comma separated)</label>
                                        <textarea style={{...inputStyle, resize: 'vertical', minHeight: '80px'}} value={formData.commaList} onChange={e => setFormData({...formData, commaList: e.target.value})} placeholder="101, 102, 105, A-201"></textarea>
                                    </div>
                                )}
                            </div>

                        </div>
                    ) : (
                        <div>
                            <div style={{ marginBottom: '16px', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e3a8a' }}>
                                <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
                                You are about to create <strong>{previewUnits.length}</strong> units for <strong>{formData.projectName} - {formData.block}</strong>.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                                {previewUnits.map(u => (
                                    <div key={u.unitNo} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                                        {u.unitNo}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    {step === 2 && (
                        <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Back</button>
                    )}
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    {step === 1 ? (
                        <button 
                            disabled={!formData.block}
                            onClick={handleGeneratePreview} 
                            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: formData.block ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: formData.block ? 'pointer' : 'not-allowed' }}
                        >
                            Review ({formData.unitGenMethod === 'range' ? (formData.rangeEnd - formData.rangeStart + 1 || 0) : (formData.commaList.split(',').filter(s=>s.trim()).length)})
                        </button>
                    ) : (
                        <button 
                            onClick={handleSubmit} 
                            disabled={loading}
                            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
                        >
                            {loading ? 'Creating...' : `Confirm & Create ${previewUnits.length} Units`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkInventoryModal;
