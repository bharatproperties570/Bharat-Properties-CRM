import { useState, useRef, useEffect } from 'react';
import { MODULE_CONFIG, parseCSV, generateErrorReportCSV, generateSuccessReportCSV, downloadFile } from '../../../utils/dataManagementUtils';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { useUserContext } from '../../../context/UserContext';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';
import { useImport } from '../../../context/ImportContext';

const ImportDataPage = () => {
    const { startBackgroundImport } = useImport();
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
    const [ownerUpdateMode, setOwnerUpdateMode] = useState('REPLACE');
    const [plannedUpdates, setPlannedUpdates] = useState([]);
    const [resolutions, setResolutions] = useState({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    const [expandedConflictRow, setExpandedConflictRow] = useState(null); // rowKey of expanded card
    const [notFound, setNotFound] = useState([]); // unit-not-found rows
    const [unitOverrides, setUnitOverrides] = useState({}); // { rowKey: inventoryId } manual unit match
    const [unitSearchQuery, setUnitSearchQuery] = useState({}); // { rowKey: searchText }
    const [unitSearchResults, setUnitSearchResults] = useState({}); // { rowKey: [inventory items] }
    const conflictSectionRef = useRef(null);

    // Global Defaults for Assignment


    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // Size-specific context
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedBlock, setSelectedBlock] = useState('');
    const [blocks, setBlocks] = useState([]);

    const handleProjectChange = (projectId) => {
        console.log("[ImportData] Project selected ID:", projectId);
        setSelectedProject(projectId);
        setSelectedBlock('');
        
        if (!projectId) {
            setBlocks([]);
            return;
        }

        const project = projects.find(p => String(p._id || p.id) === String(projectId));
        
        if (project) {
            console.log("[ImportData] Found project:", project.name);
            console.log("[ImportData] Blocks raw data:", project.blocks);
            
            if (Array.isArray(project.blocks) && project.blocks.length > 0) {
                console.log(`[ImportData] Found ${project.blocks.length} blocks.`);
                setBlocks(project.blocks);
            } else {
                console.warn(`[ImportData] Project "${project.name}" has no blocks or blocks is not an array.`);
                setBlocks([]);
            }
        } else {
            console.warn("[ImportData] Project not found in context projects list for ID:", projectId);
            console.log("[ImportData] Available project IDs:", projects.map(p => p._id || p.id));
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
            const transformedData = fileData.data.map((row, idx) => {
                const item = {};
                Object.entries(mapping).forEach(([systemKey, fileHeader]) => {
                    item[systemKey] = row[fileHeader];
                });
                Object.assign(item, row);
                
                if (module === 'sizes' || module === 'inventory' || module === 'propertyOwners') {
                    const projectObj = projects.find(p => p._id === selectedProject);
                    item.projectId = selectedProject;
                    item.project = projectObj ? projectObj.name : (item.project || '');
                    item.projectName = projectObj ? projectObj.name : (item.projectName || item.project || '');
                    item.block = selectedBlock || item.block || '';
                    item.module = module;
                }
                item._rowIdx = idx;
                return item;
            });

            const response = await api.post('/inventory/bulk-update-owners', {
                dryRun: true,
                data: transformedData
            });

            if (response.data.success) {
                setConflicts(response.data.conflicts || []);
                setNotFound(response.data.notFound || []);
                setImportSummary({
                    newItems: response.data.newCount || 0,
                    updateItems: response.data.updatedCount || response.data.successCount || 0,
                    noMobileItems: response.data.noMobileCount || 0
                });
                
                // Default resolutions - set EMPTY so user must explicitly choose
                const initialResolutions = {};
                // Do NOT pre-set any resolution - user must click and choose
                setResolutions(initialResolutions);
                setPlannedUpdates(response.data.plannedUpdates || []);
                setDuplicates(response.data.duplicates || []); // 🚀 Store matches for transparency

                if (response.data.conflictCount > 0) {
                    toast.error(`Detected ${response.data.conflictCount} data conflicts.`);
                } else if ((response.data.notFound || []).length > 0) {
                    toast(`⚠️ ${response.data.notFound.length} units not found in system.`, { icon: '⚠️' });
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

    // Field-level resolution: sets per-field choice { rowKey: { fields: { fieldName: 'KEEP'|'UPDATE' }, ownership: 'ACTION' } }
    const handleFieldResolutionChange = (rowKey, fieldName, choice) => {
        setResolutions(prev => ({
            ...prev,
            [rowKey]: {
                ...prev[rowKey],
                fields: {
                    ...(prev[rowKey]?.fields || {}),
                    [fieldName]: choice
                }
            }
        }));
    };

    // Mark entire conflict as confirmed after field-level selections
    const confirmFieldResolutions = (rowKey, conflictType) => {
        setResolutions(prev => ({
            ...prev,
            [rowKey]: {
                ...prev[rowKey],
                [conflictType]: 'FIELD_LEVEL',  // Signal to backend: per-field decisions
                confirmedAt: new Date().toISOString()
            }
        }));
        setExpandedConflictRow(null);
        toast.success('Resolution saved! Fields updated as per your choices.');
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
                    const hasConflict = conflicts.some(c => c.rowKey === `row_${item._rowIdx}`);
                    
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

            // [ENTERPRISE] Conflict Validation before Import
            if (module === 'propertyOwners') {
                const unresolved = conflicts.filter(c => {
                    const res = resolutions[c.rowKey];
                    if (!res) return true; // No resolution at all

                    const ownershipAction = res['ownership'] || res['owner'];
                    if (!ownershipAction) return true; // No top-level action chosen

                    // For FIELD_LEVEL: ensure every conflicting field has been decided
                    if (ownershipAction === 'FIELD_LEVEL') {
                        const totalDiffFields = c.diffs?.length || 0;
                        const decidedFields = Object.keys(res.fields || {}).filter(f => res.fields[f]).length;
                        return decidedFields < totalDiffFields; // still unresolved if any field undecided
                    }

                    return false; // Has a valid top-level action (SKIP_UPDATE / REPLACE_OWNER etc)
                });
                if (unresolved.length > 0 && mode !== 'NEW_ONLY') {
                    setImporting(false);
                    const details = unresolved.map(c => {
                        const res = resolutions[c.rowKey];
                        const decided = Object.keys(res?.fields || {}).filter(f => res.fields[f]).length;
                        const total = c.diffs?.length || 0;
                        return res?.ownership === 'FIELD_LEVEL'
                            ? `Unit ${c.unitNo}: ${decided}/${total} fields decided`
                            : `Unit ${c.unitNo}: no resolution chosen`;
                    }).join(', ');
                    return toast.error(`⚠️ ${unresolved.length} conflict(s) still pending — ${details}`);
                }
            }

            // Determine endpoint
            let endpoint = `/${module}/import`;
            if (module === 'sizes') endpoint = '/lookups/import';
            else if (module === 'propertyOwners') endpoint = '/inventory/bulk-update-owners';

            const basePayload = {
                updateDuplicates: updateDuplicates,
                teams: selectedTeams.length > 0 ? selectedTeams : undefined,
                resolutions: module === 'propertyOwners' ? resolutions : undefined
            };

            if (module === 'sizes') {
                basePayload.lookup_type = 'Size';
                basePayload.metadata = {
                    projectName: projects.find(p => String(p._id || p.id) === String(selectedProject))?.name,
                    projectId: selectedProject,
                    block: selectedBlock,
                    module: module
                };
            } else if (module === 'inventory') {
                basePayload.projectId = selectedProject;
                basePayload.metadata = {
                    projectName: projects.find(p => String(p._id || p.id) === String(selectedProject))?.name,
                    projectId: selectedProject,
                    block: selectedBlock,
                    module: module
                };
            }

            startBackgroundImport({
                module,
                moduleLabel: MODULE_CONFIG[module]?.label || module,
                endpoint,
                transformedData,
                chunkSize: 10,
                basePayload,
                onComplete: (results) => {
                    setImportStats({
                        success: results.success,
                        failed: results.failed,
                        newCount: results.newCount,
                        updatedCount: results.updatedCount
                    });
                    setImportErrors(results.errors);
                    setImportSuccessLogs(results.successLogs);
                    setActiveReportTab(results.errors.length > 0 ? 'error' : 'success');
                    if (module === 'sizes') refreshSizes();
                }
            });

            setStep(6);
            toast.success('Import started in background!');

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

    // Search inventory units for manual override picker
    const searchInventoryUnits = async (rowKey, query, projectName, block) => {
        if (!query || query.length < 2) {
            setUnitSearchResults(prev => ({ ...prev, [rowKey]: [] }));
            return;
        }
        try {
            const res = await api.get('/inventory', { params: { search: query, projectName, block, limit: 10 } });
            const items = res.data?.data || res.data?.inventory || [];
            setUnitSearchResults(prev => ({ ...prev, [rowKey]: items }));
        } catch (e) {
            console.error('Unit search error:', e);
        }
    };

    // Apply bulk resolution to all conflicts at once
    const applyBulkResolution = (type, action) => {
        const newResolutions = { ...resolutions };
        conflicts.forEach(c => {
            newResolutions[c.rowKey] = { ...newResolutions[c.rowKey], [c.type]: action };
        });
        setResolutions(newResolutions);
        toast.success(`Applied "${action}" to all ${conflicts.length} conflicts.`);
    };

    // --- Renderers ---

    const Stepper = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px 40px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '15px', left: '60px', right: '60px', height: '2px', background: 'var(--border-color)', zIndex: 0 }}>
                <div style={{ height: '100%', width: `${((step - 1) / 4) * 100}%`, background: 'var(--primary-color)', transition: 'width 0.3s' }}></div>
            </div>
            {['Select', 'Upload', 'Map', 'Preview', 'Finish'].map((label, i) => {
                const s = i + 1;
                return (
                    <div key={s} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: s <= step ? 'var(--primary-color)' : 'var(--bg-card)',
                            border: s <= step ? 'none' : '2px solid var(--border-color)',
                            color: s <= step ? 'var(--bg-card)' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: '0.9rem',
                            transition: 'all 0.3s'
                        }}>
                            {s < step ? <i className="fas fa-check"></i> : s}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: s <= step ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            {label}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-card)' }}>
            <div style={{ padding: '32px 40px 0' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Import Data Wizard</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Bulk import data from CSV files into {MODULE_CONFIG[module]?.label || 'CRM'}.</p>
                <Stepper />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px' }}>
                {/* Step 1: Select Module */}
                {step === 1 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '24px' }}>Select Data Module</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                            {Object.values(MODULE_CONFIG).map(mod => (
                                <div
                                    key={mod.id}
                                    onClick={() => setModule(mod.id)}
                                    style={{
                                        border: module === mod.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                                        background: module === mod.id ? '#eff6ff' : 'var(--bg-card)',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                                    }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '12px',
                                        background: module === mod.id ? 'var(--primary-color)' : 'var(--bg-light)',
                                        color: module === mod.id ? 'var(--bg-card)' : 'var(--text-muted)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.5rem', marginBottom: '16px'
                                    }}>
                                        <i className={`fas ${mod.icon}`}></i>
                                    </div>
                                    <h4 style={{ margin: '0 0 8px', color: 'var(--text-main)' }}>{mod.label}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{mod.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Upload */}
                {step === 2 && (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Upload File for {MODULE_CONFIG[module].label}</h3>

                        {(module === 'sizes' || module === 'inventory') && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Select Project</label>
                                    <select
                                        id="project-selection-import"
                                        value={selectedProject}
                                        onChange={(e) => handleProjectChange(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
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
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Select Block</label>
                                    <select
                                        id="block-selection-import"
                                        value={selectedBlock}
                                        onChange={(e) => setSelectedBlock(e.target.value)}
                                        disabled={!selectedProject || blocks.length === 0}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', opacity: (!selectedProject || blocks.length === 0) ? 0.6 : 1 }}
                                    >
                                        <option value="">
                                            {!selectedProject ? '-- Select Project First --' : (blocks.length === 0 ? '-- No Blocks Found --' : '-- Choose Block --')}
                                        </option>
                                        {blocks.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: 'span 2', marginTop: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Assign to Team(s) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Multiple selection supported)</span></label>
                                    <div style={{ 
                                        border: '1px solid var(--border-color)', 
                                        borderRadius: '8px', 
                                        padding: '12px', 
                                        background: 'var(--bg-card)',
                                        maxHeight: '150px',
                                        overflowY: 'auto',
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '8px'
                                    }}>
                                        {teams.length === 0 ? (
                                            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '10px', color: 'var(--text-muted)' }}>No teams found. Ensure teams are created in User Management.</div>
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
                                                <span style={{ fontSize: '0.85rem', fontWeight: selectedTeams.includes(t._id) ? 600 : 400, color: selectedTeams.includes(t._id) ? '#2563eb' : 'var(--text-muted)' }}>{t.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                                background: isDragging ? '#eff6ff' : 'var(--bg-light)',
                                padding: '60px 40px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                marginBottom: '24px'
                            }}
                        >
                            <i className="fas fa-cloud-upload-alt" style={{ fontSize: '3rem', color: isDragging ? 'var(--primary-color)' : 'var(--text-muted)', marginBottom: '16px' }}></i>
                            <h4 style={{ margin: '0 0 8px', color: 'var(--text-main)' }}>{file ? file.name : (isDragging ? 'Drop file to upload' : 'Drag & Drop CSV here')}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>or <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>browse files</span></p>
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
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Need a sample?</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Download template for {MODULE_CONFIG[module].label}</div>
                                </div>
                            </div>
                            <button
                                onClick={generateSampleCSV}
                                style={{ background: 'var(--bg-card)', border: '1px solid #bfdbfe', color: '#2563eb', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <i className="fas fa-download" style={{ marginRight: '8px' }}></i> Download
                            </button>
                        </div>



                        <div style={{ marginTop: '24px', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Tip: You can also map these fields directly from your CSV in the next step.
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 3: Map Columns */}
                {step === 3 && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Map Columns</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Match your file columns to the {MODULE_CONFIG[module].label} fields.</p>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--bg-light)', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
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
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                    </div>
                                    <div>
                                        <select
                                            value={mapping[field.key] || ''}
                                            onChange={(e) => mapColumn(field.key, e.target.value)}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                        >
                                            <option value="">-- Unmapped --</option>
                                            {fileData.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Importing Records...</h3>
                                <div style={{ height: '8px', width: '100%', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-color)', transition: 'width 0.1s' }}></div>
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Processing {Math.round((progress / 100) * fileData.data.length)} of {fileData.data.length} records ({progress}%)</p>
                            </div>
                        ) : (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Review Data Analysis</h3>

                                {module === 'propertyOwners' && (
                                    <div ref={conflictSectionRef} style={{ marginBottom: '32px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: conflicts.length > 0 ? '#fff1f2' : 'var(--bg-light)' }}>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: conflicts.length > 0 ? '#be123c' : 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className={conflicts.length > 0 ? "fas fa-exclamation-triangle" : "fas fa-table"}></i> 
                                                {conflicts.length > 0 ? `Data Conflicts Detected (${conflicts.length})` : 'Data Preview (No Conflicts)'}
                                            </h3>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Rows: {fileData.data.length}</div>
                                        </div>
                                        
                                        {conflicts.length > 1 && (
                                            <div style={{ padding: '12px 24px', background: '#fef9ec', borderBottom: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
                                                    <i className="fas fa-bolt" style={{ marginRight: '6px', color: '#d97706' }}></i>
                                                    {conflicts.length} conflicts — Apply same resolution to all:
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button onClick={() => applyBulkResolution('ownership', 'SKIP_UPDATE')} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-main)' }}>
                                                        <i className="fas fa-ban" style={{ marginRight: '6px', color: 'var(--text-muted)' }}></i>Skip All
                                                    </button>
                                                    <button onClick={() => applyBulkResolution('ownership', 'REPLACE_OWNER')} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #fca5a5', background: 'var(--danger-bg)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#991b1b' }}>
                                                        <i className="fas fa-exchange-alt" style={{ marginRight: '6px' }}></i>Replace All
                                                    </button>
                                                    <button onClick={() => applyBulkResolution('ownership', 'ADD_CO_OWNER')} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #a7f3d0', background: 'var(--stat-property-bg)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#065f46' }}>
                                                        <i className="fas fa-user-plus" style={{ marginRight: '6px' }}></i>Add All Co-Owners
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead style={{ background: 'var(--bg-light)', position: 'sticky', top: 0, zIndex: 10 }}>
                                                    <tr>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Row #</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Unit No</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Name (File)</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Mobile (File)</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>Status</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', minWidth: '180px' }}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fileData.data.map((row, idx) => {
                                                        const rowKey = `row_${idx}`;
                                                        const conflict = conflicts.find(c => c.rowKey === rowKey);
                                                        const isConflict = !!conflict;
                                                        const isExpanded = expandedConflictRow === rowKey;
                                                        
                                                        const getVal = (sysKey) => {
                                                            const fileHeader = mapping[sysKey];
                                                            return fileHeader ? row[fileHeader] : '-';
                                                        };
                                                        const unitNo = getVal('unitNo') || getVal('unitNumber') || getVal('inventory') || '-';
                                                        const name = getVal('ownerName') || getVal('name') || '-';
                                                        const mobile = getVal('ownerMobile') || getVal('mobile') || '-';
                                                        
                                                        const rowBg = isConflict ? (isExpanded ? '#fff7f7' : '#fffbfb') : 'var(--bg-card)';

                                                        return (
                                                            <>
                                                                <tr key={rowKey} style={{ borderBottom: '1px solid #f1f5f9', background: rowBg, transition: 'background 0.2s' }}>
                                                                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 500 }}>{idx + 1}</td>
                                                                    <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-main)' }}>{unitNo}</td>
                                                                    <td style={{ padding: '10px 16px', color: 'var(--text-main)' }}>{name}</td>
                                                                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{mobile}</td>
                                                                    <td style={{ padding: '10px 16px' }}>
                                                                        {isConflict ? (
                                                                            (() => {
                                                                                const res = resolutions[rowKey];
                                                                                const ownershipAction = res?.ownership || res?.owner;
                                                                                const isFieldLevel = ownershipAction === 'FIELD_LEVEL';
                                                                                const fieldChoices = res?.fields || {};
                                                                                const totalDiffs = conflict.diffs?.length || 0;
                                                                                const decidedCount = Object.keys(fieldChoices).filter(f => fieldChoices[f]).length;

                                                                                if (ownershipAction && !isFieldLevel) {
                                                                                    // Ownership resolution (Skip/Replace/Add Co-Owner)
                                                                                    return (
                                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: '#e0e7ff', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                            <i className="fas fa-check-double"></i>
                                                                                            {ownershipAction.replace(/_/g, ' ')}
                                                                                        </span>
                                                                                    );
                                                                                }

                                                                                if (isFieldLevel) {
                                                                                    const allDone = decidedCount >= totalDiffs && totalDiffs > 0;
                                                                                    return (
                                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: allDone ? '#e0e7ff' : '#fef9ec', color: allDone ? '#4f46e5' : '#92400e', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                                <i className={`fas ${allDone ? 'fa-check-double' : 'fa-spinner'}`}></i>
                                                                                                {allDone ? 'Field-Level Resolved' : `${decidedCount}/${totalDiffs} fields decided`}
                                                                                            </span>
                                                                                            {Object.keys(fieldChoices).length > 0 && (
                                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                                                                                    {Object.entries(fieldChoices).map(([f, v]) => (
                                                                                                        <span key={f} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 700, background: v === 'UPDATE' ? '#dcfce7' : '#dbeafe', color: v === 'UPDATE' ? '#166534' : '#1e40af' }}>
                                                                                                            {f.replace('Address ', '')}: {v === 'UPDATE' ? '↑CSV' : '✓SYS'}
                                                                                                        </span>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                // Unresolved
                                                                                return (
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: 'var(--danger-bg)', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                            <i className="fas fa-exclamation-triangle"></i>
                                                                                            Owner Conflict
                                                                                        </span>
                                                                                    </div>
                                                                                );
                                                                            })()
                                                                        ) : (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: 'var(--stat-property-bg)', color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                <i className="fas fa-check-circle"></i> Ready
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px' }}>
                                                                            {isConflict ? (
                                                                                <button
                                                                                    onClick={() => setExpandedConflictRow(isExpanded ? null : rowKey)}
                                                                                    style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${isExpanded ? '#fca5a5' : 'var(--border-color)'}`, background: isExpanded ? 'var(--danger-bg)' : (resolutions[rowKey]?.[conflict.type] ? '#e0e7ff' : 'var(--bg-light)'), color: isExpanded ? '#dc2626' : (resolutions[rowKey]?.[conflict.type] ? '#4f46e5' : 'var(--text-muted)'), fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                                                >
                                                                                    <i className={`fas ${isExpanded ? 'fa-chevron-up' : (resolutions[rowKey]?.[conflict.type] ? 'fa-edit' : 'fa-balance-scale')}`}></i>
                                                                                    {(() => {
                                                                                        if (isExpanded) return 'Collapse';
                                                                                        
                                                                                        
                                                                                        
                                                                                        return resolutions[rowKey]?.[conflict.type] ? 'Edit Resolution' : 'Resolve Conflict';
                                                                                    })()}
                                                                                </button>
                                                                            ) : (
                                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No action needed</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                                {isConflict && isExpanded && (
                                                                    <tr key={`${rowKey}-card`}>
                                                                        <td colSpan={6} style={{ padding: '0 16px 16px', background: '#fff7f7' }}>
                                                                            <div style={{ border: '2px solid #fecaca', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(220,38,38,0.08)' }}>
                                                                                {/* CONFLICT DETAILS HEADER - Enterprise Grade */}
                                                                                <div style={{ background: 'var(--danger-bg)', padding: '14px 20px', borderBottom: '1px solid #fecaca' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                                                        <i className="fas fa-exclamation-triangle" style={{ color: '#dc2626', fontSize: '1.1rem', marginTop: '2px', flexShrink: 0 }}></i>
                                                                                        <div style={{ flex: 1 }}>
                                                                                            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem', marginBottom: '4px' }}>
                                                                                                {conflict.type === 'ownership' && conflict.incoming && conflict.existing?.owners
                                                                                                    ? `⚔️ Ownership Conflict — Unit ${conflict.unitNo}`
                                                                                                    : `📋 Data Mismatch — Unit ${conflict.unitNo}`
                                                                                                }
                                                                                            </div>
                                                                                            <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>
                                                                                                {conflict.reason}
                                                                                            </div>
                                                                                            {conflict.diffs && conflict.diffs.length > 0 && (
                                                                                                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                                                    {conflict.diffs.map((d, di) => (
                                                                                                        <span key={di} style={{ padding: '2px 8px', background: '#fca5a5', color: '#7f1d1d', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                                                                            {d.field}: "{d.old || '—'}" → "{d.new}"
                                                                                                        </span>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                            <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '4px' }}>{conflict.projectName} {conflict.block ? `/ ${conflict.block}` : ''}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                                                                                    <div style={{ padding: '16px 20px', borderRight: '1px solid #fecaca', background: 'var(--bg-card)' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                                                                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                                                                                <i className="fas fa-file-csv"></i>
                                                                                            </div>
                                                                                            <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.85rem' }}>FROM YOUR CSV FILE</span>
                                                                                        </div>
                                                                                        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                                                                                            <tbody>
                                                                                                {[['Name', conflict.incoming?.name, conflict.existing?.name], ['Father Name', conflict.incoming?.fatherName, conflict.existing?.fatherName], ['Mobile', conflict.incoming?.mobile, conflict.existing?.mobile], ['House No', conflict.incoming?.hNo, conflict.existing?.hNo], ['Locality', conflict.incoming?.locality, conflict.existing?.locality]].filter(([,v]) => v).map(([label, value, existingValue]) => {
                                                                                                    const isDiff = conflict.type !== 'ownership' && String(value || '').trim().toLowerCase() !== String(existingValue || '').trim().toLowerCase();
                                                                                                    return (
                                                                                                    <tr key={label}>
                                                                                                        <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontWeight: 600, width: '40%' }}>{label}</td>
                                                                                                        <td style={{ padding: '5px 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                                                                                            {isDiff ? <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{value || '—'}</span> : (value || '—')}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                )})}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                    <div style={{ padding: '16px 20px', background: '#fafafa' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                                                                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                                                                                <i className="fas fa-database"></i>
                                                                                            </div>
                                                                                            <span style={{ fontWeight: 700, color: '#065f46', fontSize: '0.85rem' }}>ALREADY IN SYSTEM</span>
                                                                                        </div>
                                                                                        {conflict.type === 'ownership' ? (
                                                                                            (conflict.existing?.owners || []).map((owner, oi) => (
                                                                                                <div key={oi} style={{ marginBottom: '12px', padding: '10px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                                                                    <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                                                                                                        <tbody>
                                                                                                            <tr><td style={{ padding: '4px 0', color: 'var(--text-muted)', fontWeight: 600, width: '40%' }}>Name</td><td style={{ color: 'var(--text-main)', fontWeight: 600 }}>{owner.name}</td></tr>
                                                                                                            <tr><td style={{ padding: '4px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Mobile</td><td style={{ color: 'var(--text-main)' }}>{owner.mobile}</td></tr>
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            ))
                                                                                        ) : (
                                                                                            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                                                                                                <tbody>
                                                                                                    {[['Name', conflict.existing?.name, conflict.incoming?.name], ['Father Name', conflict.existing?.fatherName, conflict.incoming?.fatherName], ['Mobile', conflict.existing?.mobile, conflict.incoming?.mobile], ['House No', conflict.existing?.hNo, conflict.incoming?.hNo], ['Locality', conflict.existing?.locality, conflict.incoming?.locality]].filter(([,v]) => v).map(([label, value, incomingValue]) => {
                                                                                                        const isDiff = String(value || '').trim().toLowerCase() !== String(incomingValue || '').trim().toLowerCase();
                                                                                                        return (
                                                                                                                                <tr key={label}>
                                                                                                                                    <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontWeight: 600, width: '40%' }}>{label}</td>
                                                                                                                                    <td style={{ padding: '5px 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                                                                                                                        {isDiff ? <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{value || '—'}</span> : (value || '—')}
                                                                                                                                    </td>
                                                                                                                                </tr>
                                                                                                                            );
                                                                                                                        })}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ background: 'var(--bg-light)', padding: '14px 20px', borderTop: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                                                        How would you like to resolve this conflict?
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                                        <button 
                                                                                            onClick={() => {
                                                                                                handleResolutionChange(rowKey, conflict.type, 'REPLACE_OWNER');
                                                                                                toast.success("Resolution saved: Keep New (CSV)");
                                                                                                setExpandedConflictRow(null);
                                                                                            }}
                                                                                            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #3b82f6', background: resolutions[rowKey]?.[conflict.type] === 'REPLACE_OWNER' ? '#3b82f6' : 'var(--bg-card)', color: resolutions[rowKey]?.[conflict.type] === 'REPLACE_OWNER' ? 'var(--bg-card)' : '#3b82f6', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                                                                        >
                                                                                            Keep New (CSV)
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={() => {
                                                                                                handleResolutionChange(rowKey, conflict.type, 'SKIP_UPDATE');
                                                                                                toast.success("Resolution saved: Keep Existing (CRM)");
                                                                                                setExpandedConflictRow(null);
                                                                                            }}
                                                                                            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #10b981', background: resolutions[rowKey]?.[conflict.type] === 'SKIP_UPDATE' ? '#10b981' : 'var(--bg-card)', color: resolutions[rowKey]?.[conflict.type] === 'SKIP_UPDATE' ? 'var(--bg-card)' : '#10b981', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                                                                        >
                                                                                            Keep Existing (CRM)
                                                                                        </button>
                                                                                        {conflict.type === 'ownership' && (
                                                                                            <button 
                                                                                                onClick={() => {
                                                                                                    handleResolutionChange(rowKey, conflict.type, 'APPEND');
                                                                                                    toast.success("Resolution saved: Keep Both");
                                                                                                    setExpandedConflictRow(null);
                                                                                                }}
                                                                                                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #f59e0b', background: resolutions[rowKey]?.[conflict.type] === 'APPEND' ? '#f59e0b' : 'var(--bg-card)', color: resolutions[rowKey]?.[conflict.type] === 'APPEND' ? 'var(--bg-card)' : '#f59e0b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                                                                            >
                                                                                                Keep Both
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {module === 'propertyOwners' && notFound.length > 0 && (
                                    <div style={{ marginBottom: '32px', background: 'var(--bg-card)', borderRadius: '12px', border: '2px solid #fcd34d', boxShadow: '0 4px 12px rgba(251,191,36,0.1)', overflow: 'hidden' }}>
                                        <div style={{ padding: '16px 24px', background: '#fef9ec', borderBottom: '1px solid #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-search-minus"></i> {notFound.length} Units Not Found in System
                                            </h3>
                                            <span style={{ fontSize: '0.8rem', color: '#78350f', fontWeight: 600 }}>Manually match or skip each row</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                            {notFound.map((nf, nfIdx) => {
                                                const override = unitOverrides[nf.rowKey];
                                                const searchResults = unitSearchResults[nf.rowKey] || [];
                                                const sqVal = unitSearchQuery[nf.rowKey] || '';
                                                return (
                                                    <div key={nf.rowKey} style={{ padding: '18px 24px', borderBottom: nfIdx < notFound.length - 1 ? '1px solid #fef3c7' : 'none', background: override ? 'var(--stat-property-bg)' : 'var(--bg-card)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem', marginBottom: '4px' }}>
                                                                    <i className="fas fa-exclamation-circle" style={{ marginRight: '6px', color: '#f59e0b' }}></i>
                                                                    Row {nf.row} — Unit &quot;{nf.unitNo}&quot; not found
                                                                </div>
                                                                <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
                                                                    Project: <strong>{nf.projectName}</strong> {nf.block && <>/ Block: <strong>{nf.block}</strong></>}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px' }}>
                                                                {override ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: '#dcfce7', border: '1px solid #86efac' }}>
                                                                        <i className="fas fa-check-circle" style={{ color: '#16a34a' }}></i>
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>Matched to: {override.unitNo || override.unitNumber}</span>
                                                                        <button onClick={() => setUnitOverrides(prev => { const n = {...prev}; delete n[nf.rowKey]; return n; })} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>✕ Change</button>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ position: 'relative' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder={`Search units in ${nf.projectName}...`}
                                                                            value={sqVal}
                                                                            onChange={e => {
                                                                                const q = e.target.value;
                                                                                setUnitSearchQuery(prev => ({ ...prev, [nf.rowKey]: q }));
                                                                                searchInventoryUnits(nf.rowKey, q, nf.projectName, nf.block);
                                                                            }}
                                                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #fcd34d', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                                                        />
                                                                        {searchResults.length > 0 && (
                                                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                                                                                {searchResults.map(unit => (
                                                                                    <div
                                                                                        key={unit._id}
                                                                                        onClick={() => {
                                                                                            setUnitOverrides(prev => ({ ...prev, [nf.rowKey]: unit }));
                                                                                            setUnitSearchQuery(prev => ({ ...prev, [nf.rowKey]: '' }));
                                                                                            setUnitSearchResults(prev => ({ ...prev, [nf.rowKey]: [] }));
                                                                                        }}
                                                                                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                                                                                        onMouseOver={e => e.currentTarget.style.background='#f0f9ff'}
                                                                                        onMouseOut={e => e.currentTarget.style.background='var(--bg-card)'}
                                                                                    >
                                                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{unit.unitNo || unit.unitNumber}</div>
                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit.projectName} / {unit.block}</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {module === 'propertyOwners' && (plannedUpdates.length > 0 || duplicates.length > 0) && (
                                    <div style={{ marginBottom: '32px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-search" style={{ color: '#2563eb' }}></i> Matched Records Analysis ({plannedUpdates.length + (duplicates || []).length})
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                                            {/* Show Planned Updates (with Diffs) */}
                                            {plannedUpdates.map((update, idx) => (
                                                <div key={`upd-${idx}`} style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                                {update.name?.charAt(0) || 'C'}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{update.name} <span style={{ fontSize: '0.7rem', color: '#2563eb', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>UPDATE PLANNED</span></div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{update.mobile} • Unit: {update.unitNo}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, background: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
                                                            {update.diffs.length} fields changing
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                                                        {update.diffs.map((diff, dIdx) => (
                                                            <div key={dIdx} style={{ fontSize: '0.8rem', padding: '8px', background: 'var(--bg-light)', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                                                                <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>{diff.field}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{diff.old || '(empty)'}</span>
                                                                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}></i>
                                                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{diff.new}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Show Perfect Matches (No Diffs) */}
                                            {(duplicates || []).filter(d => !plannedUpdates.some(p => p.mobile === d.mobile)).map((match, idx) => (
                                                <div key={`match-${idx}`} style={{ padding: '16px', background: 'var(--bg-light)', borderRadius: '12px', border: '1px solid var(--border-color)', opacity: 0.8 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-light)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                                                {match.name?.charAt(0) || 'M'}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{match.name || match.lookup_value || 'Existing Contact'} <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>VERIFIED MATCH (NO CHANGES)</span></div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{match.mobile || match.lookup_value || 'Matched by Identity'}</div>
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

                                <div style={{ textAlign: 'center', background: 'var(--bg-light)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', alignItems: 'center', marginBottom: '24px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{fileData.data.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Total Records</div>
                                        </div>
                                        <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }}></div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#16a34a' }}>{importSummary.newItems}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>New Contacts</div>
                                        </div>
                                        <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }}></div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#2563eb' }}>{importSummary.updateItems}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Matched Existing</div>
                                        </div>
                                        {importSummary.noMobileItems > 0 && (
                                            <>
                                                <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }}></div>
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
                                            style={{ background: '#16a34a', color: 'var(--bg-card)', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: importSummary.newItems === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, border: 'none', opacity: importSummary.newItems === 0 ? 0.5 : 1 }}
                                        >
                                            <i className="fas fa-plus-circle" style={{ marginRight: '8px' }}></i> Add Only New
                                        </button>
                                        <button
                                            onClick={() => handleImport('UPDATE_ONLY')}
                                            disabled={importSummary.updateItems === 0}
                                            style={{ background: '#2563eb', color: 'var(--bg-card)', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: importSummary.updateItems === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, border: 'none', opacity: importSummary.updateItems === 0 ? 0.5 : 1 }}
                                        >
                                            <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i> Update Matched
                                        </button>
                                        {importSummary.noMobileItems > 0 && (
                                            <button
                                                onClick={() => handleImport('SPECIAL_ENTRY')}
                                                style={{ background: '#ea580c', color: 'var(--bg-card)', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 700, border: 'none' }}
                                            >
                                                <i className="fas fa-user-tag" style={{ marginRight: '8px' }}></i> Add Special Entries
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleImport('ALL')}
                                            style={{ background: 'var(--text-main)', color: 'var(--bg-card)', padding: '12px 24px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 700, border: 'none' }}
                                        >
                                            <i className="fas fa-check-double" style={{ marginRight: '8px' }}></i> Proceed with All
                                        </button>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <h4 style={{ margin: '0 0 16px', color: 'var(--text-main)', fontWeight: 700 }}>System Configuration</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>Module: <strong style={{ color: 'var(--text-main)' }}>{MODULE_CONFIG[module].label}</strong></div>
                                        <div>File: <strong style={{ color: 'var(--text-main)' }}>{file?.name}</strong></div>
                                        <div>Target Team(s): <strong style={{ color: 'var(--text-main)' }}>{selectedTeams.length > 0 ? `${selectedTeams.length} Selected` : 'Global/None'}</strong></div>
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
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Update existing records if found</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 6: Background Processing */}
                {step === 6 && (
                    <div style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center', padding: '40px', background: 'var(--bg-light)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
                        <div style={{
                            width: '80px', height: '80px', background: '#eff6ff', color: '#3b82f6',
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2.5rem', margin: '0 auto 24px'
                        }}>
                            <i className="fas fa-rocket"></i>
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 12px' }}>
                            Import Running in Background
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: '0 0 24px', lineHeight: '1.6' }}>
                            Your import task has been successfully dispatched. You can safely navigate away from this page and continue working.
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0' }}>
                            A global progress indicator will keep you updated in the main layout.
                        </p>
                        <button 
                            onClick={() => {
                                setStep(1);
                                setFile(null);
                                setFileData({ headers: [], data: [] });
                                setMapping({});
                            }}
                            style={{ marginTop: '32px', padding: '12px 24px', background: '#3b82f6', color: 'var(--bg-card)', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                        >
                            Start New Import
                        </button>
                        <div style={{ marginTop: '20px' }}>
                            <button
                                onClick={() => setStep(5)}
                                style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                View Results (if completed)
                            </button>
                        </div>
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

                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px' }}>
                            {importStats.failed > 0 ? 'Import Completed with Issues' : 'Import Successful!'}
                        </h2>

                        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                            Successfully processed <strong>{importStats.success}</strong> records.
                            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                                <span style={{ color: '#16a34a' }}>• New Added: {importStats.newCount}</span>
                                <span style={{ marginLeft: '20px', color: '#2563eb' }}>• Updated: {importStats.updatedCount}</span>
                            </div>
                            {importStats.failed > 0 && <span> <strong>{importStats.failed}</strong> records could not be imported.</span>}
                        </p>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
                            <button 
                                onClick={() => setActiveReportTab('success')}
                                style={{
                                    padding: '10px 20px', border: 'none', background: 'none',
                                    borderBottom: activeReportTab === 'success' ? '2px solid #16a34a' : 'none',
                                    color: activeReportTab === 'success' ? '#16a34a' : 'var(--text-muted)',
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
                                    color: activeReportTab === 'error' ? '#dc2626' : 'var(--text-muted)',
                                    fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                <i className="fas fa-times-circle" style={{ marginRight: '8px' }}></i> Failure Report ({importErrors.length})
                            </button>
                        </div>

                        {activeReportTab === 'success' && (
                            <div style={{ marginBottom: '32px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Import Audit Trail</h3>
                                    <button
                                        onClick={() => {
                                            const csv = generateSuccessReportCSV(importSuccessLogs);
                                            downloadFile(csv, `import_success_${module}_${Date.now()}.csv`);
                                        }}
                                        style={{
                                            background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#16a34a',
                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem',
                                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-file-excel"></i> Download Audit CSV
                                    </button>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead style={{ background: 'var(--bg-light)', position: 'sticky', top: 0 }}>
                                                <tr>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Identifier</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Project</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Block</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Status</th>
                                                    {module === 'propertyOwners' && <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Action</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importSuccessLogs.length === 0 ? (
                                                    <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No records processed in this batch.</td></tr>
                                                ) : importSuccessLogs.map((log, idx) => (
                                                    <tr key={idx} style={{ borderBottom: idx === importSuccessLogs.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '12px', color: 'var(--text-main)', fontWeight: 600 }}>{log.unitNo || 'N/A'}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{log.project || 'N/A'}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{log.block || 'N/A'}</td>
                                                        <td style={{ padding: '12px' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: '4px', background: log.status === 'Conflict Pending' ? 'var(--danger-bg)' : '#dcfce7', color: log.status === 'Conflict Pending' ? '#dc2626' : '#16a34a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>{log.status}</span>
                                                        </td>
                                                        {module === 'propertyOwners' && (
                                                            <td style={{ padding: '12px' }}>
                                                                {log.status === 'Conflict Pending' && (
                                                                    <button
                                                                        onClick={() => { 
                                                                            setStep(4); 
                                                                            if (log.rowKey) setExpandedConflictRow(log.rowKey);
                                                                            setTimeout(() => conflictSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); 
                                                                        }}
                                                                        style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #fca5a5', background: 'var(--danger-bg)', color: '#dc2626', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                                                    >
                                                                        <i className="fas fa-arrow-left"></i> Resolve Now
                                                                    </button>
                                                                )}
                                                            </td>
                                                        )}
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
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Failure Details</h3>
                                    <button
                                        onClick={() => {
                                            const csv = generateErrorReportCSV(importErrors);
                                            downloadFile(csv, `import_errors_${module}_${Date.now()}.csv`);
                                        }}
                                        style={{
                                            background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: '#dc2626',
                                            padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem',
                                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-download"></i> Download Error CSV
                                    </button>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead style={{ background: 'var(--bg-light)', position: 'sticky', top: 0 }}>
                                                <tr>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Row</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Item/Name</th>
                                                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importErrors.length === 0 ? (
                                                    <tr><td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No errors found. All records processed successfully.</td></tr>
                                                ) : importErrors.map((err, idx) => (
                                                    <tr key={idx} style={{ borderBottom: idx === importErrors.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{err.row}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-main)', fontWeight: 600 }}>{err.name}</td>
                                                        <td style={{ padding: '12px', color: '#dc2626' }}>{err.reason}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                {importErrors.length > 0 && (
                                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
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
                <div style={{ padding: '20px 40px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--bg-card)' }}>
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
