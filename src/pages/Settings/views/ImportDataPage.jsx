import { useState, useRef, useEffect } from 'react';
import { MODULE_CONFIG, parseCSV, generateErrorReportCSV, generateSuccessReportCSV, downloadFile } from '../../../utils/dataManagementUtils';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { useUserContext } from '../../../context/UserContext';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';

const ImportDataPage = () => {
    const { projects, refreshSizes } = usePropertyConfig();
    const { users, teams, refreshData } = useUserContext();
    const [step, setStep] = useState(1);
    const [module, setModule] = useState('contacts'); // Default module
    const [file, setFile] = useState(null);
    const [fileData, setFileData] = useState({ headers: [], data: [] });
    const [mapping, setMapping] = useState({});
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [importErrors, setImportErrors] = useState([]);
    const [importSuccessLogs, setImportSuccessLogs] = useState([]);
    const [activeReportTab, setActiveReportTab] = useState('success'); // 'success' or 'error'
    const [importStats, setImportStats] = useState({ success: 0, failed: 0 });
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [duplicates, setDuplicates] = useState([]);
    const [importSummary, setImportSummary] = useState({ newItems: 0, updateItems: 0 });
    const [updateDuplicates, setUpdateDuplicates] = useState(true);
    const [selectedTeams, setSelectedTeams] = useState([]);

    // Enterprise Conflict Management States
    const [conflicts, setConflicts] = useState([]);
    const [plannedUpdates, setPlannedUpdates] = useState([]);
    const [resolutions, setResolutions] = useState({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Global Defaults for Assignment


    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // Size-specific context
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedBlock, setSelectedBlock] = useState('');
    const [blocks, setBlocks] = useState([]);

    const handleProjectChange = (projectId) => {
        console.log("[ImportData] Project selected:", projectId);
        setSelectedProject(projectId);
        setSelectedBlock('');
        const project = projects.find(p => p._id === projectId || p.id === projectId);
        if (project) {
            console.log("[ImportData] Found project, blocks count:", project.blocks?.length || 0);
            setBlocks(project.blocks || []);
        } else {
            console.warn("[ImportData] Project not found in list for ID:", projectId);
            setBlocks([]);
        }
    };

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
                    const normalizedHeader = header.toLowerCase().trim();
                    const match = moduleFields.find(f => {
                        const normalizedKey = f.key.toLowerCase();
                        const normalizedLabel = f.label.toLowerCase();

                        return normalizedKey === normalizedHeader ||
                            normalizedLabel === normalizedHeader ||
                            (f.key === 'direction' && (normalizedHeader === 'orientation' || normalizedHeader === 'direction')) ||
                            (f.key === 'facing' && (normalizedHeader === 'facing' || normalizedHeader === 'facings')) ||
                            (f.key === 'latitude' && (normalizedHeader === 'latitude' || normalizedHeader === 'lat')) ||
                            (f.key === 'longitude' && (normalizedHeader === 'longitude' || normalizedHeader === 'lng'));
                    });
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
        const sampleRow = fields.map(f => f.sample || '');
        
        const csvContent = [
            headers.join(','),
            sampleRow.join(',')
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${module}_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const checkDuplicates = async () => {
        setCheckingDuplicates(true);
        setImportSummary({ newItems: 0, updateItems: 0 });
        try {
            const transformedData = fileData.data.map(row => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                // Inject metadata for sizes and inventory
                if (module === 'sizes' || module === 'inventory') {
                    const projectObj = projects.find(p => p._id === selectedProject);
                    item.projectId = selectedProject;
                    item.projectName = projectObj ? projectObj.name : '';
                    item.block = selectedBlock;
                }
                return item;
            });

            let endpoint = `/lookups/check-duplicates`;
            let payload = {
                lookup_type: module === 'sizes' ? 'size' : module,
                values: []
            };

            if (module === 'sizes') {
                const projectObj = projects.find(p => p._id === selectedProject);
                payload.values = transformedData.map(d => ({
                    lookup_value: d.sizeLabel || d.lookup_value || d.label,
                    project: projectObj ? projectObj.name : '',
                    block: selectedBlock,
                    category: d.category,
                    subCategory: d.subCategory,
                    unitType: d.unitType
                }));
            } else if (module === 'inventory') {
                endpoint = `/inventory/check-duplicates`;
                payload = {
                    items: transformedData.map(d => ({
                        unitNo: d.unitNo || d.unitNumber,
                        projectId: selectedProject,
                        projectName: d.projectName,
                        block: selectedBlock
                    }))
                };
            } else if (module === 'contacts' || module === 'leads') {
                endpoint = `/${module}/check-duplicates`;
                payload = { mobiles: transformedData.map(d => d.mobile).filter(Boolean) };
            } else if (module === 'users') {
                endpoint = `/${module}/check-duplicates`;
                payload = { emails: transformedData.map(d => d.email).filter(Boolean) };
            } else if (module === 'companies' || module === 'projects') {
                endpoint = `/${module}/check-duplicates`;
                payload = { names: transformedData.map(d => d.name).filter(Boolean) };
            } else {
                payload.values = transformedData.map(d => d.label || d.value || d.lookup_value).filter(Boolean);
            }

            const res = await api.post(endpoint, payload);
            if (res.data.success) {
                const duplicateList = res.data.duplicates || [];
                setDuplicates(duplicateList);

                const dupeCount = duplicateList.length;
                const totalCount = fileData.data.length;

                setImportSummary({
                    newItems: totalCount - dupeCount,
                    updateItems: dupeCount
                });

                if (dupeCount > 0) {
                    toast.error(`${dupeCount} matching records found! These will be updated.`);
                } else {
                    toast.success('All records are new. No duplicates found.');
                }
            }
        } catch (err) {
            console.error('Check Duplicate Error:', err);
            toast.error('Failed to check for duplicates');
        } finally {
            setCheckingDuplicates(false);
        }
    };

    // --- Enterprise Analysis Phase ---
    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setConflicts([]);
        try {
            const transformedData = fileData.data.map(row => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                return item;
            });

            const response = await api.post('/inventory/bulk-update-owners', {
                dryRun: true,
                data: transformedData
            });

            if (response.data.success) {
                setConflicts(response.data.conflicts || []);
                setImportSummary({
                    newItems: response.data.newCount || 0,
                    updateItems: response.data.updatedCount || response.data.successCount || 0,
                    noMobileItems: response.data.noMobileCount || 0
                });
                
                // Default resolutions
                const initialResolutions = {};
                (response.data.conflicts || []).forEach(c => {
                    initialResolutions[c.rowKey] = { [c.type]: 'KEEP_SYSTEM' };
                });
                setResolutions(initialResolutions);
                setPlannedUpdates(response.data.plannedUpdates || []);
                setDuplicates(response.data.duplicates || []); // 🚀 Store matches for transparency

                if (response.data.conflictCount > 0) {
                    toast.error(`Detected ${response.data.conflictCount} data conflicts.`);
                } else {
                    toast.success('Validation complete: No conflicts found.');
                }
            }
        } catch (error) {
            toast.error('Data validation failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleResolutionChange = (rowKey, type, action) => {
        setResolutions(prev => ({
            ...prev,
            [rowKey]: { ...prev[rowKey], [type]: action }
        }));
    };

    const handleImport = async (mode = 'ALL') => {
        if (!fileData.data.length || Object.keys(mapping).length === 0) {
            return toast.error('No data or mapping provided');
        }

        setImporting(true);
        setProgress(0);
        setImportErrors([]);
        setImportSuccessLogs([]);
        setImportStats({ success: 0, failed: 0, newCount: 0, updatedCount: 0 });

        try {
            // Transform and Filter data based on mapping and mode
            let rawTransformed = fileData.data.map((row, idx) => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                // Ensure raw row data is also available for the backend's flexible mapping
                Object.assign(item, row);
                item._rowIdx = idx; // Keep track for filtering
                return item;
            });

            // Filter data based on mode for Property Owners
            let transformedData = rawTransformed;
            if (module === 'propertyOwners' && mode !== 'ALL') {
                transformedData = rawTransformed.filter(item => {
                    const hasMobile = !!String(item.ownerMobile || '').trim();
                    const hasConflict = conflicts.some(c => c.mobile === String(item.ownerMobile || '').trim());
                    
                    if (mode === 'NEW_ONLY') return hasMobile && !hasConflict;
                    if (mode === 'UPDATE_ONLY') return hasMobile && hasConflict;
                    if (mode === 'SPECIAL_ENTRY') return !hasMobile;
                    return true;
                });
            }

            // Cleanup temp indexing
            transformedData = transformedData.map(({ _rowIdx, ...item }) => {
                if (module === 'sizes' || module === 'inventory' || module === 'propertyOwners') {
                    const projectObj = projects.find(p => p._id === selectedProject);
                    item.projectId = selectedProject;
                    item.project = projectObj ? projectObj.name : (item.project || '');
                    item.projectName = projectObj ? projectObj.name : (item.projectName || item.project || '');
                    item.block = selectedBlock || item.block || '';
                    item.module = module;
                }
                return item;
            });

            const totalRecords = transformedData.length;
            const chunkSize = 10; // Reduced for more 'live' progress updates as requested by user
            let totalSuccessCount = 0;
            let totalErrorCount = 0;
            let totalNewCount = 0;
            let totalUpdatedCount = 0;
            let aggregatedErrors = [];
            let aggregatedSuccess = [];

            // [SENIOR] Conflict Validation before Import
            if (module === 'propertyOwners') {
                const unresolved = conflicts.filter(c => !resolutions[c.rowKey]?.owner);
                if (unresolved.length > 0 && mode !== 'NEW_ONLY') {
                    setImporting(false);
                    return toast.error(`Please resolve all ${unresolved.length} conflicts before proceeding.`);
                }
            }

            // Determine endpoint
            let endpoint = `/${module}/import`;
            if (module === 'sizes') endpoint = '/lookups/import';
            else if (module === 'propertyOwners') endpoint = '/inventory/bulk-update-owners';

            // Loop through data in chunks
            for (let i = 0; i < totalRecords; i += chunkSize) {
                const chunk = transformedData.slice(i, i + chunkSize);
                
                let payload = {
                    data: chunk,
                    updateDuplicates: updateDuplicates,
                    teams: selectedTeams.length > 0 ? selectedTeams : undefined,
                    resolutions: module === 'propertyOwners' ? resolutions : undefined
                };

                if (module === 'sizes') {
                    payload.lookup_type = 'Size';
                    payload.metadata = {
                        projectName: projects.find(p => String(p._id || p.id) === String(selectedProject))?.name,
                        projectId: selectedProject,
                        block: selectedBlock,
                        module: module
                    };
                } else if (module === 'inventory') {
                    payload.projectId = selectedProject;
                    payload.metadata = {
                        projectName: projects.find(p => String(p._id || p.id) === String(selectedProject))?.name,
                        projectId: selectedProject,
                        block: selectedBlock,
                        module: module
                    };
                }

                const response = await api.post(endpoint, payload);

                if (response.data.success) {
                    const { successCount, errorCount, newCount, updatedCount, errors } = response.data;
                    
                    totalSuccessCount += (successCount || 0);
                    totalErrorCount += (errorCount || 0);
                    totalNewCount += (newCount || 0);
                    totalUpdatedCount += (updatedCount || 0);
                    if (errors) aggregatedErrors = [...aggregatedErrors, ...errors];
                    if (response.data.successLogs) aggregatedSuccess = [...aggregatedSuccess, ...response.data.successLogs];

                    // Update live progress
                    const currentProgress = Math.min(Math.round(((i + chunk.length) / totalRecords) * 100), 100);
                    setProgress(currentProgress);
                } else {
                    console.error(`Batch at index ${i} failed:`, response.data.message);
                    totalErrorCount += chunk.length;
                    aggregatedErrors.push({ row: i + 1, name: 'Batch Failure', reason: response.data.message || 'Server rejected batch' });
                }
            }

            // Final Summary Display
            setImportStats({
                success: totalSuccessCount,
                failed: totalErrorCount,
                newCount: totalNewCount,
                updatedCount: totalUpdatedCount
            });
            setImportErrors(aggregatedErrors);
            setImportSuccessLogs(aggregatedSuccess);
            setActiveReportTab(aggregatedErrors.length > 0 ? 'error' : 'success');
            
            if (module === 'sizes') refreshSizes();
            
            setStep(5);
            toast.success('Import process completed!');

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

                        {(module === 'sizes' || module === 'inventory') && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Select Project</label>
                                    <select
                                        id="project-selection-import"
                                        value={selectedProject}
                                        onChange={(e) => handleProjectChange(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                                    >
                                        <option value="">-- Choose Project --</option>
                                        {projects.map(p => (
                                            <option key={p._id || p.id} value={p._id || p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                    {projects.length === 0 && (
                                        <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px' }}>
                                            <i className="fa fa-exclamation-triangle" style={{ marginRight: '4px' }}></i>
                                            No projects found. Please create a project first.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Select Block</label>
                                    <select
                                        id="block-selection-import"
                                        value={selectedBlock}
                                        onChange={(e) => setSelectedBlock(e.target.value)}
                                        disabled={!selectedProject || blocks.length === 0}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', opacity: (!selectedProject || blocks.length === 0) ? 0.6 : 1 }}
                                    >
                                        <option value="">
                                            {!selectedProject ? '-- Select Project First --' : (blocks.length === 0 ? '-- No Blocks Found --' : '-- Choose Block --')}
                                        </option>
                                        {blocks.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: 'span 2', marginTop: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Assign to Team(s) <span style={{ color: '#64748b', fontWeight: 400 }}>(Multiple selection supported)</span></label>
                                    <div style={{ 
                                        border: '1px solid #e2e8f0', 
                                        borderRadius: '8px', 
                                        padding: '12px', 
                                        background: '#fff',
                                        maxHeight: '150px',
                                        overflowY: 'auto',
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '8px'
                                    }}>
                                        {teams.length === 0 ? (
                                            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '10px', color: '#94a3b8' }}>No teams found. Ensure teams are created in User Management.</div>
                                        ) : teams.map(t => (
                                            <label key={t._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', background: selectedTeams.includes(t._id) ? '#eff6ff' : 'transparent', transition: 'all 0.2s' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedTeams.includes(t._id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedTeams([...selectedTeams, t._id]);
                                                        else setSelectedTeams(selectedTeams.filter(id => id !== t._id));
                                                    }}
                                                    style={{ width: '16px', height: '16px' }}
                                                />
                                                <span style={{ fontSize: '0.85rem', fontWeight: selectedTeams.includes(t._id) ? 600 : 400, color: selectedTeams.includes(t._id) ? '#2563eb' : '#475569' }}>{t.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p style={{ marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                                        <i className="fas fa-info-circle" style={{ marginRight: '4px' }}></i> Selected teams will have full visibility and management access to this inventory.
                                    </p>
                                </div>
                            </div>
                        )}
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



                        <div style={{ marginTop: '24px', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                Tip: You can also map these fields directly from your CSV in the next step.
                            </p>
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
                            {(() => {
                                const allFields = MODULE_CONFIG[module].fields;
                                if (module !== 'sizes') return allFields;

                                // Size-specific dynamic visibility
                                const unitTypeFileHeader = mapping['unitType'];
                                const firstRowValue = (unitTypeFileHeader && fileData.data.length > 0)
                                    ? fileData.data[0][unitTypeFileHeader]
                                    : '';

                                const isBHK = /bhk/i.test(firstRowValue);

                                return allFields.filter(field => {
                                    if (isBHK) {
                                        // If BHK, hide Plot-specific fields (Width, Length, Area and their Metrics)
                                        return !['width', 'length', 'lengthMetrics', 'area', 'areaMetrics'].includes(field.key);
                                    } else {
                                        // If Plot/Other, hide BHK-specific fields (Builtup, Carpet, Super Area)
                                        return !['builtupArea', 'carpetArea', 'superArea'].includes(field.key);
                                    }
                                });
                            })().map((field) => (
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
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        {importing ? (
                            <div style={{ padding: '60px 0', textAlign: 'center' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Importing Records...</h3>
                                <div style={{ height: '8px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-color)', transition: 'width 0.1s' }}></div>
                                </div>
                                <p style={{ color: '#64748b', fontWeight: 600 }}>Processing {Math.round((progress / 100) * fileData.data.length)} of {fileData.data.length} records ({progress}%)</p>
                            </div>
                        ) : (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Review Data Analysis</h3>

                                {module === 'propertyOwners' && conflicts.length > 0 && (
                                    <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #fee2e2', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#991b1b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-exclamation-triangle"></i> Data Conflicts Detected ({conflicts.length})
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: '#b91c1c', marginBottom: '20px' }}>
                                            The following records have mobile numbers that match existing contacts but with different names. Please choose an action for each.
                                        </p>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {conflicts.map((conflict, idx) => (
                                                <div key={idx} style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>Unit: {conflict.unitNo}</span>
                                                            <span style={{ fontSize: '0.8rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>{conflict.mobile}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, border: '1px solid #fde68a' }}>
                                                                <i className="fas fa-info-circle" style={{ marginRight: '4px' }}></i> {conflict.reason}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                                                            System: <strong style={{ color: '#0f172a' }}>{conflict.existingName}</strong> {conflict.existingFatherName ? <span style={{ fontSize: '0.75rem', color: '#64748b' }}>(s/o {conflict.existingFatherName})</span> : ''} 
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '8px' }}>[{conflict.existingHNo}, {conflict.existingLoc}]</span>
                                                            &nbsp;→ File: <strong style={{ color: '#0369a1' }}>{conflict.providedName}</strong> {conflict.providedFatherName ? <span style={{ fontSize: '0.75rem', color: '#0369a1' }}>(s/o {conflict.providedFatherName})</span> : ''}
                                                            <span style={{ fontSize: '0.75rem', color: '#0369a1', marginLeft: '8px' }}>[{conflict.providedHNo}, {conflict.providedLoc}]</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button 
                                                            onClick={() => handleResolutionChange(conflict.rowKey, conflict.type, 'KEEP_SYSTEM')}
                                                            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid #cbd5e1', background: resolutions[conflict.rowKey]?.[conflict.type] === 'KEEP_SYSTEM' ? '#0f172a' : '#fff', color: resolutions[conflict.rowKey]?.[conflict.type] === 'KEEP_SYSTEM' ? '#fff' : '#64748b' }}
                                                        >
                                                            Keep System Name
                                                        </button>
                                                        <button 
                                                            onClick={() => handleResolutionChange(conflict.rowKey, conflict.type, 'UPDATE_SYSTEM')}
                                                            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid #0284c7', background: resolutions[conflict.rowKey]?.[conflict.type] === 'UPDATE_SYSTEM' ? '#0284c7' : '#fff', color: resolutions[conflict.rowKey]?.[conflict.type] === 'UPDATE_SYSTEM' ? '#fff' : '#0284c7' }}
                                                        >
                                                            Update System
                                                        </button>
                                                        <button 
                                                            onClick={() => handleResolutionChange(conflict.rowKey, conflict.type, 'CREATE_NEW')}
                                                            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid #16a34a', background: resolutions[conflict.rowKey]?.[conflict.type] === 'CREATE_NEW' ? '#16a34a' : '#fff', color: resolutions[conflict.rowKey]?.[conflict.type] === 'CREATE_NEW' ? '#fff' : '#16a34a' }}
                                                        >
                                                            Create New Contact
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {module === 'propertyOwners' && (plannedUpdates.length > 0 || duplicates.length > 0) && (
                                    <div style={{ marginBottom: '32px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-search" style={{ color: '#2563eb' }}></i> Matched Records Analysis ({plannedUpdates.length + (duplicates || []).length})
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                                            {/* Show Planned Updates (with Diffs) */}
                                            {plannedUpdates.map((update, idx) => (
                                                <div key={`upd-${idx}`} style={{ padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                                {update.name?.charAt(0) || 'C'}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{update.name} <span style={{ fontSize: '0.7rem', color: '#2563eb', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>UPDATE PLANNED</span></div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{update.mobile} • Unit: {update.unitNo}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, background: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
                                                            {update.diffs.length} fields changing
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                                                        {update.diffs.map((diff, dIdx) => (
                                                            <div key={dIdx} style={{ fontSize: '0.8rem', padding: '8px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                                                                <div style={{ fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{diff.field}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{diff.old || '(empty)'}</span>
                                                                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{diff.new}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Show Perfect Matches (No Diffs) */}
                                            {(duplicates || []).filter(d => !plannedUpdates.some(p => p.mobile === d.mobile)).map((match, idx) => (
                                                <div key={`match-${idx}`} style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', opacity: 0.8 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                                {match.name?.charAt(0) || 'M'}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#475569' }}>{match.name || match.lookup_value || 'Existing Contact'} <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>VERIFIED MATCH (NO CHANGES)</span></div>
                                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{match.mobile || match.lookup_value || 'Matched by Identity'}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                                                            <i className="fas fa-check-circle"></i> Ready
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ textAlign: 'center', background: '#f8fafc', padding: '32px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', alignItems: 'center', marginBottom: '24px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b' }}>{fileData.data.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Total Records</div>
                                        </div>
                                        <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }}></div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#16a34a' }}>{importSummary.newItems}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>New Contacts</div>
                                        </div>
                                        <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }}></div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#2563eb' }}>{importSummary.updateItems}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Matched Existing</div>
                                        </div>
                                        {importSummary.noMobileItems > 0 && (
                                            <>
                                                <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }}></div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ea580c' }}>{importSummary.noMobileItems}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>No Numbers</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                                        <button
                                            onClick={() => handleImport('NEW_ONLY')}
                                            disabled={importSummary.newItems === 0}
                                            style={{ background: '#16a34a', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: importSummary.newItems === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, border: 'none', opacity: importSummary.newItems === 0 ? 0.5 : 1 }}
                                        >
                                            <i className="fas fa-plus-circle" style={{ marginRight: '8px' }}></i> Add Only New
                                        </button>
                                        <button
                                            onClick={() => handleImport('UPDATE_ONLY')}
                                            disabled={importSummary.updateItems === 0}
                                            style={{ background: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: importSummary.updateItems === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, border: 'none', opacity: importSummary.updateItems === 0 ? 0.5 : 1 }}
                                        >
                                            <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i> Update Matched
                                        </button>
                                        {importSummary.noMobileItems > 0 && (
                                            <button
                                                onClick={() => handleImport('SPECIAL_ENTRY')}
                                                style={{ background: '#ea580c', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 700, border: 'none' }}
                                            >
                                                <i className="fas fa-user-tag" style={{ marginRight: '8px' }}></i> Add Special Entries
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleImport('ALL')}
                                            style={{ background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 700, border: 'none' }}
                                        >
                                            <i className="fas fa-check-double" style={{ marginRight: '8px' }}></i> Proceed with All
                                        </button>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px', fontSize: '0.9rem', color: '#64748b' }}>
                                    <h4 style={{ margin: '0 0 16px', color: '#1e293b', fontWeight: 700 }}>System Configuration</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>Module: <strong style={{ color: '#0f172a' }}>{MODULE_CONFIG[module].label}</strong></div>
                                        <div>File: <strong style={{ color: '#0f172a' }}>{file?.name}</strong></div>
                                        <div>Target Team(s): <strong style={{ color: '#0f172a' }}>{selectedTeams.length > 0 ? `${selectedTeams.length} Selected` : 'Global/None'}</strong></div>
                                        {module === 'propertyOwners' && <div>Conflict Protection: <strong style={{ color: '#16a34a' }}>Active (Enterprise)</strong></div>}
                                    </div>
                                    
                                    {module !== 'propertyOwners' && importSummary.updateItems > 0 && (
                                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={updateDuplicates}
                                                    onChange={(e) => setUpdateDuplicates(e.target.checked)}
                                                    style={{ width: '18px', height: '18px' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>Update existing records if found</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 5: Success & Errors */}
                {step === 5 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '20px 0' }}>
                        <div style={{
                            width: '80px', height: '80px',
                            background: importStats.failed > 0 ? '#fff7ed' : '#dcfce7',
                            color: importStats.failed > 0 ? '#ea580c' : '#16a34a',
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2.5rem', margin: '0 auto 24px'
                        }}>
                            <i className={`fas ${importStats.failed > 0 ? 'fa-exclamation-circle' : 'fa-check'}`}></i>
                        </div>

                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>
                            {importStats.failed > 0 ? 'Import Completed with Issues' : 'Import Successful!'}
                        </h2>

                        <p style={{ color: '#64748b', marginBottom: '32px' }}>
                            Successfully processed <strong>{importStats.success}</strong> records.
                            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                                <span style={{ color: '#16a34a' }}>• New Added: {importStats.newCount}</span>
                                <span style={{ marginLeft: '20px', color: '#2563eb' }}>• Updated: {importStats.updatedCount}</span>
                            </div>
                            {importStats.failed > 0 && <span> <strong>{importStats.failed}</strong> records could not be imported.</span>}
                        </p>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0' }}>
                            <button 
                                onClick={() => setActiveReportTab('success')}
                                style={{
                                    padding: '10px 20px', border: 'none', background: 'none',
                                    borderBottom: activeReportTab === 'success' ? '2px solid #16a34a' : 'none',
                                    color: activeReportTab === 'success' ? '#16a34a' : '#64748b',
                                    fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i> Success Audit ({importSuccessLogs.length})
                            </button>
                            <button 
                                onClick={() => setActiveReportTab('error')}
                                style={{
                                    padding: '10px 20px', border: 'none', background: 'none',
                                    borderBottom: activeReportTab === 'error' ? '2px solid #dc2626' : 'none',
                                    color: activeReportTab === 'error' ? '#dc2626' : '#64748b',
                                    fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                <i className="fas fa-times-circle" style={{ marginRight: '8px' }}></i> Failure Report ({importErrors.length})
                            </button>
                        </div>

                        {activeReportTab === 'success' && (
                            <div style={{ marginBottom: '32px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Import Audit Trail</h3>
                                    <button
                                        onClick={() => {
                                            const csv = generateSuccessReportCSV(importSuccessLogs);
                                            downloadFile(csv, `import_success_${module}_${Date.now()}.csv`);
                                        }}
                                        style={{
                                            background: '#fff', border: '1px solid #e2e8f0', color: '#16a34a',
                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem',
                                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-file-excel"></i> Download Audit CSV
                                    </button>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                <tr>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Identifier</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Project</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Block</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importSuccessLogs.length === 0 ? (
                                                    <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No records processed in this batch.</td></tr>
                                                ) : importSuccessLogs.map((log, idx) => (
                                                    <tr key={idx} style={{ borderBottom: idx === importSuccessLogs.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '12px', color: '#1e293b', fontWeight: 600 }}>{log.unitNo || 'N/A'}</td>
                                                        <td style={{ padding: '12px', color: '#475569' }}>{log.project || 'N/A'}</td>
                                                        <td style={{ padding: '12px', color: '#475569' }}>{log.block || 'N/A'}</td>
                                                        <td style={{ padding: '12px' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#dcfce7', color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>{log.status}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeReportTab === 'error' && (
                            <div style={{ marginBottom: '32px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Failure Details</h3>
                                    <button
                                        onClick={() => {
                                            const csv = generateErrorReportCSV(importErrors);
                                            downloadFile(csv, `import_errors_${module}_${Date.now()}.csv`);
                                        }}
                                        style={{
                                            background: '#fff', border: '1px solid #e2e8f0', color: '#dc2626',
                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem',
                                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-download"></i> Download Error CSV
                                    </button>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                                <tr>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Row</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Item/Name</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importErrors.length === 0 ? (
                                                    <tr><td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No errors found. All records processed successfully.</td></tr>
                                                ) : importErrors.map((err, idx) => (
                                                    <tr key={idx} style={{ borderBottom: idx === importErrors.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '12px', color: '#64748b', fontWeight: 500 }}>{err.row}</td>
                                                        <td style={{ padding: '12px', color: '#1e293b', fontWeight: 600 }}>{err.name}</td>
                                                        <td style={{ padding: '12px', color: '#dc2626' }}>{err.reason}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                {importErrors.length > 0 && (
                                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                                        Tip: Fix these rows in your CSV file and try uploading them again.
                                    </p>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                            <button
                                onClick={() => {
                                    setStep(1);
                                    setFile(null);
                                    setFileData({ headers: [], data: [] });
                                    setMapping({});
                                    setDuplicates([]);
                                    setImportErrors([]);
                                    setImportSuccessLogs([]);
                                    setImportStats({ success: 0, failed: 0 });
                                }}
                                className="btn-outline"
                                style={{ padding: '12px 32px', borderRadius: '6px', fontWeight: 600 }}
                            >
                                Import More Data
                            </button>
                        </div>
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
                        onClick={async () => {
                            if (step === 2) {
                                if ((module === 'sizes' || module === 'inventory') && (!selectedProject || !selectedBlock)) {
                                    return toast.error('Please select both Project and Block');
                                }
                                if (!file) return toast.error('Please upload a file');
                            }
                            
                            // Analysis Trigger for Property Owners
                            if (step === 3 && module === 'propertyOwners') {
                                if (Object.keys(mapping).length === 0) return toast.error('Please map at least one field');
                                await handleAnalyze();
                                setStep(4);
                                return;
                            }

                            if (step === 4) handleImport();
                            else setStep(step + 1);
                        }}
                        className="btn-primary"
                        style={{ padding: '10px 32px', borderRadius: '6px', fontWeight: 700 }}
                        disabled={isAnalyzing}
                    >
                        {isAnalyzing ? (
                            <><i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Validating...</>
                        ) : (
                            <>{step === 4 ? 'Confirm & Start Import' : 'Next Step'} <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i></>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ImportDataPage;
