import React from 'react';
import { renderValue } from '../../../utils/renderUtils';
import { getInitials, fixDriveUrl, getYoutubeId } from '../../../utils/helpers';
import PropertyOwnerSection from '../../../components/Shared/PropertyOwnerSection';
import MediaVaultSection from '../../../components/Shared/MediaVaultSection';

const InventorySidebar = ({
    inventory,
    onOwnerClick,
    onDocumentClick,
    onUploadClick,
    onMediaClick,
    onMediaView,
    activeLeadsCount
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Lead Matching Stat (Inverted Premium Card) */}
            <div style={{ 
                background: 'linear-gradient(135deg, #0f172a, #334155)', 
                borderRadius: '24px', padding: '28px', color: '#fff', 
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)'
            }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ width: '24px', height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-bolt" style={{ color: '#fbbf24', fontSize: '0.8rem' }}></i>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Active Demand Intelligence
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-1.5px', textShadow: '0 0 20px rgba(255,255,255,0.2)' }}>{activeLeadsCount}</span>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#10b981' }}>MATCHING LEADS</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>High-intent buyers found</p>
                        </div>
                    </div>
                </div>
                {/* Decorative Elements */}
                <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.05 }}>
                    <i className="fas fa-chart-line" style={{ fontSize: '8rem' }}></i>
                </div>
            </div>

            {/* Property Ownership Group */}
            <PropertyOwnerSection 
                inventory={inventory} 
                onOwnerClick={onOwnerClick} 
            />

            <MediaVaultSection 
                inventory={inventory}
                onMediaClick={onMediaClick}
                onMediaView={onMediaView}
                onUploadClick={onUploadClick}
                onDocumentClick={onDocumentClick}
            />

            {/* Ownership Timeline */}
            <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ width: '36px', height: '36px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-history" style={{ color: '#64748b', fontSize: '0.9rem' }}></i>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>Chain of Title History</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '14px' }}>
                    <div style={{ position: 'absolute', left: '0', top: '8px', bottom: '8px', width: '2px', background: '#f1f5f9' }}></div>

                    {renderValue(inventory.ownerHistory)?.length > 0 ? (
                        [...(inventory.ownerHistory || [])].reverse().map((item, idx) => (
                            <div key={idx} style={{ position: 'relative' }}>
                                <div style={{ 
                                    position: 'absolute', left: '-19px', top: '4px', width: '12px', height: '12px', 
                                    background: item.type === 'Removed' ? '#ef4444' : '#10b981', 
                                    borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 0 2px #f1f5f9' 
                                }}></div>
                                
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 850, color: '#1e293b' }}>{renderValue(item.contactName)}</p>
                                                {item.contactMobile && (
                                                    <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>{item.contactMobile}</p>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: item.type === 'Removed' ? '#ef4444' : '#475569', background: item.type === 'Removed' ? '#fef2f2' : '#f1f5f9', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                                                {item.role || 'Property Owner'}
                                            </span>
                                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>
                                                <i className="fas fa-info-circle" style={{ fontSize: '0.6rem', marginRight: '4px' }}></i>
                                                Reason: {renderValue(item.source)}
                                            </p>
                                        </div>
                                    </div>
                            </div>
                        ))
                    ) : (
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', fontWeight: 700, textAlign: 'center' }}>First hand record entry</p>
                    )}
                </div>
            </div>

            {/* Inventory Lifecycle Section */}
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-history" style={{ color: '#6366f1', fontSize: '0.9rem' }}></i>
                    Inventory Lifecycle
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <LifecycleMetric 
                        label="Created On" 
                        value={inventory.createdAt ? new Date(inventory.createdAt).toLocaleDateString('en-GB') : '-'} 
                        icon="calendar-plus" 
                        color="#10b981" 
                    />
                    <LifecycleMetric 
                        label="Last Updated" 
                        value={inventory.updatedAt ? new Date(inventory.updatedAt).toLocaleDateString('en-GB') : '-'} 
                        icon="edit" 
                        color="#3b82f6" 
                    />
                    <LifecycleMetric 
                        label="Total Activities" 
                        value="0" 
                        icon="chart-line" 
                        color="#6366f1" 
                    />
                    <LifecycleMetric 
                        label="Days in System" 
                        value={inventory.createdAt ? `${Math.floor((new Date() - new Date(inventory.createdAt)) / (1000 * 60 * 60 * 24))} Days` : '-'} 
                        icon="clock" 
                        color="#f59e0b" 
                    />
                </div>
            </div>
        </div>
    );
};


const LifecycleMetric = ({ label, value, icon, color }) => (
    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fas fa-${icon}`} style={{ fontSize: '0.65rem', color: color }}></i>
            <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#1e293b' }}>{value}</div>
    </div>
);

export default React.memo(InventorySidebar);
