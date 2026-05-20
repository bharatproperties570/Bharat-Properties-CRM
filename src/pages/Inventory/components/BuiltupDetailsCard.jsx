import React, { useState } from 'react';
import { renderValue } from '../../../utils/renderUtils';
import { fixDriveUrl } from '../../../utils/helpers';

const BuiltupDetailsCard = ({ inventory, getLookupValue }) => {
    const [selectedImageUrl, setSelectedImageUrl] = useState(null);

    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
        gap: '12px',
        flex: 1
    };

    return (
        <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-building" style={{ color: 'var(--premium-blue)' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Built-up Details</h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Structure, floors & furnishing status</p>
                    </div>
                </div>
                {inventory.builtupVideoUrl && (
                    <a 
                        href={fixDriveUrl(inventory.builtupVideoUrl)} 
                        target="_blank" 
                        rel="noreferrer" 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '8px 16px', 
                            background: 'linear-gradient(135deg, #10b981, #059669)', 
                            color: '#fff', 
                            borderRadius: '20px', 
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            textDecoration: 'none',
                            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 12px -1px rgba(16, 185, 129, 0.3)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.2)';
                        }}
                    >
                        <i className="fas fa-play-circle" style={{ fontSize: '1.1rem' }}></i> Walkthrough Video
                    </a>
                )}
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
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={gridStyle}>
                                <InfoItem label="Plan/Cluster" value={renderValue(floor.cluster)} icon="project-diagram" />
                                <InfoItem label="Width" value={floor.width ? `${floor.width} ft.` : '-'} icon="arrows-alt-h" />
                                <InfoItem label="Length" value={floor.length ? `${floor.length} ft.` : '-'} icon="arrows-alt-v" />
                                <InfoItem label="Total Area" value={floor.totalArea ? `${floor.totalArea} Sq.Ft.` : '-'} icon="chart-area" />
                            </div>
                            {/* Actions Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                {floor.imageUrl && (
                                    <div 
                                        style={{ 
                                            position: 'relative', 
                                            width: '100px', 
                                            height: '65px', 
                                            borderRadius: '12px', 
                                            overflow: 'hidden', 
                                            border: '1px solid #e2e8f0', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                        }}
                                        onClick={() => setSelectedImageUrl(floor.imageUrl)}
                                        title="Click to zoom layout plan"
                                    >
                                        <img 
                                            src={fixDriveUrl(floor.imageUrl)} 
                                            alt="Layout Plan" 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                        <div 
                                            style={{ 
                                                position: 'absolute', 
                                                inset: 0, 
                                                backgroundColor: 'rgba(15, 23, 42, 0.4)', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                opacity: 0, 
                                                transition: 'opacity 0.2s' 
                                            }}
                                            className="hover-overlay"
                                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                                        >
                                            <i className="fas fa-search-plus" style={{ color: '#fff', fontSize: '1rem' }}></i>
                                        </div>
                                    </div>
                                )}
                                
                                {floor.videoUrl && (
                                    <a 
                                        href={fixDriveUrl(floor.videoUrl)} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            gap: '6px', 
                                            width: '100px', 
                                            padding: '8px 0', 
                                            background: '#f0fdf4', 
                                            border: '1px solid #bbf7d0', 
                                            borderRadius: '10px', 
                                            color: '#16a34a', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700, 
                                            textDecoration: 'none',
                                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.05)',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
                                        title="Watch Floor Video"
                                    >
                                        <i className="fas fa-video"></i> Walkthrough
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Overall Built-up Specs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
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

            {/* Premium Lightbox Modal for Layout Plan Preview */}
            {selectedImageUrl && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        inset: 0, 
                        zIndex: 10000, 
                        background: 'rgba(15, 23, 42, 0.9)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        backdropFilter: 'blur(12px)',
                        padding: '20px'
                    }}
                    onClick={() => setSelectedImageUrl(null)}
                >
                    <button 
                        onClick={() => setSelectedImageUrl(null)} 
                        style={{ 
                            position: 'absolute', 
                            top: '20px', 
                            right: '20px', 
                            background: 'rgba(255, 255, 255, 0.1)', 
                            border: 'none', 
                            color: '#fff', 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        <i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i>
                    </button>
                    <div style={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img 
                            src={fixDriveUrl(selectedImageUrl)} 
                            alt="Layout Plan Zoom" 
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '75vh', 
                                objectFit: 'contain',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }} 
                        />
                    </div>
                </div>
            )}
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
