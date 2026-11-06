import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import toast from 'react-hot-toast';

/**
 * Enterprise Project Website Catalog Modal
 * Clean, single-responsibility modal for publishing, unpublishing, 
 * and managing the project's public presence on the official website.
 */
const ProjectWebsiteModal = ({ isOpen, onClose, project, onUpdateSuccess }) => {
    const themeContext = useTheme();
    const isDark = Boolean(themeContext?.isDark);
    const [submitting, setSubmitting] = useState(false);
    const [slug, setSlug] = useState('');
    const [seoTitle, setSeoTitle] = useState('');
    const [seoDescription, setSeoDescription] = useState('');
    const [confirmUnpublish, setConfirmUnpublish] = useState(false);

    useEffect(() => {
        if (project) {
            const defaultSlug = (project.name || '')
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
            setSlug(project.websiteMetadata?.slug || defaultSlug);
            setSeoTitle(project.websiteMetadata?.seoTitle || `${project.name} | Bharat Properties`);
            setSeoDescription(project.websiteMetadata?.seoDescription || project.description || `Explore ${project.name} in ${project.address?.location || 'Prime Location'}. Luxury residential & commercial opportunities.`);
            setConfirmUnpublish(false);
        }
    }, [project, isOpen]);

    if (!isOpen || !project) return null;

    const isPublished = Boolean(project.isPublished);
    const publicUrl = `https://www.bharatproperties.co/project/${slug || project._id}`;

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            toast.success('Public URL copied to clipboard!');
        } catch {
            toast.error('Could not copy URL to clipboard');
        }
    };

    const handleOpenLiveWebsite = () => {
        window.open(publicUrl, '_blank', 'noopener,noreferrer');
    };

    const handlePublish = async () => {
        setSubmitting(true);
        try {
            const payload = {
                isPublished: true,
                publishedAt: project.publishedAt || new Date().toISOString(),
                websiteMetadata: {
                    ...(project.websiteMetadata || {}),
                    slug: slug.trim() || undefined,
                    seoTitle: seoTitle.trim() || undefined,
                    seoDescription: seoDescription.trim() || undefined
                }
            };

            await onUpdateSuccess(payload);
            toast.success('🚀 Project is now LIVE on the official website catalog!');
            onClose();
        } catch (err) {
            console.error('[ProjectWebsiteModal] Publish error:', err);
            toast.error(err.response?.data?.error || err.message || 'Failed to publish project');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnpublish = async () => {
        setSubmitting(true);
        try {
            const payload = {
                isPublished: false
            };

            await onUpdateSuccess(payload);
            toast.success('Project unpublished and reverted to Draft.');
            setConfirmUnpublish(false);
            onClose();
        } catch (err) {
            console.error('[ProjectWebsiteModal] Unpublish error:', err);
            toast.error(err.response?.data?.error || err.message || 'Failed to unpublish project');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            padding: '16px'
        }}>
            <div style={{
                position: 'fixed',
                inset: 0
            }} onClick={onClose} />

            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '540px',
                background: isDark ? '#0b1329' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0'}`,
                borderRadius: '18px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                overflow: 'hidden',
                zIndex: 1
            }}>
                {/* Modal Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                    borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9'}`,
                    background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: isPublished
                                ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5')
                                : (isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff'),
                            color: isPublished ? '#10b981' : '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem'
                        }}>
                            <i className={isPublished ? 'fas fa-globe' : 'fas fa-cloud-arrow-up'}></i>
                        </div>
                        <div>
                            <h2 style={{
                                fontSize: '1.05rem',
                                fontWeight: 800,
                                color: isDark ? '#ffffff' : '#0f172a',
                                margin: 0
                            }}>
                                {isPublished ? 'Website Catalog Settings' : 'Publish to Website Catalog'}
                            </h2>
                            <p style={{
                                fontSize: '0.78rem',
                                color: isDark ? '#94a3b8' : '#64748b',
                                margin: '2px 0 0 0'
                            }}>
                                {isPublished ? 'Control live visibility and SEO configuration' : 'Make this project publicly visible on Bharat Properties catalog'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                            color: isDark ? '#94a3b8' : '#64748b',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Status Banner */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: isPublished
                            ? (isDark ? 'rgba(16, 185, 129, 0.1)' : '#f0fdf4')
                            : (isDark ? 'rgba(245, 158, 11, 0.1)' : '#fffbeb'),
                        border: `1px solid ${isPublished ? (isDark ? 'rgba(16, 185, 129, 0.3)' : '#bbf7d0') : (isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde68a')}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: isPublished ? '#10b981' : '#f59e0b',
                                boxShadow: isPublished ? '0 0 8px #10b981' : 'none'
                            }}></span>
                            <div>
                                <div style={{
                                    fontSize: '0.82rem',
                                    fontWeight: 800,
                                    color: isPublished ? (isDark ? '#34d399' : '#15803d') : (isDark ? '#fbbf24' : '#b45309')
                                }}>
                                    {isPublished ? 'STATUS: LIVE ON WEBSITE' : 'STATUS: UNPUBLISHED (DRAFT)'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                    {isPublished
                                        ? `Publicly accessible since ${project.publishedAt ? new Date(project.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}`
                                        : 'Only visible internally inside CRM to authorized staff'}
                                </div>
                            </div>
                        </div>

                        {isPublished && (
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                background: isDark ? 'rgba(16, 185, 129, 0.2)' : '#dcfce7',
                                color: '#16a34a',
                                padding: '3px 8px',
                                borderRadius: '6px'
                            }}>
                                PUBLIC
                            </span>
                        )}
                    </div>

                    {/* Project Snapshot Card */}
                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                                Project Name
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                {project.name}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                                Location / Area
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                                {project.address?.location || project.locationSearch || 'Gurgaon, Haryana'}
                            </span>
                        </div>
                        {project.reraNumber && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                                    RERA Registration
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>
                                    {project.reraNumber}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Live Public URL Card */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color: isDark ? '#cbd5e1' : '#475569',
                            marginBottom: '6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                        }}>
                            Website URL Slug
                        </label>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: isDark ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                            borderRadius: '10px',
                            overflow: 'hidden'
                        }}>
                            <span style={{
                                padding: '10px 12px',
                                fontSize: '0.78rem',
                                color: isDark ? '#64748b' : '#94a3b8',
                                background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9',
                                borderRight: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
                                userSelect: 'none'
                            }}>
                                https://www.bharatproperties.co/project/
                            </span>
                            <input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="project-slug-name"
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    outline: 'none',
                                    padding: '10px 12px',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    color: isDark ? '#ffffff' : '#0f172a'
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                title="Copy Full Link"
                                style={{
                                    padding: '10px 14px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: isDark ? '#94a3b8' : '#64748b',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <i className="fas fa-copy"></i>
                            </button>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '6px'
                        }}>
                            <p style={{
                                fontSize: '0.72rem',
                                color: isDark ? '#64748b' : '#94a3b8',
                                margin: 0
                            }}>
                                Full URL: <code style={{ color: '#2563eb', fontWeight: 700 }}>{publicUrl}</code>
                            </p>
                            {isPublished && (
                                <button
                                    type="button"
                                    onClick={handleOpenLiveWebsite}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#10b981',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <span>Test Live Link</span>
                                    <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Danger Zone: Unpublish Option (if already published) */}
                    {isPublished && (
                        <div style={{
                            marginTop: '4px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: isDark ? 'rgba(239, 68, 68, 0.06)' : '#fef2f2',
                            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'}`
                        }}>
                            {!confirmUnpublish ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                                            Take Offline (Unpublish)
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            Reverts the project back to internal draft status
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmUnpublish(true)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            border: '1px solid #ef4444',
                                            background: 'transparent',
                                            color: '#ef4444',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Unpublish
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>
                                        ⚠️ Are you sure you want to take this project offline from the website?
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmUnpublish(false)}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: 'transparent',
                                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'}`,
                                                color: isDark ? '#ffffff' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={handleUnpublish}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                background: '#ef4444',
                                                border: 'none',
                                                color: '#ffffff',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {submitting ? 'Unpublishing...' : 'Yes, Take Offline'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9'}`,
                    background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '10px'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '9px 16px',
                            borderRadius: '10px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                            background: 'transparent',
                            color: isDark ? '#cbd5e1' : '#475569',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>

                    {isPublished && (
                        <button
                            type="button"
                            onClick={handleOpenLiveWebsite}
                            style={{
                                padding: '9px 16px',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                border: '1px solid #10b981',
                                background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                                color: '#10b981',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className="fas fa-external-link-alt"></i>
                            <span>View Live on Website</span>
                        </button>
                    )}

                    {!isPublished ? (
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={handlePublish}
                            style={{
                                padding: '9px 20px',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                border: 'none',
                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                color: '#ffffff',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
                            }}
                        >
                            {submitting ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Publishing Live...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-rocket"></i>
                                    Confirm & Go Live
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={handlePublish}
                            style={{
                                padding: '9px 18px',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                border: 'none',
                                background: '#10b981',
                                color: '#ffffff',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {submitting ? 'Saving...' : 'Update Settings'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectWebsiteModal;
