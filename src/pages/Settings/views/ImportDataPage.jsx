import React, { useState } from 'react';

const ImportDataPage = () => {
    const [step, setStep] = useState(1);
    const [module, setModule] = useState('contacts');
    const [file, setFile] = useState(null);
    const [mapping, setMapping] = useState({});
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);

    const modules = [
        { id: 'contacts', label: 'Contacts', icon: 'fa-address-book', description: 'Import client contact details' },
        { id: 'leads', label: 'Leads', icon: 'fa-filter', description: 'Import sales leads and prospects' },
        { id: 'projects', label: 'Projects', icon: 'fa-building', description: 'Import construction projects' },
        { id: 'inventory', label: 'Inventory (Properties)', icon: 'fa-home', description: 'Import property units/inventory' },
        { id: 'companies', label: 'Companies', icon: 'fa-building', description: 'Import partner/client companies' },
        { id: 'property-sizes', label: 'Property Sizes', icon: 'fa-ruler-combined', description: 'Import size configurations (Plots/Flats)' }
    ];

    const sampleFields = {
        contacts: ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Designation'],
        leads: ['Name', 'Phone', 'Source', 'Budget', 'Preference', 'Status'],
        projects: ['Project Name', 'Location', 'City', 'Builder', 'Status', 'Launch Date'],
        inventory: ['Unit No', 'Floor', 'Size', 'Price', 'Status', 'Project Name'],
        companies: ['Company Name', 'Industry', 'Website', 'Phone', 'City'],
        'property-sizes': ['Project', 'Block', 'Category', 'Size Name', 'Total Area', 'Metric']
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.xlsx'))) {
            setFile(droppedFile);
        } else {
            alert('Please upload a valid CSV or Excel file.');
        }
    };

    const handleSimulation = () => {
        setImporting(true);
        let currentProgress = 0;
        const interval = setInterval(() => {
            currentProgress += 5;
            setProgress(currentProgress);
            if (currentProgress >= 100) {
                clearInterval(interval);
                setImporting(false);
                setStep(5);
            }
        }, 100);
    };

    const Stepper = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px 40px', position: 'relative' }}>
            {/* Connector Line */}
            <div style={{ position: 'absolute', top: '15px', left: '60px', right: '60px', height: '2px', background: '#e2e8f0', zIndex: 0 }}>
                <div style={{ height: '100%', width: `${((step - 1) / 4) * 100}%`, background: 'var(--primary-color)', transition: 'width 0.3s' }}></div>
            </div>
            {[1, 2, 3, 4, 5].map((s) => (
                <div key={s} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: s <= step ? 'var(--primary-color)' : '#fff',
                        border: s <= step ? 'none' : '2px solid #cbd5e1',
                        color: s <= step ? '#fff' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.9rem',
                        transition: 'all 0.3s'
                    }}>
                        {s < step ? <i className="fas fa-check"></i> : s}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: s <= step ? '#1e293b' : '#94a3b8' }}>
                        {['Select', 'Upload', 'Map', 'Preview', 'Finish'][s - 1]}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
            <div style={{ padding: '32px 40px 0' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Import Data Wizard</h2>
                <p style={{ color: '#64748b', marginBottom: '32px' }}>Bulk import data from CSV or Excel files into your CRM.</p>
                <Stepper />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                {step === 1 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>Select Data Module</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                            {modules.map(mod => (
                                <div
                                    key={mod.id}
                                    onClick={() => setModule(mod.id)}
                                    style={{
                                        border: module === mod.id ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                        background: module === mod.id ? '#eff6ff' : '#fff',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                                    }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '12px',
                                        background: module === mod.id ? 'var(--primary-color)' : '#f1f5f9',
                                        color: module === mod.id ? '#fff' : '#64748b',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.5rem', marginBottom: '16px'
                                    }}>
                                        <i className={`fas ${mod.icon}`}></i>
                                    </div>
                                    <h4 style={{ margin: '0 0 8px', color: '#1e293b' }}>{mod.label}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{mod.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Upload File</h3>
                        <div
                            onDrop={handleFileDrop}
                            onDragOver={(e) => e.preventDefault()}
                            style={{
                                border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc',
                                padding: '60px 40px', textAlign: 'center', cursor: 'pointer',
                                transition: 'all 0.2s', marginBottom: '24px'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                            onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                        >
                            <i className="fas fa-cloud-upload-alt" style={{ fontSize: '3rem', color: '#94a3b8', marginBottom: '16px' }}></i>
                            <h4 style={{ margin: '0 0 8px', color: '#1e293b' }}>{file ? file.name : 'Drag & Drop file here'}</h4>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>or <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>browse files</span> from your computer</p>
                            <input type="file" onChange={(e) => setFile(e.target.files[0])} style={{ display: 'none' }} />
                        </div>

                        <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <i className="fas fa-file-csv" style={{ fontSize: '1.5rem', color: '#2563eb' }}></i>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Need a sample?</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Download the template for {modules.find(m => m.id === module)?.label}</div>
                                </div>
                            </div>
                            <button style={{ background: '#fff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                <i className="fas fa-download" style={{ marginRight: '8px' }}></i> Download
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Map Columns</h3>
                        <p style={{ color: '#64748b', marginBottom: '24px' }}>Match your file columns to the system fields.</p>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>
                                <div>System Field</div>
                                <div>Your File Header</div>
                                <div>Sample Data</div>
                            </div>
                            {sampleFields[module].map((field, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{field} <span style={{ color: '#ef4444' }}>*</span></div>
                                    <div>
                                        <select style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                            <option>{field}</option>
                                            <option>Unmapped</option>
                                        </select>
                                    </div>
                                    <div style={{ color: '#64748b', fontStyle: 'italic' }}>Sample Value {idx + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                        {importing ? (
                            <div style={{ padding: '60px 0' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Importing Records...</h3>
                                <div style={{ height: '8px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-color)', transition: 'width 0.1s' }}></div>
                                </div>
                                <p style={{ color: '#64748b' }}>Processing {Math.round((progress / 100) * 150)} of 150 updated records</p>
                            </div>
                        ) : (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Ready to Import</h3>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '24px', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#16a34a', marginBottom: '4px' }}>150</div>
                                    <div style={{ color: '#15803d', fontWeight: 600 }}>Records ready to be created</div>
                                </div>
                                <div style={{ textAlign: 'left', background: '#f8fafc', padding: '20px', borderRadius: '8px', fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>
                                    <div style={{ marginBottom: '8px' }}>• Module: <strong>{modules.find(m => m.id === module)?.label}</strong></div>
                                    <div style={{ marginBottom: '8px' }}>• File: <strong>{file?.name}</strong></div>
                                    <div>• Mapped Fields: <strong>{sampleFields[module].length}</strong></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 5 && (
                    <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ width: '80px', height: '80px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px' }}>
                            <i className="fas fa-check"></i>
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Import Successful!</h2>
                        <p style={{ color: '#64748b', marginBottom: '32px' }}>150 records have been successfully imported into the {modules.find(m => m.id === module)?.label} module.</p>
                        <button
                            onClick={() => { setStep(1); setFile(null); }}
                            className="btn-outline"
                            style={{ padding: '12px 32px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            Import More Data
                        </button>
                    </div>
                )}
            </div>

            {/* Footer Navigation */}
            {step < 5 && !importing && (
                <div style={{ padding: '20px 40px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fff' }}>
                    {step > 1 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            className="btn-outline"
                            style={{ padding: '10px 24px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            Back
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (step === 2 && !file) return alert('Please upload a file');
                            if (step === 4) handleSimulation();
                            else setStep(step + 1);
                        }}
                        className="btn-primary"
                        style={{ padding: '10px 32px', borderRadius: '6px', fontWeight: 700 }}
                    >
                        {step === 4 ? 'Start Import' : 'Next Step'} <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ImportDataPage;
