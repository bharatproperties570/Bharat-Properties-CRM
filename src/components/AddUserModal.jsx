import React, { useState, useEffect } from 'react';

const AddUserModal = ({ isOpen, onClose, onAdd, prefilledManager }) => {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        mobile: '',
        manager: 'Ramesh',
        team: '',
        role: 'Staff',
        accessType: 'limited' // full | limited
    });

    useEffect(() => {
        if (prefilledManager) {
            setFormData(prev => ({ ...prev, manager: prefilledManager }));
        }
    }, [prefilledManager]);

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
                width: '600px',
                maxHeight: '90vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Add user</h2>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {/* Full Name */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            type="text"
                            style={inputStyle}
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
                                placeholder="Enter email address"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        {/* Mobile */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Mobile <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                style={inputStyle}
                                placeholder="+91 00000 00000"
                                value={formData.mobile}
                                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Manager Select */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Manager <span style={{ color: '#ef4444' }}>*</span></label>
                            <div style={{ position: 'relative', marginTop: '6px' }}>
                                <select
                                    style={{ ...inputStyle, appearance: 'none', background: '#fff' }}
                                    value={formData.manager}
                                    onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                                >
                                    <option>Ramesh</option>
                                    <option>Suresh</option>
                                    <option>Ajitesh</option>
                                    <option>Real Deal</option>
                                </select>
                                <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                            </div>
                        </div>

                        {/* Team / Department */}
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Team / Department</label>
                            <div style={{ position: 'relative', marginTop: '6px' }}>
                                <select
                                    style={{ ...inputStyle, appearance: 'none', background: '#fff' }}
                                    value={formData.team}
                                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                                >
                                    <option value="">Select Team</option>
                                    <option>Sales Team Chandigrah</option>
                                    <option>Inventory Management</option>
                                    <option>Marketing</option>
                                    <option>Post Sales</option>
                                </select>
                                <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                            </div>
                        </div>
                    </div>

                    {/* Role Selection */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Role</label>
                        <div style={{ position: 'relative', marginTop: '6px' }}>
                            <select
                                style={{ ...inputStyle, appearance: 'none', background: '#fff' }}
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option>Staff</option>
                                <option>Manager (Sales)</option>
                                <option>Admin</option>
                            </select>
                            <i className="fas fa-chevron-down" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                        </div>
                    </div>

                    {/* Permissions Section */}
                    <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <input type="checkbox" checked={formData.accessType === 'full'} onChange={(e) => setFormData({ ...formData, accessType: e.target.checked ? 'full' : 'limited' })} style={{ width: '16px', height: '16px' }} />
                            <label style={{ ...labelStyle, fontSize: '0.95rem' }}>Full Administrative Access <span style={{ color: '#64748b', fontWeight: 400 }}>(ADMIN)</span></label>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>
                            Assigning full access allows the user to manage settings, other users, and all data records.
                        </p>

                        {/* Full Access */}
                        <div
                            onClick={() => setFormData({ ...formData, accessType: 'full' })}
                            style={{
                                display: 'flex',
                                gap: '12px',
                                padding: '16px',
                                borderRadius: '8px',
                                border: formData.accessType === 'full' ? '1px solid var(--primary-color)' : '1px solid #e2e8f0',
                                background: formData.accessType === 'full' ? '#f0f7ff' : '#fff',
                                cursor: 'pointer',
                                marginBottom: '12px'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                border: formData.accessType === 'full' ? '6px solid var(--primary-color)' : '2px solid #cbd5e1',
                                background: '#fff',
                                flexShrink: 0
                            }}></div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>Full access</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                                    View, update, delete, and convert any lead, contact, and deal in the account.
                                </div>
                            </div>
                        </div>

                        {/* Limited Access */}
                        <div
                            onClick={() => setFormData({ ...formData, accessType: 'limited' })}
                            style={{
                                display: 'flex',
                                gap: '12px',
                                padding: '16px',
                                borderRadius: '8px',
                                border: formData.accessType === 'limited' ? '1px solid var(--primary-color)' : '1px solid #e2e8f0',
                                background: formData.accessType === 'limited' ? '#f0f7ff' : '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                border: formData.accessType === 'limited' ? '6px solid var(--primary-color)' : '2px solid #cbd5e1',
                                background: '#fff',
                                flexShrink: 0
                            }}></div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>Limited access</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                                    View, update, delete, and convert their own leads, contacts, and deals.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                    <button
                        className="btn-outline"
                        onClick={onClose}
                        style={{ padding: '8px 24px', borderRadius: '6px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 600 }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => onAdd(formData)}
                        style={{ padding: '8px 24px', borderRadius: '6px', fontWeight: 700 }}
                    >
                        Add user
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddUserModal;
