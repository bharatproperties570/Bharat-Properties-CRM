import React, { useState, useEffect } from 'react';
import { users } from '../data/mockData';

const AssignContactModal = ({ isOpen, onClose, selectedContacts = [], onAssign, entityName = 'Contact' }) => {
    const isBulk = selectedContacts.length > 1;
    const [formData, setFormData] = useState({
        assignedTo: '',
        assignmentType: 'Primary Owner', // Primary Owner, Secondary Owner, Support
        strategy: 'assign_all', // assign_all, distribute_evenly
        reason: '',
        notes: '',
        notifyUser: true,
        sendEmail: false,
        sendWhatsApp: false,
        transferHistory: true // default to Transfer History
    });

    // Reset form when opened
    useEffect(() => {
        if (isOpen) {
            setFormData({
                assignedTo: '',
                assignmentType: 'Primary Owner',
                strategy: 'assign_all',
                reason: '',
                notes: '',
                notifyUser: true,
                sendEmail: false,
                sendWhatsApp: false,
                transferHistory: true
            });
        }
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleAssign = () => {
        if (!formData.assignedTo) return; // Validation

        // Mock processing
        const assignmentDetails = {
            ...formData,
            contacts: selectedContacts.map(c => c.id || c.name),
            timestamp: new Date().toISOString()
        };

        if (onAssign) onAssign(assignmentDetails);
        onClose();

        // Simple success feedback (could be a toast in real app)
        alert(isBulk
            ? `${selectedContacts.length} contacts assigned successfully!`
            : 'Contact assigned successfully!');
    };

    if (!isOpen) return null;

    // --- Styles ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px',
        width: '600px', maxWidth: '95vw', maxHeight: '90vh',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    };

    const headerStyle = {
        padding: '24px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    };

    const bodyStyle = {
        padding: '24px', overflowY: 'auto'
    };

    const footerStyle = {
        padding: '16px 24px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc',
        display: 'flex', justifyContent: 'flex-end', gap: '12px'
    };

    const labelStyle = {
        display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px'
    };

    const inputStyle = {
        width: '100%', padding: '10px', borderRadius: '8px',
        border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#1e293b',
        outline: 'none', backgroundColor: '#fff', transition: 'all 0.2s'
    };

    const pillOptionStyle = (isSelected) => ({
        padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s',
        border: isSelected ? '1px solid var(--primary-color)' : '1px solid #e2e8f0',
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : '#fff',
        color: isSelected ? 'var(--primary-color)' : '#64748b'
    });

    const toggleStyle = {
        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155'
    };

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <style>
                {`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                `}
            </style>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Assign {entityName}
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                            {isBulk ? `Assign ${selectedContacts.length} selected contacts in bulk` : 'Assign this contact to a team member'}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                        <i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i>
                    </button>
                </div>

                {/* Body */}
                <div style={bodyStyle}>

                    {/* Contact Preview */}
                    <div style={{ marginBottom: '24px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        {isBulk ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                    {selectedContacts.length}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{selectedContacts.length} Contacts Selected</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Bulk Action</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                    {selectedContacts[0]?.name?.charAt(0) || 'C'}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{selectedContacts[0]?.name || 'Unknown'}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{selectedContacts[0]?.mobile || 'No Mobile'}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 1. Assign To */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Assign To <span style={{ color: '#ef4444' }}>*</span></label>
                        <select
                            name="assignedTo"
                            value={formData.assignedTo}
                            onChange={handleChange}
                            style={inputStyle}
                        >
                            <option value="">Select Team Member</option>
                            {users && users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role}) - {user.availability}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 2. Assignment Type */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Assignment Type</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['Primary Owner', 'Secondary Owner', 'Support / Observer'].map(type => (
                                <div
                                    key={type}
                                    style={pillOptionStyle(formData.assignmentType === type)}
                                    onClick={() => setFormData(prev => ({ ...prev, assignmentType: type }))}
                                >
                                    {type}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. Strategy (Bulk Only) */}
                    {isBulk && (
                        <div style={{ marginBottom: '20px', padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                            <label style={labelStyle}>Assignment Strategy</label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input
                                        type="radio" name="strategy" value="assign_all"
                                        checked={formData.strategy === 'assign_all'} onChange={handleChange}
                                        style={{ accentColor: 'var(--primary-color)' }}
                                    />
                                    Assign all to selected user
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#94a3b8', cursor: 'not-allowed' }} title="Coming soon">
                                    <input
                                        type="radio" name="strategy" value="distribute_evenly"
                                        checked={formData.strategy === 'distribute_evenly'} onChange={handleChange}
                                        disabled
                                    />
                                    Distribute evenly
                                </label>
                            </div>
                        </div>
                    )}

                    {/* 4. Reason (Optional) */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Assignment Reason</label>
                        <select name="reason" value={formData.reason} onChange={handleChange} style={inputStyle}>
                            <option value="">Select Reason (Optional)</option>
                            <option value="New Lead">New Lead</option>
                            <option value="Follow-up Pending">Follow-up Pending</option>
                            <option value="Property Match">Property Match</option>
                            <option value="Area Expertise">Area Expertise</option>
                            <option value="Load Balancing">Load Balancing</option>
                        </select>
                    </div>

                    {/* Transfer History (New Option) */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Transfer History</label>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                <input
                                    type="radio"
                                    name="transferHistory"
                                    checked={formData.transferHistory === true}
                                    onChange={() => setFormData(prev => ({ ...prev, transferHistory: true }))}
                                    style={{ accentColor: 'var(--primary-color)' }}
                                />
                                With History
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                                <input
                                    type="radio"
                                    name="transferHistory"
                                    checked={formData.transferHistory === false}
                                    onChange={() => setFormData(prev => ({ ...prev, transferHistory: false }))}
                                    style={{ accentColor: 'var(--primary-color)' }}
                                />
                                Without History
                            </label>
                        </div>
                    </div>

                    {/* 5. Internal Notes */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Internal Notes</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows="3"
                            placeholder="Internal notes (visible only to team members)"
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>

                    {/* Notifications */}
                    <div>
                        <label style={labelStyle}>Notifications</label>
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            <label style={toggleStyle}>
                                <input type="checkbox" name="notifyUser" checked={formData.notifyUser} onChange={handleChange} style={{ accentColor: 'var(--primary-color)' }} />
                                Notify User
                            </label>
                            <label style={toggleStyle}>
                                <input type="checkbox" name="sendEmail" checked={formData.sendEmail} onChange={handleChange} style={{ accentColor: 'var(--primary-color)' }} />
                                Send Email Alert
                            </label>
                            <label style={toggleStyle}>
                                <input type="checkbox" name="sendWhatsApp" checked={formData.sendWhatsApp} onChange={handleChange} style={{ accentColor: 'var(--primary-color)' }} />
                                Send WhatsApp
                            </label>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div style={footerStyle}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                            background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={!formData.assignedTo}
                        style={{
                            padding: '10px 24px', borderRadius: '8px', border: 'none',
                            background: formData.assignedTo ? 'var(--primary-color)' : '#94a3b8',
                            color: '#fff', fontWeight: 600, cursor: formData.assignedTo ? 'pointer' : 'not-allowed',
                            fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: formData.assignedTo ? '0 4px 6px -1px rgba(59, 130, 246, 0.4)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className="fas fa-user-check"></i>
                        {isBulk ? `Assign ${selectedContacts.length} ${entityName}s` : `Assign ${entityName}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignContactModal;
