import React, { useState, useEffect } from 'react';
import { MODULE_CONFIG, parseCSV } from '../../../utils/dataManagementUtils';
import toast from 'react-hot-toast';

const BulkUpdatePage = () => {
    const [module, setModule] = useState('inventory'); // Default to inventory for this use case
    const [updateMode, setUpdateMode] = useState('condition'); // 'condition' | 'file'

    // Condition Mode State
    const [filters, setFilters] = useState([{ field: '', operator: 'is', value: '' }]);
    const [updateField, setUpdateField] = useState('');
    const [newValue, setNewValue] = useState('');

    // File Mode State
    const [file, setFile] = useState(null);
    const [csvData, setCsvData] = useState([]);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [columnMapping, setColumnMapping] = useState({});

    // Multi-select Match Keys
    const [matchKeys, setMatchKeys] = useState([]);
    const [matchedCount, setMatchedCount] = useState(0);
    const [contactsToCreate, setContactsToCreate] = useState(0);
    const [contactsToUpdate, setContactsToUpdate] = useState(0);

    // Simulation State
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationComplete, setSimulationComplete] = useState(false);
    const [affectedCount, setAffectedCount] = useState(0);

    const activeConfig = MODULE_CONFIG[module];
    const availableFields = activeConfig ? activeConfig.fields : [];

    // Reset when module changes
    useEffect(() => {
        if (activeConfig) {
            setFilters([{ field: availableFields[0]?.key || '', operator: 'is', value: '' }]);
            setUpdateField(availableFields[0]?.key || '');
            setAffectedCount(activeConfig.data.length);
            // Reset file state
            setFile(null);
            setCsvData([]);
            setCsvHeaders([]);
            setColumnMapping({});
            setMatchKeys([]);
            setMatchedCount(0);
            setContactsToCreate(0);
            setContactsToUpdate(0);
        }
    }, [module]);

    // Calculate affected records for Condition Mode
    useEffect(() => {
        if (!activeConfig || updateMode === 'file') return;

        const count = activeConfig.data.filter(item => {
            return filters.every(filter => {
                if (!filter.field || !filter.value) return true;
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
    }, [filters, activeConfig, updateMode]);

    // Handle File Upload and Parse
    const handleFileUpload = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        try {
            const { headers, data } = await parseCSV(selectedFile);
            setFile(selectedFile);
            setCsvHeaders(headers);
            setCsvData(data);

            // Auto-map columns if names match
            const initialMapping = {};
            headers.forEach(header => {
                const match = availableFields.find(f => f.label.toLowerCase() === header.toLowerCase() || f.key.toLowerCase() === header.toLowerCase());
                if (match) initialMapping[header] = match.key;
            });
            setColumnMapping(initialMapping);
            toast.success(`Loaded ${data.length} rows from ${selectedFile.name}`);
        } catch (error) {
            toast.error('Error parsing CSV file');
            console.error(error);
        }
    };

    // Calculate Matched Records & Contact Sync for File Mode
    useEffect(() => {
        if (updateMode !== 'file' || matchKeys.length === 0 || !activeConfig || csvData.length === 0) {
            setMatchedCount(0);
            setContactsToCreate(0);
            setContactsToUpdate(0);
            return;
        }

        let matches = 0;
        let newContacts = 0;
        let existingContacts = 0;

        csvData.forEach(row => {
            // 1. Inventory Matching Logic (Composite Key)
            // All selected matchKeys must match
            const isMatch = activeConfig.data.some(systemItem => {
                return matchKeys.every(key => {
                    // Find CSV header mapped to this system key
                    const mappedHeader = Object.keys(columnMapping).find(h => columnMapping[h] === key);
                    if (!mappedHeader) return false; // Key not mapped, cannot match

                    const csvVal = String(row[mappedHeader] || '').trim().toLowerCase();
                    const sysVal = String(systemItem[key] || '').trim().toLowerCase();
                    return csvVal === sysVal;
                });
            });

            if (isMatch) {
                matches++;

                // 2. Contact Sync Logic (Only if Owner details are present)
                // Check if Owner Name/Phone/Email is mapped
                const ownerNameHeader = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerName');
                const ownerPhoneHeader = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerPhone'); // assuming strict key
                const ownerEmailHeader = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerEmail');

                if (ownerNameHeader) {
                    const csvPhone = ownerPhoneHeader ? String(row[ownerPhoneHeader] || '').trim() : '';
                    const csvEmail = ownerEmailHeader ? String(row[ownerEmailHeader] || '').trim() : '';

                    // Simple logic: If Phone or Email exists in dummy contact DB, it's an Update. Else Create.
                    // Accessing GLOBAL contacts (mock) - practically we'd need to import it or pass it down.
                    // For UI simulation, we'll assume we check against MODULE_CONFIG.contacts.data
                    const existingContact = MODULE_CONFIG.contacts.data.find(c =>
                        (csvPhone && c.mobile === csvPhone) || (csvEmail && c.email === csvEmail)
                    );

                    if (existingContact) {
                        existingContacts++;
                    } else if (csvPhone || csvEmail) {
                        newContacts++;
                    }
                }
            }
        });

        setMatchedCount(matches);
        setContactsToCreate(newContacts);
        setContactsToUpdate(existingContacts);
        setAffectedCount(matches);

    }, [matchKeys, columnMapping, csvData, activeConfig, updateMode]);

    const handleReview = () => {
        if (updateMode === 'condition') {
            if (!updateField || !newValue) return toast.error('Please select a field to update and a new value.');
            if (affectedCount === 0) return toast.error('No records match your filters.');
        } else {
            if (!file) return toast.error('Please upload a CSV file.');
            if (matchKeys.length === 0) return toast.error('Please select at least one field to match records.');
            if (matchedCount === 0) return toast.error('No inventory records matched based on your selection.');
        }

        setIsSimulating(true);
        setTimeout(() => {
            setIsSimulating(false);
            setSimulationComplete(true);
        }, 1500);
    };

    const handleMatchKeyToggle = (key) => {
        if (matchKeys.includes(key)) {
            setMatchKeys(matchKeys.filter(k => k !== key));
        } else {
            setMatchKeys([...matchKeys, key]);
        }
    };

    const handleConditionAddFilter = () => {
        setFilters([...filters, { field: availableFields[0]?.key || '', operator: 'is', value: '' }]);
    };

    const handleConditionRemoveFilter = (idx) => {
        setFilters(filters.filter((_, i) => i !== idx));
    };

    const handleConditionChange = (idx, key, val) => {
        const newFilters = [...filters];
        newFilters[idx][key] = val;
        setFilters(newFilters);
    };

    if (simulationComplete) {
        return (
            <div style={{ flex: 1, padding: '40px', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '80px', height: '80px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '24px' }}>
                    <i className="fas fa-check-double"></i>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Update Job Scheduled!</h2>
                <div style={{ textAlign: 'center', maxWidth: '500px', marginBottom: '32px', color: '#64748b' }}>
                    <p style={{ marginBottom: '12px' }}>Bulk update job has been queued.</p>
                    {updateMode === 'condition' ? (
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <strong>{affectedCount}</strong> records will be updated to <strong>{availableFields.find(f => f.key === updateField)?.label} = {newValue}</strong>.
                        </div>
                    ) : (
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Inventory Matched:</span>
                                <strong>{matchedCount}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                                <span>Contacts to Create:</span>
                                <strong style={{ color: '#16a34a' }}>{contactsToCreate}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                                <span>Contacts to Update:</span>
                                <strong style={{ color: '#f59e0b' }}>{contactsToUpdate}</strong>
                            </div>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => { setSimulationComplete(false); setUpdateField(''); setNewValue(''); setFile(null); setCsvData([]); setMatchKeys([]); setMatchedCount(0); setContactsToCreate(0); setContactsToUpdate(0); }}
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
                <p style={{ color: '#64748b', marginBottom: '32px' }}>Mass update records via filters or file upload.</p>

                {/* Method Toggle */}
                <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', marginBottom: '24px' }}>
                    <button
                        onClick={() => setUpdateMode('condition')}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: updateMode === 'condition' ? '#fff' : 'transparent', boxShadow: updateMode === 'condition' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, color: updateMode === 'condition' ? '#0f172a' : '#64748b', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        Conditional Update
                    </button>
                    <button
                        onClick={() => setUpdateMode('file')}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: updateMode === 'file' ? '#fff' : 'transparent', boxShadow: updateMode === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, color: updateMode === 'file' ? '#0f172a' : '#64748b', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        Update via CSV
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                <div style={{ maxWidth: '800px' }}>

                    {/* Step 1: Module Selection (Common) */}
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

                    {updateMode === 'condition' ? (
                        <>
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
                                            onChange={(e) => handleConditionChange(idx, 'field', e.target.value)}
                                            style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        >
                                            {availableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                        </select>
                                        <select
                                            value={filter.operator}
                                            onChange={(e) => handleConditionChange(idx, 'operator', e.target.value)}
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
                                            onChange={(e) => handleConditionChange(idx, 'value', e.target.value)}
                                            placeholder="Value..."
                                            style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        />
                                        {filters.length > 1 && (
                                            <button onClick={() => handleConditionRemoveFilter(idx)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={handleConditionAddFilter} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
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
                        </>
                    ) : (
                        <>
                            {/* Step 2: Upload File */}
                            <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ background: '#e0f2fe', color: '#0284c7', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>2</span>
                                    Upload Update File
                                </h3>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '40px', textAlign: 'center', background: '#f8fafc', cursor: 'pointer', position: 'relative' }}>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileUpload}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                    />
                                    <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '12px' }}></i>
                                    <div style={{ color: '#475569', fontWeight: 600 }}>
                                        {file ? file.name : 'Click to upload CSV'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                                        Make sure your file contains a unique identifier (e.g. ID, Email, Unit No)
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Map Columns & Key */}
                            {csvHeaders.length > 0 && (
                                <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ background: '#e0f2fe', color: '#0284c7', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>3</span>
                                        Match and Map
                                    </h3>

                                    <div style={{ marginBottom: '24px', padding: '16px', background: '#fff7ed', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#9a3412', marginBottom: '8px' }}>
                                            Select Matching Fields (Composite Key)
                                        </label>
                                        <p style={{ fontSize: '0.8rem', color: '#c2410c', marginBottom: '12px' }}>
                                            Select combination of fields to uniquely identify records (e.g. Project + Block + Unit Number).
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {availableFields.map(f => (
                                                <button
                                                    key={f.key}
                                                    onClick={() => handleMatchKeyToggle(f.key)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '20px',
                                                        border: matchKeys.includes(f.key) ? '1px solid #c2410c' : '1px solid #fdba74',
                                                        background: matchKeys.includes(f.key) ? '#ffedd5' : '#fff',
                                                        color: matchKeys.includes(f.key) ? '#9a3412' : '#c2410c',
                                                        fontSize: '0.8rem',
                                                        fontWeight: matchKeys.includes(f.key) ? 700 : 500,
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {matchKeys.includes(f.key) && <i className="fas fa-check"></i>}
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>Map CSV Columns to fields to update</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                        {csvHeaders.map(header => (
                                            <div key={header} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>CSV Column: {header}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <i className="fas fa-arrow-right" style={{ color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                                                    <select
                                                        value={columnMapping[header] || ''}
                                                        onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                                                        style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                    >
                                                        <option value="">Do not import</option>
                                                        {availableFields.map(f => (
                                                            <option key={f.key} value={f.key}>{f.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Action Area */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Ready to Update</div>
                            <div style={{ fontSize: '0.9rem', color: '#15803d' }}>
                                {updateMode === 'condition' ? (
                                    <>Based on your filters, <strong>{affectedCount} records</strong> will be updated.</>
                                ) : (
                                    <><strong>{matchedCount} records</strong> matched from your file will be updated.</>
                                )}
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
