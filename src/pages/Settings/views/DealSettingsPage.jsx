import React, { useState, useEffect, useCallback } from 'react';
import { api, lookupsAPI } from '../../../utils/api';
import toast from 'react-hot-toast';

// --- Helper Components ---
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

const DealSettingsPage = () => {
    // Modes: 'list', 'add'
    const [viewMode, setViewMode] = useState('list');

    // --- State ---
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Global Config State
    const [config, setConfig] = useState({
        stampDutyMale: 7,
        stampDutyFemale: 5,
        stampDutyJoint: 6,
        registrationPercent: 1,
        registrationMode: 'percent', // 'percent' or 'slab'
        registrationSlabs: [],
        legalFees: 15000,
        brokeragePercent: 1,
        useCollectorRateDefault: true
    });

    // Collector Rate Data State (for Form)
    const [rateForm, setRateForm] = useState({
        state: '',
        district: '',
        tehsil: '',
        category: 'Residential',
        rate: '',
        unit: 'sqft'
    });

    const [collectorRates, setCollectorRates] = useState([]);

    // Lookups
    const [states, setStates] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [tehsils, setTehsils] = useState([]);

    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Global Config
            const configRes = await api.get('/system-settings/govt_charges_config');
            if (configRes.data?.data) {
                const apiConfig = configRes.data.data;
                setConfig(prev => ({
                    ...prev,
                    ...apiConfig,
                    registrationSlabs: apiConfig.registrationSlabs || []
                }));
            }

            // 2. Fetch Collector Rates
            const ratesRes = await api.get('/collector-rates');
            if (ratesRes.data?.status === 'success') {
                setCollectorRates(ratesRes.data.data.docs || []);
            }

        } catch (error) {
            console.error(error);
            toast.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial Load & States
    useEffect(() => {
        fetchData();
        fetchStates();
    }, [fetchData]);

    const fetchStates = async () => {
        try {
            const res = await lookupsAPI.getStates();
            if (res.status === 'success') setStates(res.data);
        } catch (e) { console.error(e); }
    };

    // Dependent Lookups
    useEffect(() => {
        if (rateForm.state) {
            fetchDistricts(rateForm.state);
        } else {
            setDistricts([]);
            setTehsils([]);
        }
    }, [rateForm.state]);

    const fetchDistricts = async (stateId) => {
        try {
            const res = await lookupsAPI.getDistricts(stateId);
            if (res.status === 'success') setDistricts(res.data);
        } catch (e) { console.error(e); }
    };

    // --- Handlers ---
    const handleConfigChange = (field, value) => {
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

    const handleRateChange = (field, value) => {
        setRateForm(prev => ({ ...prev, [field]: value }));
    };

    // Main Save Handler
    const handleSaveAll = async () => {
        setSaving(true);
        try {
            // 1. Save Global Config
            await api.post('/api/system-settings/upsert', {
                key: 'govt_charges_config',
                value: config
            });

            // 2. Add New Collector Rate (Only if form is filled)
            if (rateForm.state && rateForm.district && rateForm.rate) {
                const ratePayload = {
                    state: rateForm.state,
                    district: rateForm.district,
                    tehsil: rateForm.tehsil || null,
                    category: rateForm.category,
                    rate: parseFloat(rateForm.rate),
                    unit: 'sqft'
                };
                await api.post('/collector-rates', ratePayload);
                toast.success("Settings Updated & Rate Added!");
            } else {
                toast.success("Configuration Saved!");
            }

            // Cleanup & Refresh
            setRateForm({
                state: '',
                district: '',
                tehsil: '',
                category: 'Residential',
                rate: '',
                unit: 'sqft'
            });

            fetchData();
            setViewMode('list');

        } catch (error) {
            console.error(error);
            toast.error(error.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRate = async (id) => {
        if (!window.confirm("Delete this rate?")) return;
        try {
            await api.delete(`/collector-rates/${id}`);
            toast.success("Rate deleted");
            fetchData();
        } catch (e) {
            toast.error("Failed to delete");
        }
    };

    // --- Styles ---
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
        cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px',
        paddingRight: '32px'
    };

    const btnPrimaryStyle = {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        padding: '10px 20px',
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
        padding: '10px 20px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    };

    const tableHeaderStyle = {
        background: '#f8fafc',
        padding: '12px 24px',
        textAlign: 'left',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        borderBottom: '1px solid #e2e8f0'
    };

    const tableCellStyle = {
        padding: '16px 24px',
        borderBottom: '1px solid #f1f5f9',
        fontSize: '0.9rem',
        color: '#1e293b'
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Deal Settings</h1>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>Manage financial configurations and collector rates</p>
                </div>
            </div>

            {/* Collector Rates Section (First) */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '32px' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Collector Rates</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>Manage government circle rates based on location</p>
                    </div>
                    <button onClick={() => setViewMode('add')} style={btnPrimaryStyle}>
                        <i className="fas fa-plus"></i> Add New Rate
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={tableHeaderStyle}>Location</th>
                                <th style={tableHeaderStyle}>Category</th>
                                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Rate (₹/sqft)</th>
                                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {collectorRates.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        No collector rates found. Add one to get started.
                                    </td>
                                </tr>
                            ) : (
                                collectorRates.map((rate) => (
                                    <tr key={rate._id} style={{ transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                                        <td style={tableCellStyle}>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{rate.district?.lookup_value || 'Unknown District'}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{rate.state?.lookup_value} {rate.tehsil && `• ${rate.tehsil.lookup_value}`}</div>
                                        </td>
                                        <td style={tableCellStyle}>
                                            <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                {rate.category}
                                            </span>
                                        </td>
                                        <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                            ₹{rate.rate?.toLocaleString('en-IN')}
                                        </td>
                                        <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleDeleteRate(rate._id)}
                                                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                title="Delete Rate"
                                            >
                                                <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Config Section (Second) */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-cog" style={{ color: '#2563eb' }}></i>
                        </div>
                        Global Configuration
                    </h3>
                    <button onClick={handleSaveAll} style={btnPrimaryStyle} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                    <div>
                        <label style={labelStyle}>Stamp Duty (Male) %</label>
                        <input
                            type="number"
                            style={inputStyle}
                            value={config.stampDutyMale}
                            onChange={e => handleConfigChange('stampDutyMale', e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Stamp Duty (Female) %</label>
                        <input
                            type="number"
                            style={inputStyle}
                            value={config.stampDutyFemale}
                            onChange={e => handleConfigChange('stampDutyFemale', e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Stamp Duty (Joint) %</label>
                        <input
                            type="number"
                            style={inputStyle}
                            value={config.stampDutyJoint}
                            onChange={e => handleConfigChange('stampDutyJoint', e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Legal Fees (₹)</label>
                        <input
                            type="number"
                            style={inputStyle}
                            value={config.legalFees}
                            onChange={e => handleConfigChange('legalFees', e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Brokerage Fee %</label>
                        <input
                            type="number"
                            style={inputStyle}
                            value={config.brokeragePercent}
                            onChange={e => handleConfigChange('brokeragePercent', e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>Registration Fee Calculation:</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                <input
                                    type="radio"
                                    name="regMode"
                                    checked={config.registrationMode === 'percent'}
                                    onChange={() => handleConfigChange('registrationMode', 'percent')}
                                />
                                Flat Percentage
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                <input
                                    type="radio"
                                    name="regMode"
                                    checked={config.registrationMode === 'slab'}
                                    onChange={() => handleConfigChange('registrationMode', 'slab')}
                                />
                                Slab Based
                            </label>
                        </div>
                    </div>

                    {config.registrationMode === 'percent' ? (
                        <div style={{ maxWidth: '300px' }}>
                            <label style={labelStyle}>Registration Fee %</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={config.registrationPercent}
                                onChange={e => handleConfigChange('registrationPercent', e.target.value)}
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
                                style={{ marginTop: '12px', background: 'white', border: '1px dashed #cbd5e1', color: '#2563eb', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, width: '100%', transition: 'all 0.2s' }}
                            >
                                <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Slab
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Rate Modal */}
            {viewMode === 'add' && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', width: '90%', maxWidth: '600px', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>

                        {/* Modal Header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ width: '42px', height: '42px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-map-marked-alt" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                        Add Collector Rate
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <LiveClock />
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem', transition: 'color 0.2s' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '70vh' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.state}
                                            onChange={e => handleRateChange('state', e.target.value)}
                                        >
                                            <option value="">Select State</option>
                                            {states.map(s => <option key={s._id} value={s._id}>{s.lookup_value}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>District</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.district}
                                            onChange={e => handleRateChange('district', e.target.value)}
                                            disabled={!rateForm.state}
                                        >
                                            <option value="">Select District</option>
                                            {districts.map(d => <option key={d._id} value={d._id}>{d.lookup_value}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Tehsil (Optional)</label>
                                    <select
                                        style={selectStyle}
                                        value={rateForm.tehsil}
                                        onChange={e => handleRateChange('tehsil', e.target.value)}
                                        disabled={!rateForm.district}
                                    >
                                        <option value="">Select Tehsil</option>
                                        {tehsils.map(t => <option key={t._id} value={t._id}>{t.lookup_value}</option>)}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Category</label>
                                        <select
                                            style={selectStyle}
                                            value={rateForm.category}
                                            onChange={e => handleRateChange('category', e.target.value)}
                                        >
                                            {['Residential', 'Commercial', 'Industrial', 'Institutional', 'Agriculture'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Rate (₹ / sqft)</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="number"
                                                style={{ ...inputStyle, paddingLeft: '28px' }}
                                                value={rateForm.rate}
                                                onChange={e => handleRateChange('rate', e.target.value)}
                                                placeholder="0.00"
                                            />
                                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 600 }}>₹</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setViewMode('list')} style={btnOutlineStyle}>Cancel</button>
                            <button onClick={handleSaveAll} style={btnPrimaryStyle} disabled={saving}>
                                {saving ? <span className="loader-sm"></span> : <><i className="fas fa-check"></i> Add Rate</>}
                            </button>
                        </div>

                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .loader-sm {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-bottom-color: transparent;
                    border-radius: 50%;
                    display: inline-block;
                    animation: rotation 1s linear infinite;
                }
                @keyframes rotation {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default DealSettingsPage;
