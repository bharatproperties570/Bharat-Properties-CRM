import React, { useState, useEffect } from 'react';
import { MODULE_CONFIG } from '../../../utils/dataManagementUtils';
import toast from 'react-hot-toast';

const BulkUpdatePage = () => {
    const [module, setModule] = useState('contacts');
    const [filters, setFilters] = useState([{ field: '', operator: 'is', value: '' }]);
    const [updateField, setUpdateField] = useState('');
    const [newValue, setNewValue] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationComplete, setSimulationComplete] = useState(false);
    const [affectedCount, setAffectedCount] = useState(0);

    const activeConfig = MODULE_CONFIG[module];
    const availableFields = activeConfig ? activeConfig.fields : [];

    // Reset when module changes
    useEffect(() => {
        setFilters([{ field: availableFields[0]?.key || '', operator: 'is', value: '' }]);
        setUpdateField(availableFields[0]?.key || '');
        setAffectedCount(activeConfig ? activeConfig.data.length : 0);
    }, [module]);

    // Calculate affected records whenever filters change
    useEffect(() => {
        if (!activeConfig) return;

        const count = activeConfig.data.filter(item => {
            return filters.every(filter => {
                if (!filter.field || !filter.value) return true; // Ignore incomplete filters

                const itemValue = String(item[filter.field] || '').toLowerCase();
                const filterValue = filter.value.toLowerCase();

                switch (filter.operator) {
                    case 'is': return itemValue === filterValue;
                    case 'is not': return itemValue !== filterValue;
                    case 'contains': return itemValue.includes(filterValue);
                    case 'starts with': return itemValue.startsWith(filterValue);
                    default: return true;
                }
            });
        }).length;

        setAffectedCount(count);
    }, [filters, activeConfig]);

    const handleAddFilter = () => {
        setFilters([...filters, { field: availableFields[0]?.key || '', operator: 'is', value: '' }]);
    };

    const handleRemoveFilter = (idx) => {
        setFilters(filters.filter((_, i) => i !== idx));
    };

    const handleFilterChange = (idx, key, val) => {
        const newFilters = [...filters];
        newFilters[idx][key] = val;
        setFilters(newFilters);
    };

    const handleReview = () => {
        if (!updateField || !newValue) return toast.error('Please select a field to update and a new value.');
        if (affectedCount === 0) return toast.error('No records match your filters.');

        setIsSimulating(true);
        setTimeout(() => {
            setIsSimulating(false);
            setSimulationComplete(true);
        }, 1500);
    };

    if (simulationComplete) {
        return (
            <div style={{ flex: 1, padding: '40px', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '80px', height: '80px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '24px' }}>
                    <i className="fas fa-check-double"></i>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Update Scheduled!</h2>
                <p style={{ color: '#64748b', textAlign: 'center', maxWidth: '400px', marginBottom: '32px' }}>
                    Bulk update job has been queued. <strong>{affectedCount}</strong> {activeConfig.label} records will be updated to <strong>{availableFields.find(f => f.key === updateField)?.label} = {newValue}</strong>.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => { setSimulationComplete(false); setUpdateField(''); setNewValue(''); }}
                        className="btn-outline"
                        style={{ padding: '10px 24px', borderRadius: '6px' }}
                    >
                        Update More
                    </button>
                    <button className="btn-primary" style={{ padding: '10px 24px', borderRadius: '6px' }}>View Job Status</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
            <div style={{ padding: '32px 40px 0' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Bulk Update</h2>
                <p style={{ color: '#64748b', marginBottom: '32px' }}>Mass update records based on specific criteria.</p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                <div style={{ maxWidth: '800px' }}>
                    {/* Step 1: Module Selection */}
                    <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: '#e0f2fe', color: '#0284c7', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>1</span>
                            Select Module
                        </h3>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {Object.values(MODULE_CONFIG).map(mod => (
                                <button
                                    key={mod.id}
                                    onClick={() => setModule(mod.id)}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        border: module === mod.id ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                        background: module === mod.id ? '#eff6ff' : '#fff',
                                        color: module === mod.id ? 'var(--primary-color)' : '#64748b',
                                        fontWeight: module === mod.id ? 700 : 500,
                                        cursor: 'pointer', fontSize: '0.9rem'
                                    }}
                                >
                                    {mod.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Define Filters */}
                    <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: '#e0f2fe', color: '#0284c7', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>2</span>
                            Filter Records
                        </h3>
                        {filters.map((filter, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                                <select
                                    value={filter.field}
                                    onChange={(e) => handleFilterChange(idx, 'field', e.target.value)}
                                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                >
                                    {availableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                </select>
                                <select
                                    value={filter.operator}
                                    onChange={(e) => handleFilterChange(idx, 'operator', e.target.value)}
                                    style={{ width: '120px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="is">is</option>
                                    <option value="is not">is not</option>
                                    <option value="contains">contains</option>
                                    <option value="starts with">starts with</option>
                                </select>
                                <input
                                    type="text"
                                    value={filter.value}
                                    onChange={(e) => handleFilterChange(idx, 'value', e.target.value)}
                                    placeholder="Value..."
                                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                />
                                {filters.length > 1 && (
                                    <button onClick={() => handleRemoveFilter(idx)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                        <i className="fas fa-trash"></i>
                                    </button>
                                )}
                            </div>
                        ))}
                        <button onClick={handleAddFilter} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                            <i className="fas fa-plus"></i> Add Condition
                        </button>
                    </div>

                    {/* Step 3: Define Update */}
                    <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: '#e0f2fe', color: '#0284c7', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>3</span>
                            Apply Change
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Field to Update</label>
                                <select
                                    value={updateField}
                                    onChange={(e) => setUpdateField(e.target.value)}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                >
                                    {availableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                </select>
                            </div>
                            <div style={{ fontSize: '1.2rem', color: '#94a3b8', textAlign: 'center', paddingTop: '24px' }}>
                                <i className="fas fa-arrow-right"></i>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>New Value</label>
                                <input
                                    type="text"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    placeholder="Enter new value..."
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Action Area */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Ready to Update</div>
                            <div style={{ fontSize: '0.9rem', color: '#15803d' }}>
                                Based on your filters, <strong>{affectedCount} records</strong> will be updated.
                            </div>
                        </div>
                        <button
                            onClick={handleReview}
                            className="btn-primary"
                            style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 700, fontSize: '1rem', background: '#16a34a', border: 'none' }}
                            disabled={isSimulating}
                        >
                            {isSimulating ? <i className="fas fa-spinner fa-spin"></i> : 'Update Records'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkUpdatePage;
