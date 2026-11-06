import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../utils/api';

const ProjectActivityTab = ({ projectId, projectName }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const fetchActivities = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await api.get(`projects/${projectId}/activities?limit=50`);
            if (res.data?.success) {
                setActivities(res.data.data || []);
                setTotalCount(res.data.totalCount || 0);
            }
        } catch (err) {
            console.error("Failed to load project activities:", err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchActivities();
    }, [fetchActivities]);

    const getActivityMeta = (type) => {
        const lower = (type || '').toLowerCase();
        if (lower.includes('call') || lower.includes('phone')) {
            return { icon: 'fas fa-phone', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        }
        if (lower.includes('visit') || lower.includes('site')) {
            return { icon: 'fas fa-map-location-dot', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
        }
        if (lower.includes('meet')) {
            return { icon: 'fas fa-users', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' };
        }
        if (lower.includes('deal') || lower.includes('negotiation') || lower.includes('token')) {
            return { icon: 'fas fa-handshake', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
        }
        if (lower.includes('whatsapp') || lower.includes('chat')) {
            return { icon: 'fab fa-whatsapp', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' };
        }
        return { icon: 'fas fa-bolt', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' };
    };

    return (
        <div className="project-activity-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header info */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-clock-rotate-left" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Interaction Intelligence
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>({totalCount})</span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Project audit logs and communication history...
                    </span>
                </div>
                <button
                    onClick={fetchActivities}
                    style={{
                        padding: '4px 10px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                    }}
                    title="Refresh activities"
                >
                    <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="loader" style={{ margin: '0 auto 12px' }}></div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Streaming interaction logs...</span>
                </div>
            ) : activities.length > 0 ? (
                <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    padding: '24px 20px'
                }}>
                    <div style={{ position: 'relative', paddingLeft: '32px', borderLeft: '2px solid var(--border-color)' }}>
                        {activities.map((act, idx) => {
                            const meta = getActivityMeta(act.type || act.activityType);
                            const actDate = act.dueDate || act.createdAt || act.date;
                            return (
                                <div key={act._id || idx} style={{ position: 'relative', marginBottom: '28px' }}>
                                    {/* Icon Marker */}
                                    <div style={{
                                        position: 'absolute',
                                        left: '-44px',
                                        top: '0',
                                        width: '26px',
                                        height: '26px',
                                        borderRadius: '50%',
                                        background: meta.bg,
                                        border: `2px solid ${meta.color}`,
                                        color: meta.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.7rem'
                                    }}>
                                        <i className={meta.icon}></i>
                                    </div>

                                    {/* Content Card */}
                                    <div style={{
                                        background: 'var(--bg-gray)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '10px',
                                        padding: '12px 16px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                                {act.subject || act.title || act.type || 'Interaction Logged'}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {actDate ? new Date(actDate).toLocaleDateString('en-IN', {
                                                    day: '2-digit', month: 'short', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                }) : '--'}
                                            </span>
                                        </div>

                                        {act.description && (
                                            <p style={{ margin: '4px 0 8px 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                {act.description}
                                            </p>
                                        )}

                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                                            {act.type && (
                                                <span style={{
                                                    fontSize: '0.62rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: meta.bg,
                                                    color: meta.color,
                                                    fontWeight: 800,
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {act.type}
                                                </span>
                                            )}
                                            {act.createdBy?.fullName && (
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                    By {act.createdBy.fullName}
                                                </span>
                                            )}
                                            {act.leadId?.name && (
                                                <span style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 700 }}>
                                                    <i className="fas fa-user" style={{ marginRight: '4px' }}></i>{act.leadId.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem'
                }}>
                    <i className="fas fa-timeline" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.4, display: 'block' }}></i>
                    No communications or deal activities recorded for this project yet.
                </div>
            )}
        </div>
    );
};

export default ProjectActivityTab;
