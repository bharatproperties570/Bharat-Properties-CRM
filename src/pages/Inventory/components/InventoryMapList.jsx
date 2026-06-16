import { useTheme } from '../../../context/ThemeContext';
import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const InventoryMapList = ({ items = [], onItemClick, getLookupValue, activeItemId }) => {
    const { isDark } = useTheme();
    return (
        <div style={{ 
            width: '380px', 
            height: '100%', 
            background: 'var(--bg-gray)', 
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0
        }}>
            <div style={{ 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid var(--border-color)', 
                background: 'var(--bg-card)',
                zIndex: 5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                    Properties ({items.length})
                </h3>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Map Sidebar
                </div>
            </div>
            
            <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '0' // Removed padding to match Deals list
            }} className="custom-scrollbar">
                {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No properties found in this area.
                    </div>
                ) : (
                    items.map((item, idx) => {
                        const statusVal = getLookupValue('Status', item.status);
                        const isActiveStatus = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                        
                        const intent = String(item.primaryDealIntent || item.intent?.[0]?.lookup_value || '').toLowerCase();
                        const isSelected = activeItemId === item._id;

                        const getUnitBg = () => {
                            if (intent === 'sell') return isDark ? 'rgba(219, 39, 119, 0.15)' : '#fce7f3';
                            if (intent === 'rent') return isDark ? 'rgba(217, 119, 6, 0.15)' : '#fef3c7';
                            if (intent === 'lease') return isDark ? 'rgba(37, 99, 235, 0.15)' : '#dbeafe';
                            return isActiveStatus 
                                ? (isDark ? '#065f46' : '#dcfce7') 
                                : (isDark ? '#334155' : '#f1f5f9');
                        };

                        const getUnitColor = () => {
                            if (intent === 'sell') return isDark ? '#f472b6' : '#db2777';
                            if (intent === 'rent') return isDark ? '#fbbf24' : '#d97706';
                            if (intent === 'lease') return isDark ? '#60a5fa' : '#2563eb';
                            return isActiveStatus 
                                ? (isDark ? '#6ee7b7' : '#15803d') 
                                : (isDark ? '#cbd5e1' : '#475569');
                        };

                        return (
                            <div 
                                key={item._id}
                                className="map-property-card"
                                style={{ 
                                    padding: '8px 12px',
                                    background: isSelected ? 'var(--contact-row-hover, #f1f5f9)' : '#fff',
                                    borderBottom: '1px solid var(--border-color)',
                                    borderLeft: isSelected ? '4px solid #3b82f6' : '4px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                onClick={() => onItemClick(item._id)}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc' }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = '#fff' }}
                            >
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {/* Unit Number Badge (Colored by Intent) */}
                                    <div style={{ 
                                        minWidth: '40px', height: '36px', 
                                        background: getUnitBg(),
                                        borderRadius: '6px', display: 'flex', 
                                        alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.75rem', fontWeight: 800,
                                        color: getUnitColor(),
                                        border: `1px solid ${getUnitColor()}33`,
                                        flexShrink: 0
                                    }}>
                                        {renderValue(item.unitNo) || (idx + 1)}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Project & Price/Size */}
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {renderValue(item.projectName)}
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ fontSize: '0.65rem', color: '#ef4444' }}></i>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {renderValue(item.address?.locality || item.address?.area)}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: isDark ? 'var(--gold)' : '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.6rem' }}></i>
                                                {renderValue(getLookupValue('Size', item.sizeConfig)) || renderValue(item.sizeLabel) || `${renderValue(item.size)} ${renderValue(item.sizeUnit)}`}
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ 
                                                    width: '6px', height: '6px', 
                                                    borderRadius: '50%', 
                                                    background: isActiveStatus ? '#22c55e' : '#94a3b8',
                                                    boxShadow: isActiveStatus ? '0 0 8px rgba(34, 197, 94, 0.4)' : 'none'
                                                }}></span>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: isActiveStatus ? '#16a34a' : isDark ? 'var(--text-muted)' : '#64748b', textTransform: 'uppercase' }}>
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
