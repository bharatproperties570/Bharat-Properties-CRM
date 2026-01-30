import React, { useState } from 'react';
import { useSequences } from '../context/SequenceContext';

const CreateSequenceModal = ({ isOpen, onClose, editData }) => {
    const { addSequence, updateSequence } = useSequences();
    const [activeTab, setActiveTab] = useState('basic');
    const [formData, setFormData] = useState(editData || {
        name: '',
        module: 'leads',
        purpose: 'New Lead',
        trigger: { type: 'onCreated', targetStage: '', minScore: 30, maxScore: 100, days: 7 },
        steps: [
            { id: 1, day: 0, time: '09:00', type: 'Call', instruction: 'Follow up' }
        ],
        exitConditions: { onDealCreated: true, onLost: true }
    });

    // Update formData when editData changes
    React.useEffect(() => {
        if (editData) {
            setFormData(editData);
        }
    }, [editData]);

    if (!isOpen) return null;

    const handleAddStep = () => {
        setFormData({
            ...formData,
            steps: [...formData.steps, { id: Date.now(), day: 1, time: '09:00', type: 'Call', instruction: '' }]
        });
    };

    const handleSave = () => {
        if (editData && editData.id) {
            // Update existing sequence
            updateSequence(editData.id, formData);
        } else {
            // Create new sequence
            addSequence(formData);
        }
        onClose();
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', width: '800px', borderRadius: '16px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                        {editData && editData.id ? 'Edit Sequence' : 'Create Sequence'}
                    </h3>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#6b7280' }} onClick={onClose}></i>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                    {['basic', 'trigger', 'steps', 'exit'].map(tab => (
                        <div
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 24px',
                                cursor: 'pointer',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : 'none',
                                color: activeTab === tab ? '#3b82f6' : '#6b7280',
                                fontWeight: '600',
                                textTransform: 'capitalize'
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Sequence Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. New Lead Follow-up"
                                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Applicable Module</label>
                                    <select
                                        value={formData.module}
                                        onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                    >
                                        <option value="leads">Leads</option>
                                        <option value="contacts">Contacts (Nurture Only)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Purpose</label>
                                    <select
                                        value={formData.purpose}
                                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                    >
                                        <option value="New Lead">New Lead</option>
                                        <option value="Follow-up">Follow-up</option>
                                        <option value="Reactivation">Dormant Reactivation</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'trigger' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500' }}>Select Trigger</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                {[
                                    { id: 'onCreated', label: 'Lead Created', icon: 'fa-user-plus' },
                                    { id: 'onStageChange', label: 'Stage Changed', icon: 'fa-sync' },
                                    { id: 'onScoreBandEntry', label: 'Score Band Entry', icon: 'fa-star' },
                                    { id: 'onInactivity', label: 'On Inactivity', icon: 'fa-clock' }
                                ].map(t => (
                                    <div
                                        key={t.id}
                                        onClick={() => setFormData({ ...formData, trigger: { ...formData.trigger, type: t.id } })}
                                        style={{
                                            padding: '16px',
                                            border: formData.trigger.type === t.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: formData.trigger.type === t.id ? '#eff6ff' : '#fff'
                                        }}
                                    >
                                        <i className={`fas ${t.icon}`} style={{ color: formData.trigger.type === t.id ? '#3b82f6' : '#9ca3af' }}></i>
                                        <span style={{ fontSize: '14px', fontWeight: '600' }}>{t.label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Conditional Trigger Fields */}
                            {formData.trigger.type === 'onStageChange' && (
                                <div style={{ marginTop: '12px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>Target Stage</label>
                                    <select
                                        value={formData.trigger.targetStage}
                                        onChange={(e) => setFormData({ ...formData, trigger: { ...formData.trigger, targetStage: e.target.value } })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                                    >
                                        <option value="Incoming">Incoming</option>
                                        <option value="Prospect">Prospect</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'steps' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ borderLeft: '2px solid #e5e7eb', marginLeft: '12px', paddingLeft: '24px' }}>
                                {formData.steps.map((step, index) => (
                                    <div key={step.id} style={{ position: 'relative', marginBottom: '24px', background: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ position: 'absolute', left: '-33px', top: '16px', width: '16px', height: '16px', background: '#3b82f6', borderRadius: '50%', border: '4px solid #fff', boxShadow: '0 0 0 1px #e5e7eb' }}></div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 150px 1fr', gap: '12px', alignItems: 'flex-end' }}>
                                            <div>
                                                <label style={{ fontSize: '11px', color: '#6b7280' }}>Day</label>
                                                <input type="number" value={step.day} onChange={(e) => {
                                                    const newSteps = [...formData.steps];
                                                    newSteps[index].day = parseInt(e.target.value);
                                                    setFormData({ ...formData, steps: newSteps });
                                                }} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: '#6b7280' }}>Time</label>
                                                <input type="time" value={step.time} onChange={(e) => {
                                                    const newSteps = [...formData.steps];
                                                    newSteps[index].time = e.target.value;
                                                    setFormData({ ...formData, steps: newSteps });
                                                }} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: '#6b7280' }}>Activity Type</label>
                                                <select value={step.type} onChange={(e) => {
                                                    const newSteps = [...formData.steps];
                                                    newSteps[index].type = e.target.value;
                                                    setFormData({ ...formData, steps: newSteps });
                                                }} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                                                    <option>Call</option>
                                                    <option>WhatsApp</option>
                                                    <option>Email</option>
                                                    <option>Reminder</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '11px', color: '#6b7280' }}>Instructions</label>
                                                <input type="text" placeholder="e.g. Discuss new site..." value={step.instruction} onChange={(e) => {
                                                    const newSteps = [...formData.steps];
                                                    newSteps[index].instruction = e.target.value;
                                                    setFormData({ ...formData, steps: newSteps });
                                                }} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={handleAddStep}
                                    style={{ background: '#f3f4f6', border: '1px dashed #d1d5db', color: '#4b5563', padding: '12px', width: '100%', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    + Add New Step
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'exit' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px' }}>Stop sequence when:</h4>
                            {[
                                { id: 'onDealCreated', label: 'Deal is created for this lead', checked: formData.exitConditions.onDealCreated },
                                { id: 'onLost', label: 'Lead is marked Lost', checked: formData.exitConditions.onLost },
                                { id: 'onManualActivity', label: 'Agent manually logs an activity', checked: true, disabled: true }
                            ].map(cond => (
                                <div key={cond.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={cond.checked}
                                        disabled={cond.disabled}
                                        onChange={() => setFormData({
                                            ...formData,
                                            exitConditions: { ...formData.exitConditions, [cond.id]: !formData.exitConditions[cond.id] }
                                        })}
                                    />
                                    <span style={{ fontSize: '14px', color: cond.disabled ? '#9ca3af' : '#1f2937' }}>{cond.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button style={{ padding: '10px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }} onClick={onClose}>Cancel</button>
                    <button
                        style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                        onClick={handleSave}
                    >
                        {editData && editData.id ? 'Update Sequence' : 'Save Sequence'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateSequenceModal;
