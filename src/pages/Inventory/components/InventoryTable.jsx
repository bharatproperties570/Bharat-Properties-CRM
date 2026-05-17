import React, { useEffect } from 'react';
import { renderValue, formatSafeDate, formatSafeDateTime } from '../../../utils/renderUtils';
import { getInitials } from '../../../utils/helpers';

const InventoryTable = ({
    inventoryItems,
    selectedIds,
    toggleSelect,
    handleSelectAll,
    getLookupValue,
    resolveInventoryLookup,
    onNavigate,
    getUserName,
    getTeamName,
    loading
}) => {
    const isAllSelected = inventoryItems.length > 0 && selectedIds.length === inventoryItems.length;
    
    const renderContactAddress = (contact) => {
        if (!contact) return null;
        // Check personalAddress then correspondenceAddress
        const addr = contact.personalAddress || contact.correspondenceAddress;
        if (!addr) return null;
        
        const parts = [
            addr.hNo,
            addr.street,
            resolveInventoryLookup(addr.locality, 'Locality') || resolveInventoryLookup(addr.location, 'Location') || renderValue(addr.area),
            resolveInventoryLookup(addr.tehsil, 'Tehsil'),
            resolveInventoryLookup(addr.postOffice, 'PostOffice'),
            resolveInventoryLookup(addr.city, 'City'),
            resolveInventoryLookup(addr.pincode || addr.pinCode, 'Pincode')
        ].filter(Boolean);
        
        if (parts.length === 0) return null;
        return (
            <div style={{ 
                fontSize: '0.62rem', 
                color: '#64748b', 
                marginTop: '1px', 
                lineHeight: 1.2,
                fontWeight: 600,
                fontStyle: 'italic',
                maxWidth: '220px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }} title={parts.join(', ')}>
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.55rem', marginRight: '3px', opacity: 0.7 }}></i>
                {parts.join(', ')}
            </div>
        );
    };

    return (
        <div className="table-wrapper" style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
            {loading && (
                <div style={{
                    position: 'absolute',
                    top: '41px',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <div className="premium-spinner" style={{
                        width: '36px',
                        height: '36px',
                        border: '3px solid rgba(99, 102, 241, 0.1)',
                        borderTop: '3px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }}></div>
                    <span style={{ marginTop: '14px', fontSize: '0.68rem', color: '#475569', fontWeight: 800, letterSpacing: '0.1em', fontFamily: "'Inter', sans-serif" }}>
                        REFRESHING INVENTORY...
                    </span>
                </div>
            )}
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
                <div>Interaction</div>
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
                        
                        const getRowBackground = () => {
                            if (isSelected) return '#f1f5f9';
                            const intent = String(item.primaryDealIntent || '').toLowerCase();
                            if (intent === 'sell') return '#ffe4e6'; // Rose-100
                            if (intent === 'rent') return '#fef9c3'; // Yellow-100
                            if (intent === 'lease') return '#dbeafe'; // Blue-100
                            return '#fff';
                        };

                        const getRowBorder = () => {
                            const intent = String(item.primaryDealIntent || '').toLowerCase();
                            if (intent === 'sell') return '4px solid #ec4899';
                            if (intent === 'rent') return '4px solid #f59e0b';
                            if (intent === 'lease') return '4px solid #3b82f6';
                            return '1px solid #f1f5f9';
                        };

                        return (
                            <div 
                                key={item._id || index}
                                className={`list-item inventory-list-grid ${isSelected ? 'selected-row' : ''}`}
                                style={{ 
                                    background: getRowBackground(),
                                    padding: '12px 1.5rem 12px 0.75rem',
                                    borderBottom: '1px solid #f1f5f9',
                                    borderLeft: getRowBorder(),
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
                                            {renderValue(resolveInventoryLookup(item.category, 'Category'))} | {renderValue(resolveInventoryLookup(item.subCategory, 'SubCategory'))}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563eb', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.65rem' }}></i>
                                            {renderValue(
                                                resolveInventoryLookup(item.sizeConfig, 'Size') || 
                                                resolveInventoryLookup(item.sizeType, 'PropertyType') ||
                                                resolveInventoryLookup(item.sizeLabel, 'Size') ||
                                                resolveInventoryLookup(item.sizeLabel, 'PropertyType') ||
                                                item.sizeLabel || 
                                                (typeof item.size === 'object' ? (item.size?.value ? `${item.size.value} ${item.size.unit || ''}` : null) : item.size)
                                            )}
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
                                                const locality = resolveInventoryLookup(item.address?.locality, 'Locality') || resolveInventoryLookup(item.address?.area, 'Area') || resolveInventoryLookup(item.address?.location, 'Location');
                                                const city = resolveInventoryLookup(item.address?.city, 'City');
                                                const pincode = resolveInventoryLookup(item.address?.pincode, 'Pincode') || item.address?.pincode || '';
                                                return `${renderValue(locality)}${city ? ', ' + renderValue(city) : ''}${pincode && pincode !== '-' ? ' - ' + renderValue(pincode) : ''}`;
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

                                {/* Col 4: Orientation */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {(() => {
                                        const orientationLabel = resolveInventoryLookup(item.orientation, 'Orientation');
                                        const facingLabel = resolveInventoryLookup(item.facing, 'Facing');
                                        
                                         // Prioritize non-placeholder values
                                        const val = orientationLabel || facingLabel;
     
                                         if (!val || val === '-' || val === 'None') return null;
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
                                                <i className="fas fa-compass" style={{ fontSize: '0.9rem', color: '#4f46e5' }}></i>
                                                {renderValue(val)}
                                            </div>
                                        );
                                    })()}
                                    {(() => {
                                        const dir = resolveInventoryLookup(item.direction, 'Direction');
                                        if (!dir) return null;
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>
                                                <i className="fas fa-location-arrow" style={{ fontSize: '0.75rem', color: '#94a3b8' }}></i>
                                                {renderValue(dir)}
                                            </div>
                                        );
                                    })()}
                                    {(() => {
                                        const rw = resolveInventoryLookup(item.roadWidth, 'RoadWidth') || item.roadWidth;
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
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', marginBottom: '2px' }}>
                                        {renderValue(item.owners?.[0]?.name) || renderValue(item.ownerName) || 'No owner data'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>
                                        {renderValue(item.owners?.[0]?.phones?.[0]?.number) || renderValue(item.ownerPhone) || ''}
                                    </div>
                                    {renderContactAddress(item.owners?.[0])}
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
                                            {renderContactAddress(item.associates[0]?.contact)}
                                        </>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>--</div>
                                    )}
                                </div>

                                {/* Col 7: Interaction */}
                                <div className="super-cell">
                                    {(() => {
                                        const history = item.history || [];
                                        // Find latest feedback interaction safely
                                        const latest = history
                                            .filter(h => h && (h.type === 'Feedback' || h.details?.responses))
                                            .sort((a, b) => {
                                                const dateA = a.date ? new Date(a.date).getTime() : 0;
                                                const dateB = b.date ? new Date(b.date).getTime() : 0;
                                                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                                            })[0];
                                        
                                        const outcome = latest?.details?.result;
                                        const reason = latest?.details?.reason;
                                        const feedbackDate = latest?.date 
                                            ? formatSafeDate(latest.date, { day: '2-digit', month: 'short', year: 'numeric' }, null) 
                                            : (latest?.performedAt 
                                                ? formatSafeDate(latest.performedAt, { day: '2-digit', month: 'short', year: 'numeric' }, null) 
                                                : null);
                                        const followUp = item.followUpDate ? formatSafeDate(item.followUpDate, {}, null) : null;

                                        return (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                    <div style={{ 
                                                        padding: '2px 8px', 
                                                        borderRadius: '4px', 
                                                        fontSize: '0.58rem', 
                                                        fontWeight: 900, 
                                                        background: isActive ? '#22c55e' : '#64748b',
                                                        color: '#fff',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        width: 'fit-content'
                                                    }}>
                                                        {isActive ? 'Active' : 'Inactive'}
                                                    </div>
                                                    {feedbackDate && (
                                                        <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700, opacity: 0.8 }}>
                                                            {feedbackDate}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    {outcome && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>{renderValue(outcome)}</span>
                                                            {reason && <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>({renderValue(reason)})</span>}
                                                        </div>
                                                    )}
                                                    {followUp && (
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <i className="far fa-calendar-alt" style={{ fontSize: '0.6rem' }}></i>
                                                            Follow-up: {followUp}
                                                        </div>
                                                    )}
                                                    {!outcome && !followUp && <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>No Recent Feedback</span>}
                                                </div>
                                            </>
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
                                        {formatSafeDateTime(item.updatedAt || item.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                                    </div>
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
