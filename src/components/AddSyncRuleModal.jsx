import React, { useState } from 'react';

const AddSyncRuleModal = ({ onSave, onClose }) => {
    const [condition, setCondition] = useState('ANY_LEAD');
    const [conditionStage, setConditionStage] = useState('Closed');
    const [conditionActivity, setConditionActivity] = useState('');
    const [dealStage, setDealStage] = useState('Closed');
    const [priority, setPriority] = useState(10);
    const [label, setLabel] = useState('Custom Sync Rule');

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '500px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Add Sync Rule</h3>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '18px' }}>&times;</button>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Rule Label</label>
                        <input value={label} onChange={e => setLabel(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Priority (Lower is Higher)</label>
                        <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Condition Type</label>
                            <select value={condition} onChange={e => setCondition(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                                <option value="ANY_LEAD">Any Lead</option>
                                <option value="ALL_LEADS">All Leads</option>
                                <option value="ACTIVITY">Activity Occurs</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Condition Value</label>
                            {condition === 'ACTIVITY' ? (
                                <input value={conditionActivity} onChange={e => setConditionActivity(e.target.value)} placeholder="e.g. Site Visit" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} />
                            ) : (
                                <select value={conditionStage} onChange={e => setConditionStage(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                                    {['Incoming', 'Prospect', 'Opportunity', 'Negotiation', 'Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Target Deal Stage</label>
                        <select value={dealStage} onChange={e => setDealStage(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                            {['Incoming', 'Prospect', 'Opportunity', 'Negotiation', 'Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => { onSave({ condition, conditionStage, conditionActivity, dealStage, priority, label }); onClose(); }} style={{ padding: '8px 16px', border: 'none', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Save Rule</button>
                </div>
            </div>
        </div>
    );
};

export default AddSyncRuleModal;
