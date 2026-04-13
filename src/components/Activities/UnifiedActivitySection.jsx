import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import whatsappService from '../../services/whatsappService';
import smsService from '../../services/smsService';
import RecordingPlayer from './RecordingPlayer';
import { useActivities } from '../../context/ActivityContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import apiWrapper, { api, usersAPI, activitiesAPI } from '../../utils/api';
import MeetingActivitySection from './sections/MeetingActivitySection';
import SiteVisitActivitySection from './sections/SiteVisitActivitySection';
import './UnifiedActivitySection.css';

/**
 * UnifiedActivitySection component
 * Combines a multi-tab activity composer and an omnichannel timeline.
 * 
 * @param {string} entityId - The ID of the record (Contact, Lead, Deal, Inventory)
 * @param {string} entityType - The type of record ('Contact', 'Lead', 'Deal', 'Inventory')
 * @param {object} entityData - Optional initial data for context
 * @param {function} onActivitySaved - Callback after successful save
 * @param {boolean} hideComposer - Whether to hide the activity composer section
 */
const UnifiedActivitySection = ({ entityId, entityType, entityData, onActivitySaved, hideComposer = false, relatedEntities = [] }) => {
    const { addActivity } = useActivities();
    const { activityMasterFields } = usePropertyConfig();
    const [composerTab, setComposerTab] = useState('note');
    const [composerContent, setComposerContent] = useState('');
    const [composerLoading, setComposerLoading] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Common Activity States
    const [composerData, setComposerData] = useState({
        subject: '',
        status: 'Completed',
        priority: 'Normal',
        purpose: '',
        meetingType: 'Office',
        meetingLocation: '',
        meetingOutcomeStatus: '',
        visitConfirmation: 'Tentative',
        visitedProperties: [{ project: '', block: '', property: '', result: '', feedback: '' }],
        completionResult: ''
    });

    const [projects, setProjects] = useState([]);
    const [rowUnits, setRowUnits] = useState({});
    const [errors, setErrors] = useState({});

    // WhatsApp Specific States
    const [whatsappTemplates, setWhatsappTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);

    const [timelineFilter, setTimelineFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const [allUsers, setAllUsers] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [unifiedTimeline, setUnifiedTimeline] = useState([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    const [pendingTasks, setPendingTasks] = useState([
        { id: Date.now(), subject: '', dueDate: new Date().toISOString().slice(0, 16), reminder: false }
    ]);

    const fetchProjects = useCallback(async () => {
        try {
            const response = await apiWrapper.projects.getAll();
            if (response.success) {
                setProjects(response.data || []);
            }
        } catch (error) {
            console.error("Error fetching projects:", error);
        }
    }, []);

    const fetchUnits = useCallback(async (rowIndex, projectName, blockName) => {
        if (!projectName) return;
        try {
            const params = new URLSearchParams();
            params.append('area', projectName);
            if (blockName) params.append('location', blockName);
            params.append('limit', '100');

            const response = await api.get(`inventory?${params.toString()}`);
            if (response.data && (response.data.success || Array.isArray(response.data))) {
                setRowUnits(prev => ({
                    ...prev,
                    [rowIndex]: response.data.records || response.data.data || (Array.isArray(response.data) ? response.data : [])
                }));
            }
        } catch (error) {
            console.error("Error fetching units:", error);
        }
    }, []);

    useEffect(() => {
        if (entityId) {
            fetchProjects();
        }
    }, [entityId, fetchProjects]);

    const handleComposerChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setComposerData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    }, [errors]);

    const updatePropertyRow = useCallback((index, updates) => {
        setComposerData(prev => {
            const newProps = [...prev.visitedProperties];
            newProps[index] = { ...newProps[index], ...updates };
            return { ...prev, visitedProperties: newProps };
        });
    }, []);

    const addPropertyRow = useCallback(() => {
        setComposerData(prev => ({
            ...prev,
            visitedProperties: [...prev.visitedProperties, { project: '', block: '', property: '', result: '', feedback: '' }]
        }));
    }, []);

    const removePropertyRow = useCallback((index) => {
        if (composerData.visitedProperties.length <= 1) return;
        setComposerData(prev => ({
            ...prev,
            visitedProperties: prev.visitedProperties.filter((_, i) => i !== index)
        }));
    }, [composerData.visitedProperties.length]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await usersAPI.getAll();
            if (res && res.success) {
                setAllUsers(res.data || []);
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    }, []);

    const fetchWhatsAppTemplates = useCallback(async () => {
        setIsTemplatesLoading(true);
        try {
            const res = await whatsappService.getTemplates();
            setWhatsappTemplates(res.data || []);
        } catch (error) {
            console.error("Error fetching WhatsApp templates:", error);
        } finally {
            setIsTemplatesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (composerTab === 'whatsapp' && whatsappTemplates.length === 0) {
            fetchWhatsAppTemplates();
        }
    }, [composerTab, whatsappTemplates.length, fetchWhatsAppTemplates]);

    // Handle Dropdown Auto-close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isDropdownOpen && !event.target.closest('.activity-dropdown-container')) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDropdownOpen]);

    // Stabilize the dependency to prevent infinite render loops when parent passes inline arrays
    const relatedEntitiesKey = JSON.stringify(relatedEntities);

    const fetchUnifiedTimeline = useCallback(async () => {
        const entitiesToFetch = relatedEntities.length > 0 
            ? relatedEntities 
            : (entityId && entityType ? [{ type: entityType, id: entityId }] : []);
        
        if (entitiesToFetch.length === 0) return;
        
        setLoadingTimeline(true);
        try {
            // Parallel fetching for all related entities
            const results = await Promise.all(
                entitiesToFetch.map(async (entity) => {
                    try {
                        const res = await activitiesAPI.getUnified(entity.type.toLowerCase(), entity.id);
                        if (res && res.success) {
                            return (res.data || []).map(item => ({
                                ...item,
                                sourceEntity: entity.type // Track source for visual labeling
                            }));
                        }
                    } catch (err) {
                        console.error(`Error fetching timeline for ${entity.type} ${entity.id}:`, err);
                    }
                    return [];
                })
            );

            // Merge and Deduplicate by string ID to ensure consistency
            const merged = [];
            const seenIds = new Set();
            
            results.flat().forEach(item => {
                const id = String(item._id || item.id);
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    merged.push(item);
                }
            });

            // Sort by timestamp descending (Professional Consistency)
            const sorted = merged.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.createdAt || a.date || 0).getTime();
                const dateB = new Date(b.timestamp || b.createdAt || b.date || 0).getTime();
                return dateB - dateA;
            });

            setUnifiedTimeline(sorted);

            // Extract unique tags
            const tags = new Set();
            sorted.forEach(item => {
                if (item.tags && Array.isArray(item.tags)) {
                    item.tags.forEach(t => tags.add(t));
                }
            });
            setAllTags(Array.from(tags));
        } catch (error) {
            console.error("Error fetching aggregated timeline:", error);
        } finally {
            setLoadingTimeline(false);
        }
    }, [entityId, entityType, relatedEntitiesKey]);

    useEffect(() => {
        fetchUsers();
        fetchUnifiedTimeline();
    }, [fetchUsers, fetchUnifiedTimeline]);

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

    const handleToggleStar = async (item) => {
        if (item.source !== 'activity') return;
        try {
            const newStarredStatus = !item.isStarred;
            const res = await activitiesAPI.update(item._id, { isStarred: newStarredStatus });
            if (res && res.success) {
                setUnifiedTimeline(prev => prev.map(t =>
                    t._id === item._id ? { ...t, isStarred: newStarredStatus } : t
                ));
                toast.success(newStarredStatus ? 'Activity starred' : 'Activity unstarred');
            }
        } catch (error) {
            console.error("Error toggling star:", error);
            toast.error('Failed to update star status');
        }
    };

    const handleSaveActivity = async () => {
        if (!entityId || !entityType) return;

        setComposerLoading(true);
        try {
            const typeMap = {
                'sms': 'SMS',
                'site_visit': 'Site Visit',
                'meeting': 'Meeting',
                'note': 'Note',
                'call': 'Call',
                'task': 'Task',
                'whatsapp': 'WhatsApp',
                'email': 'Email'
            };

            const activityType = typeMap[composerTab] || 'Note';

            let backendData = {
                type: activityType,
                subject: composerTab === 'task' ? 'Multiple Tasks Created' : `${activityType} Logged`,
                status: (composerTab === 'task' || composerTab === 'site_visit' || composerTab === 'meeting') && composerData.status === 'Not Started' ? 'Pending' : 'Completed',
                priority: composerData.priority || 'Normal',
                entityId: entityId,
                entityType: entityType,
                relatedTo: [{ id: entityId, name: entityData?.name || entityData?.fullName || entityData?.unitNo || 'Unknown', model: entityType }],
                participants: (entityType === 'Contact' || entityType === 'Lead') ? [{ id: entityId, name: entityData?.name || entityData?.fullName || 'Unknown', model: entityType }] : [],
                description: composerContent,
                dueDate: new Date(),
                details: {
                    purpose: composerData.purpose || composerTab,
                    content: composerContent,
                    meetingType: composerData.meetingType,
                    meetingLocation: composerData.meetingLocation,
                    visitConfirmation: composerData.visitConfirmation,
                    visitedProperties: composerData.visitedProperties,
                    completionResult: composerData.completionResult
                }
            };

            // Custom Subject for Site Visit/Meeting
            if (composerTab === 'meeting') {
                backendData.subject = `Meeting: ${composerData.purpose || 'General'} at ${composerData.meetingLocation || composerData.meetingType}`;
            } else if (composerTab === 'site_visit') {
                const props = (composerData.visitedProperties || []).map(p => p.project || 'Property').filter(Boolean).join(', ');
                backendData.subject = `Site Visit: ${props || 'Inventory'}`;
            }

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
                backendData.status = 'Pending';
            }

            // WhatsApp Dispatch
            if (composerTab === 'whatsapp') {
                try {
                    const mobile = entityData?.mobile || entityData?.phone || (entityData?.phones && entityData.phones[0]?.number);
                    if (!mobile) throw new Error("No phone number found.");
                    const waRes = await whatsappService.sendMessage({ mobile, message: composerContent, templateId: selectedTemplateId });
                    if (!waRes.success) throw new Error(waRes.error || "Meta Dispatch Failed");
                } catch (waError) {
                    toast.error(`WhatsApp Failed: ${waError.message}`);
                    setComposerLoading(false);
                    return;
                }
            }

            // SMS Dispatch
            if (composerTab === 'sms') {
                try {
                    const mobile = entityData?.mobile || entityData?.phone || (entityData?.phones && entityData.phones[0]?.number);
                    if (!mobile) throw new Error("No phone number found.");
                    const smsRes = await smsService.sendMessage({ to: mobile, body: composerContent });
                    if (!smsRes.success) throw new Error(smsRes.error || "SMS Gateway Error");
                } catch (smsError) {
                    toast.error(`SMS Failed: ${smsError.message}`);
                    setComposerLoading(false);
                    return;
                }
            }

            const res = await addActivity(backendData);
            if (res) {
                toast.success(`${activityType} saved successfully!`);
                setComposerContent('');
                setComposerData({
                    subject: '', status: 'Completed', priority: 'Normal', purpose: '',
                    meetingType: 'Office', meetingLocation: '', meetingOutcomeStatus: '',
                    visitConfirmation: 'Tentative', visitedProperties: [{ project: '', block: '', property: '', result: '', feedback: '' }],
                    completionResult: ''
                });
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
        if (type.includes('meeting')) return { icon: 'users', color: '#a21caf', bg: '#fdf4ff' };
        if (type.includes('site visit') || type.includes('visit')) return { icon: 'map-marked-alt', color: '#047857', bg: '#ecfdf5' };
        if (type.includes('task')) return { icon: 'tasks', color: '#f59e0b', bg: '#fffbeb' };
        if (type.includes('email')) return { icon: 'envelope', color: '#ef4444', bg: '#fef2f2' };
        if (type.includes('sms')) return { icon: 'comment-alt', color: '#4f46e5', bg: '#f5f3ff' };
        if (type.includes('whatsapp')) return { icon: 'whatsapp', color: '#25d366', bg: '#f0fdf4', brand: true };
        if (type === 'messaging') return { icon: 'comment-dots', color: '#6366f1', bg: '#eef2ff' };

        return { icon: 'clock', color: '#64748b', bg: '#f8fafc' };
    };

    return (
        <div className="unified-activity-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* 1. Activity Composer */}
            {!hideComposer && (
                <div style={{ 
                    borderRadius: '12px', 
                    overflow: 'hidden', 
                    border: '1px solid #eef2f6',
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', background: '#f8fafc', padding: '12px 20px', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }} className="activity-dropdown-container">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Action:</span>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        color: 'var(--premium-blue)',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {(() => {
                                        const tabs = [
                                            { id: 'email', icon: 'envelope', label: 'Email' },
                                            { id: 'whatsapp', icon: 'whatsapp', label: 'WhatsApp', isBrand: true },
                                            { id: 'sms', icon: 'comment-alt', label: 'SMS' },
                                            { id: 'note', icon: 'sticky-note', label: 'Note' },
                                            { id: 'call', icon: 'phone-alt', label: 'Call Log' },
                                            { id: 'task', icon: 'calendar-check', label: 'Task' },
                                            { id: 'meeting', icon: 'users', label: 'Meeting' },
                                            { id: 'site_visit', icon: 'map-marked-alt', label: 'Site Visit' },
                                        ];
                                        const active = tabs.find(t => t.id === composerTab);
                                        return (
                                            <>
                                                <i className={`${active?.isBrand ? 'fab' : 'fas'} fa-${active?.icon}`}></i>
                                                {active?.label}
                                                <i className={`fas fa-chevron-${isDropdownOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7rem', opacity: 0.5 }}></i>
                                            </>
                                        );
                                    })()}
                                </button>

                                {isDropdownOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 8px)',
                                        left: 0,
                                        width: '200px',
                                        background: '#fff',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                        border: '1px solid #e2e8f0',
                                        zIndex: 100,
                                        padding: '8px',
                                        animation: 'fadeIn 0.2s ease-out'
                                    }}>
                                        {[
                                            { id: 'email', icon: 'envelope', label: 'Email' },
                                            { id: 'whatsapp', icon: 'whatsapp', label: 'WhatsApp', isBrand: true },
                                            { id: 'sms', icon: 'comment-alt', label: 'SMS' },
                                            { id: 'note', icon: 'sticky-note', label: 'Note' },
                                            { id: 'call', icon: 'phone-alt', label: 'Call Log' },
                                            { id: 'task', icon: 'calendar-check', label: 'Task' },
                                            { id: 'meeting', icon: 'users', label: 'Meeting' },
                                            { id: 'site_visit', icon: 'map-marked-alt', label: 'Site Visit' },
                                        ].map(tab => (
                                            <div
                                                key={tab.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setComposerTab(tab.id);
                                                    setIsDropdownOpen(false);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 14px',
                                                    border: 'none',
                                                    background: composerTab === tab.id ? '#f5f3ff' : 'transparent',
                                                    borderRadius: '8px',
                                                    color: composerTab === tab.id ? 'var(--premium-blue)' : '#475569',
                                                    fontSize: '0.85rem',
                                                    fontWeight: composerTab === tab.id ? 800 : 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s',
                                                    marginBottom: '2px'
                                                }}
                                                onMouseOver={(e) => {
                                                    if (composerTab !== tab.id) e.currentTarget.style.background = '#f8fafc';
                                                }}
                                                onMouseOut={(e) => {
                                                    if (composerTab !== tab.id) e.currentTarget.style.background = 'transparent';
                                                }}
                                            >
                                                <i className={`${tab.isBrand ? 'fab' : 'fas'} fa-${tab.icon}`} style={{ width: '18px', textAlign: 'center', color: composerTab === tab.id ? 'var(--premium-blue)' : '#94a3b8' }}></i>
                                                <span>{tab.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                                STATUS: {composerData.status?.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div style={{ padding: '20px', overflow: 'visible' }}>
                        {composerTab === 'whatsapp' && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', display: 'block' }}>
                                    Select Meta Template (Optional)
                                </label>
                                <select
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        marginBottom: '10px'
                                    }}
                                    disabled={isTemplatesLoading}
                                >
                                    <option value="">-- {isTemplatesLoading ? 'Loading Templates...' : 'Direct Message (No Template)'} --</option>
                                    {whatsappTemplates.map(t => (
                                        <option key={t.id || t.name} value={t.name}>{t.name} ({t.language})</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {composerTab === 'meeting' && (
                            <div style={{ marginBottom: '16px', animation: 'fadeIn 0.3s ease-out' }}>
                                <MeetingActivitySection 
                                    formData={composerData} 
                                    handleChange={handleComposerChange} 
                                    errors={errors} 
                                    activityMasterFields={activityMasterFields} 
                                />
                            </div>
                        )}

                        {composerTab === 'site_visit' && (
                            <div style={{ marginBottom: '16px', animation: 'fadeIn 0.3s ease-out' }}>
                                <SiteVisitActivitySection 
                                    formData={composerData} 
                                    handleChange={handleComposerChange} 
                                    errors={errors} 
                                    activityMasterFields={activityMasterFields} 
                                    projects={projects}
                                    rowUnits={rowUnits}
                                    fetchUnits={fetchUnits}
                                    updatePropertyRow={updatePropertyRow}
                                    addPropertyRow={addPropertyRow}
                                    removePropertyRow={removePropertyRow}
                                />
                            </div>
                        )}

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
                                                    <i className={`fas fa-bell${task.reminder? '' : '-slash'}`}></i> Remind Me
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
                                    minHeight: (composerTab === 'meeting' || composerTab === 'site_visit') ? '60px' : '100px',
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
            )}

            {/* 2. Timeline Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Activities Timeline</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
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
                            <option value="all">All Users</option>
                            {allUsers.map(u => (
                                <option key={u._id} value={`${u.firstName} ${u.lastName}`}>{u.firstName} {u.lastName}</option>
                            ))}
                        </select>
                        <select
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
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
                            <option value="all">All Tags</option>
                            {allTags.map(tag => (
                                <option key={tag} value={tag}>{tag}</option>
                            ))}
                        </select>
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
                                    const matchesType = timelineFilter === 'all' || (item.type || '').toLowerCase().includes(timelineFilter);
                                    const matchesUser = userFilter === 'all' || item.actor === userFilter;
                                    const matchesTag = tagFilter === 'all' || (item.tags && item.tags.includes(tagFilter));
                                    return matchesType && matchesUser && matchesTag;
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
                                                <div className="timeline-header" style={{ marginBottom: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                                                            {item.title}
                                                            {item.metadata?.details?.recordingUrl && (
                                                                <i className="fas fa-microphone" style={{ marginLeft: '8px', color: '#10b981', fontSize: '0.75rem' }} title="Recording available"></i>
                                                            )}
                                                        </div>
                                                        {item.source === 'activity' && (
                                                            <button
                                                                onClick={() => handleToggleStar(item)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: item.isStarred ? '#f59e0b' : '#cbd5e1', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                                            >
                                                                <i className={`${item.isStarred ? 'fas' : 'far'} fa-star`}></i>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="timeline-date">
                                                        {new Date(item.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                {item.type?.toLowerCase() === 'whatsapp' ? (
                                                    <div className="whatsapp-chat-container" style={{ marginTop: '12px' }}>
                                                        <div className={`wa-bubble ${item.details?.direction?.toLowerCase() === 'incoming' ? 'wa-incoming' : 'wa-outgoing'}`}>
                                                            <div className="wa-bubble-content">{item.description}</div>
                                                            <div className="wa-bubble-time">
                                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                {item.details?.direction?.toLowerCase() === 'outgoing' && (
                                                                    <i className="fas fa-check-double wa-check" style={{ marginLeft: '4px' }}></i>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : item.description && (
                                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '6px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                        {item.description}
                                                    </div>
                                                )}

                                                {/* Call Recording Integration */}
                                                {(item.type === 'call' && item.metadata?.details?.recordingUrl) && (
                                                    <RecordingPlayer 
                                                        url={item.metadata.details.recordingUrl} 
                                                        duration={item.metadata.details.duration} 
                                                    />
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                                                            <i className="fas fa-user-circle" style={{ marginRight: '4px' }}></i> {item.actor || 'System'}
                                                        </div>
                                                        {item.sourceEntity && item.sourceEntity !== entityType && (
                                                            <span style={{ 
                                                                fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', 
                                                                borderRadius: '4px', background: '#f1f5f9', color: '#64748b',
                                                                textTransform: 'uppercase', letterSpacing: '0.02em', border: '1px solid #e2e8f0'
                                                            }}>
                                                                {item.sourceEntity}
                                                            </span>
                                                        )}
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
