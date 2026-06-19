import { useState, useMemo, useEffect, useCallback } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { stageTransitionRulesAPI } from '../../../utils/api';
import Toast from '../../../components/Toast';
import { renderValue } from '../../../utils/renderUtils';
import {
    STAGE_PIPELINE, STAGE_LABELS
} from '../../../utils/stageEngine';


const REQUIRED_FORMS = [
    { value: 'Requirement Form', label: 'Requirement Form', short: 'Req', color: '#3b82f6' },
    { value: 'Meetings Form', label: 'Meetings Form', short: 'Mtg', color: '#8b5cf6' },
    { value: 'Site Visit Form', label: 'Site Visit Form', short: 'SV', color: '#f59e0b' },
    { value: 'Quotation Form', label: 'Quotation Form', short: 'Quot', color: '#10b981' },
    { value: 'Offer Form', label: 'Offer Form', short: 'Offer', color: '#f97316' },
    { value: 'Feedback Form', label: 'Feedback Form', short: 'FB', color: '#ec4899' },
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const StageChip = ({ stage }) => {
    // 🧠 SENIOR HARDENING: Use centralized renderValue
    const label = renderValue(stage, 'Unknown');
    const stageInfo = STAGE_PIPELINE.find(s => s.label === label) || STAGE_PIPELINE[0];
    
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
            background: stageInfo.color + '18', color: stageInfo.color, border: `1px solid ${stageInfo.color}40`
        }}>
            <i className={`fas ${stageInfo.icon}`} style={{ fontSize: '9px' }} />
            {label}
        </span>
    );
};



// ─────────────────────────────────────────────
// Form Chips: Multi-Form Required Form Selector
// ─────────────────────────────────────────────

/** Interactive toggle buttons — used in Override Rule table cells */
const FormChipsSelector = ({ value = [], onChange }) => {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {REQUIRED_FORMS.map(f => {
                const active = selected.includes(f.value);
                return (
                    <button key={f.value} type="button" title={f.label}
                        onClick={() => onChange(active ? selected.filter(x => x !== f.value) : [...selected, f.value])}
                        style={{
                            padding: '3px 8px', borderRadius: '12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                            border: `1.5px solid ${active ? f.color : 'var(--border-color)'}`,
                            background: active ? f.color + '18' : 'var(--bg-light)',
                            color: active ? f.color : 'var(--text-muted)', transition: 'all 0.15s'
                        }}
                    >
                        {active && <i className="fas fa-check" style={{ marginRight: '3px', fontSize: '8px' }} />}
                        {f.short}
                    </button>
                );
            })}
        </div>
    );
};

/** Read-only chip display — used in Default Mappings table */


// ─────────────────────────────────────────────
// Add Override Rule Modal
// ─────────────────────────────────────────────

const AddRuleModal = ({ activityMasterFields, onSave, onClose }) => {
    const [activityType, setActivityType] = useState('');
    const [purpose, setPurpose] = useState('');
    const [outcome, setOutcome] = useState('');
    const [reason, setReason] = useState('');
    const [stage, setStage] = useState('Prospect');
    const [priority, setPriority] = useState('1');
    const [requiredForms, setRequiredForms] = useState([]); // multi-form array

    const activities = activityMasterFields?.activities || [];
    const purposes = activities.find(a => a.name === activityType)?.purposes || [];
    const outcomes = purposes.find(p => p.name === purpose)?.outcomes || [];
    const reasons = outcomes.find(o => o.label === outcome)?.reasons || [];

    const canSave = stage && (activityType || purpose || outcome);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', width: '520px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Add Override Rule</h2>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Override rules take priority over default outcome stages</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'var(--bg-light)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Activity */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Activity Type <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(leave blank = apply to all)</span>
                        </label>
                        <select value={activityType} onChange={e => { setActivityType(e.target.value); setPurpose(''); setOutcome(''); }}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px' }}>
                            <option value="">— Any Activity —</option>
                            {activities.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* Purpose */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>Purpose</label>
                        <select value={purpose} onChange={e => { setPurpose(e.target.value); setOutcome(''); }} disabled={!activityType}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', opacity: !activityType ? 0.5 : 1 }}>
                            <option value="">— Any Purpose —</option>
                            {purposes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Outcome */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>Outcome</label>
                        <select value={outcome} onChange={e => { setOutcome(e.target.value); setReason(''); }} disabled={!purpose}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', opacity: !purpose ? 0.5 : 1 }}>
                            <option value="">— Any Outcome —</option>
                            {outcomes.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Reason */}
                    {reasons.length > 0 && (
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>Reason <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional — more specific rule)</span></label>
                            <select value={reason} onChange={e => setReason(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px' }}>
                                <option value="*">— Any Reason —</option>
                                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Required Forms — multi-select chips */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', textTransform: 'uppercase' }}>Required Forms <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(agent must complete these before stage changes)</span></label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {REQUIRED_FORMS.map(f => {
                                const active = requiredForms.includes(f.value);
                                return (
                                    <button key={f.value} type="button"
                                        onClick={() => setRequiredForms(prev => active ? prev.filter(x => x !== f.value) : [...prev, f.value])}
                                        style={{
                                            padding: '7px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                                            border: `2px solid ${active ? f.color : 'var(--border-color)'}`,
                                            background: active ? f.color + '18' : 'var(--bg-card)',
                                            color: active ? f.color : 'var(--text-muted)', transition: 'all 0.15s'
                                        }}
                                    >
                                        {active && <i className="fas fa-check" style={{ marginRight: '6px', fontSize: '10px' }} />}
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>
                        {requiredForms.length > 0 && (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                <i className="fas fa-info-circle" style={{ color: '#6366f1', marginRight: '4px' }} />
                                Agent must complete <strong>{requiredForms.join(', ')}</strong> before stage will change.
                            </p>
                        )}
                    </div>

                    {/* Arrow indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {activityType || 'Any Activity'}{purpose ? ` → ${purpose}` : ''}{outcome ? ` → ${outcome}` : ''}
                        </span>
                        <i className="fas fa-arrow-right" style={{ color: '#6366f1' }} />
                        <StageChip stage={stage} />
                    </div>

                    {/* Stage target */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>Maps To Stage</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {STAGE_LABELS.filter(s => s.toLowerCase() !== 'closed').concat(['Won', 'Lost', 'Unqualified']).map(s => (
                                <button key={s} onClick={() => setStage(s)} style={{
                                    padding: '6px 14px', borderRadius: '20px', border: '2px solid',
                                    borderColor: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color || '#6366f1') : 'var(--border-color)',
                                    background: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color + '15' || '#f0f0ff') : 'var(--bg-card)',
                                    color: stage === s ? (STAGE_PIPELINE.find(x => x.label === s)?.color || '#6366f1') : 'var(--text-muted)',
                                    fontWeight: 700, fontSize: '12px', cursor: 'pointer'
                                }}>{s}</button>
                            ))}
                        </div>
                    </div>

                    {/* Priority */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', textTransform: 'uppercase' }}>Priority (1 = highest)</label>
                        <input type="number" min="1" value={priority} onChange={e => setPriority(e.target.value)}
                            style={{ width: '80px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', fontWeight: 700 }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button disabled={!canSave} onClick={() => { onSave({ activityType, purpose, outcome, reason: reason || '*', stage, priority: parseInt(priority) || 1, requiredForms }); onClose(); }}
                        style={{ padding: '10px 24px', background: canSave ? '#6366f1' : 'var(--border-color)', color: canSave ? 'var(--bg-card)' : 'var(--text-muted)', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>
                        <i className="fas fa-plus" style={{ marginRight: '8px' }} />
                        Add Rule
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
        activityMasterFields,
        stageMappingRules, addStageMappingRule, updateStageMappingRule, deleteStageMappingRule,
        syncRules, updateSyncRule,
    } = usePropertyConfig();

    const [activeTab, setActiveTab] = useState('rules');
    const [search, setSearch] = useState('');
    const [filterActivity] = useState('');
    const [filterStage] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [editingStageCell, setEditingStageCell] = useState(null);

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(n => ({ ...n, show: false })), 3000);
    };

    // ─── Backend Default Stage Rules ─────────────────────────────────────────
    const [backendRules, setBackendRules] = useState([]);
    const [rulesLoading, setRulesLoading] = useState(true);

    const loadBackendRules = useCallback(async () => {
        setRulesLoading(true);
        try {
            const data = await stageTransitionRulesAPI.getAll();
            if (data.success) {
                // If it's a default state and data is empty or isDefault is true
                if (data.isDefault && (!data.data || data.data.length === 0)) {
                    await stageTransitionRulesAPI.seedDefaults();
                    const reloaded = await stageTransitionRulesAPI.getAll();
                    setBackendRules(reloaded.data || []);
                } else {
                    setBackendRules(data.data || []);
                }
            }
        } catch (err) {
            console.error('[StagePage] Failed to load backend stage rules:', err);
            showToast('Failed to load rules', 'error');
        } finally {
            setRulesLoading(false);
        }
    }, []);

    const handleRestoreDefaults = async () => {
        if (!window.confirm('This will reset all stage transition rules to the professional real estate defaults. Continue?')) return;
        setRulesLoading(true);
        try {
            await stageTransitionRulesAPI.seedDefaults();
            await loadBackendRules();
            showToast('Professional defaults restored successfully');
        } catch (err) {
            showToast('Failed to restore defaults', 'error');
        } finally {
            setRulesLoading(false);
        }
    };

    useEffect(() => { loadBackendRules(); }, [loadBackendRules]);

    const updateBackendRule = useCallback(async (ruleId, changes) => {
        try {
            const data = await stageTransitionRulesAPI.update(ruleId, changes);
            if (data.success) {
                setBackendRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...changes } : r));
            }
        } catch (err) {
            console.error('[StagePage] Failed to update backend rule:', err);
            showToast('Update failed', 'error');
        }
    }, []);

    const filteredRows = useMemo(() => backendRules.filter(row => {
        const q = search.toLowerCase();
        const matchSearch = !q || [row.activityType, row.purpose, row.outcome, row.newStage]
            .filter(Boolean).some(v => v.toLowerCase().includes(q));
        const matchActivity = !filterActivity || row.activityType === filterActivity;
        const matchStage = !filterStage || row.newStage === filterStage;
        return matchSearch && matchActivity && matchStage;
    }), [backendRules, search, filterActivity, filterStage]);





    const tabs = [
        { id: 'rules', label: 'Rule Table', icon: 'fa-table' },
        { id: 'pipeline', label: 'Stage Pipeline', icon: 'fa-stream' },
        { id: 'sync', label: 'Lead↔Deal Sync', icon: 'fa-sync-alt' },
    ];

    return (
        <div style={{ flex: 1, height: '100%', background: 'var(--bg-light)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {notification.show && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(n => ({ ...n, show: false }))} />}
            {showAddModal && <AddRuleModal activityMasterFields={activityMasterFields} onClose={() => setShowAddModal(false)} onSave={rule => { addStageMappingRule(rule); showToast('Override rule added successfully'); }} />}

            {/* Page Header */}
            <div style={{ padding: '28px 32px 0', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-layer-group" style={{ color: 'var(--bg-card)', fontSize: '20px' }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Stage Computation Engine</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '3px 0 0' }}>
                                Activity → Purpose → Outcome → Stage mapping · <strong style={{ color: '#ef4444' }}>{backendRules.length}</strong> rules configured
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b98115', border: '1px solid #10b98140', borderRadius: '8px', padding: '6px 12px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Auto-Compute: ON</span>
                        </div>
                        {activeTab === 'rules' && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handleRestoreDefaults}
                                    style={{ padding: '8px 16px', background: 'var(--bg-light)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <i className="fas fa-undo" /> Restore Professional Defaults
                                </button>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    style={{ padding: '8px 20px', background: '#6366f1', color: 'var(--bg-card)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <i className="fas fa-plus" />+ Override Rule
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            padding: '10px 20px', border: 'none', borderRadius: '8px 8px 0 0',
                            background: activeTab === tab.id ? 'var(--bg-light)' : 'transparent',
                            borderBottom: activeTab === tab.id ? '3px solid #6366f1' : '3px solid transparent',
                            color: activeTab === tab.id ? '#6366f1' : 'var(--text-muted)',
                            fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '13px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '-1px'
                        }}>
                            <i className={`fas ${tab.icon}`} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* TAB 1: Rule Table */}
            {activeTab === 'rules' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>

                    {/* Override Rules */}
                    {stageMappingRules.length > 0 && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(90deg, #6366f110, #fff)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-shield-alt" style={{ color: '#6366f1' }} />
                                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px' }}>Override Rules</span>
                                <span style={{ background: '#6366f120', color: '#6366f1', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                                    {stageMappingRules.length} active
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>· These take priority over default mappings</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-light)' }}>
                                        {['Priority', 'Activity', 'Purpose', 'Outcome', '→ Stage', 'Required Form', 'Active', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...stageMappingRules].sort((a, b) => (a.priority || 99) - (b.priority || 99)).map(rule => (
                                        <tr key={rule.id} style={{ borderTop: '1px solid #f1f5f9', opacity: rule.isActive ? 1 : 0.5 }}>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ background: 'var(--bg-light)', borderRadius: '4px', padding: '2px 8px', fontWeight: 700, color: 'var(--text-main)' }}>#{rule.priority}</span>
                                            </td>
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{typeof rule.activityType === 'object' ? rule.activityType.lookup_value : (rule.activityType || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Any</span>)}</td>
                                            <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{typeof rule.purpose === 'object' ? rule.purpose.lookup_value : (rule.purpose || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Any</span>)}</td>
                                            <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{typeof rule.outcome === 'object' ? rule.outcome.lookup_value : (rule.outcome || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Any</span>)}</td>
                                            <td style={{ padding: '10px 16px' }}><StageChip stage={rule.stage} /></td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <FormChipsSelector
                                                    value={Array.isArray(rule.requiredForms) ? rule.requiredForms : (rule.requiredForm ? [rule.requiredForm] : [])}
                                                    onChange={forms => updateStageMappingRule(rule.id, { requiredForms: forms, requiredForm: forms[0] || '' })}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                                    <input type="checkbox" checked={rule.isActive} onChange={e => updateStageMappingRule(rule.id, { isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: rule.isActive ? '#10b981' : 'var(--border-color)', borderRadius: '34px', transition: '.3s' }} />
                                                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: rule.isActive ? '19px' : '3px', bottom: '3px', backgroundColor: 'var(--bg-card)', borderRadius: '50%', transition: '.3s' }} />
                                                </label>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <button onClick={() => { if (window.confirm('Delete this override rule?')) { deleteStageMappingRule(rule.id); showToast('Rule deleted'); } }}
                                                    style={{ border: 'none', background: 'var(--danger-bg)', color: '#ef4444', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>
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
                    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <i className="fas fa-table" style={{ color: 'var(--text-muted)' }} />
                                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px' }}>Default Outcome Mappings</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--border-color)', fontSize: '12px' }} />
                                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                                    style={{ padding: '7px 12px 7px 30px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', width: '180px' }} />
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-light)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Activity</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Purpose</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Outcome</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Score</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>→ Stage</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Required Form</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rulesLoading && (
                                    <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6366f1' }}>
                                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }} />Loading stage rules from backend...
                                    </td></tr>
                                )}
                                {!rulesLoading && filteredRows.map((row) => {
                                    const key = row.id || `${row.activityType}|${row.purpose}|${row.outcome}`;
                                    const isEditing = editingStageCell === key;
                                    const forms = Array.isArray(row.requiredForms) ? row.requiredForms : (row.requiredForm ? [row.requiredForm] : []);
                                    return (
                                        <tr key={key} style={{ borderTop: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ background: '#3b82f610', color: '#3b82f6', borderRadius: '6px', padding: '3px 8px', fontWeight: 700, fontSize: '12px' }}>{renderValue(row.activityType)}</span>
                                            </td>
                                            <td style={{ padding: '10px 16px', color: 'var(--text-main)', fontSize: '12px' }}>{renderValue(row.purpose) || <span style={{ color: 'var(--border-color)' }}>Any</span>}</td>
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                {renderValue(row.outcome)}
                                                {row.reason && row.reason !== '*' && (
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
                                                        <i className="fas fa-tag" style={{ marginRight: '4px' }} />{renderValue(row.reason)}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                                                    <i className="fas fa-ban" style={{ fontSize: '10px' }} />
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {isEditing ? (
                                                    <select autoFocus
                                                        defaultValue={row.newStage}
                                                        onChange={e => {
                                                            updateBackendRule(key, { newStage: e.target.value });
                                                            setEditingStageCell(null);
                                                            showToast('Stage updated');
                                                        }}
                                                        onBlur={() => setEditingStageCell(null)}
                                                        style={{ padding: '4px 8px', border: '1px solid #6366f1', borderRadius: '6px', fontSize: '12px' }}
                                                    >
                                                        {STAGE_LABELS.filter(s => s.toLowerCase() !== 'closed').concat(['Won', 'Lost', 'Unqualified']).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setEditingStageCell(key)}>
                                                        <StageChip stage={row.newStage} />
                                                        <i className="fas fa-pencil-alt" style={{ color: 'var(--border-color)', fontSize: '10px' }} />
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <FormChipsSelector
                                                    value={forms}
                                                    onChange={newForms => {
                                                        updateBackendRule(key, { requiredForms: newForms });
                                                        showToast('Required forms updated');
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!rulesLoading && filteredRows.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No results match your filters</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: Stage Pipeline */}
            {activeTab === 'pipeline' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                        {STAGE_PIPELINE.map(stage => {
                            const rows = backendRules.filter(r => r.newStage === stage.label);
                            return (
                                <div key={stage.id} style={{ background: 'var(--bg-card)', borderRadius: '12px', border: `1px solid ${stage.color}30`, overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 16px', background: stage.color + '12', borderBottom: `1px solid ${stage.color}20`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: stage.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '14px' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 800, color: stage.color, fontSize: '14px' }}>{stage.label}</div>
                                            <div style={{ fontSize: '11px', color: stage.color, opacity: 0.7 }}>{rows.length} outcomes</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 16px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {rows.length === 0 ? (
                                            <p style={{ fontSize: '12px', color: 'var(--border-color)', textAlign: 'center', fontStyle: 'italic' }}>No mappings</p>
                                        ) : (
                                            rows.map((r, i) => (
                                                <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px', padding: '8px', background: 'var(--bg-light)', borderRadius: '6px', borderLeft: `3px solid ${stage.color}60` }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>{r.activityType}</span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>{r.outcome}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB 3: Lead ↔ Deal Sync Engine */}
            {activeTab === 'sync' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: 'var(--bg-light)' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px' }}>Sync Rules</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead><tr style={{ background: 'var(--bg-light)' }}>
                                {['#', 'Rule', 'Condition', '→ Deal Stage', 'Active'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {[...syncRules].sort((a, b) => a.priority - b.priority).map(rule => (
                                    <tr key={rule.id} style={{ borderTop: '1px solid #f1f5f9', opacity: rule.isActive ? 1 : 0.5 }}>
                                        <td style={{ padding: '10px 16px' }}><span style={{ background: 'var(--bg-light)', borderRadius: '4px', padding: '2px 8px', fontWeight: 700 }}>#{rule.priority}</span></td>
                                        <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{rule.label}</td>
                                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{rule.condition}</td>
                                        <td style={{ padding: '10px 16px' }}><StageChip stage={rule.dealStage} /></td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                                <input type="checkbox" checked={rule.isActive} onChange={e => updateSyncRule(rule.id, { isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                                <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: rule.isActive ? '#10b981' : 'var(--border-color)', borderRadius: '34px', transition: '.3s' }} />
                                                <span style={{ position: 'absolute', height: '14px', width: '14px', left: rule.isActive ? '19px' : '3px', bottom: '3px', backgroundColor: 'var(--bg-card)', borderRadius: '50%', transition: '.3s' }} />
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StagePage;
