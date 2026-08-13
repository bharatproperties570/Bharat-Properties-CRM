import { useState, useEffect } from 'react';
import { useAutomatedActions } from '../context/AutomatedActionsContext';
import { useTriggers } from '../context/TriggersContext';
import { emailTemplates } from '../constants/templates';
import { systemSettingsAPI } from '../utils/api';
import smsService from '../services/smsService';

const CreateAutomatedActionModal = ({ isOpen, onClose, editData }) => {
    const { addAction } = useAutomatedActions();
    const { triggers = [] } = useTriggers();
    
    const [waTemplates, setWaTemplates] = useState([]);
    const [smsTemplatesList, setSmsTemplatesList] = useState([]);
    const [emailTemplatesList, setEmailTemplatesList] = useState(emailTemplates || []);
    const [rcsTemplatesList, setRcsTemplatesList] = useState([]);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const waRes = await systemSettingsAPI.getByKey('crm_whatsapp_templates');
                if (waRes?.data?.value && Array.isArray(waRes.data.value)) {
                    setWaTemplates(waRes.data.value);
                }
                
                const rcsRes = await systemSettingsAPI.getByKey('crm_rcs_templates');
                if (rcsRes?.data?.value && Array.isArray(rcsRes.data.value)) {
                    setRcsTemplatesList(rcsRes.data.value);
                }
                
                const smsRes = await smsService.getTemplates();
                if (smsRes && Array.isArray(smsRes)) {
                    setSmsTemplatesList(smsRes);
                }
            } catch (e) {
                console.error("Failed to load dynamic templates", e);
            }
        };
        fetchTemplates();
    }, []);

    const [fieldKey, setFieldKey] = useState('');
    const [fieldVal, setFieldVal] = useState('');
    
    const [formData, setFormData] = useState({
        name: '',
        targetModule: 'leads',
        actionType: 'update_field',
        invokedByTrigger: '',
        isActive: true,
        fieldMapping: {},
        notificationConfig: {
            channels: { whatsapp: false, sms: false, email: false },
            templates: { whatsapp: '', sms: '', email: '' }
        },
        delay: {
            isActive: false,
            amount: 0,
            unit: 'days',
            relativeToField: 'dueDate'
        },
        rollbackPolicy: 'Manual'
    });

    useEffect(() => {
        if (editData) {
            setFormData({
                ...editData,
                notificationConfig: editData.notificationConfig || {
                    channels: { whatsapp: false, sms: false, email: false },
                    templates: { whatsapp: '', sms: '', email: '' }
                },
                delay: editData.delay || {
                    isActive: false,
                    amount: 0,
                    unit: 'days',
                    relativeToField: 'dueDate'
                }
            });
            const keys = Object.keys(editData.fieldMapping || {});
            if (keys.length > 0) {
                setFieldKey(keys[0]);
                setFieldVal(editData.fieldMapping[keys[0]]);
            }
        }
    }, [editData]);

    if (!isOpen) return null;

    const modules = ['Leads', 'Contacts', 'Activities', 'Communication', 'Inventory', 'Deals', 'Post Sale'];

    // Safety Restrictions Map for UI
    const restrictionMap = {
        Inventory: ['update_field', 'lock_inventory', 'unlock_inventory'],
        Deals: ['update_field', 'send_notification', 'create_record', 'run_ai_lead_match_campaign'],
        Leads: ['update_field', 'create_record', 'add_tag', 'send_notification'],
        Activities: ['update_field', 'create_record'],
        Other: ['update_field', 'send_notification', 'create_record']
    };

    const actionTypes = [
        { value: 'update_field', label: 'Update Field' },
        { value: 'create_record', label: 'Create Record' },
        { value: 'add_tag', label: 'Add/Remove Tag' },
        { value: 'send_notification', label: 'Send Notification' },
        { value: 'run_ai_lead_match_campaign', label: 'Run AI Lead Match Campaign' },
        { value: 'lock_inventory', label: 'Lock Inventory' },
        { value: 'unlock_inventory', label: 'Unlock Inventory' }
    ];

    const handleSave = () => {
        const payload = { ...formData };
        if (payload.actionType === 'update_field' && fieldKey) {
            payload.fieldMapping = { [fieldKey]: fieldVal };
        }
        addAction(payload);
        onClose();
    };

    const isActionAllowed = (type) => {
        const allowed = restrictionMap[formData.targetModule] || restrictionMap.Other;
        return allowed.includes(type);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ background: '#fff', width: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{editData ? 'Edit Automated Action' : 'Create Automated Action'}</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Define system-controlled repetitive tasks.</p>
                    </div>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose}></i>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Action Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Lock House on Booking"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Target Module</label>
                            <select
                                value={formData.targetModule}
                                onChange={e => setFormData({ ...formData, targetModule: e.target.value })}
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                            >
                                {modules.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Action Type</label>
                            <select
                                value={formData.actionType}
                                onChange={e => setFormData({ ...formData, actionType: e.target.value })}
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                            >
                                {actionTypes.map(at => (
                                    <option key={at.value} value={at.value} disabled={!isActionAllowed(at.value)}>
                                        {at.label} {!isActionAllowed(at.value) && '(Restricted)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Invoked By Trigger</label>
                        <select
                            value={formData.invokedByTrigger}
                            onChange={e => setFormData({ ...formData, invokedByTrigger: e.target.value })}
                            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        >
                            <option value="">-- Select a Trigger --</option>
                            {triggers.map(t => (
                                <option key={t._id || t.id} value={t._id || t.id}>{t.name} ({t.module})</option>
                            ))}
                        </select>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>Automated actions cannot run without a trigger.</p>
                    </div>

                    {formData.actionType === 'update_field' && (
                        <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', marginBottom: '16px' }}>
                                <i className="fas fa-edit"></i>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Field Update Configuration</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#166534' }}>Field Name</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. status"
                                        value={fieldKey}
                                        onChange={e => setFieldKey(e.target.value)}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#166534' }}>New Value</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. Closed"
                                        value={fieldVal}
                                        onChange={e => setFieldVal(e.target.value)}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {formData.actionType === 'run_ai_lead_match_campaign' && (
                        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', marginBottom: '16px' }}>
                                <i className="fas fa-robot"></i>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>AI Lead Match Configuration</span>
                            </div>
                            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#7f1d1d' }}>
                                This action will automatically search the entire database for leads whose requirements match the newly created deal, and dispatch personalized marketing collateral to them.
                            </p>
                            
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#7f1d1d', marginBottom: '8px' }}>Active Channels</label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    {['whatsapp', 'sms', 'email', 'rcs'].map(channel => (
                                        <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#7f1d1d' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={formData.notificationConfig?.channels?.[channel] || false}
                                                onChange={(e) => {
                                                    const newConfig = { ...formData.notificationConfig };
                                                    if (!newConfig.channels) newConfig.channels = {};
                                                    newConfig.channels[channel] = e.target.checked;
                                                    setFormData({ ...formData, notificationConfig: newConfig });
                                                }}
                                            />
                                            {channel.toUpperCase()}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                                {formData.notificationConfig?.channels?.whatsapp && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#059669' }}><i className="fab fa-whatsapp"></i> WhatsApp Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.whatsapp || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.whatsapp = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #10b981', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select Approved Template --</option>
                                            {waTemplates.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.sms && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}><i className="fas fa-sms"></i> SMS Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.sms || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.sms = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select SMS Template --</option>
                                            {smsTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.email && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#dc2626' }}><i className="fas fa-envelope"></i> Email Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.email || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.email = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #f87171', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select Email Template --</option>
                                            {emailTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.rcs && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#7c3aed' }}><i className="fas fa-comment-dots"></i> RCS Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.rcs || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.rcs = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #a78bfa', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select RCS Template --</option>
                                            {rcsTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#7f1d1d', marginBottom: '12px' }}>
                                    <i className="fas fa-filter" style={{ marginRight: '6px' }}></i>
                                    Advanced Match Constraints
                                </label>
                                
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#450a0a' }}>Minimum Match Score Threshold</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b' }}>{formData.matchConstraints?.minScore || 80}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="100" step="5"
                                        value={formData.matchConstraints?.minScore || 80}
                                        onChange={(e) => {
                                            setFormData({ 
                                                ...formData, 
                                                matchConstraints: { ...formData.matchConstraints, minScore: parseInt(e.target.value) } 
                                            });
                                        }}
                                        style={{ width: '100%', accentColor: '#ef4444' }}
                                    />
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: '#991b1b' }}>Only leads with a match score above this threshold will receive outreach.</p>
                                </div>

                                <div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#450a0a', display: 'block', marginBottom: '8px' }}>Strict Requirement Filters</span>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {['strictLocation', 'strictBudget', 'strictType', 'strictSize'].map(key => {
                                            const label = key.replace('strict', '').replace(/([A-Z])/g, ' $1').trim();
                                            return (
                                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600, color: '#7f1d1d' }}>
                                                    <input 
                                                        type="checkbox"
                                                        checked={formData.matchConstraints?.[key] || false}
                                                        onChange={(e) => {
                                                            setFormData({ 
                                                                ...formData, 
                                                                matchConstraints: { ...formData.matchConstraints, [key]: e.target.checked } 
                                                            });
                                                        }}
                                                    />
                                                    Must match {label}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <p style={{ margin: '8px 0 0 0', fontSize: '0.7rem', color: '#991b1b' }}>Strict filters will completely discard a match if that specific field does not match perfectly, regardless of the overall score.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {formData.actionType === 'send_notification' && (
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', marginBottom: '16px' }}>
                                <i className="fas fa-bullhorn" style={{ color: 'var(--primary-color)' }}></i>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Omnichannel Notification Settings</span>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                {['whatsapp', 'sms', 'email', 'rcs'].map(channel => (
                                    <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.notificationConfig?.channels?.[channel] || false}
                                            onChange={(e) => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.channels) newConfig.channels = {};
                                                newConfig.channels[channel] = e.target.checked;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                        />
                                        {channel.toUpperCase()}
                                    </label>
                                ))}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {formData.notificationConfig?.channels?.whatsapp && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#059669' }}><i className="fab fa-whatsapp"></i> WhatsApp Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.whatsapp || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.whatsapp = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select Approved Template --</option>
                                            {waTemplates.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.sms && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#3b82f6' }}><i className="fas fa-sms"></i> SMS Content / DLT ID</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.sms || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.sms = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select SMS Template --</option>
                                            {smsTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.email && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#4b5563' }}><i className="fas fa-envelope"></i> Email Subject</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.email || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.email = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select Email Template --</option>
                                            {emailTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {formData.notificationConfig?.channels?.rcs && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#7c3aed' }}><i className="fas fa-comment-dots"></i> RCS Template</label>
                                        <select 
                                            value={formData.notificationConfig?.templates?.rcs || ''}
                                            onChange={e => {
                                                const newConfig = { ...formData.notificationConfig };
                                                if (!newConfig.templates) newConfig.templates = {};
                                                newConfig.templates.rcs = e.target.value;
                                                setFormData({ ...formData, notificationConfig: newConfig });
                                            }}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- Select RCS Template --</option>
                                            {rcsTemplatesList.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            
                            <div style={{ marginTop: '16px', padding: '12px', background: '#e0f2fe', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '0.8rem', color: '#0369a1' }}>
                                <strong><i className="fas fa-lightbulb" style={{ marginRight: '6px' }}></i>Variables Guide:</strong>
                                <p style={{ margin: '4px 0 0 0' }}>Use double curly braces to insert dynamic data. Examples:</p>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                    <li><code>{`{{name}}`}</code> - Contact/Lead Name</li>
                                    <li><code>{`{{mobile}}`}</code> - Phone Number</li>
                                    <li><code>{`{{status}}`}</code> - Current Status</li>
                                    <li><code>{`{{assignedTo.name}}`}</code> - Owner Name</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', marginBottom: '12px' }}>
                            <i className="fas fa-clock" style={{ color: '#d97706' }}></i>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Delayed Execution (BullMQ Queue)</span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#92400e', cursor: 'pointer', marginBottom: '12px' }}>
                            <input 
                                type="checkbox" 
                                checked={formData.delay?.isActive || false}
                                onChange={(e) => setFormData({ ...formData, delay: { ...(formData.delay || {}), isActive: e.target.checked }})}
                            />
                            Enable Time-based Delay
                        </label>
                        
                        {formData.delay?.isActive && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#92400e' }}>Offset Value (e.g. -1)</label>
                                    <input 
                                        type="number"
                                        value={formData.delay?.amount || 0}
                                        onChange={(e) => setFormData({ ...formData, delay: { ...(formData.delay || {}), amount: Number(e.target.value) }})}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '0.85rem', background: '#fff' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#92400e' }}>Time Unit</label>
                                    <select 
                                        value={formData.delay?.unit || 'days'}
                                        onChange={(e) => setFormData({ ...formData, delay: { ...(formData.delay || {}), unit: e.target.value }})}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '0.85rem', background: '#fff' }}
                                    >
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                        <option value="weeks">Weeks</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#92400e' }}>Relative to Field</label>
                                    <select 
                                        value={formData.delay?.relativeToField || 'dueDate'}
                                        onChange={(e) => setFormData({ ...formData, delay: { ...(formData.delay || {}), relativeToField: e.target.value }})}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '0.85rem', background: '#fff' }}
                                    >
                                        <option value="dueDate">Due Date</option>
                                        <option value="createdAt">Created At</option>
                                        <option value="updatedAt">Updated At</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', marginBottom: '8px' }}>
                            <i className="fas fa-shield-alt" style={{ color: 'var(--primary-color)' }}></i>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Safety Governance</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.75rem', color: '#64748b' }}>
                            <li>Will not bypass Field Rules.</li>
                            <li>Critical financial fields are read-only for this engine.</li>
                            <li>Full audit trail will be generated in real-time.</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '10px 24px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                        {editData ? 'Update Action' : 'Save Action'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateAutomatedActionModal;
