import React, { useState, useEffect } from 'react';

const LiveClock = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <i className="fas fa-calendar-alt" style={{ color: '#94a3b8' }}></i>
            <span>{time.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span style={{ width: '1px', height: '12px', background: '#cbd5e1', margin: '0 4px' }}></span>
            <i className="fas fa-clock" style={{ color: '#94a3b8' }}></i>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
    );
};

const CreateGlobalConfigModal = ({ isOpen, onClose, onSave, initialConfig, saving }) => {
    const [config, setConfig] = useState({
        configName: '',
        stampDutyMale: 7,
        stampDutyFemale: 5,
        stampDutyJoint: 6,
        registrationPercent: 1,
        registrationMode: 'percent',
        registrationSlabs: [],
        legalFees: 15000,
        ...initialConfig
    });

    // Update internal state when initialConfig changes
    useEffect(() => {
        if (initialConfig) {
            setConfig(prev => ({ ...prev, ...initialConfig }));
        }
    }, [initialConfig]);

    const handleFieldChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleSlabChange = (index, field, value) => {
        const newSlabs = [...config.registrationSlabs];
        newSlabs[index] = { ...newSlabs[index], [field]: value };
        setConfig(prev => ({ ...prev, registrationSlabs: newSlabs }));
    };

    const addSlab = () => {
        setConfig(prev => ({
            ...prev,
            registrationSlabs: [...prev.registrationSlabs, { min: 0, max: 0, amount: 0 }]
        }));
    };

    const removeSlab = (index) => {
        const newSlabs = config.registrationSlabs.filter((_, i) => i !== index);
        setConfig(prev => ({ ...prev, registrationSlabs: newSlabs }));
    };

    if (!isOpen) return null;

    const labelStyle = {
        fontSize: "0.9rem",
        fontWeight: 600,
        color: "#334155",
        marginBottom: "8px",
        display: "block",
    };

    const inputStyle = {
        width: "100%",
        padding: "10px 12px",
        borderRadius: "6px",
        border: "1px solid #cbd5e1",
        fontSize: "0.9rem",
        outline: "none",
        color: "#1e293b",
        transition: "border-color 0.2s",
        height: "42px",
        boxSizing: "border-box",
        backgroundColor: "#fff",
    };

    const sectionCardStyle = {
        background: "#fff",
        padding: "20px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        marginBottom: "20px"
    };

    const btnPrimaryStyle = {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        padding: '10px 24px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
    };

    const btnOutlineStyle = {
        background: 'transparent',
        color: '#64748b',
        border: '1px solid #cbd5e1',
        padding: '10px 24px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{
                background: '#f8fafc',
                width: '90%',
                maxWidth: '800px',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                maxHeight: '90vh'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '42px', height: '42px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-cog" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Global Configuration</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <LiveClock />
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    <div style={sectionCardStyle}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>Configuration Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                style={{ ...inputStyle, borderColor: !config.configName ? '#fca5a5' : '#cbd5e1' }}
                                value={config.configName || ''}
                                onChange={e => handleFieldChange('configName', e.target.value)}
                                placeholder="e.g., standard_2024, premium_rates, etc."
                                required
                            />
                            {!config.configName && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>Name is required to save as a list item.</p>}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Stamp Duty (Male) %</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={config.stampDutyMale}
                                    onChange={e => handleFieldChange('stampDutyMale', e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Stamp Duty (Female) %</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={config.stampDutyFemale}
                                    onChange={e => handleFieldChange('stampDutyFemale', e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Stamp Duty (Joint) %</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={config.stampDutyJoint}
                                    onChange={e => handleFieldChange('stampDutyJoint', e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Legal Fees (₹)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={config.legalFees}
                                    onChange={e => handleFieldChange('legalFees', e.target.value)}
                                />
                            </div>

                        </div>
                    </div>



                    <div style={sectionCardStyle}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Registration Fee Calculation</h4>

                        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                <input
                                    type="radio"
                                    name="regModeModal"
                                    checked={config.registrationMode === 'percent'}
                                    onChange={() => handleFieldChange('registrationMode', 'percent')}
                                />
                                Flat Percentage
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                <input
                                    type="radio"
                                    name="regModeModal"
                                    checked={config.registrationMode === 'slab'}
                                    onChange={() => handleFieldChange('registrationMode', 'slab')}
                                />
                                Slab Based
                            </label>
                        </div>

                        {config.registrationMode === 'percent' ? (
                            <div style={{ maxWidth: '300px' }}>
                                <label style={labelStyle}>Registration Fee %</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={config.registrationPercent}
                                    onChange={e => handleFieldChange('registrationPercent', e.target.value)}
                                />
                            </div>
                        ) : (
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', marginBottom: '12px', fontWeight: 600, fontSize: '0.8rem', color: '#64748b' }}>
                                    <div>Min Value (₹)</div>
                                    <div>Max Value (₹)</div>
                                    <div>Fee Amount (₹)</div>
                                    <div></div>
                                </div>
                                {config.registrationSlabs.map((slab, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', marginBottom: '8px' }}>
                                        <input
                                            type="number"
                                            style={inputStyle}
                                            value={slab.min}
                                            onChange={e => handleSlabChange(idx, 'min', e.target.value)}
                                            placeholder="Min"
                                        />
                                        <input
                                            type="number"
                                            style={inputStyle}
                                            value={slab.max}
                                            onChange={e => handleSlabChange(idx, 'max', e.target.value)}
                                            placeholder="Max"
                                        />
                                        <input
                                            type="number"
                                            style={inputStyle}
                                            value={slab.amount}
                                            onChange={e => handleSlabChange(idx, 'amount', e.target.value)}
                                            placeholder="Fee"
                                        />
                                        <button
                                            onClick={() => removeSlab(idx)}
                                            style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addSlab}
                                    style={{ marginTop: '12px', background: 'white', border: '1px dashed #cbd5e1', color: '#2563eb', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, width: '100%' }}
                                >
                                    <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Slab
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={btnOutlineStyle}>Cancel</button>
                    <button onClick={() => onSave(config)} style={{ ...btnPrimaryStyle, opacity: !config.configName ? 0.6 : 1, cursor: !config.configName ? 'not-allowed' : 'pointer' }} disabled={saving || !config.configName}>
                        {saving ? 'Saving...' : <><i className="fas fa-check"></i> Save Configuration</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGlobalConfigModal;
