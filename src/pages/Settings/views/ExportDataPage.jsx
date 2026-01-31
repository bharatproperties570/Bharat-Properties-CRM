import React, { useState } from 'react';

const ExportDataPage = () => {
    const [module, setModule] = useState('contacts');
    const [format, setFormat] = useState('csv');
    const [selectedColumns, setSelectedColumns] = useState([]);

    const modules = [
        { id: 'contacts', label: 'Contacts', count: 1240 },
        { id: 'leads', label: 'Leads', count: 853 },
        { id: 'projects', label: 'Projects', count: 12 },
        { id: 'inventory', label: 'Inventory', count: 450 },
        { id: 'companies', label: 'Companies', count: 86 },
        { id: 'property-sizes', label: 'Property Sizes', count: 48 }
    ];

    const allFields = {
        contacts: ['Full Name', 'Email', 'Phone', 'Company', 'Designation', 'City', 'State', 'Source', 'Owner', 'Created Date', 'Last Activity'],
        leads: ['Lead Name', 'Phone', 'Email', 'Status', 'Stage', 'Budget Range', 'Preferred Location', 'Agent', 'Source', 'Notes'],
        projects: ['Project Name', 'Location', 'City', 'Builder', 'Construction Status', 'Launch Date', 'Total Units', 'Available Units'],
        inventory: ['Unit No', 'Floor', 'Block', 'Size', 'Facing', 'Price', 'Status', 'Project Name', 'Booking Date'],
        companies: ['Company Name', 'Industry', 'Website', 'Phone', 'City', 'Account Manager', 'Annual Revenue'],
        'property-sizes': ['Project', 'Block', 'Category', 'Sub Category', 'Size Name', 'Total Area', 'Metric', 'Dimensions']
    };

    // Initialize selected columns when module changes
    React.useEffect(() => {
        setSelectedColumns(allFields[module]);
    }, [module]);

    const toggleColumn = (col) => {
        if (selectedColumns.includes(col)) {
            setSelectedColumns(selectedColumns.filter(c => c !== col));
        } else {
            setSelectedColumns([...selectedColumns, col]);
        }
    };

    const handleSelectAll = () => setSelectedColumns(allFields[module]);
    const handleUnselectAll = () => setSelectedColumns([]);

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
                                {modules.map(mod => (
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
                                        <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px', color: '#64748b' }}>{mod.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Format Selection */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>2. Export Format</h3>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {['csv', 'xlsx', 'json'].map(fmt => (
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
                                {allFields[module].map(field => (
                                    <div
                                        key={field}
                                        onClick={() => toggleColumn(field)}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            cursor: 'pointer', fontSize: '0.9rem',
                                            background: selectedColumns.includes(field) ? '#f0f9ff' : '#fff'
                                        }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '4px', border: '1px solid #cbd5e1',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: selectedColumns.includes(field) ? 'var(--primary-color)' : '#fff',
                                            borderColor: selectedColumns.includes(field) ? 'var(--primary-color)' : '#cbd5e1'
                                        }}>
                                            {selectedColumns.includes(field) && <i className="fas fa-check" style={{ color: '#fff', fontSize: '0.7rem' }}></i>}
                                        </div>
                                        <span style={{ color: selectedColumns.includes(field) ? '#1e293b' : '#64748b' }}>{field}</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b' }}>Summary</h4>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Estimated File Size: <strong style={{ color: '#1e293b' }}>~2.4 MB</strong></span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
                                    You are exporting <strong>{modules.find(m => m.id === module)?.count}</strong> records from the <strong>{modules.find(m => m.id === module)?.label}</strong> module.
                                    The export will contain <strong>{selectedColumns.length}</strong> columns.
                                </p>
                            </div>
                        </div>

                        <button
                            className="btn-primary"
                            style={{
                                padding: '16px', borderRadius: '8px', fontWeight: 700, fontSize: '1rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                            }}
                        >
                            <i className="fas fa-file-export"></i> Export {modules.find(m => m.id === module)?.label}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ExportDataPage;
