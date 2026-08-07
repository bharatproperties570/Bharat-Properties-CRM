import { useState, useEffect } from 'react';
import { useTriggers } from '../context/TriggersContext';
import { whatsappTemplates as mockWhatsapp, smsTemplates, emailTemplates } from '../constants/templates';
import { marketingAPI } from '../utils/api'; // Import api to fetch real templates
import RuleBuilder from './RuleBuilder';

const CreateTriggerModal = ({ isOpen, onClose, editData }) => {
    const { addTrigger, updateTrigger } = useTriggers();
    const [activeTab, setActiveTab] = useState('basic');
    const [dbWhatsAppTemplates, setDbWhatsAppTemplates] = useState([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    
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

    // Fetch real WhatsApp templates on mount
    useEffect(() => {
        if (isOpen) {
            setIsLoadingTemplates(true);
            marketingAPI.getWhatsAppTemplates()
                .then(res => {
                    if (res && res.templates) {
                        setDbWhatsAppTemplates(res.templates);
                    } else if (res && res.data) { // fallback just in case
                        setDbWhatsAppTemplates(res.data);
                    }
                })
                .catch(err => console.error('Failed to load WhatsApp templates:', err))
                .finally(() => setIsLoadingTemplates(false));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!formData.name || formData.name.trim() === '') {
            alert("Trigger Name is required");
            return;
        }

        // Clean up empty ObjectIds to avoid Mongoose CastErrors
        const cleanedData = {
            ...formData,
            actions: formData.actions.map(a => {
                const action = { ...a };
                if (action.sequenceId === '') delete action.sequenceId;
                if (action.automatedActionId === '') delete action.automatedActionId;
                return action;
            })
        };
        
        const triggerId = editData && (editData.id || editData._id);
        const promise = triggerId
            ? updateTrigger(triggerId, cleanedData)
            : addTrigger(cleanedData);
            
        promise.then(() => {
            onClose();
        }).catch(err => {
            alert("Failed to save trigger: " + (err.response?.data?.error || err.message));
        });
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
        } else if (type === 'send_communication') {
            newAction.channel = 'whatsapp';
            newAction.templateId = '';
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
            { value: 'inventory_feedback_submitted', label: 'Feedback Submitted' },
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
        inventory: ['status', 'price', 'type', 'outcome', 'reason'],
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
                            <label style={{ fontSize: '14px', fontWeight: '500' }}>Conditions (Advanced Nested Rules)</label>
                            <RuleBuilder 
                                node={formData.conditions} 
                                onChange={(newConditions) => setFormData({ ...formData, conditions: newConditions })} 
                                fields={fieldsByModule[formData.module] || []}
                            />
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

                                    {action.type === 'update_field' && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value={action.field}
                                                onChange={(e) => updateAction(index, 'field', e.target.value)}
                                                placeholder="Field (e.g., status)"
                                                style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                            <input
                                                type="text"
                                                value={action.value}
                                                onChange={(e) => updateAction(index, 'value', e.target.value)}
                                                placeholder="New Value"
                                                style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>
                                    )}

                                    {action.type === 'send_communication' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Channel</label>
                                                    <select
                                                        value={action.channel}
                                                        onChange={(e) => updateAction(index, 'channel', e.target.value)}
                                                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                                    >
                                                        <option value="whatsapp">WhatsApp</option>
                                                        <option value="sms">SMS</option>
                                                        <option value="email">Email</option>
                                                    </select>
                                                </div>
                                                <div style={{ flex: 2 }}>
                                                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Select Template</label>
                                                    <select
                                                        value={action.templateId}
                                                        onChange={(e) => updateAction(index, 'templateId', e.target.value)}
                                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', outline: 'none' }}
                                                    >
                                                        <option value="">Select Template</option>
                                                        {action.channel === 'whatsapp' ? (
                                                            isLoadingTemplates ? <option disabled>Loading templates...</option> :
                                                            dbWhatsAppTemplates.map(t => (
                                                                <option key={t.name} value={t.name}>{t.name} ({t.category})</option>
                                                            ))
                                                        ) : (action.channel === 'sms' ? smsTemplates : emailTemplates).map(t => (
                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {action.templateId && (
                                                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Template Preview</div>
                                                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                        {action.channel === 'whatsapp' ? (
                                                            dbWhatsAppTemplates.find(t => String(t.name) === String(action.templateId))?.components?.find(c => c.type === 'BODY')?.text ||
                                                            'Preview not available'
                                                        ) : (
                                                            (action.channel === 'sms' ? smsTemplates : emailTemplates).find(t => String(t.id) === String(action.templateId))?.content || 
                                                            (action.channel === 'sms' ? smsTemplates : emailTemplates).find(t => String(t.id) === String(action.templateId))?.body || 
                                                            'Preview not available'
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {action.type === 'send_notification' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <select
                                                value={action.target}
                                                onChange={(e) => updateAction(index, 'target', e.target.value)}
                                                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                                            >
                                                <option value="manager">Manager</option>
                                                <option value="owner">Owner</option>
                                                <option value="team">Team</option>
                                            </select>
                                            <textarea
                                                value={action.message}
                                                onChange={(e) => updateAction(index, 'message', e.target.value)}
                                                placeholder="Notification message..."
                                                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '60px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                <button
                                    onClick={() => addAction('start_sequence')}
                                    style={{ padding: '10px', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#3b82f6' }}
                                >
                                    + Start Sequence
                                </button>
                                <button
                                    onClick={() => addAction('send_communication')}
                                    style={{ padding: '10px', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#10b981' }}
                                >
                                    + Send Communication
                                </button>
                                <button
                                    onClick={() => addAction('send_notification')}
                                    style={{ padding: '10px', background: '#f5f3ff', border: '1px solid #8b5cf6', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#8b5cf6' }}
                                >
                                    + Internal Notification
                                </button>
                                <button
                                    onClick={() => addAction('update_field')}
                                    style={{ padding: '10px', background: '#fff7ed', border: '1px solid #f97316', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#f97316' }}
                                >
                                    + Update Field
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
