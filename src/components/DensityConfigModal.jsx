import React, { useState } from 'react';

const DensityConfigModal = ({ currentTargets, onSave, onClose }) => {
    const [targets, setTargets] = useState(currentTargets || {});

    const updateTarget = (stage, value) => {
        setTargets(prev => ({
            ...prev,
            [stage]: { ...prev[stage], targetDays: Number(value) }
        }));
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '450px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Configure Stage Density Targets</h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '18px' }}>&times;</button>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Set the expected pipeline age (in days) for each stage to monitor density effectively.</p>
                    {['Incoming', 'Prospect', 'Opportunity', 'Negotiation'].map(stage => (
                        <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{stage} (Days)</label>
                            <input 
                                type="number" 
                                value={targets[stage]?.targetDays || 0} 
                                onChange={e => updateTarget(stage, e.target.value)}
                                style={{ width: '100px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} 
                            />
                        </div>
                    ))}
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => { onSave(targets); onClose(); }} style={{ padding: '8px 16px', border: 'none', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Save Targets</button>
                </div>
            </div>
        </div>
    );
};

export default DensityConfigModal;
