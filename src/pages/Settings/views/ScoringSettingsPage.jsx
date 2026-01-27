import React, { useState } from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import Toast from '../../../components/Toast';

const ScoringSettingsPage = () => {
    const { scoringAttributes, updateScoringAttributes, activityMasterFields, updateActivityMasterFields } = usePropertyConfig();
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // Activity Selector State
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedPurpose, setSelectedPurpose] = useState(null);

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ ...notification, show: false }), 3000);
    };

    // --- Handlers for Attributes ---
    const handleAttributeChange = (key, value) => {
        updateScoringAttributes({
            [key]: { ...scoringAttributes[key], points: parseInt(value) || 0 }
        });
    };

    // --- Handlers for Activity Scores ---
    const handleScoreChange = (outcomeLabel, newScore) => {
        if (!selectedActivity || !selectedPurpose) return;

        const activities = [...activityMasterFields.activities];
        const actIdx = activities.findIndex(a => a.name === selectedActivity.name);
        if (actIdx === -1) return;

        const purpIdx = activities[actIdx].purposes.findIndex(p => p.name === selectedPurpose.name);
        if (purpIdx === -1) return;

        const outcomeIdx = activities[actIdx].purposes[purpIdx].outcomes.findIndex(o => o.label === outcomeLabel);
        if (outcomeIdx === -1) return;

        activities[actIdx].purposes[purpIdx].outcomes[outcomeIdx].score = parseInt(newScore) || 0;

        // Optimistic update for UI responsiveness (though Context update will trigger re-render)
        updateActivityMasterFields(activities);

        // Update local state refs to keep UI in sync
        setSelectedActivity(activities[actIdx]);
        setSelectedPurpose(activities[actIdx].purposes[purpIdx]);
    };

    return (
        <div style={{ flex: 1, height: '100%', background: '#f8fafc', padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {notification.show && <Toast message={notification.message} type={notification.type} onClose={() => setNotification({ ...notification, show: false })} />}

            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Scoring Configuration</h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Define points for Lead Attributes and Activity Outcomes to automate lead temperature.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px', flex: 1, minHeight: 0 }}>

                {/* Panel 1: Lead Attributes */}
                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-sliders-h" style={{ color: '#3b82f6' }}></i> Attribute Weights
                        </h3>
                    </div>
                    <div style={{ padding: '24px', overflowY: 'auto' }}>
                        {Object.entries(scoringAttributes).map(([key, data]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{data.label}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Static weight per occurrence</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        value={data.points}
                                        onChange={(e) => handleAttributeChange(key, e.target.value)}
                                        style={{
                                            width: '70px', padding: '8px', borderRadius: '8px',
                                            border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700,
                                            color: '#3b82f6', outline: 'none'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>pts</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel 2: Activity Outcomes */}
                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-chart-line" style={{ color: '#10b981' }}></i> Activity Outcome Scores
                        </h3>
                    </div>

                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, padding: '16px', borderRight: '1px solid #f1f5f9' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Select Activity</label>
                            <select
                                value={selectedActivity?.name || ''}
                                onChange={(e) => {
                                    const act = activityMasterFields.activities.find(a => a.name === e.target.value);
                                    setSelectedActivity(act);
                                    setSelectedPurpose(null);
                                }}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                            >
                                <option value="">-- Choose Activity --</option>
                                {activityMasterFields.activities.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1, padding: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Select Purpose</label>
                            <select
                                value={selectedPurpose?.name || ''}
                                onChange={(e) => {
                                    const purp = selectedActivity?.purposes.find(p => p.name === e.target.value);
                                    setSelectedPurpose(purp);
                                }}
                                disabled={!selectedActivity}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', opacity: !selectedActivity ? 0.5 : 1 }}
                            >
                                <option value="">-- Choose Purpose --</option>
                                {selectedActivity?.purposes?.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                        {!selectedPurpose ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column', gap: '12px' }}>
                                <i className="fas fa-hand-pointer" style={{ fontSize: '2rem', opacity: 0.5 }}></i>
                                <span>Select an Activity and Purpose to edit scores</span>
                            </div>
                        ) : (
                            <div>
                                <h4 style={{ margin: '0 0 20px 0', fontSize: '0.95rem', color: '#64748b' }}>Outcomes for <span style={{ color: '#0f172a', fontWeight: 700 }}>{selectedPurpose.name}</span></h4>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {selectedPurpose.outcomes.map((outcome, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9'
                                        }}>
                                            <span style={{ fontWeight: 600, color: '#334155' }}>{outcome.label}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={outcome.score}
                                                    onChange={(e) => handleScoreChange(outcome.label, e.target.value)}
                                                    style={{
                                                        width: '70px', padding: '8px', borderRadius: '8px',
                                                        border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700,
                                                        color: outcome.score > 0 ? '#10b981' : outcome.score < 0 ? '#ef4444' : '#64748b',
                                                        outline: 'none'
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '20px' }}>pts</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScoringSettingsPage;
