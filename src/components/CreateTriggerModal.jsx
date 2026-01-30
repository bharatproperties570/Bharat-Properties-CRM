import React, { useState, useEffect } from 'react';
import { useTriggers } from '../context/TriggersContext';

const CreateTriggerModal = ({ isOpen, onClose, editData }) => {
    const { addTrigger, updateTrigger } = useTriggers();
    const [activeTab, setActiveTab] = useState('basic');
    const [formData, setFormData] = useState(editData || {
        name: '',
        module: 'leads',
        event: 'lead_created',
        priority: 5,
        conditions: {
            operator: 'AND',
            rules: []
        },
        actions: []
    });

    // Update formData when editData changes
    useEffect(() => {
        if (editData) {
            setFormData(editData);
        }
    }, [editData]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (editData && editData.id) {
            updateTrigger(editData.id, formData);
        } else {
            addTrigger(formData);
        }
        onClose();
    };

    const addConditionRule = () => {
        setFormData({
            ...formData,
            conditions: {
                ...formData.conditions,
                rules: [...formData.conditions.rules, { field: '', operator: '==', value: '' }]
            }
        });
    };

    const updateConditionRule = (index, field, value) => {
        const newRules = [...formData.conditions.rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setFormData({
            ...formData,
            conditions: { ...formData.conditions, rules: newRules }
        });
    };

    const removeConditionRule = (index) => {
        setFormData({
            ...formData,
            conditions: {
                ...formData.conditions,
                rules: formData.conditions.rules.filter((_, i) => i !== index)
            }
        });
    };

    const addAction = (type) => {
        const newAction = { type };
        if (type === 'start_sequence') {
            newAction.sequenceId = '';
        } else if (type === 'send_notification') {
            newAction.target = 'manager';
            newAction.template = '';
            newAction.data = {};
        } else if (type === 'fire_automated_action') {
            newAction.automatedActionId = '';
        }
        setFormData({
            ...formData,
            actions: [...formData.actions, newAction]
        });
    };

    const updateAction = (index, field, value) => {
        const newActions = [...formData.actions];
        newActions[index] = { ...newActions[index], [field]: value };
        setFormData({ ...formData, actions: newActions });
    };

    const removeAction = (index) => {
        setFormData({
            ...formData,
            actions: formData.actions.filter((_, i) => i !== index)
        });
    };

    const eventsByModule = {
        leads: [
            { value: 'lead_created', label: 'Lead Created' },
            { value: 'lead_stage_changed', label: 'Lead Stage Changed' },
            { value: 'lead_score_changed', label: 'Lead Score Changed' },
            { value: 'lead_status_changed', label: 'Lead Status Changed' },
            { value: 'lead_inactivity', label: 'Lead Inactivity (X days)' }
        ],
        activities: [
            { value: 'activity_created', label: 'Activity Created' },
            { value: 'activity_completed', label: 'Activity Completed' },
            { value: 'activity_overdue', label: 'Activity Overdue' }
        ],
        communication: [
            { value: 'call_logged', label: 'Call Logged' },
            { value: 'call_outcome_selected', label: 'Call Outcome Selected' },
            { value: 'message_received', label: 'Message Received' }
        ],
        inventory: [
            { value: 'inventory_status_changed', label: 'Inventory Status Changed' },
            { value: 'inventory_linked_to_deal', label: 'Inventory Linked to Deal' }
        ],
        deals: [
            { value: 'deal_created', label: 'Deal Created' },
            { value: 'deal_stage_changed', label: 'Deal Stage Changed' },
            { value: 'deal_inactivity', label: 'Deal Inactivity' }
        ],
        post_sale: [
            { value: 'payment_received', label: 'Payment Received' },
            { value: 'payment_pending', label: 'Payment Pending' },
            { value: 'registry_completed', label: 'Registry Completed' }
        ]
    };

    const fieldsByModule = {
        leads: ['score', 'stage', 'status', 'source', 'budget', 'owner'],
        activities: ['type', 'status', 'priority', 'assignedTo'],
        communication: ['outcome', 'duration', 'type'],
        inventory: ['status', 'price', 'type'],
        deals: ['stage', 'value', 'probability'],
        post_sale: ['paymentStatus', 'registryStatus']
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', width: '900px', borderRadius: '16px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                        {editData && editData.id ? 'Edit Trigger' : 'Create Trigger'}
                    </h3>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#6b7280' }} onClick={onClose}></i>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                    {['basic', 'event', 'conditions', 'actions'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 24px',
                                cursor: 'pointer',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : 'none',
                                color: activeTab === tab ? '#3b82f6' : '#6b7280',
                                fontWeight: '600',
                                textTransform: 'capitalize'
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Trigger Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Hot Lead Notification"
                                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Module</label>
                                    <select
                                        value={formData.module}
                                        onChange={(e) => setFormData({ ...formData, module: e.target.value, event: eventsByModule[e.target.value][0].value })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                    >
                                        <option value="leads">Leads</option>
                                        <option value="activities">Activities</option>
                                        <option value="communication">Communication</option>
                                        <option value="inventory">Inventory</option>
                                        <option value="deals">Deals</option>
                                        <option value="post_sale">Post-Sale</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Priority (1-10)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                    />
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Lower number = higher priority</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'event' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: '500' }}>Select Event</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    {eventsByModule[formData.module]?.map(event => (
                                        <div
                                            key={event.value}
                                            onClick={() => setFormData({ ...formData, event: event.value })}
                                            style={{
                                                padding: '16px',
                                                border: formData.event === event.value ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                background: formData.event === event.value ? '#eff6ff' : '#fff',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ fontSize: '14px', fontWeight: '600', color: formData.event === event.value ? '#3b82f6' : '#111827' }}>
                                                {event.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'conditions' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '14px', fontWeight: '500' }}>Conditions (IF)</label>
                                <select
                                    value={formData.conditions.operator}
                                    onChange={(e) => setFormData({ ...formData, conditions: { ...formData.conditions, operator: e.target.value } })}
                                    style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                >
                                    <option value="AND">Match ALL (AND)</option>
                                    <option value="OR">Match ANY (OR)</option>
                                </select>
                            </div>

                            {formData.conditions.rules.map((rule, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 40px', gap: '12px', alignItems: 'center', background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                    <select
                                        value={rule.field}
                                        onChange={(e) => updateConditionRule(index, 'field', e.target.value)}
                                        style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                    >
                                        <option value="">Select Field</option>
                                        {fieldsByModule[formData.module]?.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={rule.operator}
                                        onChange={(e) => updateConditionRule(index, 'operator', e.target.value)}
                                        style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                    >
                                        <option value="==">Equals</option>
                                        <option value="!=">Not Equals</option>
                                        <option value=">">Greater Than</option>
                                        <option value=">=">Greater or Equal</option>
                                        <option value="<">Less Than</option>
                                        <option value="<=">Less or Equal</option>
                                        <option value="contains">Contains</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={rule.value}
                                        onChange={(e) => updateConditionRule(index, 'value', e.target.value)}
                                        placeholder="Value"
                                        style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                    />
                                    <i
                                        className="fas fa-trash-alt"
                                        onClick={() => removeConditionRule(index)}
                                        style={{ cursor: 'pointer', color: '#ef4444', textAlign: 'center' }}
                                    ></i>
                                </div>
                            ))}

                            <button
                                onClick={addConditionRule}
                                style={{ padding: '10px', background: '#f3f4f6', border: '1px dashed #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#4b5563' }}
                            >
                                + Add Condition
                            </button>
                        </div>
                    )}

                    {activeTab === 'actions' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <label style={{ fontSize: '14px', fontWeight: '500' }}>Actions (THEN)</label>

                            {formData.actions.map((action, index) => (
                                <div key={index} style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>
                                            {action.type.replace('_', ' ')}
                                        </span>
                                        <i
                                            className="fas fa-trash-alt"
                                            onClick={() => removeAction(index)}
                                            style={{ cursor: 'pointer', color: '#ef4444' }}
                                        ></i>
                                    </div>

                                    {action.type === 'start_sequence' && (
                                        <input
                                            type="text"
                                            value={action.sequenceId}
                                            onChange={(e) => updateAction(index, 'sequenceId', e.target.value)}
                                            placeholder="Sequence ID (e.g., seq1)"
                                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                        />
                                    )}

                                    {action.type === 'send_notification' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <select
                                                value={action.target}
                                                onChange={(e) => updateAction(index, 'target', e.target.value)}
                                                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            >
                                                <option value="manager">Manager</option>
                                                <option value="owner">Owner</option>
                                                <option value="team">Team</option>
                                            </select>
                                            <input
                                                type="text"
                                                value={action.template}
                                                onChange={(e) => updateAction(index, 'template', e.target.value)}
                                                placeholder="Template name"
                                                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                <button
                                    onClick={() => addAction('start_sequence')}
                                    style={{ padding: '10px', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#3b82f6' }}
                                >
                                    + Start Sequence
                                </button>
                                <button
                                    onClick={() => addAction('send_notification')}
                                    style={{ padding: '10px', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#10b981' }}
                                >
                                    + Send Notification
                                </button>
                                <button
                                    onClick={() => addAction('fire_automated_action')}
                                    style={{ padding: '10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#f59e0b' }}
                                >
                                    + Automated Action
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button style={{ padding: '10px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }} onClick={onClose}>Cancel</button>
                    <button
                        style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                        onClick={handleSave}
                    >
                        {editData && editData.id ? 'Update Trigger' : 'Save Trigger'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateTriggerModal;
