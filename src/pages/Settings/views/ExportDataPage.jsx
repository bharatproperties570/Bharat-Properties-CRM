import React, { useState, useEffect } from 'react';
import { MODULE_CONFIG, generateCSV, downloadFile } from '../../../utils/dataManagementUtils';
import toast from 'react-hot-toast';

const ExportDataPage = () => {
    const [module, setModule] = useState('contacts');
    const [format, setFormat] = useState('csv');
    const [selectedColumns, setSelectedColumns] = useState([]);

    // Config for the selected module
    const activeConfig = MODULE_CONFIG[module];
    const availableFields = activeConfig ? activeConfig.fields.map(f => f.key) : [];

    // Initialize selected columns when module changes
    useEffect(() => {
        if (activeConfig) {
            setSelectedColumns(activeConfig.fields.map(f => f.key));
        }
    }, [module]);

    const toggleColumn = (key) => {
        if (selectedColumns.includes(key)) {
            setSelectedColumns(selectedColumns.filter(c => c !== key));
        } else {
            setSelectedColumns([...selectedColumns, key]);
        }
    };

    const handleSelectAll = () => setSelectedColumns(availableFields);
    const handleUnselectAll = () => setSelectedColumns([]);

    const handleExport = () => {
        if (selectedColumns.length === 0) {
            toast.error('Please select at least one column to export.');
            return;
        }

        const dataToExport = activeConfig.data;
        const csvContent = generateCSV(dataToExport, selectedColumns);
        const fileName = `${activeConfig.label}_Export_${new Date().toISOString().split('T')[0]}.csv`;

        downloadFile(csvContent, fileName);
        toast.success(`Successfully exported ${dataToExport.length} records!`);
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
            <div style={{ padding: '32px 40px 0' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Export Data</h2>
                <p style={{ color: '#64748b', marginBottom: '32px' }}>Download your data for reporting or backup.</p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                <div style={{ maxWidth: '900px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: '32px' }}>

                    {/* Left Column: Configuration */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Module Selection */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>1. Select Module</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {Object.values(MODULE_CONFIG).map(mod => (
                                    <div
                                        key={mod.id}
                                        onClick={() => setModule(mod.id)}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '6px',
                                            background: module === mod.id ? '#eff6ff' : 'transparent',
                                            border: module === mod.id ? '1px solid #bfdbfe' : '1px solid transparent',
                                            cursor: 'pointer',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            fontSize: '0.9rem', color: '#334155'
                                        }}
                                    >
                                        <span style={{ fontWeight: module === mod.id ? 600 : 400 }}>{mod.label}</span>
                                        <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px', color: '#64748b' }}>
                                            {mod.data ? mod.data.length : 0}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Format Selection */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>2. Export Format</h3>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {['csv'].map(fmt => (
                                    <div
                                        key={fmt}
                                        onClick={() => setFormat(fmt)}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            textAlign: 'center',
                                            borderRadius: '6px',
                                            border: format === fmt ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                            background: format === fmt ? '#eff6ff' : '#fff',
                                            color: format === fmt ? 'var(--primary-color)' : '#64748b',
                                            fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.85rem'
                                        }}
                                    >
                                        {fmt}
                                    </div>
                                ))}
                                <div style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.85rem', cursor: 'not-allowed' }} title="Coming soon">Excel</div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Column Selection & Preview */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>3. Select Data Points</h3>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem' }}>
                                    <button onClick={handleSelectAll} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer' }}>Select All</button>
                                    <button onClick={handleUnselectAll} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>Clear</button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                                {activeConfig && activeConfig.fields.map(field => (
                                    <div
                                        key={field.key}
                                        onClick={() => toggleColumn(field.key)}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            cursor: 'pointer', fontSize: '0.9rem',
                                            background: selectedColumns.includes(field.key) ? '#f0f9ff' : '#fff'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '4px', border: '1px solid #cbd5e1',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: selectedColumns.includes(field.key) ? 'var(--primary-color)' : '#fff',
                                            borderColor: selectedColumns.includes(field.key) ? 'var(--primary-color)' : '#cbd5e1'
                                        }}>
                                            {selectedColumns.includes(field.key) && <i className="fas fa-check" style={{ color: '#fff', fontSize: '0.7rem' }}></i>}
                                        </div>
                                        <span style={{ color: selectedColumns.includes(field.key) ? '#1e293b' : '#64748b' }}>{field.label}</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b' }}>Summary</h4>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Estimated File Size: <strong style={{ color: '#1e293b' }}>Small</strong></span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
                                    You are exporting <strong>{activeConfig ? activeConfig.data.length : 0}</strong> records from the <strong>{activeConfig ? activeConfig.label : ''}</strong> module.
                                    The export will contain <strong>{selectedColumns.length}</strong> columns.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleExport}
                            className="btn-primary"
                            style={{
                                padding: '16px', borderRadius: '8px', fontWeight: 700, fontSize: '1rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                            }}
                        >
                            <i className="fas fa-file-export"></i> Export {activeConfig ? activeConfig.label : 'Data'}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ExportDataPage;
