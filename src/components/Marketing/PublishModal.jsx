import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';

/**
 * Premium Publish Modal
 * A senior-grade glassmorphic interface for multi-platform distribution.
 */
const PublishModal = ({ isOpen, onClose, data, type = 'deal', onPublishSuccess }) => {
    const [platforms, setPlatforms] = useState({
        linkedin: false,
        facebook: false,
        instagram: false,
        google: false,
        x: false,
        youtube: false
    });

    const [privacy, setPrivacy] = useState({
        hideLocation: false,
        hideUnitNo: false
    });

    const [isPublishing, setIsPublishing] = useState(false);
    const [previewText, setPreviewText] = useState('');

    useEffect(() => {
        console.log('[PublishModal] Rendering with data:', !!data, 'isOpen:', isOpen);
        if (data) {
            try {
            const title = data.name || data.title || 'Property Update';
            const loc = data.address?.location || data.locationSearch || '';
            const unit = privacy.hideUnitNo ? '#XXX' : (data.unitNo || '');
            const finalTitle = privacy.hideUnitNo ? title.replace(/\d+/, 'XXX') : title;

            setPreviewText(`🏠 ${finalTitle} ${unit ? `(${unit})` : ''}\n📍 ${privacy.hideLocation ? 'Location Hidden' : loc}\n💰 Contact for Price\n\nExclusive property update from Bharat Properties!`);
            } catch (err) {
                console.error('[PublishModal] Effect Error:', err);
            }
        }
    }, [data, privacy, isOpen]);

    if (!isOpen) return null;

    const togglePlatform = (p) => setPlatforms(prev => ({ ...prev, [p]: !prev[p] }));
    const togglePrivacy = (p) => setPrivacy(prev => ({ ...prev, [p]: !prev[p] }));

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            const res = await api.post('/marketing/broadcast', {
                id: data._id || data.id,
                type: type, // 'deal' or 'project'
                platforms: platforms,
                privacy: privacy
            });
            
            if (res.data?.success) {
                toast.success('Broadcast launched successfully!');
                if (onPublishSuccess) onPublishSuccess();
                onClose();
            } else {
                throw new Error(res.data?.message || 'Sync failed');
            }
        } catch (err) {
            console.error('[BroadcastModal] Error:', err);
            toast.error('Failed to broadcast: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsPublishing(false);
        }
    };

    const platformIcon = (p) => {
        switch(p) {
            case 'linkedin': return { icon: 'fab fa-linkedin', color: '#0077b5', label: 'LinkedIn' };
            case 'facebook': return { icon: 'fab fa-facebook', color: '#1877f2', label: 'Facebook' };
            case 'instagram': return { icon: 'fab fa-instagram', color: '#e4405f', label: 'Instagram' };
            case 'google': return { icon: 'fab fa-google', color: '#4285f4', label: 'Google GMB' };
            case 'x': return { icon: 'fab fa-x-twitter', color: '#000000', label: 'X / Twitter' };
            case 'youtube': return { icon: 'fab fa-youtube', color: '#ff0000', label: 'YouTube' };
            default: return { icon: 'fas fa-share', color: '#64748b', label: p };
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>Broadcast Center Pro</h2>
                        <p style={styles.subtitle}>Distribute {type === 'deal' ? 'Deal' : 'Project'} across authorized channels</p>
                    </div>
                    <button onClick={onClose} style={styles.closeBtn}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div style={styles.content}>
                    {/* Left: Settings */}
                    <div style={styles.settingsPane}>
                        <section style={styles.section}>
                            <h3 style={styles.sectionTitle}>1. TARGET PLATFORMS</h3>
                            <div style={styles.platformGrid}>
                                {Object.keys(platforms).map(p => {
                                    const info = platformIcon(p);
                                    const active = platforms[p];
                                    return (
                                        <div 
                                            key={p} 
                                            onClick={() => togglePlatform(p)}
                                            style={{
                                                ...styles.platformTile,
                                                borderColor: active ? info.color : '#e2e8f0',
                                                background: active ? `${info.color}08` : '#fff',
                                                boxShadow: active ? `0 0 15px ${info.color}15` : 'none'
                                            }}
                                        >
                                            <i className={info.icon} style={{ ...styles.icon, color: active ? info.color : '#94a3b8' }}></i>
                                            <span style={{ ...styles.platformLabel, color: active ? '#1e293b' : '#64748b' }}>{info.label}</span>
                                            {active && <div style={{ ...styles.checkCircle, background: info.color }}><i className="fas fa-check"></i></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section style={styles.section}>
                            <h3 style={styles.sectionTitle}>2. PRIVACY & VISIBILITY</h3>
                            <div style={styles.privacyBox}>
                                <div style={styles.toggleRow}>
                                    <div>
                                        <p style={styles.toggleTitle}>Hide Google Map Location</p>
                                        <p style={styles.toggleDesc}>Remove precise coordinates from public listings</p>
                                    </div>
                                    <Switch active={privacy.hideLocation} onClick={() => togglePrivacy('hideLocation')} />
                                </div>
                                <div style={styles.toggleRow}>
                                    <div>
                                        <p style={styles.toggleTitle}>Mask Unit Number</p>
                                        <p style={styles.toggleDesc}>Replace unit details with generic labels (e.g. Unit #XXX)</p>
                                    </div>
                                    <Switch active={privacy.hideUnitNo} onClick={() => togglePrivacy('hideUnitNo')} />
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right: Preview */}
                    <div style={styles.previewPane}>
                        <h3 style={styles.sectionTitle}>LIVE PREVIEW</h3>
                        <div style={styles.previewCard}>
                            <div style={styles.previewHeader}>
                                <div style={styles.avatar}>BP</div>
                                <div>
                                    <p style={styles.previewUser}>Bharat Properties • Marketing</p>
                                    <p style={styles.previewMeta}>Just now • Global Distribution</p>
                                </div>
                            </div>
                            <div style={styles.previewBody}>
                                <pre style={styles.previewText}>{previewText}</pre>
                                <div style={styles.previewMedia}>
                                    <i className="fas fa-image" style={{ fontSize: '2rem', color: '#cbd5e1' }}></i>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '8px 0 0 0' }}>{data?.projectImages?.[0]?.title || 'Main Image will be attached'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                    <button 
                        onClick={handlePublish} 
                        disabled={isPublishing || !Object.values(platforms).some(v => v)}
                        style={{
                            ...styles.publishBtn,
                            opacity: (isPublishing || !Object.values(platforms).some(v => v)) ? 0.6 : 1
                        }}
                    >
                        {isPublishing ? (
                            <><i className="fas fa-spinner fa-spin"></i> Syncing to Hub...</>
                        ) : (
                            <><i className="fas fa-paper-plane"></i> Launch Broadcast</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Switch = ({ active, onClick }) => (
    <div onClick={onClick} style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        background: active ? 'var(--primary-color)' : '#e2e8f0',
        position: 'relative',
        cursor: 'pointer',
        transition: '0.3s'
    }}>
        <div style={{
            position: 'absolute',
            left: active ? '22px' : '2px',
            top: '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: '0.3s'
        }} />
    </div>
);

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
    },
    modal: {
        background: '#fff',
        width: 'min(95vw, 1000px)',
        height: 'min(90vh, 720px)',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        animation: 'fadeInUp 0.3s ease-out'
    },
    header: {
        padding: '24px 32px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #fff, #f8fafc)'
    },
    title: {
        margin: 0,
        fontSize: '1.5rem',
        fontWeight: 900,
        color: '#0f172a',
        letterSpacing: '-0.02em'
    },
    subtitle: {
        margin: '4px 0 0 0',
        fontSize: '0.85rem',
        color: '#64748b',
        fontWeight: 500
    },
    closeBtn: {
        background: '#f1f5f9',
        border: 'none',
        width: '36px',
        height: '36px',
        borderRadius: '10px',
        cursor: 'pointer',
        color: '#64748b',
        transition: '0.2s'
    },
    content: {
        flex: 1,
        display: 'flex',
        overflow: 'hidden'
    },
    settingsPane: {
        flex: '5',
        padding: '32px',
        overflowY: 'auto',
        borderRight: '1px solid #f1f5f9'
    },
    previewPane: {
        flex: '4',
        padding: '32px',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column'
    },
    section: {
        marginBottom: '32px'
    },
    sectionTitle: {
        margin: '0 0 16px 0',
        fontSize: '0.7rem',
        fontWeight: 800,
        color: '#94a3b8',
        letterSpacing: '0.1em'
    },
    platformGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        gap: '12px'
    },
    platformTile: {
        padding: '16px 12px',
        border: '2px solid transparent',
        borderRadius: '16px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        transition: '0.2s',
        position: 'relative'
    },
    icon: {
        fontSize: '1.4rem'
    },
    platformLabel: {
        fontSize: '0.75rem',
        fontWeight: 700,
        textAlign: 'center'
    },
    checkCircle: {
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        color: '#fff',
        fontSize: '0.6rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    privacyBox: {
        background: '#f8fafc',
        borderRadius: '16px',
        padding: '8px 4px',
        border: '1px solid #f1f5f9'
    },
    toggleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 12px',
        borderBottom: '1px solid #eff6ff',
        cursor: 'default'
    },
    toggleTitle: {
        margin: 0,
        fontSize: '0.85rem',
        fontWeight: 800,
        color: '#1e293b'
    },
    toggleDesc: {
        margin: '2px 0 0 0',
        fontSize: '0.7rem',
        color: '#64748b'
    },
    previewCard: {
        background: '#fff',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
        flex: 1
    },
    previewHeader: {
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        marginBottom: '16px'
    },
    avatar: {
        width: '36px',
        height: '36px',
        background: 'var(--primary-color)',
        color: '#fff',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 800
    },
    previewUser: {
        margin: 0,
        fontSize: '0.8rem',
        fontWeight: 800,
        color: '#1e293b'
    },
    previewMeta: {
        margin: 0,
        fontSize: '0.65rem',
        color: '#94a3b8'
    },
    previewBody: {
        marginTop: '16px'
    },
    previewText: {
        margin: 0,
        fontSize: '0.8rem',
        color: '#475569',
        fontFamily: 'inherit',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.6'
    },
    previewMedia: {
        marginTop: '20px',
        background: '#f1f5f9',
        height: '140px',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed #cbd5e1'
    },
    footer: {
        padding: '24px 32px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '16px',
        background: '#fff'
    },
    cancelBtn: {
        padding: '12px 24px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        background: 'transparent',
        color: '#64748b',
        fontWeight: 700,
        fontSize: '0.9rem',
        cursor: 'pointer'
    },
    publishBtn: {
        padding: '12px 32px',
        borderRadius: '12px',
        border: 'none',
        background: 'var(--primary-color)',
        color: '#fff',
        fontWeight: 800,
        fontSize: '0.9rem',
        cursor: 'pointer',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    }
};

export default PublishModal;
