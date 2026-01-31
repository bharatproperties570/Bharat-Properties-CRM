import React, { useState } from 'react';

const BulkUpdatePage = () => {
    const [module, setModule] = useState('contacts');
    const [filters, setFilters] = useState([{ field: 'status', operator: 'is', value: '' }]);
    const [updateField, setUpdateField] = useState('');
    const [newValue, setNewValue] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationComplete, setSimulationComplete] = useState(false);

    const modules = [
        { id: 'contacts', label: 'Contacts' },
        { id: 'leads', label: 'Leads' },
        { id: 'projects', label: 'Projects' },
        { id: 'inventory', label: 'Inventory' },
        { id: 'companies', label: 'Companies' },
        { id: 'property-sizes', label: 'Property Sizes' }
    ];

    const fields = {
        contacts: ['Status', 'Lead Source', 'City', 'Owner'],
        leads: ['Stage', 'Budget Range', 'Preferred Location', 'Agent'],
        projects: ['Construction Status', 'Launch Date', 'Builder'],
        inventory: ['Availability Status', 'Price Per SqFt', 'Floor Rise'],
        companies: ['Industry', 'City', 'Account Manager'],
        'property-sizes': ['Category', 'Metric', 'Project']
    };

    const handleAddFilter = () => {
        setFilters([...filters, { field: 'status', operator: 'is', value: '' }]);
    };

    const handleRemoveFilter = (idx) => {
        setFilters(filters.filter((_, i) => i !== idx));
    };

    const handleReview = () => {
        if (!updateField || !newValue) return alert('Please select a field to update and a new value.');
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
                    Bulk update job #BU-202601 has been queued. 142 {modules.find(m => m.id === module)?.label} records will be updated to <strong>{updateField} = {newValue}</strong>.
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
                            {modules.map(mod => (
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
                                <select style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    {fields[module].map(f => <option key={f}>{f}</option>)}
                                </select>
                                <select style={{ width: '120px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option>is</option>
                                    <option>is not</option>
                                    <option>contains</option>
                                    <option>starts with</option>
                                </select>
                                <input type="text" placeholder="Value..." style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
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
                                    <option value="">Select Field</option>
                                    {fields[module].map(f => <option key={f} value={f}>{f}</option>)}
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
                                Based on your filters, approximately <strong>142 records</strong> will be updated.
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
