import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AddUserModal = ({ isOpen, onClose, onAdd, isEdit: isEditProp, userData }) => {
    const isEdit = isEditProp !== undefined ? isEditProp : !!userData;
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        mobile: '',
        username: '',
        password: '',
        department: 'sales',
        role: '',
        reportingTo: '',
        dataScope: 'assigned',
        financialPermissions: {
            canViewMargin: false,
            canEditCommission: false,
            canOverrideCommission: false,
            canApproveDeal: false,
            canApprovePayment: false,
            canApprovePayout: false
        }
    });

    useEffect(() => {
        if (isEdit && userData) {
            setFormData({
                fullName: userData.fullName || userData.name || '',
                email: userData.email || '',
                mobile: userData.mobile || '',
                username: userData.username || '',
                password: '●●●●●●●●', // Placeholder for edit mode
                department: userData.department || 'sales',
                role: userData.role?._id || userData.role || '',
                reportingTo: userData.reportingTo?._id || userData.reportingTo || '',
                dataScope: userData.dataScope || 'assigned',
                financialPermissions: userData.financialPermissions || {
                    canViewMargin: false,
                    canEditCommission: false,
                    canOverrideCommission: false,
                    canApproveDeal: false,
                    canApprovePayment: false,
                    canApprovePayout: false
                }
            });
        } else if (!isEdit) {
            setFormData({
                fullName: '',
                email: '',
                mobile: '',
                username: '',
                password: '',
                department: 'sales',
                role: '',
                reportingTo: '',
                dataScope: 'assigned',
                financialPermissions: {
                    canViewMargin: false,
                    canEditCommission: false,
                    canOverrideCommission: false,
                    canApproveDeal: false,
                    canApprovePayment: false,
                    canApprovePayout: false
                }
            });
        }
    }, [isEdit, userData, isOpen]);

    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');

    // Departments configuration
    const departments = [
        { id: 'sales', name: 'Sales', icon: '💼' },
        { id: 'marketing', name: 'Marketing', icon: '📢' },
        { id: 'inventory', name: 'Inventory Management', icon: '🏢' },
        { id: 'accounts', name: 'Accounts', icon: '💰' }
    ];

    // Data scope options
    const dataScopeOptions = [
        { value: 'assigned', label: 'Assigned Only', description: 'Can only see their own data' },
        { value: 'team', label: 'Team', description: 'Can see own + team members data' },
        { value: 'department', label: 'Department', description: 'Can see all department data' },
        { value: 'all', label: 'All Data', description: 'Can see all data across departments' }
    ];

    // Fetch roles and users when modal opens or department changes
    useEffect(() => {
        if (isOpen) {
            fetchRoles();
            fetchUsers();
        }
    }, [isOpen, formData.department]);



    const fetchRoles = async () => {
        try {
            const response = await axios.get(`/api/roles?department=${formData.department}`);
            setRoles(response.data.data || []);

            // Auto-select first role if available
            if (response.data.data && response.data.data.length > 0 && !formData.role) {
                setFormData(prev => ({ ...prev, role: response.data.data[0]._id }));
            }
        } catch (error) {
            console.error('Failed to fetch roles:', error);
            setError('Failed to load roles');
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/users');
            setUsers(response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };

    const validatePassword = (password) => {
        const errors = [];

        if (password.length < 8) {
            errors.push('At least 8 characters');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('One uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('One lowercase letter');
        }
        if (!/\d/.test(password)) {
            errors.push('One number');
        }
        if (!/[@$!%*?&#^()_+\-=\[\]{}|;:,.<>]/.test(password)) {
            errors.push('One special character');
        }

        return errors;
    };

    const handlePasswordChange = (e) => {
        const password = e.target.value;
        setFormData({ ...formData, password });

        const errors = validatePassword(password);
        if (errors.length > 0) {
            setPasswordError(`Required: ${errors.join(', ')}`);
        } else {
            setPasswordError('');
        }
    };

    const handleSubmit = async () => {
        setError('');

        // Validation
        const requiredFields = ['fullName', 'email', 'department', 'role'];
        if (!isEdit) requiredFields.push('password');

        for (const field of requiredFields) {
            if (!formData[field]) {
                setError(`Please fill in all required fields (${field})`);
                return;
            }
        }

        if (!isEdit) {
            const passwordErrors = validatePassword(formData.password);
            if (passwordErrors.length > 0) {
                setError('Password does not meet requirements');
                return;
            }
        }

        setLoading(true);

        try {
            let response;
            const payload = { ...formData };

            // Sanitize Payload
            payload.department = payload.department.toLowerCase();
            if (payload.reportingTo === '') payload.reportingTo = null;
            if (payload.role === '') payload.role = null;
            if (payload.username === '') payload.username = null;
            if (payload.mobile === '') payload.mobile = null;

            if (isEdit && userData?._id) {
                if (payload.password === '●●●●●●●●') {
                    delete payload.password;
                }
                response = await axios.put(`/api/users/${userData._id}`, payload);
            } else {
                response = await axios.post('/api/users', payload);
            }

            if (response.data.success) {
                // Call parent's onAdd callback
                if (onAdd) {
                    onAdd(response.data.data);
                }

                // Reset form
                setFormData({
                    fullName: '',
                    email: '',
                    mobile: '',
                    username: '',
                    password: '',
                    department: 'sales',
                    role: '',
                    reportingTo: '',
                    dataScope: 'assigned',
                    financialPermissions: {
                        canViewMargin: false,
                        canEditCommission: false,
                        canOverrideCommission: false,
                        canApproveDeal: false,
                        canApprovePayment: false,
                        canApprovePayout: false
                    }
                });

                onClose();
            }
        } catch (error) {
            console.error(`Failed to ${isEdit ? 'update' : 'create'} user:`, error);
            setError(error.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} user. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '0.9rem',
        marginTop: '6px'
    };

    const labelStyle = {
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#1e293b'
    };

    const sectionStyle = {
        marginBottom: '20px'
    };

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
                width: '700px',
                maxHeight: '90vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{isEdit ? 'Edit User' : 'Add New User'}</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>{isEdit ? 'Update user details and permissions' : 'Create a new user account with department and role assignment'}</p>
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

                    {/* Full Name */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            type="text"
                            style={inputStyle}
                            autoComplete="new-password"
                            placeholder="Enter full name"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Email */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Email <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="email"
                                style={inputStyle}
                                autoComplete="new-password"
                                placeholder="user@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        {/* Mobile */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Mobile</label>
                            <input
                                type="text"
                                style={inputStyle}
                                autoComplete="new-password"
                                placeholder="+91 00000 00000"
                                value={formData.mobile}
                                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Username */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Username</label>
                            <input
                                type="text"
                                style={inputStyle}
                                autoComplete="new-password"
                                placeholder="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            />
                        </div>

                        {/* Password */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="password"
                                style={{
                                    ...inputStyle,
                                    borderColor: passwordError ? '#ef4444' : '#e2e8f0'
                                }}
                                placeholder="Min 8 chars, uppercase, lowercase, number, special"
                                value={formData.password}
                                onChange={handlePasswordChange}
                            />
                            {passwordError && (
                                <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>
                                    {passwordError}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Department Selection */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Department <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '8px' }}>
                            {departments.map(dept => (
                                <div
                                    key={dept.id}
                                    onClick={() => setFormData({ ...formData, department: dept.id, role: '' })}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: formData.department === dept.id ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                        background: formData.department === dept.id ? '#f0f7ff' : '#fff',
                                        cursor: 'pointer',
                                        textAlign: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{dept.icon}</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>{dept.name}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Role Selection */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Role <span style={{ color: '#ef4444' }}>*</span></label>
                            <div style={{ position: 'relative', marginTop: '6px' }}>
                                <select
                                    style={{ ...inputStyle, appearance: 'none', background: '#fff', marginTop: 0 }}
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <option value="">Select Role</option>
                                    {roles.map(role => (
                                        <option key={role._id} value={role._id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </select>
                                <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                            </div>
                        </div>

                        {/* Reporting To */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Reporting To (Manager)</label>
                            <div style={{ position: 'relative', marginTop: '6px' }}>
                                <select
                                    style={{ ...inputStyle, appearance: 'none', background: '#fff', marginTop: 0 }}
                                    value={formData.reportingTo}
                                    onChange={(e) => setFormData({ ...formData, reportingTo: e.target.value })}
                                >
                                    <option value="">No Manager</option>
                                    {users.filter(u => u.department === formData.department).map(user => (
                                        <option key={user._id} value={user._id}>
                                            {user.fullName}
                                        </option>
                                    ))}
                                </select>
                                <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                            </div>
                        </div>
                    </div>

                    {/* Data Scope */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Data Access Scope</label>
                        <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                            {dataScopeOptions.map(option => (
                                <div
                                    key={option.value}
                                    onClick={() => setFormData({ ...formData, dataScope: option.value })}
                                    style={{
                                        display: 'flex',
                                        gap: '12px',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: formData.dataScope === option.value ? '1px solid var(--primary-color)' : '1px solid #e2e8f0',
                                        background: formData.dataScope === option.value ? '#f0f7ff' : '#fff',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: formData.dataScope === option.value ? '6px solid var(--primary-color)' : '2px solid #cbd5e1',
                                        background: '#fff',
                                        flexShrink: 0,
                                        marginTop: '2px'
                                    }}></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{option.label}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{option.description}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Financial Permissions */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Financial & Approval Rights</label>
                            <div style={{
                                marginTop: '12px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '12px',
                                padding: '16px',
                                background: '#f8fafc',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                {Object.entries({
                                    canViewMargin: 'View Profit Margins',
                                    canEditCommission: 'Edit Commissions',
                                    canOverrideCommission: 'Override Commissions',
                                    canApproveDeal: 'Approve Deals',
                                    canApprovePayment: 'Approve Payments',
                                    canApprovePayout: 'Approve Payouts'
                                }).map(([key, label]) => (
                                    <label key={key} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        color: '#475569'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.financialPermissions[key]}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                financialPermissions: {
                                                    ...formData.financialPermissions,
                                                    [key]: e.target.checked
                                                }
                                            })}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
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
                        {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update User' : 'Add User')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddUserModal;
