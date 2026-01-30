import React, { useState } from 'react';
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
        dealScoringRules, updateDealScoringRules,
        scoreBands, updateScoreBands,
        scoringConfig, updateScoringConfig
    } = usePropertyConfig();

    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [activeTab, setActiveTab] = useState('lead'); // 'lead', 'deal', 'bands', 'ai'

    // Activity Selector State (for Section B)
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedPurpose, setSelectedPurpose] = useState(null);

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ ...notification, show: false }), 3000);
    };

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
        updateDealScoringRules(section, { [key]: { ...dealScoringRules[section][key], points: parseInt(value) || 0 } });
    };

    // Score Band Handlers
    const handleBandChange = (key, field, value) => {
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

                        {/* E. Time Decay */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader
                                title="E. Time Decay"
                                subtitle="Inactivity Penalties"
                                icon="fa-hourglass-start"
                                color="#ef4444"
                                isEnabled={scoringConfig?.decay?.enabled}
                                onToggle={(val) => updateScoringConfig('decay', { enabled: val })}
                            />
                            <div style={{ padding: '20px', opacity: scoringConfig?.decay?.enabled ? 1 : 0.5, pointerEvents: scoringConfig?.decay?.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="Deal Stage Score" icon="fa-flag-checkered" color="#3b82f6" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(dealScoringRules.stages).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleDealRuleChange('stages', key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="Negotiation Signals" icon="fa-comments-dollar" color="#10b981" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(dealScoringRules.signals).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleDealRuleChange('signals', key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="Risk Penalties" icon="fa-exclamation-triangle" color="#ef4444" />
                            <div style={{ padding: '20px' }}>
                                {Object.entries(dealScoringRules.risks).map(([key, data]) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.9rem' }}>{data.label}</span>
                                        <PointsInput value={data.points} onChange={(e) => handleDealRuleChange('risks', key, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- SCORE BANDS TAB --- */}
                {activeTab === 'bands' && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <SectionHeader title="Score Bands & Automation" subtitle="Define what scores mean and what they trigger" icon="fa-layer-group" color="#8b5cf6" />
                            <div style={{ padding: '24px' }}>
                                {Object.entries(scoreBands).map(([key, band]) => (
                                    <div key={key} style={{ marginBottom: '24px', border: `1px solid ${band.color}`, borderRadius: '12px', overflow: 'hidden' }}>
                                        <div style={{ background: `${band.color}10`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${band.color}30` }}>
                                            <span style={{ fontWeight: 700, color: band.color, fontSize: '1.1rem' }}>{band.label}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="number" value={band.min} onChange={(e) => handleBandChange(key, 'min', e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                                <span style={{ color: '#64748b' }}>to</span>
                                                <input type="number" value={band.max} onChange={(e) => handleBandChange(key, 'max', e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                            </div>
                                        </div>
                                        <div style={{ padding: '16px', fontSize: '0.9rem', color: '#475569' }}>
                                            <strong>Effective Actions:</strong>
                                            {key === 'cold' && <ul style={{ margin: '8px 0 0 20px' }}><li>Mark as Dormant</li><li>Pause marketing sequences</li><li>Add "Cold" tag</li></ul>}
                                            {key === 'warm' && <ul style={{ margin: '8px 0 0 20px' }}><li>Auto-assign to junior sales</li><li>Start WhatsApp + Call sequence</li><li>Enable reminders</li></ul>}
                                            {key === 'hot' && <ul style={{ margin: '8px 0 0 20px' }}><li>Auto-match inventory</li><li>Push to Deal creation</li><li>Alert assigned agent</li></ul>}
                                            {key === 'superHot' && <ul style={{ margin: '8px 0 0 20px' }}><li>Manager notification</li><li>Priority badge</li><li>SLA timer start</li></ul>}
                                        </div>
                                    </div>
                                ))}
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
