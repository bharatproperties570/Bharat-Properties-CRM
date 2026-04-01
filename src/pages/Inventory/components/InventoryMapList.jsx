import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const InventoryMapList = ({ items = [], onItemClick, getLookupValue }) => {
    return (
        <div style={{ 
            width: '380px', 
            height: '100%', 
            background: '#f8fafc', 
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0
        }}>
            <div style={{ 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid #e2e8f0', 
                background: '#fff',
                zIndex: 5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Properties ({items.length})
                </h3>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Map Sidebar
                </div>
            </div>
            
            <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px'
            }} className="custom-scrollbar">
                {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        No properties found in this area.
                    </div>
                ) : (
                    items.map((item) => {
                        const statusVal = getLookupValue('Status', item.status);
                        const isActive = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                        
                        return (
                            <div 
                                key={item._id}
                                className="map-property-card"
                                style={{ 
                                    padding: '16px',
                                    background: '#fff',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    marginBottom: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => onItemClick(item._id)}
                            >
                                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                    {/* Unit Number Badge */}
                                    <div style={{ 
                                        minWidth: '50px', height: '24px', 
                                        background: isActive ? '#dcfce7' : '#f1f5f9',
                                        borderRadius: '6px', display: 'flex', 
                                        alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.8rem', fontWeight: 900,
                                        color: isActive ? '#15803d' : '#475569',
                                        border: isActive ? '1px solid #bdf4c9' : '1px solid #e2e8f0',
                                        flexShrink: 0
                                    }}>
                                        {renderValue(item.unitNo)}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Project & Price/Size */}
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {renderValue(item.projectName)}
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ fontSize: '0.65rem', color: '#ef4444' }}></i>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                {renderValue(item.address?.locality || item.address?.area)}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.6rem' }}></i>
                                                {renderValue(getLookupValue('Size', item.sizeConfig)) || renderValue(item.sizeLabel) || `${renderValue(item.size)} ${renderValue(item.sizeUnit)}`}
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ 
                                                    width: '6px', height: '6px', 
                                                    borderRadius: '50%', 
                                                    background: isActive ? '#22c55e' : '#94a3b8',
                                                    boxShadow: isActive ? '0 0 8px rgba(34, 197, 94, 0.4)' : 'none'
                                                }}></span>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: isActive ? '#16a34a' : '#64748b', textTransform: 'uppercase' }}>
                                                    {renderValue(statusVal) || 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
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

export default React.memo(InventoryMapList);
