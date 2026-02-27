import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useActivities } from '../context/ActivityContext';

const InventoryFeedbackModal = ({ isOpen, onClose, inventory, onSave }) => {
    const { masterFields } = usePropertyConfig();
    const { addActivity } = useActivities(); // Access Activities Context
    const [formData, setFormData] = useState({
        selectedOwner: '',
        selectedOwnerRole: '',
        result: '',
        reason: '', // New: Sub-outcome
        feedback: '',
        nextActionType: 'Call',
        nextActionDate: '',
        nextActionTime: '',
        markAsSold: false // New: Automation
    });

    const [errors, setErrors] = useState({});
    const [history, setHistory] = useState([]);
    const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
    const [activeTriggers, setActiveTriggers] = useState({
        whatsapp: false,
        sms: false,
        email: false
    });
    const [channelMessages, setChannelMessages] = useState({
        whatsapp: '',
        sms: '',
        email: ''
    });
    const [previewChannel, setPreviewChannel] = useState('whatsapp'); // Track which preview is shown

    useEffect(() => {
        if (isOpen && inventory) {
            // Default Triggers from Global Settings
            const globalTriggers = masterFields.triggers?.['Feedback Received'] || { whatsapp: false, sms: false, email: false };
            setActiveTriggers({ ...globalTriggers });

            // Default Owner Logic
            let initialOwner = '', initialRole = '';
            if (inventory.ownerName) { initialOwner = inventory.ownerName; initialRole = 'Owner'; }
            else if (inventory.associatedContact) { initialOwner = inventory.associatedContact; initialRole = 'Associate'; }

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];

            setFormData({
                selectedOwner: initialOwner,
                selectedOwnerRole: initialRole,
                result: '',
                reason: '',
                feedback: '',
                nextActionType: 'Call',
                nextActionDate: dateStr,
                nextActionTime: '10:00',
                markAsSold: false
            });

            // History Logic
            let displayHistory = [];
            if (inventory.history && inventory.history.length > 0) {
                displayHistory = inventory.history;
            } else if (inventory.lastContactDate !== '-') {
                displayHistory.push({
                    id: 'legacy',
                    date: inventory.lastContactDate,
                    time: inventory.lastContactTime,
                    user: inventory.lastContactUser,
                    action: 'Call',
                    result: 'Previous Update',
                    note: inventory.remarks || ''
                });
            }
            setHistory(displayHistory);
            setErrors({});
            setChannelMessages({ whatsapp: '', sms: '', email: '' });
            setPreviewChannel('whatsapp');
        }
    }, [isOpen, inventory, masterFields.triggers]);

    // Template Generator Effect (Multi-Channel)
    useEffect(() => {
        if (formData.result && inventory) {
            const rule = (masterFields.feedbackRules?.[formData.result]?.[formData.reason]) || {};

            // Apply Rule-Based Trigger Overrides if they exist
            if (rule.sendWhatsapp !== undefined || rule.sendSms !== undefined || rule.sendEmail !== undefined) {
                setActiveTriggers(prev => ({
                    ...prev,
                    whatsapp: rule.sendWhatsapp ?? prev.whatsapp,
                    sms: rule.sendSms ?? prev.sms,
                    email: rule.sendEmail ?? prev.email
                }));
            } else if (rule.sendMsg === false) {
                setActiveTriggers({ whatsapp: false, sms: false, email: false });
            }

            const templateKey = rule.templateKey || formData.result;
            const outcomeTemplates = masterFields.responseTemplates?.[templateKey] || {};

            const ownerName = formData.selectedOwner || 'Sir/Ma\'am';
            const unitInfo = `Unit ${inventory.unitNo}`;
            const time = formData.nextActionTime ? `${formData.nextActionTime} on ${formData.nextActionDate}` : 'later';
            const reason = formData.reason || 'Discussed';

            const processTemplate = (template) => {
                if (!template) return '';
                if (typeof template !== 'string') return ''; // Safety check for multi-channel transition
                return template.replace(/{owner}/g, ownerName)
                    .replace(/{unit}/g, unitInfo)
                    .replace(/{time}/g, time)
                    .replace(/{reason}/g, reason);
            };

            setChannelMessages({
                whatsapp: processTemplate(rule.customMessage || outcomeTemplates.whatsapp || ''),
                sms: processTemplate(outcomeTemplates.sms || ''),
                email: processTemplate(outcomeTemplates.email || '')
            });

            // Apply Inventory Status Automation Rule
            if (rule.inventoryStatus === 'InActive') {
                setFormData(prev => ({ ...prev, markAsSold: true }));
            } else if (rule.inventoryStatus === 'Active') {
                setFormData(prev => ({ ...prev, markAsSold: false }));
            }

            // Set default preview channel to the first active one
            if (activeTriggers.whatsapp) setPreviewChannel('whatsapp');
            else if (activeTriggers.sms) setPreviewChannel('sms');
            else if (activeTriggers.email) setPreviewChannel('email');
        }
    }, [formData.result, formData.reason, formData.selectedOwner, formData.nextActionDate, formData.nextActionTime, inventory?.unitNo, masterFields.responseTemplates, masterFields.feedbackRules, activeTriggers.whatsapp, activeTriggers.sms, activeTriggers.email]);

    // Smart Follow-up Automation (Rule-Based)
    useEffect(() => {
        if (!inventory) return;
        const rule = (masterFields.feedbackRules && masterFields.feedbackRules[formData.result] && masterFields.feedbackRules[formData.result][formData.reason]) || {};

        if (rule.actionType === 'None') {
            setScheduleFollowUp(false);
            return;
        }

        if (rule.actionType) {
            setScheduleFollowUp(true);
            setFormData(prev => ({ ...prev, nextActionType: rule.actionType }));
            return;
        }

        const followUpOutcomes = [
            'Interested / Warm', 'Interested / Hot', 'Request Call Back',
            'Busy / Driving', 'Call Later', 'Busy', 'Interested'
        ];

        const shouldEnable = followUpOutcomes.includes(formData.result) ||
            (formData.result === 'Not Interested' && formData.reason === 'Not Selling but Buying');

        if (shouldEnable) {
            setScheduleFollowUp(true);
        } else if (formData.result === 'Not Interested' || formData.result === 'Wrong Number / Invalid') {
            setScheduleFollowUp(false);
        }
    }, [formData.result, formData.reason, masterFields.feedbackRules]);

    if (!isOpen || !inventory) return null;

    const ownersList = [];
    if (inventory.ownerName) ownersList.push({ name: inventory.ownerName, role: 'Owner', label: `${inventory.ownerName} (Owner)` });
    if (inventory.associatedContact) ownersList.push({ name: inventory.associatedContact, role: 'Associate', label: `${inventory.associatedContact} (Associate)` });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleResultSelect = (result) => {
        setFormData(prev => ({ ...prev, result, reason: '' }));
        if (errors.result) setErrors(prev => ({ ...prev, result: '' }));
    };

    const handleOwnerChange = (e) => {
        const selectedName = e.target.value;
        const ownerObj = ownersList.find(o => o.name === selectedName);
        setFormData(prev => ({
            ...prev,
            selectedOwner: selectedName,
            selectedOwnerRole: ownerObj ? ownerObj.role : ''
        }));
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.selectedOwner) newErrors.selectedOwner = 'Required';
        if (!formData.result) newErrors.result = 'Required';

        if (masterFields.feedbackReasons && masterFields.feedbackReasons[formData.result] && !formData.reason) {
            newErrors.reason = 'Please specify a reason';
        }

        if (scheduleFollowUp) {
            if (!formData.nextActionDate) newErrors.nextActionDate = 'Required';
            if (!formData.nextActionTime) newErrors.nextActionTime = 'Required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSave(formData);

            // 1. Log Automated Messages (Triggers)
            const activeTriggersList = Object.entries(activeTriggers).filter(([_, isActive]) => isActive).map(([ch]) => ch.toUpperCase());

            Object.entries(activeTriggers).forEach(([channel, isActive]) => {
                if (isActive && channelMessages[channel]) {
                    const msgActivity = {
                        type: channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email',
                        contactName: formData.selectedOwner,
                        contactPhone: '',
                        scheduledDate: new Date().toISOString(),
                        agenda: `Automated ${channel.toUpperCase()} message prepared: ${channelMessages[channel].substring(0, 50)}...`,
                        activityType: 'Message',
                        scheduledBy: 'System',
                        scheduledFor: 'Interaction',
                        stage: '',
                        status: 'completed',
                        feedback: channelMessages[channel],
                        project: inventory.buildingName || '',
                        automationInfo: `Channels: ${activeTriggersList.join(', ')}`
                    };
                    addActivity(msgActivity);
                    console.log(`Automated ${channel.toUpperCase()} Dispatched:`, msgActivity);
                }
            });

            // 2. Integrate with Activities Module (Follow-up)
            if (scheduleFollowUp) {
                const newActivity = {
                    type: formData.nextActionType || 'Call',
                    contactName: formData.selectedOwner,
                    contactPhone: '', // Ideally fetch from contact details if available
                    scheduledDate: `${formData.nextActionDate}T${formData.nextActionTime}`,
                    agenda: `${formData.nextActionType} with ${formData.selectedOwner} for Unit ${inventory.unitNo} - ${inventory.type}`,
                    activityType: formData.nextActionType || 'Call',
                    scheduledBy: 'Current User', // Replace with auth user name
                    scheduledFor: 'Follow Up',
                    stage: '',
                    status: 'pending',
                    feedback: formData.feedback,
                    project: inventory.buildingName || ''
                };
                addActivity(newActivity);
                console.log("Follow-up Activity Dispatched:", newActivity);
            }

            onClose();
        }
    };

    const handleQuickAction = (type) => {
        if (type === 'call') {
            window.alert(`Initiating call to ${formData.selectedOwner || 'Owner'}...`);
            // Add tel link logic here if needed: window.location.href = `tel:${ownerPhone}`;
        } else {
            setActiveTriggers(prev => ({
                ...prev,
                [type]: !prev[type]
            }));
        }
    };

    const handleCreateDeal = () => {
        window.alert(`Initiating Deal Creation for ${inventory.unitNo}...\nReason: ${formData.reason}`);
        console.log("Create Deal Triggered", {
            inventoryId: inventory.id,
            reason: formData.reason,
            owner: formData.selectedOwner
        });
    };

    const handleCreateLead = () => {
        window.alert(`Initiating Lead Creation for ${formData.selectedOwner}...\nIntent: Buying`);
        console.log("Create Lead Triggered", {
            owner: formData.selectedOwner,
            reason: formData.reason
        });
    };

    // Styles
    const labelStyle = { fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const inputStyle = (hasError) => ({
        width: '100%', padding: '10px 12px', borderRadius: '6px',
        border: `1px solid ${hasError ? '#ef4444' : '#cbd5e1'}`,
        fontSize: '0.9rem', outline: 'none', color: '#1e293b',
        transition: 'all 0.2s', height: '40px', boxSizing: 'border-box', backgroundColor: '#fff'
    });
    const customSelectStyle = (hasError) => ({
        ...inputStyle(hasError), paddingRight: '30px', appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px'
    });

    const glowButtonStyle = (isActive, color) => ({
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        border: 'none',
        background: isActive ? color : '#f1f5f9',
        color: isActive ? '#fff' : '#94a3b8',
        cursor: 'pointer',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        boxShadow: isActive ? `0 0 15px ${color}60, 0 4px 10px ${color}40, inset 0 0 4px rgba(255,255,255,0.4)` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.9rem',
        outline: 'none',
        transform: isActive ? 'scale(1.05)' : 'scale(1)'
    });

    // Helper to check if reasons exist for current result
    const currentReasons = masterFields.feedbackReasons ? masterFields.feedbackReasons[formData.result] : null;

    // Button Visibility Logic (Professional & Robust)
    const showDealButton =
        (formData.result.includes('Interested') || formData.result === 'Interested') &&
        ['For Sale', 'For Rent', 'For Lease', 'Sell & Buy (Re-invest)', 'Ready to Sell Now', 'High Intent (Urgent)'].includes(formData.reason);

    const showLeadButton =
        ((formData.result.includes('Interested') || formData.result === 'Interested') && ['Wants to Buy (Invest)', 'Sell & Buy (Re-invest)'].includes(formData.reason)) ||
        (formData.result === 'Not Interested' && ['Not Selling but Buying'].includes(formData.reason));

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="animate-fade-in" style={{
                background: '#fff', width: '950px', borderRadius: '16px', overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', height: '650px'
            }}>

                {/* Left Panel: Interaction History (Same as before) */}
                <div style={{ width: '300px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit {inventory.unitNo}</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 8px 0', lineHeight: 1.2 }}>{inventory.area}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#e2e8f0', color: '#475569', fontWeight: 600 }}>{inventory.type}</span>
                        </div>
                    </div>
                    <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>Interaction Timeline</div>
                        <div className="timeline">
                            {history.map((item, idx) => (
                                <div key={item.id} style={{ position: 'relative', paddingLeft: '24px', paddingBottom: '24px' }}>
                                    <div style={{ position: 'absolute', left: '0', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', border: '2px solid #dbeafe', boxSizing: 'border-box' }}></div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>{item.result}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.date}</div>
                                    </div>

                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                                        <span>{item.action}</span>
                                        <span>•</span>
                                        <span>{item.user}</span>
                                    </div>

                                    {item.note && (
                                        <div style={{ fontSize: '0.7rem', color: '#334155', background: '#fff', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', lineHeight: '1.3' }}>
                                            {item.note}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Feedback Form */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Log New Interaction</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Create Deal Button */}
                            {showDealButton && (
                                <button
                                    onClick={handleCreateDeal}
                                    className="animate-fade-in"
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                        color: '#fff',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        marginRight: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
                                    }}
                                >
                                    <i className="fas fa-handshake"></i>
                                    Create Deal
                                </button>
                            )}

                            {/* Create Lead Button */}
                            {showLeadButton && (
                                <button
                                    onClick={handleCreateLead}
                                    className="animate-fade-in"
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: '#fff',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        marginRight: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)'
                                    }}
                                >
                                    <i className="fas fa-user-plus"></i>
                                    Create Lead
                                </button>
                            )}

                            <button onClick={() => handleQuickAction('call')} title="Call Now" style={glowButtonStyle(false, '#10b981')}><i className="fas fa-phone-alt"></i></button>
                            <button onClick={() => handleQuickAction('whatsapp')} title="WhatsApp Trigger" style={glowButtonStyle(activeTriggers.whatsapp, '#25d366')}><i className="fab fa-whatsapp"></i></button>
                            <button onClick={() => handleQuickAction('sms')} title="SMS Trigger" style={glowButtonStyle(activeTriggers.sms, '#3b82f6')}><i className="fas fa-comment-alt"></i></button>
                            <button onClick={() => handleQuickAction('email')} title="Email Trigger" style={glowButtonStyle(activeTriggers.email, '#f97316')}><i className="fas fa-envelope"></i></button>
                            <button onClick={onClose} style={{ marginLeft: '12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i></button>
                        </div>
                    </div>

                    <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={labelStyle}>Contact</label>
                                <select value={formData.selectedOwner} onChange={handleOwnerChange} style={customSelectStyle(errors.selectedOwner)}>
                                    <option value="">Select Person</option>
                                    {ownersList.map((o, idx) => <option key={idx} value={o.name}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={labelStyle}>Outcome</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {masterFields && masterFields.propertyOwnerFeedback && masterFields.propertyOwnerFeedback.map(opt => (
                                    <div key={opt} onClick={() => handleResultSelect(opt)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '20px',
                                            border: formData.result === opt ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                            background: formData.result === opt ? '#eff6ff' : '#fff',
                                            color: formData.result === opt ? '#1e40af' : '#64748b',
                                            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s'
                                        }}
                                    >
                                        {opt}
                                    </div>
                                ))}
                            </div>
                            {errors.result && <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block', marginTop: '4px' }}>{errors.result}</span>}
                        </div>

                        {currentReasons && (
                            <div className="animate-fade-in" style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                                <label style={labelStyle}>Specific Reason <span style={{ color: '#ef4444' }}>*</span></label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {currentReasons.map(r => (
                                        <div key={r} onClick={() => {
                                            setFormData(prev => ({ ...prev, reason: r }));
                                            // Check automation scenarios (Sold/Rented)
                                            const isSold = ['Sold Out', 'Rented Out'].some(keyword => r.includes(keyword));
                                            if (isSold) {
                                                setFormData(prev => ({ ...prev, reason: r, markAsSold: true }));
                                            } else {
                                                setFormData(prev => ({ ...prev, reason: r, markAsSold: false }));
                                            }
                                        }}
                                            style={{
                                                padding: '6px 12px', borderRadius: '6px',
                                                border: formData.reason === r ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                                                background: formData.reason === r ? '#fffbeb' : '#fff',
                                                color: formData.reason === r ? '#b45309' : '#475569',
                                                fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500
                                            }}
                                        >
                                            {r}
                                        </div>
                                    ))}

                                </div>
                                {errors.reason && <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block', marginTop: '4px' }}>{errors.reason}</span>}
                            </div>
                        )}

                        {formData.markAsSold && (
                            <div className="animate-fade-in" style={{ marginBottom: '20px', padding: '12px', background: '#e0f2fe', borderRadius: '8px', border: '1px solid #7dd3fc', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input type="checkbox" name="markAsSold" checked={formData.markAsSold} onChange={handleChange} style={{ width: '20px', height: '20px' }} />
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0369a1' }}>Update Property Status?</div>
                                    <div style={{ fontSize: '0.8rem', color: '#0c4a6e' }}>
                                        {formData.reason.includes('Sold') || formData.reason.includes('Rented')
                                            ? `This will set the property status to ${formData.reason.includes('Sold') ? 'Sold Out' : 'Rented Out'} and update owner visibility.`
                                            : `This will mark the property as InActive based on the feedback outcome.`
                                        }
                                    </div>
                                </div>
                            </div>
                        )}

                        {(activeTriggers.whatsapp || activeTriggers.sms || activeTriggers.email) && (
                            <div className="animate-fade-in" style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>Automation Preview</label>
                                    <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '2px', borderRadius: '16px' }}>
                                        {[
                                            { id: 'whatsapp', icon: 'fab fa-whatsapp', color: '#25d366' },
                                            { id: 'sms', icon: 'fas fa-comment-alt', color: '#3b82f6' },
                                            { id: 'email', icon: 'fas fa-envelope', color: '#f97316' }
                                        ].map(ch => (
                                            activeTriggers[ch.id] && (
                                                <button
                                                    key={ch.id}
                                                    onClick={() => setPreviewChannel(ch.id)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: previewChannel === ch.id ? '#fff' : 'transparent',
                                                        color: previewChannel === ch.id ? ch.color : '#94a3b8',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        boxShadow: previewChannel === ch.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <i className={ch.icon}></i>
                                                    {ch.id === 'whatsapp' ? 'WhatsApp' : ch.id.toUpperCase()}
                                                </button>
                                            )
                                        ))}
                                    </div>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        readOnly
                                        value={channelMessages[previewChannel]}
                                        style={{
                                            ...inputStyle(false),
                                            height: '70px',
                                            background: '#f0fdf4',
                                            color: '#166534',
                                            borderColor: '#bbf7d0',
                                            fontSize: '0.8rem',
                                            lineHeight: '1.4',
                                            paddingRight: '40px'
                                        }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '12px',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        color: previewChannel === 'whatsapp' ? '#22c55e' : previewChannel === 'sms' ? '#3b82f6' : '#f97316'
                                    }}>
                                        <i className={previewChannel === 'whatsapp' ? "fab fa-whatsapp" : previewChannel === 'sms' ? "fas fa-comment-alt" : "fas fa-envelope"}></i>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: scheduleFollowUp ? '16px' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        background: scheduleFollowUp ? '#dbeafe' : '#f1f5f9',
                                        color: scheduleFollowUp ? '#2563eb' : '#94a3b8'
                                    }}>
                                        <i className="fas fa-calendar-alt"></i>
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>Schedule Next Follow-up?</span>
                                </div>
                                <label className="chk-toggle" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                                    <input type="checkbox" checked={scheduleFollowUp} onChange={(e) => setScheduleFollowUp(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: scheduleFollowUp ? '#3b82f6' : '#cbd5e1', borderRadius: '34px', transition: '.4s'
                                    }}></span>
                                    <span style={{
                                        position: 'absolute', content: '""', height: '16px', width: '16px', left: scheduleFollowUp ? '20px' : '4px', bottom: '3px',
                                        backgroundColor: 'white', borderRadius: '50%', transition: '.4s'
                                    }}></span>
                                </label>
                            </div>

                            {scheduleFollowUp && (
                                <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={labelStyle}>Action Type</label>
                                        <select name="nextActionType" value={formData.nextActionType} onChange={handleChange} style={inputStyle(false)}>
                                            {masterFields?.followUpActions?.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Date <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="date" name="nextActionDate" value={formData.nextActionDate} onChange={handleChange} style={inputStyle(errors.nextActionDate)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Time <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="time" name="nextActionTime" value={formData.nextActionTime} onChange={handleChange} style={inputStyle(errors.nextActionTime)} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <label style={labelStyle}>Additional Notes</label>
                            <textarea name="feedback" value={formData.feedback} onChange={handleChange} style={{ ...inputStyle(false), height: '60px' }} placeholder="Any other details..." />
                        </div>
                    </div>

                    <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                        <button onClick={handleSubmit} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700 }}>Save & Update</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default InventoryFeedbackModal;
