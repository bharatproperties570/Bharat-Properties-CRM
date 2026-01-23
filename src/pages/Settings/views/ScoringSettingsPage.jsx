import React, { useState } from 'react';

const ScoringSettingsPage = () => {
    const [weights, setWeights] = useState({
        requirement: 32,
        budget: 10,
        location: 10,
        timeline: 10,
        payment: 10,
        source: 5
    });

    const [activityWeights, setActivityWeights] = useState({
        CONNECTED_CALL: 10,
        WHATSAPP_REPLY: 6,
        VISIT_SCHEDULED: 8,
        VISIT_COMPLETED: 12,
        EMAIL_OPEN: 2,
        INACTIVITY_7D: -5,
        FOLLOWUP_MISSED: -10
    });

    return (
        <div style={{ flex: 1, padding: '32px 40px', background: '#fff', overflowY: 'auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Lead Scoring Configuration</h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Configure how points are calculated for Lead Form data and Communication activities.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                {/* Form Weights */}
                <div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-file-invoice" style={{ color: '#3b82f6' }}></i> Form Field Weights (Max 52)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {Object.entries(weights).map(([key, val]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' ')}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input 
                                        type="number" 
                                        value={val} 
                                        onChange={(e) => setWeights({...weights, [key]: parseInt(e.target.value)})}
                                        style={{ width: '60px', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>pts</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activity Weights */}
                <div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-bolt" style={{ color: '#10b981' }}></i> Dynamic Activity Weights
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {Object.entries(activityWeights).map(([key, val]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{key.replace(/_/g, ' ')}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input 
                                        type="number" 
                                        value={val} 
                                        onChange={(e) => setActivityWeights({...activityWeights, [key]: parseInt(e.target.value)})}
                                        style={{ width: '60px', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: val < 0 ? '#ef4444' : '#10b981' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>pts</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '40px', padding: '20px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <i className="fas fa-info-circle" style={{ color: '#0ea5e9', marginTop: '3px' }}></i>
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1', marginBottom: '4px' }}>AI Tip: Balancing the Score</div>
                        <p style={{ fontSize: '0.8rem', color: '#0369a1', lineHeight: '1.4' }}>
                            Ensuring Form Scores stay capped at 52 maintains accurate initial temperature. 
                            Activity scores reflect real-time engagement and should have higher weights for actions like "Site Visit Completed".
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScoringSettingsPage;
