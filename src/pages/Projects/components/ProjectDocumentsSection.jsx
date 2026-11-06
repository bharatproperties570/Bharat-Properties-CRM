import React from 'react';
import { fixDriveUrl } from '../../../utils/helpers';

const ProjectDocumentsSection = ({ project, onOpenMedia }) => {
    const documents = project?.projectDocuments || [];
    const videos = project?.projectVideos || [];

    const cardStyle = {
        background: 'var(--bg-card)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        marginBottom: '10px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)'
    };

    const sectionTitleStyle = {
        fontSize: '0.78rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    return (
        <div className="project-documents-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Regulatory & Project Documents */}
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h4 style={sectionTitleStyle}>
                        <i className="fas fa-file-shield text-blue-500"></i> Regulatory & Sanction Documents ({documents.length})
                    </h4>
                    {project?.reraNumber && (
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#2563eb',
                            border: '1px solid rgba(59, 130, 246, 0.2)'
                        }}>
                            RERA: {project.reraNumber}
                        </span>
                    )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                    {documents.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-gray)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Document Name</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Category / Type</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Approval Authority</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Doc / Reg Number</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Date</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    color: '#3b82f6',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.9rem'
                                                }}>
                                                    <i className="fas fa-file-lines"></i>
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                                                        {doc.documentName || `Document #${idx + 1}`}
                                                    </div>
                                                    {doc.documentType && (
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                            {typeof doc.documentType === 'object' ? doc.documentType.lookup_value : doc.documentType}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            {typeof doc.documentCategory === 'object' ? doc.documentCategory.lookup_value : (doc.documentCategory || 'Sanction')}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>
                                            {doc.approvalAuthority || '--'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {doc.registrationNo || doc.documentNumber || '--'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            {doc.date ? new Date(doc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            {doc.url ? (
                                                <a
                                                    href={fixDriveUrl(doc.url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        background: 'var(--bg-gray)',
                                                        border: '1px solid var(--border-color)',
                                                        color: '#2563eb',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    <i className="fas fa-external-link-alt"></i> View
                                                </a>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No File</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            <i className="fas fa-folder-open" style={{ fontSize: '2rem', marginBottom: '10px', opacity: 0.4, display: 'block' }}></i>
                            No statutory or project sanction documents uploaded yet.
                        </div>
                    )}
                </div>
            </div>

            {/* Video Walkthroughs & Media */}
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h4 style={sectionTitleStyle}>
                        <i className="fas fa-video text-rose-500"></i> Video Walkthroughs & Drone Audits ({videos.length})
                    </h4>
                </div>
                <div style={{ padding: '20px' }}>
                    {videos.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            {videos.map((vid, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        background: 'var(--bg-gray)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => onOpenMedia?.({ type: 'video', url: vid.url, title: vid.title })}
                                >
                                    <div style={{
                                        height: '140px',
                                        background: '#0f172a',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ffffff',
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            background: 'rgba(239, 68, 68, 0.9)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1.2rem',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                        }}>
                                            <i className="fas fa-play" style={{ marginLeft: '3px' }}></i>
                                        </div>
                                        <span style={{
                                            position: 'absolute',
                                            bottom: '8px',
                                            right: '8px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: 'rgba(0,0,0,0.75)',
                                            fontSize: '0.65rem',
                                            fontWeight: 700
                                        }}>
                                            {vid.type || 'Video'}
                                        </span>
                                    </div>
                                    <div style={{ padding: '12px 14px' }}>
                                        <h5 style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {vid.title || `Project Showcase ${idx + 1}`}
                                        </h5>
                                        <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 600 }}>
                                            Click to stream walkthrough
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '16px' }}>
                            No walkthrough videos or drone surveys recorded.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectDocumentsSection;
