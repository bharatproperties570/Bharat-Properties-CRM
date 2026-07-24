import React, { useState, useMemo, useEffect } from 'react';
import api, { systemSettingsAPI } from '../../../utils/api.js';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';
import {
    STAGE_PIPELINE, STAGE_LABELS, flattenOutcomeMappings,
    getStageProbability
} from '../../../utils/stageEngine';
import {
    DEFAULT_AGING_RULES, computeStageDensity,
    detectCommissionLeakage, DEFAULT_STAGE_DENSITY_TARGETS
} from '../../../utils/agingEngine';
import { calculateGrossCommission, calculateNetRevenue } from '../../../utils/revenueEngine';

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const StageChip = ({ stage }) => {
    const stageInfo = STAGE_PIPELINE.find(s => s.label === stage) || STAGE_PIPELINE[0];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
            background: stageInfo.color + '18', color: stageInfo.color, border: `1px solid ${stageInfo.color}40`
        }}>
            <i className={`fas ${stageInfo.icon}`} style={{ fontSize: '9px' }} />
            {stage}
        </span>
    );
};

const StagePill = ({ stage, size = 'md' }) => {
    const info = STAGE_PIPELINE.find(s => s.label === stage);
    if (!info) return <span>{stage}</span>;
    const pad = size === 'lg' ? '8px 16px' : '4px 10px';
    const fs = size === 'lg' ? '13px' : '11px';
    return (
        <div style={{
            background: info.color + '20', border: `1px solid ${info.color}40`,
            borderRadius: '6px', padding: pad, display: 'flex', alignItems: 'center', gap: '6px'
        }}>
            <i className={`fas ${info.icon}`} style={{ color: info.color, fontSize: fs }} />
            <span style={{ color: info.color, fontWeight: 700, fontSize: fs }}>{info.label}</span>
        </div>
    );
};

const AVAILABLE_FORMS = [
    'Requirement Form',
    'Meetings Form',
    'Quotation Form',
    'Offer Form',
    'Booking Form',
    'KYC Form',
    'Site Visit Form'
];

const formatStatus = (type, val) => {
    if (type === 'Call' && val === 'Connected') return 'Answered';
    return val;
};

const MultiSelectForms = ({ selectedForms, onChange }) => {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {AVAILABLE_FORMS.map(form => {
                const isSelected = selectedForms.includes(form);
                return (
                    <button
                        key={form}
                        onClick={(e) => {
                            e.preventDefault();
                            if (isSelected) {
                                onChange(selectedForms.filter(f => f !== form));
                            } else {
                                onChange([...selectedForms, form]);
                            }
                        }}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '16px',
                            border: `1px solid ${isSelected ? '#6366f1' : '#e5e7eb'}`,
                            background: isSelected ? '#6366f115' : '#fff',
                            color: isSelected ? '#6366f1' : '#475569',
                            fontWeight: 600,
                            fontSize: '11px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isSelected && <i className="fas fa-check" style={{ marginRight: '4px' }} />}
                        {form}
                    </button>
                );
            })}
        </div>
    );
};

// ─────────────────────────────────────────────
// Add Override Rule Modal
// ─────────────────────────────────────────────

const AddRuleModal = ({ activityMasterFields, onSave, onClose }) => {
    const [activityType, setActivityType] = useState('');
    const [purpose, setPurpose] = useState('');
    const [status, setStatus] = useState('');
    const [outcome, setOutcome] = useState('');
    const [stage, setStage] = useState('Prospect');
    const [priority, setPriority] = useState('1');
    const [requiredForms, setRequiredForms] = useState([]);

    const activities = activityMasterFields?.activities || [];
    const purposes = activities.find(a => a.name === activityType)?.purposes || [];
    const outcomes = purposes.find(p => p.name === purpose)?.outcomes || [];

    const getStatusOptions = (type) => {
        if (type === 'Call')       return [{label:'Answered', value:'Connected'}, {label:'No Answer', value:'No Answer'}, {label:'Busy', value:'Busy'}, {label:'Wrong Number', value:'Wrong Number'}, {label:'Left Voicemail', value:'Left Voicemail'}];
        if (type === 'Meeting')    return [{label:'Conducted', value:'Conducted'}, {label:'Rescheduled', value:'Rescheduled'}, {label:'Cancelled', value:'Cancelled'}, {label:'No Show', value:'No Show'}];
        if (type === 'Site Visit') return [{label:'Conducted', value:'Conducted'}, {label:'Rescheduled', value:'Rescheduled'}, {label:'Cancelled', value:'Cancelled'}, {label:'Did Not Visit', value:'Did Not Visit'}];
        if (type === 'Email')      return [{label:'Sent', value:'Sent'}, {label:'Delivered', value:'Delivered'}, {label:'Read', value:'Read'}, {label:'Replied', value:'Replied'}, {label:'Bounced', value:'Bounced'}, {label:'Undelivered', value:'Undelivered'}];
        if (type)                  return [{label:'Completed', value:'Completed'}, {label:'Cancelled', value:'Cancelled'}];
        
        return [
            {label:'Completed', value:'Completed'}, {label:'Conducted', value:'Conducted'}, 
            {label:'Cancelled', value:'Cancelled'}, {label:'Rescheduled', value:'Rescheduled'}, 
            {label:'No Show', value:'No Show'}, {label:'Answered', value:'Connected'}, 
            {label:'No Answer', value:'No Answer'}, {label:'Busy', value:'Busy'}, 
            {label:'Wrong Number', value:'Wrong Number'}, {label:'Left Voicemail', value:'Left Voicemail'}, 
            {label:'Did Not Visit', value:'Did Not Visit'}, {label:'Sent', value:'Sent'}, 
            {label:'Delivered', value:'Delivered'}, {label:'Read', value:'Read'}, 
            {label:'Replied', value:'Replied'}, {label:'Bounced', value:'Bounced'}, 
            {label:'Undelivered', value:'Undelivered'}
        ];
    };


    const canSave = stage && (activityType || purpose || status || outcome);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '520px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: 0 }}>Add Override Rule</h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Override rules take priority over default outcome stages</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: '#64748b' }}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Activity */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Activity Type <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(leave blank = apply to all)</span>
                        </label>
                        <select value={activityType} onChange={e => { setActivityType(e.target.value); setPurpose(''); setOutcome(''); }}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
                            <option value="">— Any Activity —</option>
                            {activities.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* Purpose */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Purpose</label>
                        <select value={purpose} onChange={e => { setPurpose(e.target.value); setOutcome(''); }} disabled={!activityType}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', opacity: !activityType ? 0.5 : 1 }}>
                            <option value="">— Any Purpose —</option>
                            {purposes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Status */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Outcome Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} disabled={!activityType && !purpose}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', opacity: (!activityType && !purpose) ? 0.5 : 1 }}>
                            <option value="">— Any Status —</option>
                            {getStatusOptions(activityType).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>

                    {/* Outcome */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Outcome (Result)</label>
                        <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={!purpose}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', opacity: !purpose ? 0.5 : 1 }}>
                            <option value="">— Any Outcome —</option>
                            {outcomes.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Arrow indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                            {activityType || 'Any Activity'}{purpose ? ` → ${purpose}` : ''}{status ? ` → [${status}]` : ''}{outcome ? ` → ${outcome}` : ''}
                        </span>
                        <i className="fas fa-arrow-right" style={{ color: '#6366f1' }} />
                        <StageChip stage={stage} />
                    </div>

                    {/* Stage target */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Maps To Stage</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {STAGE_LABELS.map(s => (
                                <button key={s} onClick={() => setStage(s)} style={{
                                    padding: '6px 14px', borderRadius: '20px', border: '2px solid',
                                    borderColor: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color || '#6366f1') : '#e5e7eb',
                                    background: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color + '15' || '#f0f0ff') : '#fff',
                                    color: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color || '#6366f1') : '#6b7280',
                                    fontWeight: 700, fontSize: '12px', cursor: 'pointer'
                                }}>{s}</button>
                            ))}
                        </div>
                    </div>

                    {/* Forms & Priority Row */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Required Forms</label>
                            <MultiSelectForms selectedForms={requiredForms} onChange={setRequiredForms} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Priority</label>
                            <input type="number" min="1" value={priority} onChange={e => setPriority(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontWeight: 700 }} />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '32px', justifyContent: 'flex-end', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button disabled={!canSave} onClick={() => { onSave({
                        id: `override_${Date.now()}`,
                        activityType: activityType || '*',
                        purpose: purpose || '*',
                        status: status || '*',
                        outcome: outcome || '*',
                        stage,
                        priority: parseInt(priority) || 1,
                        requiredForms,
                        isActive: true
                    }); onClose(); }}
                        style={{ padding: '10px 24px', background: canSave ? '#6366f1' : '#e2e8f0', color: canSave ? '#fff' : '#94a3b8', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', boxShadow: canSave ? '0 4px 12px rgba(99,102,241,0.3)' : 'none' }}>
                        <i className="fas fa-check" style={{ marginRight: '8px' }} />
                        Save Override Rule
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Main StagePage Component
// ─────────────────────────────────────────────

const StagePage = () => {
    const {
        activityMasterFields, updateOutcomeRule,
        stageMappingRules, addStageMappingRule, updateStageMappingRule, deleteStageMappingRule,
        syncRules, updateSyncRule, addSyncRule, deleteSyncRule,
        sequenceConfig, updateSequenceConfig,
        stabilityLockConfig, updateStabilityLockConfig,
        agingRules, updateAgingRule,
        forecastConfig, updateForecastConfig,
        dealHealthConfig, updateDealHealthConfig,
        intentSignals, updateIntentSignal,
    } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('rules');
    const [search, setSearch] = useState('');
    const [filterActivity, setFilterActivity] = useState('');
    const [filterStage, setFilterStage] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [editingStageCell, setEditingStageCell] = useState(null);
    const [expandedRows, setExpandedRows] = useState({});

    const [analyticsData, setAnalyticsData] = useState({ leads: [], deals: [] });
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [coldStorageDays, setColdStorageDays] = useState(365);

    React.useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await systemSettingsAPI.getByKey('crm_cold_storage_days');
                if (res.success && res.data) {
                    setColdStorageDays(parseInt(res.data.value, 10) || 365);
                }
            } catch (e) {
                console.error("Failed to fetch cold storage config", e);
            }
        };
        fetchSettings();
    }, []);

    React.useEffect(() => {
        const fetchDensity = async () => {
            try {
                setLoadingAnalytics(true);
                const res = await api.analytics.getStageDensity('all');
                if (res.success) {
                    setAnalyticsData(res.data);
                }
            } catch (error) {
                console.error("Error fetching analytics:", error);
            } finally {
                setLoadingAnalytics(false);
            }
        };
        fetchDensity();
    }, []);

    const toggleRow = (stage) => setExpandedRows(prev => ({ ...prev, [stage]: !prev[stage] }));

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(n => ({ ...n, show: false })), 3000);
    };

    const handleSaveStabilityConfig = () => {
        showToast('Stability config saved successfully');
    };

    const handleSaveColdStorage = async (val) => {
        setColdStorageDays(val);
        try {
            await systemSettingsAPI.upsert('crm_cold_storage_days', { value: val.toString(), type: 'number' });
            showToast('Cold Storage setting saved successfully');
        } catch (e) {
            showToast('Failed to save Cold Storage setting', 'error');
        }
    };

    const allRows = useMemo(() => flattenOutcomeMappings(activityMasterFields), [activityMasterFields]);
    const filteredRows = useMemo(() => allRows.filter(row => {
        const q = search.toLowerCase();
        const matchSearch = !q || [row.activityType, row.purpose, row.outcome, row.stage].some(v => v.toLowerCase().includes(q));
        const matchActivity = !filterActivity || row.activityType === filterActivity;
        const matchStage = !filterStage || row.stage === filterStage;
        return matchSearch && matchActivity && matchStage;
    }), [allRows, search, filterActivity, filterStage]);

    const activityNames = [...new Set(allRows.map(r => r.activityType))];
    const stageCounts = useMemo(() => {
        const counts = {};
        STAGE_LABELS.forEach(s => counts[s] = 0);
        allRows.forEach(r => { counts[r.stage] = (counts[r.stage] || 0) + 1; });
        return counts;
    }, [allRows]);

    const tabs = [
        { id: 'rules', label: 'Rule Table', icon: 'fa-table' },
        { id: 'density', label: 'Stage Density', icon: 'fa-chart-bar' },
        { id: 'stability', label: 'Stability Lock', icon: 'fa-lock' },
        { id: 'sequence', label: 'Sequence Guard', icon: 'fa-project-diagram' },
        { id: 'aging', label: 'Ageing & Decay', icon: 'fa-hourglass-half' },
        { id: 'intent', label: 'Intent Signals', icon: 'fa-brain' },
        { id: 'forecast', label: 'Revenue Forecast', icon: 'fa-chart-line' },
        { id: 'health', label: 'Deal Health', icon: 'fa-heartbeat' },
        { id: 'sync', label: 'Lead↔Deal Sync', icon: 'fa-sync-alt' },
    ];

    return (
        <div style={{ flex: 1, height: '100%', background: '#f8fafc', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {notification.show && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(n => ({ ...n, show: false }))} />}
            {showAddModal && <AddRuleModal activityMasterFields={activityMasterFields} onClose={() => setShowAddModal(false)} onSave={rule => { addStageMappingRule(rule); showToast('Override rule added successfully'); }} />}

            {/* Page Header */}
            <div style={{ padding: '28px 32px 0', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-layer-group" style={{ color: '#fff', fontSize: '20px' }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', margin: 0 }}>Stage Computation Engine</h1>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '3px 0 0' }}>
                                Activity → Purpose → Outcome → Stage mapping · <strong style={{ color: '#ef4444' }}>{allRows.length}</strong> rules configured
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {/* Lock badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 12px' }} title="Stage fields are read-only. All transitions are driven by activities.">
                            <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '10px' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>Manual Editing: Disabled</span>
                        </div>
                        {/* Computed badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b98115', border: '1px solid #10b98140', borderRadius: '8px', padding: '6px 12px' }} title="Runs on every activity save">
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Auto-Compute: ON</span>
                        </div>
                        {activeTab === 'rules' && (
                            <button onClick={() => setShowAddModal(true)} style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-plus" />+ Override Rule
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            padding: '10px 20px', border: 'none', borderRadius: '8px 8px 0 0',
                            background: activeTab === tab.id ? '#f8fafc' : 'transparent',
                            borderBottom: activeTab === tab.id ? '3px solid #6366f1' : '3px solid transparent',
                            color: activeTab === tab.id ? '#6366f1' : '#6b7280',
                            fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '13px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '-1px'
                        }}>
                            <i className={`fas ${tab.icon}`} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── TAB 1: Rule Table ─── */}
            {activeTab === 'rules' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>

                    {/* How Stage is Computed Banner */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '24px' }}>
                        <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedRows(prev => ({ ...prev, logicBanner: prev.logicBanner === undefined ? true : !prev.logicBanner }))}>
                            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-info-circle" style={{ color: '#6366f1' }} /> How Stage Is Computed
                            </h3>
                            <i className={`fas fa-chevron-${(expandedRows.logicBanner === undefined || !expandedRows.logicBanner) ? 'down' : 'up'}`} style={{ color: '#94a3b8', fontSize: '12px' }} />
                        </div>
                        {(expandedRows.logicBanner === undefined || !expandedRows.logicBanner) ? null : (
                            <div style={{ padding: '16px 20px', display: 'flex', gap: '20px', background: '#fff' }}>
                                {[
                                    { step: '1', icon: 'fa-shield-alt', color: '#6366f1', label: 'Check Override Rules', desc: 'Admin-configured priority rules run first.' },
                                    { step: '2', icon: 'fa-map', color: '#f59e0b', label: 'Default Mapping', desc: 'If no override, the outcome\'s default stage is used.' },
                                    { step: '3', icon: 'fa-star', color: '#94a3b8', label: 'Fallback', desc: 'If no mapping is found, defaults to "New".' },
                                ].map(step => (
                                    <div key={step.step} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1 }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: step.color + '15', border: `2px solid ${step.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: step.color }}>{step.step}</span>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className={`fas ${step.icon}`} style={{ color: step.color, fontSize: '10px' }} />
                                                {step.label}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', lineHeight: 1.4 }}>{step.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Flow diagram Mini-Dashboard */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', padding: '24px', overflow: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                            {STAGE_PIPELINE.slice(0, -2).map((stage, idx) => (
                                <React.Fragment key={stage.id}>
                                    <div style={{
                                        flex: 1,
                                        padding: '10px 16px', borderRadius: '8px', background: stage.color + '15',
                                        border: `1.5px solid ${stage.color}40`, textAlign: 'center', minWidth: '80px'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: stage.color }}>{stage.label}</div>
                                        <div style={{ fontSize: '10px', color: stage.color, opacity: 0.7 }}>{stageCounts[stage.label] || 0} outcomes</div>
                                    </div>
                                    {idx < STAGE_PIPELINE.length - 3 && (
                                        <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', flexShrink: 0 }} />
                                    )}
                                </React.Fragment>
                            ))}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '80px' }}>
                                {STAGE_PIPELINE.slice(-2).filter(Boolean).map(stage => (
                                    <div key={stage.id} style={{
                                        padding: '8px 14px', borderRadius: '8px', background: (stage.color || '#94a3b8') + '15',
                                        border: `1.5px solid ${stage.color || '#94a3b8'}40`, textAlign: 'center', width: '100%'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: stage.color || '#94a3b8' }}>{stage.label}</div>
                                        <div style={{ fontSize: '10px', color: stage.color || '#94a3b8', opacity: 0.7 }}>{stageCounts[stage.label] || 0} outcomes</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Override Rules (Explicit) */}
                    {stageMappingRules.length > 0 && (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(90deg, #6366f110, #fff)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-shield-alt" style={{ color: '#6366f1' }} />
                                <span style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>Override Rules</span>
                                <span style={{ background: '#6366f120', color: '#6366f1', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                                    {stageMappingRules.length} active
                                </span>
                                <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '4px' }}>· These take priority over default mappings</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Priority</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Activity</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Purpose</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Outcome</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Required Forms</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>→ Stage</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Active</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...stageMappingRules].sort((a, b) => (a.priority || 99) - (b.priority || 99)).map(rule => (
                                        <tr key={rule.id} style={{ borderTop: '1px solid #f1f5f9', opacity: rule.isActive ? 1 : 0.5 }}>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ background: '#f1f5f9', borderRadius: '4px', padding: '2px 8px', fontWeight: 700, color: '#374151' }}>#{rule.priority}</span>
                                            </td>
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#374151' }}>{rule.activityType || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Any</span>}</td>
                                            <td style={{ padding: '10px 16px', color: '#6b7280' }}>{rule.purpose || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Any</span>}</td>
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>
                                                {rule.outcome || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Any</span>}
                                                {rule.status && rule.status !== '*' && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, marginTop: '4px', background: '#f1f5f9', display: 'inline-block', padding: '2px 6px', borderRadius: '4px' }}>
                                                        <i className="fas fa-info-circle" style={{ marginRight: '4px' }} />{formatStatus(rule.activityType, rule.status)}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {editingStageCell === `override-${rule.id}-forms` ? (
                                                    <div style={{ position: 'relative' }}>
                                                        <MultiSelectForms 
                                                            selectedForms={rule.requiredForms || []}
                                                            onChange={forms => updateStageMappingRule(rule.id, { requiredForms: forms })} 
                                                        />
                                                        <button 
                                                            onClick={() => setEditingStageCell(null)}
                                                            style={{ marginTop: '8px', padding: '4px 8px', fontSize: '11px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                                                        >
                                                            Done
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', cursor: 'pointer', minHeight: '24px', alignItems: 'center' }} onClick={() => setEditingStageCell(`override-${rule.id}-forms`)}>
                                                        {rule.requiredForms?.length > 0 ? rule.requiredForms.map((f, i) => (
                                                            <span key={i} style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{f}</span>
                                                        )) : <span style={{ color: '#cbd5e1', fontSize: '11px', fontStyle: 'italic' }}>None</span>}
                                                        <i className="fas fa-pencil-alt" style={{ color: '#cbd5e1', fontSize: '10px', marginLeft: '4px' }} />
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {editingStageCell === `override-${rule.id}-stage` ? (
                                                    <select
                                                        autoFocus
                                                        defaultValue={rule.stage}
                                                        onBlur={e => { updateStageMappingRule(rule.id, { stage: e.target.value }); setEditingStageCell(null); showToast(`Override Rule updated successfully`); }}
                                                        onChange={e => { updateStageMappingRule(rule.id, { stage: e.target.value }); }}
                                                        style={{ padding: '5px 8px', border: '2px solid #6366f1', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}
                                                    >
                                                        {STAGE_LABELS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setEditingStageCell(`override-${rule.id}-stage`)} title="Click to edit">
                                                        <StageChip stage={rule.stage} />
                                                        <i className="fas fa-pencil-alt" style={{ color: '#cbd5e1', fontSize: '10px' }} />
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                                    <input type="checkbox" checked={rule.isActive} onChange={e => updateStageMappingRule(rule.id, { isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: rule.isActive ? '#10b981' : '#cbd5e1', borderRadius: '34px', transition: '.3s' }} />
                                                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: rule.isActive ? '19px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '.3s' }} />
                                                </label>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <button onClick={() => { if (window.confirm('Delete this override rule?')) { deleteStageMappingRule(rule.id); showToast('Rule deleted'); } }}
                                                    style={{ border: 'none', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>
                                                    <i className="fas fa-trash" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Default Mappings Table */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <i className="fas fa-table" style={{ color: '#6b7280' }} />
                                <span style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>Default Outcome Mappings</span>
                            </div>
                            {/* Filters */}
                            <div style={{ position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: '12px' }} />
                                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                                    style={{ padding: '7px 12px 7px 30px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', width: '180px' }} />
                            </div>
                            <select value={filterActivity} onChange={e => setFilterActivity(e.target.value)}
                                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }}>
                                <option value="">All Activities</option>
                                {activityNames.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }}>
                                <option value="">All Stages</option>
                                {STAGE_LABELS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Activity</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Purpose</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Outcome</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Required Forms</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>→ Stage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, idx) => {
                                    const key = `${row.activityType}|${row.purpose}|${row.outcome}`;
                                    const isEditing = editingStageCell === key;
                                    return (
                                        <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ background: '#3b82f610', color: '#3b82f6', borderRadius: '6px', padding: '3px 8px', fontWeight: 700, fontSize: '12px' }}>
                                                    {row.activityType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px', color: '#374151' }}>{row.purpose}</td>
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>
                                                {row.outcome}
                                                {row.status && row.status !== '*' && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, marginTop: '4px', background: '#f1f5f9', display: 'inline-block', padding: '2px 6px', borderRadius: '4px' }}>
                                                        <i className="fas fa-info-circle" style={{ marginRight: '4px' }} />{formatStatus(row.activityType, row.status)}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {editingStageCell === `${key}-forms` ? (
                                                    <div style={{ position: 'relative' }}>
                                                        <MultiSelectForms 
                                                            selectedForms={row.requiredForms || []} 
                                                            onChange={forms => updateOutcomeRule(row.activityType, row.purpose, row.outcome, { requiredForms: forms })} 
                                                        />
                                                        <button 
                                                            onClick={() => setEditingStageCell(null)}
                                                            style={{ marginTop: '8px', padding: '4px 8px', fontSize: '11px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                                                        >
                                                            Done
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', cursor: 'pointer', minHeight: '24px', alignItems: 'center' }} onClick={() => setEditingStageCell(`${key}-forms`)}>
                                                        {row.requiredForms?.length > 0 ? row.requiredForms.map((f, i) => (
                                                            <span key={i} style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{f}</span>
                                                        )) : <span style={{ color: '#cbd5e1', fontSize: '11px', fontStyle: 'italic' }}>None</span>}
                                                        <i className="fas fa-pencil-alt" style={{ color: '#cbd5e1', fontSize: '10px', marginLeft: '4px' }} />
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {editingStageCell === `${key}-stage` ? (
                                                    <select
                                                        autoFocus
                                                        defaultValue={row.stage}
                                                        onBlur={e => { updateOutcomeRule(row.activityType, row.purpose, row.outcome, { stage: e.target.value }); setEditingStageCell(null); showToast(`Rule updated successfully`); }}
                                                        onChange={e => { updateOutcomeRule(row.activityType, row.purpose, row.outcome, { stage: e.target.value }); }}
                                                        style={{ padding: '5px 8px', border: '2px solid #6366f1', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}
                                                    >
                                                        {STAGE_LABELS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setEditingStageCell(`${key}-stage`)} title="Click to edit">
                                                        <StageChip stage={row.stage} />
                                                        <i className="fas fa-pencil-alt" style={{ color: '#cbd5e1', fontSize: '10px' }} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredRows.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No results match your filters</td></tr>
                                )}
                            </tbody>
                        </table>
                        <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '12px' }}>
                            Showing {filteredRows.length} of {allRows.length} mappings · <em>Click any Stage chip to edit inline</em>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB: Stage Density Dashboard ─── */}
            {activeTab === 'density' && (() => {
                const densityData = computeStageDensity(analyticsData.leads, DEFAULT_STAGE_DENSITY_TARGETS);
                const maxCount = Math.max(...densityData.map(d => d.count), 1);

                return (
                    <div style={{ padding: '24px 32px', flex: 1 }}>
                        {/* Header */}
                        <div style={{ marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Density Dashboard</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                                Conversion %, Drop-off %, Avg Days per stage — identify pipeline bottlenecks
                            </p>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                            {[
                                {
                                    icon: 'fa-filter', color: '#6366f1', label: 'Avg Conversion Rate',
                                    value: Math.round(densityData.slice(0, -1).reduce((s, d) => s + d.conversionRate, 0) / Math.max(densityData.length - 1, 1)) + '%',
                                    sub: 'Stage-to-stage progression'
                                },
                                {
                                    icon: 'fa-exclamation-triangle', color: '#ef4444', label: 'Bottleneck Stages',
                                    value: densityData.filter(d => d.isBottleneck).length,
                                    sub: densityData.filter(d => d.isBottleneck).map(d => d.stage).join(', ') || 'None detected'
                                },
                                {
                                    icon: 'fa-clock', color: '#f59e0b', label: 'Longest Avg Stage',
                                    value: (() => { const s = [...densityData].sort((a, b) => b.avgDays - a.avgDays)[0]; return s ? `${s.avgDays}d (${s.stage})` : '—'; })(),
                                    sub: 'Most time spent here'
                                },
                            ].map(c => (
                                <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <i className={`fas ${c.icon}`} style={{ color: c.color, fontSize: '15px' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: c.color, lineHeight: 1.2 }}>{c.value}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{c.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Funnel Table */}
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-chart-bar" style={{ color: '#6366f1', fontSize: '14px' }} />
                                <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>Pipeline Funnel Analysis</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>Based on current lead distribution · Connect real API for live data</span>
                            </div>

                            {/* Column Headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', borderBottom: '1px solid #f1f5f9', padding: '10px 20px', backgroundColor: '#fafafa' }}>
                                {['Stage', 'Count', 'Volume Bar', 'Conv. Rate', 'Drop-off', 'Avg Days', 'Status'].map(h => (
                                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                                ))}
                            </div>

                            {densityData.map((row, idx) => {
                                const stageInfo = STAGE_PIPELINE.find(s => s.label === row.stage) || { color: '#94a3b8', icon: 'fa-circle' };
                                const barWidth = Math.round((row.count / maxCount) * 100);

                                return (
                                    <React.Fragment key={row.stage}>
                                    <div 
                                        onClick={() => row.isBottleneck && toggleRow(row.stage)}
                                        style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', padding: '14px 20px', borderBottom: (idx < densityData.length - 1 && !expandedRows[row.stage]) ? '1px solid #f8fafc' : 'none', background: row.isBottleneck ? '#fef2f2' : 'transparent', transition: 'background 0.2s', cursor: row.isBottleneck ? 'pointer' : 'default' }}>
                                        {/* Stage Name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stageInfo.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{row.stage}</span>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: stageInfo.color, background: stageInfo.color + '15', borderRadius: '4px', padding: '1px 6px' }}>{getStageProbability(row.stage)}%</span>
                                        </div>
                                        {/* Count */}
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center' }}>{row.count}</div>
                                        {/* Bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '20px' }}>
                                            <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${barWidth}%`, height: '100%', background: row.isBottleneck ? '#ef4444' : stageInfo.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                            </div>
                                        </div>
                                        {/* Conversion Rate */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.conversionRate >= 50 ? '#10b981' : row.conversionRate >= 25 ? '#f59e0b' : '#ef4444' }}>
                                                {idx < densityData.length - 1 ? `${row.conversionRate}%` : '—'}
                                            </span>
                                        </div>
                                        {/* Drop-off */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.dropOffRate > 70 ? '#ef4444' : row.dropOffRate > 40 ? '#f59e0b' : '#10b981' }}>
                                                {idx < densityData.length - 1 ? `${row.dropOffRate}%` : '—'}
                                            </span>
                                        </div>
                                        {/* Avg Days */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.avgDays > row.targetDays ? '#f59e0b' : '#374151' }}>{row.avgDays}d</span>
                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>/ {row.targetDays}d target</span>
                                        </div>
                                        {/* Status */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {row.isBottleneck ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
                                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }} />BOTTLENECK
                                                    <i className={`fas fa-chevron-${expandedRows[row.stage] ? 'up' : 'down'}`} style={{ marginLeft: '6px' }} />
                                                </span>
                                            ) : row.avgDays > row.targetDays ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-eye" style={{ marginRight: '4px' }} />WATCH
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-check" style={{ marginRight: '4px' }} />HEALTHY
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {expandedRows[row.stage] && row.agentBottlenecks && (
                                        <div style={{ background: '#fef2f2', padding: '0 20px 16px 20px', borderBottom: idx < densityData.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                            <div style={{ padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                                <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent Bottleneck Report</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {row.agentBottlenecks.map(agent => (
                                                        <div key={agent.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: '#f9fafb', borderRadius: '6px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                                                                    {agent.name.charAt(0)}
                                                                </div>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{agent.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{agent.count} stalled</span>
                                                                <button style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Nudge Agent</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {row.agentBottlenecks.length === 0 && (
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>No specific agents identified for this bottleneck.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '20px', fontSize: '12px', color: '#94a3b8' }}>
                            <span><span style={{ color: '#10b981', fontWeight: 700 }}>●</span> Conv. Rate ≥ 50% = Healthy</span>
                            <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>●</span> 25–50% = Watch</span>
                            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>●</span> &lt;25% = Bottleneck</span>
                            <span style={{ marginLeft: 'auto' }}>Probability % shown as win probability per stage</span>
                        </div>
                    </div>
                );
            })()}

            {/* ─── TAB: Stability Lock Config ─── */}
            {activeTab === 'stability' && (() => {
                const softStages = STAGE_PIPELINE.filter(s => !s.isTerminal);
                const hardStages = STAGE_PIPELINE.filter(s => s.isTerminal);
                return (
                <div style={{ padding: '24px 32px', flex: 1 }}>

                    {/* Page Title */}
                    <div style={{ marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Stability Lock</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                            Enterprise protection layer — prevents false stage regressions caused by routine follow-up activities
                        </p>
                    </div>

                    {/* How it works — Two Types of Locks */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px 20px', display: 'flex', gap: '12px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <i className="fas fa-shield-alt" style={{ color: '#fff', fontSize: '14px' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '13px', marginBottom: '4px' }}>Soft Lock (Active Stages)</div>
                                <div style={{ fontSize: '12px', color: '#3b82f6', lineHeight: 1.6 }}>
                                    Requires minimum activity count + minimum days before a downgrade is permitted. A routine follow-up call <strong>will not</strong> regress a lead in negotiation back to prospect.
                                </div>
                            </div>
                        </div>
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 20px', display: 'flex', gap: '12px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <i className="fas fa-ban" style={{ color: '#fff', fontSize: '14px' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#7f1d1d', fontSize: '13px', marginBottom: '4px' }}>Hard Lock (Terminal Stages)</div>
                                <div style={{ fontSize: '12px', color: '#ef4444', lineHeight: 1.6 }}>
                                    Permanent protection — Closed (Won/Lost/Unqualified) stages <strong>can never</strong> be automatically downgraded. Admin manual override only.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── SOFT LOCK: Active Stages ─── */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-shield-alt" style={{ color: '#fff', fontSize: '12px' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>Soft Lock — Active Pipeline Stages</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Configurable thresholds · Changes auto-save to database</div>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveStabilityConfig}
                                style={{ padding: '7px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <i className="fas fa-check" /> Rules Active
                            </button>
                        </div>

                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 160px 140px 1fr', padding: '9px 20px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                            {['Stage', 'Min Activities', 'Min Days', 'Protection Rationale'].map(h => (
                                <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                            ))}
                        </div>

                        {softStages.map((stage, idx) => {
                            const lock = stabilityLockConfig[stage.label] || { minActivities: 0, minDays: 0, label: '', lockType: 'soft' };
                            return (
                                <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '200px 160px 140px 1fr', padding: '15px 20px', borderBottom: idx < softStages.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Stage Name */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{stage.label}</div>
                                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{stage.probability}% win probability</div>
                                        </div>
                                    </div>
                                    {/* Min Activities */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="number" min="0" max="50"
                                                value={lock.minActivities}
                                                onChange={e => updateStabilityLockConfig({ [stage.label]: { ...lock, minActivities: parseInt(e.target.value) || 0 } })}
                                                style={{ width: '56px', padding: '6px 8px', border: '1.5px solid #bfdbfe', borderRadius: '8px', fontWeight: 800, textAlign: 'center', color: '#3b82f6', background: '#eff6ff', fontSize: '15px', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>activities</div>
                                            {lock.minActivities === 0 && <div style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 700 }}>⚠ Unprotected</div>}
                                        </div>
                                    </div>
                                    {/* Min Days */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="number" min="0" max="90"
                                            value={lock.minDays}
                                            onChange={e => updateStabilityLockConfig({ [stage.label]: { ...lock, minDays: parseInt(e.target.value) || 0 } })}
                                            style={{ width: '56px', padding: '6px 8px', border: '1.5px solid #bbf7d0', borderRadius: '8px', fontWeight: 800, textAlign: 'center', color: '#16a34a', background: '#f0fdf4', fontSize: '15px', outline: 'none' }}
                                        />
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>days</div>
                                            {lock.minDays === 0 && <div style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 700 }}>⚠ No time lock</div>}
                                        </div>
                                    </div>
                                    {/* Rationale */}
                                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5, paddingLeft: '8px', borderLeft: `3px solid ${stage.color}30` }}>
                                        {lock.label || '—'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─── HARD LOCK: Terminal Stages ─── */}
                    <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #fecaca', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-ban" style={{ color: '#fff', fontSize: '12px' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#7f1d1d' }}>Hard Lock — Terminal Stages</div>
                                <div style={{ fontSize: '11px', color: '#ef4444' }}>System-enforced · Cannot be configured · Admin manual action required to change</div>
                            </div>
                        </div>
                        {hardStages.map((stage, idx) => (
                            <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '200px 160px 140px 1fr', padding: '14px 20px', borderBottom: idx < hardStages.length - 1 ? '1px solid #fef2f2' : 'none', alignItems: 'center', background: '#fffafa' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{stage.label}</div>
                                </div>
                                <div>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 }}>
                                        <i className="fas fa-ban" style={{ fontSize: '10px' }} /> Hard Locked
                                    </span>
                                </div>
                                <div>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 }}>
                                        <i className="fas fa-ban" style={{ fontSize: '10px' }} /> Hard Locked
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#dc2626', lineHeight: 1.5, paddingLeft: '8px', borderLeft: '3px solid #fca5a5', fontStyle: 'italic' }}>
                                    {(stabilityLockConfig[stage.label] || {}).label || 'Permanent terminal state — system lock'}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Protection Coverage Badge */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <i className="fas fa-check-circle" style={{ color: '#16a34a', fontSize: '18px', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#14532d', fontSize: '13px' }}>Full Pipeline Protection Active</div>
                            <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '2px' }}>
                                {softStages.length} active stages with soft locks · {hardStages.length} terminal stages with hard locks · Changes persist to database automatically
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '22px', fontWeight: 900, color: '#16a34a' }}>{softStages.length + hardStages.length}</div>
                            <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>STAGES PROTECTED</div>
                        </div>
                    </div>

                    {/* Probability Calibration */}
                    <div style={{ marginTop: '24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-percentage" style={{ color: '#f59e0b', marginRight: '8px' }} />
                                Win Probability per Stage (Forecast Calibration)
                            </span>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                            {STAGE_PIPELINE.map(stage => (
                                <div key={stage.id} style={{ background: stage.color + '10', border: `1px solid ${stage.color}40`, borderRadius: '10px', padding: '14px 16px', textAlign: 'center' }}>
                                    <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '18px', marginBottom: '8px', display: 'block' }} />
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>{stage.label}</div>
                                    <div style={{ fontSize: '24px', fontWeight: 900, color: stage.color }}>{stage.probability}%</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Win Probability</div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
                );
            })()}

            {/* ─── TAB 4: Deal Sync Engine ─── */}
            {activeTab === 'sync' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <i className="fas fa-check-circle" style={{ color: '#10b981', marginTop: '3px', fontSize: '18px' }} />
                        <div>
                            <span style={{ fontSize: '14px', color: '#065f46', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Unit-Specific Deal Sync is Active</span>
                            <span style={{ fontSize: '13px', color: '#047857', lineHeight: '1.5' }}>
                                Deal stages are strictly updated based on the <b>Outcome</b> of an Activity recorded against that <b>Specific Unit</b>. Blanket updates across all linked deals are intentionally disabled to preserve data integrity.
                            </span>
                        </div>
                    </div>

                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '24px' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#374151' }}>How Deal Sync Works</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[
                                { step: '1', icon: 'fa-user-clock', color: '#8b5cf6', label: 'Activity Triggers Sync', desc: 'Sync only runs when you complete a "Site Visit" or "Meeting" activity.' },
                                { step: '2', icon: 'fa-crosshairs', color: '#ef4444', label: 'Unit Targeting', desc: 'The engine looks for the specific Project, Block, and Unit number selected in the Activity form.' },
                                { step: '3', icon: 'fa-balance-scale', color: '#f59e0b', label: 'Outcome Resolution', desc: 'The exact outcome assigned to that unit (e.g. "Token Given", "Not Interested") is evaluated by the CRM Rule Engine.' },
                                { step: '4', icon: 'fa-sync', color: '#10b981', label: 'Precision Update', desc: 'Only the Deal matching the specific targeted unit is updated. All other deals linked to the lead remain unchanged.' },
                            ].map(step => (
                                <div key={step.step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: step.color + '15', border: `2px solid ${step.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: step.color }}>{step.step}</span>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#374151', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className={`fas ${step.icon}`} style={{ color: step.color, fontSize: '12px' }} />
                                            {step.label}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{step.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px 20px' }}>
                        <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', marginTop: '2px', fontSize: '16px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '4px', fontSize: '14px' }}>Ignored Activities</div>
                            <div style={{ fontSize: '13px', color: '#dc2626', lineHeight: '1.5' }}>
                                General activities such as <b>Calls</b> and <b>Emails</b> do not target specific units. 
                                Therefore, they will <b>never</b> trigger a Deal stage update. They only progress the overall Lead stage.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: Sequence Guard ─── */}
            {activeTab === 'sequence' && (() => {
                const activeStages  = STAGE_PIPELINE.filter(s => !s.isTerminal);
                const modeConfig = {
                    off:   { color: '#94a3b8', bg: '#f8fafc', icon: 'fa-power-off',         label: 'Off',   detail: 'Guard is disabled. All activities are processed without any sequence check.' },
                    warn:  { color: '#f59e0b', bg: '#fffbeb', icon: 'fa-exclamation-circle', label: 'Warn',  detail: 'Warnings are returned in the API response and surfaced to agents as alert banners — but the activity completes normally.' },
                    block: { color: '#ef4444', bg: '#fef2f2', icon: 'fa-ban',                label: 'Block', detail: 'Hard block: terminal re-entry (Closed lead) is fully blocked until agent confirms. Stage-skip and regression remain as warnings.' },
                };
                const currentMode = sequenceConfig.enforcementMode || 'off';
                const mc = modeConfig[currentMode];

                return (
                <div style={{ padding: '24px 32px', flex: 1 }}>

                    {/* Header */}
                    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Activity Sequence Guard</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                                Enterprise-grade advisory layer — detects and flags out-of-sequence activities before stage transitions execute
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 14px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>Backend Enforcement: Active</span>
                        </div>
                    </div>

                    {/* Enforcement Mode Selector */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-sliders-h" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Enforcement Mode
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                                Controls how the backend responds when a sequence violation is detected
                            </div>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                            {Object.entries(modeConfig).map(([id, m]) => (
                                <div key={id}
                                    onClick={() => updateSequenceConfig({ enforcementMode: id })}
                                    style={{ padding: '16px', borderRadius: '12px', border: `2px solid ${currentMode === id ? m.color : '#e5e7eb'}`, background: currentMode === id ? m.bg : '#fafafa', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: currentMode === id ? m.color : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className={`fas ${m.icon}`} style={{ color: '#fff', fontSize: '13px' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '16px', color: currentMode === id ? m.color : '#94a3b8' }}>{m.label}</span>
                                        {currentMode === id && <span style={{ marginLeft: 'auto', fontSize: '10px', background: m.color, color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>ACTIVE</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{m.detail}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Three Guard Types */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '20px' }}>
                        {[
                            { code: 'TERMINAL_REENTRY', icon: 'fa-ban', color: '#ef4444', label: 'Terminal Re-entry', severity: 'Block (in block mode)', desc: 'Fires when any qualifying activity is logged on a Closed (Won/Lost/Unqualified) lead. Prevents accidental re-opening of closed pipeline.' },
                            { code: 'STAGE_SKIP', icon: 'fa-forward', color: '#f59e0b', label: 'Stage Skip Detection', severity: 'Always Warn', desc: 'Fires when an activity would cause a jump of 2+ pipeline stages (e.g. Incoming → Negotiation). Logs which intermediate stages were skipped and what recommended activities were missed.' },
                            { code: 'ACTIVITY_REGRESSION', icon: 'fa-undo-alt', color: '#8b5cf6', label: 'Activity Regression', severity: 'Always Warn', desc: 'Fires when an activity type is typical of an earlier stage (e.g. "Introduction Call" on a Negotiation lead). Flags potential data entry errors without blocking the agent.' },
                        ].map(g => (
                            <div key={g.code} style={{ background: '#fff', border: `1px solid ${g.color}30`, borderRadius: '12px', padding: '18px', borderTop: `3px solid ${g.color}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: g.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <i className={`fas ${g.icon}`} style={{ color: g.color, fontSize: '13px' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{g.label}</div>
                                        <span style={{ fontSize: '10px', background: g.color + '15', color: g.color, padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>{g.severity}</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>{g.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Stage Sequence Table — Editable Required Activities */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                    <i className="fas fa-project-diagram" style={{ color: '#6366f1', marginRight: '8px' }} />
                                    Stage Sequence &amp; Recommended Activities
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                    Populated from your pipeline · Edit recommended activities for Stage Skip warnings
                                </div>
                            </div>
                        </div>

                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '36px 180px 1fr 140px', padding: '9px 20px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                            {['#', 'Stage', 'Recommended Activity (for Stage-Skip Guard)', 'Win Probability'].map(h => (
                                <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                            ))}
                        </div>

                        {activeStages.map((stage, idx) => {
                            const seqEntry = (sequenceConfig.sequence || []).find(s => s.stage === stage.label) || { stage: stage.label, order: idx, requiredActivity: '' };
                            return (
                                <div key={stage.id}
                                    style={{ display: 'grid', gridTemplateColumns: '36px 180px 1fr 140px', padding: '13px 20px', borderBottom: idx < activeStages.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', transition: 'background .15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Order */}
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: stage.color + '20', border: `2px solid ${stage.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: stage.color }}>{idx + 1}</span>
                                    </div>
                                    {/* Stage Name */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color }} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{stage.label}</div>
                                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>{idx === 0 ? 'Entry point — no prior requirement' : `After ${activeStages[idx - 1]?.label}`}</div>
                                        </div>
                                    </div>
                                    {/* Recommended Activity */}
                                    <div style={{ paddingRight: '16px' }}>
                                        {idx === 0 ? (
                                            <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No requirement — first stage</span>
                                        ) : (
                                            <input
                                                type="text"
                                                value={seqEntry.requiredActivity || ''}
                                                placeholder="e.g. Site Visit, Call, Meeting..."
                                                onChange={e => {
                                                    const newSeq = (sequenceConfig.sequence || []).map(s => s.stage === stage.label ? { ...s, requiredActivity: e.target.value } : s);
                                                    // Add entry if not exists
                                                    if (!newSeq.find(s => s.stage === stage.label)) newSeq.push({ stage: stage.label, order: idx, requiredActivity: e.target.value });
                                                    updateSequenceConfig({ sequence: newSeq });
                                                }}
                                                style={{ width: '100%', padding: '7px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f8fafc', outline: 'none', fontFamily: 'inherit' }}
                                                onFocus={e => e.target.style.borderColor = stage.color}
                                                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                                            />
                                        )}
                                    </div>
                                    {/* Win Probability */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${stage.probability}%`, background: stage.color, borderRadius: '3px' }} />
                                        </div>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: stage.color, minWidth: '36px', textAlign: 'right' }}>{stage.probability}%</span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Terminal Stages Row */}
                        {STAGE_PIPELINE.filter(s => s.isTerminal).map((stage, idx, arr) => (
                            <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '36px 180px 1fr 140px', padding: '12px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #fef2f2' : 'none', alignItems: 'center', background: '#fffafa' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fas fa-ban" style={{ fontSize: '10px', color: '#ef4444' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color }} />
                                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#6b7280' }}>{stage.label}</div>
                                </div>
                                <div style={{ fontSize: '12px', color: '#ef4444', fontStyle: 'italic' }}>
                                    Terminal — any new qualifying activity triggers TERMINAL_REENTRY guard
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: stage.color }}>{stage.probability}%</div>
                            </div>
                        ))}
                    </div>

                    {/* Live Mode Status Banner */}
                    <div style={{ background: mc.bg, border: `1px solid ${mc.color}40`, borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <i className={`fas ${mc.icon}`} style={{ color: mc.color, fontSize: '18px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: 700, color: mc.color, fontSize: '13px' }}>Current Mode: {mc.label}</div>
                            <div style={{ fontSize: '12px', color: mc.color, opacity: 0.85, marginTop: '2px' }}>{mc.detail}</div>
                        </div>
                    </div>

                </div>
                );
            })()}


            {/* ─── TAB 6: Ageing & Decay ─── */}
            {activeTab === 'aging' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        {Object.entries(agingRules).map(([key, rule]) => (
                            <div key={key} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>{rule.label}</div>
                                        <span style={{ fontSize: '11px', background: rule.action === 'Risk Flag' ? '#fef2f2' : rule.action === 'Score Penalty' ? '#fef3c7' : '#eff6ff', color: rule.action === 'Risk Flag' ? '#ef4444' : rule.action === 'Score Penalty' ? '#f59e0b' : '#3b82f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{rule.action}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="number" min="1" value={rule.value} onChange={e => updateAgingRule(key, { value: parseInt(e.target.value) || 1 })}
                                            style={{ width: '60px', padding: '6px', border: '1px solid #e5e7eb', borderRadius: '6px', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: '#374151' }} />
                                        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>days</span>
                                    </div>
                                </div>
                                <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px' }}>
                                    <div style={{ height: '4px', background: '#6366f1', borderRadius: '2px', width: `${Math.min(100, rule.value * 2)}%`, transition: 'width 0.3s' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '20px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '16px', fontSize: '13px', color: '#166534' }}>
                        <i className="fas fa-lightbulb" style={{ marginRight: '8px' }} />
                        These thresholds control automatic risk flags, score penalties, and admin alerts. Flags are shown on the Deal card and in the Deal Health score.
                    </div>

                    {/* Cold Storage Setting */}
                    <div style={{ marginTop: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <i className="fas fa-snowflake" style={{ color: '#3b82f6' }}></i>
                                    <div style={{ fontWeight: 800, color: '#374151', fontSize: '16px' }}>Terminal State Archiver (Cold Storage)</div>
                                    <span style={{ fontSize: '10px', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Enterprise</span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#6b7280', maxWidth: '600px', lineHeight: '1.5' }}>
                                    Automatically moves terminal leads (Closed, Lost, Junk) into Cold Storage after a specific period of inactivity. This dramatically improves dashboard speeds by removing dead records from active memory.
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        value={coldStorageDays} 
                                        onChange={e => setColdStorageDays(parseInt(e.target.value) || 365)}
                                        style={{ width: '60px', padding: '4px', border: 'none', background: 'transparent', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: '#0f172a', outline: 'none' }} 
                                    />
                                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>days</span>
                                </div>
                                <button
                                    onClick={() => handleSaveColdStorage(coldStorageDays)}
                                    style={{
                                        background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <i className="fas fa-save"></i> Save Rule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 7: Revenue Forecast ─── */}
            {activeTab === 'forecast' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '15px', marginBottom: '20px' }}>Formula Configuration</div>
                            <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>Primary Brokerage</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="number" step="0.1" min="0" value={forecastConfig.primaryRate?.value ?? 5}
                                            onChange={e => updateForecastConfig('primaryRate', { value: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '70px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: '#3b82f6' }} />
                                        <span style={{ fontWeight: 700, color: '#374151' }}>%</span>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>Resale Brokerage</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="number" step="0.1" min="0" value={forecastConfig.resaleRate?.value ?? 2}
                                            onChange={e => updateForecastConfig('resaleRate', { value: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '70px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: '#10b981' }} />
                                        <span style={{ fontWeight: 700, color: '#374151' }}>%</span>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>Rental Brokerage</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="number" step="0.1" min="0" value={forecastConfig.rentalRate?.value ?? 8.33}
                                            onChange={e => updateForecastConfig('rentalRate', { value: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '70px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: '#f59e0b' }} />
                                        <span style={{ fontWeight: 700, color: '#374151' }}>%</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '13px', marginBottom: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>Statutory Deductions</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                                <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>Apply Statutory TDS Deduction</span>
                                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                    <input type="checkbox" checked={forecastConfig.applyTDS?.value ?? true} onChange={e => updateForecastConfig('applyTDS', { value: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: (forecastConfig.applyTDS?.value ?? true) ? '#10b981' : '#cbd5e1', borderRadius: '34px', transition: '.3s' }} />
                                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: (forecastConfig.applyTDS?.value ?? true) ? '19px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '.3s' }} />
                                </label>
                            </div>
                            {(forecastConfig.applyTDS?.value ?? true) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0 16px 0' }}>
                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>TDS Rate:</span>
                                    <input type="number" step="0.1" min="0" value={forecastConfig.tdsRate?.value ?? 5}
                                        onChange={e => updateForecastConfig('tdsRate', { value: parseFloat(e.target.value) || 0 })}
                                        style={{ width: '60px', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontWeight: 800, fontSize: '13px', textAlign: 'center' }} />
                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                                </div>
                            )}

                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '13px', marginBottom: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>Display Settings</div>
                            {Object.entries(forecastConfig).filter(([k]) => ['showWeighted', 'showExpected', 'showStageWise'].includes(k)).map(([key, cfg]) => (
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                                    <span style={{ fontSize: '13px', color: '#374151' }}>{cfg.label}</span>
                                    <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                        <input type="checkbox" checked={cfg.value} onChange={e => updateForecastConfig(key, { value: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                        <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: cfg.value ? '#10b981' : '#cbd5e1', borderRadius: '34px', transition: '.3s' }} />
                                        <span style={{ position: 'absolute', height: '14px', width: '14px', left: cfg.value ? '19px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '.3s' }} />
                                    </label>
                                </div>
                            ))}
                        </div>
                        <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '12px', padding: '24px', color: '#fff' }}>
                            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', color: '#94a3b8' }}>Dashboard Preview (Live)</div>
                            {(() => {
                                const totalValue = analyticsData.deals.reduce((sum, d) => sum + (d.price || 0), 0);
                                
                                let totalGrossExpected = 0;
                                let totalNetExpected = 0;

                                analyticsData.deals.forEach(d => {
                                    const winProb = getStageProbability(d.stage) / 100;
                                    const grossComm = calculateGrossCommission(d, forecastConfig);
                                    const netComm = calculateNetRevenue(grossComm, forecastConfig);
                                    
                                    totalGrossExpected += (grossComm * winProb);
                                    totalNetExpected += (netComm * winProb);
                                });

                                const fmt = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
                                
                                return [
                                    { label: 'Total Pipeline Value', value: fmt(totalValue), color: '#60a5fa' },
                                    { label: 'Gross Expected Brokerage', value: fmt(totalGrossExpected), color: '#34d399', sub: 'Weighted by Probability' },
                                    { label: 'Net Realizable Revenue', value: fmt(totalNetExpected), color: '#f59e0b', sub: (forecastConfig.applyTDS?.value ?? true) ? `Post ${forecastConfig.tdsRate?.value ?? 5}% TDS Deduction` : 'TDS Not Applied' }
                                ].map(row => (
                                    <div key={row.label} style={{ marginBottom: '18px' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{row.label}</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: row.color }}>{row.value}</div>
                                        {row.sub && <div style={{ fontSize: '11px', color: '#475569' }}>{row.sub}</div>}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '10px', fontSize: '14px' }}>Formula</div>
                        <code style={{ display: 'block', background: '#1e293b', color: '#34d399', padding: '16px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                            Gross Commission = Deal Value × Category Rate (Primary/Resale/Rental)<br/>
                            Net Realizable = Gross Commission - Statutory TDS<br/>
                            Expected Revenue = Net Realizable × (Stage Probability / 100)
                        </code>
                    </div>
                </div>
            )}

            {/* ─── TAB 8: Deal Health ─── */}
            {activeTab === 'health' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '15px', marginBottom: '20px' }}>Health Score Weights</div>
                            {Object.entries(dealHealthConfig).filter(([k]) => k !== 'thresholds').map(([key, cfg]) => (
                                <div key={key} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>{cfg.label}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input type="number" min="0" max="100" value={cfg.weight} onChange={e => updateDealHealthConfig({ [key]: { ...cfg, weight: parseInt(e.target.value) || 0 } })}
                                                style={{ width: '50px', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontWeight: 800, textAlign: 'center', color: '#6366f1' }} />
                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>%</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                                        <div style={{ height: '6px', background: '#6366f1', borderRadius: '3px', width: `${cfg.weight}%`, transition: 'width 0.3s' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '15px', marginBottom: '20px' }}>Color Thresholds</div>
                            {Object.entries(dealHealthConfig.thresholds || {}).map(([key, t]) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '12px', background: t.color + '10', borderRadius: '8px', border: `1px solid ${t.color}30` }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 700, color: t.color, width: '70px' }}>{t.label}</span>
                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Score ≥</span>
                                    <input type="number" min="0" max="100" value={t.min} onChange={e => updateDealHealthConfig({ thresholds: { ...dealHealthConfig.thresholds, [key]: { ...t, min: parseInt(e.target.value) || 0 } } })}
                                        style={{ width: '52px', padding: '4px 8px', border: `1px solid ${t.color}`, borderRadius: '6px', fontWeight: 800, color: t.color, textAlign: 'center' }} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '10px', fontSize: '14px' }}>Health Formula</div>
                        <code style={{ display: 'block', background: '#1e293b', color: '#34d399', padding: '16px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8' }}>
                            Health = (Stage Score × {dealHealthConfig.stageWeight.weight}%) + (Lead Score × {dealHealthConfig.scoreWeight.weight}%) − Age Penalty − Risk Penalty
                        </code>
                    </div>
                </div>
            )}

            {/* ─── TAB 9: Intent Signals ─── */}
            {activeTab === 'intent' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>Intent Signals & Weights</span>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>These signals detect hot deals. Positive weight = buying intent. Negative = risk.</p>
                        </div>
                        {Object.entries(intentSignals).map(([key, signal]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: signal.weight > 0 ? '#10b98115' : '#ef444415', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={`fas ${signal.icon}`} style={{ color: signal.weight > 0 ? '#10b981' : '#ef4444', fontSize: '14px' }} />
                                </div>
                                <span style={{ flex: 1, fontWeight: 600, color: '#374151', fontSize: '14px' }}>{signal.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="number" value={signal.weight} onChange={e => updateIntentSignal(key, { weight: parseInt(e.target.value) || 0 })}
                                        style={{ width: '64px', padding: '6px', border: '1px solid #e5e7eb', borderRadius: '6px', fontWeight: 800, textAlign: 'center', color: signal.weight > 0 ? '#10b981' : '#ef4444', fontSize: '15px' }} />
                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>pts</span>
                                </div>
                                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                    <input type="checkbox" checked={signal.isActive} onChange={e => updateIntentSignal(key, { isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: signal.isActive ? '#10b981' : '#cbd5e1', borderRadius: '34px', transition: '.3s' }} />
                                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: signal.isActive ? '19px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '.3s' }} />
                                </label>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '14px', fontSize: '14px' }}>Hot Deal Detection Logic</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {[{ label: 'Repeat Visit', color: '#10b981' }, { label: 'Legal Docs', color: '#10b981' }, { label: 'Family Visit', color: '#10b981' }, { label: 'Offer Revision', color: '#f59e0b' }, { label: 'Budget Gap', color: '#ef4444' }].map(s => (
                                <div key={s.label} style={{ padding: '8px 14px', background: s.color + '15', border: `1px solid ${s.color}30`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: s.color }}>
                                    <i className="fas fa-fire" style={{ marginRight: '6px' }} />{s.label}
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '12px' }}>Sum of active intent signal weights. Score ≥ 40 → <strong style={{ color: '#f59e0b' }}>Warm</strong>. Score ≥ 60 → <strong style={{ color: '#ef4444' }}>Hot Deal</strong>.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StagePage;
