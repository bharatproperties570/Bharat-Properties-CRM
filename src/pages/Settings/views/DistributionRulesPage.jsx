import React, { useState } from 'react';
import { useDistribution } from '../../../context/DistributionContext';
import CreateDistributionRuleModal from '../../../components/CreateDistributionRuleModal';

const DistributionRulesPage = () => {
    const {
        distributionRules,
        updateDistributionRule,
        deleteDistributionRule,
        getDistributionAnalytics
    } = useDistribution();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const analytics = getDistributionAnalytics();

    const handleToggleRule = (ruleId, enabled) => {
        updateDistributionRule(ruleId, { enabled });
    };

    const handleEditRule = (rule) => {
        setEditingRule(rule);
        setIsCreateModalOpen(true);
    };

    const handleDeleteRule = (ruleId) => {
        deleteDistributionRule(ruleId);
        setDeleteConfirm(null);
    };

    const getModuleBadgeColor = (module) => {
        switch (module) {
            case 'leads': return '#3b82f6';
            case 'activities': return '#10b981';
            case 'campaigns': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    const getDistributionTypeLabel = (type) => {
        const labels = {
            roundRobin: 'Round Robin',
            loadBased: 'Load Based',
            skillBased: 'Skill Based',
            locationBased: 'Location Based',
            sourceBased: 'Source Based',
            scoreBased: 'Score Based'
        };
        return labels[type] || type;
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', fontWeight: '600', color: '#111827', margin: 0 }}>
                            Distribution Rules
                        </h1>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                            Control who gets what work, when, and why
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={() => setShowAnalytics(!showAnalytics)}
                            style={{
                                padding: '10px 20px',
                                background: 'white',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#374151',
                                cursor: 'pointer'
                            }}
                        >
                            {showAnalytics ? 'Hide' : 'Show'} Analytics
                        </button>
                        <button
                            onClick={() => {
                                setEditingRule(null);
                                setIsCreateModalOpen(true);
                            }}
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
                            + Create Rule
                        </button>
                    </div>
                </div>

                {/* Analytics Panel */}
                {showAnalytics && (
                    <div style={{
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '20px',
                        marginTop: '16px'
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                            Distribution Analytics (Last 30 Days)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                    Total Assignments
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '600', color: '#111827' }}>
                                    {analytics.totalAssignments}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                    Manual Overrides
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '600', color: '#f59e0b' }}>
                                    {analytics.manualOverrides}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                    Active Rules
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '600', color: '#10b981' }}>
                                    {distributionRules.filter(r => r.enabled).length}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                    Total Rules
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '600', color: '#6b7280' }}>
                                    {distributionRules.length}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Rules List */}
            {distributionRules.length === 0 ? (
                <div style={{
                    background: 'white',
                    border: '2px dashed #e5e7eb',
                    borderRadius: '8px',
                    padding: '48px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                        No Distribution Rules Yet
                    </h3>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                        Create your first rule to start automating work assignment
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
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
                        Create First Rule
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {distributionRules
                        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                        .map(rule => (
                            <div
                                key={rule.id}
                                style={{
                                    background: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '20px',
                                    opacity: rule.enabled ? 1 : 0.6
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
                                                {rule.name}
                                            </h3>
                                            <span style={{
                                                padding: '4px 8px',
                                                background: getModuleBadgeColor(rule.module),
                                                color: 'white',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                borderRadius: '4px',
                                                textTransform: 'uppercase'
                                            }}>
                                                {rule.module}
                                            </span>
                                            <span style={{
                                                padding: '4px 8px',
                                                background: '#f3f4f6',
                                                color: '#374151',
                                                fontSize: '11px',
                                                fontWeight: '500',
                                                borderRadius: '4px'
                                            }}>
                                                {getDistributionTypeLabel(rule.distributionType)}
                                            </span>
                                            {rule.priority && (
                                                <span style={{
                                                    padding: '4px 8px',
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    fontSize: '11px',
                                                    fontWeight: '500',
                                                    borderRadius: '4px'
                                                }}>
                                                    Priority: {rule.priority}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                                            <strong>Trigger:</strong> {rule.triggerEvent} •
                                            <strong> Conditions:</strong> {rule.conditions?.length || 0} rule(s) •
                                            <strong> Targets:</strong> {rule.assignmentTarget?.ids?.length || 0} agent(s)
                                        </div>

                                        {rule.conditions && rule.conditions.length > 0 && (
                                            <div style={{
                                                background: '#f9fafb',
                                                padding: '12px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                color: '#374151'
                                            }}>
                                                <strong>IF</strong>{' '}
                                                {rule.conditions.map((cond, idx) => (
                                                    <span key={idx}>
                                                        {idx > 0 && <strong> {cond.logic || 'AND'} </strong>}
                                                        <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '3px' }}>
                                                            {cond.field} {cond.operator} {cond.value}
                                                        </code>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={rule.enabled}
                                                onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                                                style={{ marginRight: '6px' }}
                                            />
                                            <span style={{ fontSize: '13px', color: '#374151' }}>Enabled</span>
                                        </label>
                                        <button
                                            onClick={() => handleEditRule(rule)}
                                            style={{
                                                padding: '6px 12px',
                                                background: 'white',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                color: '#374151',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(rule.id)}
                                            style={{
                                                padding: '6px 12px',
                                                background: 'white',
                                                border: '1px solid #fecaca',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                color: '#dc2626',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
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
                        borderRadius: '8px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '90%'
                    }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>
                            Delete Distribution Rule?
                        </h3>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                            This action cannot be undone. The rule will be permanently deleted.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                    padding: '8px 16px',
                                    background: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteRule(deleteConfirm)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#dc2626',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                Delete Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isCreateModalOpen && (
                <CreateDistributionRuleModal
                    isOpen={isCreateModalOpen}
                    onClose={() => {
                        setIsCreateModalOpen(false);
                        setEditingRule(null);
                    }}
                    editingRule={editingRule}
                />
            )}
        </div>
    );
};

export default DistributionRulesPage;
