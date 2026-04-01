import { useState, useEffect, useCallback } from 'react';
import apiWrapper, { api } from '../utils/api';

import { useSequences } from '../context/SequenceContext';
import { useTriggers } from '../context/TriggersContext';
import { useStageEngine } from '../hooks/useStageEngine';
import { triggerRequiredForm } from '../utils/FormTriggerService';

export const useActivityForm = (isOpen, onClose, onSave, initialData) => {

    const { updateEnrollmentStatus } = useSequences();
    const { fireEvent } = useTriggers();
    const { triggerStageUpdate, extractOutcome } = useStageEngine();
    
    const [stageToast, setStageToast] = useState(null);
    const [projects, setProjects] = useState([]);
    const [rowUnits, setRowUnits] = useState({});
    const [errors, setErrors] = useState({});
    
    const showStageToast = (msg) => {
        setStageToast(msg);
        setTimeout(() => setStageToast(null), 4000);
    };

    const [formData, setFormData] = useState({
        activityType: 'Call',
        subject: '',
        relatedTo: [],
        participants: [],
        dueDate: '',
        dueTime: '',
        priority: 'Normal',
        status: 'Not Started',
        description: '',
        tasks: [{ id: Date.now(), subject: '', reminder: false, reminderTime: '' }],
        purpose: '',
        duration: '',
        callOutcome: '',
        meetingType: 'Office',
        meetingLocation: '',
        clientFeedback: '',
        visitConfirmation: 'Tentative',
        reminder: false,
        reminderTime: '',
        direction: 'Outgoing Call',
        completionResult: '',
        completionDate: '',
        completionTime: '',
        completionDuration: '',
        meetingOutcomeStatus: '',
        visitedProperties: [{ project: '', block: '', property: '', result: '', feedback: '' }],
        selectedPropertyNo: '',
        cancellationReason: '',
        mailStatus: '',
        mailFollowUp: false
    });

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

    // Initial Data Sync
    useEffect(() => {
        if (isOpen) {
            let relations = [];
            if (initialData?.relatedTo && Array.isArray(initialData.relatedTo)) {
                relations = [...initialData.relatedTo];
            }

            const source = initialData?.inventory || initialData?.deal;
            if (source) {
                const extractContacts = (src) => {
                    const list = [];
                    if (src.owners && Array.isArray(src.owners)) {
                        src.owners.forEach(o => {
                            if (o.name) list.push({ id: o._id || o.id, name: o.name, model: 'Contact', role: 'Owner' });
                        });
                    }
                    if (src.associates && Array.isArray(src.associates)) {
                        src.associates.forEach(a => {
                            const c = a.contact || a;
                            if (c.name) list.push({ id: c._id || c.id, name: c.name, model: 'Contact', role: 'Associate' });
                        });
                    }
                    if (list.length === 0) {
                        if (src.ownerName) list.push({ id: src.ownerId || `owner-${Date.now()}`, name: src.ownerName, model: 'Contact', role: 'Owner' });
                        if (src.owner && typeof src.owner === 'object' && src.owner.name) list.push({ id: src.owner._id || src.owner.id || `owner-${Date.now()}`, name: src.owner.name, model: 'Contact', role: 'Owner' });
                        if (src.associatedContact) list.push({ id: src.associatedContactId || `assoc-${Date.now()}`, name: typeof src.associatedContact === 'string' ? src.associatedContact : src.associatedContact.name, model: 'Contact', role: 'Associate' });
                    }
                    return list;
                };

                const extracted = extractContacts(source);
                if (extracted.length > 0) {
                    const existingNames = relations.map(r => typeof r.name === 'string' ? r.name.toLowerCase() : '');
                    const uniqueNew = extracted.filter(o => o.name && !existingNames.includes(o.name.toLowerCase()));
                    const filteredRelations = relations.filter(r => r.model !== 'Inventory' && r.type !== 'Inventory');
                    relations = [...uniqueNew, ...filteredRelations];
                }
            }

            const invSource = initialData?.inventory || initialData?.deal?.inventoryId;
            const initialType = initialData?.activityType || 'Call';

            setFormData(prev => ({
                ...prev,
                activityType: initialType,
                subject: '',
                relatedTo: relations,
                participants: [],
                dueDate: new Date().toISOString().split('T')[0],
                dueTime: '10:00',
                priority: 'Normal',
                description: '',
                status: initialData?.status || 'Not Started',
                purpose: initialData?.purpose || '',
                duration: '15',
                completionDate: new Date().toISOString().split('T')[0],
                completionTime: new Date().toTimeString().slice(0, 5),
                visitedProperties: (initialType === 'Site Visit' && invSource)
                    ? [{
                        project: invSource.projectName || invSource.project || '',
                        block: invSource.block || '',
                        property: invSource.unitNo || invSource.unitNumber || '',
                        result: '',
                        feedback: ''
                    }]
                    : [{ project: '', block: '', property: '', result: '', feedback: '' }]
            }));
            setErrors({});
            fetchProjects();
        }
    }, [isOpen, initialData, fetchProjects]);

    // Subject Auto-generation
    useEffect(() => {
        if (!isOpen) return;

        let newSubject = '';
        const related = formData.relatedTo.length > 0
            ? formData.relatedTo.map(r => r.name).join(', ')
            : 'Client';

        let dateStr = '';
        if (formData.dueDate) {
            const [year, month, day] = formData.dueDate.split('-');
            dateStr = `${day}/${month}/${year}`;
        }
        const timeStr = formData.dueTime ? ` at ${formData.dueTime}` : '';

        if (formData.activityType === 'Call') {
            const purpose = formData.purpose || 'Call';
            newSubject = `${purpose} with ${related} on ${dateStr}${timeStr}`;
        } else if (formData.activityType === 'Site Visit') {
            const props = formData.visitedProperties.map(p => p.project || 'Property').join(', ');
            const vType = formData.purpose || 'Visit';
            newSubject = `${vType} at ${props} with ${related} on ${dateStr}${timeStr}`;
        }

        if (newSubject) {
            setFormData(prev => ({ ...prev, subject: newSubject }));
        }
    }, [
        isOpen,
        formData.activityType,
        formData.purpose,
        formData.relatedTo,
        formData.dueDate,
        formData.dueTime,
        formData.visitedProperties
    ]);

    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    }, [errors]);

    const updatePropertyRow = useCallback((index, updates) => {
        setFormData(prev => {
            const newProps = [...prev.visitedProperties];
            newProps[index] = { ...newProps[index], ...updates };
            return { ...prev, visitedProperties: newProps };
        });
    }, []);

    const addPropertyRow = useCallback(() => {
        setFormData(prev => ({
            ...prev,
            visitedProperties: [...prev.visitedProperties, { project: '', block: '', property: '', result: '', feedback: '' }]
        }));
    }, []);

    const removePropertyRow = useCallback((index) => {
        if (formData.visitedProperties.length <= 1) return;
        setFormData(prev => ({
            ...prev,
            visitedProperties: prev.visitedProperties.filter((_, i) => i !== index)
        }));
    }, [formData.visitedProperties.length]);

    const validate = () => {
        const newErrors = {};
        if (!formData.subject) newErrors.subject = 'Subject is required';
        if (!formData.dueDate) newErrors.dueDate = 'Date is required';

        if (formData.activityType === 'Meeting' && !formData.meetingLocation) {
            newErrors.meetingLocation = formData.meetingType === 'Virtual' ? 'Meeting Link is required' : 'Location is required';
        }
        
        if (formData.status === 'Completed') {
            if (formData.activityType === 'Call') {
                if (!formData.callOutcome) newErrors.callOutcome = 'Outcome is required';
                if (formData.callOutcome === 'Connected' && !formData.completionResult) {
                    newErrors.completionResult = 'Result is required';
                }
            } else if (formData.activityType === 'Meeting') {
                if (!formData.meetingOutcomeStatus) newErrors.meetingOutcomeStatus = 'Status is required';
                if (!formData.completionResult) newErrors.completionResult = 'Result is required';
            } else if (formData.activityType === 'Email') {
                if (!formData.mailStatus) newErrors.mailStatus = 'Status is required';
            } else if (formData.activityType === 'Site Visit') {
                if (!formData.meetingOutcomeStatus) {
                    newErrors.meetingOutcomeStatus = 'Status is required';
                } else if (formData.meetingOutcomeStatus === 'Conducted') {
                    formData.visitedProperties.forEach((item, index) => {
                        if (!item.result) newErrors[`prop_${index}_result`] = 'Result is required';
                    });
                } else if (formData.meetingOutcomeStatus === 'Rescheduled' || formData.meetingOutcomeStatus === 'Postponed') {
                    if (!formData.completionDate) newErrors.completionDate = 'Date is required';
                    if (!formData.completionTime) newErrors.completionTime = 'Time is required';
                } else if (formData.meetingOutcomeStatus === 'Cancelled' || formData.meetingOutcomeStatus === 'Did Not Visit') {
                    if (!formData.cancellationReason) newErrors.cancellationReason = 'Reason is required';
                }
            }
        }

        if (formData.activityType === 'Site Visit') {
            if (!formData.purpose) newErrors.purpose = 'Visit Type is required';
            formData.visitedProperties.forEach((item, index) => {
                if (!item.project) newErrors[`prop_${index}_project`] = 'Project is required';
            });
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (validate()) {
            const backendData = {
                type: formData.activityType,
                subject: formData.subject,
                dueDate: formData.dueDate,
                dueTime: formData.dueTime,
                priority: formData.priority,
                status: formData.status === 'Not Started' ? 'Pending' : formData.status,
                description: formData.description,
                relatedTo: formData.relatedTo.map(r => ({
                    id: r.id || r._id,
                    name: r.name,
                    model: r.model || 'Contact'
                })),
                participants: formData.participants,
                tasks: (formData.tasks || []).map(t => ({
                    subject: t.subject,
                    reminder: t.reminder,
                    reminderTime: t.reminderTime
                })),
                details: {
                    purpose: formData.purpose,
                    duration: formData.duration,
                    callOutcome: formData.callOutcome,
                    meetingType: formData.meetingType,
                    meetingLocation: formData.meetingLocation,
                    clientFeedback: formData.clientFeedback,
                    visitConfirmation: formData.visitConfirmation,
                    direction: formData.direction,
                    completionResult: formData.completionResult,
                    meetingOutcomeStatus: formData.meetingOutcomeStatus,
                    visitedProperties: formData.visitedProperties,
                    cancellationReason: formData.cancellationReason,
                    mailStatus: formData.mailStatus
                }
            };

            if (formData.relatedTo.length > 0) {
                backendData.entityId = formData.relatedTo[0].id || formData.relatedTo[0]._id;
                backendData.entityType = formData.relatedTo[0].model || 'Contact';
            } else {
                backendData.entityType = 'Global';
                backendData.entityId = null;
            }

            if (onSave) onSave(backendData);
            fireEvent('activity_created', backendData, { entityType: 'activities' });

            if (formData.relatedTo && formData.relatedTo.length > 0) {
                formData.relatedTo.forEach(related => {
                    updateEnrollmentStatus(related.id || related._id, 'paused');
                });
            }

            if (formData.status === 'Completed') {
                fireEvent('activity_completed', backendData, { entityType: 'activities' });
                
                const entityId = backendData.entityId;
                const entityType = (backendData.entityType || '').toLowerCase();
                if (entityId && (entityType === 'lead' || entityType === 'leads')) {
                    const outcome = extractOutcome(backendData.type, backendData.details || {});
                    const purpose = backendData.details?.purpose || '';
                    try {
                        const result = await triggerStageUpdate(entityId, backendData.type, purpose, outcome);
                        if (result.stage) {
                            showStageToast(`✅ Stage auto-updated → ${result.stage}`);
                            if (result.requiredForm && result.requiredForm !== 'None') {
                                setTimeout(() => {
                                    triggerRequiredForm(result.requiredForm, entityId, {
                                        type: entityType,
                                        leadId: entityId,
                                        activityType: backendData.type
                                    });
                                }, 500);
                            }
                        }
                    } catch (err) {
                        console.warn('[StageEngine] update after activity save failed:', err);
                    }
                }
            }

            onClose();
        }
    };

    return {
        formData,
        setFormData,
        errors,
        setErrors,
        projects,
        rowUnits,
        stageToast,
        handleChange,
        fetchUnits,
        updatePropertyRow,
        addPropertyRow,
        removePropertyRow,
        handleSubmit,
        validate
    };
};
