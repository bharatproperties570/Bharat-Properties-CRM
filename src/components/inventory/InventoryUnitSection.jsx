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
    handleAddLandRow,
    handleRemoveLandRow,
    updateLandRow,
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
                                        Unit {formData.unitNo} already exists in {typeof formData.block === 'object' ? (formData.block?.name || formData.block?.block) : formData.block}.
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
                            {(masterFields?.unitTypes || ['Ordinary', 'Corner', 'Two Side Open', 'Three Side Open']).map(t => {
                                const val = typeof t === 'object' ? (t.lookup_value || t.name) : t;
                                const id = typeof t === 'object' ? (t._id || t.id) : t;
                                // We use lowercase for unitType value to match the initialization logic in useInventoryForm
                                return <option key={id} value={val.toLowerCase()}>{val}</option>;
                            })}
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
                                onChange={e => {
                                    const selectedSizeName = e.target.value;
                                    const availableSizes = sizes || [];
                                    const sizeObj = availableSizes.find(s => s.name === selectedSizeName && 
                                        (s.project === formData.projectName || s.projectId === formData.projectId) && 
                                        s.block === formData.block);
                                    
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        size: selectedSizeName,
                                        sizeType: sizeObj?.sizeType || prev.sizeType || ''
                                    }));
                                }}
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

            {/* Land Details (Agricultural Only) */}
            {formData.category === 'Agricultural' && (
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-seedling" style={{ color: '#22c55e' }}></i> Land Details
                        </h4>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr 40px', gap: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Khewat No.</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Killa No.</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Share</div>
                            <div></div>
                            <div></div>
                        </div>

                        {(formData.landDetails || []).map((row, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr 40px', gap: '16px', alignItems: 'center', marginTop: '16px' }}>
                                <input type="text" style={inputStyle} value={row.khewatNo} onChange={e => updateLandRow(idx, 'khewatNo', e.target.value)} />
                                <input type="text" style={inputStyle} value={row.killaNo} onChange={e => updateLandRow(idx, 'killaNo', e.target.value)} />
                                <input type="text" style={inputStyle} value={row.share} onChange={e => updateLandRow(idx, 'share', e.target.value)} placeholder="e.g. 1/3" />
                                <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>
                                    {row.calculatedMarlas > 0 ? (
                                        (() => {
                                            const totalMarlas = row.calculatedMarlas;
                                            const acres = Math.floor(totalMarlas / 160);
                                            const rem1 = totalMarlas % 160;
                                            const kanals = Math.floor(rem1 / 20);
                                            const marlas = Math.round(rem1 % 20);
                                            return `${acres} Acre ${kanals} Kanal ${marlas} Marla`;
                                        })()
                                    ) : '0 Acre 0 Kanal 0 Marla'}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    {idx === (formData.landDetails || []).length - 1 ? (
                                        <button type="button" onClick={handleAddLandRow} style={{ width: '32px', height: '32px', background: '#10b981', color: '#fff', border: '1px solid #059669', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-plus"></i>
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => handleRemoveLandRow(idx)} style={{ width: '32px', height: '32px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-times"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Registry Area Display */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>REGISTRY AREA</span>
                                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', background: '#f8fafc', padding: '4px 12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    {formData.totalLandAreaText || '0 Acre 0 Kanal 0 Marla'}
                                </span>
                            </div>

                            {/* GPS Area Input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>GPS AREA (Actual)</span>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input type="number" style={{ ...inputStyle, width: '100px' }} placeholder="Acres" value={formData.gpsAreaAcres || ''} onChange={e => setFormData(prev => ({ ...prev, gpsAreaAcres: e.target.value }))} />
                                    <input type="number" style={{ ...inputStyle, width: '100px' }} placeholder="Kanals" value={formData.gpsAreaKanals || ''} onChange={e => setFormData(prev => ({ ...prev, gpsAreaKanals: e.target.value }))} />
                                    <input type="number" style={{ ...inputStyle, width: '100px' }} placeholder="Marlas" value={formData.gpsAreaMarlas || ''} onChange={e => setFormData(prev => ({ ...prev, gpsAreaMarlas: e.target.value }))} />
                                </div>
                            </div>

                            {/* Map File Upload */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>PLOT MAP FILE</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <label style={{ cursor: 'pointer', background: '#3b82f6', color: 'white', padding: '6px 16px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-upload"></i> Upload .KML / .GeoJSON
                                        <input type="file" accept=".kml,.geojson" style={{ display: 'none' }} onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) setFormData(prev => ({ ...prev, kmlFile: file, kmlFileName: file.name }));
                                        }} />
                                    </label>
                                    {formData.kmlFileName && <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 500 }}><i className="fas fa-check-circle"></i> {formData.kmlFileName} attached</span>}
                                </div>
                            </div>

                            {/* Zone Selection */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569', minWidth: '150px' }}>ZONE</span>
                                <div style={{ flex: 1 }}>
                                    <select 
                                        style={customSelectStyle} 
                                        value={formData.zoneName || ''} 
                                        onChange={e => setFormData(prev => ({ ...prev, zoneName: e.target.value }))}
                                    >
                                        <option value="">---Select Zone---</option>
                                        {(masterFields?.zoneNames || []).map(zone => (
                                            <option key={typeof zone === 'object' ? (zone._id || zone.id) : zone} value={typeof zone === 'object' ? (zone._id || zone.id) : zone}>
                                                {renderValue(zone)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Area Mismatch Warning Logic */}
                            {(() => {
                                const registryTotalMarlas = (formData.landDetails || []).reduce((acc, row) => acc + (Number(row.calculatedMarlas) || 0), 0);
                                const gpsTotalMarlas = (Number(formData.gpsAreaAcres || 0) * 160) + (Number(formData.gpsAreaKanals || 0) * 20) + Number(formData.gpsAreaMarlas || 0);
                                
                                if (registryTotalMarlas > 0 && gpsTotalMarlas > 0) {
                                    const diff = Math.abs(registryTotalMarlas - gpsTotalMarlas);
                                    const diffPercentage = (diff / registryTotalMarlas) * 100;
                                    if (diffPercentage > 5) {
                                        return (
                                            <div style={{ marginTop: '12px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', marginTop: '2px' }}></i>
                                                <div>
                                                    <h5 style={{ margin: 0, color: '#b91c1c', fontSize: '0.9rem', fontWeight: 700 }}>Area Mismatch Warning</h5>
                                                    <p style={{ margin: '4px 0 0 0', color: '#991b1b', fontSize: '0.85rem' }}>
                                                        The GPS Area differs from the Registry Area by <strong>{diffPercentage.toFixed(1)}%</strong>. Mismatches greater than 5% could indicate boundary disputes or registry errors. Please verify.
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }
                                }
                                return null;
                            })()}
                        </div>

                        <div className="grid-3-col gap-16" style={{ marginTop: '32px' }}>
                            <div>
                                <label style={labelStyle}>Water Source</label>
                                <select style={customSelectStyle} value={formData.waterSource || ''} onChange={e => setFormData(prev => ({ ...prev, waterSource: e.target.value }))}>
                                    <option value="">Select Water Source</option>
                                    {(masterFields?.waterSources || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Soil Type</label>
                                <select style={customSelectStyle} value={formData.soilType || ''} onChange={e => setFormData(prev => ({ ...prev, soilType: e.target.value }))}>
                                    <option value="">Select Soil Type</option>
                                    {(masterFields?.soilTypes || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Current Crop</label>
                                <select style={customSelectStyle} value={formData.currentCrop || ''} onChange={e => setFormData(prev => ({ ...prev, currentCrop: e.target.value }))}>
                                    <option value="">Select Current Crop</option>
                                    {(masterFields?.currentCrops || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Water Level</label>
                                <select style={customSelectStyle} value={formData.waterLevel || ''} onChange={e => setFormData(prev => ({ ...prev, waterLevel: e.target.value }))}>
                                    <option value="">Select Water Level</option>
                                    {(masterFields?.waterLevels || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Water Pump Type</label>
                                <select style={customSelectStyle} value={formData.waterPumpType || ''} onChange={e => setFormData(prev => ({ ...prev, waterPumpType: e.target.value }))}>
                                    <option value="">Select Pump Type</option>
                                    {(masterFields?.waterPumpTypes || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>No. of Owner</label>
                                <select style={customSelectStyle} value={formData.numberOfOwner || ''} onChange={e => setFormData(prev => ({ ...prev, numberOfOwner: e.target.value }))}>
                                    <option value="">Select No. of Owner</option>
                                    {(masterFields?.numberOfOwners || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Front on Road</label>
                                <select style={customSelectStyle} value={formData.frontOnRoad || ''} onChange={e => setFormData(prev => ({ ...prev, frontOnRoad: e.target.value }))}>
                                    <option value="">Select Front on Road</option>
                                    {(masterFields?.frontOnRoads || []).map(r => {
                                        const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                        const id = typeof r === 'object' ? (r._id || r.id) : r;
                                        return <option key={id} value={val}>{val}</option>;
                                    })}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                            {(masterFields?.directions || []).map(d => {
                                 const id = typeof d === 'object' ? (d._id || d.id) : d;
                                 return (
                                     <option key={id} value={id}>
                                         {renderValue(d)}
                                     </option>
                                 );
                            })}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Facing</label>
                        <select style={customSelectStyle} value={formData.facing} onChange={e => setFormData(prev => ({ ...prev, facing: e.target.value }))}>
                            <option value="">Select</option>
                            {(masterFields?.facings || []).map(f => {
                                const val = typeof f === 'object' ? (f.lookup_value || f.name) : f;
                                const id = typeof f === 'object' ? (f._id || f.id) : f;
                                return (
                                    <option key={id} value={val}>
                                        {val}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Road Width</label>
                        <select style={customSelectStyle} value={formData.roadWidth} onChange={e => setFormData(prev => ({ ...prev, roadWidth: e.target.value }))}>
                            <option value="">Select</option>
                            {(masterFields?.roadWidths || []).map(r => {
                                const val = typeof r === 'object' ? (r.lookup_value || r.name) : r;
                                const id = typeof r === 'object' ? (r._id || r.id) : r;
                                return (
                                    <option key={id} value={val}>
                                        {val}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Ownership</label>
                        <select style={customSelectStyle} value={formData.ownership} onChange={e => setFormData(prev => ({ ...prev, ownership: e.target.value }))}>
                            <option value="">Select Ownership</option>
                            {(masterFields?.ownerships || []).map((own, i) => {
                                const ownName = typeof own === 'object' ? own.name : own;
                                const ownVal = typeof own === 'object' ? (own._id || own.id || ownName) : ownName;
                                return <option key={ownVal || i} value={ownName}>{ownName}</option>;
                            })}
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
                            <option value="">
                                {!formData.subCategory 
                                    ? "Select Sub-Category First" 
                                    : "Select Type"}
                            </option>
                            {builtUpTypes.map(t => (
                                <option key={t._id || t.id || t.name} value={t.name}>
                                    {t.name}
                                </option>
                            ))}
                            {/* Professional Fallback: Ensure saved data is visible even if not in the current sub-category list */}
                            {formData.builtupType && !builtUpTypes.some(t => t.name === formData.builtupType) && (
                                <option value={formData.builtupType}>{formData.builtupType}</option>
                            )}
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
