import React, { useEffect } from 'react';
import { renderValue } from '../../../utils/renderUtils';
import { getInitials } from '../../../utils/helpers';

const InventoryTable = ({
    inventoryItems,
    selectedIds,
    toggleSelect,
    handleSelectAll,
    getLookupValue,
    onNavigate,
    getUserName,
    getTeamName
}) => {
    const isAllSelected = inventoryItems.length > 0 && selectedIds.length === inventoryItems.length;

    return (
        <div className="table-wrapper" style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column' }}>
            {/* Sticky Header */}
            <div className="list-header inventory-list-grid" style={{ 
                padding: '12px 1.5rem 12px 0.75rem',
                background: '#f8fafc',
                borderBottom: '1.5px solid #e2e8f0',
                color: '#64748b',
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                position: 'sticky',
                top: 0,
                zIndex: 10
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
                <div>Intersaction</div>
                <div style={{ textAlign: 'right' }}>Assignment</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {inventoryItems.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.9rem' }}>
                        No inventory found matching your criteria.
                    </div>
                ) : (
                    inventoryItems.map((item, index) => {
                        const statusVal = getLookupValue('Status', item.status);
                        const isActive = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                        const isSelected = selectedIds.includes(item._id);

                        return (
                            <div 
                                key={item._id || index}
                                className={`list-item inventory-list-grid ${isSelected ? 'selected-row' : ''}`}
                                style={{ 
                                    background: '#fff',
                                    padding: '12px 1.5rem 12px 0.75rem',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    display: 'grid',
                                    alignItems: 'center'
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
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
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>
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
                                        marginBottom: '2px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {renderValue(item.projectName) || renderValue(item.projectId?.name) || 'Unknown Project'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#64748b' }}>
                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                        <span className="text-ellipsis">
                                            {(() => {
                                                const locality = getLookupValue('Location', item.address?.locality) || getLookupValue('Area', item.address?.area) || getLookupValue('Location', item.address?.location);
                                                const city = getLookupValue('City', item.address?.city);
                                                const cleanLocality = (locality && !/^[0-9a-fA-F]{24}$/.test(locality)) ? locality : (item.address?.location?.lookup_value || item.address?.locality?.lookup_value || item.address?.location || item.address?.locality || '');
                                                const cleanCity = (city && !/^[0-9a-fA-F]{24}$/.test(city)) ? city : (item.address?.city?.lookup_value || item.address?.city || '');
                                                const pincode = getLookupValue('Pincode', item.address?.pincode) || item.address?.pincode || '';
                                                return `${renderValue(cleanLocality)}${cleanCity ? ', ' + renderValue(cleanCity) : ''}${pincode && pincode !== '-' ? ' - ' + renderValue(pincode) : ''}`;
                                            })()}
                                        </span>
                                    </div>
                                    {item.block && (
                                        <div style={{ marginTop: '4px' }}>
                                            <span style={{ fontSize: '0.58rem', padding: '2px 8px', background: '#f1f5f9', color: '#475569', fontWeight: 800, borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                BLOCK: {renderValue(item.block)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Col 4: Orientation & Features */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        {(() => {
                                            const orientationLabel = getLookupValue('Orientation', item.orientation);
                                            const facingLabel = getLookupValue('Facing', item.facing);
                                            let val = orientationLabel;
                                            if (!val || val === '-' || val === 'None') val = facingLabel;
                                            
                                            // Fallback to raw values if labels fail
                                            if (!val || val === '-' || val === 'None') {
                                                val = (typeof item.orientation === 'string' && item.orientation !== '-') ? item.orientation : 
                                                      (item.orientation?.lookup_value || item.orientation?.name);
                                            }

                                            if (!val || val === '-' || val === 'None') return null;
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                    <i className="fas fa-compass" style={{ fontSize: '0.8rem', color: '#4f46e5' }}></i>
                                                    {renderValue(val)}
                                                </div>
                                            );
                                        })()}

                                        {(() => {
                                            const rw = getLookupValue('RoadWidth', item.roadWidth) || item.roadWidth;
                                            if (!rw) return null;
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', fontWeight: 700, background: '#fffbeb', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fef3c7' }}>
                                                    <i className="fas fa-road" style={{ fontSize: '0.75rem', color: '#f59e0b' }}></i>
                                                    {renderValue(rw)}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {(() => {
                                        const dir = getLookupValue('Direction', item.direction);
                                        if (!dir) return null;
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, paddingLeft: '4px' }}>
                                                <i className="fas fa-location-arrow" style={{ fontSize: '0.75rem', color: '#94a3b8' }}></i>
                                                {renderValue(dir)}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Col 5: Owner Profile */}
                                <div className="super-cell">
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', marginBottom: '2px' }}>
                                        {renderValue(item.owners?.[0]?.name) || renderValue(item.ownerName) || 'No owner data'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>
                                        {renderValue(item.owners?.[0]?.phones?.[0]?.number) || renderValue(item.ownerPhone) || ''}
                                    </div>
                                </div>

                                {/* Col 6: Associate Contact */}
                                <div className="super-cell">
                                    {item.associates && item.associates.length > 0 ? (
                                        <>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>
                                                {renderValue(item.associates[0]?.contact?.name) || renderValue(item.associates[0]?.name)}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700 }}>
                                                {renderValue(item.associates[0]?.contact?.phones?.[0]?.number) || renderValue(item.associates[0]?.mobile) || ''}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>--</div>
                                    )}
                                </div>

                                {/* Col 7: Intersaction */}
                                <div className="super-cell">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive ? '#22c55e' : '#94a3b8' }}></span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isActive ? '#16a34a' : '#64748b', textTransform: 'uppercase' }}>
                                            {renderValue(getLookupValue('Status', item.status))}
                                        </span>
                                    </div>
                                    {(() => {
                                        const history = item.history || [];
                                        const latest = history.filter(h => h.type === 'Feedback' || h.result).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                                        if (!latest && !item.nextActionDate) return null;
                                        return (
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {latest?.result || (item.nextActionDate ? 'Next: ' + new Date(item.nextActionDate).toLocaleDateString() : '')}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Col 8: Assignment */}
                                <div className="assignment-cell-final" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div className="avatar-circle" style={{ width: '20px', height: '20px', fontSize: '0.5rem' }}>
                                            {getInitials(getUserName(item.assignedTo))}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>{renderValue(getUserName(item.assignedTo))}</div>
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>{renderValue(getTeamName(item.team))}</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default React.memo(InventoryTable);
