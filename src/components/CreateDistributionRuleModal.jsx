import React, { useState, useEffect } from 'react';
import { useDistribution } from '../context/DistributionContext';
import { users } from '../data/mockData';

const CreateDistributionRuleModal = ({ isOpen, onClose, editingRule = null }) => {
    const { addDistributionRule, updateDistributionRule } = useDistribution();

    const [activeTab, setActiveTab] = useState('basic');
    const [formData, setFormData] = useState({
        name: '',
        module: 'leads',
        triggerEvent: 'onCreate',
        conditions: [],
        distributionType: 'roundRobin',
        assignmentTarget: { type: 'user', ids: [] },
        fallbackTarget: null,
        reassignmentPolicy: {
            enabled: false,
            inactivityHours: 48,
            escalateTo: ''
        },
        priority: 1,
        enabled: true
    });

    useEffect(() => {
        if (editingRule) {
            setFormData(editingRule);
        }
    }, [editingRule]);

    const handleSave = () => {
        if (!formData.name || formData.assignmentTarget.ids.length === 0) {
            alert('Please fill in all required fields');
            return;
        }

        if (editingRule) {
            updateDistributionRule(editingRule.id, formData);
        } else {
            addDistributionRule(formData);
        }

        onClose();
    };

    const addCondition = () => {
        setFormData(prev => ({
            ...prev,
            conditions: [
                ...prev.conditions,
                { field: '', operator: 'equals', value: '', logic: 'AND' }
            ]
        }));
    };

    const updateCondition = (index, updates) => {
        setFormData(prev => ({
            ...prev,
            conditions: prev.conditions.map((cond, i) =>
                i === index ? { ...cond, ...updates } : cond
            )
        }));
    };

    const removeCondition = (index) => {
        setFormData(prev => ({
            ...prev,
            conditions: prev.conditions.filter((_, i) => i !== index)
        }));
    };

    const toggleAssignmentTarget = (id) => {
        setFormData(prev => ({
            ...prev,
            assignmentTarget: {
                ...prev.assignmentTarget,
                ids: prev.assignmentTarget.ids.includes(id)
                    ? prev.assignmentTarget.ids.filter(i => i !== id)
                    : [...prev.assignmentTarget.ids, id]
            }
        }));
    };

    if (!isOpen) return null;

    const fieldOptions = {
        leads: ['source', 'budget', 'location', 'requirementType', 'leadScore', 'stage'],
        activities: ['activityType', 'priority', 'status'],
        campaigns: ['campaignCode', 'source', 'platform']
    };

    const operatorOptions = [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'greaterThan', label: 'Greater Than' },
        { value: 'lessThan', label: 'Less Than' },
        { value: 'in', label: 'In List' }
    ];

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                background: 'white',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '900px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e5e7eb'
                }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                        {editingRule ? 'Edit Distribution Rule' : 'Create Distribution Rule'}
                    </h2>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '0 24px'
                }}>
                    {['basic', 'conditions', 'assignment', 'policies', 'simulator'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '12px 16px',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: activeTab === tab ? '#3b82f6' : '#6b7280',
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px'
                }}>
                    {/* Basic Tab */}
                    {activeTab === 'basic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                    Rule Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., High Budget Leads to Senior Team"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '6px',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                        Module *
                                    </label>
                                    <select
                                        value={formData.module}
                                        onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="leads">Leads</option>
                                        <option value="activities">Activities</option>
                                        <option value="campaigns">Campaigns</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                        Trigger Event *
                                    </label>
                                    <select
                                        value={formData.triggerEvent}
                                        onChange={(e) => setFormData({ ...formData, triggerEvent: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="onCreate">On Create</option>
                                        <option value="onImport">On Import</option>
                                        <option value="onCampaignIntake">On Campaign Intake</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                        Distribution Type *
                                    </label>
                                    <select
                                        value={formData.distributionType}
                                        onChange={(e) => setFormData({ ...formData, distributionType: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="roundRobin">Round Robin</option>
                                        <option value="loadBased">Load Based</option>
                                        <option value="skillBased">Skill Based</option>
                                        <option value="locationBased">Location Based</option>
                                        <option value="sourceBased">Source Based</option>
                                        <option value="scoreBased">Score Based</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                        Priority
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                                        min="1"
                                        max="10"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            fontSize: '14px'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Conditions Tab */}
                    {activeTab === 'conditions' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                                    Condition Builder
                                </h3>
                                <button
                                    onClick={addCondition}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#3b82f6',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add Condition
                                </button>
                            </div>

                            {formData.conditions.length === 0 ? (
                                <div style={{
                                    padding: '32px',
                                    textAlign: 'center',
                                    background: '#f9fafb',
                                    borderRadius: '8px',
                                    border: '2px dashed #e5e7eb'
                                }}>
                                    <p style={{ color: '#6b7280', fontSize: '14px' }}>
                                        No conditions added. Rule will apply to all {formData.module}.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {formData.conditions.map((condition, index) => (
                                        <div key={index} style={{
                                            background: '#f9fafb',
                                            padding: '16px',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb'
                                        }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: '12px', alignItems: 'end' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                                        Field
                                                    </label>
                                                    <select
                                                        value={condition.field}
                                                        onChange={(e) => updateCondition(index, { field: e.target.value })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '4px',
                                                            fontSize: '13px'
                                                        }}
                                                    >
                                                        <option value="">Select field</option>
                                                        {fieldOptions[formData.module]?.map(field => (
                                                            <option key={field} value={field}>{field}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                                        Operator
                                                    </label>
                                                    <select
                                                        value={condition.operator}
                                                        onChange={(e) => updateCondition(index, { operator: e.target.value })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '4px',
                                                            fontSize: '13px'
                                                        }}
                                                    >
                                                        {operatorOptions.map(op => (
                                                            <option key={op.value} value={op.value}>{op.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                                        Value
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={condition.value}
                                                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                                                        placeholder="Enter value"
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '4px',
                                                            fontSize: '13px'
                                                        }}
                                                    />
                                                </div>

                                                {index > 0 && (
                                                    <select
                                                        value={condition.logic}
                                                        onChange={(e) => updateCondition(index, { logic: e.target.value })}
                                                        style={{
                                                            padding: '8px',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '4px',
                                                            fontSize: '13px',
                                                            fontWeight: '600'
                                                        }}
                                                    >
                                                        <option value="AND">AND</option>
                                                        <option value="OR">OR</option>
                                                    </select>
                                                )}

                                                <button
                                                    onClick={() => removeCondition(index)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        background: '#fee2e2',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: '#dc2626',
                                                        cursor: 'pointer',
                                                        fontSize: '13px'
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assignment Tab */}
                    {activeTab === 'assignment' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                                    Assignment Targets *
                                </h3>
                                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                                    Select users and assign weights (1-10) and caps (daily limit).
                                </p>

                                <div style={{
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '12px'
                                }}>
                                    {users.map(user => (
                                        <div
                                            key={user.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '10px',
                                                borderRadius: '6px',
                                                marginBottom: '8px',
                                                background: formData.assignmentTarget.ids.includes(user.id) ? '#eff6ff' : 'transparent',
                                                border: formData.assignmentTarget.ids.includes(user.id) ? '1px solid #bfdbfe' : '1px solid transparent'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.assignmentTarget.ids.includes(user.id)}
                                                    onChange={() => toggleAssignmentTarget(user.id)}
                                                />
                                                <div>
                                                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{user.name}</div>
                                                    <div style={{ fontSize: '12px', color: user.availability === 'Available' ? '#10b981' : '#6b7280' }}>
                                                        {user.role} • {user.availability}
                                                    </div>
                                                </div>
                                            </div>

                                            {formData.assignmentTarget.ids.includes(user.id) && (
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '10px', color: '#6b7280' }}>Weight</label>
                                                        <input
                                                            type="number"
                                                            value={formData.assignmentTarget.weights?.[user.id]?.weight || 1}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value) || 1;
                                                                setFormData({
                                                                    ...formData,
                                                                    assignmentTarget: {
                                                                        ...formData.assignmentTarget,
                                                                        weights: {
                                                                            ...formData.assignmentTarget.weights,
                                                                            [user.id]: {
                                                                                ...formData.assignmentTarget.weights?.[user.id],
                                                                                weight: val
                                                                            }
                                                                        }
                                                                    }
                                                                });
                                                            }}
                                                            min="1"
                                                            max="10"
                                                            style={{ width: '50px', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '10px', color: '#6b7280' }}>Cap</label>
                                                        <input
                                                            type="number"
                                                            value={formData.assignmentTarget.weights?.[user.id]?.cap || 50}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                setFormData({
                                                                    ...formData,
                                                                    assignmentTarget: {
                                                                        ...formData.assignmentTarget,
                                                                        weights: {
                                                                            ...formData.assignmentTarget.weights,
                                                                            [user.id]: {
                                                                                ...formData.assignmentTarget.weights?.[user.id],
                                                                                cap: val
                                                                            }
                                                                        }
                                                                    }
                                                                });
                                                            }}
                                                            min="0"
                                                            style={{ width: '60px', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                                    Fallback Assignment
                                </h3>
                                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                                    Who should receive the assignment if primary targets are unavailable?
                                </p>
                                <select
                                    value={formData.fallbackTarget?.id || ''}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        fallbackTarget: e.target.value ? { type: 'user', id: e.target.value } : null
                                    })}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '6px',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="">No fallback</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Simulator Tab */}
                    {activeTab === 'simulator' && (
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                                Rule Simulator
                            </h3>
                            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
                                Test your rule logic with mock data to see how it performs.
                            </p>

                            <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Lead Location</label>
                                        <input type="text" placeholder="e.g. Sector 17" style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }} id="sim_location" />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>Lead Budget</label>
                                        <input type="text" placeholder="e.g. 5000000" style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }} id="sim_budget" />
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const loc = document.getElementById('sim_location').value;
                                        const budget = document.getElementById('sim_budget').value;
                                        const mockLead = { location: loc, budget: budget, source: 'Website' };

                                        // Simple internal simulation for UI feedback
                                        const matches = formData.conditions.length === 0 || formData.conditions.every(c => {
                                            if (c.field === 'location') return loc.includes(c.value);
                                            if (c.field === 'budget') return parseFloat(budget) >= parseFloat(c.value);
                                            return true;
                                        });

                                        if (!matches) {
                                            alert('Simulation: This lead DOES NOT MATCH the current conditions.');
                                        } else {
                                            const availAgents = users.filter(u =>
                                                formData.assignmentTarget.ids.includes(u.id) && u.availability === 'Available'
                                            );
                                            if (availAgents.length === 0) {
                                                alert(`Simulation: Lead matches, but NO AGENTS are Available.`);
                                            } else {
                                                alert(`Simulation SUCCESS: Lead matches! Target Agents: ${availAgents.map(a => a.name).join(', ')}`);
                                            }
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: '#111827',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '500'
                                    }}
                                >
                                    Run Simulation
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Policies Tab */}
                    {activeTab === 'policies' && (
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                                Reassignment Policy
                            </h3>

                            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.reassignmentPolicy.enabled}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        reassignmentPolicy: {
                                            ...formData.reassignmentPolicy,
                                            enabled: e.target.checked
                                        }
                                    })}
                                    style={{ marginRight: '8px' }}
                                />
                                <span style={{ fontSize: '14px', fontWeight: '500' }}>
                                    Enable automatic reassignment for inactive assignments
                                </span>
                            </label>

                            {formData.reassignmentPolicy.enabled && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginLeft: '24px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                            Inactivity Threshold (hours)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.reassignmentPolicy.inactivityHours}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                reassignmentPolicy: {
                                                    ...formData.reassignmentPolicy,
                                                    inactivityHours: parseInt(e.target.value)
                                                }
                                            })}
                                            min="1"
                                            style={{
                                                width: '200px',
                                                padding: '10px 12px',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                                            Escalate To
                                        </label>
                                        <select
                                            value={formData.reassignmentPolicy.escalateTo}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                reassignmentPolicy: {
                                                    ...formData.reassignmentPolicy,
                                                    escalateTo: e.target.value
                                                }
                                            })}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                fontSize: '14px'
                                            }}
                                        >
                                            <option value="">Select user</option>
                                            {users.filter(u => u.role === 'Manager' || u.role === 'Admin').map(user => (
                                                <option key={user.id} value={user.id}>{user.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '10px 20px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '500',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        {editingRule ? 'Update Rule' : 'Create Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateDistributionRuleModal;
