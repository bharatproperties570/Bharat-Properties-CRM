import { useState, useEffect, useMemo } from 'react';
// PROJECTS_LIST import removed, using context instead
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';
import CustomizeFeedbackPage from './CustomizeFeedbackPage';
import { generateCSV, downloadFile } from "../../../utils/dataManagementUtils";

// ✅ ENTERPRISE: SizeItem — shows projectMappings as "Available In" badges
const SizeItem = ({ size, onEdit, onDelete, onManageAvailability, isSelected, onToggleSelect }) => {
    const mappings = Array.isArray(size.projectMappings) ? size.projectMappings : [];
    const visibleMappings = mappings.slice(0, 2);
    const extraCount = mappings.length - visibleMappings.length;
    return (
        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '14px 16px', width: '40px' }}>
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                />
            </td>
            <td style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{size.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{size.unitType}</div>
            </td>
            <td style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{size.category}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{size.subCategory}</div>
            </td>
            <td style={{ padding: '14px 16px' }}>
                {(() => {
                    if (size.saleableArea) return <span style={{ fontWeight: 700, color: '#1e40af' }}>{size.saleableArea} Sq Ft</span>;
                    if (size.totalArea) return <span style={{ fontWeight: 700, color: '#1e40af' }}>{size.totalArea} {size.resultMetric || 'Sq Yd'}</span>;
                    return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</span>;
                })()}
            </td>
            <td style={{ padding: '14px 16px' }}>
                {mappings.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b', background: '#fffbeb', padding: '3px 8px', borderRadius: '99px', border: '1px solid #fde68a' }}>Not assigned</span>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {visibleMappings.map((m, i) => (
                            <span key={i} style={{ fontSize: '0.7rem', background: 'rgba(37,99,235,0.08)', color: '#2563eb', padding: '3px 8px', borderRadius: '99px', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                {m.project}{m.block ? ` › ${m.block}` : ''}
                            </span>
                        ))}
                        {extraCount > 0 && (
                            <span style={{ fontSize: '0.7rem', background: 'var(--bg-light)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: '99px', border: '1px solid var(--border-color)' }}>+{extraCount} more</span>
                        )}
                    </div>
                )}
            </td>
            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button onClick={() => onManageAvailability(size)} title="Manage Project Availability"
                        style={{ height: '30px', padding: '0 10px', borderRadius: '6px', border: 'none', background: 'rgba(37,99,235,0.08)', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(37,99,235,0.2)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(37,99,235,0.08)'}>
                        <i className="fas fa-project-diagram" style={{ marginRight: '4px' }}></i>Projects
                    </button>
                    <button onClick={() => onEdit(size)} title="Edit Size"
                        style={{ width: '30px', height: '30px', borderRadius: '6px', border: 'none', background: 'var(--bg-light)', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; e.currentTarget.style.color = '#3b82f6'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        <i className="fas fa-edit"></i>
                    </button>
                    <button onClick={() => onDelete(size.id)} title="Delete Size"
                        style={{ width: '30px', height: '30px', borderRadius: '6px', border: 'none', background: 'var(--bg-light)', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = '#ef4444'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-light)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    );
};

// ✅ ENTERPRISE: SizeAvailabilityModal — Manage which projects/blocks a size is assigned to
const SizeAvailabilityModal = ({ isOpen, onClose, size, allProjects, onAddMapping, onRemoveMapping }) => {
    const [selProject, setSelProject] = useState('');
    const [selBlock, setSelBlock] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const availableBlocks = useMemo(() => {
        if (!selProject || !Array.isArray(allProjects)) return [];
        const proj = allProjects.find(p => p.name === selProject);
        return proj?.blocks || [];
    }, [selProject, allProjects]);

    const handleAdd = async () => {
        if (!selProject) return;
        setIsSaving(true);
        await onAddMapping(size.id, selProject, selBlock);
        setSelProject('');
        setSelBlock('');
        setIsSaving(false);
    };

    const handleRemove = async (project, block) => {
        await onRemoveMapping(size.id, project, block);
    };

    if (!isOpen || !size) return null;
    const mappings = Array.isArray(size.projectMappings) ? size.projectMappings : [];
    const selectStyle = { width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-main)', boxSizing: 'border-box' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card)', width: '540px', borderRadius: '14px', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Manage Project Availability</h3>
                        <div style={{ marginTop: '6px', background: 'rgba(37,99,235,0.08)', padding: '6px 12px', borderRadius: '6px', display: 'inline-block' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb' }}>{size.name}</span>
                        </div>
                    </div>
                    <i className="fas fa-times" onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}></i>
                </div>

                {/* Current Mappings */}
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Currently Assigned To</div>
                    {mappings.length === 0 ? (
                        <div style={{ padding: '20px', background: '#fffbeb', borderRadius: '8px', border: '1px dashed #fde68a', textAlign: 'center', color: '#92400e', fontSize: '0.85rem' }}>
                            <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                            Not assigned to any project yet. Assign below to make it appear in forms.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {mappings.map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{m.project}</span>
                                        {m.block && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> › {m.block}</span>}
                                    </div>
                                    <button onClick={() => handleRemove(m.project, m.block)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}
                                        onMouseOver={e => e.currentTarget.style.background = 'var(--danger-bg)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        title="Remove from this project">
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add New Mapping */}
                <div style={{ padding: '16px', background: 'var(--bg-light)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Assign to a Project</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Project *</label>
                            <select value={selProject} onChange={e => { setSelProject(e.target.value); setSelBlock(''); }} style={selectStyle}>
                                <option value="">Select Project</option>
                                {Array.isArray(allProjects) && allProjects.map(p => (
                                    <option key={p.id} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Block / Tower</label>
                            <select value={selBlock} onChange={e => setSelBlock(e.target.value)} style={selectStyle} disabled={!selProject}>
                                <option value="">{selProject ? 'All Blocks (Optional)' : '— Select project first —'}</option>
                                {availableBlocks.map(b => {
                                    const bName = typeof b === 'object' ? b.name : b;
                                    return <option key={bName} value={bName}>{bName}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                    <button onClick={handleAdd} disabled={!selProject || isSaving}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: selProject ? '#2563eb' : 'var(--border-color)', color: selProject ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem', cursor: selProject ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
                        {isSaving ? 'Saving...' : 'Assign to Project'}
                    </button>
                </div>

                <button onClick={onClose} style={{ marginTop: '16px', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
        </div>
    );
};


// ✅ ENTERPRISE: AddSizeModal — Project/Block removed from size definition
// Project/Block assignment is handled via SizeAvailabilityModal after save
const AddSizeModal = ({ isOpen, onClose, onAdd, initialData, propertyConfig, allProjects, existingSizes }) => {
    const defaultState = useMemo(() => ({
        name: '',
        unitType: '',
        category: 'Residential',
        subCategory: 'Flat/Apartment / Builder Floor',
        saleableArea: '',
        coveredArea: '',
        carpetArea: '',
        length: '',
        width: '',
        lengthMetric: 'Feet',
        widthMetric: 'Feet',
        totalArea: '',
        resultMetric: 'Sq Yd',
        description: '',
        projectMappings: []
    }), []);

    const [sizeData, setSizeData] = useState(defaultState);
    const [nameConflict, setNameConflict] = useState(false);
    // Quick-assign: allow adding one project/block mapping right from Add form
    const [quickProject, setQuickProject] = useState('');
    const [quickBlock, setQuickBlock] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setSizeData(initialData);
            } else {
                const initialCat = propertyConfig && Object.keys(propertyConfig).length > 0 ? Object.keys(propertyConfig)[0] : '';
                const initialSub = initialCat && Array.isArray(propertyConfig[initialCat]?.subCategories) && propertyConfig[initialCat].subCategories.length > 0
                    ? propertyConfig[initialCat].subCategories[0].name
                    : '';
                setSizeData({ ...defaultState, category: initialCat || 'Residential', subCategory: initialSub });
            }
            setQuickProject('');
            setQuickBlock('');
            setNameConflict(false);
        }
    }, [isOpen, initialData, propertyConfig, defaultState]);

    const quickBlocks = useMemo(() => {
        if (!quickProject || !Array.isArray(allProjects)) return [];
        const proj = allProjects.find(p => p.name === quickProject);
        return proj?.blocks || [];
    }, [quickProject, allProjects]);

    // Auto-generate name from unitType + area
    useEffect(() => {
        const isPlot = ['plot', 'land', 'shop', 'showroom', 'commercial land', 'industrial land'].some(k => sizeData.subCategory?.toLowerCase().includes(k));
        let areaPart = '';
        if (isPlot) {
            areaPart = sizeData.totalArea ? `(${sizeData.totalArea} ${sizeData.resultMetric})` : '';
        } else {
            areaPart = sizeData.saleableArea ? `(${sizeData.saleableArea} Sq Ft)` : '';
        }
        const generatedName = `${sizeData.unitType} ${areaPart}`.trim();
        setSizeData(prev => ({ ...prev, name: generatedName }));
    }, [sizeData.unitType, sizeData.totalArea, sizeData.saleableArea, sizeData.resultMetric, sizeData.subCategory]);

    // ✅ ENTERPRISE: Real-time duplicate check — globally unique name
    useEffect(() => {
        if (!sizeData.name || !Array.isArray(existingSizes)) { setNameConflict(false); return; }
        const editingId = initialData?.id;
        const conflict = existingSizes.some(s => s.name === sizeData.name && s.id !== editingId);
        setNameConflict(conflict);
    }, [sizeData.name, existingSizes, initialData]);

    // Auto-calculate area from dimensions (plots)
    useEffect(() => {
        if (sizeData.length && sizeData.width) {
            const l = parseFloat(sizeData.length);
            const w = parseFloat(sizeData.width);
            if (!isNaN(l) && !isNaN(w)) {
                const toMeters = (val, metric) => {
                    if (metric === 'Feet') return val * 0.3048;
                    if (metric === 'Yard') return val * 0.9144;
                    return val;
                };
                const lM = toMeters(l, sizeData.lengthMetric);
                const wM = toMeters(w, sizeData.widthMetric);
                const areaSqM = lM * wM;
                let result = areaSqM;
                if (sizeData.resultMetric === 'Sq Ft') result = areaSqM * 10.7639;
                if (sizeData.resultMetric === 'Sq Yd') result = areaSqM * 1.19599;
                setSizeData(prev => ({ ...prev, totalArea: result.toFixed(2) }));
            }
        }
    }, [sizeData.length, sizeData.width, sizeData.lengthMetric, sizeData.widthMetric, sizeData.resultMetric]);

    const handleMetricChange = (newMetric) => {
        setSizeData(prev => ({ ...prev, lengthMetric: newMetric, widthMetric: newMetric }));
    };

    const handleAddQuickMapping = () => {
        if (!quickProject) return;
        const existing = Array.isArray(sizeData.projectMappings) ? sizeData.projectMappings : [];
        const alreadyAdded = existing.some(m => m.project === quickProject && m.block === (quickBlock || ''));
        if (!alreadyAdded) {
            setSizeData(prev => ({ ...prev, projectMappings: [...existing, { project: quickProject, block: quickBlock || '' }] }));
        }
        setQuickProject('');
        setQuickBlock('');
    };

    const handleRemoveQuickMapping = (idx) => {
        setSizeData(prev => ({ ...prev, projectMappings: prev.projectMappings.filter((_, i) => i !== idx) }));
    };

    if (!isOpen) return null;

    const isPlotType = ['plot', 'land', 'shop', 'showroom', 'commercial land', 'industrial land'].some(k => sizeData.subCategory?.toLowerCase().includes(k));
    const isResidentialType = !isPlotType;

    const handleSubmit = () => {
        if (!sizeData.subCategory) { alert('Please select a Sub-Category.'); return; }
        if (!sizeData.unitType) { alert('Please select a Size Type.'); return; }
        if (nameConflict) { alert(`Size "${sizeData.name}" already exists globally. Change the area to create a different size.`); return; }
        // Pass projectMappings along — context will handle them
        onAdd({ ...sizeData });
        onClose();
    };

    const labelStyle = { fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', display: 'block' };
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', color: 'var(--text-main)', height: '42px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)' };
    const customSelectStyle = { ...inputStyle, paddingRight: '30px', background: 'var(--bg-light)', appearance: 'none', backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card)', width: '620px', borderRadius: '14px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>{initialData ? 'Edit Property Size' : 'Add New Property Size'}</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Size is global — assign to projects below</p>
                    </div>
                    <i className="fas fa-times" onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}></i>
                </div>
                <div style={{ display: 'grid', gap: '20px' }}>
                    {/* Auto-generated name */}
                    <div style={{ background: nameConflict ? '#fef2f2' : 'rgba(37,99,235,0.06)', padding: '14px 16px', borderRadius: '8px', border: `1px solid ${nameConflict ? '#fecaca' : '#bfdbfe'}` }}>
                        <label style={{ ...labelStyle, color: nameConflict ? '#dc2626' : '#1e40af', marginBottom: '6px' }}>Size Name (Auto-Generated)</label>
                        <input type="text" value={sizeData.name} readOnly style={{ ...inputStyle, background: 'transparent', fontWeight: 700, color: nameConflict ? '#dc2626' : '#1e40af', border: 'none', padding: '0', height: 'auto', fontSize: '1.05rem' }} />
                        {nameConflict && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '4px' }}><i className="fas fa-exclamation-circle" style={{ marginRight: '4px' }}></i>This size already exists globally. Change area value to differentiate.</div>}
                    </div>

                    {/* Category / SubCategory / SizeType */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select value={sizeData.category} onChange={e => {
                                const cat = e.target.value;
                                const subs = propertyConfig?.[cat]?.subCategories || [];
                                setSizeData({ ...sizeData, category: cat, subCategory: subs.length > 0 ? subs[0].name : '', unitType: '' });
                            }} style={customSelectStyle}>
                                {propertyConfig && Object.keys(propertyConfig).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Sub Category</label>
                            <select value={sizeData.subCategory} onChange={e => setSizeData({ ...sizeData, subCategory: e.target.value, unitType: '' })} style={customSelectStyle}>
                                {propertyConfig && Array.isArray(propertyConfig[sizeData.category]?.subCategories) && propertyConfig[sizeData.category].subCategories.map(sub => (
                                    <option key={sub.name} value={sub.name}>{sub.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Size Type *</label>
                            <select value={sizeData.unitType} onChange={e => setSizeData({ ...sizeData, unitType: e.target.value })} style={customSelectStyle}>
                                <option value="">Select Size Type</option>
                                {(() => {
                                    if (!propertyConfig) return null;
                                    const subCatObj = Array.isArray(propertyConfig[sizeData.category]?.subCategories)
                                        ? propertyConfig[sizeData.category].subCategories.find(s => s.name === sizeData.subCategory)
                                        : null;
                                    return subCatObj?.types?.map(t => { const typeName = typeof t === 'string' ? t : t.name; return <option key={typeName} value={typeName}>{typeName}</option>; });
                                })()}
                            </select>
                        </div>
                    </div>

                    {/* Area Details */}
                    {isResidentialType && (
                        <div style={{ background: 'var(--bg-light)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 700 }}>Residential Area Details (Sq Ft)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div><label style={labelStyle}>Total/Saleable Area</label><input type="number" placeholder="e.g. 1120" value={sizeData.saleableArea} onChange={e => setSizeData({ ...sizeData, saleableArea: e.target.value })} style={inputStyle} /></div>
                                <div><label style={labelStyle}>Covered Area</label><input type="number" placeholder="Optional" value={sizeData.coveredArea} onChange={e => setSizeData({ ...sizeData, coveredArea: e.target.value })} style={inputStyle} /></div>
                                <div><label style={labelStyle}>Carpet Area</label><input type="number" placeholder="Optional" value={sizeData.carpetArea} onChange={e => setSizeData({ ...sizeData, carpetArea: e.target.value })} style={inputStyle} /></div>
                            </div>
                        </div>
                    )}
                    {isPlotType && (
                        <div style={{ background: 'var(--bg-light)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 700 }}>Dimensions &amp; Area Calculator</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Width</label>
                                    <div style={{ display: 'flex' }}>
                                        <input type="number" value={sizeData.width} onChange={e => setSizeData({ ...sizeData, width: e.target.value })} style={{ ...inputStyle, borderRight: 'none', borderRadius: '6px 0 0 6px' }} />
                                        <select value={sizeData.widthMetric} onChange={e => handleMetricChange(e.target.value)} style={{ ...inputStyle, width: '90px', borderRadius: '0 6px 6px 0', background: 'var(--bg-card)' }}><option>Meter</option><option>Feet</option><option>Yard</option></select>
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Length</label>
                                    <div style={{ display: 'flex' }}>
                                        <input type="number" value={sizeData.length} onChange={e => setSizeData({ ...sizeData, length: e.target.value })} style={{ ...inputStyle, borderRight: 'none', borderRadius: '6px 0 0 6px' }} />
                                        <select value={sizeData.lengthMetric} onChange={e => handleMetricChange(e.target.value)} style={{ ...inputStyle, width: '90px', borderRadius: '0 6px 6px 0', background: 'var(--bg-card)' }}><option>Meter</option><option>Feet</option><option>Yard</option></select>
                                    </div>
                                </div>
                            </div>
                            <div style={{ background: 'rgba(37,99,235,0.08)', padding: '12px 16px', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e40af' }}>Total Area</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e40af' }}>{sizeData.totalArea || '0.00'} <span style={{ fontSize: '0.85rem' }}>{sizeData.resultMetric}</span></div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>{['Sq Meter', 'Sq Ft', 'Sq Yd'].map(m => (<button key={m} onClick={() => setSizeData({ ...sizeData, resultMetric: m })} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: sizeData.resultMetric === m ? '#1e40af' : 'var(--bg-card)', color: sizeData.resultMetric === m ? '#fff' : '#1e40af', border: '1px solid #1e40af', cursor: 'pointer' }}>{m}</button>))}</div>
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label style={labelStyle}>Description (Optional)</label>
                        <textarea placeholder="Specific layout details..." value={sizeData.description} onChange={e => setSizeData({ ...sizeData, description: e.target.value })} style={{ ...inputStyle, minHeight: '56px', resize: 'vertical', height: 'auto' }} />
                    </div>

                    {/* ✅ Quick Project Assignment — optional, can also do later via Manage */}
                    <div style={{ background: 'var(--bg-light)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <label style={{ ...labelStyle, marginBottom: 0, fontSize: '0.85rem' }}><i className="fas fa-project-diagram" style={{ marginRight: '6px', color: '#2563eb' }}></i>Assign to Projects (Optional)</label>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Can also assign later via Projects button</span>
                        </div>
                        {/* Current quick mappings */}
                        {Array.isArray(sizeData.projectMappings) && sizeData.projectMappings.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                {sizeData.projectMappings.map((m, i) => (
                                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37,99,235,0.1)', color: '#1e40af', padding: '4px 10px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                                        {m.project}{m.block ? ` › ${m.block}` : ''}
                                        <i className="fas fa-times" style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => handleRemoveQuickMapping(i)}></i>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                            <div>
                                <select value={quickProject} onChange={e => { setQuickProject(e.target.value); setQuickBlock(''); }} style={{ ...inputStyle, background: 'var(--bg-card)' }}>
                                    <option value="">Select Project</option>
                                    {Array.isArray(allProjects) && allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <select value={quickBlock} onChange={e => setQuickBlock(e.target.value)} style={{ ...inputStyle, background: 'var(--bg-card)' }} disabled={!quickProject}>
                                    <option value="">{quickProject ? 'All Blocks (Optional)' : '—'}</option>
                                    {quickBlocks.map(b => { const bName = typeof b === 'object' ? b.name : b; return <option key={bName} value={bName}>{bName}</option>; })}
                                </select>
                            </div>
                            <button onClick={handleAddQuickMapping} disabled={!quickProject}
                                style={{ height: '42px', padding: '0 14px', borderRadius: '6px', border: 'none', background: quickProject ? '#2563eb' : 'var(--border-color)', color: quickProject ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: quickProject ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
                    <button onClick={handleSubmit} disabled={nameConflict}
                        style={{ flex: 1, padding: '12px 24px', fontSize: '0.95rem', fontWeight: 700, border: 'none', borderRadius: '8px', background: nameConflict ? 'var(--border-color)' : '#2563eb', color: nameConflict ? 'var(--text-muted)' : '#fff', cursor: nameConflict ? 'not-allowed' : 'pointer' }}>
                        {initialData ? 'Update Size' : 'Save Size'}
                    </button>
                    <button onClick={onClose} style={{ flex: 1, padding: '12px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '0.95rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}>Cancel</button>
                </div>
            </div>
        </div>
    );
};




const InputModal = ({ isOpen, onClose, onConfirm, title, defaultValue = '', placeholder = '' }) => {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
        if (isOpen) setValue(defaultValue);
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(value);
        onClose();
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card)', width: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{title}</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        autoFocus
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', marginBottom: '20px', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)' }}>Cancel</button>
                        <button type="submit" style={{ padding: '8px 16px', border: 'none', background: '#2563eb', color: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, message }) => {
    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card)', width: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Confirm Action</h3>
                <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>{message}</p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)' }}>Cancel</button>
                    <button type="button" onClick={() => { onConfirm(); onClose(); }} style={{ padding: '8px 16px', border: 'none', background: '#ef4444', color: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                </div>
            </div>
        </div>
    );
};

const PropertySettingsPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSize, setEditingSize] = useState(null);
    const [availabilityModalSize, setAvailabilityModalSize] = useState(null);
    const [selectedSizeIds, setSelectedSizeIds] = useState([]);
    const [bulkProjectModal, setBulkProjectModal] = useState(false);
    const [bulkProject, setBulkProject] = useState('');
    const [bulkBlock, setBulkBlock] = useState('');
    const [isBulkSaving, setIsBulkSaving] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState([]);
    const [importError, setImportError] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [activeTab, setActiveTab] = useState('Sizes');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [sizeFilters, setSizeFilters] = useState({
        project: '',
        block: '',
        category: '',
        subCategory: '',
        unitType: ''
    });

    const context = usePropertyConfig();

    const {
        propertyConfig = {}, updateConfig = () => {}, masterFields = {}, updateMasterFields = () => {},
        sizes = [], addSize = () => {}, updateSize = () => {}, deleteSize = () => {},
        addSizeProjectMapping = () => {}, removeSizeProjectMapping = () => {},
        projects = [],
        syncCategoryLookup = () => {}, syncSubCategoryLookup = () => {}, syncPropertyTypeLookup = () => {}, syncBuiltupTypeLookup = () => {},
        getLookupId = () => {}, findLookup = () => {}
    } = context || {};

    const safeProjects = useMemo(() => Array.isArray(projects) ? projects : [], [projects]);

    const [configCategory, setConfigCategory] = useState(() => propertyConfig && Object.keys(propertyConfig).length > 0 ? Object.keys(propertyConfig)[0] : null);

    useEffect(() => {
        if (!configCategory && propertyConfig && Object.keys(propertyConfig).length > 0) {
            setConfigCategory(Object.keys(propertyConfig)[0]);
        }
    }, [propertyConfig, configCategory]);

    const [configSubCategory, setConfigSubCategory] = useState(null);
    const [configType, setConfigType] = useState(null);
    const [activeOrientationField, setActiveOrientationField] = useState('facings');


    const [inputModal, setInputModal] = useState({
        isOpen: false,
        title: '',
        defaultValue: '',
        onConfirm: () => { }
    });

    const openInputModal = (title, defaultValue, onConfirm) => {
        setInputModal({ isOpen: true, title, defaultValue, onConfirm });
    };

    const closeInputModal = () => {
        setInputModal({ ...inputModal, isOpen: false });
    };

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        message: '',
        onConfirm: () => { }
    });

    const openConfirmModal = (message, onConfirm) => {
        setConfirmModal({ isOpen: true, message, onConfirm });
    };

    const closeConfirmModal = () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
    };

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    if (!context) {
        return <div style={{ padding: '20px', color: 'red' }}>Error: PropertyConfigContext unavailable.</div>;
    }


    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ ...notification, show: false }), 3000);
    };

    // ---------------- EXPORT HANDLERS ----------------
    const handleExportSizes = (filterProject = 'All', filterBlock = 'All') => {
        let exportData = sizes || [];

        if (filterProject !== 'All') {
            exportData = exportData.filter(s => s.project === filterProject);
        }
        if (filterBlock !== 'All') {
            exportData = exportData.filter(s => s.block === filterBlock);
        }

        if (exportData.length === 0) {
            showToast("No sizes to export for the selected criteria", "warning");
            return;
        }

        const dataToExport = exportData.map(s => ({
            ID: s.id || s.name || 'N/A',
            Project: s.project || 'Global',
            Block: s.block || 'N/A',
            Category: s.category || 'N/A',
            SubCategory: s.subCategory || 'N/A',
            Name: s.name || 'N/A',
            Description: s.description || ''
        }));
        const csvContent = generateCSV(dataToExport);
        const fileName = `property_sizes_${filterProject}_${filterBlock}_${new Date().toISOString().split('T')[0]}.csv`;
        downloadFile(csvContent, fileName);
        showToast("Export successful!");
        setIsExportModalOpen(false);
    };

    const handleExportConfigHierarchy = (items, type, context = {}) => {
        if (!items || items.length === 0) {
            showToast(`No ${type.replace(/_/g, ' ')} to export`, "warning");
            return;
        }

        const typeMap = {
            'Categories': 'Category',
            'Sub_Categories': 'SubCategory',
            'Types': 'PropertyType',
            'Builtup': 'BuiltupType'
        };

        const lookupType = typeMap[type];

        const dataToExport = items.map(item => {
            const isObject = typeof item === 'object' && item !== null;
            let name = isObject ? (item.name || item.lookup_value || item.lookup_value) : String(item);
            name = name ? name.trim() : name;
            
            // Prioritize already stored ID for professional data consistency
            let id = isObject && (item.id || item._id) ? (item.id || item._id) : null;

            // If no ID exists, attempt hierarchical resolution via findLookup
            if (!id && lookupType && findLookup) {
                let parentId = null;
                if (type === 'Sub_Categories') parentId = context.categoryId;
                else if (type === 'Types') parentId = context.subCategoryId;
                else if (type === 'Builtup') parentId = context.typeId;

                // A. Try strict hierarchical lookup
                const match = findLookup(lookupType, name, parentId);
                if (match) id = match._id || match.id;
                
                // B. Fallback: Search globally within the lookup type (ignore parent if match failed)
                if (!id) {
                    const globalMatch = findLookup(lookupType, name);
                    if (globalMatch) id = globalMatch._id || globalMatch.id;
                }

                // C. Final Fallback: Use getLookupId (covers case-insensitivity and global mapping)
                if (!id && getLookupId) {
                    id = getLookupId(lookupType, name);
                }
            }

            return {
                Backend_ID: id || 'N/A',
                Display_Value: name
            };
        });

        const csvContent = generateCSV(dataToExport);
        const timestamp = new Date().toISOString().split('T')[0];
        downloadFile(csvContent, `property_config_${type.toLowerCase()}_${timestamp}.csv`);
        showToast("Export successful!");
    };

    const handleExportOrientation = () => {
        const currentList = masterFields[activeOrientationField];
        if (!currentList || currentList.length === 0) {
            showToast("No items to export", "warning");
            return;
        }

        const fieldToLookupType = {
            facings: 'Facing',
            directions: 'Direction',
            roadWidths: 'RoadWidth',
            unitTypes: 'UnitType',
            relations: 'Relation'
        };

        const lookupType = fieldToLookupType[activeOrientationField] || activeOrientationField;

        const dataToExport = currentList.map(item => ({
            Backend_ID: getLookupId(lookupType, item) || 'N/A',
            Display_Value: item
        }));

        const csvContent = generateCSV(dataToExport);
        downloadFile(csvContent, `property_orientation_${activeOrientationField}_${new Date().toISOString().split('T')[0]}.csv`);
        showToast("Export successful!");
    };

    const handleAddMasterItem = () => {
        openInputModal(`Enter new ${activeOrientationField.slice(0, -1)}`, '', (value) => {
            if (value) {
                const currentList = masterFields[activeOrientationField] || [];
                const itemExists = currentList.some(item => {
                    const itemName = typeof item === 'object' ? item.name : item;
                    return itemName?.toLowerCase() === value.toLowerCase();
                });

                if (!itemExists) {
                    updateMasterFields(activeOrientationField, value, 'add');
                } else {
                    alert("Item already exists.");
                }
            }
        });
    };

    const handleDeleteMasterItem = (item) => {
        const itemName = typeof item === 'object' ? item.name : item;
        const deleteValue = typeof item === 'object' ? (item.id || item.name) : item;
        
        openConfirmModal(`Remove '${itemName}'?`, () => {
            updateMasterFields(activeOrientationField, deleteValue, 'delete');
        });
    };

    const handleAddCategory = () => {
        openInputModal("Enter new Category name:", '', async (name) => {
            if (name && !propertyConfig[name]) {
                await syncCategoryLookup(name, 'add');
                showToast(`Category '${name}' added successfully`);
            } else if (name) {
                alert("Category already exists or invalid name.");
            }
        });
    };

    const handleEditCategory = (oldName) => {
        openInputModal("Edit Category name:", oldName, async (newName) => {
            if (newName && newName !== oldName) {
                await syncCategoryLookup(newName, 'update', oldName);
                if (configCategory === oldName) setConfigCategory(newName);
                showToast(`Category updated to '${newName}'`);
            }
        });
    };

    const handleDeleteCategory = (name) => {
        openConfirmModal(`Delete category '${name}' and all its contents?`, async () => {
            await syncCategoryLookup(name, 'delete');
            if (configCategory === name) {
                setConfigCategory(null);
                setConfigSubCategory(null);
            }
            showToast(`Category '${name}' deleted`);
        });
    };

    const handleAddSubCategory = () => {
        if (!configCategory) return;
        openInputModal(`Enter new Sub-Category for ${configCategory}:`, '', async (name) => {
            if (name) {
                if (Array.isArray(propertyConfig[configCategory]?.subCategories) && propertyConfig[configCategory].subCategories.some(s => s.name === name)) {
                    alert("Sub-Category already exists.");
                    return;
                }
                await syncSubCategoryLookup(configCategory, name, 'add');
                showToast(`Sub-Category '${name}' added`);
            }
        });
    };

    const handleEditSubCategory = (oldName) => {
        openInputModal("Edit Sub-Category name:", oldName, async (newName) => {
            if (newName && newName !== oldName) {
                const subCategories = propertyConfig[configCategory]?.subCategories;
                if (!Array.isArray(subCategories)) return;

                const subIndex = subCategories.findIndex(s => s.name === oldName);
                if (subIndex > -1) {
                    await syncSubCategoryLookup(configCategory, newName, 'update', oldName);
                    if (configSubCategory === oldName) setConfigSubCategory(newName);
                    showToast(`Sub-Category updated to '${newName}'`);
                }
            }
        });
    };

    const handleDeleteSubCategory = (name) => {
        openConfirmModal(`Delete sub-category '${name}'?`, async () => {
            if (propertyConfig[configCategory] && Array.isArray(propertyConfig[configCategory].subCategories)) {
                await syncSubCategoryLookup(configCategory, name, 'delete');
                if (configSubCategory === name) setConfigSubCategory(null);
                showToast(`Sub-Category '${name}' deleted`);
            }
        });
    };

    const handleAddType = () => {
        if (!configCategory || !configSubCategory) return;
        openInputModal(`Enter new Size Type for ${configSubCategory}:`, '', async (name) => {
            if (name) {
                const subIndex = propertyConfig[configCategory]?.subCategories?.findIndex(s => s.name === configSubCategory) ?? -1;
                if (subIndex > -1) {
                    const types = propertyConfig[configCategory].subCategories[subIndex].types || [];
                    if (!types.some(t => t.name === name)) {
                        await syncPropertyTypeLookup(configCategory, configSubCategory, name, 'add');
                        showToast(`Size Type '${name}' added`);
                    } else {
                        alert("Size Type already exists.");
                    }
                }
            }
        });
    };

    const handleEditType = (oldName) => {
        openInputModal("Edit Size Type name:", oldName, async (newName) => {
            if (newName && newName !== oldName) {
                const subIndex = propertyConfig[configCategory]?.subCategories?.findIndex(s => s.name === configSubCategory) ?? -1;
                if (subIndex > -1) {
                    const types = propertyConfig[configCategory].subCategories[subIndex].types || [];
                    const typeObj = types.find(t => t.name === oldName);
                    if (typeObj) {
                        await syncPropertyTypeLookup(configCategory, configSubCategory, newName, 'update', oldName);
                        if (configType === oldName) setConfigType(newName);
                        showToast(`Size Type updated to '${newName}'`);
                    }
                }
            }
        });
    };

    const handleDeleteType = (name) => {
        openConfirmModal(`Delete size type '${name}'?`, async () => {
            const subCategories = propertyConfig[configCategory]?.subCategories;
            if (!Array.isArray(subCategories)) return;

            const subIndex = subCategories.findIndex(s => s.name === configSubCategory);
            if (subIndex > -1) {
                const types = subCategories[subIndex].types;
                if (Array.isArray(types)) {
                    await syncPropertyTypeLookup(configCategory, configSubCategory, name, 'delete');
                    if (configType === name) setConfigType(null);
                    showToast(`Size Type '${name}' deleted`);
                }
            }
        });
    };

    const handleAddBuiltupType = () => {
        if (!configCategory || !configSubCategory) return;
        openInputModal(`Enter new Builtup Type:`, '', async (name) => {
            if (name) {
                const subCatObj = propertyConfig[configCategory]?.subCategories?.find(s => s.name === configSubCategory);
                if (subCatObj) {
                    const exists = subCatObj.builtupTypes?.some(b => (typeof b === 'object' ? b.name : b) === name);
                    if (!exists) {
                        const res = await syncBuiltupTypeLookup(configCategory, configSubCategory, name, 'add');
                        if (res && (res._id || res.id)) {
                            showToast(`Builtup Type '${name}' added to sub-category.`);
                        } else {
                            console.error("[PropertySettingsPage] Add failed for Builtup Type", name);
                        }
                    } else {
                        alert("Builtup Type already exists in this sub-category.");
                    }
                }
            }
        });
    };

    const handleEditBuiltupType = (oldName) => {
        openInputModal("Edit Builtup Type name:", oldName, async (newName) => {
            if (newName && newName !== oldName) {
                const subCatObj = propertyConfig[configCategory]?.subCategories?.find(s => s.name === configSubCategory);
                if (subCatObj) {
                    const index = subCatObj.builtupTypes?.findIndex(b => (typeof b === 'object' ? b.name : b) === oldName);
                    if (index > -1) {
                        const res = await syncBuiltupTypeLookup(configCategory, configSubCategory, newName, 'update', oldName);
                        if (res) {
                            showToast(`Builtup Type updated to '${newName}'.`);
                        }
                    }
                }
            }
        });
    };

    const handleDeleteBuiltupType = (name) => {
        openConfirmModal(`Delete Builtup Type '${name}'?`, async () => {
            const subCatObj = propertyConfig[configCategory]?.subCategories?.find(s => s.name === configSubCategory);
            if (subCatObj) {
                if (subCatObj.builtupTypes?.some(b => (typeof b === 'object' ? (b._id || b.id || b.name) : b) === name)) {
                    await syncBuiltupTypeLookup(configCategory, configSubCategory, name, 'delete');
                    showToast(`Builtup Type '${name}' deleted.`);
                }
            }
        });
    };

    const handleSaveSize = async (sizeData) => {
        try {
            if (editingSize) {
                await updateSize({ ...sizeData, id: editingSize.id });
                showToast('Property size updated successfully');
            } else {
                // ✅ ENTERPRISE: Global duplicate check — same name cannot exist anywhere
                const isDuplicate = sizes.some(s => s.name === sizeData.name);
                if (isDuplicate) {
                    alert(`Size "${sizeData.name}" already exists globally. Change the area value to create a different size.`);
                    return;
                }
                await addSize(sizeData);
                showToast('Property size added successfully');
            }
            setIsModalOpen(false);
            setEditingSize(null);
        } catch (error) {
            console.error('Failed to save size:', error);
            showToast('Error saving size configuration', 'error');
        }
    };

    const handleEditOpen = (size) => {
        setEditingSize(size);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSize(null);
    };

    const handleToggleSelect = (id) => {
        setSelectedSizeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const handleSelectAll = () => {
        if (selectedSizeIds.length === paginatedSizes.length) {
            setSelectedSizeIds([]);
        } else {
            setSelectedSizeIds(paginatedSizes.map(s => s.id));
        }
    };
    const handleBulkAssign = async () => {
        if (!bulkProject || selectedSizeIds.length === 0) return;
        setIsBulkSaving(true);
        try {
            for (const sizeId of selectedSizeIds) {
                await addSizeProjectMapping(sizeId, bulkProject, bulkBlock);
            }
            showToast(`Assigned ${selectedSizeIds.length} sizes to ${bulkProject}${bulkBlock ? ' › ' + bulkBlock : ''}`);
            setSelectedSizeIds([]);
            setBulkProjectModal(false);
            setBulkProject('');
            setBulkBlock('');
        } catch (e) {
            showToast('Bulk assign failed', 'error');
        } finally {
            setIsBulkSaving(false);
        }
    };

    const handleImportFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportFile(file);
        setImportError('');
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target.result;
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) { setImportError('CSV must have at least a header row and one data row.'); return; }
                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const requiredHeaders = ['name', 'unitType', 'category', 'subCategory'];
                const missing = requiredHeaders.filter(h => !headers.includes(h));
                if (missing.length > 0) { setImportError(`Missing required columns: ${missing.join(', ')}`); return; }
                const rows = lines.slice(1).map(line => {
                    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    const obj = {};
                    headers.forEach((h, i) => obj[h] = vals[i] || '');
                    return obj;
                });
                setImportPreview(rows.slice(0, 5));
                setImportFile({ file, rows, headers });
            } catch (err) {
                setImportError('Failed to parse CSV file. Please check the format.');
            }
        };
        reader.readAsText(file);
    };

    const handleImportConfirm = async () => {
        if (!importFile || !importFile.rows) return;
        setIsImporting(true);
        let added = 0, skipped = 0;
        try {
            for (const row of importFile.rows) {
                if (!row.name || !row.unitType || !row.category || !row.subCategory) { skipped++; continue; }
                const isDuplicate = sizes.some(s => s.name === row.name);
                if (isDuplicate) { skipped++; continue; }
                const sizeData = {
                    name: row.name,
                    unitType: row.unitType,
                    category: row.category,
                    subCategory: row.subCategory,
                    saleableArea: row.saleableArea || '',
                    coveredArea: row.coveredArea || '',
                    carpetArea: row.carpetArea || '',
                    totalArea: row.totalArea || '',
                    resultMetric: row.resultMetric || 'Sq Yd',
                    description: row.description || '',
                    projectMappings: []
                };
                await addSize(sizeData);
                added++;
            }
            showToast(`Import complete: ${added} added, ${skipped} skipped (duplicates/invalid)`);
            setIsImportModalOpen(false);
            setImportFile(null);
            setImportPreview([]);
        } catch (err) {
            showToast('Import failed: ' + err.message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleDeleteSize = (id) => {
        deleteSize(id);
        showToast('Property size deleted', 'info');
    };

    // ✅ ENTERPRISE: Multi-field search + projectMappings-based project/block filter
    const filteredSizes = (sizes || []).filter(s => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || (
            (s.name || '').toLowerCase().includes(q) ||
            (s.unitType || '').toLowerCase().includes(q) ||
            (s.category || '').toLowerCase().includes(q) ||
            (s.subCategory || '').toLowerCase().includes(q) ||
            String(s.saleableArea || '').includes(q) ||
            String(s.totalArea || '').includes(q) ||
            String(s.carpetArea || '').includes(q) ||
            (s.description || '').toLowerCase().includes(q)
        );
        // Project/Block filter uses projectMappings (post-migration) with old project field as fallback
        const matchesProject = !sizeFilters.project || (
            (Array.isArray(s.projectMappings) && s.projectMappings.some(m => m.project === sizeFilters.project)) ||
            s.project === sizeFilters.project
        );
        const matchesBlock = !sizeFilters.block || (
            (Array.isArray(s.projectMappings) && s.projectMappings.some(m => m.block === sizeFilters.block)) ||
            s.block === sizeFilters.block
        );
        const matchesCategory = !sizeFilters.category || s.category === sizeFilters.category;
        const matchesSubCategory = !sizeFilters.subCategory || s.subCategory === sizeFilters.subCategory;
        const matchesUnitType = !sizeFilters.unitType || s.unitType === sizeFilters.unitType;
        return matchesSearch && matchesProject && matchesBlock && matchesCategory && matchesSubCategory && matchesUnitType;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredSizes.length / recordsPerPage);
    const paginatedSizes = filteredSizes.slice(
        (currentPage - 1) * recordsPerPage,
        currentPage * recordsPerPage
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    const ActionButtons = ({ onEdit, onDelete }) => (
        <div className="action-buttons" style={{ display: 'flex', gap: '4px' }}>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Edit"><i className="fas fa-edit"></i></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Delete"><i className="fas fa-trash"></i></button>
        </div>
    );

    return (
        <div style={{ flex: 1, background: 'var(--bg-light)', padding: '24px', overflowY: 'auto' }}>
            <div style={{ width: '100%' }}>
                {notification.show && (
                    <Toast
                        message={notification.message}
                        type={notification.type}
                        onClose={() => setNotification({ ...notification, show: false })}
                    />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>Property Configuration</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Manage property sizes, dimensions, and size types.</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border-color)', marginBottom: '32px' }}>
                    {['Sizes', 'Configuration', 'Feedback Outcomes', 'Orientation'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{ padding: '12px 4px', fontSize: '0.95rem', fontWeight: activeTab === tab ? 700 : 500, color: activeTab === tab ? '#3b82f6' : 'var(--text-muted)', borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                {activeTab === 'Sizes' ? (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '24px', width: '100%' }}>
                            {/* Search */}
                            <div style={{ position: 'relative', width: '300px' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                                <input
                                    type="text"
                                    placeholder="Search sizes..."
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    style={{ width: '100%', padding: '10px 10px 10px 36px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    className="btn-primary"
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsModalOpen(true); }}
                                    style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer' }}
                                >
                                    <i className="fas fa-plus"></i> Add Size
                                </button>
                                <button
                                    onClick={() => { setImportFile(null); setImportPreview([]); setImportError(''); setIsImportModalOpen(true); }}
                                    style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                                    title="Import sizes from CSV"
                                >
                                    <i className="fas fa-file-import"></i> Import CSV
                                </button>
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#10b981',
                                        cursor: 'pointer',
                                        fontSize: '1.25rem',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.2s'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                    title="Download as CSV"
                                >
                                    <i className="fas fa-file-download"></i>
                                </button>
                            </div>

                            {/* Spacer to push pagination to right */}
                            <div style={{ flex: 1 }}></div>

                            {/* Pagination Controls */}
                            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                                <div style={{ fontSize: "0.8rem", color: 'var(--text-muted)' }}>
                                    Showing: <strong>{paginatedSizes.length}</strong> /{" "}
                                    <strong>{filteredSizes.length}</strong>
                                </div>

                                {/* Records Per Page */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: 'var(--text-muted)' }}>
                                    <span>Show:</span>
                                    <select
                                        value={recordsPerPage}
                                        onChange={handleRecordsPerPageChange}
                                        style={{ padding: "6px 10px", border: "1px solid var(--border-color)", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: 'var(--text-main)', outline: "none", cursor: "pointer", background: 'var(--bg-card)' }}
                                    >
                                        {[10, 25, 50, 100, 300, 500].map(val => (
                                            <option key={val} value={val}>{val}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Page Nav */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <button
                                        onClick={goToPreviousPage}
                                        disabled={currentPage === 1}
                                        style={{ padding: "6px 12px", border: "1px solid var(--border-color)", borderRadius: "6px", background: currentPage === 1 ? 'var(--bg-light)' : 'var(--bg-card)', color: currentPage === 1 ? 'var(--border-color)' : 'var(--text-main)', cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                                    >
                                        <i className="fas fa-chevron-left"></i> Prev
                                    </button>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: 'var(--text-main)', minWidth: "60px", textAlign: "center" }}>
                                        {currentPage} / {totalPages || 1}
                                    </span>
                                    <button
                                        onClick={goToNextPage}
                                        disabled={currentPage >= totalPages}
                                        style={{ padding: "6px 12px", border: "1px solid var(--border-color)", borderRadius: "6px", background: currentPage >= totalPages ? 'var(--bg-light)' : 'var(--bg-card)', color: currentPage >= totalPages ? 'var(--border-color)' : 'var(--text-main)', cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                                    >
                                        Next <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>

                                {/* Filter Toggle Button */}
                                <button
                                    onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: isFilterPanelOpen ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-card)',
                                        color: isFilterPanelOpen ? '#3b82f6' : 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                    title="Filter"
                                >
                                    <i className={`fas fa-${isFilterPanelOpen ? 'times' : 'filter'}`}></i>
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                            {/* Table Column */}
                            <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ background: 'var(--bg-light)', borderBottom: '1px solid var(--border-color)' }}>
                                        <tr>
                                            <th style={{ padding: '16px', width: '40px' }}>
                                                <input type="checkbox"
                                                    checked={paginatedSizes.length > 0 && selectedSizeIds.length === paginatedSizes.length}
                                                    onChange={handleSelectAll}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                                />
                                            </th>
                                            <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size Name</th>
                                            <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                                            <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Area</th>
                                            <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available In (Projects)</th>
                                            <th style={{ padding: '16px', width: '160px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSizes.length > 0 ? (
                                            paginatedSizes.map(size => (
                                                <SizeItem
                                                    key={size.id}
                                                    size={size}
                                                    isSelected={selectedSizeIds.includes(size.id)}
                                                    onToggleSelect={() => handleToggleSelect(size.id)}
                                                    onEdit={() => handleEditOpen(size)}
                                                    onDelete={handleDeleteSize}
                                                    onManageAvailability={sz => setAvailabilityModalSize(sz)}
                                                />
                                            ))
                                        ) : (
                                            <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No sizes found matching your search.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Filter Sidebar */}
                            {isFilterPanelOpen && (
                                <div style={{
                                    width: '320px',
                                    flexShrink: 0,
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '20px',
                                    position: 'sticky',
                                    top: '24px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-filter" style={{ fontSize: '0.9rem', color: '#2563eb' }}></i>
                                            Quick Filters
                                        </h3>
                                        <button
                                            onClick={() => setIsFilterPanelOpen(false)}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</label>
                                        <select
                                            value={sizeFilters.project}
                                            onChange={e => setSizeFilters({ ...sizeFilters, project: e.target.value, block: '' })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-light)', color: 'var(--text-main)' }}
                                        >
                                            <option value="">All Projects</option>
                                            {safeProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Block</label>
                                        <select
                                            value={sizeFilters.block}
                                            onChange={e => setSizeFilters({ ...sizeFilters, block: e.target.value })}
                                            disabled={!sizeFilters.project}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: sizeFilters.project ? 'var(--bg-light)' : 'var(--bg-light)', color: 'var(--text-main)' }}
                                        >
                                            <option value="">All Blocks</option>
                                            {sizeFilters.project && safeProjects.find(p => p.name === sizeFilters.project)?.blocks?.map(b => {
                                                const bName = typeof b === 'object' ? b.name : b;
                                                return <option key={bName} value={bName}>{bName}</option>;
                                            })}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
                                        <select
                                            value={sizeFilters.category}
                                            onChange={e => setSizeFilters({ ...sizeFilters, category: e.target.value, subCategory: '', unitType: '' })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-light)', color: 'var(--text-main)' }}
                                        >
                                            <option value="">All Categories</option>
                                            {propertyConfig && Object.keys(propertyConfig).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sub Category</label>
                                        <select
                                            value={sizeFilters.subCategory}
                                            onChange={e => setSizeFilters({ ...sizeFilters, subCategory: e.target.value, unitType: '' })}
                                            disabled={!sizeFilters.category}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: sizeFilters.category ? 'var(--bg-light)' : 'var(--bg-light)', color: 'var(--text-main)' }}
                                        >
                                            <option value="">All Sub Categories</option>
                                            {sizeFilters.category && propertyConfig[sizeFilters.category]?.subCategories?.map(sub => (
                                                <option key={sub.name} value={sub.name}>{sub.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size Type</label>
                                        <select
                                            value={sizeFilters.unitType}
                                            onChange={e => setSizeFilters({ ...sizeFilters, unitType: e.target.value })}
                                            disabled={!sizeFilters.subCategory}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: sizeFilters.subCategory ? 'var(--bg-light)' : 'var(--bg-light)', color: 'var(--text-main)' }}
                                        >
                                            <option value="">All Size Types</option>
                                            {(() => {
                                                if (!sizeFilters.category || !sizeFilters.subCategory) return null;
                                                const subCatObj = propertyConfig[sizeFilters.category]?.subCategories?.find(s => s.name === sizeFilters.subCategory);
                                                return subCatObj?.types?.map(t => {
                                                    const typeName = typeof t === 'string' ? t : t.name;
                                                    return <option key={typeName} value={typeName}>{typeName}</option>;
                                                });
                                            })()}
                                        </select>
                                    </div>

                                    <button
                                        onClick={() => setSizeFilters({ project: '', block: '', category: '', subCategory: '', unitType: '' })}
                                        style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                        onMouseOver={e => { e.currentTarget.style.background = 'var(--bg-light)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    >
                                        <i className="fas fa-undo"></i> Reset All Filters
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'Configuration' ? (
                    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ background: 'var(--bg-card)', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Global Configuration</h2><p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Manage property hierarchy from top to bottom.</p></div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ width: '280px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-light)' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Category
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <i className="fas fa-download" onClick={() => handleExportConfigHierarchy(Object.keys(propertyConfig), 'Categories')} style={{ fontSize: '0.8rem', color: '#10b981', cursor: 'pointer' }} title="Download Categories"></i>
                                        <button type="button" onClick={(e) => { e.preventDefault(); handleAddCategory(); }} style={{ border: 'none', background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Add Category"><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
                                    </div>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {propertyConfig && Object.keys(propertyConfig).map(cat => (
                                        <div key={cat} onClick={() => { setConfigCategory(cat); setConfigSubCategory(null); setConfigType(null); }} style={{ padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: configCategory === cat ? 700 : 500, color: configCategory === cat ? '#2563eb' : 'var(--text-main)', background: configCategory === cat ? 'var(--bg-card)' : 'transparent', borderLeft: configCategory === cat ? '4px solid #2563eb' : '4px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="group">
                                            <span style={{ flex: 1 }}>{cat}</span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {configCategory === cat && <ActionButtons onEdit={() => handleEditCategory(cat)} onDelete={() => handleDeleteCategory(cat)} />}
                                                <i className="fas fa-chevron-right" style={{ fontSize: '0.8rem', opacity: configCategory === cat ? 1 : 0.3 }}></i>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ width: '320px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Sub Category
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <i className="fas fa-download" onClick={() => handleExportConfigHierarchy(propertyConfig[configCategory]?.subCategories || [], 'Sub_Categories', { categoryId: getLookupId('Category', configCategory) })} style={{ fontSize: '0.8rem', color: '#10b981', cursor: 'pointer', opacity: configCategory ? 1 : 0.4 }} title="Download Sub Categories"></i>
                                        <button type="button" onClick={(e) => { e.preventDefault(); handleAddSubCategory(); }} disabled={!configCategory} style={{ border: 'none', background: configCategory ? 'var(--border-color)' : 'var(--bg-light)', color: configCategory ? 'var(--text-muted)' : 'var(--border-color)', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
                                    </div>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {configCategory && Array.isArray(propertyConfig[configCategory]?.subCategories) && propertyConfig[configCategory].subCategories.map(sub => (
                                        <div key={sub.name} onClick={() => { setConfigSubCategory(sub.name); setConfigType(null); }} style={{ padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: configSubCategory === sub.name ? 700 : 500, background: configSubCategory === sub.name ? 'rgba(59, 130, 246, 0.08)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="group">
                                            <span>{sub.name}</span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {configSubCategory === sub.name && <ActionButtons onEdit={() => handleEditSubCategory(sub.name)} onDelete={() => handleDeleteSubCategory(sub.name)} />}
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--bg-light)', borderRadius: '12px' }}>{sub?.types?.length || 0}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ width: '320px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Size Type
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <i className="fas fa-download" onClick={() => handleExportConfigHierarchy(propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.types || [], 'Types', { subCategoryId: getLookupId('SubCategory', configSubCategory) })} style={{ fontSize: '0.8rem', color: '#10b981', cursor: 'pointer', opacity: configSubCategory ? 1 : 0.4 }} title="Download Size Types"></i>
                                        <button type="button" onClick={(e) => { e.preventDefault(); handleAddType(); }} disabled={!configSubCategory} style={{ border: 'none', background: configSubCategory ? 'var(--border-color)' : 'var(--bg-light)', color: configSubCategory ? 'var(--text-muted)' : 'var(--border-color)', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
                                    </div>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {configSubCategory && Array.isArray(propertyConfig[configCategory]?.subCategories?.find(s => s.name === configSubCategory)?.types) && propertyConfig[configCategory].subCategories.find(s => s.name === configSubCategory).types.map(type => (
                                        <div key={type.name} onClick={() => setConfigType(type.name)} style={{ padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: configType === type.name ? 700 : 500, background: configType === type.name ? 'rgba(59, 130, 246, 0.08)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="group">
                                            <span>{type.name}</span>
                                            {configType === type.name && <ActionButtons onEdit={() => handleEditType(type.name)} onDelete={() => handleDeleteType(type.name)} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Builtup Types
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <i className="fas fa-download" onClick={() => handleExportConfigHierarchy(propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.builtupTypes || [], 'Builtup', { subCategoryId: getLookupId('SubCategory', configSubCategory) })} style={{ fontSize: '0.8rem', color: '#10b981', cursor: 'pointer', opacity: configSubCategory ? 1 : 0.4 }} title="Download Builtup Size Types"></i>
                                        <button type="button" onClick={(e) => { e.preventDefault(); handleAddBuiltupType(); }} disabled={!configSubCategory} style={{ border: 'none', background: configSubCategory ? 'var(--border-color)' : 'var(--bg-light)', color: configSubCategory ? 'var(--text-muted)' : 'var(--border-color)', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
                                    </div>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
                                    {configSubCategory && Array.isArray(propertyConfig[configCategory]?.subCategories?.find(s => s.name === configSubCategory)?.builtupTypes) && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                            {propertyConfig[configCategory].subCategories.find(s => s.name === configSubCategory).builtupTypes.map(bType => {
                                                const bName = typeof bType === 'object' ? bType.name : bType;
                                                const bId = typeof bType === 'object' ? (bType.id || bType._id || bName) : bType;
                                                return (
                                                <div key={bId} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }} className="group">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>{bName}</div>
                                                    <ActionButtons onEdit={() => handleEditBuiltupType(bName)} onDelete={() => handleDeleteBuiltupType(bName)} />
                                                </div>
                                            )})}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'Feedback Outcomes' ? (
                    <CustomizeFeedbackPage isEmbedded={true} />
                ) : (
                    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ background: 'var(--bg-card)', padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}><h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Orientation & Fields</h2></div>
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ width: '280px', borderRight: '1px solid var(--border-color)', background: 'var(--bg-light)', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Field Name</div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {masterFields && ['facings', 'roadWidths', 'directions', 'waterSources', 'waterLevels', 'waterPumpTypes', 'frontOnRoads', 'numberOfOwners', 'unitTypes', 'relations', 'floorLevels', 'floorPlans', 'zoneNames', 'soilTypes', 'currentCrops', 'ownerships']
                                        .map(field => (
                                            <div key={field} onClick={() => setActiveOrientationField(field)} style={{ padding: '16px', cursor: 'pointer', fontWeight: activeOrientationField === field ? 700 : 500, color: activeOrientationField === field ? '#2563eb' : 'var(--text-main)', background: activeOrientationField === field ? 'var(--bg-card)' : 'transparent', borderLeft: activeOrientationField === field ? '4px solid #2563eb' : '4px solid transparent', textTransform: 'capitalize' }}>
                                                {field === 'zoneNames' ? 'Zone' : field.replace(/([A-Z])/g, ' $1').trim()}
                                            </div>
                                        ))}
                                </div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Value
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <i className="fas fa-download" onClick={handleExportOrientation} style={{ fontSize: '0.9rem', color: '#10b981', cursor: 'pointer' }} title="Download Fields"></i>
                                        <button type="button" onClick={(e) => { e.preventDefault(); handleAddMasterItem(); }} style={{ border: 'none', background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
                                    </div>
                                </div>
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    {masterFields && (masterFields[activeOrientationField] || []).map((item, idx) => {
                                        const itemName = typeof item === 'object' ? item.name : item;
                                        const itemKey = typeof item === 'object' ? (item.id || idx) : item;
                                        return (
                                            <div key={itemKey} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="group">
                                                <span>{itemName}</span>
                                                <button onClick={() => handleDeleteMasterItem(item)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><i className="fas fa-trash-alt" style={{ fontSize: '0.85rem' }}></i></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {selectedSizeIds.length > 0 && (
                    <div style={{
                        position: 'sticky', bottom: 0, left: 0, right: 0,
                        background: '#1e40af', color: '#fff', padding: '12px 24px',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        borderRadius: '0 0 12px 12px', zIndex: 100,
                        boxShadow: '0 -4px 20px rgba(30,64,175,0.3)'
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedSizeIds.length} sizes selected</span>
                        <button
                            onClick={() => setBulkProjectModal(true)}
                            style={{ padding: '8px 20px', background: '#fff', color: '#1e40af', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            <i className="fas fa-project-diagram" style={{ marginRight: '6px' }}></i>Assign to Project
                        </button>
                        <button
                            onClick={() => setSelectedSizeIds([])}
                            style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            Clear
                        </button>
                    </div>
                )}

                {bulkProjectModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', width: '460px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>Bulk Assign — {selectedSizeIds.length} Sizes</h3>
                                <button onClick={() => setBulkProjectModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>×</button>
                            </div>
                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>Project *</label>
                                    <select value={bulkProject} onChange={e => { setBulkProject(e.target.value); setBulkBlock(''); }}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                                        <option value="">Select Project</option>
                                        {safeProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>Block (optional)</label>
                                    <select value={bulkBlock} onChange={e => setBulkBlock(e.target.value)}
                                        disabled={!bulkProject}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none', background: bulkProject ? 'var(--bg-card)' : 'var(--bg-light)', color: 'var(--text-main)' }}>
                                        <option value="">All Blocks / No Block</option>
                                        {(safeProjects.find(p => p.name === bulkProject)?.blocks || []).map((b, i) => {
                                            const bName = typeof b === 'object' ? b.name : b;
                                            return <option key={i} value={bName}>{bName}</option>;
                                        })}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
                                <button onClick={handleBulkAssign} disabled={!bulkProject || isBulkSaving}
                                    style={{ flex: 1, padding: '12px', background: bulkProject ? '#1e40af' : '#94a3b8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: bulkProject ? 'pointer' : 'not-allowed' }}>
                                    {isBulkSaving ? 'Assigning...' : 'Assign to Project'}
                                </button>
                                <button onClick={() => setBulkProjectModal(false)}
                                    style={{ flex: 1, padding: '12px', background: 'var(--bg-light)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <AddSizeModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onAdd={handleSaveSize}
                    initialData={editingSize}
                    propertyConfig={propertyConfig}
                    allProjects={safeProjects}
                    existingSizes={sizes}
                />

                {/* ✅ ENTERPRISE: SizeAvailabilityModal — manage project/block assignments */}
                <SizeAvailabilityModal
                    isOpen={!!availabilityModalSize}
                    size={availabilityModalSize}
                    onClose={() => setAvailabilityModalSize(null)}
                    allProjects={safeProjects}
                    onAddMapping={async (sizeId, project, block) => {
                        await addSizeProjectMapping(sizeId, project, block);
                        // Refresh local modal state to show updated mappings
                        setAvailabilityModalSize(prev => {
                            if (!prev || prev.id !== sizeId) return prev;
                            const existing = Array.isArray(prev.projectMappings) ? prev.projectMappings : [];
                            if (existing.some(m => m.project === project && m.block === (block || ''))) return prev;
                            return { ...prev, projectMappings: [...existing, { project, block: block || '' }] };
                        });
                    }}
                    onRemoveMapping={async (sizeId, project, block) => {
                        await removeSizeProjectMapping(sizeId, project, block);
                        setAvailabilityModalSize(prev => {
                            if (!prev || prev.id !== sizeId) return prev;
                            const updated = (Array.isArray(prev.projectMappings) ? prev.projectMappings : []).filter(
                                m => !(m.project === project && m.block === (block || ''))
                            );
                            return { ...prev, projectMappings: updated };
                        });
                    }}
                />

                <InputModal
                    isOpen={inputModal.isOpen}
                    onClose={closeInputModal}
                    onConfirm={inputModal.onConfirm}
                    title={inputModal.title}
                    defaultValue={inputModal.defaultValue}
                />

                <ConfirmationModal
                    isOpen={confirmModal.isOpen}
                    onClose={closeConfirmModal}
                    onConfirm={confirmModal.onConfirm}
                    message={confirmModal.message}
                />

                {isImportModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', width: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>Import Sizes from CSV</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Required columns: name, unitType, category, subCategory</p>
                                </div>
                                <button onClick={() => setIsImportModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>×</button>
                            </div>

                            <div style={{ border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '32px', textAlign: 'center', marginBottom: '20px', background: 'var(--bg-light)' }}>
                                <i className="fas fa-file-csv" style={{ fontSize: '2rem', color: '#2563eb', marginBottom: '12px', display: 'block' }}></i>
                                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Upload a CSV file with size data</p>
                                <input type="file" accept=".csv" id="sizeImportInput" style={{ display: 'none' }} onChange={handleImportFileChange} />
                                <label htmlFor="sizeImportInput" style={{ display: 'inline-block', padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Choose CSV File</label>
                                {importFile && <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>✓ File loaded — {importFile.rows?.length || 0} rows found</p>}
                            </div>

                            {importError && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>{importError}
                                </div>
                            )}

                            {importPreview.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>Preview (first {importPreview.length} rows):</p>
                                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead style={{ background: 'var(--bg-light)' }}>
                                                <tr>
                                                    {Object.keys(importPreview[0]).map(k => <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>{k}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importPreview.map((row, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        {Object.values(row).map((v, j) => <td key={j} style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{v}</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', fontSize: '0.8rem', color: '#1e40af' }}>
                                <strong>CSV Format:</strong> name, unitType, category, subCategory, saleableArea, coveredArea, carpetArea, totalArea, resultMetric, description<br/>
                                <strong>Example:</strong> 2BHK-1200sqft, BHK, Residential, Flat/Apartment / Builder Floor, 1200, 950, 850, , Sq Ft, Standard 2BHK layout
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={handleImportConfirm} disabled={!importFile?.rows || isImporting || !!importError}
                                    style={{ flex: 1, padding: '12px', background: (!importFile?.rows || !!importError) ? '#94a3b8' : '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: (!importFile?.rows || !!importError) ? 'not-allowed' : 'pointer' }}>
                                    {isImporting ? 'Importing...' : `Import ${importFile?.rows?.length || 0} Sizes`}
                                </button>
                                <button onClick={() => setIsImportModalOpen(false)}
                                    style={{ flex: 1, padding: '12px', background: 'var(--bg-light)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Export Sizes Modal */}
                {isExportModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'var(--bg-card)', width: '450px', borderRadius: '12px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Export Property Sizes</h3>
                                <i className="fas fa-times" onClick={() => setIsExportModalOpen(false)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}></i>
                            </div>

                            <div style={{ display: 'grid', gap: '20px' }}>
                                <div>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', display: 'block' }}>Select Project</label>
                                    <select
                                        id="exportProjectSelect"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none' }}
                                        defaultValue="All"
                                        onChange={(e) => {
                                            const proj = e.target.value;
                                            const blockSelect = document.getElementById('exportBlockSelect');
                                            if (proj === 'All') {
                                                blockSelect.innerHTML = '<option value="All">All Blocks</option>';
                                                blockSelect.value = 'All';
                                            } else {
                                                const projectData = safeProjects.find(p => p.name === proj);
                                                let options = '<option value="All">All Blocks</option>';
                                                if (projectData && Array.isArray(projectData.blocks)) {
                                                    projectData.blocks.forEach(b => {
                                                        const bName = typeof b === 'object' ? b.name : b;
                                                        options += `<option value="${bName}">${bName}</option>`;
                                                    });
                                                }
                                                blockSelect.innerHTML = options;
                                                blockSelect.value = 'All';
                                            }
                                        }}
                                    >
                                        <option value="All">All Projects</option>
                                        {safeProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', display: 'block' }}>Select Block</label>
                                    <select
                                        id="exportBlockSelect"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', outline: 'none' }}
                                        defaultValue="All"
                                    >
                                        <option value="All">All Blocks</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => {
                                        const proj = document.getElementById('exportProjectSelect').value;
                                        const block = document.getElementById('exportBlockSelect').value;
                                        handleExportSizes(proj, block);
                                    }}
                                    style={{ padding: '12px 24px', fontSize: '0.95rem', fontWeight: 700, flex: 1, background: '#10b981', border: 'none', color: '#ffffff', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    Download CSV
                                </button>
                                <button
                                    className="btn-outline"
                                    onClick={() => setIsExportModalOpen(false)}
                                    style={{ padding: '12px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontSize: '0.95rem', fontWeight: 700, flex: 1, color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default PropertySettingsPage;
