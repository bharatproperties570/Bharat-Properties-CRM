import React, { useState } from 'react';
import { useFieldRules } from '../../../context/FieldRulesContext';
import { FIELD_RULE_TYPES, MODULES, PATTERNS } from '../../../utils/fieldRuleEngine';

const FieldRulesSettingsPage = () => {
    const { rules, addRule, updateRule, deleteRule, toggleRuleStatus } = useFieldRules();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        module: 'lead',
        ruleName: '',
        field: '',
        ruleType: 'MANDATORY',
        message: '',
        isActive: true,
        conditions: []
    });

    const handleOpenModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setFormData(rule);
        } else {
            setEditingRule(null);
            setFormData({
                module: 'lead',
                ruleName: '',
                field: '',
                ruleType: 'MANDATORY',
                message: '',
                isActive: true,
                conditions: []
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (!formData.ruleName || !formData.field) {
            alert("Rule Name and Field are required");
            return;
        }

        if (editingRule) {
            updateRule(editingRule.id, formData);
        } else {
            addRule(formData);
        }
        setIsModalOpen(false);
    };

    // Group rules by module for display
    const rulesByModule = MODULES.reduce((acc, mod) => {
        acc[mod] = rules.filter(r => r.module === mod);
        return acc;
    }, {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '24px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Field Rules Engine</h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                        The "Constitution" of your CRM logic. Define strict data rules here.
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    style={{
                        padding: '10px 20px',
                        background: '#0f172a',
                        color: '#fff',
                        borderRadius: '6px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <i className="fas fa-plus"></i> Add New Rule
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px' }}>
                {MODULES.map(module => {
                    const moduleRules = rulesByModule[module] || [];
                    if (moduleRules.length === 0) return null;

                    return (
                        <div key={module} style={{ marginBottom: '32px' }}>
                            <h3 style={{
                                fontSize: '1rem',
                                fontWeight: 800,
                                color: '#475569',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
                                {module} Module
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {moduleRules.map(rule => (
                                    <div key={rule.id} style={{
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '16px 20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        opacity: rule.isActive ? 1 : 0.6
                                    }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 700, color: '#1e293b' }}>{rule.ruleName}</span>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: rule.ruleType === 'MANDATORY' ? '#fef2f2' : '#e0f2fe',
                                                    color: rule.ruleType === 'MANDATORY' ? '#ef4444' : '#0369a1',
                                                    fontWeight: 700
                                                }}>
                                                    {rule.ruleType}
                                                </span>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    Target Field: <b>{rule.field}</b>
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                                {rule.message}
                                            </p>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={rule.isActive}
                                                    onChange={() => toggleRuleStatus(rule.id)}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                {rule.isActive ? 'Active' : 'Inactive'}
                                            </label>
                                            <button
                                                onClick={() => handleOpenModal(rule)}
                                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('Delete this rule?')) deleteRule(rule.id);
                                                }}
                                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {Object.values(rulesByModule).every(arr => arr.length === 0) && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No rules defined. Click "Add New Rule" to create one.
                    </div>
                )}
            </div>

            {/* Config Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
                    zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', width: '900px', maxWidth: '95vw',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                                {editingRule ? 'Edit Rule' : 'Create New Field Rule'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#94a3b8', padding: '4px' }}>
                                &times;
                            </button>
                        </div>

                        <div style={{ padding: '32px', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Module</label>
                                    <select
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.95rem', color: '#1e293b', outline: 'none' }}
                                        value={formData.module}
                                        onChange={(e) => setFormData({ ...formData, module: e.target.value })}
                                    >
                                        {MODULES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Rule Type</label>
                                    <select
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.95rem', color: '#1e293b', outline: 'none' }}
                                        value={formData.ruleType}
                                        onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                                    >
                                        {Object.entries(FIELD_RULE_TYPES).map(([key, val]) => (
                                            <option key={key} value={key}>{val}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Rule Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Budget Mandatory for Prospects"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.95rem', color: '#1e293b', outline: 'none' }}
                                    value={formData.ruleName}
                                    onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                                />
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Target Field (JSON Key)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. budgetMin"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.95rem', color: '#1e293b', outline: 'none', fontFamily: 'monospace' }}
                                    value={formData.field}
                                    onChange={(e) => setFormData({ ...formData, field: e.target.value })}
                                />
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Enter the exact variable name used in the code (e.g., 'mobile', 'email', 'budgetMin').</p>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Validation Message</label>
                                <input
                                    type="text"
                                    placeholder="Error message shown to user"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.95rem', color: '#1e293b', outline: 'none' }}
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                />
                            </div>

                            {/* Validation Type Selector */}
                            {formData.ruleType === 'VALIDATION' && (
                                <div style={{ marginBottom: '24px', background: '#fefce8', padding: '20px', borderRadius: '12px', border: '1px solid #fde047' }}>
                                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700, color: '#854d0e' }}>Validation Pattern</label>
                                    <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                                        <label style={{ fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#713f12' }}>
                                            <input
                                                type="radio"
                                                name="validationType"
                                                value="PATTERN"
                                                checked={formData.validationType === 'PATTERN'}
                                                onChange={() => setFormData({ ...formData, validationType: 'PATTERN' })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Standard Pattern
                                        </label>
                                        <label style={{ fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#713f12' }}>
                                            <input
                                                type="radio"
                                                name="validationType"
                                                value="REGEX"
                                                checked={formData.validationType === 'REGEX'}
                                                onChange={() => setFormData({ ...formData, validationType: 'REGEX' })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Custom Regex
                                        </label>
                                    </div>

                                    {formData.validationType === 'PATTERN' ? (
                                        <select
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.95rem' }}
                                            value={formData.patternName}
                                            onChange={(e) => setFormData({ ...formData, patternName: e.target.value })}
                                        >
                                            <option value="">Select a Pattern...</option>
                                            {Object.keys(PATTERNS).map(key => (
                                                <option key={key} value={key}>{key.replace('_', ' ')}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Enter Regex (e.g. ^[0-9]+$)"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.95rem', fontFamily: 'monospace' }}
                                            value={formData.value}
                                            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                        />
                                    )}
                                </div>
                            )}

                            <div style={{ background: '#f1f5f9', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>Conditions (Implicit OR)</label>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>When any of these match, the rule will apply. Leave empty to apply always.</div>
                                    </div>
                                    <button
                                        onClick={() => setFormData({
                                            ...formData,
                                            conditions: [...(formData.conditions || []), { field: '', operator: 'equals', value: '' }]
                                        })}
                                        style={{
                                            padding: '8px 16px', fontSize: '0.85rem', color: '#fff', background: '#3b82f6',
                                            borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-plus"></i> Add Condition
                                    </button>
                                </div>

                                {(formData.conditions && formData.conditions.length > 0) ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {formData.conditions.map((condition, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Field (e.g. stage)"
                                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                    value={condition.field}
                                                    onChange={(e) => {
                                                        const newConditions = [...formData.conditions];
                                                        newConditions[idx].field = e.target.value;
                                                        setFormData({ ...formData, conditions: newConditions });
                                                    }}
                                                />
                                                <select
                                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                                    value={condition.operator}
                                                    onChange={(e) => {
                                                        const newConditions = [...formData.conditions];
                                                        newConditions[idx].operator = e.target.value;
                                                        setFormData({ ...formData, conditions: newConditions });
                                                    }}
                                                >
                                                    <option value="equals">Equals</option>
                                                    <option value="not_equals">Not Equals</option>
                                                    <option value="contains">Contains</option>
                                                    <option value="greater_than">Greater Than</option>
                                                    <option value="less_than">Less Than</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Value"
                                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                    value={condition.value}
                                                    onChange={(e) => {
                                                        const newConditions = [...formData.conditions];
                                                        newConditions[idx].value = e.target.value;
                                                        setFormData({ ...formData, conditions: newConditions });
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newConditions = formData.conditions.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, conditions: newConditions });
                                                    }}
                                                    style={{
                                                        width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#ef4444', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer'
                                                    }}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                                            No conditions added. This rule will apply to all <b>{formData.module}</b> records.
                                        </p>
                                    </div>
                                )}
                            </div>

                        </div>

                        <div style={{ padding: '20px 32px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '16px', background: '#fff' }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>Cancel</button>
                            <button onClick={handleSave} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save Rule</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FieldRulesSettingsPage;
