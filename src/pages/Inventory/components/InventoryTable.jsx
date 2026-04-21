import React, { useState } from 'react';
import { renderValue } from '../../../utils/renderUtils';
import { getInitials } from '../../../utils/helpers';
import { PermissionGate } from '../../../hooks/usePermissions';

const InventoryTable = ({
    inventoryItems,
    selectedIds,
    toggleSelect,
    handleSelectAll,
    getLookupValue,
    onNavigate,
    getUserName,
    getTeamName,
    onAction
}) => {
    const [activeRowMenu, setActiveRowMenu] = useState(null);
    const isAllSelected = inventoryItems.length > 0 && selectedIds.length === inventoryItems.length;

    return (
        <div className="table-wrapper" style={{ height: 'calc(100vh - 250px)', overflowY: 'auto' }}>
            {/* Grid Header */}
            <div className="list-header inventory-list-grid" style={{ 
                position: 'sticky', 
                top: 0, 
                zIndex: 10,
                padding: '12px 1.5rem 12px 0.75rem',
                background: '#f8fafc',
                borderBottom: '1.5px solid #e2e8f0',
                borderTop: '1px solid #e2e8f0',
                color: '#64748b',
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap'
            }}>
                <input 
                    type="checkbox" 
                    onChange={handleSelectAll} 
                    checked={isAllSelected} 
                    style={{ cursor: 'pointer' }}
                />
                <div>Property Details</div>
                <div>Project & Location</div>
                <div>Orientation</div>
                <div>Owner Profile</div>
                <div>Associate Contact</div>
                <div style={{ textAlign: 'left' }}>Intersaction</div>
                <div style={{ textAlign: 'right', paddingRight: '1rem' }}>Assignment</div>
            </div>

            {/* Grid Body */}
            <div className="list-content" style={{ background: '#fafbfc' }}>
                {inventoryItems.map((item) => {
                    const isSelected = selectedIds.includes(item._id);
                    const statusVal = getLookupValue('Status', item.status);
                    const isActive = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                    
                    return (
                        <div 
                            key={item._id} 
                            className={`list-item inventory-list-grid ${isSelected ? 'selected-row' : ''}`}
                            style={{ 
                                background: '#fff',
                                padding: '12px 1.5rem 12px 0.75rem',
                                borderBottom: '1px solid #f1f5f9',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                marginBottom: '2px'
                            }}
                            onClick={() => toggleSelect(item._id)}
                        >
                            <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => toggleSelect(item._id)} 
                                onClick={(e) => e.stopPropagation()} 
                                style={{ cursor: 'pointer' }}
                            />
                            
                            {/* Col 2: Property Details */}
                            <div className="super-cell">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <div 
                                        style={{ 
                                            minWidth: '55px', 
                                            width: 'auto',
                                            height: '26px', 
                                            padding: '0 8px',
                                            background: isActive ? '#dcfce7' : '#f1f5f9', 
                                            borderRadius: '6px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.85rem', fontWeight: 900, 
                                            color: isActive ? '#15803d' : '#1e293b',
                                            border: isActive ? '1px solid #bdf4c9' : '1px solid #e2e8f0'
                                        }}
                                        onClick={(e) => { e.stopPropagation(); onNavigate('inventory-detail', item._id); }}
                                    >
                                        {renderValue(item.unitNo)}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {(() => {
                                            if (item.isCorner) return 'CORNER';
                                            if (item.isTwoSideOpen) return 'TWO SIDE OPEN';
                                            const ut = getLookupValue('UnitType', item.unitType);
                                            return ut ? renderValue(ut) : ''; 
                                        })()}
                                    </div>
                                </div>
                                <div style={{ paddingLeft: '2px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
                                        {renderValue(getLookupValue('Category', item.category))} | {renderValue(getLookupValue('SubCategory', item.subCategory))}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563eb', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.65rem' }}></i>
                                        {renderValue(getLookupValue('Size', item.sizeConfig)) || renderValue(item.sizeLabel) || `${renderValue(item.size)} ${renderValue(item.sizeUnit) || (typeof item.size === 'object' ? renderValue(item.size?.unit) : '')}`}
                                    </div>
                                </div>
                            </div>

                            {/* Col 3: Project & Location */}
                            <div className="super-cell">
                                <div style={{ 
                                    fontSize: '0.85rem', 
                                    fontWeight: 800, 
                                    color: '#2563eb', 
                                    marginBottom: '4px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {renderValue(item.projectName)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>
                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                    {renderValue(item.address?.locality) || renderValue(item.address?.area)}, {renderValue(item.address?.city)}
                                </div>
                                {item.block && (
                                    <span style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800, borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                        BLOCK: {renderValue(item.block)}
                                    </span>
                                )}
                            </div>

                            {/* Col 4: Orientation */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {(() => {
                                    const orientation = getLookupValue('Orientation', item.orientation);
                                    const facing = getLookupValue('Facing', item.facing);
                                    const val = orientation ? renderValue(orientation) : (facing ? renderValue(facing) : null);
                                    if (!val) return null;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
                                            <i className="fas fa-compass" style={{ fontSize: '0.9rem', color: '#4f46e5' }}></i>
                                            {val}
                                        </div>
                                    );
                                })()}
                                {(() => {
                                    const dir = getLookupValue('Direction', item.direction);
                                    if (!dir) return null;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>
                                            <i className="fas fa-location-arrow" style={{ fontSize: '0.75rem', color: '#94a3b8' }}></i>
                                            {renderValue(dir)}
                                        </div>
                                    );
                                })()}
                                {(() => {
                                    const rw = getLookupValue('RoadWidth', item.roadWidth) || item.roadWidth;
                                    if (!rw) return null;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            <i className="fas fa-road" style={{ fontSize: '0.8rem', color: '#f59e0b' }}></i>
                                            {renderValue(rw)}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Col 5: Owner Profile */}
                            <div className="super-cell">
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', marginBottom: '3px' }}>
                                    {renderValue(item.owners?.[0]?.name) || renderValue(item.ownerName) || 'No owner data'}
                                </div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>
                                    {renderValue(item.owners?.[0]?.phones?.[0]?.number) || renderValue(item.ownerPhone) || ''}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic', fontWeight: 500 }}>
                                    - {renderValue(item.address?.city) || 'Kurukshetra'}
                                </div>
                            </div>

                            {/* Col 6: Associate Contact */}
                            <div className="super-cell">
                                {item.associates && item.associates.length > 0 ? (
                                    <>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>
                                            {renderValue(item.associates[0]?.contact?.name) || renderValue(item.associates[0]?.name)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>
                                            {renderValue(item.associates[0]?.relationship) || 'Associate'}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>
                                            {renderValue(item.associates[0]?.contact?.phones?.[0]?.number) || renderValue(item.associates[0]?.mobile) || ''}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                        No associate
                                    </div>
                                )}
                            </div>

                            {/* Col 7: Intersaction */}
                            <div className="super-cell">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#22c55e' : '#94a3b8' }}></span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isActive ? '#16a34a' : '#64748b', textTransform: 'uppercase' }}>
                                        {renderValue(getLookupValue('Status', item.status))}
                                    </span>
                                </div>

                                {(() => {
                                    const history = item.history || [];
                                    const latest = history.filter(h => h.type === 'Feedback' || h.result).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                                    const note = latest?.note || '';
                                    const match = note.match(/^(.*?)\s*\((.*?)\)/);
                                    const outcome = match ? match[1].trim() : (latest?.result || '');
                                    const reason = match ? match[2].trim() : '';

                                    const nextMatch = note.match(/Next:\s*(.*?)$/);
                                    const nextFromNote = nextMatch ? nextMatch[1].trim() : null;

                                    if (!latest && !item.nextActionDate) return <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '16px' }}>No updates yet</div>;

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {latest && (
                                                <div style={{ paddingLeft: '16px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', lineHeight: '1.2', whiteSpace: 'nowrap' }}>{outcome}</div>
                                                    {reason && <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>({reason})</div>}
                                                </div>
                                            )}
                                            {(item.nextActionDate || nextFromNote) && (
                                                <div style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '6px', 
                                                    fontSize: '0.62rem', fontWeight: 700, color: '#2563eb', 
                                                    background: '#eff6ff', border: '1px solid #dbeafe',
                                                    padding: '4px 8px', borderRadius: '6px'
                                                }}>
                                                    <i className="fas fa-calendar-alt"></i>
                                                    {item.nextActionDate ? (
                                                        <span>Call Back on {new Date(item.nextActionDate).toLocaleDateString()} @ {renderValue(item.nextActionTime) || '10:00'}</span>
                                                    ) : (
                                                        <span>{nextFromNote}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Col 8: Assignment */}
                            <div className="assignment-cell-final" style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'flex-end', 
                                gap: '2px',
                                paddingRight: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div 
                                        style={{ 
                                            width: '24px', height: '24px', 
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            borderRadius: '50%', display: 'flex', 
                                            alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.55rem', color: '#64748b', fontWeight: 800,
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                            flexShrink: 0
                                        }}
                                    >
                                        {getInitials(getUserName(item.assignedTo))}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                        {renderValue(getUserName(item.assignedTo))}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                                    {renderValue(getTeamName(item.team))}
                                </div>
                                <div style={{ fontSize: '0.52rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '1px' }}>
                                    <i className="far fa-clock" style={{ fontSize: '0.55rem' }}></i>
                                    {new Date(item.updatedAt || item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </div>
                            </div>

                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(InventoryTable);
