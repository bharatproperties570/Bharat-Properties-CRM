import { useState, useEffect, useMemo } from 'react';
import { useAutomatedActions } from '../context/AutomatedActionsContext';
import { useTriggers } from '../context/TriggersContext';
import { emailTemplates } from '../constants/templates';
import { api, socialAPI, systemSettingsAPI } from '../utils/api';
import whatsappService from '../services/whatsappService';
import smsService from '../services/smsService';

const CreateAutomatedActionModal = ({ isOpen, onClose, editData }) => {
    const { addAction, updateAction } = useAutomatedActions();
    const { triggers = [] } = useTriggers();
    
    const [waTemplates, setWaTemplates] = useState([]);
    const [smsTemplatesList, setSmsTemplatesList] = useState([]);
    const [emailTemplatesList, setEmailTemplatesList] = useState(emailTemplates || []);
    const [rcsTemplatesList, setRcsTemplatesList] = useState([]);

    // 🎯 Target Audience State (Exact Match to Deal Broadcast Marketing Form)
    const [activeAudienceTab, setActiveAudienceTab] = useState('matched_leads'); // 'matched_leads' | 'broker' | 'contact' | 'wa_group'
    const [brokerGroups, setBrokerGroups] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [waGroups, setWaGroups] = useState([]);
    const [loadingAudienceData, setLoadingAudienceData] = useState(false);
    const [waGroupSearch, setWaGroupSearch] = useState('');

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

    // 🚀 Load live Audience groups (Broker Groups, Contact Groups, WhatsApp Web Groups)
    useEffect(() => {
        if (!isOpen) return;
        const fetchAudienceData = async () => {
            setLoadingAudienceData(true);
            try {
                const [bgRes, cgRes, accRes] = await Promise.all([
                    api.get('/company-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    api.get('/contact-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    whatsappService.getAccounts().catch(() => ({ data: [] }))
                ]);

                setBrokerGroups(bgRes.data?.data || []);
                setContactGroups(cgRes.data?.data || []);

                const accounts = accRes.data || [];
                const baileysAcc = accounts.find(a => a.provider === 'baileys' || a.accountType === 'baileys') || accounts[0];
                if (baileysAcc) {
                    const bId = baileysAcc.id || baileysAcc._id;
                    const gRes = await socialAPI.getBaileysGroups(bId).catch(() => ({ data: [] }));
                    if (gRes && gRes.success) {
                        setWaGroups(gRes.data || []);
                    }
                }
            } catch (err) {
                console.warn('[CreateAutomatedActionModal] Failed to load audience data', err);
            } finally {
                setLoadingAudienceData(false);
            }
        };
        fetchAudienceData();
    }, [isOpen]);

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
            channels: { whatsapp: true, sms: false, email: false, rcs: false },
            templates: { whatsapp: '', sms: '', email: '', rcs: '' }
        },
        audienceConfig: {
            // 1. Matched Leads
            includeMatchedBuyers: true,
            matchedLeadFilter: 'all', // 'all' | 'preferred'
            minMatchScore: 75,

            // 2. Broker Groups
            sendToBrokerGroups: true,
            allBrokerGroups: true,
            selectedGroups: [],
            groupFilter: 'all', // 'all' | 'bna_only'

            // 3. Contact Groups
            includeContactGroups: true,
            allContactGroups: true,
            selectedContactGroups: [],
            includeInvestorContacts: false,
            contactTag: 'Investor',

            // 4. WhatsApp Web Groups
            includeWaGroups: true,
            allWaGroups: false,
            selectedWaGroups: [],

            // Transport & Rate Limiting
            throttleSeconds: 4,
            whatsappMode: 'baileys' // 'baileys' (WhatsApp Web) or 'cloud_api' (Meta)
        },
        delay: {
            isActive: false,
            amount: 0,
            unit: 'minutes',
            relativeToField: 'createdAt'
        },
        rollbackPolicy: 'Manual'
    });

    useEffect(() => {
        if (editData) {
            setFormData({
                ...editData,
                notificationConfig: editData.notificationConfig || {
                    channels: { whatsapp: true, sms: false, email: false, rcs: false },
                    templates: { whatsapp: '', sms: '', email: '', rcs: '' }
                },
                audienceConfig: {
                    includeMatchedBuyers: editData.audienceConfig?.includeMatchedBuyers ?? true,
                    matchedLeadFilter: editData.audienceConfig?.matchedLeadFilter || 'all',
                    minMatchScore: editData.audienceConfig?.minMatchScore ?? 75,
                    sendToBrokerGroups: editData.audienceConfig?.sendToBrokerGroups ?? true,
                    allBrokerGroups: editData.audienceConfig?.allBrokerGroups ?? (editData.audienceConfig?.selectedGroups?.length ? false : true),
                    selectedGroups: editData.audienceConfig?.selectedGroups || [],
                    groupFilter: editData.audienceConfig?.groupFilter || 'all',
                    includeContactGroups: editData.audienceConfig?.includeContactGroups ?? true,
                    allContactGroups: editData.audienceConfig?.allContactGroups ?? (editData.audienceConfig?.selectedContactGroups?.length ? false : true),
                    selectedContactGroups: editData.audienceConfig?.selectedContactGroups || [],
                    includeInvestorContacts: editData.audienceConfig?.includeInvestorContacts ?? false,
                    contactTag: editData.audienceConfig?.contactTag || 'Investor',
                    includeWaGroups: editData.audienceConfig?.includeWaGroups ?? true,
                    allWaGroups: editData.audienceConfig?.allWaGroups ?? false,
                    selectedWaGroups: editData.audienceConfig?.selectedWaGroups || [],
                    throttleSeconds: editData.audienceConfig?.throttleSeconds || 4,
                    whatsappMode: editData.audienceConfig?.whatsappMode || 'baileys'
                },
                delay: editData.delay || {
                    isActive: false,
                    amount: 0,
                    unit: 'minutes',
                    relativeToField: 'createdAt'
                }
            });
            const keys = Object.keys(editData.fieldMapping || {});
            if (keys.length > 0) {
                setFieldKey(keys[0]);
                setFieldVal(editData.fieldMapping[keys[0]]);
            }
        }
    }, [editData]);

    // ── Filtered WhatsApp Groups by Search Query ──
    const filteredWaGroups = useMemo(() => {
        if (!waGroupSearch.trim()) return waGroups;
        const q = waGroupSearch.toLowerCase();
        return waGroups.filter(g => (g.subject || g.name || '').toLowerCase().includes(q));
    }, [waGroups, waGroupSearch]);

    // ── Live Audience Reach & Deduplicated Member Count Engine ──
    const audienceStats = useMemo(() => {
        const aud = formData.audienceConfig || {};

        // 1. Broker Members Count
        let brokerCount = 0;
        if (aud.sendToBrokerGroups) {
            if (aud.allBrokerGroups || !aud.selectedGroups || aud.selectedGroups.length === 0) {
                brokerCount = brokerGroups.reduce((sum, g) => sum + (Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0)) || 0), 0);
            } else {
                const bSet = new Set();
                let fallback = 0;
                aud.selectedGroups.forEach(gid => {
                    const g = brokerGroups.find(bg => String(bg._id) === String(gid));
                    if (g?.memberIds?.length > 0) {
                        g.memberIds.forEach(id => bSet.add(String(id)));
                    } else {
                        fallback += (Number(g?.memberCount) || 0);
                    }
                });
                brokerCount = bSet.size > 0 ? bSet.size : fallback;
            }
        }

        // 2. Contact Members Count
        let contactCount = 0;
        if (aud.includeContactGroups) {
            if (aud.allContactGroups || !aud.selectedContactGroups || aud.selectedContactGroups.length === 0) {
                contactCount = contactGroups.reduce((sum, g) => sum + (Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0)) || 0), 0);
            } else {
                const cSet = new Set();
                let fallback = 0;
                aud.selectedContactGroups.forEach(gid => {
                    const g = contactGroups.find(cg => String(cg._id) === String(gid));
                    if (g?.memberIds?.length > 0) {
                        g.memberIds.forEach(id => cSet.add(String(id)));
                    } else {
                        fallback += (Number(g?.memberCount) || 0);
                    }
                });
                contactCount = cSet.size > 0 ? cSet.size : fallback;
            }
        }

        // 3. WhatsApp Groups Count & Participants
        let waGroupsCount = 0;
        let waParticipantsCount = 0;
        if (aud.includeWaGroups) {
            if (aud.allWaGroups) {
                waGroupsCount = waGroups.length;
                waParticipantsCount = waGroups.reduce((sum, g) => sum + (Number(g.participantsCount) || 1), 0);
            } else {
                waGroupsCount = (aud.selectedWaGroups || []).length;
                (aud.selectedWaGroups || []).forEach(jid => {
                    const g = waGroups.find(wg => String(wg.id || wg.jid) === String(jid));
                    waParticipantsCount += (Number(g?.participantsCount) || 1);
                });
            }
        }

        const totalDirectRecipients = brokerCount + contactCount + waGroupsCount;
        const totalAudienceReach = brokerCount + contactCount + waParticipantsCount;

        return {
            brokerCount,
            contactCount,
            waGroupsCount,
            waParticipantsCount,
            totalDirectRecipients,
            totalAudienceReach
        };
    }, [formData.audienceConfig, brokerGroups, contactGroups, waGroups]);

    if (!isOpen) return null;

    const modules = ['Leads', 'Contacts', 'Activities', 'Communication', 'Inventory', 'Deals', 'Post Sale'];

    // Safety Restrictions Map for UI
    const restrictionMap = {
        Inventory: ['update_field', 'lock_inventory', 'unlock_inventory', 'broadcast_deal'],
        Deals: ['update_field', 'send_notification', 'create_record', 'run_ai_lead_match_campaign', 'broadcast_deal'],
        Leads: ['update_field', 'create_record', 'add_tag', 'send_notification', 'auto_match_dispatch', 'broadcast_deal'],
        leads: ['update_field', 'create_record', 'add_tag', 'send_notification', 'auto_match_dispatch', 'broadcast_deal'],
        Activities: ['update_field', 'create_record'],
        Other: ['update_field', 'send_notification', 'create_record', 'auto_match_dispatch', 'broadcast_deal']
    };

    const actionTypes = [
        { value: 'broadcast_deal', label: 'Broadcast Deal (Omnichannel BNA)' },
        { value: 'update_field', label: 'Update Field' },
        { value: 'create_record', label: 'Create Record' },
        { value: 'add_tag', label: 'Add/Remove Tag' },
        { value: 'send_notification', label: 'Send Notification' },
        { value: 'run_ai_lead_match_campaign', label: 'Run AI Lead Match Campaign' },
        { value: 'auto_match_dispatch', label: 'Auto-Dispatch Matched Deals' },
        { value: 'lock_inventory', label: 'Lock Inventory' },
        { value: 'unlock_inventory', label: 'Unlock Inventory' }
    ];

    const handleSave = () => {
        const payload = { ...formData };
        if (payload.actionType === 'update_field' && fieldKey) {
            payload.fieldMapping = { [fieldKey]: fieldVal };
        }
        if (editData && (editData._id || editData.id) && updateAction) {
            updateAction(editData._id || editData.id, payload);
        } else {
            addAction(payload);
        }
        onClose();
    };

    const isActionAllowed = (type) => {
        const allowed = restrictionMap[formData.targetModule] || restrictionMap.Other;
        return allowed.includes(type);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ background: '#fff', width: formData.actionType === 'broadcast_deal' ? '760px' : '600px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
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

                    {formData.actionType === 'broadcast_deal' && (
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', marginBottom: '16px' }}>
                                <i className="fas fa-bullhorn" style={{ color: '#2563eb', fontSize: '1.1rem' }}></i>
                                <div>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>Deal Marketing Broadcast (Omnichannel BNA)</span>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                        Automatically package and broadcast new/updated verified deal details across broker groups, matched buyers, and investors.
                                    </p>
                                </div>
                            </div>

                            {/* Section 1: Audience Selection (Identical to Deal Broadcast Marketing Form) */}
                            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                {/* Header with Live Total Audience Reach Pill & Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 900, color: '#334155', letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="fas fa-bullseye" style={{ color: '#4f46e5', fontSize: '13px' }}></i>
                                            TARGET AUDIENCE
                                        </label>
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: 800, padding: '3px 9px', borderRadius: '12px',
                                            background: audienceStats.totalAudienceReach > 0 ? '#dcfce7' : '#f1f5f9',
                                            color: audienceStats.totalAudienceReach > 0 ? '#15803d' : '#64748b',
                                            border: audienceStats.totalAudienceReach > 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0'
                                        }}>
                                            <i className="fas fa-bullseye" style={{ marginRight: '5px' }}></i>
                                            {audienceStats.totalAudienceReach} Audience Reach ({audienceStats.totalDirectRecipients} Direct)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {activeAudienceTab === 'matched_leads' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        audienceConfig: {
                                                            ...formData.audienceConfig,
                                                            matchedLeadFilter: formData.audienceConfig?.matchedLeadFilter === 'preferred' ? 'all' : 'preferred',
                                                            minMatchScore: formData.audienceConfig?.matchedLeadFilter === 'preferred' ? 70 : 80
                                                        }
                                                    })}
                                                    style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                >
                                                    {formData.audienceConfig?.matchedLeadFilter === 'preferred' ? '⭐ Preferred Active' : '⭐ Filter Preferred (≥80%)'}
                                                </button>
                                                <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>|</span>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (activeAudienceTab === 'matched_leads') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeMatchedBuyers: true }
                                                    });
                                                }
                                                if (activeAudienceTab === 'broker') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, sendToBrokerGroups: true, allBrokerGroups: true, selectedGroups: brokerGroups.map(g => g._id) }
                                                    });
                                                }
                                                if (activeAudienceTab === 'contact') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeContactGroups: true, allContactGroups: true, selectedContactGroups: contactGroups.map(g => g._id) }
                                                    });
                                                }
                                                if (activeAudienceTab === 'wa_group') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeWaGroups: true, allWaGroups: true, selectedWaGroups: waGroups.map(g => g.id) }
                                                    });
                                                }
                                            }}
                                            style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                        >
                                            Select All
                                        </button>
                                        <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>|</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (activeAudienceTab === 'matched_leads') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeMatchedBuyers: false }
                                                    });
                                                }
                                                if (activeAudienceTab === 'broker') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, allBrokerGroups: false, selectedGroups: [] }
                                                    });
                                                }
                                                if (activeAudienceTab === 'contact') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, allContactGroups: false, selectedContactGroups: [] }
                                                    });
                                                }
                                                if (activeAudienceTab === 'wa_group') {
                                                    setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, allWaGroups: false, selectedWaGroups: [] }
                                                    });
                                                }
                                            }}
                                            style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                {/* 4 Audience Segment Tabs (Exact match to Deal Broadcast Modal) */}
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px',
                                    borderBottom: '1px solid #e2e8f0', paddingBottom: '8px'
                                }}>
                                    {/* Tab 1: Matched Leads */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveAudienceTab('matched_leads')}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 800,
                                            background: activeAudienceTab === 'matched_leads' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#f8fafc',
                                            color: activeAudienceTab === 'matched_leads' ? '#fff' : '#64748b',
                                            border: activeAudienceTab === 'matched_leads' ? 'none' : '1px solid #e2e8f0',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-bullseye"></i>
                                        <span>Matched Leads</span>
                                        <span style={{
                                            fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                            background: activeAudienceTab === 'matched_leads' ? 'rgba(255,255,255,0.25)' : (formData.audienceConfig?.includeMatchedBuyers ? '#fef3c7' : '#e2e8f0'),
                                            color: activeAudienceTab === 'matched_leads' ? '#fff' : (formData.audienceConfig?.includeMatchedBuyers ? '#92400e' : '#475569')
                                        }}>
                                            {formData.audienceConfig?.includeMatchedBuyers ? (formData.audienceConfig?.matchedLeadFilter === 'preferred' ? '⭐ Preferred' : 'Active') : 'Off'}
                                        </span>
                                    </button>

                                    {/* Tab 2: Broker Groups */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveAudienceTab('broker')}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 800,
                                            background: activeAudienceTab === 'broker' ? '#4f46e5' : '#f8fafc',
                                            color: activeAudienceTab === 'broker' ? '#fff' : '#64748b',
                                            border: activeAudienceTab === 'broker' ? 'none' : '1px solid #e2e8f0',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-handshake"></i>
                                        <span>Brokers</span>
                                        <span style={{
                                            fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                            background: activeAudienceTab === 'broker' ? 'rgba(255,255,255,0.25)' : (formData.audienceConfig?.sendToBrokerGroups ? '#e0e7ff' : '#e2e8f0'),
                                            color: activeAudienceTab === 'broker' ? '#fff' : (formData.audienceConfig?.sendToBrokerGroups ? '#3730a3' : '#475569')
                                        }}>
                                            {formData.audienceConfig?.sendToBrokerGroups ? (formData.audienceConfig?.allBrokerGroups ? `All (${audienceStats.brokerCount})` : `${formData.audienceConfig?.selectedGroups?.length || 0}G`) : 'Off'}
                                        </span>
                                    </button>

                                    {/* Tab 3: Contact Groups */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveAudienceTab('contact')}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 800,
                                            background: activeAudienceTab === 'contact' ? '#10b981' : '#f8fafc',
                                            color: activeAudienceTab === 'contact' ? '#fff' : '#64748b',
                                            border: activeAudienceTab === 'contact' ? 'none' : '1px solid #e2e8f0',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-users"></i>
                                        <span>Contacts</span>
                                        <span style={{
                                            fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                            background: activeAudienceTab === 'contact' ? 'rgba(255,255,255,0.25)' : (formData.audienceConfig?.includeContactGroups ? '#dcfce7' : '#e2e8f0'),
                                            color: activeAudienceTab === 'contact' ? '#fff' : (formData.audienceConfig?.includeContactGroups ? '#166534' : '#475569')
                                        }}>
                                            {formData.audienceConfig?.includeContactGroups ? (formData.audienceConfig?.allContactGroups ? `All (${audienceStats.contactCount})` : `${formData.audienceConfig?.selectedContactGroups?.length || 0}G`) : 'Off'}
                                        </span>
                                    </button>

                                    {/* Tab 4: WA Groups */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveAudienceTab('wa_group')}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 800,
                                            background: activeAudienceTab === 'wa_group' ? '#059669' : '#f8fafc',
                                            color: activeAudienceTab === 'wa_group' ? '#fff' : '#64748b',
                                            border: activeAudienceTab === 'wa_group' ? 'none' : '1px solid #e2e8f0',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fab fa-whatsapp"></i>
                                        <span>WA Groups</span>
                                        <span style={{
                                            fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                            background: activeAudienceTab === 'wa_group' ? 'rgba(255,255,255,0.25)' : (formData.audienceConfig?.includeWaGroups ? '#dcfce7' : '#e2e8f0'),
                                            color: activeAudienceTab === 'wa_group' ? '#fff' : (formData.audienceConfig?.includeWaGroups ? '#166534' : '#475569')
                                        }}>
                                            {formData.audienceConfig?.includeWaGroups ? (formData.audienceConfig?.allWaGroups ? `All (${waGroups.length}G)` : `${formData.audienceConfig?.selectedWaGroups?.length || 0}G`) : 'Off'}
                                        </span>
                                    </button>
                                </div>

                                {/* ── Tab Content 0: Matched Leads (AI Intent Matching) ── */}
                                {activeAudienceTab === 'matched_leads' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#92400e', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.audienceConfig?.includeMatchedBuyers ?? true}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeMatchedBuyers: e.target.checked }
                                                    })}
                                                    style={{ accentColor: '#d97706', width: '16px', height: '16px' }}
                                                />
                                                <span>Enable AI Deal-to-Lead Matching Engine</span>
                                            </label>
                                            <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>Dynamic Auto-Dispatch</span>
                                        </div>

                                        {formData.audienceConfig?.includeMatchedBuyers && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px' }}>
                                                {/* Sub-bar: Filter Pills */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Match Filter:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({
                                                            ...formData,
                                                            audienceConfig: { ...formData.audienceConfig, matchedLeadFilter: 'all' }
                                                        })}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 800,
                                                            border: (formData.audienceConfig?.matchedLeadFilter || 'all') === 'all' ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                                                            background: (formData.audienceConfig?.matchedLeadFilter || 'all') === 'all' ? '#e0e7ff' : 'transparent',
                                                            color: (formData.audienceConfig?.matchedLeadFilter || 'all') === 'all' ? '#3730a3' : '#64748b',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        All Verified Matches
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({
                                                            ...formData,
                                                            audienceConfig: { ...formData.audienceConfig, matchedLeadFilter: 'preferred', minMatchScore: Math.max(75, formData.audienceConfig?.minMatchScore || 80) }
                                                        })}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 800,
                                                            border: formData.audienceConfig?.matchedLeadFilter === 'preferred' ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                                                            background: formData.audienceConfig?.matchedLeadFilter === 'preferred' ? '#fef3c7' : 'transparent',
                                                            color: formData.audienceConfig?.matchedLeadFilter === 'preferred' ? '#92400e' : '#64748b',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ⭐ High / Preferred ≥ 75%
                                                    </button>
                                                </div>

                                                {/* Score Slider */}
                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                                        <span>Minimum Match Score Threshold</span>
                                                        <span style={{ color: '#2563eb', fontWeight: 800, fontSize: '0.85rem' }}>{formData.audienceConfig?.minMatchScore || 75}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="50" max="100" step="5"
                                                        value={formData.audienceConfig?.minMatchScore || 75}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            audienceConfig: { ...formData.audienceConfig, minMatchScore: Number(e.target.value) }
                                                        })}
                                                        style={{ width: '100%', accentColor: '#2563eb' }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
                                                        <span>50% (Broad reach)</span>
                                                        <span>75% (High intent)</span>
                                                        <span>100% (Exact match only)</span>
                                                    </div>
                                                </div>

                                                {/* Informational Callout */}
                                                <div style={{ display: 'flex', gap: '8px', background: '#f0f9ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                                    <i className="fas fa-info-circle" style={{ color: '#0284c7', fontSize: '14px', marginTop: '2px' }}></i>
                                                    <div style={{ fontSize: '0.74rem', color: '#0369a1', lineHeight: 1.45 }}>
                                                        <strong>AI Intent Engine:</strong> Whenever this business rule triggers on a deal, the system dynamically searches active buyer leads in the database whose requirement, budget range, and locality match this deal criteria.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Tab Content 1: Broker Groups ── */}
                                {activeAudienceTab === 'broker' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.audienceConfig?.sendToBrokerGroups ?? true}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, sendToBrokerGroups: e.target.checked }
                                                    })}
                                                    style={{ accentColor: '#4f46e5', width: '16px', height: '16px' }}
                                                />
                                                <span>WhatsApp Broker Community Groups</span>
                                            </label>
                                            <span style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 700 }}>
                                                {audienceStats.brokerCount} Total Brokers
                                            </span>
                                        </div>

                                        {formData.audienceConfig?.sendToBrokerGroups && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {/* Selection Mode Radios */}
                                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '4px' }}>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="brokerSelectionMode" 
                                                            checked={formData.audienceConfig?.allBrokerGroups && (formData.audienceConfig?.groupFilter || 'all') === 'all'}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allBrokerGroups: true, groupFilter: 'all', selectedGroups: [] }
                                                            })}
                                                        />
                                                        All Active Broker Groups
                                                    </label>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="brokerSelectionMode" 
                                                            checked={!formData.audienceConfig?.allBrokerGroups}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allBrokerGroups: false, selectedGroups: formData.audienceConfig?.selectedGroups?.length ? formData.audienceConfig.selectedGroups : brokerGroups.map(g => g._id) }
                                                            })}
                                                        />
                                                        Select Specific Groups
                                                    </label>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="brokerSelectionMode" 
                                                            checked={formData.audienceConfig?.groupFilter === 'bna_only'}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allBrokerGroups: true, groupFilter: 'bna_only', selectedGroups: [] }
                                                            })}
                                                        />
                                                        Filtered by Tag: "bna / broker"
                                                    </label>
                                                </div>

                                                {/* Group Chips Grid */}
                                                {!formData.audienceConfig?.allBrokerGroups && (
                                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '180px', overflowY: 'auto' }}>
                                                        {loadingAudienceData ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading broker groups...
                                                            </div>
                                                        ) : brokerGroups.length === 0 ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                No broker groups found. Create groups under Settings &gt; Groups.
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {brokerGroups.map(g => {
                                                                    const isSelected = (formData.audienceConfig?.selectedGroups || []).includes(g._id);
                                                                    const mCount = Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0));
                                                                    return (
                                                                        <button
                                                                            key={g._id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const prev = formData.audienceConfig?.selectedGroups || [];
                                                                                const next = isSelected ? prev.filter(id => id !== g._id) : [...prev, g._id];
                                                                                setFormData({
                                                                                    ...formData,
                                                                                    audienceConfig: { ...formData.audienceConfig, selectedGroups: next }
                                                                                });
                                                                            }}
                                                                            style={{
                                                                                padding: '6px 12px', borderRadius: '16px', fontSize: '0.74rem', fontWeight: 700,
                                                                                border: `1.5px solid ${isSelected ? (g.color || '#4f46e5') : '#cbd5e1'}`,
                                                                                background: isSelected ? (g.color || '#4f46e5') : '#fff',
                                                                                color: isSelected ? '#fff' : '#334155',
                                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                                transition: 'all 0.15s'
                                                                            }}
                                                                        >
                                                                            {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                                            <span>{g.name}</span>
                                                                            <span style={{
                                                                                fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px',
                                                                                background: isSelected ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                                                                color: isSelected ? '#fff' : '#64748b'
                                                                            }}>
                                                                                {mCount} {mCount === 1 ? 'Broker' : 'Brokers'}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Tab Content 2: Contact Groups ── */}
                                {activeAudienceTab === 'contact' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.audienceConfig?.includeContactGroups ?? true}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeContactGroups: e.target.checked }
                                                    })}
                                                    style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                                />
                                                <span>Send to Contact Groups</span>
                                            </label>
                                            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>
                                                {audienceStats.contactCount} Total Contacts
                                            </span>
                                        </div>

                                        {formData.audienceConfig?.includeContactGroups && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {/* Selection Mode Radios */}
                                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '4px' }}>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="contactSelectionMode" 
                                                            checked={Boolean(formData.audienceConfig?.allContactGroups)}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allContactGroups: true, selectedContactGroups: [] }
                                                            })}
                                                        />
                                                        All Contact Groups
                                                    </label>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="contactSelectionMode" 
                                                            checked={!formData.audienceConfig?.allContactGroups}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allContactGroups: false, selectedContactGroups: formData.audienceConfig?.selectedContactGroups?.length ? formData.audienceConfig.selectedContactGroups : contactGroups.map(g => g._id) }
                                                            })}
                                                        />
                                                        Select Specific Groups
                                                    </label>
                                                </div>

                                                {/* Contact Group Chips Grid */}
                                                {!formData.audienceConfig?.allContactGroups && (
                                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '180px', overflowY: 'auto' }}>
                                                        {loadingAudienceData ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading contact groups...
                                                            </div>
                                                        ) : contactGroups.length === 0 ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                No contact groups found. Create groups under Contacts &gt; Groups.
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {contactGroups.map(g => {
                                                                    const isSelected = (formData.audienceConfig?.selectedContactGroups || []).includes(g._id);
                                                                    const mCount = Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0));
                                                                    return (
                                                                        <button
                                                                            key={g._id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const prev = formData.audienceConfig?.selectedContactGroups || [];
                                                                                const next = isSelected ? prev.filter(id => id !== g._id) : [...prev, g._id];
                                                                                setFormData({
                                                                                    ...formData,
                                                                                    audienceConfig: { ...formData.audienceConfig, selectedContactGroups: next }
                                                                                });
                                                                            }}
                                                                            style={{
                                                                                padding: '6px 12px', borderRadius: '16px', fontSize: '0.74rem', fontWeight: 700,
                                                                                border: `1.5px solid ${isSelected ? (g.color || '#10b981') : '#cbd5e1'}`,
                                                                                background: isSelected ? (g.color || '#10b981') : '#fff',
                                                                                color: isSelected ? '#fff' : '#334155',
                                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                                transition: 'all 0.15s'
                                                                            }}
                                                                        >
                                                                            {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                                            <span>{g.name}</span>
                                                                            <span style={{
                                                                                fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px',
                                                                                background: isSelected ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                                                                color: isSelected ? '#fff' : '#64748b'
                                                                            }}>
                                                                                {mCount} {mCount === 1 ? 'Contact' : 'Contacts'}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Investor Tag Option */}
                                                <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginTop: '4px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: '#1e293b' }}>
                                                        <input 
                                                            type="checkbox"
                                                            checked={formData.audienceConfig?.includeInvestorContacts ?? false}
                                                            onChange={(e) => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, includeInvestorContacts: e.target.checked }
                                                            })}
                                                        />
                                                        <span>Also include Contacts Tagged as Investors / VIPs</span>
                                                    </label>
                                                    {formData.audienceConfig?.includeInvestorContacts && (
                                                        <div style={{ marginTop: '8px', paddingLeft: '24px' }}>
                                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Contact Tag Filter</label>
                                                            <input 
                                                                type="text"
                                                                value={formData.audienceConfig?.contactTag || 'Investor'}
                                                                placeholder="e.g. Investor, High Networth"
                                                                onChange={(e) => setFormData({
                                                                    ...formData,
                                                                    audienceConfig: { ...formData.audienceConfig, contactTag: e.target.value }
                                                                })}
                                                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem' }}
                             />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Tab Content 3: WhatsApp Web Groups (@g.us) ── */}
                                {activeAudienceTab === 'wa_group' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.audienceConfig?.includeWaGroups ?? true}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, includeWaGroups: e.target.checked }
                                                    })}
                                                    style={{ accentColor: '#059669', width: '16px', height: '16px' }}
                                                />
                                                <span>Send to WhatsApp Web Groups (@g.us)</span>
                                            </label>
                                            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                                                {audienceStats.waGroupsCount} Groups • {audienceStats.waParticipantsCount} Members
                                            </span>
                                        </div>

                                        {formData.audienceConfig?.includeWaGroups && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {/* Selection Mode Radios */}
                                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '4px' }}>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="waSelectionMode" 
                                                            checked={Boolean(formData.audienceConfig?.allWaGroups)}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allWaGroups: true, selectedWaGroups: [] }
                                                            })}
                                                        />
                                                        All Participating Groups ({waGroups.length})
                                                    </label>
                                                    <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                        <input 
                                                            type="radio" 
                                                            name="waSelectionMode" 
                                                            checked={!formData.audienceConfig?.allWaGroups}
                                                            onChange={() => setFormData({
                                                                ...formData,
                                                                audienceConfig: { ...formData.audienceConfig, allWaGroups: false, selectedWaGroups: formData.audienceConfig?.selectedWaGroups?.length ? formData.audienceConfig.selectedWaGroups : waGroups.map(g => g.id) }
                                                            })}
                                                        />
                                                        Select Specific Groups
                                                    </label>
                                                </div>

                                                {/* Search filter for WA Groups */}
                                                {!formData.audienceConfig?.allWaGroups && (
                                                    <input
                                                        type="text"
                                                        placeholder="Filter WhatsApp groups by name..."
                                                        value={waGroupSearch}
                                                        onChange={e => setWaGroupSearch(e.target.value)}
                                                        style={{
                                                            width: '100%', padding: '6px 10px', borderRadius: '8px', fontSize: '0.78rem',
                                                            border: '1px solid #cbd5e1', outline: 'none'
                                                        }}
                                                    />
                                                )}

                                                {/* WA Group Chips Grid */}
                                                {!formData.audienceConfig?.allWaGroups && (
                                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '180px', overflowY: 'auto' }}>
                                                        {loadingAudienceData ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading WhatsApp groups...
                                                            </div>
                                                        ) : filteredWaGroups.length === 0 ? (
                                                            <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                {waGroups.length === 0 ? 'No WhatsApp Web groups found. Please ensure WhatsApp Web is connected in Profile.' : 'No groups match your search.'}
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {filteredWaGroups.map(g => {
                                                                    const isSelected = (formData.audienceConfig?.selectedWaGroups || []).includes(g.id);
                                                                    return (
                                                                        <button
                                                                            key={g.id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const prev = formData.audienceConfig?.selectedWaGroups || [];
                                                                                const next = isSelected ? prev.filter(id => id !== g.id) : [...prev, g.id];
                                                                                setFormData({
                                                                                    ...formData,
                                                                                    audienceConfig: { ...formData.audienceConfig, selectedWaGroups: next }
                                                                                });
                                                                            }}
                                                                            style={{
                                                                                padding: '5px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 700,
                                                                                border: `1.5px solid ${isSelected ? '#10b981' : '#cbd5e1'}`,
                                                                                background: isSelected ? '#10b981' : '#fff',
                                                                                color: isSelected ? '#fff' : '#334155',
                                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                                                                maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                                            }}
                                                                        >
                                                                            <i className="fab fa-whatsapp" style={{ fontSize: '11px', color: isSelected ? '#fff' : '#10b981' }}></i>
                                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.subject || g.name || 'Group'}</span>
                                                                            <span style={{
                                                                                fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '8px',
                                                                                background: isSelected ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                                                                color: isSelected ? '#fff' : '#64748b'
                                                                            }}>
                                                                                {g.participantsCount || 1}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Omnichannel Channels */}
                            <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                                    <i className="fas fa-network-wired" style={{ color: '#10b981' }}></i> Active Channels
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                                    {[
                                        { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#059669' },
                                        { id: 'sms', label: 'SMS (DLT OTP/Transactional)', icon: 'fas fa-sms', color: '#2563eb' },
                                        { id: 'email', label: 'Email (Deal Bulletin)', icon: 'fas fa-envelope', color: '#dc2626' },
                                        { id: 'rcs', label: 'RCS Business Messaging', icon: 'fas fa-comment-dots', color: '#7c3aed' }
                                    ].map(ch => (
                                        <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: formData.notificationConfig?.channels?.[ch.id] ? '#f0fdf4' : '#fff' }}>
                                            <input 
                                                type="checkbox"
                                                checked={formData.notificationConfig?.channels?.[ch.id] || false}
                                                onChange={(e) => {
                                                    const newChannels = { ...(formData.notificationConfig?.channels || {}), [ch.id]: e.target.checked };
                                                    setFormData({
                                                        ...formData,
                                                        notificationConfig: { ...formData.notificationConfig, channels: newChannels }
                                                    });
                                                }}
                                            />
                                            <i className={ch.icon} style={{ color: ch.color }}></i>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{ch.label}</span>
                                        </label>
                                    ))}
                                </div>

                                {formData.notificationConfig?.channels?.whatsapp && (
                                    <div style={{ marginTop: '12px', padding: '10px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '6px' }}>WhatsApp Connection Mode:</span>
                                        <div style={{ display: 'flex', gap: '20px' }}>
                                            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#166534', fontWeight: 600 }}>
                                                <input 
                                                    type="radio"
                                                    name="whatsappMode"
                                                    value="baileys"
                                                    checked={(formData.audienceConfig?.whatsappMode || 'baileys') === 'baileys'}
                                                    onChange={() => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, whatsappMode: 'baileys' }
                                                    })}
                                                />
                                                WhatsApp Web (Supports Direct Broker Group JIDs)
                                            </label>
                                            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#166534', fontWeight: 600 }}>
                                                <input 
                                                    type="radio"
                                                    name="whatsappMode"
                                                    value="cloud_api"
                                                    checked={formData.audienceConfig?.whatsappMode === 'cloud_api'}
                                                    onChange={() => setFormData({
                                                        ...formData,
                                                        audienceConfig: { ...formData.audienceConfig, whatsappMode: 'cloud_api' }
                                                    })}
                                                />
                                                Meta WhatsApp Cloud API
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Template Selection */}
                            <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                                    <i className="fas fa-file-alt" style={{ color: '#8b5cf6' }}></i> Approved Message Templates
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {formData.notificationConfig?.channels?.whatsapp && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#059669' }}>
                                                <i className="fab fa-whatsapp"></i> WhatsApp Dynamic Template
                                            </label>
                                            <select 
                                                value={formData.notificationConfig?.templates?.whatsapp || ''}
                                                onChange={e => {
                                                    const newTpls = { ...(formData.notificationConfig?.templates || {}), whatsapp: e.target.value };
                                                    setFormData({
                                                        ...formData,
                                                        notificationConfig: { ...formData.notificationConfig, templates: newTpls }
                                                    });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid #10b981', borderRadius: '6px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Default / Smart Auto-Detect (`deal_broadcast`) --</option>
                                                <option value="deal_broadcast">deal_broadcast (Approved Omnichannel Format)</option>
                                                {waTemplates.filter(t => t.name !== 'deal_broadcast').map(t => (
                                                    <option key={t.id || t.name} value={t.name}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {formData.notificationConfig?.channels?.sms && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#2563eb' }}>
                                                <i className="fas fa-sms"></i> SMS Template / DLT Content
                                            </label>
                                            <select 
                                                value={formData.notificationConfig?.templates?.sms || ''}
                                                onChange={e => {
                                                    const newTpls = { ...(formData.notificationConfig?.templates || {}), sms: e.target.value };
                                                    setFormData({
                                                        ...formData,
                                                        notificationConfig: { ...formData.notificationConfig, templates: newTpls }
                                                    });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid #3b82f6', borderRadius: '6px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Default DLT Deal Alert --</option>
                                                {smsTemplatesList.map(t => (
                                                    <option key={t.id || t.name} value={t.name || t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {formData.notificationConfig?.channels?.email && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#dc2626' }}>
                                                <i className="fas fa-envelope"></i> Email Bulletin Template
                                            </label>
                                            <select 
                                                value={formData.notificationConfig?.templates?.email || ''}
                                                onChange={e => {
                                                    const newTpls = { ...(formData.notificationConfig?.templates || {}), email: e.target.value };
                                                    setFormData({
                                                        ...formData,
                                                        notificationConfig: { ...formData.notificationConfig, templates: newTpls }
                                                    });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Default Deal Bulletin HTML --</option>
                                                {emailTemplatesList.map(t => (
                                                    <option key={t.id || t.name} value={t.name || t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {formData.notificationConfig?.channels?.rcs && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: '#7c3aed' }}>
                                                <i className="fas fa-comment-dots"></i> RCS Rich Card Template
                                            </label>
                                            <select 
                                                value={formData.notificationConfig?.templates?.rcs || ''}
                                                onChange={e => {
                                                    const newTpls = { ...(formData.notificationConfig?.templates || {}), rcs: e.target.value };
                                                    setFormData({
                                                        ...formData,
                                                        notificationConfig: { ...formData.notificationConfig, templates: newTpls }
                                                    });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid #8b5cf6', borderRadius: '6px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Default Verified RCS Rich Card --</option>
                                                {rcsTemplatesList.map(t => (
                                                    <option key={t.id || t.name} value={t.name || t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Section 4: Anti-ban & Throttling */}
                            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                                        <i className="fas fa-shield-alt" style={{ marginRight: '6px', color: '#10b981' }}></i>
                                        Anti-Ban Jitter & Rate Limiting
                                    </span>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                                        Dispatches messages with staggered interval to prevent carrier & WhatsApp bans.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input 
                                        type="number"
                                        min="1" max="60"
                                        value={formData.audienceConfig?.throttleSeconds || 4}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            audienceConfig: { ...formData.audienceConfig, throttleSeconds: Math.max(1, Number(e.target.value)) }
                                        })}
                                        style={{ width: '60px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>seconds</span>
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

                    
                    {formData.actionType === 'auto_match_dispatch' && (
                        <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', marginBottom: '16px' }}>
                                <i className="fas fa-bullseye"></i>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Auto-Dispatch Deal Matches</span>
                            </div>
                            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#1e40af' }}>
                                When a Lead is created, this action will automatically run the 100-Point Match Engine and send the top Preferred Deals directly to the Lead via WhatsApp/Email.
                            </p>
                            
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>Active Channels</label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    {['whatsapp', 'email'].map(channel => (
                                        <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#1e3a8a' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={formData.configuration?.toggles?.[channel] || false}
                                                onChange={(e) => {
                                                    const newConfig = { ...formData.configuration };
                                                    if (!newConfig.toggles) newConfig.toggles = { whatsapp: true };
                                                    newConfig.toggles[channel] = e.target.checked;
                                                    setFormData({ ...formData, configuration: newConfig });
                                                }}
                                            />
                                            {channel.toUpperCase()}
                                        </label>
                                    ))}
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
