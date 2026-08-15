import React, { useState, useEffect } from 'react';
import './SequenceBuilder.css';
import api from '../../utils/api';

const SequenceBuilder = ({ sequenceId, onBack, onNavigate }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const [sequence, setSequence] = useState({
        name: 'New Drip Sequence',
        targetAudience: { module: 'leads', conditions: [] },
        exitCriteria: { stopOnReply: true, stopOnStage: ['Closed Won', 'Lost'] },
        businessHours: { enabled: true, start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', skipWeekends: true },
        steps: []
    });

    const [showStepModal, setShowStepModal] = useState(false);
    const [editingStepIndex, setEditingStepIndex] = useState(null);
    const [stepForm, setStepForm] = useState({
        delayMs: 86400000, // 1 day
        actionType: 'send_whatsapp',
        templateId: '',
        content: ''
    });

    useEffect(() => {
        if (sequenceId && sequenceId !== 'new') {
            fetchSequence();
        }
    }, [sequenceId]);

    const fetchSequence = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/automations/sequences/${sequenceId}`);
            setSequence({
                ...data,
                targetAudience: data.targetAudience || { module: 'leads', conditions: [] },
                exitCriteria: data.exitCriteria || { stopOnReply: true, stopOnStage: [] },
                businessHours: data.businessHours || { enabled: false, start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', skipWeekends: true },
                steps: data.steps || []
            });
        } catch (error) {
            console.error('Error fetching sequence:', error);
            alert('Failed to load sequence');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (sequenceId && sequenceId !== 'new') {
                await api.put(`/automations/sequences/${sequenceId}`, sequence);
            } else {
                await api.post('/automations/sequences', sequence);
            }
            alert('Sequence saved successfully!');
            onBack();
        } catch (error) {
            console.error('Error saving sequence:', error);
            alert('Failed to save sequence');
        } finally {
            setSaving(false);
        }
    };

    const openAddStep = () => {
        setEditingStepIndex(null);
        setStepForm({ delayMs: 86400000, actionType: 'send_whatsapp', templateId: '', content: '' });
        setShowStepModal(true);
    };

    const openEditStep = (index) => {
        setEditingStepIndex(index);
        setStepForm(sequence.steps[index]);
        setShowStepModal(true);
    };

    const saveStep = () => {
        const newSteps = [...sequence.steps];
        if (editingStepIndex !== null) {
            newSteps[editingStepIndex] = stepForm;
        } else {
            newSteps.push(stepForm);
        }
        setSequence({ ...sequence, steps: newSteps });
        setShowStepModal(false);
    };

    const removeStep = (index) => {
        const newSteps = [...sequence.steps];
        newSteps.splice(index, 1);
        setSequence({ ...sequence, steps: newSteps });
    };

    // Converters for UI
    const msToDays = (ms) => Math.floor(ms / (1000 * 60 * 60 * 24));
    const handleDelayChange = (days) => {
        setStepForm({ ...stepForm, delayMs: days * 24 * 60 * 60 * 1000 });
    };

    if (loading) return <div className="seq-loading">Loading Builder...</div>;

    return (
        <div className="sequence-builder-layout">
            {/* TOP HEADER */}
            <header className="seq-header">
                <div className="seq-header-left">
                    <button className="seq-back-btn" onClick={onBack}>&larr; Back</button>
                    <input 
                        type="text" 
                        className="seq-title-input" 
                        value={sequence.name}
                        onChange={e => setSequence({...sequence, name: e.target.value})}
                        placeholder="Sequence Name"
                    />
                </div>
                <div className="seq-header-right">
                    <button className="seq-save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Sequence'}
                    </button>
                </div>
            </header>

            <div className="seq-body">
                {/* SETTINGS PANEL (LEFT) */}
                <div className="seq-settings-panel">
                    <h3>Enrollment Triggers</h3>
                    <div className="seq-setting-group">
                        <label>Target Module</label>
                        <select 
                            value={sequence.targetAudience.module}
                            onChange={e => setSequence({...sequence, targetAudience: {...sequence.targetAudience, module: e.target.value}})}
                        >
                            <option value="leads">Leads</option>
                            <option value="deals">Deals</option>
                        </select>
                    </div>

                    <h3>Exit Criteria</h3>
                    <div className="seq-setting-group checkbox-group">
                        <label>
                            <input 
                                type="checkbox" 
                                checked={sequence.exitCriteria.stopOnReply}
                                onChange={e => setSequence({...sequence, exitCriteria: {...sequence.exitCriteria, stopOnReply: e.target.checked}})}
                            />
                            Stop on Reply (WhatsApp/Email)
                        </label>
                    </div>

                    <h3>Business Hours (Protection)</h3>
                    <div className="seq-setting-group checkbox-group">
                        <label>
                            <input 
                                type="checkbox" 
                                checked={sequence.businessHours.enabled}
                                onChange={e => setSequence({...sequence, businessHours: {...sequence.businessHours, enabled: e.target.checked}})}
                            />
                            Only send during business hours
                        </label>
                    </div>
                    {sequence.businessHours.enabled && (
                        <div className="seq-setting-sub">
                            <div>
                                <label>Start</label>
                                <input type="time" value={sequence.businessHours.start} onChange={e => setSequence({...sequence, businessHours: {...sequence.businessHours, start: e.target.value}})} />
                            </div>
                            <div>
                                <label>End</label>
                                <input type="time" value={sequence.businessHours.end} onChange={e => setSequence({...sequence, businessHours: {...sequence.businessHours, end: e.target.value}})} />
                            </div>
                        </div>
                    )}
                </div>

                {/* TIMELINE PANEL (RIGHT) */}
                <div className="seq-timeline-panel">
                    <div className="seq-timeline-start">
                        <div className="seq-start-icon">🎯</div>
                        <div className="seq-start-text">Lead Enrolled</div>
                    </div>

                    {sequence.steps.map((step, index) => (
                        <div key={index} className="seq-timeline-step-wrapper">
                            <div className="seq-timeline-line"></div>
                            <div className="seq-timeline-delay">
                                Wait {msToDays(step.delayMs)} days
                            </div>
                            <div className="seq-timeline-line"></div>
                            
                            <div className="seq-step-card">
                                <div className="seq-step-icon">
                                    {step.actionType === 'send_whatsapp' ? '💬' : step.actionType === 'send_email' ? '📧' : '📋'}
                                </div>
                                <div className="seq-step-content">
                                    <h4>{step.actionType.replace('_', ' ').toUpperCase()}</h4>
                                    <p>{step.templateId ? `Template: ${step.templateId}` : step.content}</p>
                                </div>
                                <div className="seq-step-actions">
                                    <button onClick={() => openEditStep(index)}>✏️</button>
                                    <button onClick={() => removeStep(index)}>🗑️</button>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="seq-timeline-line"></div>
                    <button className="seq-add-step-btn" onClick={openAddStep}>
                        + Add Step
                    </button>
                    <div className="seq-timeline-line"></div>
                    <div className="seq-timeline-end">
                        <div className="seq-end-icon">🏁</div>
                        <div className="seq-end-text">Sequence End</div>
                    </div>
                </div>
            </div>

            {/* STEP CONFIGURATOR MODAL */}
            {showStepModal && (
                <div className="seq-modal-overlay">
                    <div className="seq-modal">
                        <h2>{editingStepIndex !== null ? 'Edit Step' : 'Add Step'}</h2>
                        
                        <div className="seq-modal-body">
                            <div className="seq-form-group">
                                <label>Wait Delay (Days)</label>
                                <input 
                                    type="number" 
                                    value={msToDays(stepForm.delayMs)}
                                    onChange={(e) => handleDelayChange(parseInt(e.target.value) || 0)}
                                    min="0"
                                />
                            </div>
                            
                            <div className="seq-form-group">
                                <label>Action Type</label>
                                <select 
                                    value={stepForm.actionType}
                                    onChange={(e) => setStepForm({...stepForm, actionType: e.target.value})}
                                >
                                    <option value="send_whatsapp">Send WhatsApp</option>
                                    <option value="send_email">Send Email</option>
                                    <option value="create_task">Create Task</option>
                                </select>
                            </div>

                            <div className="seq-form-group">
                                <label>Content / Template ID</label>
                                <textarea 
                                    value={stepForm.content}
                                    onChange={(e) => setStepForm({...stepForm, content: e.target.value})}
                                    placeholder="Type message or enter template ID..."
                                    rows={4}
                                />
                            </div>
                        </div>

                        <div className="seq-modal-footer">
                            <button className="seq-btn-secondary" onClick={() => setShowStepModal(false)}>Cancel</button>
                            <button className="seq-btn-primary" onClick={saveStep}>Save Step</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SequenceBuilder;
