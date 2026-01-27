import React, { useState, useEffect } from 'react';
import { PROJECTS_LIST } from '../../../data/projectData';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';

const SizeItem = ({ size, onEdit, onDelete }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
        <td style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>{size.project || 'Global'}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{size.block}</div>
        </td>
        <td style={{ padding: '16px' }}>
            <div style={{ fontWeight: 600, color: '#475569' }}>{size.category}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{size.subCategory}</div>
        </td>
        <td style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: '1rem' }}>{size.name}</div>
        </td>
        <td style={{ padding: '16px', color: '#64748b', fontSize: '0.8rem' }}>{size.description || '--'}</td>
        <td style={{ padding: '16px', textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                    onClick={() => onEdit(size)}
                    style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                >
                    <i className="fas fa-edit"></i>
                </button>
                <button
                    onClick={() => onDelete(size.id)}
                    style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                >
                    <i className="fas fa-trash"></i>
                </button>
            </div>
        </td>
    </tr>
);

const AddSizeModal = ({ isOpen, onClose, onAdd, initialData, propertyConfig }) => {
    const defaultState = {
        name: '',
        sizeType: '',
        project: '',
        block: '',
        category: 'Residential',
        subCategory: 'Flat_Apartment_Builder_Floor', // Safe default if exists
        saleableArea: '',
        coveredArea: '',
        carpetArea: '',
        length: '',
        width: '',
        lengthMetric: 'Feet',
        widthMetric: 'Feet',
        totalArea: '',
        resultMetric: 'Sq Yd',
        description: ''
    };

    const [sizeData, setSizeData] = useState(defaultState);

    // Reset or Load Data
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setSizeData(initialData);
            } else {
                // Determine a safe default category and subcategory from config
                const initialCat = Object.keys(propertyConfig)[0] || '';
                const initialSub = propertyConfig[initialCat]?.subCategories?.[0]?.name || '';

                setSizeData({
                    ...defaultState,
                    category: initialCat,
                    subCategory: initialSub
                });
            }
        }
    }, [isOpen, initialData, propertyConfig]);

    const [availableBlocks, setAvailableBlocks] = useState([]);

    // Use PROJECTS_LIST directly
    const allProjects = PROJECTS_LIST;

    useEffect(() => {
        if (sizeData.project) {
            const project = allProjects.find(p => p.name === sizeData.project);
            setAvailableBlocks(project ? project.blocks : []);
        } else {
            setAvailableBlocks([]);
        }
    }, [sizeData.project]);

    // --- Smart Name Generation ---
    useEffect(() => {
        const isPlot = ['Plot', 'Shop', 'Showroom', 'Industrial Land', 'Commercial Land'].includes(sizeData.subCategory);
        let areaPart = '';
        if (isPlot) {
            areaPart = sizeData.totalArea ? `(${sizeData.totalArea} ${sizeData.resultMetric})` : '';
        } else {
            areaPart = sizeData.saleableArea ? `(${sizeData.saleableArea} Sq Ft)` : '';
        }

        const generatedName = `${sizeData.sizeType} ${areaPart}`.trim();
        setSizeData(prev => ({ ...prev, name: generatedName }));
    }, [sizeData.sizeType, sizeData.totalArea, sizeData.saleableArea, sizeData.resultMetric, sizeData.subCategory]);

    // Area Calculation Logic
    useEffect(() => {
        if (sizeData.length && sizeData.width) {
            const l = parseFloat(sizeData.length);
            const w = parseFloat(sizeData.width);

            if (!isNaN(l) && !isNaN(w)) {
                // Convert both to Meters first for base calc
                const toMeters = (val, metric) => {
                    if (metric === 'Feet') return val * 0.3048;
                    if (metric === 'Yard') return val * 0.9144;
                    return val; // Already Meter
                };

                const lM = toMeters(l, sizeData.lengthMetric);
                const wM = toMeters(w, sizeData.widthMetric);
                const areaSqM = lM * wM;

                // Convert Area to Result Metric
                let result = areaSqM;
                if (sizeData.resultMetric === 'Sq Ft') result = areaSqM * 10.7639;
                if (sizeData.resultMetric === 'Sq Yd') result = areaSqM * 1.19599;

                setSizeData(prev => ({ ...prev, totalArea: result.toFixed(2) }));
            }
        }
    }, [sizeData.length, sizeData.width, sizeData.lengthMetric, sizeData.widthMetric, sizeData.resultMetric]);

    // --- Metric Synchronization ---
    const handleMetricChange = (newMetric) => {
        setSizeData(prev => ({
            ...prev,
            lengthMetric: newMetric,
            widthMetric: newMetric
        }));
    };

    if (!isOpen) return null;

    // Improved logic to support dynamic categories
    const isPlotType = ['plot', 'land', 'shop', 'showroom', 'commercial land', 'industrial land'].some(k => sizeData.subCategory?.toLowerCase().includes(k));
    const isResidentialType = !isPlotType; // Default to showing Area fields (Residential/Built-up) for unknown categories

    const handleSubmit = () => {
        // Validation: Ensure required fields are present
        if (!sizeData.project || !sizeData.subCategory) return;
        onAdd(sizeData);
        onClose();
    };

    // Styles matched with AddContactModal
    const labelStyle = {
        fontSize: '0.9rem',
        fontWeight: 600,
        color: '#334155',
        marginBottom: '12px',
        display: 'block'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.9rem',
        outline: 'none',
        color: '#1e293b',
        transition: 'border-color 0.2s',
        height: '42px',
        boxSizing: 'border-box',
        backgroundColor: '#fff'
    };

    const customSelectStyle = {
        width: '100%',
        padding: '10px 12px',
        paddingRight: '30px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        outline: 'none',
        background: '#f8fafc',
        color: '#475569',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px'
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '600px', borderRadius: '12px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{initialData ? 'Edit Property Size' : 'Add New Property Size'}</h3>
                    <i className="fas fa-times" onClick={onClose} style={{ cursor: 'pointer', color: '#94a3b8' }}></i>
                </div>

                <div style={{ display: 'grid', gap: '24px' }}>
                    {/* Generated Size Name */}
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <label style={labelStyle}>Size Name (Auto-Generated)</label>
                        <input
                            type="text"
                            value={sizeData.name}
                            readOnly
                            style={{ ...inputStyle, background: '#f1f5f9', fontWeight: 700, color: '#1e40af', border: '1px solid #bfdbfe' }}
                        />
                    </div>

                    {/* Project & Block */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <label style={labelStyle}>Project</label>
                            <select
                                value={sizeData.project}
                                onChange={e => setSizeData({ ...sizeData, project: e.target.value })}
                                style={customSelectStyle}
                            >
                                <option value="">Select Project</option>
                                {allProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Block (Tower)</label>
                            <select
                                value={sizeData.block}
                                onChange={e => setSizeData({ ...sizeData, block: e.target.value })}
                                style={customSelectStyle}
                                disabled={!sizeData.project}
                            >
                                <option value="">Select Block</option>
                                {availableBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Category, Sub Category & Size Type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select
                                value={sizeData.category}
                                onChange={e => {
                                    const cat = e.target.value;
                                    const subs = propertyConfig[cat]?.subCategories || [];
                                    setSizeData({
                                        ...sizeData,
                                        category: cat,
                                        subCategory: subs.length > 0 ? subs[0].name : '',
                                        sizeType: ''
                                    });
                                }}
                                style={customSelectStyle}
                            >
                                {Object.keys(propertyConfig).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Sub Category</label>
                            <select
                                value={sizeData.subCategory}
                                onChange={e => setSizeData({ ...sizeData, subCategory: e.target.value, sizeType: '' })}
                                style={customSelectStyle}
                            >
                                {propertyConfig[sizeData.category]?.subCategories.map(sub => (
                                    <option key={sub.name} value={sub.name}>{sub.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Size Type</label>
                            <select
                                value={sizeData.sizeType}
                                onChange={e => setSizeData({ ...sizeData, sizeType: e.target.value })}
                                style={customSelectStyle}
                            >
                                <option value="">Select Type</option>
                                {(() => {
                                    const subCatObj = propertyConfig[sizeData.category]?.subCategories.find(s => s.name === sizeData.subCategory);
                                    return subCatObj?.types?.map(t => {
                                        const typeName = typeof t === 'string' ? t : t.name;
                                        return <option key={typeName} value={typeName}>{typeName}</option>;
                                    });
                                })()}
                            </select>
                        </div>
                    </div>

                    {/* Dynamic Sections */}
                    {isResidentialType && (
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#1e293b' }}>Residential Details (Sq Ft)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Total/Saleable Area</label>
                                    <input type="number" placeholder="Enter Area" value={sizeData.saleableArea} onChange={e => setSizeData({ ...sizeData, saleableArea: e.target.value })} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Covered Area</label>
                                    <input type="number" placeholder="Enter Area" value={sizeData.coveredArea} onChange={e => setSizeData({ ...sizeData, coveredArea: e.target.value })} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Carpet Area</label>
                                    <input type="number" placeholder="Enter Area" value={sizeData.carpetArea} onChange={e => setSizeData({ ...sizeData, carpetArea: e.target.value })} style={inputStyle} />
                                </div>
                            </div>
                        </div>
                    )}

                    {isPlotType && (
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#1e293b' }}>Dimensions & Multi-Unit Calculator</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Width</label>
                                    <div style={{ display: 'flex' }}>
                                        <input type="number" value={sizeData.width} onChange={e => setSizeData({ ...sizeData, width: e.target.value })} style={{ ...inputStyle, borderRight: 'none', borderRadius: '6px 0 0 6px' }} />
                                        <select value={sizeData.widthMetric} onChange={e => handleMetricChange(e.target.value)} style={{ ...inputStyle, width: '100px', borderRadius: '0 6px 6px 0', background: '#fff' }}>
                                            <option>Meter</option>
                                            <option>Feet</option>
                                            <option>Yard</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Length</label>
                                    <div style={{ display: 'flex' }}>
                                        <input type="number" value={sizeData.length} onChange={e => setSizeData({ ...sizeData, length: e.target.value })} style={{ ...inputStyle, borderRight: 'none', borderRadius: '6px 0 0 6px' }} />
                                        <select value={sizeData.lengthMetric} onChange={e => handleMetricChange(e.target.value)} style={{ ...inputStyle, width: '100px', borderRadius: '0 6px 6px 0', background: '#fff' }}>
                                            <option>Meter</option>
                                            <option>Feet</option>
                                            <option>Yard</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label style={{ ...labelStyle, color: '#1e40af' }}>Total area based on formula</label>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af' }}>
                                            {sizeData.totalArea || '0.00'} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{sizeData.resultMetric}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {['Sq Meter', 'Sq Ft', 'Sq Yd'].map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setSizeData({ ...sizeData, resultMetric: m })}
                                                style={{
                                                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                                                    background: sizeData.resultMetric === m ? '#1e40af' : '#fff',
                                                    color: sizeData.resultMetric === m ? '#fff' : '#1e40af',
                                                    border: '1px solid #1e40af', cursor: 'pointer'
                                                }}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={labelStyle}>Description (Optional)</label>
                        <textarea
                            placeholder="Enter specific layout details..."
                            value={sizeData.description}
                            onChange={(e) => setSizeData({ ...sizeData, description: e.target.value })}
                            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        style={{ padding: '12px 24px', fontSize: '0.95rem', fontWeight: 700, flex: 1 }}
                    >{initialData ? 'Update Configuration' : 'Add to Project'}</button>
                    <button
                        className="btn-outline"
                        onClick={onClose}
                        style={{ padding: '12px 24px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.95rem', fontWeight: 700, flex: 1, color: '#475569' }}
                    >Cancel</button>
                </div>
            </div>
        </div>
    );
};

const PropertySettingsPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSize, setEditingSize] = useState(null);
    const [sizes, setSizes] = useState([
        { id: 1, project: 'DLF Cyber City', block: 'Building 8', category: 'Residential', subCategory: 'Flat/Apartment / Builder Floor', name: '3 BHK (1200 Sq Ft)', sizeType: '3 BHK', saleableArea: '1200', description: 'Sample Entry' }
    ]);
    const [activeTab, setActiveTab] = useState('Sizes');
    const [searchTerm, setSearchTerm] = useState('');

    // Notification State
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
    };

    // Configuration Tab State - Now using Global Context
    const { propertyConfig, updateConfig, masterFields, updateMasterFields } = usePropertyConfig();
    const [configCategory, setConfigCategory] = useState(Object.keys(propertyConfig)[0] || null);
    const [configSubCategory, setConfigSubCategory] = useState(null);
    const [configType, setConfigType] = useState(null);

    // Orientation Tab State
    const [activeOrientationField, setActiveOrientationField] = useState('facings'); // 'facings', 'roadWidths', etc.

    // --- Master Field CRUD ---
    const handleAddMasterItem = () => {
        const value = prompt(`Enter new ${activeOrientationField.slice(0, -1)}:`);
        if (value) {
            const currentList = masterFields[activeOrientationField];
            if (!currentList.includes(value)) {
                updateMasterFields(activeOrientationField, [...currentList, value]);
                showToast(`'${value}' added to ${activeOrientationField}`);
            } else {
                alert("Item already exists.");
            }
        }
    };

    const handleDeleteMasterItem = (item) => {
        if (confirm(`Remove '${item}'?`)) {
            const currentList = masterFields[activeOrientationField];
            updateMasterFields(activeOrientationField, currentList.filter(i => i !== item));
            showToast(`'${item}' removed`);
        }
    };

    // --- CRUD Logic for Configuration ---

    // 1. Category Operations
    const handleAddCategory = () => {
        const name = prompt("Enter new Category name:");
        if (name && !propertyConfig[name]) {
            const newConfig = { ...propertyConfig, [name]: { subCategories: [] } };
            updateConfig(newConfig);
            showToast(`Category '${name}' added successfully`);
        } else if (name) {
            alert("Category already exists or invalid name.");
        }
    };

    const handleEditCategory = (oldName) => {
        const newName = prompt("Edit Category name:", oldName);
        if (newName && newName !== oldName) {
            const newConfig = { ...propertyConfig };
            newConfig[newName] = newConfig[oldName];
            delete newConfig[oldName];
            updateConfig(newConfig);
            if (configCategory === oldName) setConfigCategory(newName);
            showToast(`Category updated to '${newName}'`);
        }
    };

    const handleDeleteCategory = (name) => {
        if (confirm(`Delete category '${name}' and all its contents?`)) {
            const newConfig = { ...propertyConfig };
            delete newConfig[name];
            updateConfig(newConfig);
            if (configCategory === name) {
                setConfigCategory(Object.keys(newConfig)[0] || null);
                setConfigSubCategory(null);
            }
            showToast(`Category '${name}' deleted`);
        }
    };

    // 2. Sub-Category Operations
    const handleAddSubCategory = () => {
        if (!configCategory) return;
        const name = prompt(`Enter new Sub-Category for ${configCategory}:`);
        if (name) {
            const newConfig = { ...propertyConfig };
            // Check duplicate
            if (newConfig[configCategory].subCategories.some(s => s.name === name)) {
                alert("Sub-Category already exists.");
                return;
            }
            newConfig[configCategory].subCategories.push({ name, types: [] });
            updateConfig(newConfig);
            showToast(`Sub-Category '${name}' added`);
        }
    };

    const handleEditSubCategory = (oldName) => {
        const newName = prompt("Edit Sub-Category name:", oldName);
        if (newName && newName !== oldName) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === oldName);
            if (subIndex > -1) {
                newConfig[configCategory].subCategories[subIndex].name = newName;
                updateConfig(newConfig);
                if (configSubCategory === oldName) setConfigSubCategory(newName);
                showToast(`Sub-Category updated to '${newName}'`);
            }
        }
    };

    const handleDeleteSubCategory = (name) => {
        if (confirm(`Delete sub-category '${name}'?`)) {
            const newConfig = { ...propertyConfig };
            newConfig[configCategory].subCategories = newConfig[configCategory].subCategories.filter(s => s.name !== name);
            updateConfig(newConfig);
            if (configSubCategory === name) setConfigSubCategory(null);
            showToast(`Sub-Category '${name}' deleted`);
        }
    };

    // 3. Type Operations (Now Object Based)
    const handleAddType = () => {
        if (!configCategory || !configSubCategory) return;
        const name = prompt(`Enter new Type for ${configSubCategory}:`);
        if (name) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            if (subIndex > -1) {
                const types = newConfig[configCategory].subCategories[subIndex].types;
                if (!types.some(t => t.name === name)) {
                    types.push({ name, builtupTypes: [] }); // Initialize as object
                    updateConfig(newConfig);
                    showToast(`Type '${name}' added`);
                } else {
                    alert("Type already exists.");
                }
            }
        }
    };

    const handleEditType = (oldName) => {
        const newName = prompt("Edit Type name:", oldName);
        if (newName && newName !== oldName) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            if (subIndex > -1) {
                const types = newConfig[configCategory].subCategories[subIndex].types;
                const typeObj = types.find(t => t.name === oldName);
                if (typeObj) {
                    typeObj.name = newName;
                    updateConfig(newConfig);
                    if (configType === oldName) setConfigType(newName);
                    showToast(`Type updated to '${newName}'`);
                }
            }
        }
    };

    const handleDeleteType = (name) => {
        if (confirm(`Delete type '${name}'?`)) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            if (subIndex > -1) {
                const types = newConfig[configCategory].subCategories[subIndex].types;
                newConfig[configCategory].subCategories[subIndex].types = types.filter(t => t.name !== name);
                updateConfig(newConfig);
                if (configType === name) setConfigType(null);
                showToast(`Type '${name}' deleted`);
            }
        }
    };

    // 4. Builtup Type Operations
    const handleAddBuiltupType = () => {
        if (!configCategory || !configSubCategory || !configType) return;
        const name = prompt(`Enter new Builtup Type for ${configType}:`);
        if (name) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            if (subIndex > -1) {
                const typeObj = newConfig[configCategory].subCategories[subIndex].types.find(t => t.name === configType);
                if (typeObj) {
                    if (!typeObj.builtupTypes.includes(name)) {
                        typeObj.builtupTypes.push(name);
                        updateConfig(newConfig);
                        showToast(`Builtup Type '${name}' added`);
                    } else {
                        alert("Builtup Type already exists.");
                    }
                }
            }
        }
    };

    const handleEditBuiltupType = (oldName) => {
        const newName = prompt("Edit Builtup Type name:", oldName);
        if (newName && newName !== oldName) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            const typeObj = newConfig[configCategory].subCategories[subIndex].types.find(t => t.name === configType);
            const index = typeObj.builtupTypes.indexOf(oldName);
            if (index > -1) {
                typeObj.builtupTypes[index] = newName;
                updateConfig(newConfig);
                showToast(`Builtup Type updated to '${newName}'`);
            }
        }
    };

    const handleDeleteBuiltupType = (name) => {
        if (confirm(`Delete Builtup Type '${name}'?`)) {
            const newConfig = { ...propertyConfig };
            const subIndex = newConfig[configCategory].subCategories.findIndex(s => s.name === configSubCategory);
            const typeObj = newConfig[configCategory].subCategories[subIndex].types.find(t => t.name === configType);
            typeObj.builtupTypes = typeObj.builtupTypes.filter(b => b !== name);
            updateConfig(newConfig);
            showToast(`Builtup Type '${name}' deleted`);
        }
    };


    const handleSaveSize = (sizeData) => {
        if (editingSize) {
            setSizes(sizes.map(s => s.id === editingSize.id ? { ...sizeData, id: s.id } : s));
            showToast('Property size updated successfully');
        } else {
            setSizes([...sizes, { ...sizeData, id: Date.now() }]);
            showToast('New property size added successfully');
        }
        handleCloseModal();
    };

    const handleEditOpen = (size) => {
        setEditingSize(size);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSize(null);
    };

    const handleDeleteSize = (id) => {
        setSizes(sizes.filter(s => s.id !== id));
        showToast('Property size deleted', 'info');
    };

    const filteredSizes = sizes.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Helper for hover buttons
    const ActionButtons = ({ onEdit, onDelete }) => (
        <div className="action-buttons" style={{ display: 'flex', gap: '4px' }}>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                title="Edit"
            >
                <i className="fas fa-edit"></i>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                title="Delete"
            >
                <i className="fas fa-trash"></i>
            </button>
        </div>
    );

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '40px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {notification.show && (
                    <Toast
                        message={notification.message}
                        type={notification.type}
                        onClose={() => setNotification({ ...notification, show: false })}
                    />
                )}
                {/* Tab Navigation - Select Orientation to manage fields */}
                <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                    {['Sizes', 'Configuration', 'Orientation'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 4px',
                                fontSize: '0.95rem',
                                fontWeight: activeTab === tab ? 700 : 500,
                                color: activeTab === tab ? '#3b82f6' : '#64748b',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                {activeTab === 'Sizes' ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                <input
                                    type="text"
                                    placeholder="Search sizes..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '10px 10px 10px 36px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                />
                            </div>
                            <button
                                className="btn-primary"
                                onClick={() => setIsModalOpen(true)}
                                style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <i className="fas fa-plus"></i> Add Size
                            </button>
                        </div>

                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</th>
                                        <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
                                        <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size Name</th>
                                        <th style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</th>
                                        <th style={{ padding: '16px', width: '100px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSizes.length > 0 ? (
                                        filteredSizes.map(size => (
                                            <SizeItem
                                                key={size.id}
                                                size={size}
                                                onEdit={() => handleEditOpen(size)}
                                                onDelete={handleDeleteSize}
                                            />
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                                No sizes found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : activeTab === 'Configuration' ? (
                    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                        {/* ... Configuration Content ... */}
                        <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Global Configuration</h2>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>Manage your property hierarchy from top to bottom.</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* ... (Existing hierarchy columns) ... */}
                            <div style={{ width: '280px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Category
                                    <button onClick={handleAddCategory} style={{ border: 'none', background: '#e2e8f0', color: '#475569', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Add Category">
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {Object.keys(propertyConfig).map(cat => (
                                        <div
                                            key={cat}
                                            onClick={() => { setConfigCategory(cat); setConfigSubCategory(null); setConfigType(null); }}
                                            style={{
                                                padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: configCategory === cat ? 700 : 500,
                                                color: configCategory === cat ? '#2563eb' : '#334155',
                                                background: configCategory === cat ? '#fff' : 'transparent',
                                                borderLeft: configCategory === cat ? '4px solid #2563eb' : '4px solid transparent',
                                                borderTop: '1px solid transparent', borderBottom: '1px solid transparent',
                                                transition: 'all 0.2s',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                position: 'relative'
                                            }}
                                            className="group"
                                        >
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {configCategory === cat && (
                                                    <ActionButtons
                                                        onEdit={() => handleEditCategory(cat)}
                                                        onDelete={() => handleDeleteCategory(cat)}
                                                    />
                                                )}
                                                <i className="fas fa-chevron-right" style={{ fontSize: '0.8rem', opacity: configCategory === cat ? 1 : 0.3 }}></i>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Level 2: Sub Categories */}
                            <div style={{ width: '320px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Sub Category
                                    <button
                                        onClick={handleAddSubCategory}
                                        disabled={!configCategory}
                                        style={{ border: 'none', background: configCategory ? '#e2e8f0' : '#f1f5f9', color: configCategory ? '#475569' : '#cbd5e1', borderRadius: '4px', width: '20px', height: '20px', cursor: configCategory ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Add Sub-Category"
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {configCategory && propertyConfig[configCategory]?.subCategories.map(sub => (
                                        <div
                                            key={sub.name}
                                            onClick={() => { setConfigSubCategory(sub.name); setConfigType(null); }}
                                            style={{
                                                padding: '16px', cursor: 'pointer', fontSize: '0.95rem',
                                                fontWeight: configSubCategory === sub.name ? 700 : 500,
                                                color: configSubCategory === sub.name ? '#0f172a' : '#334155',
                                                background: configSubCategory === sub.name ? '#f0f9ff' : 'transparent',
                                                transition: 'all 0.1s',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}
                                            className="group"
                                        >
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.name}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {configSubCategory === sub.name && (
                                                    <ActionButtons
                                                        onEdit={() => handleEditSubCategory(sub.name)}
                                                        onDelete={() => handleDeleteSubCategory(sub.name)}
                                                    />
                                                )}
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: '12px', color: '#64748b' }}>{sub.types.length}</span>
                                                {configSubCategory === sub.name && <i className="fas fa-arrow-right" style={{ color: '#0ea5e9' }}></i>}
                                            </div>
                                        </div>
                                    ))}
                                    {configCategory && propertyConfig[configCategory]?.subCategories.length === 0 && (
                                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No Sub-Categories Defined</div>
                                    )}
                                </div>
                            </div>

                            {/* Level 3: Types */}
                            <div style={{ width: '320px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Types / Variations
                                    <button
                                        onClick={handleAddType}
                                        disabled={!configSubCategory}
                                        style={{ border: 'none', background: configSubCategory ? '#e2e8f0' : '#f1f5f9', color: configSubCategory ? '#475569' : '#cbd5e1', borderRadius: '4px', width: '20px', height: '20px', cursor: configSubCategory ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Add Type"
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {configSubCategory ? (
                                        <div>
                                            {propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.types.map(type => (
                                                <div
                                                    key={type.name}
                                                    onClick={() => setConfigType(type.name)}
                                                    style={{
                                                        padding: '16px', cursor: 'pointer', fontSize: '0.95rem',
                                                        fontWeight: configType === type.name ? 700 : 500,
                                                        color: configType === type.name ? '#0f172a' : '#334155',
                                                        background: configType === type.name ? '#f0f9ff' : 'transparent',
                                                        transition: 'all 0.1s',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        borderBottom: '1px solid #f8fafc'
                                                    }}
                                                    className="group"
                                                >
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{type.name}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {configType === type.name && (
                                                            <ActionButtons
                                                                onEdit={() => handleEditType(type.name)}
                                                                onDelete={() => handleDeleteType(type.name)}
                                                            />
                                                        )}
                                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: '12px', color: '#64748b' }}>{Array.isArray(type.builtupTypes) ? type.builtupTypes.length : 0}</span>
                                                        {configType === type.name && <i className="fas fa-arrow-right" style={{ color: '#0ea5e9' }}></i>}
                                                    </div>
                                                </div>
                                            ))}
                                            {propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.types.length === 0 && (
                                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>No Types Defined</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column', gap: '12px' }}>
                                            <i className="fas fa-layer-group" style={{ fontSize: '2rem' }}></i>
                                            <p>Select Sub-Category</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Level 4: Builtup Types */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Builtup / Layouts
                                    <button
                                        onClick={handleAddBuiltupType}
                                        disabled={!configType}
                                        style={{ border: 'none', background: configType ? '#e2e8f0' : '#f1f5f9', color: configType ? '#475569' : '#cbd5e1', borderRadius: '4px', width: '20px', height: '20px', cursor: configType ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Add Builtup Type"
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
                                    {configType ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                            {propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.types.find(t => t.name === configType)?.builtupTypes.map(bType => (
                                                <div
                                                    key={bType}
                                                    style={{
                                                        padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                                        background: '#fff', color: '#334155', fontSize: '0.9rem', fontWeight: 500,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                    }}
                                                    className="group"
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
                                                        {bType}
                                                    </div>
                                                    <ActionButtons
                                                        onEdit={() => handleEditBuiltupType(bType)}
                                                        onDelete={() => handleDeleteBuiltupType(bType)}
                                                    />
                                                </div>
                                            ))}
                                            {propertyConfig[configCategory]?.subCategories.find(s => s.name === configSubCategory)?.types.find(t => t.name === configType)?.builtupTypes.length === 0 && (
                                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                                                    No builtup types defined. Click + to add.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column', gap: '12px' }}>
                                            <i className="fas fa-cubes" style={{ fontSize: '2rem' }}></i>
                                            <p>Select a Type to view details</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Orientation & Fields</h2>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>Manage master lists for drop-downs like Facing, Road Width, etc.</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* Panel 1: Field Selection */}
                            <div style={{ width: '280px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>
                                    Field Name
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {Object.keys(masterFields).map(field => (
                                        <div
                                            key={field}
                                            onClick={() => setActiveOrientationField(field)}
                                            style={{
                                                padding: '16px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: activeOrientationField === field ? 700 : 500,
                                                color: activeOrientationField === field ? '#2563eb' : '#334155',
                                                background: activeOrientationField === field ? '#fff' : 'transparent',
                                                borderLeft: activeOrientationField === field ? '4px solid #2563eb' : '4px solid transparent',
                                                borderTop: '1px solid transparent', borderBottom: '1px solid transparent',
                                                transition: 'all 0.2s',
                                                textTransform: 'capitalize'
                                            }}
                                        >
                                            {field.replace(/([A-Z])/g, ' $1').trim()}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Panel 2: Items List */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                                <div style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Active List Items
                                    <button
                                        onClick={handleAddMasterItem}
                                        style={{ border: 'none', background: '#e2e8f0', color: '#475569', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Add Item"
                                    >
                                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                                    </button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                        {masterFields[activeOrientationField].map(item => (
                                            <div
                                                key={item}
                                                style={{
                                                    padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                                    background: '#fff', color: '#334155', fontSize: '0.9rem', fontWeight: 500,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                }}
                                                className="group"
                                            >
                                                <span>{item}</span>
                                                <button
                                                    onClick={() => handleDeleteMasterItem(item)}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    title="Delete"
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {masterFields[activeOrientationField].length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                                            No items in this list. Click + to add.
                                        </div>
                                    )}
                                </div>
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
                />
            </div>
        </div>
    );
};

export default PropertySettingsPage;
