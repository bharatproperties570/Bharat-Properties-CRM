import React from 'react';

const ContactDocuments = React.memo(function ContactDocuments({
    contactDocuments,
    expandedSections,
    toggleSection,
    setIsDocumentModalOpen,
    renderLookup
}) {
    return (
        <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.2)', boxShadow: '0 8px 32px 0 rgba(79, 70, 229, 0.05)' }}>
            <div onClick={() => toggleSection('documents')} style={{ padding: '14px 20px', background: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid rgba(79, 70, 229, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-file-invoice"></i> Documents & Attachments
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
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
                    </button>
                    <i className={`fas fa-chevron-${expandedSections.includes('documents') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#4f46e5' }}></i>
                </div>
            </div>
            {expandedSections.includes('documents') && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {contactDocuments.length > 0 ? (
                        contactDocuments.map((doc, idx) => (
                            <div key={idx} style={{
                                padding: '12px 15px',
                                border: '1px solid #f1f5f9',
                                borderRadius: '12px',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                transition: 'all 0.2s'
                            }}>
                                <div style={{
                                    width: '40px', height: '40px',
                                    background: '#f5f3ff',
                                    border: '1px solid #ddd6fe',
                                    borderRadius: '10px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <i className={`fas ${doc.documentPicture?.name?.endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file-image'}`} style={{ color: '#7c3aed', fontSize: '1.1rem' }}></i>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>{renderLookup(doc.documentName)}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>ID: {doc.documentNo}</div>
                                </div>
                                <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.65rem', borderRadius: '8px', background: '#fff' }}>
                                    View
                                </button>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '10px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>No documents uploaded yet.</div>
                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.6rem', borderRadius: '6px' }} onClick={() => setIsDocumentModalOpen(true)}>Upload Now</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

ContactDocuments.displayName = 'ContactDocuments';

export default ContactDocuments;
