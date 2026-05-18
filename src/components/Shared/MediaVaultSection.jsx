import React from 'react';
import { renderValue } from '../../utils/renderUtils';
import { fixDriveUrl, getYoutubeId } from '../../utils/helpers';
import { BASE_BACKEND_URL } from '../../utils/api';
import { usePropertyConfig } from '../../context/PropertyConfigContext';

// Professional Absolute URL Resolver
const getAbsoluteUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = BASE_BACKEND_URL || '';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const cleanUrl = url.startsWith('/') ? url : '/' + url;
    return `${cleanBase}${cleanUrl}`;
};

// Professional Date & Time Formatter
const formatDateTime = (dateVal) => {
    if (!dateVal) return '';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(d);
    } catch (e) {
        return '';
    }
};

// Detect File Type and return appropriate icon class & brand color
const getFileIconConfig = (fileName = '') => {
    const name = String(fileName).toLowerCase();
    if (name.endsWith('.pdf')) {
        return { icon: 'fa-file-pdf', color: '#ef4444', bg: '#fef2f2', border: '#fee2e2', type: 'PDF' };
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg') || name.endsWith('.gif')) {
        return { icon: 'fa-file-image', color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7', type: 'IMAGE' };
    }
    if (name.endsWith('.doc') || name.endsWith('.docx')) {
        return { icon: 'fa-file-word', color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe', type: 'WORD' };
    }
    if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) {
        return { icon: 'fa-file-excel', color: '#10b981', bg: '#f0fdf4', border: '#dcfce7', type: 'EXCEL' };
    }
    // Default invoice/doc fallback
    return { icon: 'fa-file-lines', color: '#6366f1', bg: '#f5f3ff', border: '#e0e7ff', type: 'DOC' };
};

const MediaVaultSection = ({
    inventory,
    onMediaClick,
    onMediaView,
    onUploadClick,
    onDocumentClick
}) => {
    const { getLookupValue } = usePropertyConfig();

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            <style>
                {`
                .enterprise-document-card {
                    background: #fbfbfd;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    border-top-right-radius: 14px; /* Space for the paper fold */
                    padding: 8px 12px;
                    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.01);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: visible; /* Allow folded corner shadow to pop out */
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    text-decoration: none;
                }
                /* Elegant Paper Fold "Dog-Ear" Page Corner Effect */
                .enterprise-document-card::after {
                    content: "";
                    position: absolute;
                    top: -1px;
                    right: -1px;
                    width: 14px;
                    height: 14px;
                    background: linear-gradient(135deg, #ffffff 50%, #e2e8f0 50%, #cbd5e1 100%);
                    border-bottom-left-radius: 5px;
                    border-left: 1px solid #cbd5e1;
                    border-bottom: 1px solid #cbd5e1;
                    box-shadow: -2px 2px 4px rgba(15, 23, 42, 0.03);
                    transition: all 0.2s ease;
                }
                .enterprise-document-card:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 14px rgba(99, 102, 241, 0.05), 0 2px 6px rgba(15, 23, 42, 0.01);
                    border-color: #cbd5e1;
                    background: #ffffff;
                }
                .enterprise-document-card:hover::after {
                    background: linear-gradient(135deg, #ffffff 50%, #c7d2fe 50%, #818cf8 100%);
                    border-left-color: #818cf8;
                    border-bottom-color: #818cf8;
                }
                .enterprise-doc-action-btn {
                    padding: 3px 8px;
                    font-size: 0.62rem;
                    font-weight: 800;
                    color: #4f46e5;
                    background: #f5f3ff;
                    border: 1px solid #ddd6fe;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.2s ease;
                }
                .enterprise-doc-action-btn:hover {
                    background: #4f46e5;
                    color: #ffffff;
                    border-color: #4f46e5;
                    box-shadow: 0 3px 8px rgba(79, 70, 229, 0.15);
                }
                `}
            </style>
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
                            return docs.slice(0, 10).map((doc, idx) => {
                                const docUrl = doc.url || '';
                                const absoluteDocUrl = docUrl ? getAbsoluteUrl(docUrl) : '';
                                const fileName = doc.name || doc.title || (docUrl ? decodeURIComponent(docUrl.split('/').pop().split('?')[0]) : '');
                                const fileConfig = getFileIconConfig(fileName);

                                // Resolve lookup values professionally via getLookupValue
                                const docCategoryText = getLookupValue('DocumentCategory', doc.documentCategory) || 
                                                        getLookupValue('Document-Category', doc.documentCategory) || 
                                                        (typeof doc.documentCategory === 'object' ? doc.documentCategory?.lookup_value : null) || 
                                                        doc.documentCategory || 
                                                        'Document';
                                
                                const docTypeText = getLookupValue('DocumentType', doc.documentType) || 
                                                    getLookupValue('Document-Type', doc.documentType) || 
                                                    getLookupValue('DocumentName', doc.documentName) || 
                                                    (typeof doc.documentType === 'object' ? doc.documentType?.lookup_value : null) || 
                                                    (typeof doc.documentName === 'object' ? doc.documentName?.lookup_value : null) || 
                                                    fileName || 
                                                    'File';

                                const matchedContact = (inventory?.owners || []).find(o => o.mobile === doc.linkedContactMobile || o.phones?.[0]?.number === doc.linkedContactMobile || o._id === doc.linkedContactId);
                                const ownerName = matchedContact?.name || 
                                                  doc.linkedContactName || 
                                                  (inventory?.owners?.[0]?.name) || 
                                                  (inventory?.associates?.[0]?.contact?.name || inventory?.associates?.[0]?.name) || 
                                                  'Owner N/A';

                                return (
                                    <a 
                                        key={idx} 
                                        href={absoluteDocUrl || '#'} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="enterprise-document-card"
                                        style={{ cursor: absoluteDocUrl ? 'pointer' : 'default' }}
                                    >
                                        {/* Main Card Body (compact left icon column and right metadata column) */}
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            
                                            {/* Left Column: Dedicated Compact Document Type Icon Column */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                <div style={{
                                                    width: '34px', height: '34px',
                                                    background: fileConfig.bg,
                                                    border: `1px solid ${fileConfig.border}`,
                                                    borderRadius: '8px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                                                }}>
                                                    <i className={`fas ${fileConfig.icon}`} style={{ color: fileConfig.color, fontSize: '1rem' }}></i>
                                                </div>
                                                {docCategoryText && (
                                                    <span style={{
                                                        background: '#eff6ff',
                                                        color: '#2563eb',
                                                        fontSize: '0.45rem',
                                                        padding: '0.5px 4px',
                                                        borderRadius: '3px',
                                                        fontWeight: 900,
                                                        border: '1px solid #bfdbfe',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {docCategoryText}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Right Column: Document Type Name, Linked Owner / Associate */}
                                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
                                                    {docTypeText}
                                                </span>
                                                {ownerName && (
                                                    <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                                                        <i className="fas fa-user-tie" style={{ fontSize: '0.55rem', color: '#10b981' }}></i>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {ownerName}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 3: Upload Timestamp + View Action Button */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.6rem', color: '#94a3b8' }}></i>
                                                <span>
                                                    {formatDateTime(doc.uploadedAt || doc.createdAt || doc.date) || 'Upload time N/A'}
                                                </span>
                                            </div>

                                            {absoluteDocUrl && (
                                                <div className="enterprise-doc-action-btn">
                                                    <i className="fas fa-eye" style={{ fontSize: '0.65rem' }}></i>
                                                    View
                                                </div>
                                            )}
                                        </div>
                                    </a>
                                );
                            });
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
