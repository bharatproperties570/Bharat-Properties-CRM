import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const BuiltupDetailsCard = ({ inventory, getLookupValue }) => {
    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '12px' 
    };

    return (
        <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-building" style={{ color: 'var(--premium-blue)' }}></i>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Built-up Details</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Structure, floors & furnishing status</p>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Floor Wise Details */}
                {(inventory.builtupDetails || []).map((floor, fIdx) => (
                    <div key={fIdx} style={{ padding: '20px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '10px' }}>
                            <i className="fas fa-layer-group" style={{ color: 'var(--premium-blue)', fontSize: '0.9rem' }}></i>
                            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {floor.floor || `Level ${fIdx + 1}`}
                            </span>
                        </div>
                        <div style={gridStyle}>
                            <InfoItem label="Plan/Cluster" value={renderValue(floor.cluster)} icon="project-diagram" />
                            <InfoItem label="Width" value={floor.width ? `${floor.width} ft.` : '-'} icon="arrows-alt-h" />
                            <InfoItem label="Length" value={floor.length ? `${floor.length} ft.` : '-'} icon="arrows-alt-v" />
                            <InfoItem label="Total Area" value={floor.totalArea ? `${floor.totalArea} Sq.Ft.` : '-'} icon="chart-area" />
                        </div>
                    </div>
                ))}

                {/* Overall Built-up Specs */}
                <div style={gridStyle}>
                    <InfoItem label="Built-up Type" value={renderValue(getLookupValue('BuiltupType', inventory.builtupType)) || renderValue(inventory.builtupType)} icon="building" />
                    <InfoItem label="Possession Status" value={renderValue(getLookupValue('Status', inventory.possessionStatus)) || renderValue(inventory.possessionStatus)} icon="key" />
                    <InfoItem 
                        label="Occupation Date" 
                        value={inventory.occupationDate ? new Date(inventory.occupationDate).toLocaleDateString('en-GB') : '-'} 
                        icon="calendar-alt" 
                    />
                    <InfoItem label="Age of Construction" value={renderValue(inventory.ageOfConstruction)} icon="history" />
                    <InfoItem label="Furnish Status" value={renderValue(getLookupValue('FurnishType', inventory.furnishType)) || renderValue(inventory.furnishType)} icon="couch" />
                </div>

                {/* Furnished Items List */}
                {inventory.furnishType !== 'Unfurnished' && inventory.furnishedItems && (
                    <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(79, 70, 229, 0.02))', borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.65rem', fontWeight: 800, color: 'var(--premium-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <i className="fas fa-list-check" style={{ marginRight: '8px' }}></i> Furnished Items
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(inventory.furnishedItems || '').split(',').map((item, idx) => (
                                <span key={idx} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    {item.trim()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const InfoItem = ({ label, value, icon }) => (
    <div style={{ padding: '14px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
        <p style={{ margin: '0 0 6px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fas fa-${icon}`} style={{ width: '12px', textAlign: 'center', color: '#cbd5e1' }}></i>
            {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{value || '-'}</p>
    </div>
);

export default BuiltupDetailsCard;
