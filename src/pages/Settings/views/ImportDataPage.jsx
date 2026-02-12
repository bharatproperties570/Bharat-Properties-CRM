import React, { useState, useRef } from 'react';
import { MODULE_CONFIG, parseCSV } from '../../../utils/dataManagementUtils';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';

const ImportDataPage = () => {
    const [step, setStep] = useState(1);
    const [module, setModule] = useState('contacts'); // Default module
    const [file, setFile] = useState(null);
    const [fileData, setFileData] = useState({ headers: [], data: [] });
    const [mapping, setMapping] = useState({});
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);

    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // --- Handlers ---

    const handleFileDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        processFile(droppedFile);
    };

    const handleFileInputChange = (e) => {
        const selectedFile = e.target.files[0];
        processFile(selectedFile);
    };

    const processFile = async (selectedFile) => {
        if (selectedFile && (selectedFile.name.endsWith('.csv'))) {
            setFile(selectedFile);
            setDuplicates([]);
            try {
                const parsed = await parseCSV(selectedFile);
                setFileData(parsed);
                // Auto-map if headers match exact field keys or labels
                const initialMapping = {};
                const moduleFields = MODULE_CONFIG[module].fields;

                parsed.headers.forEach(header => {
                    const match = moduleFields.find(f =>
                        f.key.toLowerCase() === header.toLowerCase() ||
                        f.label.toLowerCase() === header.toLowerCase()
                    );
                    if (match) {
                        initialMapping[match.key] = header;
                    }
                });
                setMapping(initialMapping);
                toast.success(`File parsed: ${parsed.data.length} rows found`);
            } catch (err) {
                toast.error('Error parsing CSV file');
                console.error(err);
                setFile(null);
            }
        } else {
            toast.error('Please upload a valid CSV file.');
        }
    };

    const generateSampleCSV = () => {
        const fields = MODULE_CONFIG[module].fields;
        const headers = fields.map(f => f.label);
        const csvContent = headers.join(',');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${module}_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [duplicates, setDuplicates] = useState([]);

    const checkDuplicates = async () => {
        if (!fileData.data.length || Object.keys(mapping).length === 0) return;

        setCheckingDuplicates(true);
        try {
            const transformedData = fileData.data.map(row => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                return item;
            });

            let endpoint = `/${module}/check-duplicates`;
            let payload = {};

            if (module === 'contacts' || module === 'leads') {
                payload.mobiles = transformedData.map(d => d.mobile).filter(Boolean);
            } else if (module === 'users') {
                payload.emails = transformedData.map(d => d.email).filter(Boolean);
            } else if (module === 'companies') {
                payload.names = transformedData.map(d => d.name).filter(Boolean);
            } else if (module === 'projects') {
                payload.names = transformedData.map(d => d.name).filter(Boolean);
            } else if (module === 'sizes') {
                payload.values = transformedData.map(d => d.label || d.value || d.lookup_value).filter(Boolean);
                payload.lookup_type = 'size';
            } else if (module === 'inventory') {
                payload.items = transformedData.map(d => ({ unitNo: d.unitNo, projectId: d.projectId }));
            } else {
                return toast.error('Duplicate check not supported for this module');
            }

            const res = await api.post(endpoint, payload);
            if (res.data.success) {
                setDuplicates(res.data.duplicates || []);
                if (res.data.duplicates?.length > 0) {
                    toast.error(`${res.data.duplicates.length} duplicate records found!`);
                } else {
                    toast.success('No duplicates found in the backend.');
                }
            }
        } catch (err) {
            console.error('Check Duplicate Error:', err);
            toast.error('Failed to check for duplicates');
        } finally {
            setCheckingDuplicates(false);
        }
    };

    const handleImport = async (skipDuplicates = false) => {
        if (!fileData.data.length || Object.keys(mapping).length === 0) {
            return toast.error('No data or mapping provided');
        }

        setImporting(true);
        setProgress(0);

        try {
            // Transform data based on mapping
            const transformedData = fileData.data.map(row => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                return item;
            });

            // Determine endpoint
            let endpoint = `/${module}/import`;
            let payload = { data: transformedData };

            // Special case for sizes
            if (module === 'sizes') {
                endpoint = '/lookups/import';
                payload.lookup_type = 'size';
            }

            // Artificial delay for better UX (so progress is seen)
            setProgress(20);
            await new Promise(r => setTimeout(r, 500));
            setProgress(50);

            const response = await api.post(endpoint, payload);

            if (response.data.success) {
                const { successCount, errorCount } = response.data;
                toast.success(`Import completed: ${successCount} success, ${errorCount} failed`);
                setProgress(100);
                setStep(5);
            } else {
                toast.error(response.data.message || 'Import failed');
            }
        } catch (err) {
            console.error('Import Error:', err);
            toast.error(err.response?.data?.message || err.message || 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const mapColumn = (systemField, fileHeader) => {
        setMapping(prev => ({
            ...prev,
            [systemField]: fileHeader
        }));
    };

    // --- Renderers ---

    const Stepper = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px 40px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '15px', left: '60px', right: '60px', height: '2px', background: '#e2e8f0', zIndex: 0 }}>
                <div style={{ height: '100%', width: `${((step - 1) / 4) * 100}%`, background: 'var(--primary-color)', transition: 'width 0.3s' }}></div>
            </div>
            {['Select', 'Upload', 'Map', 'Preview', 'Finish'].map((label, i) => {
                const s = i + 1;
                return (
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
                            {label}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
            <div style={{ padding: '32px 40px 0' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Import Data Wizard</h2>
                <p style={{ color: '#64748b', marginBottom: '32px' }}>Bulk import data from CSV files into {MODULE_CONFIG[module]?.label || 'CRM'}.</p>
                <Stepper />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                {/* Step 1: Select Module */}
                {step === 1 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>Select Data Module</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                            {Object.values(MODULE_CONFIG).map(mod => (
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

                {/* Step 2: Upload */}
                {step === 2 && (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Upload File for {MODULE_CONFIG[module].label}</h3>
                        <div
                            onDrop={handleFileDrop}
                            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                            onClick={() => fileInputRef.current.click()}
                            style={{
                                border: isDragging ? '2px dashed var(--primary-color)' : '2px dashed #cbd5e1',
                                borderRadius: '12px',
                                background: isDragging ? '#eff6ff' : '#f8fafc',
                                padding: '60px 40px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                marginBottom: '24px'
                            }}
                        >
                            <i className="fas fa-cloud-upload-alt" style={{ fontSize: '3rem', color: isDragging ? 'var(--primary-color)' : '#94a3b8', marginBottom: '16px' }}></i>
                            <h4 style={{ margin: '0 0 8px', color: '#1e293b' }}>{file ? file.name : (isDragging ? 'Drop file to upload' : 'Drag & Drop CSV here')}</h4>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>or <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>browse files</span></p>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileInputChange}
                                style={{ display: 'none' }}
                                accept=".csv"
                            />
                        </div>

                        <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <i className="fas fa-file-csv" style={{ fontSize: '1.5rem', color: '#2563eb' }}></i>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Need a sample?</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Download template for {MODULE_CONFIG[module].label}</div>
                                </div>
                            </div>
                            <button
                                onClick={generateSampleCSV}
                                style={{ background: '#fff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <i className="fas fa-download" style={{ marginRight: '8px' }}></i> Download
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Map Columns */}
                {step === 3 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Map Columns</h3>
                        <p style={{ color: '#64748b', marginBottom: '24px' }}>Match your file columns to the {MODULE_CONFIG[module].label} fields.</p>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>
                                <div>System Field</div>
                                <div>Your File Header</div>
                                <div>Sample Data (Row 1)</div>
                            </div>
                            {MODULE_CONFIG[module].fields.map((field) => (
                                <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.9rem' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                    </div>
                                    <div>
                                        <select
                                            value={mapping[field.key] || ''}
                                            onChange={(e) => mapColumn(field.key, e.target.value)}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        >
                                            <option value="">-- Unmapped --</option>
                                            {fileData.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ color: '#64748b', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {mapping[field.key] && fileData.data.length > 0
                                            ? fileData.data[0][mapping[field.key]]
                                            : '-'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 4: Preview & Confirm */}
                {step === 4 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
                        {importing ? (
                            <div style={{ padding: '60px 0' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Importing Records...</h3>
                                <div style={{ height: '8px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-color)', transition: 'width 0.1s' }}></div>
                                </div>
                                <p style={{ color: '#64748b' }}>Processing {Math.round((progress / 100) * fileData.data.length)} of {fileData.data.length} records</p>
                            </div>
                        ) : (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Ready to Import</h3>

                                {duplicates.length > 0 ? (
                                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '24px', marginBottom: '32px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', color: '#ea580c' }}>
                                            <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem' }}></i>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Duplicates Detected</div>
                                        </div>
                                        <p style={{ color: '#9a3412', fontSize: '0.95rem', marginBottom: '16px', textAlign: 'left' }}>
                                            We found <strong>{duplicates.length}</strong> records that already exist in the database.
                                            If you proceed, these duplicates might be skipped or cause errors depending on the module.
                                        </p>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                                            <button
                                                onClick={() => setStep(3)}
                                                className="btn-outline"
                                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                            >
                                                Fix Mapping
                                            </button>
                                            <button
                                                onClick={() => { setFile(null); setStep(2); }}
                                                className="btn-outline"
                                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                            >
                                                Upload New File
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '24px', marginBottom: '32px' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#16a34a', marginBottom: '4px' }}>{fileData.data.length}</div>
                                        <div style={{ color: '#15803d', fontWeight: 600 }}>Records ready to be created</div>

                                        {!checkingDuplicates && duplicates.length === 0 && (
                                            <button
                                                onClick={checkDuplicates}
                                                style={{ marginTop: '16px', background: '#fff', border: '1px solid #bbf7d0', color: '#16a34a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                <i className="fas fa-search" style={{ marginRight: '6px' }}></i> Check for Duplicates
                                            </button>
                                        )}
                                        {checkingDuplicates && (
                                            <div style={{ marginTop: '16px', color: '#16a34a', fontSize: '0.85rem' }}>
                                                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Checking backend...
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ textAlign: 'left', background: '#f8fafc', padding: '20px', borderRadius: '8px', fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>
                                    <div style={{ marginBottom: '8px' }}>• Module: <strong>{MODULE_CONFIG[module].label}</strong></div>
                                    <div style={{ marginBottom: '8px' }}>• File: <strong>{file?.name}</strong></div>
                                    <div>• Mapped Fields: <strong>{Object.keys(mapping).length} / {MODULE_CONFIG[module].fields.length}</strong></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 5: Success */}
                {step === 5 && (
                    <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ width: '80px', height: '80px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px' }}>
                            <i className="fas fa-check"></i>
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Import Successful!</h2>
                        <p style={{ color: '#64748b', marginBottom: '32px' }}>{fileData.data.length} records have been successfully imported into the {MODULE_CONFIG[module].label} module.</p>
                        <button
                            onClick={() => {
                                setStep(1);
                                setFile(null);
                                setFileData({ headers: [], data: [] });
                                setMapping({});
                                setDuplicates([]);
                            }}
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
                            if (step === 2 && !file) return toast.error('Please upload a file');
                            if (step === 4) handleImport();
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
