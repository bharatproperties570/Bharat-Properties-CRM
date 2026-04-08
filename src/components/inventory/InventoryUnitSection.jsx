import React from 'react';
import { renderValue } from '../../utils/renderUtils';

const InventoryUnitSection = ({
    formData,
    setFormData,
    allProjects,
    masterFields,
    subCategories,
    builtUpTypes,
    sizes,
    duplicateWarning,
    isCheckingDuplicate,
    isBlocked,
    handleProjectChange,
    updateBuiltupRow,
    handleAddBuiltupRow,
    handleRemoveBuiltupRow,
    currentFurnishedItem,
    setCurrentFurnishedItem,
    handleFurnishedItemKeyDown,
    removeFurnishedItem,
    setIsAddSizeModalOpen,
    customSelectStyle,
    customSelectStyleDisabled,
    inputStyle,
    labelStyle,
    sectionStyle
}) => {
    return (
        <div className="tab-content fade-in">
            {/* Basic Unit Details */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-home" style={{ color: '#3b82f6' }}></i> Basic Unit Details
                </h4>

                <div className="grid-2-col">
                    <div>
                        <label style={labelStyle}>Category</label>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', width: 'fit-content', border: '1px solid #e2e8f0' }}>
                            {['Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional'].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        category: cat,
                                        subCategory: '',
                                        builtupType: '',
                                        builtupDetails: [{ floor: 'Ground Floor', cluster: '', length: '', width: '', totalArea: '' }]
                                    }))}
                                    style={{
                                        padding: '8px 16px', borderRadius: '6px', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                        background: formData.category === cat ? '#fff' : 'transparent',
                                        color: formData.category === cat ? '#2563eb' : '#64748b',
                                        boxShadow: formData.category === cat ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Sub Category</label>
                        <select
                            style={customSelectStyle}
                            value={formData.subCategory}
                            onChange={e => setFormData(prev => ({ ...prev, subCategory: e.target.value, builtupType: '' }))}
                        >
                            <option value="">Select Sub-Category</option>
                            {subCategories.map(sc => (
                                <option key={typeof sc === 'object' ? (sc._id || sc.id) : sc} value={typeof sc === 'object' ? (sc._id || sc.id) : sc}>
                                    {renderValue(sc)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid-2-col" style={{ marginTop: '32px' }}>
                    <div>
                        <label style={labelStyle}>Unit Number</label>
                        <input
                            type="text"
                            style={{ ...inputStyle, borderColor: duplicateWarning ? '#ef4444' : '#e2e8f0' }}
                            value={formData.unitNo}
                            onChange={e => setFormData(prev => ({ ...prev, unitNo: e.target.value }))}
                            placeholder="Enter Unit No."
                        />
                        {duplicateWarning && (
                            <div style={{
                                marginTop: '8px',
                                padding: '8px',
                                background: isBlocked ? '#fef2f2' : '#fff7ed',
                                border: `1px solid ${isBlocked ? '#fca5a5' : '#fed7aa'}`,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                            }}>
                                <i className={`fas ${isBlocked ? 'fa-ban' : 'fa-exclamation-triangle'}`} style={{ color: isBlocked ? '#dc2626' : '#ea580c', marginTop: '3px' }}></i>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: isBlocked ? '#b91c1c' : '#9a3412' }}>
                                        {isBlocked ? 'Action Blocked: Duplicate Found' : 'Warning: Duplicate Found'}
                                    </p>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: isBlocked ? '#ef4444' : '#c2410c' }}>
                                        Unit {formData.unitNo} already exists in {formData.block}.
                                    </p>
                                </div>
                            </div>
                        )}
                        {isCheckingDuplicate && <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>Checking for duplicates...</p>}
                    </div>
                    <div>
                        <label style={labelStyle}>Unit Type (Orientation)</label>
                        <select
                            style={customSelectStyle}
                            value={formData.unitType}
                            onChange={e => setFormData(prev => ({ ...prev, unitType: e.target.value }))}
                        >
                            <option value="">Select Type</option>
                            {['ordinary', 'corner', 'two side open', 'three side open'].map(t => (
                                <option key={t} value={t}>{t.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid-3-col" style={{ marginTop: '32px' }}>
                    <div>
                        <label style={labelStyle}>Project Name</label>
                        <select
                            style={customSelectStyle}
                            value={formData.projectName}
                            onChange={handleProjectChange}
                        >
                            <option value="">Select Project</option>
                            {allProjects.map(proj => (
                                <option key={proj.id || proj._id} value={proj.name}>{proj.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Block</label>
                        <select
                            style={!formData.projectName ? customSelectStyleDisabled : customSelectStyle}
                            value={formData.block}
                            disabled={!formData.projectName}
                            onChange={e => setFormData(prev => ({ ...prev, block: e.target.value }))}
                        >
                            <option value="">{formData.projectName ? "Select Block" : "Select Project First"}</option>
                            {(() => {
                                const selectedProj = allProjects.find(p => p.name === formData.projectName || p._id === formData.projectId || p.id === formData.projectId);
                                if (!selectedProj) return null;
                                const blocks = selectedProj.blocks || [];
                                return blocks.length > 0 ? (
                                    blocks.map((b, idx) => {
                                        const blockName = typeof b === 'object' ? b.name : b;
                                        return <option key={blockName || idx} value={blockName}>{blockName}</option>;
                                    })
                                ) : (
                                    <option value="Open">Open Campus</option>
                                );
                            })()}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Size</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                                style={{ ...((!formData.projectName || !formData.block) ? customSelectStyleDisabled : customSelectStyle), flex: 1 }}
                                value={formData.size}
                                disabled={!formData.projectName || !formData.block}
                                onChange={e => setFormData(prev => ({ ...prev, size: e.target.value }))}
                            >
                                <option value="">
                                    {(!formData.projectName || !formData.block) ? "Select Project & Block first" : "Select Size"}
                                </option>
                                {(() => {
                                    if (!formData.projectName || !formData.block) return null;
                                    const availableSizes = sizes || [];
                                    const filteredSizes = availableSizes.filter(s =>
                                        (s.project === formData.projectName || s.projectId === formData.projectId) &&
                                        (s.block === formData.block)
                                    );
                                    return filteredSizes.map(sz => <option key={sz.id || sz._id} value={sz.name}>{sz.name}</option>);
                                })()}
                            </select>
                            <button
                                type="button"
                                onClick={() => setIsAddSizeModalOpen(true)}
                                disabled={!formData.projectName || !formData.block}
                                style={{
                                    padding: '0 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #3b82f6',
                                    background: '#eff6ff',
                                    color: '#3b82f6',
                                    cursor: (!formData.projectName || !formData.block) ? 'not-allowed' : 'pointer',
                                    opacity: (!formData.projectName || !formData.block) ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Add New Size"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Orientation & Features */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-compass" style={{ color: '#10b981' }}></i> Orientation & Features
                </h4>
                <div className="grid-4-col gap-16">
                    <div>
                        <label style={labelStyle}>Direction</label>
                        <select style={customSelectStyle} value={formData.direction} onChange={e => setFormData(prev => ({ ...prev, direction: e.target.value }))}>
                            <option value="">Select</option>
                            {(masterFields?.directions || []).map(d => (
                                <option key={typeof d === 'object' ? (d._id || d.id) : d} value={typeof d === 'object' ? (d._id || d.id) : d}>
                                    {renderValue(d)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Facing</label>
                        <select style={customSelectStyle} value={formData.facing} onChange={e => setFormData(prev => ({ ...prev, facing: e.target.value }))}>
                            <option value="">Select</option>
                            {(masterFields?.facings || []).map(f => (
                                <option key={typeof f === 'object' ? (f._id || f.id) : f} value={typeof f === 'object' ? (f._id || f.id) : f}>
                                    {renderValue(f)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Road Width</label>
                        <select style={customSelectStyle} value={formData.roadWidth} onChange={e => setFormData(prev => ({ ...prev, roadWidth: e.target.value }))}>
                            <option value="">Select</option>
                            {(masterFields?.roadWidths || []).map(r => (
                                <option key={typeof r === 'object' ? (r._id || r.id) : r} value={typeof r === 'object' ? (r._id || r.id) : r}>
                                    {renderValue(r)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Ownership</label>
                        <select style={customSelectStyle} value={formData.ownership} onChange={e => setFormData(prev => ({ ...prev, ownership: e.target.value }))}>
                            <option value="">Select Ownership</option>
                            <option>Freehold</option>
                            <option>Leasehold</option>
                            <option>Co-operative Society</option>
                            <option>Power of Attorney</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Builtup Details */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-layer-group" style={{ color: '#8b5cf6' }}></i> Builtup Details
                    </h4>
                    <button type="button" onClick={handleAddBuiltupRow} style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        <i className="fas fa-plus mr-1"></i> Add Row
                    </button>
                </div>

                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px dashed #e2e8f0' }}>
                    <div>
                        <label style={labelStyle}>Built-up Type (Dependent on Sub Category)</label>
                        <select
                            style={!formData.subCategory ? customSelectStyleDisabled : customSelectStyle}
                            value={formData.builtupType}
                            disabled={!formData.subCategory}
                            onChange={e => setFormData(prev => ({ ...prev, builtupType: e.target.value }))}
                        >
                            <option value="">{formData.subCategory ? "Select Type" : "Select Sub-Category in Unit Details First"}</option>
                            {builtUpTypes.map(t => (
                                <option key={t._id || t.id || t.name} value={t._id || t.id || t.name}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {formData.builtupDetails.map((row, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr 0.9fr 40px', gap: '12px', alignItems: 'end' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Floor</label>
                                <select style={customSelectStyle} value={row.floor} onChange={e => updateBuiltupRow(idx, 'floor', e.target.value)}>
                                    <option>Ground Floor</option>
                                    <option>First Floor</option>
                                    <option>Second Floor</option>
                                    <option>Third Floor</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Plan</label>
                                <select style={customSelectStyle} value={row.cluster} onChange={e => updateBuiltupRow(idx, 'cluster', e.target.value)}>
                                    <option value="">Select</option>
                                    <option>Type A</option>
                                    <option>Type B</option>
                                    <option>Type C</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Width</label>
                                <input type="number" style={inputStyle} placeholder="W" value={row.width} onChange={e => updateBuiltupRow(idx, 'width', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Length</label>
                                <input type="number" style={inputStyle} placeholder="L" value={row.length} onChange={e => updateBuiltupRow(idx, 'length', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>Total Area</label>
                                <div style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '8px', borderRadius: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row.totalArea ? (
                                        <>
                                            <b>{row.totalArea}</b> SqFt <br />
                                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                {(row.totalArea / 9).toFixed(1)} SqYd | {(row.totalArea / 10.764).toFixed(1)} SqM
                                            </span>
                                        </>
                                    ) : '-'}
                                </div>
                            </div>
                            <button type="button" onClick={() => handleRemoveBuiltupRow(idx)} style={{ width: '42px', height: '42px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Furnishing & Dates */}
            <div style={sectionStyle}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-couch" style={{ color: '#f59e0b' }}></i> Furnishing & Dates
                </h4>
                <div className="grid-3-col gap-24">
                    <div>
                        <label style={labelStyle}>Occupation Date</label>
                        <input type="date" style={inputStyle} value={formData.occupationDate} onChange={e => setFormData(prev => ({ ...prev, occupationDate: e.target.value }))} />
                    </div>
                    <div>
                        <label style={labelStyle}>Age of Construction</label>
                        <input type="text" style={inputStyle} placeholder="e.g. 5 Years" value={formData.ageOfConstruction} onChange={e => setFormData(prev => ({ ...prev, ageOfConstruction: e.target.value }))} />
                    </div>
                    <div>
                        <label style={labelStyle}>Possession Status</label>
                        <select
                            style={customSelectStyle}
                            value={formData.possessionStatus}
                            onChange={e => setFormData(prev => ({ ...prev, possessionStatus: e.target.value }))}
                        >
                            <option value="">Select Status</option>
                            <option value="Ready to Move">Ready to Move</option>
                            <option value="Under Construction">Under Construction</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Furnish Status</label>
                        <select style={customSelectStyle} value={formData.furnishType} onChange={e => setFormData(prev => ({ ...prev, furnishType: e.target.value }))}>
                            <option value="">Select</option>
                            <option>Fully Furnished</option>
                            <option>Semi Furnished</option>
                            <option>Unfurnished</option>
                        </select>
                    </div>
                </div>
                <div className="mt-24">
                    {formData.furnishType !== 'Unfurnished' && (
                        <div>
                            <label style={labelStyle}>Furnished Items</label>
                            <div style={{
                                minHeight: '42px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                background: '#fff', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center'
                            }}>
                                {(formData.furnishedItems ? formData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean) : []).map((item, idx) => (
                                    <span key={idx} style={{
                                        background: '#eff6ff', color: '#3b82f6', padding: '4px 10px', borderRadius: '20px',
                                        fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        {item}
                                        <i className="fas fa-times"
                                            onClick={() => removeFurnishedItem(item)}
                                            style={{ cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
                                        ></i>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    style={{ border: 'none', outline: 'none', fontSize: '0.9rem', flex: 1, minWidth: '120px', background: 'transparent', height: '100%' }}
                                    placeholder="Type & Press Enter..."
                                    value={currentFurnishedItem}
                                    onChange={e => setCurrentFurnishedItem(e.target.value)}
                                    onKeyDown={handleFurnishedItemKeyDown}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(InventoryUnitSection);
