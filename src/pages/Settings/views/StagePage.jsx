import React, { useState, useMemo } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';
import {
    STAGE_PIPELINE, STAGE_LABELS, flattenOutcomeMappings,
    STAGE_STABILITY_CONFIG, getStageProbability
} from '../../../utils/stageEngine';
import {
    DEFAULT_AGING_RULES, computeStageDensity,
    detectCommissionLeakage, DEFAULT_STAGE_DENSITY_TARGETS
} from '../../../utils/agingEngine';

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

// ─────────────────────────────────────────────
// Add Override Rule Modal
// ─────────────────────────────────────────────

const AddRuleModal = ({ activityMasterFields, onSave, onClose }) => {
    const [activityType, setActivityType] = useState('');
    const [purpose, setPurpose] = useState('');
    const [outcome, setOutcome] = useState('');
    const [stage, setStage] = useState('Prospect');
    const [priority, setPriority] = useState('1');

    const activities = activityMasterFields?.activities || [];
    const purposes = activities.find(a => a.name === activityType)?.purposes || [];
    const outcomes = purposes.find(p => p.name === purpose)?.outcomes || [];

    const canSave = stage && (activityType || purpose || outcome);

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

                    {/* Outcome */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Outcome</label>
                        <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={!purpose}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', opacity: !purpose ? 0.5 : 1 }}>
                            <option value="">— Any Outcome —</option>
                            {outcomes.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Arrow indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                            {activityType || 'Any Activity'}{purpose ? ` → ${purpose}` : ''}{outcome ? ` → ${outcome}` : ''}
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

                    {/* Priority */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Priority (1 = highest)</label>
                        <input type="number" min="1" value={priority} onChange={e => setPriority(e.target.value)}
                            style={{ width: '80px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', fontWeight: 700 }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button disabled={!canSave} onClick={() => { onSave({ activityType, purpose, outcome, stage, priority: parseInt(priority) || 1 }); onClose(); }}
                        style={{ padding: '10px 24px', background: canSave ? '#6366f1' : '#e2e8f0', color: canSave ? '#fff' : '#94a3b8', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>
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
        activityMasterFields, updateOutcomeStage,
        stageMappingRules, addStageMappingRule, updateStageMappingRule, deleteStageMappingRule,
        syncRules, updateSyncRule, addSyncRule, deleteSyncRule,
        sequenceConfig, updateSequenceConfig,
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

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(n => ({ ...n, show: false })), 3000);
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
        { id: 'pipeline', label: 'Stage Pipeline', icon: 'fa-stream' },
        { id: 'density', label: 'Stage Density', icon: 'fa-chart-bar' },
        { id: 'stability', label: 'Stability Lock', icon: 'fa-lock' },
        { id: 'status', label: 'Engine Status', icon: 'fa-cog' },
        { id: 'sync', label: 'Lead↔Deal Sync', icon: 'fa-sync-alt' },
        { id: 'sequence', label: 'Sequence Guard', icon: 'fa-project-diagram' },
        { id: 'aging', label: 'Ageing & Decay', icon: 'fa-hourglass-half' },
        { id: 'forecast', label: 'Revenue Forecast', icon: 'fa-chart-line' },
        { id: 'health', label: 'Deal Health', icon: 'fa-heartbeat' },
        { id: 'intent', label: 'Intent Signals', icon: 'fa-brain' },
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
                        {/* Computed badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b98115', border: '1px solid #10b98140', borderRadius: '8px', padding: '6px 12px' }}>
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
                                        {['Priority', 'Activity', 'Purpose', 'Outcome', '→ Stage', 'Active', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                                        ))}
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
                                            <td style={{ padding: '10px 16px', color: '#6b7280' }}>{rule.outcome || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Any</span>}</td>
                                            <td style={{ padding: '10px 16px' }}><StageChip stage={rule.stage} /></td>
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
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Score</th>
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
                                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>{row.outcome}</td>
                                            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                                <span style={{ color: row.score > 0 ? '#10b981' : row.score < 0 ? '#ef4444' : '#94a3b8', fontWeight: 700 }}>
                                                    {row.score > 0 ? '+' : ''}{row.score}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                {isEditing ? (
                                                    <select
                                                        autoFocus
                                                        defaultValue={row.stage}
                                                        onBlur={e => { updateOutcomeStage(row.activityType, row.purpose, row.outcome, e.target.value); setEditingStageCell(null); showToast(`Stage updated to "${e.target.value}"`); }}
                                                        onChange={e => { updateOutcomeStage(row.activityType, row.purpose, row.outcome, e.target.value); setEditingStageCell(null); showToast(`Stage updated`); }}
                                                        style={{ padding: '5px 8px', border: '2px solid #6366f1', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}
                                                    >
                                                        {STAGE_LABELS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setEditingStageCell(key)} title="Click to edit">
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

            {/* ─── TAB 2: Stage Pipeline ─── */}
            {activeTab === 'pipeline' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {STAGE_PIPELINE.map(stage => {
                            const rows = allRows.filter(r => r.stage === stage.label);
                            return (
                                <div key={stage.id} style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${stage.color}30`, overflow: 'hidden' }}>
                                    {/* Header */}
                                    <div style={{ padding: '14px 16px', background: stage.color + '12', borderBottom: `1px solid ${stage.color}20`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: stage.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '14px' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 800, color: stage.color, fontSize: '14px' }}>{stage.label}</div>
                                            <div style={{ fontSize: '11px', color: stage.color, opacity: 0.7 }}>{rows.length} outcome{rows.length !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                    {/* Outcomes */}
                                    <div style={{ padding: '12px 16px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {rows.length === 0 ? (
                                            <p style={{ fontSize: '12px', color: '#cbd5e1', textAlign: 'center', margin: '8px 0', fontStyle: 'italic' }}>No outcomes mapped</p>
                                        ) : (
                                            rows.map((r, i) => (
                                                <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px', padding: '8px', background: '#f8fafc', borderRadius: '6px', borderLeft: `3px solid ${stage.color}60` }}>
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{r.activityType}</span>
                                                    <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>{r.outcome}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Flow diagram */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', overflow: 'auto' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '20px' }}>Pipeline Flow</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {STAGE_PIPELINE.slice(0, -2).map((stage, idx) => (
                                <React.Fragment key={stage.id}>
                                    <div style={{
                                        padding: '10px 16px', borderRadius: '8px', background: stage.color + '15',
                                        border: `1.5px solid ${stage.color}40`, textAlign: 'center', minWidth: '100px'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: stage.color }}>{stage.label}</div>
                                        <div style={{ fontSize: '10px', color: stage.color, opacity: 0.7 }}>{stageCounts[stage.label] || 0} outcomes</div>
                                    </div>
                                    {idx < STAGE_PIPELINE.length - 3 && (
                                        <i className="fas fa-chevron-right" style={{ color: '#cbd5e1' }} />
                                    )}
                                </React.Fragment>
                            ))}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {[STAGE_PIPELINE[6], STAGE_PIPELINE[7]].map(stage => (
                                    <div key={stage.id} style={{
                                        padding: '8px 14px', borderRadius: '8px', background: stage.color + '15',
                                        border: `1.5px solid ${stage.color}40`, textAlign: 'center', minWidth: '100px'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: stage.color }}>{stage.label}</div>
                                        <div style={{ fontSize: '10px', color: stage.color, opacity: 0.7 }}>{stageCounts[stage.label] || 0} outcomes</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── TAB: Stage Density Dashboard ─── */}
            {activeTab === 'density' && (() => {
                // Mock leads data for density computation — in prod these come from API
                const mockLeads = [
                    ...Array(12).fill(null).map(() => ({ stage: 'New', createdAt: new Date(Date.now() - 86400000 * 1), stageChangedAt: null })),
                    ...Array(8).fill(null).map(() => ({ stage: 'Prospect', createdAt: new Date(Date.now() - 86400000 * 8), stageChangedAt: new Date(Date.now() - 86400000 * 7) })),
                    ...Array(5).fill(null).map(() => ({ stage: 'Qualified', createdAt: new Date(Date.now() - 86400000 * 15), stageChangedAt: new Date(Date.now() - 86400000 * 12) })),
                    ...Array(4).fill(null).map(() => ({ stage: 'Opportunity', createdAt: new Date(Date.now() - 86400000 * 22), stageChangedAt: new Date(Date.now() - 86400000 * 20) })),
                    ...Array(3).fill(null).map(() => ({ stage: 'Negotiation', createdAt: new Date(Date.now() - 86400000 * 35), stageChangedAt: new Date(Date.now() - 86400000 * 30) })),
                    ...Array(1).fill(null).map(() => ({ stage: 'Booked', createdAt: new Date(Date.now() - 86400000 * 50), stageChangedAt: new Date(Date.now() - 86400000 * 45) })),
                ];
                const densityData = computeStageDensity(mockLeads, DEFAULT_STAGE_DENSITY_TARGETS);
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
                                    <div key={row.stage} style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', padding: '14px 20px', borderBottom: idx < densityData.length - 1 ? '1px solid #f8fafc' : 'none', background: row.isBottleneck ? '#fef2f2' : 'transparent', transition: 'background 0.2s' }}>
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
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }} />BOTTLENECK
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
            {activeTab === 'stability' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Stability Lock</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                            Prevents false regressions — a stage cannot downgrade until minimum activity thresholds are met
                        </p>
                    </div>

                    {/* How it works */}
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                        <i className="fas fa-info-circle" style={{ color: '#3b82f6', fontSize: '16px', marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
                            <strong>How it works:</strong> When an activity is saved and the computed stage is lower than the current stage (a downgrade), the engine checks
                            if the minimum thresholds are met. If not, the stage stays at its current value and a warning is logged. This prevents a simple
                            "re-introduction call" from accidentally moving a lead from <em>Negotiation</em> back to <em>Prospect</em>.
                        </div>
                    </div>

                    {/* Stability Rules Table */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-lock" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Stability Rules per Stage
                            </span>
                        </div>

                        {/* Header Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr', padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                            {['Stage', 'Min Activities (to downgrade)', 'Min Days in Stage', 'Lock Reason'].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                            ))}
                        </div>

                        {STAGE_PIPELINE.filter(s => !['New', 'Closed Won', 'Closed Lost', 'Stalled'].includes(s.label)).map((stage, idx, arr) => {
                            const lock = STAGE_STABILITY_CONFIG[stage.label];
                            return (
                                <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr', padding: '16px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                                    {/* Stage */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color }} />
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>{stage.label}</span>
                                    </div>
                                    {/* Min Activities */}
                                    <div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 700 }}>
                                            <i className="fas fa-tasks" style={{ fontSize: '11px' }} />
                                            {lock ? (lock.minActivities >= 999 ? 'Locked ∞' : `${lock.minActivities} activity`) : '—'}
                                        </span>
                                    </div>
                                    {/* Min Days */}
                                    <div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 700 }}>
                                            <i className="fas fa-clock" style={{ fontSize: '11px' }} />
                                            {lock ? `${lock.minDays} day${lock.minDays !== 1 ? 's' : ''}` : '—'}
                                        </span>
                                    </div>
                                    {/* Label */}
                                    <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                                        {lock?.label || 'No lock configured'}
                                    </div>
                                </div>
                            );
                        })}
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
            )}

            {/* ─── TAB 3: Engine Status ─── */}
            {activeTab === 'status' && (

                <div style={{ padding: '24px 32px', flex: 1 }}>
                    {/* System Status Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {[
                            { icon: 'fa-robot', label: 'Auto-Computation', value: 'Active', color: '#10b981', sub: 'Runs on every activity save' },
                            { icon: 'fa-ban', label: 'Manual Editing', value: 'Disabled', color: '#ef4444', sub: 'Stage cannot be set manually' },
                            { icon: 'fa-list', label: 'Total Mappings', value: allRows.length, color: '#6366f1', sub: 'Outcome-to-Stage rules' },
                            { icon: 'fa-shield-alt', label: 'Override Rules', value: stageMappingRules.length, color: '#f59e0b', sub: 'Admin-configured priority rules' },
                        ].map(card => (
                            <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: card.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={`fas ${card.icon}`} style={{ color: card.color, fontSize: '16px' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>{card.label}</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: card.color }}>{card.value}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{card.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Engine Logic explanation */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#374151' }}>How Stage Is Computed</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[
                                { step: '1', icon: 'fa-shield-alt', color: '#6366f1', label: 'Check Override Rules', desc: 'Admin-configured explicit rules are checked first, ordered by priority (1 = highest). First match wins.' },
                                { step: '2', icon: 'fa-map', color: '#f59e0b', label: 'Lookup Default Mapping', desc: 'If no override matches, the outcome\'s default stage from the Rule Table is used.' },
                                { step: '3', icon: 'fa-star', color: '#94a3b8', label: 'Fallback to "New"', desc: 'If no mapping is found at all, stage defaults to "New".' },
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

                    {/* Info Banner: Manual editing disabled */}
                    <div style={{ display: 'flex', gap: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px 20px' }}>
                        <i className="fas fa-lock" style={{ color: '#ef4444', marginTop: '2px', fontSize: '16px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: '4px', fontSize: '14px' }}>Manual Stage Editing is System-Disabled</div>
                            <div style={{ fontSize: '13px', color: '#dc2626', lineHeight: '1.5' }}>
                                Stage fields on Lead and Deal forms are read-only. All stage transitions are driven exclusively by activity outcomes recorded in the CRM.
                                This ensures data integrity and accurate pipeline reporting.
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── TAB 4: Lead ↔ Deal Sync Engine ─── */}
            {activeTab === 'sync' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <i className="fas fa-info-circle" style={{ color: '#856404' }} />
                        <span style={{ fontSize: '13px', color: '#856404', fontWeight: 600 }}>Sync runs automatically when a Lead stage changes, a score band changes, or an activity is saved.</span>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>Sync Rules (Priority Order)</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead><tr style={{ background: '#f8fafc' }}>
                                {['#', 'Rule', 'Condition', '→ Deal Stage', 'Active', 'Actions'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {[...syncRules].sort((a, b) => a.priority - b.priority).map(rule => (
                                    <tr key={rule.id} style={{ borderTop: '1px solid #f1f5f9', opacity: rule.isActive ? 1 : 0.5 }}>
                                        <td style={{ padding: '10px 16px' }}><span style={{ background: '#f1f5f9', borderRadius: '4px', padding: '2px 8px', fontWeight: 700 }}>#{rule.priority}</span></td>
                                        <td style={{ padding: '10px 16px', fontWeight: 600, color: '#374151' }}>{rule.label}</td>
                                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: '12px' }}>
                                            {rule.condition === 'ANY_LEAD' && <span style={{ background: '#3b82f615', color: '#3b82f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>ANY lead = {rule.conditionStage}</span>}
                                            {rule.condition === 'ALL_LEADS' && <span style={{ background: '#f59e0b15', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>ALL leads = {rule.conditionStage}</span>}
                                            {rule.condition === 'ACTIVITY' && <span style={{ background: '#8b5cf615', color: '#8b5cf6', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Activity: {rule.conditionActivity}</span>}
                                        </td>
                                        <td style={{ padding: '10px 16px' }}><StageChip stage={rule.dealStage} /></td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                                <input type="checkbox" checked={rule.isActive} onChange={e => updateSyncRule(rule.id, { isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                                                <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: rule.isActive ? '#10b981' : '#cbd5e1', borderRadius: '34px', transition: '.3s' }} />
                                                <span style={{ position: 'absolute', height: '14px', width: '14px', left: rule.isActive ? '19px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '.3s' }} />
                                            </label>
                                        </td>
                                        <td style={{ padding: '10px 16px' }}>
                                            {rule.isLocked
                                                ? <span style={{ fontSize: '11px', color: '#94a3b8' }}><i className="fas fa-lock" /> System</span>
                                                : <button onClick={() => { if (window.confirm('Delete?')) { deleteSyncRule(rule.id); showToast('Rule deleted'); } }} style={{ border: 'none', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}><i className="fas fa-trash" /></button>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '12px', fontSize: '14px' }}>Conflict Resolution — Multi-Lead Priority Order</div>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px' }}>When multiple leads are linked to one Deal, the highest-priority stage wins:</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {['Open', 'Prospect', 'Qualified', 'Opportunity', 'Quote', 'Negotiation', 'Booked', 'Closed Won'].map((s, i, arr) => (
                                <React.Fragment key={s}>
                                    <StageChip stage={s} />
                                    {i < arr.length - 1 && <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '10px' }} />}
                                </React.Fragment>
                            ))}
                            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, marginLeft: '4px' }}>← Highest</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: Sequence Guard ─── */}
            {activeTab === 'sequence' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '12px', fontSize: '14px' }}>Enforcement Mode</div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {[{ id: 'off', label: 'Off', desc: 'No enforcement', color: '#94a3b8' }, { id: 'warn', label: 'Warn', desc: 'Show warning, allow proceed', color: '#f59e0b' }, { id: 'block', label: 'Block', desc: 'Hard block — cannot skip', color: '#ef4444' }].map(m => (
                                <div key={m.id} onClick={() => updateSequenceConfig({ enforcementMode: m.id })} style={{ flex: 1, padding: '14px', borderRadius: '10px', border: `2px solid ${sequenceConfig.enforcementMode === m.id ? m.color : '#e5e7eb'}`, background: sequenceConfig.enforcementMode === m.id ? m.color + '10' : '#f8fafc', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: 800, color: m.color, fontSize: '15px' }}>{m.label}</div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{m.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>Mandatory Stage Sequence</span>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap' }}>
                                {sequenceConfig.sequence.map((step, idx) => (
                                    <React.Fragment key={step.stage}>
                                        <div style={{ textAlign: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e5e7eb', minWidth: '110px' }}>
                                            <i className={`fas ${step.icon}`} style={{ color: '#6366f1', fontSize: '16px', marginBottom: '6px', display: 'block' }} />
                                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '12px' }}>{step.stage}</div>
                                            {step.requiredActivity && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{step.requiredActivity}</div>}
                                        </div>
                                        {idx < sequenceConfig.sequence.length - 1 && <i className="fas fa-arrow-right" style={{ color: '#cbd5e1', margin: '0 4px' }} />}
                                    </React.Fragment>
                                ))}
                            </div>
                            <div style={{ marginTop: '16px', padding: '12px 16px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', fontSize: '13px', color: '#92400e' }}>
                                <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }} />
                                <strong>Warning example:</strong> If a user tries to move a lead directly from <em>New → Negotiation</em>, the system will say: "Stage jump detected. Missing: Prospect, Qualified, Opportunity. Required: Introduction / Call, Requirement Gathering, Follow-up / Site Visit."
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                </div>
            )}

            {/* ─── TAB 7: Revenue Forecast ─── */}
            {activeTab === 'forecast' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                            <div style={{ fontWeight: 700, color: '#374151', fontSize: '15px', marginBottom: '20px' }}>Formula Configuration</div>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>Commission Rate</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input type="number" step="0.1" min="0" max="20" value={forecastConfig.commissionRate.value}
                                        onChange={e => updateForecastConfig('commissionRate', { value: parseFloat(e.target.value) || 0 })}
                                        style={{ width: '80px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontWeight: 800, fontSize: '18px', textAlign: 'center', color: '#10b981' }} />
                                    <span style={{ fontWeight: 700, color: '#374151' }}>%</span>
                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>of Deal Value</span>
                                </div>
                            </div>
                            {Object.entries(forecastConfig).filter(([k]) => k !== 'commissionRate').map(([key, cfg]) => (
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
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
                            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px', color: '#94a3b8' }}>Dashboard Preview</div>
                            {[{ label: 'Total Pipeline Value', value: '₹ 4,20,00,000', color: '#60a5fa' }, { label: 'Weighted Pipeline', value: '₹ 2,94,00,000', color: '#34d399', sub: 'Deals × (Score/100)' }, { label: 'Expected Commission', value: '₹ 58,80,000', color: '#f59e0b', sub: `@ ${forecastConfig.commissionRate.value}%` }].map(row => (
                                <div key={row.label} style={{ marginBottom: '18px' }}>
                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{row.label}</div>
                                    <div style={{ fontSize: '22px', fontWeight: 800, color: row.color }}>{row.value}</div>
                                    {row.sub && <div style={{ fontSize: '11px', color: '#475569' }}>{row.sub}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '10px', fontSize: '14px' }}>Formula</div>
                        <code style={{ display: 'block', background: '#1e293b', color: '#34d399', padding: '16px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                            Weighted Pipeline Value = Deal Value × (Deal Score / 100){`\n`}
                            Expected Commission = Weighted Value × ({forecastConfig.commissionRate.value}% / 100)
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
