import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CreateRoleModal = ({ isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        department: 'sales',
        moduleAccess: {},
        defaultDataScope: 'assigned',
        financialPermissions: {
            viewMargin: false,
            editCommission: false,
            overrideCommission: false,
            approvePayment: false,
            approvePayout: false
        },
        approvalRights: {
            approveDeal: false,
            approveDiscount: false,
            approveStageChange: false,
            approveListingPublish: false
        }
    });

    const [roleTemplates, setRoleTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('basic');

    // Departments
    const departments = [
        { id: 'inventory', name: 'Inventory', icon: '🏢', color: '#10b981' },
        { id: 'accounts', name: 'Accounts', icon: '💰', color: '#f59e0b' }
    ];

    // Modules based on department
    const getModulesForDepartment = (dept) => {
        const commonModules = ['contacts', 'companies', 'activities', 'reports'];

        const departmentModules = {
            sales: ['leads', 'deals', ...commonModules, 'commission', 'matching'],
            marketing: ['campaigns', 'leads', ...commonModules, 'matching'],
            inventory: ['inventory', 'projects', 'sizes', ...commonModules, 'matching'],
            accounts: ['deals', 'payments', 'commission', ...commonModules]
        };

        return departmentModules[dept] || commonModules;
    };

    // Initialize module access when department changes
    useEffect(() => {
        if (isOpen) {
            const modules = getModulesForDepartment(formData.department);
            const moduleAccess = {};

            modules.forEach(module => {
                if (!formData.moduleAccess[module]) {
                    moduleAccess[module] = { view: false, create: false, edit: false, delete: false };
                } else {
                    moduleAccess[module] = formData.moduleAccess[module];
                }
            });

            setFormData(prev => ({ ...prev, moduleAccess }));
        }
    }, [formData.department, isOpen]);

    // Fetch role templates
    useEffect(() => {
        if (isOpen) {
            fetchRoleTemplates();
        }
    }, [isOpen, formData.department]);

    const fetchRoleTemplates = async () => {
        try {
            const response = await axios.get(`/api/roles/templates?department=${formData.department}`);
            setRoleTemplates(response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch role templates:', error);
        }
    };

    const applyTemplate = (templateId) => {
        const template = roleTemplates.find(t => t._id === templateId);
        if (template) {
            setFormData({
                ...formData,
                name: template.name,
                description: template.description,
                moduleAccess: template.moduleAccess || {},
                defaultDataScope: template.defaultDataScope || 'assigned',
                financialPermissions: template.financialPermissions || formData.financialPermissions,
                approvalRights: template.approvalRights || formData.approvalRights
            });
            setSelectedTemplate(templateId);
        }
    };

    const toggleModulePermission = (module, permission) => {
        setFormData(prev => ({
            ...prev,
            moduleAccess: {
                ...prev.moduleAccess,
                [module]: {
                    ...prev.moduleAccess[module],
                    [permission]: !prev.moduleAccess[module]?.[permission]
                }
            }
        }));
    };

    const setAllModulePermissions = (module, enabled) => {
        setFormData(prev => ({
            ...prev,
            moduleAccess: {
                ...prev.moduleAccess,
                [module]: {
                    view: enabled,
                    create: enabled,
                    edit: enabled,
                    delete: enabled
                }
            }
        }));
    };

    const handleSubmit = async () => {
        setError('');

        // Validation
        if (!formData.name || !formData.department) {
            setError('Please fill in role name and select a department');
            return;
        }

        setLoading(true);

        try {
            const response = await axios.post('/api/roles', formData);

            if (response.data.success) {
                if (onSave) {
                    onSave(response.data.data);
                }

                // Reset form
                setFormData({
                    name: '',
                    description: '',
                    department: 'sales',
                    moduleAccess: {},
                    defaultDataScope: 'assigned',
                    financialPermissions: {
                        viewMargin: false,
                        editCommission: false,
                        overrideCommission: false,
                        approvePayment: false,
                        approvePayout: false
                    },
                    approvalRights: {
                        approveDeal: false,
                        approveDiscount: false,
                        approveStageChange: false,
                        approveListingPublish: false
                    }
                });
                setSelectedTemplate('');

                onClose();
            }
        } catch (error) {
            console.error('Failed to create role:', error);
            setError(error.response?.data?.message || 'Failed to create role. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const modules = getModulesForDepartment(formData.department);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                background: '#fff',
                width: '900px',
                maxHeight: '90vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Create New Role</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Define a custom role with specific permissions for your team</p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '24px', padding: '0 24px', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                        { id: 'basic', label: 'Basic Info' },
                        { id: 'permissions', label: 'Module Permissions' },
                        { id: 'advanced', label: 'Advanced' }
                    ].map(tab => (
                        <div
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '12px 0',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                color: activeTab === tab.id ? 'var(--primary-color)' : '#94a3b8',
                                borderBottom: activeTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                                cursor: 'pointer'
                            }}
                        >
                            {tab.label}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {/* Error Message */}
                    {error && (
                        <div style={{
                            padding: '12px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            marginBottom: '20px',
                            color: '#dc2626',
                            fontSize: '0.85rem'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Basic Info Tab */}
                    {activeTab === 'basic' && (
                        <div>
                            {/* Role Name */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                                    Role Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        marginTop: '6px'
                                    }}
                                    placeholder="e.g., Senior Sales Executive"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            {/* Description */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>Description</label>
                                <textarea
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        marginTop: '6px',
                                        minHeight: '80px',
                                        resize: 'vertical'
                                    }}
                                    placeholder="Describe the role and its responsibilities"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            {/* Department Selection */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                                    Department <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                    {departments.map(dept => (
                                        <div
                                            key={dept.id}
                                            onClick={() => setFormData({ ...formData, department: dept.id })}
                                            style={{
                                                padding: '16px 12px',
                                                borderRadius: '8px',
                                                border: formData.department === dept.id ? `2px solid ${dept.color}` : '1px solid #e2e8f0',
                                                background: formData.department === dept.id ? `${dept.color}10` : '#fff',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>{dept.icon}</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{dept.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Role Templates */}
                            {roleTemplates.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                                        Start from Template (Optional)
                                    </label>
                                    <select
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem'
                                        }}
                                        value={selectedTemplate}
                                        onChange={(e) => applyTemplate(e.target.value)}
                                    >
                                        <option value="">Create from scratch</option>
                                        {roleTemplates.map(template => (
                                            <option key={template._id} value={template._id}>
                                                {template.name} - {template.description}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Default Data Scope */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                                    Default Data Access Scope
                                </label>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {[
                                        { value: 'assigned', label: 'Assigned Only', desc: 'Can only see their own data' },
                                        { value: 'team', label: 'Team', desc: 'Can see own + team members data' },
                                        { value: 'department', label: 'Department', desc: 'Can see all department data' },
                                        { value: 'all', label: 'All Data', desc: 'Can see all data across departments' }
                                    ].map(option => (
                                        <div
                                            key={option.value}
                                            onClick={() => setFormData({ ...formData, defaultDataScope: option.value })}
                                            style={{
                                                display: 'flex',
                                                gap: '12px',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                border: formData.defaultDataScope === option.value ? '1px solid var(--primary-color)' : '1px solid #e2e8f0',
                                                background: formData.defaultDataScope === option.value ? '#f0f7ff' : '#fff',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '50%',
                                                border: formData.defaultDataScope === option.value ? '6px solid var(--primary-color)' : '2px solid #cbd5e1',
                                                background: '#fff',
                                                flexShrink: 0,
                                                marginTop: '2px'
                                            }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{option.label}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{option.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Module Permissions Tab */}
                    {activeTab === 'permissions' && (
                        <div>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                                Configure what modules this role can access and what actions they can perform
                            </p>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Module</th>
                                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>View</th>
                                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Create</th>
                                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Edit</th>
                                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Delete</th>
                                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>All</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {modules.map(module => (
                                            <tr key={module} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px', fontWeight: 600, color: '#1e293b', fontSize: '0.9rem', textTransform: 'capitalize' }}>
                                                    {module}
                                                </td>
                                                {['view', 'create', 'edit', 'delete'].map(permission => (
                                                    <td key={permission} style={{ padding: '12px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.moduleAccess[module]?.[permission] || false}
                                                            onChange={() => toggleModulePermission(module, permission)}
                                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                        />
                                                    </td>
                                                ))}
                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            const allEnabled = formData.moduleAccess[module]?.view &&
                                                                formData.moduleAccess[module]?.create &&
                                                                formData.moduleAccess[module]?.edit &&
                                                                formData.moduleAccess[module]?.delete;
                                                            setAllModulePermissions(module, !allEnabled);
                                                        }}
                                                        style={{
                                                            padding: '4px 12px',
                                                            fontSize: '0.75rem',
                                                            border: '1px solid #e2e8f0',
                                                            borderRadius: '4px',
                                                            background: '#fff',
                                                            cursor: 'pointer',
                                                            fontWeight: 600,
                                                            color: '#64748b'
                                                        }}
                                                    >
                                                        Toggle
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Advanced Tab */}
                    {activeTab === 'advanced' && (
                        <div>
                            {/* Financial Permissions */}
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>Financial Permissions</h3>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {Object.keys(formData.financialPermissions).map(key => (
                                        <div
                                            key={key}
                                            onClick={() => setFormData({
                                                ...formData,
                                                financialPermissions: {
                                                    ...formData.financialPermissions,
                                                    [key]: !formData.financialPermissions[key]
                                                }
                                            })}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '10px',
                                                borderRadius: '6px',
                                                border: '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                background: formData.financialPermissions[key] ? '#f0f7ff' : '#fff'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.financialPermissions[key]}
                                                onChange={() => { }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b', textTransform: 'capitalize' }}>
                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Approval Rights */}
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>Approval Rights</h3>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {Object.keys(formData.approvalRights).map(key => (
                                        <div
                                            key={key}
                                            onClick={() => setFormData({
                                                ...formData,
                                                approvalRights: {
                                                    ...formData.approvalRights,
                                                    [key]: !formData.approvalRights[key]
                                                }
                                            })}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '10px',
                                                borderRadius: '6px',
                                                border: '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                background: formData.approvalRights[key] ? '#f0f7ff' : '#fff'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.approvalRights[key]}
                                                onChange={() => { }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '0.9rem', color: '#1e293b', textTransform: 'capitalize' }}>
                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                    <button
                        className="btn-outline"
                        onClick={onClose}
                        disabled={loading}
                        style={{ padding: '8px 24px', borderRadius: '6px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 600 }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{ padding: '8px 24px', borderRadius: '6px', fontWeight: 700, opacity: loading ? 0.6 : 1 }}
                    >
                        {loading ? 'Creating...' : 'Create Role'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateRoleModal;
