import { useTheme } from '../../context/ThemeContext';

import React from 'react';
import { useDocumentManager } from '../../hooks/useDocumentManager';
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
    renderLookup,
    entityId,
    entityType
}) {
    const { isDark } = useTheme();

    const { documents: unifiedDocs, loading: docsLoading, readNewDocument } = useDocumentManager(entityType, entityId, contactDocuments || []);

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
                                                    className="enterprise-doc-action-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (unifiedDoc.isLegacy) {
                                                            window.open(absoluteDocUrl, '_blank');
                                                        } else {
                                                            readNewDocument(unifiedDoc.documentId, unifiedDoc.fileName);
                                                        }
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
