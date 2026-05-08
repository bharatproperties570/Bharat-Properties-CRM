import { useState } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';

const ScoringSettingsPage = () => {
    const {
        scoringAttributes, updateScoringAttributes,
        activityMasterFields, updateActivityMasterFields,
        decayRules, updateDecayRules,
        sourceQualityScores, updateSourceQualityScores,
        inventoryFitScores, updateInventoryFitScores,
        stageMultipliers, updateStageMultipliers,
        dealScoringRules: rawDealRules, updateDealScoringRules,
        scoreBands, updateScoreBands,
        scoringConfig, updateScoringConfig,
        agingRules, updateAgingRule
    } = usePropertyConfig();

    // --- SENIOR PROFESSIONAL DEFAULTS (Ensures UI is never empty) ---
    const DEAL_DEFAULTS = {
        stageWeights: {
            open: { label: 'Open', points: 20 },
            quote: { label: 'Quote', points: 40 },
            negotiation: { label: 'Negotiation', points: 60 },
            booked: { label: 'Booked', points: 80 },
            closed: { label: 'Closed', points: 100 }
        },
        activityRecency: {
            last24h: { label: 'Activity in last 24h', points: 15 },
            last3d: { label: 'Activity in last 3 days', points: 10 },
            last7d: { label: 'Activity in last 7 days', points: 5 },
            noActivity7d: { label: 'No activity > 7 days', points: -10 },
            hotThresholdDays: 1,
            warmThresholdDays: 3,
            coldThresholdDays: 7
        },
        historyDepth: {
            interactions5Plus: { label: '5+ Interactions', points: 10 },
            interactions10Plus: { label: '10+ Interactions', points: 20 },
            meetingsDone: { label: 'Meeting Conducted', points: 15 },
            interactionsSomeThreshold: 5,
            interactionsManyThreshold: 10
        }
    };

    // Deep Merge Defaults with DB Data
    const dealScoringRules = {
        stageWeights: { ...DEAL_DEFAULTS.stageWeights, ...(rawDealRules?.stageWeights || {}) },
        activityRecency: { ...DEAL_DEFAULTS.activityRecency, ...(rawDealRules?.activityRecency || {}) },
        historyDepth: { ...DEAL_DEFAULTS.historyDepth, ...(rawDealRules?.historyDepth || {}) }
    };

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [activeTab, setActiveTab] = useState('lead'); // 'lead', 'deal', 'bands', 'ai'

    // Activity Selector State (for Section B)
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedPurpose, setSelectedPurpose] = useState(null);



    // --- Handlers ---
    const handleAttributeChange = (key, value) => {
        updateScoringAttributes({ [key]: { ...scoringAttributes[key], points: parseInt(value) || 0 } });
    };

    const handleSourceChange = (key, value) => updateSourceQualityScores({ [key]: { ...sourceQualityScores[key], points: parseInt(value) || 0 } });
    const handleInventoryFitChange = (key, value) => updateInventoryFitScores({ [key]: { ...inventoryFitScores[key], points: parseInt(value) || 0 } });
    const handleDecayChange = (key, value) => updateDecayRules({ [key]: { ...decayRules[key], points: parseInt(value) || 0 } });
    const handleMultiplierChange = (key, value) => updateStageMultipliers({ [key]: { ...stageMultipliers[key], value: parseFloat(value) || 0 } });

    // Deal Scoring Handlers
    const handleDealRuleChange = (section, key, value) => {
        if (!dealScoringRules || !section) return;
        
        const sectionData = dealScoringRules[section] || {};
        const existing = sectionData[key];
        const val = parseInt(value) || 0;
        
        if (existing && typeof existing === 'object' && ('points' in existing || 'label' in existing)) {
            updateDealScoringRules(section, { [key]: { ...existing, points: val } });
        } else {
            // Direct value (like hotThresholdDays)
            updateDealScoringRules(section, { [key]: val });
        }
    };

    // Score Band Handlers
    const handleBandChange = (key, field, value) => {
        if (!scoreBands || !scoreBands[key]) return;
        updateScoreBands({ [key]: { ...scoreBands[key], [field]: parseInt(value) || 0 } });
    };

    // Activity Handlers
    const handleActivityScoreChange = (outcomeLabel, newScore) => {
        if (!selectedActivity || !selectedPurpose) return;
        const activities = [...activityMasterFields.activities];
        const actIdx = activities.findIndex(a => a.name === selectedActivity.name);
        if (actIdx === -1) return;
        const purpIdx = activities[actIdx].purposes.findIndex(p => p.name === selectedPurpose.name);
        if (purpIdx === -1) return;
        const outcomeIdx = activities[actIdx].purposes[purpIdx].outcomes.findIndex(o => o.label === outcomeLabel);
        if (outcomeIdx === -1) return;

        activities[actIdx].purposes[purpIdx].outcomes[outcomeIdx].score = parseInt(newScore) || 0;
        updateActivityMasterFields(activities);
        setSelectedActivity(activities[actIdx]);
        setSelectedPurpose(activities[actIdx].purposes[purpIdx]);
    };

    const tabs = [
        { id: 'lead', label: 'Lead Scoring Engine', icon: 'fa-calculator' },
        { id: 'deal', label: 'Deal Scoring Engine', icon: 'fa-handshake' },
        { id: 'bands', label: 'Score Bands & Actions', icon: 'fa-layer-group' },
        { id: 'ai', label: 'AI Explainability', icon: 'fa-brain' },
    ];

    const SectionHeader = ({ title, subtitle, icon, color = '#3b82f6', isEnabled = true, onToggle }) => (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`fas ${icon}`} style={{ color: color }}></i>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>{title}</h3>
                    {subtitle && <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{subtitle}</p>}
                </div>
            </div>
            {onToggle && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isEnabled ? '#10b981' : '#cbd5e1' }}>
                        {isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                        <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => onToggle(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: isEnabled ? color : '#cbd5e1', transition: '.4s', borderRadius: '34px'
                        }}></span>
                        <span style={{
                            position: 'absolute', content: '""', height: '18px', width: '18px', left: isEnabled ? '22px' : '4px', bottom: '3px',
                            backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                        }}></span>
                    </label>
                </div>
            )}
        </div>
    );

    const PointsInput = ({ value, onChange, isMultiplier = false, disabled = false }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: disabled ? 0.5 : 1 }}>
            <input
                type="number"
                step={isMultiplier ? "0.1" : "1"}
                value={value}
                onChange={onChange}
                disabled={disabled}
                style={{
                    width: isMultiplier ? '60px' : '70px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: value > 0 || isMultiplier ? '#10b981' : value < 0 ? '#ef4444' : '#64748b',
                    outline: 'none',
                    background: '#fff',
                    cursor: disabled ? 'not-allowed' : 'text'
                }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>{isMultiplier ? 'x' : 'pts'}</span>
        </div>
    );

    return (
        <div style={{ flex: 1, height: '100%', background: '#f8fafc', padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {notification.show && <Toast message={notification.message} type={notification.type} onClose={() => setNotification({ ...notification, show: false })} />}

            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Scoring Configuration</h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Configure the Final Lead & Deal Scoring Formulas powering your CRM.</p>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '1px' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 16px',
                            background: activeTab === tab.id ? '#fff' : 'transparent',
                            border: activeTab === tab.id ? '1px solid #e2e8f0' : 'none',
                            borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '1px solid transparent',
                            marginBottom: '-1px',
                            borderRadius: activeTab === tab.id ? '8px 8px 0 0' : '8px',
                            color: activeTab === tab.id ? '#3b82f6' : '#64748b',
                            fontWeight: activeTab === tab.id ? 600 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontSize: '0.9rem'
                        }}
                    >
                        <i className={`fas ${tab.icon}`}></i>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                {/* --- LEAD SCORING TAB --- */}
                {activeTab === 'lead' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', paddingBottom: '40px' }}>

                        {/* A. Attribute Score */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="A. Attribute Score" subtitle="Static Intent (Max 77)" icon="fa-list-ul" color="#3b82f6" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(scoringAttributes).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #f1f5f9' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleAttributeChange(key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* B. Activity Score */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <SectionHeader
                                title="B. Activity Score"
                                subtitle="Dynamic Behaviour"
                                icon="fa-chart-line"
                                color="#8b5cf6"
                                isEnabled={scoringConfig?.behavioural?.enabled}
                                onToggle={(val) => updateScoringConfig('behavioural', { enabled: val })}
                            />
                            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', opacity: scoringConfig?.behavioural?.enabled ? 1 : 0.5, pointerEvents: scoringConfig?.behavioural?.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                <select
                                    className="form-select"
                                    value={selectedActivity?.name || ''}
                                    onChange={(e) => {
                                        const act = activityMasterFields.activities.find(a => a.name === e.target.value);
                                        setSelectedActivity(act);
                                        setSelectedPurpose(null);
                                    }}
                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="">Select Activity...</option>
                                    {activityMasterFields.activities.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                                </select>
                                <select
                                    className="form-select"
                                    value={selectedPurpose?.name || ''}
                                    onChange={(e) => setSelectedPurpose(selectedActivity?.purposes.find(p => p.name === e.target.value))}
                                    disabled={!selectedActivity}
                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="">Select Purpose...</option>
                                    {selectedActivity?.purposes?.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div style={{ padding: '20px', flex: 1, opacity: scoringConfig?.behavioural?.enabled ? 1 : 0.5, pointerEvents: scoringConfig?.behavioural?.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                {selectedPurpose ? (
                                    selectedPurpose.outcomes.map((outcome, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#334155' }}>{outcome.label}</span>
                                            <PointsInput value={outcome.score} onChange={(e) => handleActivityScoreChange(outcome.label, e.target.value)} />
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Select an activity and purpose to edit outcomes.</div>
                                )}
                            </div>
                        </div>

                        {/* C. Source Quality */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="C. Source Quality" subtitle="Inbound vs Outbound" icon="fa-bullhorn" color="#10b981" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(sourceQualityScores).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleSourceChange(key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* D. Inventory Fit */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="D. Inventory Fit" subtitle="Property Matching" icon="fa-home" color="#f59e0b" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(inventoryFitScores).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleInventoryFitChange(key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* E. Time Decay & Dormant Threshold */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader
                                title="E. Time Decay & Dormant Logic"
                                subtitle="Inactivity Penalties & Thresholds"
                                icon="fa-hourglass-start"
                                color="#ef4444"
                                isEnabled={scoringConfig?.decay?.enabled}
                                onToggle={(val) => updateScoringConfig('decay', { enabled: val })}
                            />
                            <div style={{ padding: '20px', opacity: scoringConfig?.decay?.enabled ? 1 : 0.5, pointerEvents: scoringConfig?.decay?.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                {/* Threshold Settings */}
                                <div style={{ marginBottom: '20px', padding: '16px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-bed" style={{ color: '#ef4444' }} />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#991b1b' }}>Dormant Threshold (Days)</span>
                                        </div>
                                        <input 
                                            type="number" 
                                            value={scoringConfig?.decay?.dormantThresholdDays || 7} 
                                            onChange={(e) => updateScoringConfig('decay', { ...scoringConfig.decay, dormantThresholdDays: parseInt(e.target.value) || 0 })}
                                            style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #fecaca', textAlign: 'center', fontWeight: 700 }}
                                        />
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#b91c1c' }}>Leads with no activity for more than these days will automatically move to <strong>Dormant</strong> status.</p>
                                </div>

                                {/* Stalled Threshold Settings */}
                                <div style={{ marginBottom: '20px', padding: '16px', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-pause-circle" style={{ color: '#d97706' }} />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>Negotiation Stalled (Days)</span>
                                        </div>
                                        <input 
                                            type="number" 
                                            value={agingRules?.negotiationStalledDays?.value || 21} 
                                            onChange={(e) => updateAgingRule({ ...agingRules, negotiationStalledDays: { ...agingRules.negotiationStalledDays, value: parseInt(e.target.value) || 0 } })}
                                            style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #fcd34d', textAlign: 'center', fontWeight: 700 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-clock" style={{ color: '#d97706' }} />
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>Opportunity Risk (Days)</span>
                                        </div>
                                        <input 
                                            type="number" 
                                            value={agingRules?.opportunityMaxDays?.value || 30} 
                                            onChange={(e) => updateAgingRule({ ...agingRules, opportunityMaxDays: { ...agingRules.opportunityMaxDays, value: parseInt(e.target.value) || 0 } })}
                                            style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #fcd34d', textAlign: 'center', fontWeight: 700 }}
                                        />
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309' }}>Controls when a deal is flagged as <strong>Stalled</strong> or <strong>At Risk</strong> in the pipeline.</p>
                                </div>

                                {/* Scoring Penalties */}
                                {Object.entries(decayRules).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleDecayChange(key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* F. Stage Multiplier */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="F. Stage Multiplier" subtitle="Funnel Progression" icon="fa-sort-amount-up" color="#6366f1" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(stageMultipliers).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>{data.label}</span>
                                        <PointsInput value={data.value} isMultiplier={true} onChange={(e) => handleMultiplierChange(key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- DEAL SCORING TAB --- */}
                {activeTab === 'deal' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', paddingBottom: '40px' }}>

                        {/* A. Base Stage Allocation */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="A. Base Stage Allocation" subtitle="Deal Progression" icon="fa-tasks" color="#3b82f6" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(dealScoringRules?.stageWeights || {}).length > 0 ? (
                                    Object.entries(dealScoringRules.stageWeights).map(([key, data]) => (
                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #f1f5f9' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{data?.label || key}</span>
                                            <PointsInput value={data?.points || 0} onChange={(e) => handleDealRuleChange('stageWeights', key, e.target.value)} />
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px', fontSize: '0.85rem' }}>
                                        No stages configured. Please check System Settings.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* B. Momentum / Recency */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="B. Activity Momentum" subtitle="Recency & Ageing Thresholds" icon="fa-bolt" color="#f59e0b" />
                            <div style={{ padding: '20px' }}>
                                {/* Threshold Configuration */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px', padding: '12px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '4px' }}>Hot (Days)</label>
                                        <input type="number" value={dealScoringRules?.activityRecency?.hotThresholdDays || 1} onChange={(e) => handleDealRuleChange('activityRecency', 'hotThresholdDays', e.target.value)} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #fcd34d', textAlign: 'center', fontSize: '0.85rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '4px' }}>Warm (Days)</label>
                                        <input type="number" value={dealScoringRules?.activityRecency?.warmThresholdDays || 3} onChange={(e) => handleDealRuleChange('activityRecency', 'warmThresholdDays', e.target.value)} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #fcd34d', textAlign: 'center', fontSize: '0.85rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '4px' }}>Cold (Days)</label>
                                        <input type="number" value={dealScoringRules?.activityRecency?.coldThresholdDays || 7} onChange={(e) => handleDealRuleChange('activityRecency', 'coldThresholdDays', e.target.value)} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #fcd34d', textAlign: 'center', fontSize: '0.85rem' }} />
                                    </div>
                                </div>

                                {Object.entries(dealScoringRules?.activityRecency || {}).filter(([k]) => k.includes('last') || k.includes('noActivity')).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #f1f5f9' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{data?.label || key}</span>
                                        <PointsInput value={data?.points || 0} onChange={(e) => handleDealRuleChange('activityRecency', key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* C. History / Interactions */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="C. History Depth" subtitle="Interaction Thresholds" icon="fa-history" color="#8b5cf6" />
                            <div style={{ padding: '20px' }}>
                                {/* Threshold Configuration */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', padding: '12px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ede9fe' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b21b6', display: 'block', marginBottom: '4px' }}>Some Interactions (Min)</label>
                                        <input type="number" value={dealScoringRules?.historyDepth?.interactionsSomeThreshold || 5} onChange={(e) => handleDealRuleChange('historyDepth', 'interactionsSomeThreshold', e.target.value)} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ddd6fe', textAlign: 'center', fontSize: '0.85rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b21b6', display: 'block', marginBottom: '4px' }}>Many Interactions (Min)</label>
                                        <input type="number" value={dealScoringRules?.historyDepth?.interactionsManyThreshold || 10} onChange={(e) => handleDealRuleChange('historyDepth', 'interactionsManyThreshold', e.target.value)} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #ddd6fe', textAlign: 'center', fontSize: '0.85rem' }} />
                                    </div>
                                </div>

                                {Object.entries(dealScoringRules?.historyDepth || {}).filter(([k]) => k.includes('Plus') || k.includes('Done')).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #f1f5f9' }}>
                                        <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{data?.label || key}</span>
                                        <PointsInput value={data?.points || 0} onChange={(e) => handleDealRuleChange('historyDepth', key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}



                {/* --- SCORE BANDS TAB --- */}
                {activeTab === 'bands' && (
                    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Enterprise Architecture Notice */}
                        <div style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)', border: '1px solid #c4b5fd', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#7c3aed', fontSize: '1.2rem', marginTop: '2px', flexShrink: 0 }} />
                            <div>
                                <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: '4px', fontSize: '0.95rem' }}>
                                    Enterprise Design: Score Bands define Labels — Triggers define Actions
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#5b21b6', lineHeight: 1.5 }}>
                                    Actions are <strong>managed exclusively via Settings → Triggers</strong> using the <code style={{ background: '#ede9fe', padding: '1px 5px', borderRadius: '3px' }}>lead_score_changed</code> event.
                                    This prevents duplicate notifications or sequence enrolments that would occur if both Score Bands and Triggers fired actions simultaneously.
                                </div>
                            </div>
                        </div>

                        {/* Score Bands Cards */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="Score Band Thresholds" subtitle="Set the numeric ranges — actions are configured in Triggers" icon="fa-layer-group" color="#8b5cf6" />
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {Object.entries(scoreBands).map(([key, band]) => {
                                    const bandMeta = {
                                        cold:     { icon: 'fa-snowflake',       desc: 'Inactive or unresponsive leads', triggerEvent: 'crossed_below', threshold: band.max },
                                        warm:     { icon: 'fa-thermometer-half', desc: 'Leads showing moderate interest', triggerEvent: 'crossed_above', threshold: band.min },
                                        hot:      { icon: 'fa-fire',            desc: 'High-intent leads requiring priority attention', triggerEvent: 'crossed_above', threshold: band.min },
                                        superHot: { icon: 'fa-bolt',            desc: 'Immediately deal-ready — escalate to senior agent', triggerEvent: 'crossed_above', threshold: band.min }
                                    }[key] || { icon: 'fa-circle', desc: '' };

                                    return (
                                        <div key={key} style={{ border: `1.5px solid ${band.color}40`, borderRadius: '10px', overflow: 'hidden' }}>
                                            {/* Band Header */}
                                            <div style={{ background: `${band.color}10`, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: band.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <i className={`fas ${bandMeta.icon}`} style={{ color: '#fff', fontSize: '0.85rem' }} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: band.color, fontSize: '1rem' }}>{band.label}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{bandMeta.desc}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Range:</span>
                                                    <input type="number" value={band.min} onChange={(e) => handleBandChange(key, 'min', e.target.value)}
                                                        style={{ width: '56px', padding: '5px 8px', textAlign: 'center', borderRadius: '6px', border: `1px solid ${band.color}60`, fontWeight: 700, color: band.color }} />
                                                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>—</span>
                                                    <input type="number" value={band.max} onChange={(e) => handleBandChange(key, 'max', e.target.value)}
                                                        style={{ width: '56px', padding: '5px 8px', textAlign: 'center', borderRadius: '6px', border: `1px solid ${band.color}60`, fontWeight: 700, color: band.color }} />
                                                </div>
                                            </div>

                                            {/* Trigger Reference — No duplicate actions */}
                                            <div style={{ padding: '12px 18px', background: '#fafafa', borderTop: `1px solid ${band.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#475569' }}>
                                                    <i className="fas fa-bolt" style={{ color: '#6366f1' }} />
                                                    <span>Actions configured in <strong>Triggers</strong> via event:</span>
                                                    <code style={{ background: '#f1f5f9', padding: '2px 7px', borderRadius: '4px', color: '#6366f1', fontWeight: 700 }}>
                                                        lead_score_changed → score {bandMeta.triggerEvent === 'crossed_above' ? 'crossed ≥' : 'dropped <'} {bandMeta.threshold}
                                                    </code>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '0.8rem' }} />
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Conflict-Free</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Quick-nav to Triggers */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <i className="fas fa-external-link-alt" style={{ color: '#6366f1', fontSize: '1.1rem' }} />
                                <div>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Configure Score-Based Actions</div>
                                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Go to Settings → Business Rules → Triggers → filter by <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>lead_score_changed</code></div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 700, padding: '8px 16px', background: '#eef2ff', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                                Settings → Triggers
                            </div>
                        </div>
                    </div>
                )}

                {/* --- AI EXPLAINABILITY TAB --- */}
                {activeTab === 'ai' && (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '40px', maxWidth: '600px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                            <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2rem' }}>
                                <i className="fas fa-magic"></i>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>"Why This Score?"</h2>
                            <p style={{ color: '#475569', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '32px' }}>
                                The Explainability Engine will appear in the right sidebar for every lead.
                                It breaks down the score calculation (Attributes + Activity + Fit) so agents never have to guess.
                            </p>
                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>Preview</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 700, color: '#0f172a' }}>
                                    <span>Lead Score</span>
                                    <span style={{ color: '#ef4444' }}>78 (Hot)</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '4px' }}>+ Detailed requirement filled (+32)</div>
                                <div style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '4px' }}>+ Budget matched (+10)</div>
                                <div style={{ fontSize: '0.9rem', color: '#ef4444', marginBottom: '4px' }}>- No activity in 7 days (-5)</div>
                            </div>
                            {/* AI Toggle */}
                            <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 600, color: scoringConfig?.ai?.enabled ? '#10b981' : '#64748b' }}>
                                    {scoringConfig?.ai?.enabled ? 'AI Engine Enabled' : 'AI Engine Disabled'}
                                </span>
                                <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '28px' }}>
                                    <input
                                        type="checkbox"
                                        checked={scoringConfig?.ai?.enabled || false}
                                        onChange={(e) => updateScoringConfig('ai', { enabled: e.target.checked })}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: scoringConfig?.ai?.enabled ? '#8b5cf6' : '#cbd5e1', transition: '.4s', borderRadius: '34px'
                                    }}></span>
                                    <span style={{
                                        position: 'absolute', content: '""', height: '22px', width: '22px', left: scoringConfig?.ai?.enabled ? '24px' : '4px', bottom: '3px',
                                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                    }}></span>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ScoringSettingsPage;
