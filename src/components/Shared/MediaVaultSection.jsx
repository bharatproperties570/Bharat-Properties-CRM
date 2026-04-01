import React from 'react';
import { renderValue } from '../../utils/renderUtils';
import { fixDriveUrl, getYoutubeId } from '../../utils/helpers';

const MediaVaultSection = ({
    inventory,
    onMediaClick,
    onMediaView,
    onUploadClick,
    onDocumentClick
}) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            {/* Media Gallery */}
            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-images" style={{ color: '#4f46e5', fontSize: '0.9rem' }}></i>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>Media Archive</h3>
                    </div>
                    <button 
                        onClick={onMediaClick}
                        style={{ border: 'none', background: 'transparent', color: '#4f46e5', padding: '0', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                    >
                        View All <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }}></i>
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(() => {
                        const images = Array.isArray(inventory?.inventoryImages) ? inventory.inventoryImages : [];
                        const videos = Array.isArray(inventory?.inventoryVideos) ? inventory.inventoryVideos : [];
                        const allMedia = [
                            ...images.map(img => ({ ...img, type: 'image' })),
                            ...videos.map(vid => ({ ...vid, type: 'video' }))
                        ];

                        if (allMedia.length > 0) {
                            return allMedia.slice(0, 8).map((m, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => onMediaView && onMediaView(m)}
                                    style={{ 
                                        padding: '12px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '12px', 
                                        display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #f1f5f9',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)'}
                                >
                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', background: '#e2e8f0', flexShrink: 0, position: 'relative' }}>
                                        <img 
                                            src={m.type === 'video' && getYoutubeId(m.url) 
                                                ? `https://img.youtube.com/vi/${getYoutubeId(m.url)}/mqdefault.jpg` 
                                                : fixDriveUrl(m.url || m.previewUrl)} 
                                            alt="prop" 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                        {m.type === 'video' && (
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                                <i className="fas fa-play" style={{ color: '#fff', fontSize: '0.6rem' }}></i>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.title || (m.type === 'video' ? 'Property Video' : 'Property Image')}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                            <i className={`fas fa-${m.type === 'video' ? 'video' : 'camera'}`} style={{ fontSize: '0.65rem', color: '#94a3b8' }}></i>
                                            <span style={{ fontSize: '0.65rem', color: '#4f46e5', fontWeight: 800, textTransform: 'uppercase' }}>
                                                {m.category || (m.type === 'video' ? 'Video' : 'Media')}
                                            </span>
                                        </div>
                                    </div>
                                    <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem', color: '#cbd5e1' }}></i>
                                </div>
                            ));
                        }

                        return (
                            <div onClick={onUploadClick} style={{ padding: '24px', borderRadius: '16px', background: 'rgba(248, 250, 252, 0.5)', border: '2px dashed #e2e8f0', textAlign: 'center', cursor: 'pointer' }}>
                                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.5rem', color: '#cbd5e1', marginBottom: '8px' }}></i>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>DRAG & DROP MEDIA</p>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Documents */}
            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-file-shield" style={{ color: '#ef4444', fontSize: '0.9rem' }}></i>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>Vault Documents</h3>
                    </div>
                    <button 
                        onClick={onDocumentClick}
                        style={{ border: 'none', background: '#f1f5f9', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}
                    >
                        ADD NEW
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(() => {
                        const docs = Array.isArray(inventory?.inventoryDocuments) ? inventory.inventoryDocuments : (Array.isArray(inventory?.documents) ? inventory.documents : []);
                        
                        if (docs.length > 0) {
                            return docs.slice(0, 10).map((doc, idx) => (
                                <a 
                                    key={idx} 
                                    href={doc.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ 
                                        padding: '12px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '12px', 
                                        display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #f1f5f9',
                                        textDecoration: 'none', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)'}
                                >
                                    <div style={{ width: '36px', height: '36px', background: '#fee2e2', color: '#ef4444', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-file-pdf"></i>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {renderValue(doc.documentNumber) || renderValue(doc.documentName) || renderValue(doc.title) || 'Document'}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#4f46e5', fontWeight: 800, textTransform: 'uppercase' }}>
                                                {renderValue(doc.documentCategory) || renderValue(doc.category) || 'General'}
                                            </span>
                                            {doc.documentType && (
                                                <>
                                                    <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>•</span>
                                                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                                        {renderValue(doc.documentType)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {(() => {
                                            const contact = (inventory?.owners || []).find(o => o.mobile === doc.linkedContactMobile);
                                            return contact?.name ? (
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <i className="fas fa-user-circle" style={{ fontSize: '0.7rem' }}></i>
                                                    Source: {contact.name}
                                                </p>
                                            ) : null;
                                        })()}
                                    </div>
                                </a>
                            ));
                        }

                        return (
                            <div style={{ padding: '20px', borderRadius: '16px', background: 'rgba(248, 250, 252, 0.5)', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', fontWeight: 700 }}>No documents archived</p>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default React.memo(MediaVaultSection);
