import React, { useState, useEffect } from 'react';
import { useSequences } from '../context/SequenceContext';
import { useTriggers } from '../context/TriggersContext';
import { useAutomatedActions } from '../context/AutomatedActionsContext';
import { useTemplates } from '../context/TemplateContext';

const CreateSequenceModal = ({ isOpen, onClose, editData }) => {
    const { addSequence, updateSequence } = useSequences();
    const { triggers = [] } = useTriggers();
    const { actions: automatedActions = [] } = useAutomatedActions();
    const { templates = [] } = useTemplates();
    
    const [activeTab, setActiveTab] = useState('basic');
    
    const defaultData = {
        name: '',
        module: 'deals',
        purpose: 'Deal Marketing Broadcast & Follow-up',
        description: '',
        linkedTriggers: [],
        steps: [
            {
                id: Date.now(),
                stepNumber: 1,
                delay: { amount: 0, unit: 'minutes' },
                time: '10:00',
                executionWindow: { startTime: '10:00', endTime: '19:00' },
                action: {
                    type: 'fire_automated_action',
                    automatedActionId: '',
                    channel: 'whatsapp',
                    templateId: '',
                    instruction: ''
                }
            }
        ],
        exitConditions: {
            // Deals
            onStageNotOpen: true,
            onPriceChanged: false,
            onInactive: true,
            // Leads
            onDealCreated: true,
            onLost: true,
            onManualActivity: true,
            // Activities
            onCompleted: true,
            onCancelled: true,
            // Inventory
            onSold: true,
            onBooked: true
        }
    };

    const [formData, setFormData] = useState(defaultData);

    useEffect(() => {
        if (editData) {
            setFormData({
                ...defaultData,
                ...editData,
                module: editData.module || editData.targetAudience?.module || 'deals',
                linkedTriggers: editData.linkedTriggers || [],
                steps: (editData.steps && editData.steps.length > 0) ? editData.steps.map((s, idx) => ({
                    id: s.id || s._id || Date.now() + idx,
                    stepNumber: s.stepNumber || (idx + 1),
                    delay: s.delay || { amount: s.day ?? 0, unit: 'days' },
                    time: s.time || '10:00',
                    executionWindow: s.executionWindow || { startTime: '10:00', endTime: '19:00' },
                    action: s.action || {
                        type: s.type === 'Call' ? 'create_task' : (s.type === 'WhatsApp' || s.type === 'Email' ? 'send_communication' : 'fire_automated_action'),
                        automatedActionId: s.automatedActionId || '',
                        channel: (s.type || 'whatsapp').toLowerCase(),
                        templateId: s.templateId || '',
                        instruction: s.instruction || ''
                    }
                })) : defaultData.steps,
                exitConditions: {
                    ...defaultData.exitConditions,
                    ...(editData.exitConditions || editData.exitCriteria?.exitConditions || {})
                }
            });
        } else {
            setFormData(defaultData);
        }
    }, [editData, isOpen]);

    if (!isOpen) return null;

    // Filter triggers belonging to the currently selected module
    const moduleTriggers = triggers.filter(t => (t.module || '').toLowerCase() === (formData.module || '').toLowerCase());

    // Filter automated actions belonging to the currently selected module or generic
    const moduleAutomatedActions = automatedActions.filter(a => {
        const actionMod = (a.targetModule || '').toLowerCase();
        const curMod = (formData.module || '').toLowerCase();
        return actionMod === curMod || actionMod === 'all' || actionMod === 'other';
    });

    const handleAddStep = () => {
        const nextStepNumber = formData.steps.length + 1;
        setFormData({
            ...formData,
            steps: [
                ...formData.steps,
                {
                    id: Date.now(),
                    stepNumber: nextStepNumber,
                    delay: { amount: 1, unit: 'days' },
                    time: '10:00',
                    executionWindow: { startTime: '10:00', endTime: '19:00' },
                    action: {
                        type: 'fire_automated_action',
                        automatedActionId: '',
                        channel: 'whatsapp',
                        templateId: '',
                        instruction: ''
                    }
                }
            ]
        });
    };

    const handleRemoveStep = (index) => {
        const newSteps = formData.steps.filter((_, i) => i !== index).map((s, idx) => ({
            ...s,
            stepNumber: idx + 1
        }));
        setFormData({ ...formData, steps: newSteps });
    };

    const updateStep = (index, field, value) => {
        const newSteps = [...formData.steps];
        newSteps[index] = { ...newSteps[index], [field]: value };
        setFormData({ ...formData, steps: newSteps });
    };

    const updateStepAction = (index, field, value) => {
        const newSteps = [...formData.steps];
        newSteps[index] = {
            ...newSteps[index],
            action: { ...newSteps[index].action, [field]: value }
        };
        setFormData({ ...formData, steps: newSteps });
    };

    const toggleTriggerLink = (triggerId) => {
        const currentLinks = formData.linkedTriggers || [];
        const exists = currentLinks.includes(triggerId);
        const newLinks = exists
            ? currentLinks.filter(id => id !== triggerId)
            : [...currentLinks, triggerId];
        setFormData({ ...formData, linkedTriggers: newLinks });
    };

    const handleSave = () => {
        if (!formData.name || formData.name.trim() === '') {
            alert('Sequence Name is required');
            return;
        }

        const payload = {
            ...formData,
            targetAudience: {
                module: formData.module,
                conditions: { operator: 'AND', rules: [] }
            },
            exitCriteria: {
                exitConditions: formData.exitConditions,
                conditions: { operator: 'OR', rules: [] }
            }
        };

        const seqId = editData && (editData.id || editData._id);
        if (seqId) {
            updateSequence(seqId, payload);
        } else {
            addSequence(payload);
        }
        onClose();
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', width: '850px', borderRadius: '16px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>
                            {editData && (editData.id || editData._id) ? 'Edit Automation Sequence' : 'Create Automation Sequence'}
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                            Architect multi-step time-delayed outreach and business logic across channels.
                        </p>
                    </div>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }} onClick={onClose}></i>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                    {[
                        { id: 'basic', label: '1. Basic Setup', icon: 'fa-info-circle' },
                        { id: 'trigger', label: `2. Module Triggers (${moduleTriggers.length})`, icon: 'fa-bolt' },
                        { id: 'steps', label: `3. Steps & Intervals (${formData.steps.length})`, icon: 'fa-layer-group' },
                        { id: 'exit', label: '4. Exit Criteria', icon: 'fa-sign-out-alt' }
                    ].map(tab => (
                        <div
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '14px 20px',
                                cursor: 'pointer',
                                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                                color: activeTab === tab.id ? '#2563eb' : '#64748b',
                                fontWeight: activeTab === tab.id ? '700' : '600',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: activeTab === tab.id ? '#fff' : 'transparent'
                            }}
                        >
                            <i className={`fas ${tab.icon}`}></i>
                            {tab.label}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {/* TAB 1: BASIC SETUP */}
                    {activeTab === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                    Sequence Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Deal Broadcast & Follow-up Drip"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                        Applicable Module
                                    </label>
                                    <select
                                        value={formData.module}
                                        onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                                    >
                                        <option value="deals">Deals (Deal Intake & Marketing Broadcast)</option>
                                        <option value="leads">Leads (Buyer / Inbound Inquiries)</option>
                                        <option value="activities">Activities (Tasks & Follow-ups)</option>
                                        <option value="inventory">Inventory (Properties & Units)</option>
                                        <option value="contacts">Contacts (Brokers & Investors)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                        Purpose / Campaign Type
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.purpose}
                                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                                        placeholder="e.g. Deal Omnichannel Broadcast"
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                    Description & Strategy
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Describe the cadence, audience criteria, and overall objective of this automated sequence..."
                                    rows="3"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }}
                                />
                            </div>

                            <div style={{ background: '#eff6ff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', gap: '12px' }}>
                                <i className="fas fa-lightbulb" style={{ color: '#2563eb', fontSize: '1.2rem', marginTop: '2px' }}></i>
                                <div>
                                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a8a' }}>Senior Enterprise Architecture:</span>
                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#1e40af', lineHeight: '1.4' }}>
                                        Triggers detect events (e.g. <code>deal_created</code> or <code>deal_updated</code> with <code>price &gt; 0</code> and <code>stage == 'Open'</code>) and invoke this sequence. Steps in this sequence execute automated actions or communications with precision intervals.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: UNIFIED TRIGGERS (NO DUPLICATE TRIGGERS) */}
                    {activeTab === 'trigger' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                                        Existing Triggers for Module: <span style={{ color: '#2563eb', textTransform: 'capitalize' }}>{formData.module}</span>
                                    </h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                        Triggers are defined in the central Triggers system. Select which triggers initiate this sequence.
                                    </p>
                                </div>
                            </div>

                            {moduleTriggers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '36px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                    <i className="fas fa-bolt" style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '12px' }}></i>
                                    <h5 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#334155' }}>
                                        No Triggers Created Yet for {formData.module.toUpperCase()}
                                    </h5>
                                    <p style={{ margin: '6px auto 16px', fontSize: '12px', color: '#64748b', maxWidth: '450px' }}>
                                        To enroll records automatically, create a trigger for {formData.module} (e.g. Deal Created / Updated with price &gt; 0) and choose the action "Start Sequence".
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {moduleTriggers.map((t) => {
                                        const isLinked = (formData.linkedTriggers || []).includes(t._id || t.id);
                                        const startsThisSequence = (t.actions || []).some(a => a.type === 'start_sequence' && (a.sequenceId === (editData?._id || editData?.id)));
                                        
                                        return (
                                            <div
                                                key={t._id || t.id}
                                                onClick={() => toggleTriggerLink(t._id || t.id)}
                                                style={{
                                                    padding: '14px 16px',
                                                    border: isLinked || startsThisSequence ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                                    background: isLinked || startsThisSequence ? '#eff6ff' : '#fff',
                                                    borderRadius: '10px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isLinked || startsThisSequence}
                                                        onChange={() => {}} // handled by parent div click
                                                        style={{ accentColor: '#2563eb', width: '16px', height: '16px' }}
                                                    />
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>{t.name}</span>
                                                            <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                                                                {t.event}
                                                            </span>
                                                            {t.isActive ? (
                                                                <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>ACTIVE</span>
                                                            ) : (
                                                                <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px' }}>PAUSED</span>
                                                            )}
                                                        </div>
                                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                                                            Priority: {t.priority || 5} | Actions: {(t.actions || []).map(a => a.type.replace('_', ' ')).join(', ') || 'None'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {startsThisSequence && (
                                                        <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>
                                                            <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i>
                                                            Action Configured
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: STEPS & INTERVALS */}
                    {activeTab === 'steps' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                                        Sequence Cadence & Step Actions
                                    </h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                        Configure timing intervals (minutes, hourly, daily, weekly, monthly) and exact automated actions.
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {formData.steps.map((step, index) => (
                                    <div
                                        key={step.id || index}
                                        style={{
                                            background: '#f8fafc',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '12px',
                                            padding: '16px',
                                            position: 'relative'
                                        }}
                                    >
                                        {/* Step header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: '800', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {index + 1}
                                                </span>
                                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                    Step {index + 1}
                                                </span>
                                            </div>
                                            {formData.steps.length > 1 && (
                                                <button
                                                    onClick={() => handleRemoveStep(index)}
                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                                                >
                                                    <i className="fas fa-trash-alt" style={{ marginRight: '4px' }}></i> Remove
                                                </button>
                                            )}
                                        </div>

                                        {/* Timing and Window Row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 1fr', gap: '12px', marginBottom: '14px' }}>
                                            <div>
                                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Delay Amount</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={step.delay?.amount ?? 0}
                                                    onChange={(e) => updateStep(index, 'delay', { ...step.delay, amount: Number(e.target.value) })}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Interval Unit</label>
                                                <select
                                                    value={step.delay?.unit || 'days'}
                                                    onChange={(e) => updateStep(index, 'delay', { ...step.delay, unit: e.target.value })}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                                                >
                                                    <option value="minutes">Minutes</option>
                                                    <option value="hours">Hourly (Hours)</option>
                                                    <option value="days">Daily (Days)</option>
                                                    <option value="weeks">Weekly (Weeks)</option>
                                                    <option value="months">Monthly (Months)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Dispatch Window (Start - End Time)</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        type="time"
                                                        value={step.executionWindow?.startTime || '10:00'}
                                                        onChange={(e) => updateStep(index, 'executionWindow', { ...step.executionWindow, startTime: e.target.value })}
                                                        style={{ flex: 1, padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                                                    />
                                                    <span style={{ fontSize: '11px', color: '#64748b' }}>to</span>
                                                    <input
                                                        type="time"
                                                        value={step.executionWindow?.endTime || '19:00'}
                                                        onChange={(e) => updateStep(index, 'executionWindow', { ...step.executionWindow, endTime: e.target.value })}
                                                        style={{ flex: 1, padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Type & Parameters Row (Parity with Trigger Actions) */}
                                        <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'center' }}>
                                                <div>
                                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Step Action Type</label>
                                                    <select
                                                        value={step.action?.type || 'fire_automated_action'}
                                                        onChange={(e) => updateStepAction(index, 'type', e.target.value)}
                                                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                                    >
                                                        <option value="fire_automated_action">Execute Automated Action</option>
                                                        <option value="send_communication">Send Direct Communication</option>
                                                        <option value="create_task">Create Task / Follow-up</option>
                                                        <option value="update_field">Update Entity Field</option>
                                                    </select>
                                                </div>

                                                {/* Conditional Config based on Action Type */}
                                                <div>
                                                    {step.action?.type === 'fire_automated_action' && (
                                                        <div>
                                                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                                                                Select Automated Action
                                                            </label>
                                                            <select
                                                                value={step.action?.automatedActionId || ''}
                                                                onChange={(e) => updateStepAction(index, 'automatedActionId', e.target.value)}
                                                                style={{ width: '100%', padding: '8px', border: '1px solid #2563eb', borderRadius: '6px', fontSize: '12px' }}
                                                            >
                                                                <option value="">-- Choose Automated Action --</option>
                                                                {moduleAutomatedActions.map(a => (
                                                                    <option key={a._id || a.id} value={a._id || a.id}>
                                                                        {a.name} ({a.actionType})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {step.action?.type === 'send_communication' && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                                                            <div>
                                                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Channel</label>
                                                                <select
                                                                    value={step.action?.channel || 'whatsapp'}
                                                                    onChange={(e) => updateStepAction(index, 'channel', e.target.value)}
                                                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                                                >
                                                                    <option value="whatsapp">WhatsApp</option>
                                                                    <option value="email">Email</option>
                                                                    <option value="sms">SMS</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Template</label>
                                                                <select
                                                                    value={step.action?.templateId || ''}
                                                                    onChange={(e) => updateStepAction(index, 'templateId', e.target.value)}
                                                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                                                >
                                                                    <option value="">-- Select Template --</option>
                                                                    <option value="deal_broadcast">deal_broadcast (Omnichannel)</option>
                                                                    {templates.map(t => (
                                                                        <option key={t.id || t._id} value={t.name || t.id}>{t.name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {step.action?.type === 'create_task' && (
                                                        <div>
                                                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Task Title / Instruction</label>
                                                            <input
                                                                type="text"
                                                                value={step.action?.instruction || ''}
                                                                onChange={(e) => updateStepAction(index, 'instruction', e.target.value)}
                                                                placeholder="e.g. Call broker to discuss site visit feedback"
                                                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                                            />
                                                        </div>
                                                    )}

                                                    {step.action?.type === 'update_field' && (
                                                        <div>
                                                            <label style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Field Update (key=value)</label>
                                                            <input
                                                                type="text"
                                                                value={step.action?.instruction || ''}
                                                                onChange={(e) => updateStepAction(index, 'instruction', e.target.value)}
                                                                placeholder="e.g. stage=Negotiation"
                                                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={handleAddStep}
                                    style={{
                                        background: '#fff',
                                        border: '2px dashed #3b82f6',
                                        color: '#2563eb',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '700',
                                        fontSize: '13px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <i className="fas fa-plus-circle"></i> Add Next Step in Sequence
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: MODULE-SPECIFIC EXIT CRITERIA */}
                    {activeTab === 'exit' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                                    Exit Criteria for {formData.module.toUpperCase()}
                                </h4>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Stop further sequence execution as soon as any of these business rules are met.
                                </p>
                            </div>

                            {/* DEALS MODULE EXIT CONDITIONS */}
                            {formData.module === 'deals' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onStageNotOpen ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onStageNotOpen ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onStageNotOpen: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Deal stage is not 'Open' (Negotiation, Booked, Closed Won, Lost)
                                            </span>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                                Prevents automated marketing broadcasts after a deal advances into active negotiations or gets booked.
                                            </p>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onPriceChanged ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onPriceChanged ?? false}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onPriceChanged: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Deal price is revised
                                            </span>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                                A fresh sequence will be triggered with the new price parameters.
                                            </p>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onInactive ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onInactive ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onInactive: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Deal is marked Inactive or Archived
                                            </span>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                                Immediately halts broadcasts for withdrawn properties.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* LEADS MODULE EXIT CONDITIONS */}
                            {formData.module === 'leads' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onDealCreated ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onDealCreated ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onDealCreated: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when a Deal is created for this lead
                                            </span>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                                Stops lead nurture drip once purchase intent is converted to a deal.
                                            </p>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onLost ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onLost ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onLost: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Lead is marked Lost / Disqualified
                                            </span>
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onManualActivity ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onManualActivity ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onManualActivity: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Lead replies or RM logs a manual activity
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* INVENTORY MODULE EXIT CONDITIONS */}
                            {formData.module === 'inventory' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onSold ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onSold ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onSold: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Inventory is Sold or Booked
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* ACTIVITIES MODULE EXIT CONDITIONS */}
                            {formData.module === 'activities' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', background: formData.exitConditions.onCompleted ? '#eff6ff' : '#fff' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.exitConditions.onCompleted ?? true}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                exitConditions: { ...formData.exitConditions, onCompleted: e.target.checked }
                                            })}
                                            style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                        />
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                Stop when Activity is Completed
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '18px 24px', background: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        style={{ padding: '10px 18px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
                        onClick={handleSave}
                    >
                        {editData && (editData.id || editData._id) ? 'Update Sequence' : 'Save & Activate Sequence'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateSequenceModal;
