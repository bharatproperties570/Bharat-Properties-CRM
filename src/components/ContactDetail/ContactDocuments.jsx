import { useTheme } from '../../context/ThemeContext';

import React from 'react';
import { BASE_BACKEND_URL } from '../../utils/api';

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
        return { icon: 'fa-file-pdf', color: '#ef4444', bg: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fef2f2', border: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'var(--border-color)' : '#fee2e2', type: 'PDF' };
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg') || name.endsWith('.gif')) {
        return { icon: 'fa-file-image', color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7', type: 'IMAGE' };
    }
    if (name.endsWith('.doc') || name.endsWith('.docx')) {
        return { icon: 'fa-file-word', color: '#3b82f6', bg: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', border: '#dbeafe', type: 'WORD' };
    }
    if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) {
        return { icon: 'fa-file-excel', color: '#10b981', bg: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', border: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'var(--border-color)' : '#dcfce7', type: 'EXCEL' };
    }
    // Default invoice/doc fallback
    return { icon: 'fa-file-lines', color: '#6366f1', bg: '#f5f3ff', border: isDark ? 'rgba(255, 255, 255, 0.03)' : '#e0e7ff', type: 'DOC' };
};

const ContactDocuments = React.memo(function ContactDocuments({
    contactDocuments,
    expandedSections,
    toggleSection,
    setIsDocumentModalOpen,
    renderLookup
}) {
    const { isDark } = useTheme();
    return (
        <>
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
                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff';
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
                    color: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff';
                    border-color: #4f46e5;
                    box-shadow: 0 3px 8px rgba(79, 70, 229, 0.15);
                }
                `}
            </style>

            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.3)', boxShadow: '0 8px 32px 0 rgba(79, 70, 229, 0.08)' }}>
                {/* Header */}
                <div onClick={() => toggleSection('documents')} style={{ padding: '14px 20px', background: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid rgba(79, 70, 229, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-file-invoice" style={{ color: '#4f46e5' }}></i> Documents & Attachments
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDocumentModalOpen(true);
                            }}
                            style={{
                                background: '#4f46e5',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                        <i className={`fas fa-chevron-${expandedSections.includes('documents') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#4f46e5' }}></i>
                    </div>
                </div>

                {/* Expanded content */}
                {expandedSections.includes('documents') && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {contactDocuments.length > 0 ? (
                            contactDocuments.map((doc, idx) => {
                                // Extract file name & configuration
                                const docUrl = (typeof doc.documentPicture === 'object' ? doc.documentPicture?.url : doc.documentPicture) || '';
                                const absoluteDocUrl = getAbsoluteUrl(docUrl);
                                const fileName = (typeof doc.documentPicture === 'object' ? doc.documentPicture?.name : '') || 
                                                 (docUrl ? decodeURIComponent(docUrl.split('/').pop().split('?')[0]) : '');
                                const fileConfig = getFileIconConfig(fileName);
                                const docCategoryText = renderLookup(doc.documentCategory, '') || 
                                                        (typeof doc.documentCategory === 'object' ? doc.documentCategory?.lookup_value : null) || 
                                                        'Document';
                                
                                const docTypeText = renderLookup(doc.documentType, '') || 
                                                    renderLookup(doc.documentName, '') || 
                                                    (typeof doc.documentType === 'object' ? doc.documentType?.lookup_value : null) || 
                                                    (typeof doc.documentName === 'object' ? doc.documentName?.lookup_value : null) || 
                                                    fileName || 
                                                    'File';

                                return (
                                    <div 
                                        key={idx} 
                                        className="enterprise-document-card"
                                        style={{ cursor: absoluteDocUrl ? 'pointer' : 'default' }}
                                        onClick={() => absoluteDocUrl && window.open(absoluteDocUrl, '_blank')}
                                    >
                                        
                                        {/* Main Card Body (split into compact left icon column and right metadata column) */}
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
                                                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff',
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

                                            {/* Right Column: Document Type Name, Linked Inventory */}
                                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
                                                    {docTypeText}
                                                </span>
                                                {(doc.unitNumber || doc.projectName) && (
                                                    <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                                                        <i className="fas fa-link" style={{ fontSize: '0.55rem', color: '#10b981' }}></i>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {[
                                                                doc.unitNumber ? `Unit ${doc.unitNumber}` : '',
                                                                doc.projectName ? renderLookup(doc.projectName, '') || doc.projectName : ''
                                                            ].filter(Boolean).join(' - ')}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 3: Upload Timestamp + View Action Button */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 600 }}>
                                                <i className="far fa-clock" style={{ fontSize: '0.6rem', color: '#94a3b8' }}></i>
                                                <span>
                                                    {formatDateTime(doc.uploadedAt || doc.createdAt || doc.date) || 'Upload time N/A'}
                                                </span>
                                            </div>

                                            {absoluteDocUrl && (
                                                <button 
                                                    className="enterprise-doc-action-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(absoluteDocUrl, '_blank');
                                                    }}
                                                >
                                                    <i className="fas fa-eye" style={{ fontSize: '0.65rem' }}></i>
                                                    View
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px 16px', background: '#f5f3ff', borderRadius: '12px', border: '1px dashed #c7d2fe', textAlign: 'center' }}>
                                <div style={{ width: '40px', height: '40px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#e0e7ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-folder-open" style={{ color: '#4f46e5', fontSize: '1.1rem' }}></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 700, marginBottom: '2px' }}>No documents uploaded yet</div>
                                    <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 500 }}>Upload Aadhar, PAN, or Registry files securely</div>
                                </div>
                                <button 
                                    className="btn-outline" 
                                    style={{ padding: '6px 14px', fontSize: '0.65rem', borderRadius: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff', color: '#4f46e5', borderColor: '#c7d2fe', marginTop: '4px', fontWeight: 800 }} 
                                    onClick={() => setIsDocumentModalOpen(true)}
                                >
                                    <i className="fas fa-upload" style={{ marginRight: '6px' }}></i> Upload Document
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
});

ContactDocuments.displayName = 'ContactDocuments';

export default ContactDocuments;
