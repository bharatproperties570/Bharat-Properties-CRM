import React from 'react';
import { renderValue, formatSafeDate } from '../../../utils/renderUtils';
import { getInitials, fixDriveUrl, getYoutubeId } from '../../../utils/helpers';
import PropertyOwnerSection from '../../../components/Shared/PropertyOwnerSection';
import MediaVaultSection from '../../../components/Shared/MediaVaultSection';
import OwnerSuggestionSection from './OwnerSuggestionSection';

const InventorySidebar = ({
    inventory,
    onOwnerClick,
    onDocumentClick,
    onUploadClick,
    onMediaClick,
    onMediaView,
    activeLeadsCount,
    refresh
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

            {/* Chain of Title History */}
            <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #0f172a, #334155)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 8px rgba(15,23,42,0.2)' }}>
                            <i className="fas fa-landmark" style={{ color: '#fbbf24', fontSize: '0.85rem' }}></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>Chain of Title History</h3>
                            <p style={{ margin: 0, fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Legal ownership transfer trail</p>
                        </div>
                    </div>
                    {Array.isArray(inventory.ownerHistory) && inventory.ownerHistory.length > 0 && (
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fff', background: '#0f172a', padding: '3px 10px', borderRadius: '20px' }}>
                            {inventory.ownerHistory.length} EVENT{inventory.ownerHistory.length !== 1 ? 'S' : ''}
                        </div>
                    )}
                </div>

                {Array.isArray(inventory.ownerHistory) && inventory.ownerHistory.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', position: 'relative', paddingLeft: '18px' }}>
                        {/* Vertical timeline line */}
                        <div style={{ position: 'absolute', left: '6px', top: '8px', bottom: '8px', width: '2px', background: 'linear-gradient(to bottom, #e2e8f0, #f1f5f9)' }}></div>

                        {[...(inventory.ownerHistory)].reverse().map((entry, idx) => {
                            const isRemoved = entry.type === 'Removed';
                            const dotColor = isRemoved ? '#ef4444' : '#10b981';
                            const bgColor  = isRemoved ? '#fef2f2' : '#f0fdf4';
                            const textColor = isRemoved ? '#be123c' : '#065f46';
                            const displayName = entry.contactName || 'Unknown Contact';
                            const displayMobile = entry.contactMobile || '';
                            const dateStr = entry.date
                                ? new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—';
                            const timeStr = entry.date
                                ? new Date(entry.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                                : '';
                            const source = entry.source || 'Manual Update';
                            const role = entry.role || 'Property Owner';
                            const authorName = entry.authorName || '';

                            return (
                                <div key={idx} style={{ position: 'relative', paddingBottom: idx < inventory.ownerHistory.length - 1 ? '16px' : '0' }}>
                                    {/* Timeline dot */}
                                    <div style={{
                                        position: 'absolute', left: '-18px', top: '6px',
                                        width: '14px', height: '14px',
                                        background: dotColor, borderRadius: '50%',
                                        border: '3px solid #fff',
                                        boxShadow: `0 0 0 2px ${dotColor}40`
                                    }}></div>

                                    <div style={{
                                        background: bgColor,
                                        border: `1px solid ${dotColor}30`,
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        transition: 'all 0.2s'
                                    }}>
                                        {/* Row 1: Name + Badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: isRemoved ? '#fecaca' : '#bbf7d0',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.65rem', fontWeight: 900, color: textColor,
                                                    flexShrink: 0
                                                }}>
                                                    {displayName.charAt(0).toUpperCase()}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {displayName}
                                                    </p>
                                                    {displayMobile && (
                                                        <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                                            <i className="fas fa-phone-alt" style={{ fontSize: '0.55rem', marginRight: '4px' }}></i>
                                                            {displayMobile}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: '0.6rem', fontWeight: 900, padding: '3px 8px',
                                                borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                background: isRemoved ? '#ef4444' : '#10b981', color: '#fff',
                                                flexShrink: 0, marginLeft: '8px'
                                            }}>
                                                {entry.type || 'Added'}
                                            </span>
                                        </div>

                                        {/* Row 2: Role + Source */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px',
                                                borderRadius: '6px', background: '#f1f5f9', color: '#475569',
                                                border: '1px solid #e2e8f0', textTransform: 'uppercase'
                                            }}>
                                                {role}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>
                                                <i className="fas fa-link" style={{ fontSize: '0.55rem', marginRight: '3px' }}></i>
                                                {source}
                                            </span>
                                        </div>

                                        {/* Row 3: Date + Author */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700 }}>
                                                <i className="fas fa-calendar-alt" style={{ fontSize: '0.55rem', marginRight: '4px' }}></i>
                                                {dateStr} {timeStr && `· ${timeStr}`}
                                            </span>
                                            {authorName && (
                                                <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>
                                                    <i className="fas fa-user-edit" style={{ fontSize: '0.55rem', marginRight: '3px' }}></i>
                                                    {authorName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                        <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#94a3b8', fontSize: '1.2rem' }}></i>
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>First-Hand Record</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>No ownership transfers recorded. This is the original entry in the system.</p>
                    </div>
                )}
            </div>
            
            <OwnerSuggestionSection 
                inventory={inventory} 
                onRefresh={refresh}
            />

            {/* Inventory Lifecycle Section */}
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-history" style={{ color: '#6366f1', fontSize: '0.9rem' }}></i>
                    Inventory Lifecycle
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <LifecycleMetric 
                        label="Created On" 
                        value={formatSafeDate(inventory.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })} 
                        icon="calendar-plus" 
                        color="#10b981" 
                    />
                    <LifecycleMetric 
                        label="Last Updated" 
                        value={formatSafeDate(inventory.updatedAt, { day: '2-digit', month: 'short', year: 'numeric' })} 
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
                        value={(() => {
                            if (!inventory.createdAt) return '-';
                            const createdDate = new Date(inventory.createdAt);
                            if (isNaN(createdDate.getTime())) return '-';
                            const diffDays = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
                            return `${diffDays >= 0 ? diffDays : 0} Days`;
                        })()} 
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
