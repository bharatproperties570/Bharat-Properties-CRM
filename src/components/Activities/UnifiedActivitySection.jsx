import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, activitiesAPI } from '../../utils/api';
import { renderValue } from '../../utils/renderUtils';
import './UnifiedActivitySection.css';

/**
 * UnifiedActivitySection component
 * Combines a multi-tab activity composer and an omnichannel timeline.
 * 
 * @param {string} entityId - The ID of the record (Contact, Lead, Deal, Inventory)
 * @param {string} entityType - The type of record ('Contact', 'Lead', 'Deal', 'Inventory')
 * @param {object} entityData - Optional initial data for context
 * @param {function} onActivitySaved - Callback after successful save
 */
const UnifiedActivitySection = ({ entityId, entityType, entityData, onActivitySaved }) => {
    const [composerTab, setComposerTab] = useState('note');
    const [composerContent, setComposerContent] = useState('');
    const [composerLoading, setComposerLoading] = useState(false);

    const [timelineFilter, setTimelineFilter] = useState('all');
    const [unifiedTimeline, setUnifiedTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    const [pendingTasks, setPendingTasks] = useState([
        { id: Date.now(), subject: '', dueDate: new Date().toISOString().slice(0, 16), reminder: false }
    ]);

    const fetchUnifiedTimeline = useCallback(async () => {
        if (!entityId || !entityType) return;
        setLoadingTimeline(true);
        try {
            const res = await activitiesAPI.getUnified(entityType.toLowerCase(), entityId);
            if (res && res.success) {
                setUnifiedTimeline(res.data || []);
            }
        } catch (error) {
            console.error("Error fetching unified timeline:", error);
        } finally {
            setLoadingTimeline(false);
        }
    }, [entityId, entityType]);

    useEffect(() => {
        fetchUnifiedTimeline();
    }, [fetchUnifiedTimeline]);

    const addTask = () => {
        setPendingTasks([...pendingTasks, {
            id: Date.now(),
            subject: '',
            dueDate: new Date().toISOString().slice(0, 16),
            reminder: false
        }]);
    };

    const removeTask = (id) => {
        if (pendingTasks.length > 1) {
            setPendingTasks(pendingTasks.filter(t => t.id !== id));
        }
    };

    const updateTask = (id, field, value) => {
        setPendingTasks(pendingTasks.map(t =>
            t.id === id ? { ...t, [field]: value } : t
        ));
    };

    const handleSaveActivity = async () => {
        if (!entityId || !entityType) return;

        setComposerLoading(true);
        try {
            let backendData = {
                type: composerTab.charAt(0).toUpperCase() + composerTab.slice(1),
                subject: composerTab === 'task' ? 'Multiple Tasks Created' : `${composerTab.charAt(0).toUpperCase() + composerTab.slice(1)} Logged`,
                status: 'Completed',
                priority: 'Normal',
                entityId: entityId,
                entityType: entityType,
                relatedTo: [{ id: entityId, name: entityData?.name || entityData?.unitNo || 'Unknown', model: entityType }],
                description: composerContent,
                details: {
                    purpose: composerTab,
                    content: composerContent
                }
            };

            if (composerTab === 'task') {
                const tasksToSave = pendingTasks.filter(t => t.subject.trim());
                if (tasksToSave.length === 0) {
                    toast.error('Please enter at least one task subject.');
                    setComposerLoading(false);
                    return;
                }
                backendData.tasks = tasksToSave.map(t => ({
                    subject: t.subject,
                    dueDate: t.dueDate,
                    reminder: t.reminder
                }));
                backendData.subject = tasksToSave.length === 1 ? tasksToSave[0].subject : `New Tasks (${tasksToSave.length})`;
                backendData.status = 'Pending'; // Tasks are usually pending
            }

            const res = await activitiesAPI.create(backendData);
            if (res && res.success) {
                toast.success(`${composerTab.charAt(0).toUpperCase() + composerTab.slice(1)} saved successfully!`);
                setComposerContent('');
                setPendingTasks([{ id: Date.now(), subject: '', dueDate: new Date().toISOString().slice(0, 16), reminder: false }]);
                fetchUnifiedTimeline();
                if (onActivitySaved) onActivitySaved(res.data);
            } else {
                toast.error('Failed to save activity');
            }
        } catch (error) {
            console.error("Error saving activity:", error);
            toast.error('Error saving activity');
        } finally {
            setComposerLoading(false);
        }
    };

    const getTimelineIcon = (item) => {
        if (item.source === 'audit') return { icon: 'history', color: '#8b5cf6', bg: '#f5f3ff' };

        const type = (item.type || '').toLowerCase();
        if (type.includes('call')) return { icon: 'phone-alt', color: '#3b82f6', bg: '#eff6ff' };
        if (type.includes('meeting')) return { icon: 'users', color: '#10b981', bg: '#f0fdf4' };
        if (type.includes('task')) return { icon: 'tasks', color: '#f59e0b', bg: '#fffbeb' };
        if (type.includes('email')) return { icon: 'envelope', color: '#ef4444', bg: '#fef2f2' };
        if (type.includes('whatsapp')) return { icon: 'whatsapp', color: '#25d366', bg: '#f0fdf4', brand: true };

        return { icon: 'clock', color: '#64748b', bg: '#f8fafc' };
    };

    return (
        <div className="unified-activity-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* 1. Activity Composer */}
            <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', background: 'rgba(248, 250, 252, 0.3)' }}>
                    {[
                        { id: 'email', icon: 'envelope', label: 'Email' },
                        { id: 'whatsapp', icon: 'whatsapp', label: 'WhatsApp', isBrand: true },
                        { id: 'note', icon: 'sticky-note', label: 'Note' },
                        { id: 'call', icon: 'phone-alt', label: 'Call Log' },
                        { id: 'task', icon: 'calendar-check', label: 'Task' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setComposerTab(tab.id)}
                            style={{
                                padding: '14px 20px',
                                border: 'none',
                                background: 'transparent',
                                borderRight: '1px solid rgba(226, 232, 240, 0.5)',
                                borderBottom: composerTab === tab.id ? '3px solid var(--premium-blue)' : 'none',
                                color: composerTab === tab.id ? 'var(--premium-blue)' : '#64748b',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className={`${tab.isBrand ? 'fab' : 'fas'} fa-${tab.icon}`}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ padding: '20px' }}>
                    {composerTab === 'task' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {pendingTasks.map((task) => (
                                <div key={task.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="text"
                                                placeholder="What needs to be done?"
                                                value={task.subject}
                                                onChange={(e) => updateTask(task.id, 'subject', e.target.value)}
                                                style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <input
                                                type="datetime-local"
                                                value={task.dueDate}
                                                onChange={(e) => updateTask(task.id, 'dueDate', e.target.value)}
                                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: 'var(--premium-blue)', fontWeight: 600, outline: 'none' }}
                                            />
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: task.reminder ? 'var(--premium-blue)' : '#64748b' }}>
                                                <input type="checkbox" checked={task.reminder} onChange={(e) => updateTask(task.id, 'reminder', e.target.checked)} />
                                                <i className={`fas fa-bell${task.reminder ? '' : '-slash'}`}></i> Remind Me
                                            </label>
                                        </div>
                                    </div>
                                    {pendingTasks.length > 1 && (
                                        <button onClick={() => removeTask(task.id)} style={{ padding: '4px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button onClick={addTask} style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', cursor: 'pointer', transition: 'all 0.2s', marginTop: '4px' }}>
                                <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Another Task
                            </button>
                        </div>
                    ) : (
                        <textarea
                            placeholder={`Type your ${composerTab} details here...`}
                            value={composerContent}
                            onChange={(e) => setComposerContent(e.target.value)}
                            style={{
                                width: '100%',
                                minHeight: '100px',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                background: 'rgba(255, 255, 255, 0.5)',
                                borderRadius: '12px',
                                padding: '14px',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit'
                            }}
                        ></textarea>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button
                            onClick={handleSaveActivity}
                            disabled={composerLoading}
                            style={{
                                padding: '10px 24px',
                                fontSize: '0.8rem',
                                borderRadius: '10px',
                                background: 'var(--premium-blue)',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {composerLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            Save {composerTab === 'task' ? 'Tasks' : (composerTab.charAt(0).toUpperCase() + composerTab.slice(1))}
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Timeline Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Unified Timeline</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={timelineFilter}
                            onChange={(e) => setTimelineFilter(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#4f46e5',
                                background: '#f5f3ff',
                                border: '1px solid #ddd6fe',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="all">All Activities</option>
                            <option value="call">Calls</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="email">Emails</option>
                            <option value="task">Tasks</option>
                            <option value="note">Notes</option>
                        </select>
                    </div>
                </div>

                <div className="timeline-container" style={{ position: 'relative', paddingLeft: '8px' }}>
                    {loadingTimeline ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            <div className="loader" style={{ margin: '0 auto 12px' }}></div>
                            <span style={{ fontSize: '0.85rem' }}>Syncing timeline...</span>
                        </div>
                    ) : unifiedTimeline.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {unifiedTimeline
                                .filter(item => {
                                    if (timelineFilter === 'all') return true;
                                    const type = (item.type || '').toLowerCase();
                                    return type.includes(timelineFilter);
                                })
                                .map((item, idx) => {
                                    const style = getTimelineIcon(item);
                                    return (
                                        <div key={idx} className="timeline-item" style={{ position: 'relative', paddingLeft: '40px' }}>
                                            <div className="timeline-connector"></div>
                                            <div style={{
                                                position: 'absolute',
                                                left: '0',
                                                top: '4px',
                                                background: style.color,
                                                color: '#fff',
                                                width: '26px',
                                                height: '26px',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.75rem',
                                                border: '4px solid #fff',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                                zIndex: 2
                                            }}>
                                                <i className={`${style.brand ? 'fab' : 'fas'} fa-${style.icon}`}></i>
                                            </div>
                                            <div className="glass-card" style={{
                                                borderRadius: '16px',
                                                padding: '16px',
                                                border: `1px solid ${style.bg === '#f8fafc' ? 'rgba(226, 232, 240, 0.8)' : style.color + '22'}`,
                                                background: style.bg
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', flex: 1 }}>
                                                        {item.title}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.5)', padding: '2px 8px', borderRadius: '6px' }}>
                                                        {new Date(item.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                {item.description && (
                                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '6px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                        {item.description}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: '8px' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                                                        <i className="fas fa-user-circle" style={{ marginRight: '4px' }}></i> {item.actor || 'System'}
                                                    </div>
                                                    {item.status && (
                                                        <div style={{
                                                            fontSize: '0.6rem',
                                                            padding: '3px 10px',
                                                            borderRadius: '6px',
                                                            background: item.status === 'Completed' ? '#dcfce7' : '#fee2e2',
                                                            color: item.status === 'Completed' ? '#166534' : '#991b1b',
                                                            fontWeight: 900,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px'
                                                        }}>
                                                            {item.status}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className="glass-card" style={{ padding: '40px', textAlign: 'center', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                            <i className="fas fa-stream" style={{ fontSize: '2rem', color: '#e2e8f0', marginBottom: '12px' }}></i>
                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No activities found. Start the conversation!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UnifiedActivitySection;
