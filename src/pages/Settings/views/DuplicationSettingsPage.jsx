import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const DuplicationSettingsPage = () => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        entityType: 'Contact',
        fields: [],
        matchType: 'any',
        actionType: 'Warning',
        isActive: true
    });

    const entityFields = {
        Contact: [
            { id: 'name', label: 'Full Name' },
            { id: 'phones.number', label: 'Phone Number' },
            { id: 'emails.address', label: 'Email Address' },
            { id: 'personalAddress.city', label: 'City' },
            { id: 'professionCategory', label: 'Profession Category' }
        ],
        Lead: [
            { id: 'firstName', label: 'First Name' },
            { id: 'lastName', label: 'Last Name' },
            { id: 'mobile', label: 'Mobile Number' },
            { id: 'email', label: 'Email Address' }
        ],
        Project: [
            { id: 'name', label: 'Project Name' },
            { id: 'reraNumber', label: 'RERA Number' },
            { id: 'developerName', label: 'Developer Name' }
        ],
        Inventory: [
            { id: 'project', label: 'Project' },
            { id: 'block', label: 'Block' },
            { id: 'unitNumber', label: 'Unit Number' }
        ]
    };

    const availableFields = entityFields[formData.entityType] || [];

    const fetchRules = async () => {
        try {
            setLoading(true);
            const res = await api.get('duplication-rules');
            if (res.data && res.data.success) {
                setRules(res.data.data);
            }
        } catch (err) {
            console.error("Error fetching rules:", err);
            toast.error("Failed to load duplication rules");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleOpenModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setFormData({
                name: rule.name,
                entityType: rule.entityType || 'Contact',
                fields: rule.fields || [],
                matchType: rule.matchType || 'any',
                actionType: rule.actionType || 'Warning',
                isActive: rule.isActive !== undefined ? rule.isActive : true
            });
        } else {
            setEditingRule(null);
            setFormData({
                name: '',
                entityType: 'Contact',
                fields: [],
                matchType: 'any',
                actionType: 'Warning',
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name || formData.fields.length === 0) {
            toast.error("Name and at least one field are required");
            return;
        }

        try {
            const toastId = toast.loading(editingRule ? "Updating rule..." : "Creating rule...");
            let res;
            if (editingRule) {
                res = await api.put(`duplication-rules/${editingRule._id}`, formData);
            } else {
                res = await api.post('duplication-rules', formData);
            }

            if (res.data && res.data.success) {
                toast.success(editingRule ? "Rule updated" : "Rule created", { id: toastId });
                setIsModalOpen(false);
                fetchRules();
            }
        } catch (err) {
            console.error("Error saving rule:", err);
            toast.error("Failed to save duplication rule");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this rule?")) return;
        try {
            const res = await api.delete(`duplication-rules/${id}`);
            if (res.data && res.data.success) {
                toast.success("Rule deleted");
                fetchRules();
            }
        } catch (err) {
            console.error("Error deleting rule:", err);
            toast.error("Failed to delete rule");
        }
    };

    const toggleField = (fieldId) => {
        setFormData(prev => ({
            ...prev,
            fields: prev.fields.includes(fieldId)
                ? prev.fields.filter(f => f !== fieldId)
                : [...prev.fields, fieldId]
        }));
    };

    if (loading && rules.length === 0) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Loading rules...</div>;
    }

    return (
        <div style={{ padding: '32px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Duplicate Management</h1>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Define rules to detect and suggest duplicate contacts during entry.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="btn-primary"
                    style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 700 }}
                >
                    + Create Rule
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                {rules.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', padding: '100px', background: '#fff', borderRadius: '12px', border: '1px dashed #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
                        <i className="fas fa-copy" style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.3 }}></i>
                        <p>No duplication rules defined yet.</p>
                    </div>
                ) : rules.map(rule => (
                    <div key={rule._id} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{rule.name}</h3>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{rule.entityType}</span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        color: rule.actionType === 'Block' ? '#ef4444' : '#f59e0b',
                                        background: rule.actionType === 'Block' ? '#fef2f2' : '#fffbeb',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        border: `1px solid ${rule.actionType === 'Block' ? '#fecaca' : '#fcd34d'}`
                                    }}>
                                        {rule.actionType || 'Warning'}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        color: rule.isActive ? '#10b981' : '#94a3b8',
                                        background: rule.isActive ? '#ecfdf5' : '#f8fafc',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        {rule.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => handleOpenModal(rule)} style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', color: '#64748b' }}>
                                    <i className="fas fa-edit"></i>
                                </button>
                                <button onClick={() => handleDelete(rule._id)} style={{ border: 'none', background: '#fef2f2', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}>
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>FIELDS TO MATCH ({rule.matchType.toUpperCase()})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {rule.fields.map(f => (
                                    <span key={f} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                                        {entityFields[rule.entityType]?.find(af => af.id === f)?.label || f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', width: '500px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{editingRule ? 'Edit Rule' : 'New Duplication Rule'}</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.25rem' }}>&times;</button>
                        </div>
                        <form onSubmit={handleSave} style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Rule Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Exact Phone Match"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Entity Type</label>
                                <select
                                    value={formData.entityType}
                                    onChange={e => setFormData({ ...formData, entityType: e.target.value, fields: [] })}
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', background: '#fff' }}
                                >
                                    <option value="Contact">Contact</option>
                                    <option value="Lead">Lead</option>
                                    <option value="Project">Project</option>
                                    <option value="Inventory">Inventory</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Fields to Check</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {availableFields.map(field => (
                                        <button
                                            key={field.id}
                                            type="button"
                                            onClick={() => toggleField(field.id)}
                                            style={{
                                                padding: '8px 16px',
                                                borderRadius: '20px',
                                                border: '1px solid',
                                                borderColor: formData.fields.includes(field.id) ? 'var(--primary-color)' : '#e2e8f0',
                                                background: formData.fields.includes(field.id) ? '#f0f9ff' : '#fff',
                                                color: formData.fields.includes(field.id) ? 'var(--primary-color)' : '#64748b',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {field.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Action Type</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <label style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${formData.actionType === 'Warning' ? '#fbbf24' : '#e2e8f0'}`, background: formData.actionType === 'Warning' ? '#fffbeb' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input type="radio" name="actionType" value="Warning" checked={formData.actionType === 'Warning'} onChange={e => setFormData({ ...formData, actionType: e.target.value })} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>Warning</div>
                                            <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Show popup, allow save</div>
                                        </div>
                                    </label>
                                    <label style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${formData.actionType === 'Block' ? '#f87171' : '#e2e8f0'}`, background: formData.actionType === 'Block' ? '#fef2f2' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input type="radio" name="actionType" value="Block" checked={formData.actionType === 'Block'} onChange={e => setFormData({ ...formData, actionType: e.target.value })} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b91c1c' }}>Block</div>
                                            <div style={{ fontSize: '0.75rem', color: '#c2410c' }}>Prevent saving</div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Match Condition</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <label style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input type="radio" name="matchType" value="any" checked={formData.matchType === 'any'} onChange={e => setFormData({ ...formData, matchType: e.target.value })} />
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Any Field Matches (OR)</div>
                                    </label>
                                    <label style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input type="radio" name="matchType" value="all" checked={formData.matchType === 'all'} onChange={e => setFormData({ ...formData, matchType: e.target.value })} />
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>All Fields Match (AND)</div>
                                    </label>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                <label htmlFor="isActive" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Rule is active</label>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-outline" style={{ flex: 1, padding: '12px' }}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '12px', fontWeight: 700 }}>{editingRule ? 'Update Rule' : 'Create Rule'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DuplicationSettingsPage;
